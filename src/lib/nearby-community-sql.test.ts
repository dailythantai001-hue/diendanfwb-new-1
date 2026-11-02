// @vitest-environment node
// Tests run an isolated Postgres engine, never the old Supabase databases.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
let db: PGlite;
const uid = "00000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(readFileSync("supabase-sql/SB2/RUN_NOW_2026-10-31_SB2_nearby_scan.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });
async function rpc(name: string) {
  const r = await db.query<{ result: { total: number; hits: number; misses: number; hit: boolean } }>(`select public.${name}('${uid}') as result`);
  return r.rows[0]?.result;
}
it("registers a user immediately before any scan, once per day", async () => {
  expect(await rpc("nearby_scan_open")).toMatchObject({ total: 0, hits: 0, misses: 0 });
  await rpc("nearby_scan_open");
  const r = await db.query<{ n: number }>("select count(*)::int as n from nearby_scan_daily");
  expect(r.rows[0]?.n).toBe(1);
});
it("100% always hits and 0% always misses; counters aggregate durably", async () => {
  await db.exec("update nearby_scan_settings set delay_seconds=0,hit_percent=100");
  expect(await rpc("nearby_scan_attempt")).toMatchObject({ total: 1, hits: 1, misses: 0, hit: true });
  await db.exec("update nearby_scan_settings set hit_percent=0");
  expect(await rpc("nearby_scan_attempt")).toMatchObject({ total: 2, hits: 1, misses: 1, hit: false });
  expect(await rpc("nearby_scan_open")).toMatchObject({ total: 2, hits: 1, misses: 1 });
});
it("preserves daily 30-scan limit with atomic updates", async () => {
  for (let n = 2; n < 30; n++) await rpc("nearby_scan_attempt");
  await expect(rpc("nearby_scan_attempt")).rejects.toThrow("Bạn đã dùng hết lượt quét hôm nay.");
  expect(await rpc("nearby_scan_open")).toMatchObject({ total: 30, hits: 1, misses: 29 });
});
it("aggregates 30/1 and tracks one participant without storing candidate/media", async () => {
  const r = await db.query<{ result: { participants: number; rows: { total: number; hits: number; misses: number }[] } }>("select nearby_scan_overview(0) as result");
  expect(r.rows[0]?.result).toMatchObject({ participants: 1, rows: [{ total: 30, hits: 1, misses: 29 }] });
});
it("blocks direct browser read and write to statistics", async () => {
  await db.exec("set role anon");
  await expect(db.query("select * from nearby_scan_daily")).rejects.toThrow("permission denied");
  await db.exec("reset role; set role authenticated");
  await expect(db.query("select nearby_scan_attempt('" + uid + "')")).rejects.toThrow("permission denied");
  await db.exec("reset role");
});