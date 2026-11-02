import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FwbPage } from "./fwb-page";
vi.mock("@/lib/admin-db", () => ({ adminSetSiteSetting: vi.fn() }));
vi.mock("@/lib/db/router", () => ({ supabase: {} }));
vi.mock("@/lib/vip-zalo-config", async (orig) => { const m: any = await orig(); return { ...m, useVipZaloConfig: () => ({ cfg: m.normalizeVipZaloConfig(null), loaded: true }) }; });
vi.mock("@/lib/connect/community-content", () => ({ fetchCommunityPage: async () => ({show_admin:true,admin_url:"https://example.com/new-admin"}) }));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => ({ me: { id: "viewer", province: "Hà Nội" } }) }));
vi.mock("@/lib/vip-unlock-link", () => ({ useVipUnlockLink: () => "https://example.com/fwb-admin" }));
vi.mock("@/lib/image-cdn", () => ({ avatarSrc: (s: string) => s }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/content-db", () => ({ read3: () => ({ from: () => ({ select: () => ({ eq: () => ({ range: async () => ({ data: [] }) }) }) }) }) }));
vi.mock("@/lib/fake-profiles", () => ({ loadFwbFakeProfiles: async () => [{ id: "candidate", display_name: "Candidate", province: "Hà Nội" }] }));
vi.mock("@/lib/follow-actions", () => ({ unfollowUser: vi.fn() }));
vi.mock("@/lib/user-name", () => ({ resolveUserName: () => "Candidate" }));
vi.mock("@/components/candy/universal-badge", () => ({ default: () => null }));
vi.mock("@/lib/external-link", () => ({ openExternalLinkWithFeedback: vi.fn() }));
vi.mock("@/components/candy/fake-mini-profile", () => ({
  FakeMiniProfile: ({ onAction }: { onAction: () => void }) => {
    const [value, setValue] = useState("");
    return <div><input aria-label="Profile state" value={value} onChange={(e) => setValue(e.target.value)} /><button onClick={onAction}>Connect candidate</button></div>;
  },
}));
vi.mock("@/lib/vip-unlock-config", () => ({
  useVipUnlockConfig: () => ({ title: "VIP", message: "", defaultLocation: "Toàn Quốc", buttonLabel: "Admin", buttonColor: "gold", headerMedia: "", icon: "", link: "https://example.com/common-admin", features: [] }),
  renderLocationText: (s: string) => s,
}));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
describe("FWB shared VIP screen", () => {
  it("Back keeps the same selected profile and pending profile interaction mounted", async () => {
    vi.useFakeTimers();
    const chat = vi.fn(); const view = vi.fn();
    render(<FwbPage onOpenChat={chat} onViewProfile={view} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    fireEvent.click(screen.getByRole("button", { name: "Xem hồ sơ Candidate" }));
    const originalInput = screen.getByLabelText("Profile state");
    fireEvent.change(originalInput, { target: { value: "pending interaction" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect candidate" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "TRỞ LẠI" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Profile state")).toBe(originalInput);
    expect((originalInput as HTMLInputElement).value).toBe("pending interaction");
    expect(chat).not.toHaveBeenCalled(); expect(view).not.toHaveBeenCalled();
  });
  it("uses the unified VIP ZALO support contact instead of the legacy gate action", async () => {
    const { openExternalLinkWithFeedback } = await import("@/lib/external-link");
    vi.useFakeTimers();
    render(<FwbPage onOpenChat={vi.fn()} onViewProfile={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    fireEvent.click(screen.getByRole("button", { name: "Xem hồ sơ Candidate" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect candidate" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "LIÊN HỆ ADMIN HỖ TRỢ" })); });
    expect(openExternalLinkWithFeedback).toHaveBeenCalledWith("https://example.com/new-admin");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});