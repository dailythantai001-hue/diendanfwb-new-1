// @vitest-environment node
// Tests run an isolated Postgres engine, never the old Supabase databases.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
let db: PGlite;
const userA = "00000000-0000-4000-8000-00000000000a";
const userB = "00000000-0000-4000-8000-00000000000b";
const girl1 = "00000000-0000-4000-8000-000000000101";
const girl2 = "00000000-0000-4000-8000-000000000102";
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(readFileSync("supabase-sql/SB2/RUN_NOW_2026-10-31_SB2_nearby_scan.sql", "utf8"));
  await db.exec(readFileSync("supabase-sql/SB2/RUN_NOW_2026-10-31_SB2_nearby_scan_history.sql", "utf8"));
  await db.exec("update nearby_scan_settings set delay_seconds=0, hit_percent=0");
}, 30000);
afterAll(async () => { await db.close(); });
async function attempt(user: string, candidate: string) {
  const r = await db.query<{ result: { seen: boolean; total?: number; hit?: boolean } }>(
    `select public.nearby_scan_attempt_candidate('${user}','${candidate}') as result`);
  return r.rows[0]?.result;
}
it("a candidate already scanned by a user (even a miss) is never counted again for that user", async () => {
  expect(await attempt(userA, girl1)).toMatchObject({ seen: false, total: 1, hit: false });
  expect(await attempt(userA, girl1)).toEqual({ seen: true });
  const r = await db.query<{ total: number }>(`select total from nearby_scan_daily where user_id='${userA}'`);
  expect(r.rows[0]?.total).toBe(1);
});
it("history is independent between users", async () => {
  expect(await attempt(userB, girl1)).toMatchObject({ seen: false, total: 1 });
  expect(await attempt(userA, girl2)).toMatchObject({ seen: false, total: 2 });
});
it("stores only user UUID, candidate ID and scan time", async () => {
  const r = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name='nearby_scan_seen' order by ordinal_position");
  expect(r.rows.map(c => c.column_name)).toEqual(["user_id", "candidate_id", "scanned_at"]);
});
it("a rejected attempt (30/day limit) keeps no history row", async () => {
  await db.exec(`update nearby_scan_daily set total=30, hits=0, misses=30 where user_id='${userA}'`);
  const girl3 = "00000000-0000-4000-8000-000000000103";
  await expect(attempt(userA, girl3)).rejects.toThrow("Bạn đã dùng hết lượt quét hôm nay.");
  const r = await db.query<{ n: number }>(`select count(*)::int as n from nearby_scan_seen where user_id='${userA}' and candidate_id='${girl3}'`);
  expect(r.rows[0]?.n).toBe(0);
});
it("browsers cannot read history or call the attempt directly", async () => {
  await db.exec("set role anon");
  await expect(db.query("select * from nearby_scan_seen")).rejects.toThrow("permission denied");
  await db.exec("reset role; set role authenticated");
  await expect(attempt(userA, girl2)).rejects.toThrow("permission denied");
  await db.exec("reset role");
});
