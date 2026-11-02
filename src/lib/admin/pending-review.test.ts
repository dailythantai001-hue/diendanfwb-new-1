import { beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: session } }));
import { loadAllPending, pendingCountOptions, reviewPendingSnapshot } from "./pending-review";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  session.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
});
const reply = (data: unknown) => ({ json: async () => data });
describe("pending review rules", () => {
  it.each([1, 5, 0])("reads the exact pending count %i, not the page size", async count => {
    fetchMock.mockResolvedValue(reply({ ok: true, count }));
    const queryFn = pendingCountOptions.queryFn;
    if (typeof queryFn !== "function") throw new Error("Missing query");
    expect(await queryFn({} as never)).toBe(count);
    expect(fetchMock.mock.calls[0][0]).toContain("countOnly=1");
  });
  it("loads all 105 pending posts and freezes the cutoff across pages", async () => {
    const rows = Array.from({ length: 105 }, (_, i) => ({ id: `post-${i}` }));
    fetchMock.mockResolvedValueOnce(reply({ ok: true, rows: rows.slice(0, 100) }))
      .mockResolvedValueOnce(reply({ ok: true, rows: rows.slice(100) }));
    expect(await loadAllPending()).toHaveLength(105);
    const first = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    const second = new URL(fetchMock.mock.calls[1][0], "http://localhost");
    expect(second.searchParams.get("after")).toBe("post-99");
    expect(second.searchParams.get("cutoff")).toBe(first.searchParams.get("cutoff"));
  });
  it("approves every unique snapshot ID once through the existing review action", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true }));
    const processed = vi.fn();
    expect(await reviewPendingSnapshot(["a", "b", "a"], "approve", processed)).toEqual({ succeeded: 2, failed: 0, cleanupFailed: 0 });
    expect(fetchMock.mock.calls.map(call => JSON.parse(call[1].body))).toEqual([{ postId: "a", action: "approve" }, { postId: "b", action: "approve" }]);
    expect(processed).toHaveBeenCalledTimes(2);
  });
  it("does not report failed or previously processed posts as successes", async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: false, code: "NOT_PENDING" }))
      .mockResolvedValueOnce(reply({ ok: false, code: "NOT_REAL_MEMBER" }))
      .mockResolvedValueOnce(reply({ ok: true, cleanupFailed: 1 }));
    const processed = vi.fn();
    expect(await reviewPendingSnapshot(["a", "b", "c"], "reject", processed)).toEqual({ succeeded: 1, failed: 1, cleanupFailed: 1 });
    expect(processed.mock.calls).toEqual([["a"], ["c"]]);
  });
  it("does not silently process a partial snapshot when later pages fail", async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: true, rows: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) }))
      .mockResolvedValueOnce(reply({ ok: false, message: "network failure" }));
    await expect(loadAllPending()).rejects.toThrow("network failure");
  });
});