"""Weekly scan v3 tests on a DISPOSABLE local PostgreSQL only (never Supabase / hosted DB).

The script creates its own throwaway cluster in /tmp/v3-pg (socket only, no TCP),
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
DATA, SOCK, PORT, DB = '/tmp/v3-pg/data', '/tmp/v3-pg', '55440', 'weekly_v3_fixture'
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
    shutil.rmtree('/tmp/v3-pg', ignore_errors=True)
    os.makedirs(SOCK)
    if _ROOT: shutil.chown(SOCK, 'lovable', 'lovable')
    pg(['initdb', '-D', DATA, '-A', 'trust', '-U', 'lovable'], check=True, capture_output=True)
    pg(['pg_ctl', '-D', DATA, '-l', '/tmp/v3-pg/log', '-w', 'start', '-o',
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
def rid(n): return f'30000000-0000-4000-8000-{n:012}'
def scan(u, c): return f"select nearby_scan_attempt_candidate('{uid(u)}','{cid(c)}')"
def act(r, a, u=None, amt=0):
    return f"select nearby_scan_admin_action('{rid(r)}','{uid(999)}','{a}',{f'{chr(39)}{uid(u)}{chr(39)}' if u else 'null'},{amt})"

def batch(qs, workers=40):
    with futures.ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda q: sql(q, False), qs))

def ok(rs): return sum(r.returncode == 0 and '"seen": false' in r.stdout for r in rs)

def st(u):
    return val(f"""select jsonb_build_object(
      'seen',(select count(*) from nearby_scan_seen where user_id='{uid(u)}'),
      'history',(select count(*) from nearby_scan_history where user_id='{uid(u)}'),
      'saved',(select count(*) from nearby_scan_saved_results where user_id='{uid(u)}'),
      'balance',(select coalesce(sum(gift_balance),0) from nearby_scan_accounts where user_id='{uid(u)}'),
      'granted',(select coalesce(sum(gifts_granted),0) from nearby_scan_accounts where user_id='{uid(u)}'),
      'new_total',(select coalesce(sum(new_total),0) from nearby_scan_accounts where user_id='{uid(u)}'),
      'base',(select coalesce(sum(base_used),0) from nearby_scan_weekly where user_id='{uid(u)}' and week_start=nearby_scan_week_start(now())),
      'today',(nearby_scan_today('{uid(u)}')->>'total')::int,
      'legacy_today',(select coalesce(sum(total),0) from nearby_scan_daily where user_id='{uid(u)}' and scan_date=nearby_scan_vn_date()),
      'weekly_today',(select coalesce(sum(weekly_total),0) from nearby_scan_mode_day where user_id='{uid(u)}' and scan_date=nearby_scan_vn_date()))""")

def opened(u): return val(f"select nearby_scan_open('{uid(u)}')")
def mode(): return val("select to_json(mode) from nearby_scan_deployment")
def rollback(): run_file(SB2 / 'ROLLBACK_PENDING_2026-11-01_SB2_weekly_scan_quota_v3.sql')
def reactivate(): run_file(SB2 / 'REACTIVATE_PENDING_2026-11-01_SB2_weekly_scan_quota_v3.sql')

PROTECTED = """select md5(coalesce((select string_agg(format('%s|%s|%s|%s|%s|%s',user_id,scan_date,total,hits,misses,updated_at),';' order by user_id,scan_date)
  from nearby_scan_daily where scan_date<nearby_scan_vn_date()),'')||'#'||coalesce((select string_agg(format('%s|%s|%s|%s',user_id,candidate_id,scanned_at,hit),';' order by user_id,candidate_id)
  from nearby_scan_seen where scanned_at<'{cut}'),''))"""

def test(name, fn):
    try:
        detail = fn()
        results.append({'test': name, 'result': 'PASS', 'detail': detail})
        print('PASS', name, detail or '')
    except Exception as e:  # report and continue: a failure is never shown as pass
        results.append({'test': name, 'result': 'FAIL', 'detail': str(e)[:600]})
        print('FAIL', name, str(e)[:600])

def main():
    now = dt.datetime.now(dt.timezone.utc)
    vn = now + dt.timedelta(hours=7)
    to_midnight = (dt.datetime(vn.year, vn.month, vn.day, tzinfo=dt.timezone.utc) + dt.timedelta(days=1) - vn).total_seconds()
    assert to_midnight > 600, 'Within 10 minutes of Vietnam midnight: rerun later so the day counter cannot flip mid-test.'
    start_cluster()
    sql("create role service_role; create role anon; create role authenticated;")
    for f in ['RUN_NOW_2026-10-31_SB2_nearby_scan.sql', 'RUN_NOW_2026-10-31_SB2_nearby_scan_history.sql',
              'RUN_NOW_2026-10-31_SB2_nearby_scan_results.sql']:
        run_file(SB2 / f)
    # ---- synthetic legacy fixtures (old daily mode) ----
    today = vn.date().isoformat()
    ws = val("select to_json(nearby_scan_week_start_fixture) from (select ((date_trunc('day',(now() at time zone 'Asia/Ho_Chi_Minh')-interval '12 hours')-make_interval(days=>extract(dow from (now() at time zone 'Asia/Ho_Chi_Minh')-interval '12 hours')::int)+interval '12 hours') at time zone 'Asia/Ho_Chi_Minh') nearby_scan_week_start_fixture) x")
    ws_t = dt.datetime.fromisoformat(ws)
    t_today = max(ws_t + dt.timedelta(minutes=1), now - dt.timedelta(minutes=30)).isoformat()
    assert (dt.datetime.fromisoformat(t_today) + dt.timedelta(hours=7)).date() == vn.date()
    sql(f"""
      -- user 1: 31/10 counted 12 (7 hit / 5 miss) but only 2 history rows => 10 attempts without history
      insert into nearby_scan_daily values('{uid(1)}','2026-10-31',12,7,5,'2026-10-31T15:00:00+07');
      insert into nearby_scan_seen values('{uid(1)}','{cid(1)}','2026-10-31T10:00:00+07',true),('{uid(1)}','{cid(2)}','2026-10-31T10:05:00+07',false);
      -- user 2: 31/10 five rows with hit NULL (before result column)
      insert into nearby_scan_daily values('{uid(2)}','2026-10-31',5,2,3,'2026-10-31T16:00:00+07');
      insert into nearby_scan_seen select '{uid(2)}',('20000000-0000-4000-8000-0000000002'||lpad(n::text,2,'0'))::uuid,'2026-10-31T11:00:00+07'::timestamptz+n*interval '1 minute',null from generate_series(0,4) n;
      -- user 3: 8 legacy scans today inside the current week, full history
      insert into nearby_scan_daily values('{uid(3)}','{today}',8,4,4,'{t_today}');
      insert into nearby_scan_seen select '{uid(3)}',('20000000-0000-4000-8000-0000000003'||lpad(n::text,2,'0'))::uuid,'{t_today}',n<4 from generate_series(0,7) n;
      -- user 4: 25 legacy scans today but only 20 history rows (conservative quota required)
      insert into nearby_scan_daily values('{uid(4)}','{today}',25,10,15,'{t_today}');
      insert into nearby_scan_seen select '{uid(4)}',('20000000-0000-4000-8000-0000000004'||lpad(n::text,2,'0'))::uuid,'{t_today}',n<8 from generate_series(0,19) n;
      update nearby_scan_settings set delay_seconds=0, hit_percent=50;""")
    old_daily_all = sql("select md5(string_agg(format('%s',d),';' order by user_id,scan_date)) from nearby_scan_daily d").stdout.strip()
    run_file(SB2 / 'PENDING_APPROVAL_2026-11-01_SB2_weekly_scan_quota_v3.sql')
    cut = val("select to_json(cutover_at) from nearby_scan_deployment")
    protected = sql(PROTECTED.format(cut=cut)).stdout.strip()

    def t_install():
        rec = val("select jsonb_object_agg(user_id||'@'||scan_date, jsonb_build_object('missing',missing_history,'null',seen_null)) from nearby_scan_reconciliation")
        assert rec[f'{uid(1)}@2026-10-31'] == {'missing': 10, 'null': 0}, rec
        assert rec[f'{uid(2)}@2026-10-31'] == {'missing': 0, 'null': 5}, rec
        assert rec[f'{uid(4)}@{today}']['missing'] == 5, rec
        assert st(1)['history'] == 2 and st(2)['history'] == 5, 'history must copy seen exactly, nothing invented'
        assert st(3)['base'] == 8 and opened(3)['remaining'] == 12
        assert st(4)['base'] == 20 and opened(4)['remaining'] == 0
        return {'reconciliation_rows': len(rec), 'user3_remaining': 12, 'user4_remaining': 0}
    test('Install v3 despite 10 missing-history attempts and 5 NULL rows; conservative current-week quota', t_install)

    def t_gift_over_30():
        sql(act(1, 'gift', 10, 25))
        rs = [sql(scan(10, 10000 + n), False) for n in range(46)]
        assert ok(rs) == 45, ok(rs)
        assert 'hết lượt quét tuần' in rs[-1].stderr
        s = st(10); assert s['weekly_today'] == 45 and s['legacy_today'] == 0 and s['balance'] == 0
        assert sql("select md5(string_agg(format('%s',d),';' order by user_id,scan_date)) from nearby_scan_daily d").stdout.strip() == old_daily_all
        return {'scans_today': 45, 'old_daily_counter_unchanged': True}
    test('Weekly mode: more than 30 scans in one day using Admin gifts', t_gift_over_30)

    def t_concurrent_weekly():
        rs = batch([scan(u, u * 1000 + n) for u in range(20, 24) for n in range(40)], 80)
        assert ok(rs) == 80, ok(rs)
        assert all('hết lượt' in r.stderr for r in rs if r.returncode)
        for u in range(20, 24):
            s = st(u); assert s['seen'] == s['history'] == s['new_total'] == s['weekly_today'] == 20, s
        rs = batch([scan(24, 24000)] * 24)
        assert all(r.returncode == 0 for r in rs) and ok(rs) == 1 and st(24)['new_total'] == 1
        return {'users': 4, 'submitted': 160, 'counted': 80, 'same_candidate_calls': 24, 'same_candidate_counted': 1}
    test('Concurrent scans: many users and many requests from the same user (weekly)', t_concurrent_weekly)

    def t_duplicates():
        rs = batch([act(50, 'gift', 30, 3)] * 24)
        assert all(r.returncode == 0 for r in rs)
        assert sum('"duplicate": false' in r.stdout for r in rs) == 1 and st(30)['granted'] == 3
        assert sql(act(50, 'gift', 30, 4), False).returncode != 0
        for n in range(5): sql(scan(30, 30000 + n))
        rs = batch([act(51, 'reset_one', 30)] * 24)
        assert sum('"duplicate": false' in r.stdout for r in rs) == 1 and st(30)['base'] == 0
        for n in range(3): sql(scan(30, 30100 + n))
        sql(act(51, 'reset_one', 30))  # late retry of the same click must NOT reset again
        assert st(30)['base'] == 3
        rs = batch([act(52, 'reset_all')] * 12)
        assert sum('"duplicate": false' in r.stdout for r in rs) == 1
        return {'gift_calls': 24, 'granted': 3, 'reset_calls': 24, 'applied': 1, 'late_retry_ignored': True}
    test('Repeated gift/reset clicks are applied exactly once', t_duplicates)

    def t_failure_rollback():
        sql("create function fx_fail() returns trigger language plpgsql as $$begin raise exception 'injected failure'; end$$;"
            "create trigger fx_fail before insert on nearby_scan_saved_results for each row execute function fx_fail();"
            "update nearby_scan_settings set hit_percent=100")
        sql(act(53, 'gift', 31, 2))
        before = st(31)
        r = sql(scan(31, 31000), False)
        assert r.returncode != 0 and 'injected failure' in r.stderr
        after = st(31); assert after == before, (before, after)
        sql("drop trigger fx_fail on nearby_scan_saved_results; drop function fx_fail(); update nearby_scan_settings set hit_percent=50")
        return {'state_identical_after_error': True}
    test('Error in the middle of a scan rolls back everything (weekly)', t_failure_rollback)

    def t_midweek_rollback():
        for n in range(12): sql(scan(11, 11000 + n))
        for n in range(5): sql(scan(3, 3100 + n))
        sql(act(54, 'gift', 11, 4))
        assert st(11)['today'] == 12 and st(3)['today'] == 13
        rollback(); assert mode() == 'daily'
        rs = batch([scan(11, 11100 + n) for n in range(40)] + [scan(3, 3200 + n) for n in range(40)] +
                   [scan(10, 10100 + n) for n in range(10)] + [scan(4, 4100 + n) for n in range(10)], 100)
        s11, s3, s10, s4 = st(11), st(3), st(10), st(4)
        assert s11['today'] == 30 and s11['legacy_today'] == 18, s11
        assert s3['today'] == 30 and s3['legacy_today'] == 25, s3
        assert s10['today'] == 45 and s10['legacy_today'] == 0, s10
        assert s4['today'] == 25 + 5, s4
        assert s11['balance'] == 4, 'gift balance frozen, not spent in daily mode'
        assert opened(11)['remaining'] == 0 and opened(11)['mode'] == 'daily'
        assert all('hết lượt' in r.stderr for r in rs if r.returncode), [r.stderr for r in rs if r.returncode][:3]
        assert sql(act(55, 'gift', 11, 1), False).returncode != 0
        return {'user11': '12 weekly + 18 daily = 30', 'user3': '8 old + 5 weekly + 17 daily = 30', 'user10': '45 weekly, 0 daily'}
    test('Mid-week rollback to old mode cannot exceed 30 per day (concurrent requests)', t_midweek_rollback)

    def t_failure_daily():
        sql("create function fx_fail() returns trigger language plpgsql as $$begin raise exception 'injected failure'; end$$;"
            "create trigger fx_fail before insert on nearby_scan_history for each row execute function fx_fail();")
        before = st(32); daily_before = sql(f"select count(*) from nearby_scan_daily where user_id='{uid(32)}'").stdout
        r = sql(scan(32, 32000), False)
        assert r.returncode != 0 and st(32) == before
        assert sql(f"select count(*) from nearby_scan_daily where user_id='{uid(32)}'").stdout == daily_before
        sql("drop trigger fx_fail on nearby_scan_history; drop function fx_fail()")
        return {'legacy_counter_rolled_back': True}
    test('Error in the middle of a scan rolls back everything (old daily mode)', t_failure_daily)

    def t_toggle():
        logs = val("select count(*) from nearby_scan_mode_log")
        rollback(); assert val("select count(*) from nearby_scan_mode_log") == logs  # idempotent
        reactivate(); reactivate(); assert mode() == 'weekly'
        assert val("select count(*) from nearby_scan_mode_log") == logs + 1
        assert st(11)['base'] == 20 and opened(11)['remaining'] == 4  # only the frozen 4 gifts, no fresh base
        u = 12
        for n in range(5): sql(scan(u, 12000 + n))
        rollback()
        for n in range(3): sql(scan(u, 12100 + n))
        reactivate()
        assert st(u)['base'] == 8 and opened(u)['remaining'] == 12
        rs = [sql(scan(u, 12200 + n), False) for n in range(20)]
        assert ok(rs) == 12
        rollback()
        rs = [sql(scan(u, 12300 + n), False) for n in range(20)]
        assert ok(rs) == 10 and st(u)['today'] == 30
        reactivate()
        rs = [sql(scan(u, 12400 + n), False) for n in range(5)]
        assert ok(rs) == 0, 'weekly base already 20 after toggles'
        s = st(u); assert s['seen'] == s['history'] == s['new_total'] == 30
        return {'sequence': 'W5 D3 W12 D10 W0', 'today_total': 30, 'week_base': 20, 'no_duplicated_quota': True}
    test('Switching back and forth many times never duplicates quota', t_toggle)

    def t_switch_race():
        sql(act(56, 'gift', 40, 30))
        for n in range(20): sql(scan(40, 40000 + n))  # 20 weekly today
        qs = [scan(40, 40100 + n) for n in range(30)]
        qs.insert(10, '__rollback__')
        def run(q):
            if q == '__rollback__':
                rollback(); return None
            return sql(q, False)
        with futures.ThreadPoolExecutor(max_workers=31) as pool:
            rs = [r for r in pool.map(run, qs) if r is not None]
        s = st(40)
        daily_part = s['legacy_today']
        assert daily_part <= max(0, 30 - s['weekly_today']), s
        assert s['today'] <= max(30, s['weekly_today'])
        reactivate()
        return {'weekly_today': s['weekly_today'], 'daily_after_switch': daily_part}
    test('Mode switch racing with concurrent scans stays within limits', t_switch_race)

    def t_protected():
        assert sql(PROTECTED.format(cut=cut)).stdout.strip() == protected, '31/10 or pre-cutover data changed'
        assert val("select count(*) from nearby_scan_seen where hit is null") == 5
        assert val("select count(*) from nearby_scan_history where hit is null") == 5
        assert val(f"select count(*) from nearby_scan_history where user_id='{uid(1)}'") == 2
        d = val(f"select row_to_json(d) from nearby_scan_daily d where user_id='{uid(1)}' and scan_date='2026-10-31'")
        assert (d['total'], d['hits'], d['misses']) == (12, 7, 5)
        sql(act(60, 'clear_history_all'))
        assert val("select count(*) from nearby_scan_seen where hit is null") == 5
        assert val(f"select count(*) from nearby_scan_seen where user_id='{uid(1)}'") == 2
        assert val(scan(1, 1).replace('select ', 'select to_json(') + ')') == {'seen': True}
        return {'oct31_hash_unchanged': True, 'null_rows': 5, 'no_fake_history': True, 'scanned_list_kept_after_clear': True}
    test('31/10 data and the 5 NULL rows unchanged; scanned-account list kept', t_protected)

    report = {'engine': val("select to_json(version())"), 'database': 'disposable local cluster /tmp/v3-pg (socket only)',
              'ran_at': now.isoformat(), 'results': results}
    Path('/tmp/weekly-scan-v3-results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
    pg(['pg_ctl', '-D', DATA, 'stop', '-m', 'fast'], capture_output=True)
    failed = [r for r in results if r['result'] != 'PASS']
    print(f"{len(results) - len(failed)}/{len(results)} PASSED")
    raise SystemExit(1 if failed else 0)

if __name__ == '__main__':
    main()
