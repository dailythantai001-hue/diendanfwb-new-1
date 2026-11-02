import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, SCAN_PASS_MIN, matchScore, type ScanFilters, type ScanProfile } from "./nearby-scan";

const hanoi: ScanProfile = { id: "u1", age: 25, gender: "female", intent: "fwb", province: "Hà Nội", height: 160, weight: 50 };
const strict: ScanFilters = { genders: ["female"], ageMin: 20, ageMax: 30, needs: ["fwb"], distMin: 11, distMax: 200, bodies: ["fit"], districts: [] };

describe("matchScore", () => {
  it("gives 100 when every saved criterion matches", () => {
    expect(matchScore(hanoi, strict, "Hà Nội")).toBe(100);
  });
  it("never rejects: a total mismatch still returns a score of 0", () => {
    const off: ScanProfile = { id: "u2", age: 60, gender: "male", intent: "ons", province: "Cà Mau", height: 170, weight: 95 };
    expect(matchScore(off, strict, "Hà Nội")).toBe(0);
  });
  it("each criterion is worth 20 points", () => {
    expect(matchScore({ ...hanoi, age: 45 }, strict, "Hà Nội")).toBe(80);
    expect(matchScore({ ...hanoi, gender: "male" }, strict, "Hà Nội")).toBe(80);
    expect(matchScore({ ...hanoi, intent: "ons" }, strict, "Hà Nội")).toBe(80);
    expect(matchScore({ ...hanoi, weight: 80 }, strict, "Hà Nội")).toBe(80);
    expect(matchScore({ ...hanoi, province: "Cà Mau" }, strict, "Hà Nội")).toBe(80);
  });
  it("unset criteria count as full points", () => {
    expect(matchScore(hanoi, DEFAULT_FILTERS, "Hà Nội")).toBe(100);
    expect(matchScore({ ...hanoi, age: 45 }, DEFAULT_FILTERS, "Hà Nội")).toBe(80);
  });
  it("same province counts as in range even below the distance minimum", () => {
    expect(matchScore(hanoi, { ...strict, distMin: 11 }, "Hà Nội")).toBe(100);
  });
  it("pass threshold is 50%", () => {
    expect(SCAN_PASS_MIN).toBe(50);
  });
});
