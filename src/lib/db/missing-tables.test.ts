import { describe, expect, it, vi } from "vitest";
import { createGuardedFetch, isTableMissing, markTableMissing } from "./missing-tables";

describe("missing-table guard", () => {
  it("never blocks nearby_filters even after a past 404", async () => {
    markTableMissing("primary", "nearby_filters");
    expect(isTableMissing("primary", "nearby_filters")).toBe(false);
    const real = vi.fn(async () => new Response('[{"filters":{}}]', { status: 201 }));
    vi.stubGlobal("fetch", real);
    const res = await createGuardedFetch("primary")("https://x.supabase.co/rest/v1/nearby_filters?on_conflict=user_id", { method: "POST" });
    expect(real).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(201);
    vi.unstubAllGlobals();
  });
  it("still blocks other learned missing tables", () => {
    markTableMissing("primary", "some_absent_table");
    expect(isTableMissing("primary", "some_absent_table")).toBe(true);
  });
});
