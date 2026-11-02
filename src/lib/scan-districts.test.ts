import { describe, expect, it } from "vitest";
import { provinceDistricts, sanitizeDistricts, scanDistrictFor } from "./scan-districts";
import { normalizeFilters } from "./nearby-scan";

describe("area filter (Khu vực)", () => {
  it("HCM profile lists HCM districts", () => {
    const d = provinceDistricts("TP. Hồ Chí Minh")!.districts;
    expect(d).toContain("Quận 1"); expect(d).toContain("TP. Thủ Đức"); expect(d).not.toContain("Ba Đình");
  });
  it("Hà Nội profile lists Hà Nội districts, not HCM", () => {
    const d = provinceDistricts("Hà Nội")!.districts;
    expect(d).toContain("Cầu Giấy"); expect(d).not.toContain("Quận 1");
  });
  it("other provinces get their own list", () => expect(provinceDistricts("Đà Nẵng")!.districts).toContain("Hải Châu"));
  it("province spelled without prefix still resolves", () => expect(provinceDistricts("Hồ Chí Minh")!.province).toBe("TP. Hồ Chí Minh"));
  it("no registered province => no list (never guesses another)", () => {
    expect(provinceDistricts(null)).toBeNull(); expect(provinceDistricts("")).toBeNull();
  });
  it("districts from another province are dropped", () =>
    expect(sanitizeDistricts("Hà Nội", ["Quận 1", "Cầu Giấy"])).toEqual(["Cầu Giấy"]));
  it("scan result area is always one of the selected districts", () => {
    const sel = ["Quận 3", "Gò Vấp"];
    for (let i = 0; i < 200; i++) expect(sel).toContain(scanDistrictFor("u", `c${i}`, "TP. Hồ Chí Minh", sel));
  });
  it("Tất cả khu vực picks from the whole province", () =>
    expect(provinceDistricts("Hà Nội")!.districts).toContain(scanDistrictFor("u", "c1", "Hà Nội", [])));
  it("saved districts survive normalization", () =>
    expect(normalizeFilters({ districts: ["Quận 1", "Quận 3", 5] }).districts).toEqual(["Quận 1"]));
});
