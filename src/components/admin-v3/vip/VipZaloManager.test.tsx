import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
const state = vi.hoisted(() => ({ stored: null as unknown, saved: vi.fn() }));
vi.mock("@/lib/admin-db", () => ({ adminSetSiteSetting: async (key: string, value: unknown) => { state.saved(key, value); state.stored = JSON.parse(JSON.stringify(value)); } }));
vi.mock("@/lib/db/router", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: state.stored } }) }) }) }) } }));
vi.mock("@/components/candy/vip-zalo-screen", () => ({ VipZaloScreen: () => null }));
vi.mock("./VipZaloDetailEditor", () => ({ VipZaloDetailEditor: () => null }));
import { VipZaloManager } from "./VipZaloManager";
import { fetchVipZaloConfig, internationalBenefits, invalidateVipZaloConfig } from "@/lib/vip-zalo-config";

describe("international Admin configuration", () => {
  it("requires explicit adoption then edits and saves one list without overwriting either original country or Vietnam", async () => {
    const old = { tw: [{ id: "tw", title: "Taiwan original" }], us: [{ id: "us", title: "USA original" }] };
    state.stored = { vn: [{ id: "vn", title: "Vietnam original" }], intl: old };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<VipZaloManager />);
    await screen.findByRole("button", { name: "Tạo bộ quyền lợi chung từ dữ liệu hiện có" });
    expect(state.saved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tạo bộ quyền lợi chung từ dữ liệu hiện có" }));
    expect(state.saved).not.toHaveBeenCalled();
    fireEvent.change(screen.getByDisplayValue("Taiwan original"), { target: { value: "Shared updated" } });
    fireEvent.click(screen.getByRole("button", { name: /Lưu cấu hình VIP ZALO/ }));
    await waitFor(() => expect(state.saved).toHaveBeenCalledTimes(1));
    invalidateVipZaloConfig();
    const cfg = await fetchVipZaloConfig();
    expect(internationalBenefits(cfg).map((b) => b.title)).toEqual(["Shared updated", "USA original"]);
    expect(cfg.intlLegacySnapshot).toEqual(old);
    expect(cfg.intl.tw[0].title).toBe("Taiwan original");
    expect(cfg.intl.us[0].title).toBe("USA original");
    expect(cfg.vn[0].title).toBe("Vietnam original");
    confirm.mockRestore(); cleanup();
  });
});