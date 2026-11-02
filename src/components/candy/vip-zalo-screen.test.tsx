import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// JSDOM has no layout observers; real carousel gestures are checked in Chromium.
vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => ({ me: { id: "screen-tests", province: "Hà Nội" }, session: { user: { id: "screen-tests" } } }) }));
vi.mock("@/lib/admin-db", () => ({ adminSetSiteSetting: vi.fn() }));
vi.mock("@/lib/db/router", () => ({ supabase: {} }));
const openLink = vi.fn();
const fetchCommunityPage = vi.fn();
vi.mock("@/lib/external-link", () => ({ openExternalLinkWithFeedback: (u: string) => openLink(u) }));
vi.mock("@/lib/connect/community-content", () => ({ fetchCommunityPage: () => fetchCommunityPage() }));
vi.mock("@/lib/vip-zalo-config", async (orig) => {
  const m: any = await orig();
  const cfg = m.normalizeVipZaloConfig({
    vn: [
      { id: "g", icon: "💬", title: "Nhóm Zalo {location}", subtitle: "Click vào để xem quyền lợi", slides: [{ title: "A", body: "Chi tiết 1" }, { title: "B", body: "Chi tiết 2" }] },
      { id: "a", title: "App kín", slides: [] },
    ],
    intl: { ca: [{ id: "c1", title: "Line Canada", slides: [] }] },
  });
  return { ...m, useVipZaloConfig: () => ({ cfg, loaded: true }) };
});

import { VipZaloScreen } from "./vip-zalo-screen";
import { normalizeVipZaloConfig } from "@/lib/vip-zalo-config";

afterEach(cleanup);

describe("VIP ZALO screen", () => {
  it("every country displays the same five shared benefits only after confirmation", () => {
    const config = normalizeVipZaloConfig({ intlShared: Array.from({ length: 5 }, (_, i) => ({ id: `five-${i}`, title: `International ${i}`, slides: [] })) });
    render(<VipZaloScreen open onClose={vi.fn()} config={config} />);
    for (const country of ["Đài Loan", "Mỹ", "Nhật Bản", "Hàn Quốc", "Canada"]) {
      fireEvent.click(screen.getByRole("radio", { name: /QUỐC TẾ/ }));
      fireEvent.click(screen.getByRole("radio", { name: country }));
      fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
      expect(document.querySelectorAll(".vzs-benefit")).toHaveLength(5);
      expect(screen.getByText("International 0")).toBeTruthy();
      expect(screen.getByText("International 4")).toBeTruthy();
    }
  });
  it("shows location title and empty benefits until a plan is chosen", () => {
    render(<VipZaloScreen open onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "VIP ZALO Hà Nội" })).toBeTruthy();
    expect(document.querySelectorAll(".vzs-benefit").length).toBe(0);
  });
  it("VN plan shows two benefits; sheet shows admin slides", () => {
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /VIỆT NAM/ }));
    expect(document.querySelectorAll(".vzs-benefit").length).toBe(2);
    fireEvent.click(screen.getByText("Nhóm Zalo Hà Nội"));
    expect(screen.getByText("Chi tiết 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByText("Chi tiết 1")).toBeNull();
  });
  it("international opens a centered country picker; benefits only after confirm", () => {
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /QUỐC TẾ/ }));
    expect(screen.getByRole("dialog", { name: "Chọn quốc gia" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Canada/ }));
    expect(document.querySelectorAll(".vzs-benefit").length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(screen.queryByRole("dialog", { name: "Chọn quốc gia" })).toBeNull();
    expect(document.querySelectorAll(".vzs-benefit").length).toBe(1);
    fireEvent.click(screen.getByText("Line Canada"));
    expect(screen.getByText("Chưa có nội dung.")).toBeTruthy();
  });
  it("cancel keeps the previous country; picker uses SVG flags, no letter codes", () => {
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /QUỐC TẾ/ }));
    expect(document.querySelectorAll(".vzs-pick svg.vzs-flag").length).toBe(5);
    fireEvent.click(screen.getByRole("radio", { name: /Canada/ }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    fireEvent.click(screen.getByRole("radio", { name: /QUỐC TẾ/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Nhật Bản/ }));
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(screen.getByText("Line Canada")).toBeTruthy();
  });
  it("no GIF uploaded → no media area, crown or PREMIUM label", () => {
    render(<VipZaloScreen open onClose={vi.fn()} />);
    expect(document.querySelector(".vzs-media")).toBeNull();
    expect(screen.queryByText("PREMIUM")).toBeNull();
    expect(screen.queryByText("👑")).toBeNull();
  });
  it("main contact button is enabled without choosing a plan; Back closes", () => {
    const close = vi.fn();
    render(<VipZaloScreen open onClose={close} />);
    expect((screen.getByRole("button", { name: "LIÊN HỆ ADMIN HỖ TRỢ" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "TRỞ LẠI" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("defaults have no benefits (no invented names)", () => {
    const d = normalizeVipZaloConfig(null);
    expect(d.vn).toEqual([]);
    expect(d.intl.us).toEqual([]);
  });
  it("legacy keyed config keeps only admin-authored benefits", () => {
    const d = normalizeVipZaloConfig({ vn: { group: { title: "Nhóm Zalo", slides: [] }, app: { title: "App", slides: [{ body: "x" }] } } });
    expect(d.vn.map((b) => b.title)).toEqual(["App"]);
  });
});

describe("Admin preview", () => {
  it("renders the unsaved config passed in, not the stored one", () => {
    const draft = normalizeVipZaloConfig({ title: "Bản nháp {location}", vnLabel: "GÓI NHÁP" });
    render(<VipZaloScreen open onClose={vi.fn()} config={draft} />);
    expect(screen.getByRole("heading", { name: "Bản nháp Hà Nội" })).toBeTruthy();
    expect(screen.getByText("GÓI NHÁP")).toBeTruthy();
  });
  it("closing the sheet keeps the chosen plan", () => {
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /VIỆT NAM/ }));
    fireEvent.click(screen.getByText("Nhóm Zalo Hà Nội"));
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.getByRole("radio", { name: /VIỆT NAM/ }).getAttribute("aria-checked")).toBe("true");
  });
  it("detail sheet has exactly one contact button, outside the swipe track", () => {
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /VIỆT NAM/ }));
    fireEvent.click(screen.getByText("Nhóm Zalo Hà Nội"));
    const btns = Array.from(document.querySelectorAll(".vzs-sheet .vzs-contact"));
    expect(btns.length).toBe(1);
    expect(btns[0].closest(".vzs-track")).toBeNull();
  });
  it("contact opens the existing Admin link (admin_url)", async () => {
    fetchCommunityPage.mockResolvedValue({ show_admin: true, admin_url: "https://zalo.me/real" });
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /VIỆT NAM/ }));
    fireEvent.click(screen.getByText("Nhóm Zalo Hà Nội"));
    fireEvent.click(document.querySelector(".vzs-sheet .vzs-contact")!);
    await vi.waitFor(() => expect(openLink).toHaveBeenCalledWith("https://zalo.me/real"));
  });
  it("contact opens nothing when no Admin link is configured", async () => {
    openLink.mockClear();
    fetchCommunityPage.mockResolvedValue({ show_admin: true, admin_url: "" });
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /VIỆT NAM/ }));
    fireEvent.click(screen.getByText("Nhóm Zalo Hà Nội"));
    fireEvent.click(document.querySelector(".vzs-sheet .vzs-contact")!);
    await vi.waitFor(() => expect(fetchCommunityPage).toHaveBeenCalled());
    expect(openLink).not.toHaveBeenCalled();
  });
  it("main and detail contact buttons open the same Admin link", async () => {
    openLink.mockClear();
    fetchCommunityPage.mockResolvedValue({ show_admin: true, admin_url: "https://zalo.me/real" });
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(document.querySelector(".vzs-actions .vzs-contact")!);
    await vi.waitFor(() => expect(openLink).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("radio", { name: /VIỆT NAM/ }));
    fireEvent.click(screen.getByText("Nhóm Zalo Hà Nội"));
    fireEvent.click(document.querySelector(".vzs-sheet .vzs-contact")!);
    await vi.waitFor(() => expect(openLink).toHaveBeenCalledTimes(2));
    expect(openLink.mock.calls).toEqual([["https://zalo.me/real"], ["https://zalo.me/real"]]);
  });
  it("main button shows notice and opens nothing when no Admin link", async () => {
    openLink.mockClear();
    fetchCommunityPage.mockClear();
    fetchCommunityPage.mockResolvedValue({ show_admin: true, admin_url: "" });
    render(<VipZaloScreen open onClose={vi.fn()} />);
    fireEvent.click(document.querySelector(".vzs-actions .vzs-contact")!);
    await vi.waitFor(() => expect(fetchCommunityPage).toHaveBeenCalled());
    expect(openLink).not.toHaveBeenCalled();
  });
});
