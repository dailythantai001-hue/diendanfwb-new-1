import { describe, it, expect, beforeEach } from "vitest";
import { matchProfile, provinceDistanceKm, bodyOf, DEFAULT_FILTERS, SCAN_LIMIT, consumeScan, getScansUsed } from "./nearby-scan";

const base = { id: "1", age: 25, gender: "female", intent: "fwb", province: "Hà Nội" };

describe("nearby scan quota", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("each successful scan consumes one of 30 daily scans", () => {
    expect(getScansUsed("u1")).toBe(0);
    expect(consumeScan("u1")).toBe(1);
    expect(getScansUsed("u1")).toBe(1);
  });
  it("caps at 30 scans per day and refuses further scans", () => {
    for (let i = 1; i <= SCAN_LIMIT; i++) {
      expect(consumeScan("u1")).toBe(i);
    }
    expect(getScansUsed("u1")).toBe(SCAN_LIMIT);
    expect(consumeScan("u1")).toBeNull();
  });
  it("tracks scans per user separately", () => {
    consumeScan("u1");
    expect(getScansUsed("u2")).toBe(0);
  });
});

describe("nearby scan filters", () => {
  it("age outside 18-40 is excluded", () => {
    expect(matchProfile({ ...base, age: 41 }, DEFAULT_FILTERS, "Hà Nội")).toBeNull();
    expect(matchProfile({ ...base, age: 17 }, DEFAULT_FILTERS, "Hà Nội")).toBeNull();
  });
  it("distance above 200 km is excluded", () => {
    expect(provinceDistanceKm("Hà Nội", "TP. Hồ Chí Minh")!).toBeGreaterThan(200);
    expect(matchProfile({ ...base, province: "TP. Hồ Chí Minh" }, DEFAULT_FILTERS, "Hà Nội")).toBeNull();
  });
  it("same province counts as 0 km and matches", () => {
    expect(matchProfile(base, DEFAULT_FILTERS, "Hà Nội")).toBe(0);
  });
  it("profile without a need is excluded", () => {
    expect(matchProfile({ ...base, intent: null }, DEFAULT_FILTERS, "Hà Nội")).toBeNull();
  });
  it("body type comes from BMI", () => {
    expect(bodyOf(170, 50)).toBe("slim");
    expect(bodyOf(170, 60)).toBe("fit");
    expect(bodyOf(160, 70)).toBe("chubby");
  });
});

describe("nearby distance lock", () => {
  it("1–10 km is locked, 11 km is the first valid minimum", async () => {
    const { isDistanceLocked } = await import("./nearby-scan");
    expect(isDistanceLocked({ distMin: 1 })).toBe(true);
    expect(isDistanceLocked({ distMin: 10 })).toBe(true);
    expect(isDistanceLocked({ distMin: 11 })).toBe(false);
    expect(DEFAULT_FILTERS.distMin).toBe(11);
  });
});
