import { it, expect, vi } from "vitest";
import { getLocationCooldownStatus } from "./vn-provinces";
it("retains VIP 5 bypass and denies VIP 4 during the existing location cooldown", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T15:30:00Z"));
  expect(getLocationCooldownStatus(1,"2026-10-30T15:30:00Z",4).blocked).toBe(true);
  expect(getLocationCooldownStatus(1,"2026-10-30T15:30:00Z",5).blocked).toBe(false);
  vi.useRealTimers();
});