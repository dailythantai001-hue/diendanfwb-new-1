import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), cleanup: vi.fn(), prepare: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/admin/pending-review-r2.server", () => ({ postImageUrls: () => ["https://existing.r2.dev/post.jpg"], prepareReviewImageCleanup: mocks.prepare }));
import { Route } from "./admin-review-post";
const handlers = (Route as unknown as { server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } } }).server.handlers;
let state: string, writeRows: unknown[], writes: Array<{ kind: string; filters: unknown[]; update?: unknown }>;
beforeEach(() => {
  vi.stubEnv("SB3_SERVICE_ROLE_KEY", "test-server-key");
  state = "pending"; writeRows = [{ id: "11111111-1111-1111-1111-111111111111" }]; writes = [];
  mocks.cleanup.mockReset().mockResolvedValue(0); mocks.prepare.mockReset().mockReturnValue(mocks.cleanup);
  const sb1 = { auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) }, from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, limit: async () => ({ data: [] }), maybeSingle: async () => ({ data: table === "bangchu" ? { status: "approved", is_active: true } : { account_source: "member" } }) };
    return q;
  } };
  const sb3 = { from: () => {
    const q: any = { select: () => q, eq: (key: string, value: string) => { if (writes.length) writes.at(-1)?.filters.push([key, value]); return q; },
      maybeSingle: async () => ({ data: { id: "11111111-1111-1111-1111-111111111111", user_id: "member", status: state } }),
      update: (update: unknown) => { writes.push({ kind: "update", update, filters: [] }); return q; },
      delete: () => { writes.push({ kind: "delete", filters: [] }); return q; },
      then: (resolve: (value: unknown) => void) => resolve({ data: writeRows, error: null }) };
    return q;
  } };
  mocks.createClient.mockImplementation((url: string) => url.includes("gxfx") ? sb1 : sb3);
});
afterEach(() => vi.unstubAllEnvs());
async function review(action: string) {
  return handlers.POST({ request: new Request("http://localhost/api/public/admin-review-post", { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify({ postId: "11111111-1111-1111-1111-111111111111", action }) }) });
}
it.each(["published", "rejected"])("never mutates or removes R2 images for %s posts", async status => {
  state = status; expect((await review("reject")).status).toBe(409);
  expect(writes).toHaveLength(0); expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.cleanup).not.toHaveBeenCalled();
});
it("publishes only a still-pending post and never deletes its images", async () => {
  expect((await review("approve")).status).toBe(200);
  expect(writes).toEqual([{ kind: "update", update: { status: "published" }, filters: [["id", "11111111-1111-1111-1111-111111111111"], ["status", "pending"]] }]);
  expect(mocks.cleanup).not.toHaveBeenCalled();
});
it("only the winning pending deletion removes R2 images", async () => {
  writeRows = []; expect((await review("reject")).status).toBe(409); expect(mocks.cleanup).not.toHaveBeenCalled();
  writeRows = [{ id: "post" }]; expect((await review("reject")).status).toBe(200); expect(mocks.cleanup).toHaveBeenCalledOnce();
  expect(writes[1].filters).toContainEqual(["status", "pending"]);
});
it("keeps the pending row intact if image deletion cannot be configured", async () => {
  mocks.prepare.mockImplementation(() => { throw new Error("missing configuration"); });
  expect((await review("reject")).status).toBe(503); expect(writes).toHaveLength(0);
});
it("reports partial R2 cleanup failure separately instead of claiming complete deletion", async () => {
  mocks.cleanup.mockResolvedValue(1);
  expect(await (await review("reject")).json()).toEqual({ ok: true, action: "reject", cleanupFailed: 1 });
});