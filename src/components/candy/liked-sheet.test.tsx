import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
vi.mock("@/lib/fake-profiles", () => ({ loadFwbFakeProfiles: async () => [] }));
vi.mock("@/lib/follow-store", () => { const empty = new Set(); return { getFollowSet: () => empty, getFollowSetServer: () => empty, subscribeFollow: () => () => {} }; });
vi.mock("./universal-badge", () => ({ default: () => null }));
vi.mock("./vip-zalo-screen", () => ({ VipZaloScreen: ({open,onClose}: {open:boolean;onClose:()=>void}) => open ? <div role="dialog" aria-label="VIP ZALO"><button onClick={onClose}>TRỞ LẠI</button></div> : null }));
import { LikedSheet } from "./liked-sheet";
afterEach(cleanup);
describe("liked-you gate", () => {
  it("denied access opens VIP and Back keeps the sheet and original selected tab", () => {
    const close=vi.fn(), chat=vi.fn(); render(<LikedSheet isVip={false} onClose={close} onOpenChat={chat} viewerProvince={null} />);
    fireEvent.click(screen.getByRole("tab", {name:/Đã thích bạn/}));
    expect(screen.getByRole("dialog",{name:"VIP ZALO"})).toBeTruthy();
    expect(screen.getByRole("tab", {name:/❤️ Đã thích/})).toHaveAttribute("aria-selected","true");
    fireEvent.click(screen.getByRole("button",{name:"TRỞ LẠI"}));
    expect(screen.queryByRole("dialog",{name:"VIP ZALO"})).toBeNull();
    expect(close).not.toHaveBeenCalled(); expect(chat).not.toHaveBeenCalled();
  });
  it("allowed access selects liked-you without opening VIP", () => {
    render(<LikedSheet isVip onClose={vi.fn()} onOpenChat={vi.fn()} viewerProvince={null} />);
    fireEvent.click(screen.getByRole("tab", {name:/Đã thích bạn/}));
    expect(screen.getByRole("tab", {name:/Đã thích bạn/})).toHaveAttribute("aria-selected","true");
    expect(screen.queryByRole("dialog",{name:"VIP ZALO"})).toBeNull();
  });
});