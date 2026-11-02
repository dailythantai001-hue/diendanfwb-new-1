"""Gift 20-scan (v5) tests on a DISPOSABLE local PostgreSQL only (never Supabase / hosted DB).

The script creates its own throwaway cluster in /tmp/v5-pg (socket only, no TCP),
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
DATA, SOCK, PORT, DB = '/tmp/v5-pg/data', '/tmp/v5-pg', '55451', 'gift_v5_fixture'
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
    return subprocess.run(cmd, preexec_fn=_drop if _ROOT else None, env={**os.environ, 'HOME': '/tmp', 'LANG': 'C', 'LC_ALL': 'C'}, **kw)

def start_cluster():
    pg(['pg_ctl', '-D', DATA, 'stop', '-m', 'immediate'], capture_output=True)
    shutil.rmtree('/tmp/v5-pg', ignore_errors=True)
    os.makedirs(SOCK)
    if _ROOT: shutil.chown(SOCK, 'lovable', 'lovable')
    pg(['initdb', '-D', DATA, '-A', 'trust', '-U', 'lovable'], check=True, capture_output=True)
    pg(['pg_ctl', '-D', DATA, '-l', '/tmp/v5-pg/log', '-w', 'start', '-o',
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
V5 = SB2 / 'FINAL_PENDING_APPROVAL_2026-11-01_SB2_scan_gift_20_v5.sql'

def batch(qs, workers=60):
    with futures.ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda q: sql(q, False), qs))
def ok(rs): return sum(r.returncode == 0 and '"seen": false' in r.stdout for r in rs)
def quota(u): return val(f"select nearby_scan_quota('{uid(u)}')")
def seen(u): return val(f"select count(*) from nearby_scan_seen where user_id='{uid(u)}'")
def gift_rows(): return val("select count(*) from nearby_scan_gift")
def claim(u): return val(f"select nearby_scan_claim_gift('{uid(u)}')")
def exhausted(rs): return all('hết 20 lượt quét tìm bạn' in r.stderr for r in rs if r.returncode)

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
      insert into nearby_scan_daily values('{uid(3)}','2026-10-30',30,10,20,'2026-10-30T15:00:00+07');
      insert into nearby_scan_seen select '{uid(2)}',('20000000-0000-4000-8000-0000000002'||lpad(n::text,2,'0'))::uuid,'2026-10-31T11:00:00+07'::timestamptz+n*interval '1 minute',null from generate_series(0,4) n;
      update nearby_scan_settings set delay_seconds=0, hit_percent=50;""")
    run_file(V5)
    cut = val("select to_json(cutover_at) from nearby_scan_v5_deployment")
    protected = sql(PROTECTED.format(cut=cut)).stdout.strip()

    def t_unclaimed():
        q = quota(9); assert q['claimed'] is False and q['remaining'] == 0 and gift_rows() == 0
        r = sql(scan(9, 9000), False); assert r.returncode and 'chưa nhận' in r.stderr and seen(9) == 0
        return {'before_claim': 'no scan possible', 'install_creates_no_gift': True}
    test('Before claiming, nobody can scan; install grants nothing silently', t_unclaimed)

    def t_once():
        a = claim(1); assert a['granted_now'] is True and a['remaining'] == 20, a  # 12 old scans NOT deducted
        b = claim(1); assert b['granted_now'] is False and b['remaining'] == 20
        q3 = claim(3); assert q3['remaining'] == 20  # 30 old scans: still a fresh 20
        return {'old_12_user': 20, 'old_30_user': 20, 'second_claim': 'granted_now=false'}
    test('Gift granted exactly once; old scans do not count against the new 20', t_once)

    def t_claim_concurrent():
        rs = batch([f"select nearby_scan_claim_gift('{uid(50)}')"] * 60)
        granted = sum('"granted_now": true' in r.stdout for r in rs)
        assert granted == 1 and all(r.returncode == 0 for r in rs) and quota(50)['remaining'] == 20
        return {'parallel_claims': 60, 'granted_now_true': granted}
    test('60 simultaneous claims (reload / other devices) -> granted_now true only once', t_claim_concurrent)

    def t_old_history_not_charged():
        r = val(scan(1, 1)); assert r == {'seen': True}  # scanned on 31/10 -> no charge
        assert quota(1)['used'] == 0
        return {'old_candidate': 'skipped, free'}
    test('Accounts scanned before v5 never come back and cost nothing', t_old_history_not_charged)

    def t_twenty():
        claim(10)
        rs = [sql(scan(10, 10000 + n), False) for n in range(25)]
        assert ok(rs) == 20 and exhausted(rs), [r.stderr for r in rs if r.returncode][:2]
        q = quota(10); assert q['used'] == 20 and q['remaining'] == 0 and q['locked'] and seen(10) == 20
        assert claim(10)['granted_now'] is False and quota(10)['remaining'] == 0
        return {'attempts': 25, 'counted': 20, 'reclaim_after_exhaust': 'refused'}
    test('Exactly 20 scans, then locked with the agreed message; re-claim gives nothing', t_twenty)

    def t_concurrent():
        for u in range(20, 25): claim(u)
        rs = batch([scan(u, u * 1000 + n) for u in range(20, 25) for n in range(40)], 100)
        assert ok(rs) == 100 and exhausted(rs), ok(rs)
        for u in range(20, 25): assert seen(u) == 20 and quota(u)['remaining'] == 0
        claim(30)
        rs = batch([scan(30, 30000 + n % 30) for n in range(90)], 90)
        assert ok(rs) == 20 and seen(30) == 20 and exhausted(rs)
        claim(31); rs = batch([scan(31, 31000)] * 30)
        assert ok(rs) == 1 and quota(31)['used'] == 1
        assert val("select count(*) from nearby_scan_gift where used>20 or used<0") == 0
        return {'5_users_x_40': 'each 20', 'same_user_90_parallel': 20, 'same_candidate_30x': 1}
    test('Concurrent scans never go negative or above 20', t_concurrent)

    def t_no_regrant():
        before = quota(10)
        assert sql("select to_regprocedure('nearby_scan_admin_action(uuid,uuid,text,uuid,integer)')").stdout.strip() == ''
        r = sql(f"select nearby_scan_attempt('{uid(10)}')", False); assert r.returncode and 'đã ngừng' in r.stderr
        n = gift_rows(); quota(77); val(f"select nearby_scan_open('{uid(78)}')"); assert gift_rows() == n, 'open/quota must be read-only'
        for q in [f"update nearby_scan_gift set used=0,hits=0,misses=0 where user_id='{uid(10)}'",
                  f"delete from nearby_scan_gift where user_id='{uid(10)}'",
                  f"update nearby_scan_gift set granted_at=now() where user_id='{uid(1)}'",
                  f"insert into nearby_scan_gift(user_id,used,hits) values('{uid(88)}',0,0) on conflict do nothing; update nearby_scan_gift set used=21,hits=21 where user_id='{uid(88)}'"]:
            assert sql(q, False).returncode != 0, q
        sql(f"delete from nearby_scan_seen where user_id='{uid(10)}'")
        after = quota(10); before.pop('server_now'); after.pop('server_now'); assert after == before
        assert ok([sql(scan(10, 10000), False)]) == 0
        return {'admin_action': 'absent', 'reset_update_delete': 'rejected', 'after_history_cleared': 'still 0'}
    test('No Admin/RPC/table path can grant, reset or restore scans', t_no_regrant)

    def t_failure():
        claim(40)
        sql("create function fx_fail() returns trigger language plpgsql as $$begin raise exception 'injected failure'; end$$;"
            "create trigger fx_fail after insert on nearby_scan_seen for each row execute function fx_fail();")
        r = sql(scan(40, 40000), False)
        assert r.returncode and 'injected failure' in r.stderr and seen(40) == 0 and quota(40)['used'] == 0
        sql("drop trigger fx_fail on nearby_scan_seen; drop function fx_fail()")
        return {'rolled_back': True}
    test('Error mid-scan rolls back everything', t_failure)

    def t_pause():
        R = SB2 / 'ROLLBACK_PENDING_2026-11-01_SB2_scan_gift_20_v5.sql'; S = SB2 / 'RESUME_PENDING_2026-11-01_SB2_scan_gift_20_v5.sql'
        run_file(R); run_file(R)
        r = sql(scan(40, 40001), False); assert r.returncode and 'tạm dừng' in r.stderr
        r = sql(f"select nearby_scan_claim_gift('{uid(60)}')", False); assert r.returncode and 'tạm dừng' in r.stderr
        run_file(S); run_file(S)
        assert quota(40)['remaining'] == 20 and quota(10)['remaining'] == 0 and quota(60)['claimed'] is False
        return {'pause_resume_idempotent': True}
    test('Emergency pause/resume never grants or restores scans', t_pause)

    def t_reinstall():
        r = subprocess.run(PSQL + ['-f', str(V5)], text=True, capture_output=True); assert r.returncode and 'v5' in r.stderr
        sql("create database v4_present")
        P2 = [x if x != DB else 'v4_present' for x in PSQL]
        for f in ['RUN_NOW_2026-10-31_SB2_nearby_scan.sql', 'RUN_NOW_2026-10-31_SB2_nearby_scan_history.sql', 'RUN_NOW_2026-10-31_SB2_nearby_scan_results.sql']:
            assert subprocess.run(P2 + ['-f', str(SB2 / f)], capture_output=True).returncode == 0
        subprocess.run(P2 + ['-c', 'create table nearby_scan_lifetime(x int)'], check=True, capture_output=True)
        r = subprocess.run(P2 + ['-f', str(V5)], text=True, capture_output=True); assert r.returncode and 'v4' in r.stderr
        return {'reapply_refused': True, 'refused_over_v4': True}
    test('Install refuses to run twice or over v4/v2/v3', t_reinstall)

    def t_protected():
        assert sql(PROTECTED.format(cut=cut)).stdout.strip() == protected
        assert val("select count(*) from nearby_scan_seen where hit is null") == 5
        assert val("select count(*) from nearby_scan_daily where scan_date>'2026-10-31'") == 0
        return {'old_rows_hash_unchanged': True, 'null_rows': 5}
    test('Old history and daily data unchanged', t_protected)

    Path('docs/GIFT-SCAN-V5-TEST-RESULTS.json').write_text(json.dumps({'engine': val("select to_json(version())"),
        'database': 'disposable local cluster /tmp/v5-pg (socket only)', 'results': results}, indent=2, ensure_ascii=False))
    pg(['pg_ctl', '-D', DATA, 'stop', '-m', 'fast'], capture_output=True)
    failed = [r for r in results if r['result'] != 'PASS']
    print(f"{len(results) - len(failed)}/{len(results)} PASSED"); raise SystemExit(1 if failed else 0)

if __name__ == '__main__':
    main()
