// @vitest-environment node
// Tests run an isolated Postgres engine, never the old Supabase databases.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
let db: PGlite;
const userA = "00000000-0000-4000-8000-00000000000a";
const girl = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  for (const f of ["nearby_scan", "nearby_scan_history", "nearby_scan_results"])
    await db.exec(readFileSync(`supabase-sql/SB2/RUN_NOW_2026-10-31_SB2_${f}.sql`, "utf8"));
  await db.exec("update nearby_scan_settings set delay_seconds=0");
}, 30000);
afterAll(async () => { await db.close(); });
const attempt = async (u: string, c: string) =>
  (await db.query<{ r: { seen: boolean; hit?: boolean; total?: number } }>(`select public.nearby_scan_attempt_candidate('${u}','${c}') as r`)).rows[0]?.r;
const hitOf = async (c: string) =>
  (await db.query<{ hit: boolean | null }>(`select hit from nearby_scan_seen where user_id='${userA}' and candidate_id='${c}'`)).rows[0]?.hit;

it("records the server's hit (Admin 100%) and miss (Admin 0%) in history", async () => {
  await db.exec("update nearby_scan_settings set hit_percent=100");
  expect(await attempt(userA, girl(1))).toMatchObject({ seen: false, hit: true, total: 1 });
  expect(await hitOf(girl(1))).toBe(true);
  await db.exec("update nearby_scan_settings set hit_percent=0");
  expect(await attempt(userA, girl(2))).toMatchObject({ seen: false, hit: false, total: 2 });
  expect(await hitOf(girl(2))).toBe(false);
});
it("already-scanned candidates are still never counted again", async () => {
  expect(await attempt(userA, girl(1))).toEqual({ seen: true });
});
it("the 30/day limit still rolls back the history row", async () => {
  await db.exec(`update nearby_scan_daily set total=30, hits=1, misses=29 where user_id='${userA}'`);
  await expect(attempt(userA, girl(3))).rejects.toThrow("Bạn đã dùng hết lượt quét hôm nay.");
  expect(await hitOf(girl(3))).toBeUndefined();
});
it("the cooldown is still enforced", async () => {
  const userC = "00000000-0000-4000-8000-00000000000c";
  await db.exec("update nearby_scan_settings set delay_seconds=60");
  await attempt(userC, girl(4));
  await expect(attempt(userC, girl(5))).rejects.toThrow("Lượt quét trước chưa hoàn tất.");
  await db.exec("update nearby_scan_settings set delay_seconds=0");
});
it("browsers still cannot call it directly", async () => {
  await db.exec("set role authenticated");
  await expect(attempt(userA, girl(6))).rejects.toThrow("permission denied");
  await db.exec("reset role");
});
