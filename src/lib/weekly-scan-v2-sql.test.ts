// @vitest-environment node
// Isolated embedded PostgreSQL only: never uses Supabase, credentials or real users.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

let db: PGlite;
const user = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidate = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = user(999);
async function call(name: string, args: string) {
  const q = await db.query<{ r: Record<string, any> }>(`select public.${name}(${args}) r`);
  return q.rows[0]?.r;
}
const scan = (u: string, c: string) => call("nearby_scan_attempt_candidate", `'${u}','${c}'`);
const open = (u: string) => call("nearby_scan_open", `'${u}'`);
const action = (id: number, kind: string, u: string | null, amount = 0) =>
  call("nearby_scan_admin_action", `'${request(id)}','${admin}','${kind}',${u ? `'${u}'` : "null"},${amount}`);
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  for (const f of ["nearby_scan", "nearby_scan_history", "nearby_scan_results"])
    await db.exec(readFileSync(`supabase-sql/SB2/RUN_NOW_2026-10-31_SB2_${f}.sql`, "utf8"));
  await db.exec("update nearby_scan_settings set delay_seconds=0,hit_percent=100;");
  // Concrete disjoint baseline: 10 old scans, 4 hits, 6 misses.
  await db.exec(`insert into nearby_scan_daily(user_id,scan_date,total,hits,misses)
    values('${user(1)}','2020-01-01',10,4,6);`);
  await db.exec(readFileSync("supabase-sql/SB2/PENDING_APPROVAL_2026-11-01_SB2_weekly_scan_quota.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });

it("manual reset restores 20 base scans and preserves only unspent gifts, without erasing actual counts", async () => {
  const u = user(1);
  await action(1, "gift", u, 5);
  for (let n = 1; n <= 22; n++) await scan(u, candidate(n));
  expect(await open(u)).toMatchObject({ used: 22, total: 22, hits: 22, remaining: 3, gift_balance: 3 });
  await action(2, "reset_one", u);
  expect(await open(u)).toMatchObject({ used: 0, base_used: 0, total: 22, hits: 22, remaining: 23, gift_balance: 3 });
  await action(3, "reset_one", u);
  expect(await open(u)).toMatchObject({ remaining: 23, gift_balance: 3 });
});
it("weekly rollover retains gift balance independent of previous week", async () => {
  const u = user(2);
  await action(4, "gift", u, 7);
  await open(u);
  await db.exec(`update nearby_scan_weekly set week_start=week_start-interval '7 days' where user_id='${u}'`);
  expect(await open(u)).toMatchObject({ used: 0, base_used: 0, remaining: 27, gift_balance: 7 });
});
it("clear history deletes only the log, retaining permanent seen IDs, hits, quota and duplicate prevention", async () => {
  const u = user(3), c = candidate(100);
  await scan(u,c);
  expect(await action(5,"clear_history_one",u)).toMatchObject({ deleted_history_rows: 1 });
  expect((await db.query(`select * from nearby_scan_seen where user_id='${u}'`)).rows).toHaveLength(1);
  expect((await db.query(`select * from nearby_scan_saved_results where user_id='${u}'`)).rows).toHaveLength(1);
  expect((await db.query(`select * from nearby_scan_history where user_id='${u}'`)).rows).toHaveLength(0);
  expect(await scan(u,c)).toEqual({ seen: true });
  expect(await open(u)).toMatchObject({ total: 1, remaining: 19 });
});
it("lifetime stats add disjoint baseline and new counts exactly, unaffected by reset", async () => {
  const result = await call("nearby_scan_overview", "0");
  const row = result?.rows.find((r: { user_id: string }) => r.user_id === user(1));
  expect(row).toMatchObject({ total: 32, hits: 26, misses: 6, week_total: 22, week_used: 0, week_remaining: 23 });
});
it("zero percent miss costs one base scan and keeps total equal to hits plus misses", async () => {
  await db.exec("update nearby_scan_settings set hit_percent=0");
  expect(await scan(user(4),candidate(101))).toMatchObject({ hit: false, total: 1, hits: 0, misses: 1, remaining: 19 });
  await db.exec("update nearby_scan_settings set hit_percent=100");
});
it("retrying a gift request does not double-credit and mismatched reused request fails", async () => {
  const u = user(5);
  const results = await Promise.all(Array.from({ length: 5 },() => action(6,"gift",u,2)));
  expect(results.filter(r => r?.duplicate === false)).toHaveLength(1);
  expect(await open(u)).toMatchObject({ gift_balance: 2, remaining: 22 });
  await expect(action(6,"gift",u,1)).rejects.toThrow("Mã yêu cầu đã dùng cho thao tác khác.");
});
it("queued parallel gifts/scans account once each and stop at the last quota slot", async () => {
  const u = user(6);
  await Promise.all([action(7,"gift",u,1),action(8,"gift",u,2)]);
  expect(await open(u)).toMatchObject({ remaining: 23, gift_balance: 3 });
  for(let n=0;n<22;n++) await scan(u,candidate(200+n));
  const outcomes = await Promise.allSettled([scan(u,candidate(222)),scan(u,candidate(223))]);
  expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(await open(u)).toMatchObject({ total: 23, remaining: 0, gift_balance: 0 });
  expect((await db.query(`select * from nearby_scan_seen where user_id='${u}'`)).rows).toHaveLength(23);
});
it("all-account reset retains gifts and real statistics", async () => {
  await action(9,"reset_all",null);
  expect(await open(user(2))).toMatchObject({ remaining: 27, gift_balance: 7 });
  expect(await open(user(6))).toMatchObject({ used: 0, total: 23, remaining: 20 });
});
it("Sunday noon Vietnam is exactly the weekly boundary", async () => {
  const r = await db.query<{ before: Date; at: Date }>(`select
    nearby_scan_week_start('2026-11-01T04:59:59Z') as before,
    nearby_scan_week_start('2026-11-01T05:00:00Z') as at`);
  expect(new Date(r.rows[0]?.before ?? 0).toISOString()).toBe("2026-10-25T05:00:00.000Z");
  expect(new Date(r.rows[0]?.at ?? 0).toISOString()).toBe("2026-11-01T05:00:00.000Z");
});
it("cutover refuses incomplete current-week history without leaving new tables behind", async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec("create role anon; create role authenticated; create role service_role;");
    for (const f of ["nearby_scan", "nearby_scan_history", "nearby_scan_results"])
      await isolated.exec(readFileSync(`supabase-sql/SB2/RUN_NOW_2026-10-31_SB2_${f}.sql`, "utf8"));
    await isolated.exec(`insert into nearby_scan_daily(user_id,total,hits,misses) values('${user(10)}',1,1,0)`);
    await expect(isolated.exec(readFileSync("supabase-sql/SB2/PENDING_APPROVAL_2026-11-01_SB2_weekly_scan_quota.sql", "utf8")))
      .rejects.toThrow("Lịch sử tuần hiện tại không đầy đủ");
    await isolated.exec("rollback");
    const result = await isolated.query<{ name: string | null }>("select to_regclass('public.nearby_scan_accounts')::text as name");
    expect(result.rows[0]?.name).toBeNull();
  } finally { await isolated.close(); }
}, 30000);
it("keyset reads all 601 saved hits including identical timestamps, no total cap", async () => {
  const u=user(7);
  await db.exec(`insert into nearby_scan_saved_results select '${u}',
    ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'2020-01-01'::timestamptz
    from generate_series(1,601) n;`);
  const ids: string[]=[];
  let cursor: { scanned_at: string; candidate_id: string } | null=null;
  let until: string | null=null;
  for(let n=0;n<10;n++) {
    const r=await call("nearby_scan_results_page",`'${u}',${cursor ? `'${cursor.scanned_at}','${cursor.candidate_id}'` : "null,null"},100,${until ? `'${until}'` : "null"}`);
    ids.push(...(r?.rows ?? []).map((row: {candidate_id: string})=>row.candidate_id));
    cursor=r?.next_cursor; until=r?.until;
    if(!r?.has_more) break;
  }
  expect(ids).toHaveLength(601);
  expect(new Set(ids).size).toBe(601);
});
it("operational rollback preserves old hits and records every future hit in the same pageable store", async () => {
  const u=user(8);
  await scan(u,candidate(900));
  await action(10,"gift",u,3);
  await db.exec(readFileSync("supabase-sql/SB2/ROLLBACK_PENDING_2026-11-01_SB2_weekly_scan_quota.sql","utf8"));
  expect(await scan(u,candidate(901))).toMatchObject({ mode:"daily",hit:true,total:1,remaining:29 });
  expect(await call("nearby_scan_results_page",`'${u}'`)).toMatchObject({has_more:false});
  const page=await call("nearby_scan_results_page",`'${u}'`);
  expect(page?.rows.map((r:{candidate_id:string})=>r.candidate_id)).toEqual([candidate(900),candidate(901)]);
  expect(await open(u)).toMatchObject({mode:"daily",gift_balance:3});
  await expect(action(11,"gift",u,1)).rejects.toThrow("Quản lý tuần đã tạm dừng sau hoàn tác.");
  const overview=await call("nearby_scan_overview","0");
  expect(overview?.rows.find((r:{user_id:string})=>r.user_id===u)).toMatchObject({total:2,hits:2,misses:0});
});
it("browsers cannot read new data or call helpers and paginated RPCs", async () => {
  await db.exec("set role authenticated");
  await expect(open(user(1))).rejects.toThrow("permission denied");
  await expect(call("nearby_scan_results_page",`'${user(1)}'`)).rejects.toThrow("permission denied");
  await expect(db.query("select * from nearby_scan_accounts")).rejects.toThrow("permission denied");
  await db.exec("reset role");
});