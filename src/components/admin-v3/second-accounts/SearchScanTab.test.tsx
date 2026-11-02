import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/nearby-community.functions", () => ({ communityScanAdmin: f.query }));
vi.mock("@/lib/nearby-community-auth", () => ({ scanAuthHeaders: async () => ({}) }));
import { SearchScanTab } from "./SearchScanTab";
const uid = "10000000-0000-4000-8000-000000000001";
const overview = { adminId: "admin-test", totalReal: 1, participants: 1, locked: 1,
  settings: { delay_seconds: 0, hit_percent: 100 }, rows: [{ user_id: uid, name: "Member A", used: 20, remaining: 0, total: 20, hits: 15, misses: 5 }] };
beforeEach(() => { f.query.mockResolvedValue(overview); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("admin sees 20/20 used and locked, with no gift, reset or clear controls", async () => {
  render(<SearchScanTab />);
  expect(await screen.findByText(/Đã dùng 20\/20/)).toBeTruthy();
  expect(screen.getByText(/đã khóa/)).toBeTruthy();
  for (const name of [/\+1/, /\+2/, /Tặng/, /Reset/, /Xóa lịch sử/]) expect(screen.queryByRole("button", { name })).toBeNull();
});
