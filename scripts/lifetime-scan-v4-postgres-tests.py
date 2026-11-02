"""Lifetime 20-scan (v4) tests on a DISPOSABLE local PostgreSQL only (never Supabase / hosted DB).

The script creates its own throwaway cluster in /tmp/v4-pg (socket only, no TCP),
loads the original RUN_NOW_2026-10-31 SB2 scan SQL, synthetic fixtures (31/10 data,
5 NULL-hit rows, 10 counted attempts without history), then installs v3 and runs
the scenarios with independent psql sessions. Run: python3 scripts/weekly-scan-v3-postgres-tests.py
"""
import concurrent.futures as futures
import datetime as dt
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SB2 = ROOT / 'supabase-sql/SB2'
DATA, SOCK, PORT, DB = '/tmp/v4-pg/data', '/tmp/v4-pg', '55441', 'lifetime_v4_fixture'
assert not os.environ.get('PGHOST'), 'Refusing to run with PGHOST set (could target a real database).'
PSQL = ['psql', '-X', '-h', SOCK, '-p', PORT, '-U', 'lovable', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-At']
results = []

AS = []
_ROOT = os.geteuid() == 0

def _drop():
    import pwd
    pw = pwd.getpwnam('lovable'); os.setgid(pw.pw_gid); os.setuid(pw.pw_uid)

def pg(cmd, **kw):
    # PostgreSQL refuses to run as root: drop to the unprivileged sandbox user.
    return subprocess.run(cmd, preexec_fn=_drop if _ROOT else None, env={**os.environ, 'HOME': '/tmp'}, **kw)

def start_cluster():
    pg(['pg_ctl', '-D', DATA, 'stop', '-m', 'immediate'], capture_output=True)
    shutil.rmtree('/tmp/v4-pg', ignore_errors=True)
    os.makedirs(SOCK)
    if _ROOT: shutil.chown(SOCK, 'lovable', 'lovable')
    pg(['initdb', '-D', DATA, '-A', 'trust', '-U', 'lovable'], check=True, capture_output=True)
    pg(['pg_ctl', '-D', DATA, '-l', '/tmp/v4-pg/log', '-w', 'start', '-o',
                    f"-k {SOCK} -p {PORT} -c listen_addresses='' -c max_connections=200"], check=True, capture_output=True)
    subprocess.run(['createdb', '-h', SOCK, '-p', PORT, '-U', 'lovable', DB], check=True)

def sql(q, fail=True):
    r = subprocess.run(PSQL + ['-c', q], text=True, capture_output=True, timeout=120)
    if fail and r.returncode:
        raise AssertionError(r.stderr)
    return r

def run_file(p):
    r = subprocess.run(PSQL + ['-f', str(p)], text=True, capture_output=True, timeout=120)
    if r.returncode:
        raise AssertionError(f'{p.name}: {r.stderr}')

def val(q):
    return json.loads(sql(q).stdout.strip().splitlines()[-1])


def uid(n): return f'10000000-0000-4000-8000-{n:012}'
def cid(n): return f'20000000-0000-4000-8000-{n:012}'
def scan(u, c): return f"select nearby_scan_attempt_candidate('{uid(u)}','{cid(c)}')"
V4 = SB2 / 'PENDING_APPROVAL_2026-11-01_SB2_lifetime_scan_limit_v4.sql'

def batch(qs, workers=60):
    with futures.ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda q: sql(q, False), qs))
def ok(rs): return sum(r.returncode == 0 and '"seen": false' in r.stdout for r in rs)
def quota(u): return val(f"select nearby_scan_quota('{uid(u)}')")
def seen(u): return val(f"select count(*) from nearby_scan_seen where user_id='{uid(u)}'")
def lifetime_rows(): return val("select count(*) from nearby_scan_lifetime")
def exhausted(rs): return all('hết 20 lượt' in r.stderr for r in rs if r.returncode)

PROTECTED = """select md5(coalesce((select string_agg(format('%s',d),';' order by user_id,scan_date) from nearby_scan_daily d),'')
  ||'#'||coalesce((select string_agg(format('%s|%s|%s|%s',user_id,candidate_id,scanned_at,hit),';' order by user_id,candidate_id)
  from nearby_scan_seen where scanned_at<'{cut}'),''))"""

def test(name, fn):
    try:
        d = fn(); results.append({'test': name, 'result': 'PASS', 'detail': d}); print('PASS', name, d or '')
    except Exception as e:
        results.append({'test': name, 'result': 'FAIL', 'detail': str(e)[:600]}); print('FAIL', name, str(e)[:600])

def main():
    start_cluster()
    sql("create role service_role; create role anon; create role authenticated;")
    for f in ['RUN_NOW_2026-10-31_SB2_nearby_scan.sql', 'RUN_NOW_2026-10-31_SB2_nearby_scan_history.sql',
              'RUN_NOW_2026-10-31_SB2_nearby_scan_results.sql']:
        run_file(SB2 / f)
    sql(f"""
      insert into nearby_scan_daily values('{uid(1)}','2026-10-31',12,7,5,'2026-10-31T15:00:00+07');
      insert into nearby_scan_seen values('{uid(1)}','{cid(1)}','2026-10-31T10:00:00+07',true),('{uid(1)}','{cid(2)}','2026-10-31T10:05:00+07',false);
      insert into nearby_scan_daily values('{uid(2)}','2026-10-31',5,2,3,'2026-10-31T16:00:00+07');
      insert into nearby_scan_seen select '{uid(2)}',('20000000-0000-4000-8000-0000000002'||lpad(n::text,2,'0'))::uuid,'2026-10-31T11:00:00+07'::timestamptz+n*interval '1 minute',null from generate_series(0,4) n;
      insert into nearby_scan_daily values('{uid(3)}','2026-10-30',30,10,20,'2026-10-30T15:00:00+07'),('{uid(3)}','2026-10-31',4,1,3,'2026-10-31T15:00:00+07');
      update nearby_scan_settings set delay_seconds=0, hit_percent=50;""")
    run_file(V4)
    cut = val("select to_json(cutover_at) from nearby_scan_v4_deployment")
    protected = sql(PROTECTED.format(cut=cut)).stdout.strip()

    def t_install():
        q1, q2, q3, q9 = quota(1), quota(2), quota(3), quota(9)
        assert (q1['used'], q1['remaining']) == (12, 8), q1   # 12 counted, incl. 10 without history
        assert (q2['used'], q2['remaining']) == (5, 15), q2
        assert q3['remaining'] == 0 and q3['locked'] is True, q3  # 34 old scans => locked forever
        assert q9['remaining'] == 20
        return {'user_10_missing_history': q1, 'user_5_null': q2, 'user_34_old': q3['remaining'], 'new_user': 20}
    test('Old scans count toward the 20 (incl. 10 without history); new user gets 20', t_install)

    def t_twenty():
        rs = [sql(scan(10, 10000 + n), False) for n in range(25)]
        assert ok(rs) == 20 and exhausted(rs), [r.stderr for r in rs if r.returncode][:2]
        q = quota(10); assert q['used'] == 20 and q['remaining'] == 0 and q['locked'] and seen(10) == 20
        return {'attempts': 25, 'counted': 20}
    test('Exactly 20 scans for the account lifetime, then locked', t_twenty)

    def t_concurrent():
        rs = batch([scan(u, u * 1000 + n) for u in range(20, 25) for n in range(40)], 100)
        assert ok(rs) == 100 and exhausted(rs), ok(rs)
        for u in range(20, 25): assert seen(u) == 20 and quota(u)['remaining'] == 0
        rs = batch([scan(30, 30000 + n % 30) for n in range(90)], 90)   # same user, repeated candidates
        assert ok(rs) == 20 and seen(30) == 20 and exhausted(rs)
        rs = batch([scan(1, 1000 + n) for n in range(40)])
        assert ok(rs) == 8 and quota(1)['remaining'] == 0
        rs = batch([scan(31, 31000)] * 30)
        assert ok(rs) == 1 and quota(31)['used'] == 1
        return {'5_users_x_40': 'each 20', 'same_user_90_parallel': 20, 'user_with_12_old_40_parallel': 8, 'same_candidate_30x': 1}
    test('Concurrent requests: many users and many from the same user never exceed 20', t_concurrent)

    def t_no_regrant():
        before = quota(10)
        assert sql("select to_regprocedure('nearby_scan_admin_action(uuid,uuid,text,uuid,integer)')").stdout.strip() == ''
        r = sql(f"select nearby_scan_attempt('{uid(10)}')", False); assert r.returncode and 'đã ngừng' in r.stderr
        n = lifetime_rows(); quota(77); val(f"select nearby_scan_open('{uid(78)}')"); assert lifetime_rows() == n, 'open/quota must be read-only'
        for q in [f"update nearby_scan_lifetime set new_used=0,new_hits=0,new_misses=0 where user_id='{uid(10)}'",
                  f"update nearby_scan_lifetime set prior_used=0 where user_id='{uid(1)}'",
                  f"delete from nearby_scan_lifetime where user_id='{uid(10)}'",
                  f"update nearby_scan_lifetime set new_used=new_used+1,new_hits=new_hits+1 where user_id='{uid(10)}'"]:
            assert sql(q, False).returncode != 0, q
        sql(f"delete from nearby_scan_seen where user_id='{uid(10)}'")  # 'clear history' of a synthetic user
        after = quota(10); before.pop('server_now'); after.pop('server_now'); assert after == before, (before, after)
        assert ok([sql(scan(10, 10000), False)]) == 0
        return {'admin_action': 'absent', 'old_attempt_rpc': 'rejected', 'reset_update_delete': 'rejected', 'after_history_cleared': 'still 0'}
    test('No Admin/RPC/table path can grant, reset or restore scans (incl. after clearing history)', t_no_regrant)

    def t_failure():
        sql("create function fx_fail() returns trigger language plpgsql as $$begin raise exception 'injected failure'; end$$;"
            "create trigger fx_fail after insert on nearby_scan_seen for each row execute function fx_fail();")
        b = quota(40); r = sql(scan(40, 40000), False)
        assert r.returncode and 'injected failure' in r.stderr and seen(40) == 0
        a = quota(40); assert a['used'] == b['used'] == 0
        sql("drop trigger fx_fail on nearby_scan_seen; drop function fx_fail()")
        return {'rolled_back': True}
    test('Error in the middle of a scan rolls back everything', t_failure)

    def t_pause():
        run_file(SB2 / 'ROLLBACK_PENDING_2026-11-01_SB2_lifetime_scan_limit_v4.sql')
        run_file(SB2 / 'ROLLBACK_PENDING_2026-11-01_SB2_lifetime_scan_limit_v4.sql')
        b = quota(41); r = sql(scan(41, 41000), False); assert r.returncode and 'tạm dừng' in r.stderr
        run_file(SB2 / 'RESUME_PENDING_2026-11-01_SB2_lifetime_scan_limit_v4.sql')
        run_file(SB2 / 'RESUME_PENDING_2026-11-01_SB2_lifetime_scan_limit_v4.sql')
        assert quota(41)['remaining'] == b['remaining'] == 20 and quota(10)['remaining'] == 0
        return {'pause_resume_idempotent': True, 'no_quota_restored': True}
    test('Emergency pause/resume never grants or restores scans', t_pause)

    def t_reinstall():
        r = subprocess.run(PSQL + ['-f', str(V4)], text=True, capture_output=True); assert r.returncode and 'v4' in r.stderr
        sql("create database v3_present")
        P2 = [x if x != DB else 'v3_present' for x in PSQL]
        subprocess.run(P2 + ['-c', 'create role x;'], capture_output=True)
        for f in ['RUN_NOW_2026-10-31_SB2_nearby_scan.sql', 'RUN_NOW_2026-10-31_SB2_nearby_scan_history.sql', 'RUN_NOW_2026-10-31_SB2_nearby_scan_results.sql']:
            assert subprocess.run(P2 + ['-f', str(SB2 / f)], capture_output=True).returncode == 0
        subprocess.run(P2 + ['-c', 'create table nearby_scan_weekly(x int)'], check=True, capture_output=True)
        r = subprocess.run(P2 + ['-f', str(V4)], text=True, capture_output=True); assert r.returncode and 'v2/v3' in r.stderr
        assert subprocess.run(P2 + ['-At', '-c', "select to_regclass('nearby_scan_lifetime')"], text=True, capture_output=True).stdout.strip() == ''
        return {'reapply_refused': True, 'refused_over_weekly_v2_v3': True}
    test('Install refuses to run twice or over weekly v2/v3 structures', t_reinstall)

    def t_protected():
        assert sql(PROTECTED.format(cut=cut)).stdout.strip() == protected
        assert val("select count(*) from nearby_scan_seen where hit is null") == 5
        assert val(f"select count(*) from nearby_scan_seen where user_id='{uid(1)}' and scanned_at<'{cut}'") == 2
        assert val("select count(*) from nearby_scan_daily where scan_date>'2026-10-31'") == 0, 'old daily counter no longer written'
        return {'oct31_and_old_rows_hash_unchanged': True, 'null_rows': 5, 'no_fake_history': True}
    test('31/10 data, 5 NULL rows and old scanned list unchanged; no fake history', t_protected)

    Path('/tmp/lifetime-scan-v4-results.json').write_text(json.dumps({'engine': val("select to_json(version())"),
        'database': 'disposable local cluster /tmp/v4-pg (socket only)', 'results': results}, indent=2, ensure_ascii=False))
    pg(['pg_ctl', '-D', DATA, 'stop', '-m', 'fast'], capture_output=True)
    failed = [r for r in results if r['result'] != 'PASS']
    print(f"{len(results) - len(failed)}/{len(results)} PASSED"); raise SystemExit(1 if failed else 0)

if __name__ == '__main__':
    main()
