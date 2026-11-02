import { afterEach, expect, it, vi } from "vitest";
import { secondaryRead } from "./nearby-community.server";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("missing SB2 server credential fails before any database request, not as an RLS denial", async () => {
  vi.stubEnv("SUPABASE2_SERVICE_ROLE_KEY", "");
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await expect(secondaryRead("nearby_scan_settings?select=id")).rejects.toThrow("Chưa cấu hình quyền lưu chức năng quét vào Supabase #2.");
  expect(request).not.toHaveBeenCalled();
});