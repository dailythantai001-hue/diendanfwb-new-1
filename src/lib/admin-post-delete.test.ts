import { describe, it, expect, afterEach, vi } from "vitest";
import { isStrictAdminRow, adminDeletePost } from "./admin-post-delete.server";

describe("admin post delete permission", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("only is_admin === true counts as admin", () => {
    expect(isStrictAdminRow({ is_admin: true })).toBe(true);
    expect(isStrictAdminRow({ is_admin: false })).toBe(false);
    expect(isStrictAdminRow({ is_admin: "true" })).toBe(false);
    expect(isStrictAdminRow(undefined)).toBe(false);
  });

  it("non-admin cannot delete: no DELETE request is sent", async () => {
    vi.stubEnv("SUPABASE1_SERVICE_ROLE_KEY", "k1");
    vi.stubEnv("SUPABASE3_SERVICE_ROLE_KEY", "k3");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }));
      return new Response(JSON.stringify([{ is_admin: false }]));
    }));
    const res = await adminDeletePost("tokentoken", "p1");
    expect(res.ok).toBe(false);
    expect(calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });
});
