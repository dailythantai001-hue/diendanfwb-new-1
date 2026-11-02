import { afterEach, expect, it, vi } from "vitest";
import { scanHistoryPage, scanHistoryTotals, scanIdentity } from "./nearby-community.server";
import { historyTime } from "./nearby-scan-history";
const uid = "10000000-0000-4000-8000-000000000001";
const candidate = "20000000-0000-4000-8000-000000000001";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("own-history GET/HEAD reads include hits, misses and unknown old rows without any counting RPC", async () => {
  vi.stubEnv("SUPABASE2_SERVICE_ROLE_KEY", "test-only-fixture");
  const calls: Array<{ url: URL; method: string }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const parsed = new URL(url); calls.push({ url: parsed, method: init?.method ?? "GET" });
    if (init?.method === "HEAD") {
      const hit = parsed.searchParams.get("hit");
      return new Response(null, { headers: { "content-range": `*/${hit === "is.true" ? 2 : hit === "is.false" ? 3 : 9}` } });
    }
    if (parsed.pathname.endsWith("nearby_scan_seen")) return new Response(JSON.stringify([
      { candidate_id: candidate, hit: false, scanned_at: "2026-11-02T03:00:00Z" },
      { candidate_id: uid, hit: null, scanned_at: "2026-10-01T00:00:00Z" },
    ]));
    return new Response("[]");
  });
  const until = "2026-11-02T04:00:00Z";
  const page = await scanHistoryPage("fixture-token", uid, null, until);
  expect(page.totals).toEqual({ total: 9, hits: 2, misses: 3, unknown: 4 });
  expect(page.rows.map(r => r.hit)).toEqual([false, null]);
  expect(page.rows[0]?.scanned_at).toBe("2026-11-02T03:00:00Z");
  for (const call of calls) {
    expect(["GET", "HEAD"]).toContain(call.method);
    expect(call.url.searchParams.get("user_id")).toBe(`eq.${uid}`);
    expect(call.url.searchParams.get("scanned_at")).toBe(`lte.${until}`);
    expect(call.url.pathname).not.toContain("/rpc/");
  }
  expect(calls[0]?.url.searchParams.get("order")).toBe("scanned_at.desc,candidate_id.desc");
});
it("descending keyset continuation preserves time and UUID boundaries without dropping older history", async () => {
  vi.stubEnv("SUPABASE2_SERVICE_ROLE_KEY", "test-only-fixture");
  const calls: URL[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push(new URL(url));
    return init?.method === "HEAD" ? new Response(null, { headers: { "content-range": "*/0" } }) : new Response("[]");
  });
  await scanHistoryPage("fixture", uid, { candidate_id: candidate, scanned_at: "2026-11-01T00:00:00Z" }, "2026-11-02T00:00:00Z");
  expect(calls[0]?.searchParams.get("or")).toBe(`(scanned_at.lt.2026-11-01T00:00:00Z,and(scanned_at.eq.2026-11-01T00:00:00Z,candidate_id.lt.${candidate}))`);
});
it("missing exact counts or malformed timestamps fail instead of fabricating history", async () => {
  vi.stubEnv("SUPABASE2_SERVICE_ROLE_KEY", "test-only-fixture");
  vi.stubGlobal("fetch", async () => new Response(null));
  await expect(scanHistoryTotals(uid, "2026-11-02T00:00:00Z")).rejects.toThrow("Không đọc được tổng lịch sử");
});
it("rejects an invalid account id before service-only history reads", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(scanHistoryPage("fixture", "invalid", null, null)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("server identity verification rejects an expired user before SB2 can be read", async () => {
  const fetcher = vi.fn(async (_url: string) => new Response("{}", { status: 401 })); vi.stubGlobal("fetch", fetcher);
  await expect(scanIdentity("expired-fixture")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("nearby_scan_seen");
});
it("scan timestamps are formatted in Vietnam time, not the device timezone", () => {
  expect(historyTime("2026-11-01T18:30:05Z")).toBe("01:30:05 02/11/2026");
});