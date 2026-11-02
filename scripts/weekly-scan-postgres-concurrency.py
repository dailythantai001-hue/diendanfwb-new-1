"""Real independent PostgreSQL sessions; isolated socket ONLY, no credentials/Supabase.
Start a disposable PostgreSQL 17 at /tmp/weekly-pg-socket port 55439 first.
Run: python3 scripts/weekly-scan-postgres-concurrency.py
Fixtures are synthetic. Never point this runner at a hosted database.
"""
import concurrent.futures as futures
import json
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PSQL = ['psql', '-X', '-h', '/tmp/weekly-pg-socket', '-p', '55439', '-U', 'lovable',
        '-d', 'weekly_concurrency_fixture', '-v', 'ON_ERROR_STOP=1', '-At']
checks = []

def sql(query, fail=True):
    r = subprocess.run(PSQL + ['-c', query], text=True, capture_output=True, timeout=45)
    if fail and r.returncode:
        raise AssertionError(r.stderr)
    return r

def value(query):
    return json.loads(sql(query).stdout.strip())

def uid(n):
    return f'10000000-0000-4000-8000-{n:012}'

def cid(n):
    return f'20000000-0000-4000-8000-{n:012}'

def rid(n):
    return f'30000000-0000-4000-8000-{n:012}'

def scan(u, c):
    return f"nearby_scan_attempt_candidate('{uid(u)}','{cid(c)}')"

def action(r, kind, u=None, amount=0):
    target = f"'{uid(u)}'" if u is not None else 'null'
    return f"nearby_scan_admin_action('{rid(r)}','{uid(999)}','{kind}',{target},{amount})"

def opened(u):
    return value(f"select nearby_scan_open('{uid(u)}')")

def batch(calls):
    # One psql process / libpq connection / autocommit transaction per operation.
    with futures.ThreadPoolExecutor(max_workers=32) as pool:
        return list(pool.map(lambda c: sql(f'select {c}', fail=False), calls))

def counts(u):
    return value(f"""select jsonb_build_object('seen', (select count(*) from nearby_scan_seen where user_id='{uid(u)}'),
      'saved',(select count(*) from nearby_scan_saved_results where user_id='{uid(u)}'),
      'history',(select count(*) from nearby_scan_history where user_id='{uid(u)}'),
      'total',new_total,'granted',gifts_granted,'spent',gifts_spent,'balance',gift_balance)
      from nearby_scan_accounts where user_id='{uid(u)}'""")

def check(name, evidence):
    checks.append({'test': name, 'passed': True, 'evidence': evidence})
    print('PASS', name, json.dumps(evidence))

def main():
    # Fixed local socket; intentionally no env-configurable remote target.
    admin = PSQL.copy()
    admin[admin.index('weekly_concurrency_fixture')] = 'postgres'
    subprocess.run(admin + ['-c', 'drop database if exists weekly_concurrency_fixture'], check=True, capture_output=True)
    subprocess.run(admin + ['-c', 'create database weekly_concurrency_fixture'], check=True, capture_output=True)
    sql("do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; create role anon; create role authenticated; end if; end $$;")
    for name in ['nearby_scan', 'nearby_scan_history', 'nearby_scan_results']:
        sql((ROOT / f'supabase-sql/SB2/RUN_NOW_2026-10-31_SB2_{name}.sql').read_text())
    sql('update nearby_scan_settings set delay_seconds=0,hit_percent=100')
    sql((ROOT / 'supabase-sql/SB2/PENDING_APPROVAL_2026-11-01_SB2_weekly_scan_quota.sql').read_text())

    # Demonstrate genuine simultaneously active distinct backends, not a queued embedded engine.
    with futures.ThreadPoolExecutor(max_workers=12) as pool:
        jobs = [pool.submit(sql, f"begin; set local application_name='weekly-independent-proof'; select pg_backend_pid(); select pg_advisory_xact_lock_shared(7240211202601); select pg_sleep(2); commit;") for _ in range(12)]
        peak = 0
        for _ in range(30):
            n = value("select count(distinct pid) from pg_stat_activity where application_name='weekly-independent-proof' and state='active'")
            peak = max(peak, n)
            if peak == 12:
                break
            time.sleep(.05)
        for job in jobs:
            job.result()
    assert peak == 12, peak
    check('12 genuinely concurrent independent PostgreSQL sessions', {'simultaneously_active_pids': peak})

    results = batch([scan(u, u*1000+n) for u in range(1,5) for n in range(40)])
    assert sum(r.returncode == 0 for r in results) == 80
    assert all('hết lượt' in r.stderr for r in results if r.returncode)
    for u in range(1,5):
        assert opened(u)['remaining'] == 0
        assert counts(u)['total'] == counts(u)['seen'] == counts(u)['saved'] == 20
    check('four users cannot exceed 20 each', {'submitted':160,'successful':80,'quota_rejections':80})

    results = batch([scan(5,5000)]*24)
    assert all(r.returncode == 0 for r in results)
    assert sum(json.loads(r.stdout)['seen'] is False for r in results) == 1
    assert counts(5)['total'] == 1
    check('same candidate concurrent calls counted once', {'calls':24,'counted':1})

    results = batch([action(1,'gift',6,2)]*24)
    assert all(r.returncode == 0 for r in results)
    assert sum(json.loads(r.stdout)['duplicate'] is False for r in results) == 1
    assert counts(6)['granted'] == 2
    assert sql('select '+action(1,'gift',6,1),False).returncode != 0
    check('gift retry credits once; changed payload denied', {'calls':24,'granted':2})

    results = batch([action(100+n,'gift',7,1) for n in range(10)] + [scan(7,7000+n) for n in range(40)])
    assert all('hết lượt' in r.stderr for r in results if r.returncode)
    # Scans preceding gifts can legitimately fail: use fresh candidates to exhaust final balance.
    batch([scan(7,7100+n) for n in range(40)])
    c = counts(7)
    assert c['total'] == c['seen'] == c['saved'] == 30
    assert c['granted'] == c['spent'] == 10 and c['balance'] == 0
    assert opened(7)['remaining'] == 0
    check('simultaneous distinct gifts and scans conserve quota', c)

    # Serialized operation ledger written in the SAME transaction under the SAME user lock.
    sql('create table fixture_ledger(seq bigint generated always as identity, user_id uuid, kind text, result jsonb)')
    def ledger(u, kind, expression):
        return f"begin; select nearby_scan_lock_user('{uid(u)}'); insert into fixture_ledger(user_id,kind,result) values('{uid(u)}','{kind}',{expression}); commit;"
    sql('select '+action(300,'gift',8,7))
    for n in range(22):
        sql('select '+scan(8,8000+n))
    ops = [ledger(8,'scan',scan(8,8100+n)) for n in range(30)]
    ops += [ledger(8,'reset',action(301+n,'reset_one',8)) for n in range(2)]
    ops += [ledger(8,'gift',action(310+n,'gift',8,2)) for n in range(5)]
    with futures.ThreadPoolExecutor(max_workers=32) as pool:
        results = list(pool.map(lambda q: sql(q,False), ops))
    assert all('hết lượt' in r.stderr for r in results if r.returncode)
    rows = value("select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'result',result) order by seq),'[]') from fixture_ledger")
    base, balance, total, reset_count, gifts = 20, 5, 22, 0, 7
    for row in rows:
        if row['kind'] == 'reset':
            base = 0
            reset_count += 1
        elif row['kind'] == 'gift':
            balance += 2
            gifts += 2
        else:
            assert 20-base+balance > 0
            if base < 20:
                base += 1
            else:
                balance -= 1
            total += 1
        assert row['result']['remaining'] == 20-base+balance, row
        assert row['result']['gift_balance'] == balance, row
    c = counts(8)
    assert reset_count == 2 and gifts == 17
    assert c['total'] == c['seen'] == c['saved'] == total
    assert c['granted'] == 17 and c['balance'] == balance
    assert c['granted']-c['spent'] == c['balance']
    check('concurrent reset/gift/scan matches transaction-order ledger', {**c,'resets':reset_count,'ledger_entries':len(rows)})

    # Exclusive global reset/clear races with shared user scans/gifts, no deadlocks or hit loss.
    results = batch([action(400,'reset_all'),action(401,'clear_history_all')] +
                    [action(410+n,'gift',9+n,2) for n in range(10)] +
                    [scan(9+n%10,9000+n) for n in range(30)])
    assert all(r.returncode == 0 for r in results), [r.stderr for r in results if r.returncode]
    for u in range(9,19):
        c = counts(u)
        assert c['total'] == c['seen'] == c['saved'] == 3
        assert c['balance'] == c['granted'] == 2
    check('global reset/clear with ten users scanning and gifting', {'operations':42,'hits_preserved':30,'gifts_preserved':20,'deadlocks':0})

    sql('select '+action(500,'clear_history_one',8))
    before = counts(8)
    assert before['history'] == 0 and before['seen'] == before['saved'] == before['total']
    assert value('select '+scan(8,8000)) == {'seen':True}
    assert counts(8)['total'] == before['total']
    check('clear history never deletes hits or duplicate prevention', before)

    sql('update nearby_scan_settings set hit_percent=0')
    batch([scan(20,20000+n) for n in range(40)])
    assert opened(20)['total'] == opened(20)['misses'] == 20
    assert opened(20)['hits'] == opened(20)['remaining'] == 0
    sql('update nearby_scan_settings set hit_percent=100')
    check('40 simultaneous misses still consume exactly 20', {'misses':20,'remaining':0})

    sql('update nearby_scan_settings set delay_seconds=60')
    results = batch([scan(22,22000+n) for n in range(24)])
    assert sum(r.returncode == 0 for r in results) == 1
    assert all('chưa hoàn tất' in r.stderr for r in results if r.returncode)
    assert counts(22)['total'] == counts(22)['seen'] == 1
    sql('update nearby_scan_settings set delay_seconds=0')
    check('cooldown contention rolls back rejected candidate inserts', {'submitted':24,'successful':1,'seen':1})

    boundary = value("""select jsonb_build_object('before',nearby_scan_week_start('2026-11-01T04:59:59Z'),
      'at',nearby_scan_week_start('2026-11-01T05:00:00Z'))""")
    assert boundary == {'before':'2026-10-25T05:00:00+00:00','at':'2026-11-01T05:00:00+00:00'}
    sql('select '+action(550,'gift',23,7))
    sql(f"update nearby_scan_weekly set week_start=week_start-interval '7 days' where user_id='{uid(23)}'")
    assert opened(23)['remaining'] == 27 and opened(23)['gift_balance'] == 7
    check('Sunday 12:00 VN boundary and gift-preserving rollover', {**boundary,'new_week_remaining':27,'gift_balance':7})

    # Operational rollback exercised with independent connections, retaining new hits.
    sql('select '+scan(21,21000))
    sql((ROOT / 'supabase-sql/SB2/ROLLBACK_PENDING_2026-11-01_SB2_weekly_scan_quota.sql').read_text())
    results = batch([scan(21,21100+n) for n in range(40)])
    assert sum(r.returncode == 0 for r in results) == 30
    assert counts(21)['saved'] == counts(21)['total'] == 31
    assert opened(21)['remaining'] == 0
    assert sql('select '+action(600,'gift',21,1),False).returncode != 0
    check('rollback retains old hit plus 30 future hits, daily limit enforced', counts(21))

    result = {'engine':value("select to_json(version())"),'fixture':'synthetic local-only',
              'max_workers':32,'checks':checks,'live_SB2_reconciliation':'BLOCKED: no read access'}
    Path('/tmp/weekly-postgres-concurrency-results.json').write_text(json.dumps(result,indent=2))
    print('ALL',len(checks),'CHECKS PASSED')

if __name__ == '__main__':
    main()