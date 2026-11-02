import { describe, expect, it, vi } from "vitest";
const stored = vi.hoisted(() => ({ value: null as unknown }));
const saveSetting = vi.hoisted(() => vi.fn(async (_key: string, value: unknown) => { stored.value = JSON.parse(JSON.stringify(value)); }));
vi.mock("@/lib/admin-db", () => ({ adminSetSiteSetting: saveSetting }));
vi.mock("@/lib/db/router", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: stored.value } }) }) }) }) } }));
import { fetchVipZaloConfig, internationalBenefits, VIP_ZALO_COUNTRIES, invalidateVipZaloConfig, normalizeVipZaloConfig, saveVipZaloConfig } from "./vip-zalo-config";

describe("VIP ZALO settings compatibility", () => {
  it("all five countries resolve the same five international benefits after save and edit, independently of Vietnam", async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `international-${i}`, title: `Benefit ${i}`, slides: [] }));
    const cfg = normalizeVipZaloConfig({ vn: [{ id: "vn", title: "Vietnam only" }], intlShared: five });
    cfg.intlShared = internationalBenefits(cfg).map((b, i) => i === 0 ? { ...b, title: "Updated" } : b);
    await saveVipZaloConfig(cfg);
    const loaded = await fetchVipZaloConfig();
    expect(VIP_ZALO_COUNTRIES.map(() => internationalBenefits(loaded).map((b) => b.title))).toEqual(Array(5).fill(["Updated", "Benefit 1", "Benefit 2", "Benefit 3", "Benefit 4"]));
    expect(loaded.vn[0].title).toBe("Vietnam only");
  });
  it("preserves exact old country JSON and conflicting IDs during shared adoption", async () => {
    const old = { tw: [{ id: "same", title: "Taiwan", extra: "keep", slides: [{ body: "old" }] }], us: [{ id: "same", title: "USA", slides: [] }] };
    const cfg = normalizeVipZaloConfig({ intl: old });
    expect(internationalBenefits(cfg).map((b) => b.id)).toEqual(["same", "us:same"]);
    cfg.intlShared = internationalBenefits(cfg);
    await saveVipZaloConfig(cfg);
    const loaded = await fetchVipZaloConfig();
    expect(loaded.intlLegacySnapshot).toEqual(old);
    expect(loaded.intl).toEqual(cfg.intl);
    expect(internationalBenefits(loaded).map((b) => b.title)).toEqual(["Taiwan", "USA"]);
  });
  it("empty shared list does not resurrect deleted legacy benefits and IDs stay stable on reload", () => {
    const raw = { intl: { tw: [{ title: "Legacy" }] }, intlShared: [] };
    expect(internationalBenefits(normalizeVipZaloConfig(raw))).toEqual([]);
    expect(normalizeVipZaloConfig(raw).intl.tw[0].id).toBe(normalizeVipZaloConfig(raw).intl.tw[0].id);
  });
  it("saves to the existing key and reloads two tabs with images, rows and legacy introduction intact", async () => {
    const cfg = normalizeVipZaloConfig({ vn: [{ id: "benefit", title: "Quyền lợi", slides: [
      { title: "Tiêu đề cũ", body: "Mô tả cũ", image: "https://example.com/a.png" },
      { name: "Trang mới", image: "https://example.com/b.png", rows: [{ icon: "https://example.com/icon.png", title: "Hàng riêng", body: "Nội dung riêng" }] },
    ] }] });
    await saveVipZaloConfig(cfg);
    expect(saveSetting).toHaveBeenCalledWith("vip_zalo_v2", cfg);
    invalidateVipZaloConfig();
    const loaded = await fetchVipZaloConfig();
    expect(loaded).toEqual(cfg);
    expect(loaded.vn[0].slides[0]).toMatchObject({ title: "Tiêu đề cũ", body: "Mô tả cũ", image: "https://example.com/a.png", rows: [] });
    expect(loaded.vn[0].slides[1].rows?.[0]).toMatchObject({ icon: "https://example.com/icon.png", title: "Hàng riêng", body: "Nội dung riêng" });
  });
});