import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/admin-member-detail", () => ({
  loadBangchuIds: async () => new Set(),
  isSystemAccount: (r: any, ids: Set<string>) =>
    ids.has(r.id) || r.account_source === "internal" ||
    !!(r.is_bot || r.is_clone || r.is_virtual || r.is_seed_account || r.is_internal),
}));
import { aggregateRegions } from "./region-summary";

const u = (id: string, province: string | null, extra: any = {}) => ({ id, province, ...extra });

describe("aggregateRegions", () => {
  it("sorts regions by count descending with ranks and percents", () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) => u(`h${i}`, "TP. Hồ Chí Minh")),
      ...Array.from({ length: 30 }, (_, i) => u(`n${i}`, "Hà Nội")),
      ...Array.from({ length: 20 }, (_, i) => u(`d${i}`, "Đà Nẵng")),
    ];
    const s = aggregateRegions(rows, new Set());
    expect(s.rows.map((r) => [r.rank, r.region, r.count, r.percent])).toEqual([
      [1, "TP. Hồ Chí Minh", 50, 50],
      [2, "Hà Nội", 30, 30],
      [3, "Đà Nẵng", 20, 20],
    ]);
    expect(s.total).toBe(100);
  });

  it("excludes second accounts, bots, admins and system ids", () => {
    const s = aggregateRegions([
      u("a", "Hà Nội"),
      u("b", "Hà Nội", { account_source: "internal" }),
      u("c", "Hà Nội", { is_bot: true }),
      u("d", "Hà Nội", { is_admin: true }),
      u("e", "Hà Nội", { role: "admin" }),
      u("f", "Hà Nội"),
    ], new Set(["f"]));
    expect(s.total).toBe(1);
  });

  it("counts each user once and hides regions with no users", () => {
    const s = aggregateRegions([u("a", "Huế"), u("a", "Huế"), u("b", null), u("c", "  ")], new Set());
    expect(s.rows).toEqual([{ rank: 1, region: "Huế", count: 1, percent: 100 }]);
    expect(s.withoutRegion).toBe(2);
  });
});
