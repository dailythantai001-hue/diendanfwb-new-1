import { describe, expect, it } from "vitest";
import { scanAgeDays, scanAgeLabel } from "./nearby-scan-session";

// Vietnam calendar days (Asia/Ho_Chi_Minh) between the server-stored scan time and now.
describe("scan-age label (Vietnam timezone)", () => {
  // 2026-11-02 12:00 UTC = 19:00 in Vietnam.
  const now = Date.parse("2026-11-02T12:00:00Z");

  it("scanned today => NEW (red tone)", () => {
    const label = scanAgeLabel(Date.parse("2026-11-02T01:00:00Z"), now); // 08:00 VN, same VN day
    expect(label).toEqual({ text: "NEW", tone: "new" });
  });

  it("scanned yesterday => '1N trước' (green tone)", () => {
    const label = scanAgeLabel(Date.parse("2026-11-01T12:00:00Z"), now); // 19:00 VN Nov 1
    expect(label).toEqual({ text: "1N trước", tone: "d1" });
  });

  it("scanned 2+ days ago => 'NN trước' with the real day count (blue tone)", () => {
    expect(scanAgeLabel(Date.parse("2026-10-31T12:00:00Z"), now)).toEqual({ text: "2N trước", tone: "old" });
    expect(scanAgeLabel(Date.parse("2026-10-20T12:00:00Z"), now)).toEqual({ text: "13N trước", tone: "old" });
  });

  it("counts Vietnam calendar days, not 24h spans: 23h ago across midnight is 1 day", () => {
    // now = 19:00 VN Nov 2; scan at 20:00 VN Nov 1 is 23h ago but a different VN day.
    const label = scanAgeLabel(Date.parse("2026-11-01T13:00:00Z"), now);
    expect(label.text).toBe("1N trước");
  });

  it("uses Asia/Ho_Chi_Minh, not UTC: a scan late VN evening is still 'today' near UTC midnight", () => {
    // 2026-11-02 16:30 UTC = 23:30 VN Nov 2; scan at 17:30 UTC Nov 1 = 00:30 VN Nov 2.
    const vnNow = Date.parse("2026-11-02T16:30:00Z");
    expect(scanAgeDays(Date.parse("2026-11-01T17:30:00Z"), vnNow)).toBe(0);
  });

  it("never goes negative if the server clock is ahead", () => {
    expect(scanAgeDays(now + 86_400_000, now)).toBe(0);
  });
});
