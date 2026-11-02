import { afterEach, expect, it, vi } from "vitest";
import { savedResultsPage, readQuota } from "./nearby-community.server";
const uid = "10000000-0000-4000-8000-000000000001";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("read-only quota refresh calls only the lifetime quota RPC and never open/attempt", async () => {
  vi.stubEnv("SUPABASE2_SERVICE_ROLE_KEY", "test-only-fixture");
  const fetcher = vi.fn(async (_url: string) => new Response(JSON.stringify({ mode: "lifetime", claimed: true, limit: 20, used: 12, remaining: 8, total: 12, hits: 7, misses: 5 })));
  vi.stubGlobal("fetch", fetcher);
  expect(await readQuota(uid)).toMatchObject({ remaining: 8, used: 12 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toContain("rpc/nearby_scan_quota");
});
it("an old daily reply (before v4 SQL) fails closed instead of allowing 30 per day", async () => {
  vi.stubEnv("SUPABASE2_SERVICE_ROLE_KEY", "test-only-fixture");
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ total: 2, hits: 1, misses: 1 })));
  await expect(readQuota(uid)).rejects.toThrow();
});
it("v2 result pages carry exact cursor and snapshot and hydrate profiles in groups of at most 40", async () => {
  vi.stubEnv("SUPABASE2_SERVICE_ROLE_KEY", "test-only-fixture");
  const until = "2026-11-01T05:00:00Z", cursor = { scanned_at: "2026-10-31T05:00:00Z", candidate_id: uid };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("rpc/nearby_scan_results_page")) return new Response(JSON.stringify({ rows: Array.from({ length: 100 }, (_, n) => ({ candidate_id: `20000000-0000-4000-8000-${String(n).padStart(12,"0")}`, scanned_at: cursor.scanned_at })), has_more: true, until, next_cursor: cursor }));
    return new Response("[]");
  });
  const page = await savedResultsPage("fixture-token", uid, cursor, until);
  expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ p_user: uid, p_after_time: cursor.scanned_at, p_after_id: uid, p_limit: 100, p_until: until });
  expect(calls).toHaveLength(4);
  expect(page.position).toEqual({ cursor, until, hasMore: true, source: "v2" });
  expect(page.rows).toHaveLength(100); // Unavailable profile does not silently advance/lose the stored ID.
});
it("permission errors do not fall back to old results and pretend success", async () => {
  vi.stubEnv("SUPABASE2_SERVICE_ROLE_KEY", "test-only-fixture");
  const fetcher = vi.fn(async () => new Response("{}", { status: 403 })); vi.stubGlobal("fetch", fetcher);
  await expect(savedResultsPage("fixture-token", uid)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});