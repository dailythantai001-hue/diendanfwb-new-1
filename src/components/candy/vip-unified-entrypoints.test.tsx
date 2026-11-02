import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => ({ me: { id: "unified-user", province: "Hà Nội" } }) }));
vi.mock("@/lib/admin-db", () => ({ adminSetSiteSetting: vi.fn() }));
vi.mock("@/lib/db/router", () => ({ supabase: {} }));
vi.mock("@/lib/vip-zalo-config", async (orig) => { const m: any = await orig(); return { ...m, useVipZaloConfig: () => ({ cfg: m.normalizeVipZaloConfig({ title: "VIP ZALO {location}" }), loaded: true }) }; });
import { CommonLockedPopup } from "./common-locked-popup";
import { VipUnlockModal } from "./vip-unlock-modal";
import { VipRequiredPopup } from "./vip-required-popup";
import { ZaloVipLockModal } from "./zalo-vip-lock-modal";
import { ContactVipLockModal } from "./contact-vip-lock-modal";
import { CommunityVipModal } from "./community-vip-modal";
import { VipCommunityPopup } from "./VipCommunityPopup";
import { UnlockLetter } from "./unlock-letter";
import { PopupEngine, openPopup } from "./popup-engine";
import { act } from "react";

afterEach(cleanup);
describe("all legacy restriction adapters", () => {
  it.each([CommonLockedPopup, VipUnlockModal, VipRequiredPopup, ZaloVipLockModal, ContactVipLockModal, CommunityVipModal, VipCommunityPopup, UnlockLetter])("adapter %s opens only the new screen and Back closes the caller", (Adapter) => {
    const close = vi.fn();
    render(<Adapter open onClose={close} />);
    expect(screen.getByRole("dialog", { name: "VIP ZALO Hà Nội" })).toBeTruthy();
    expect(document.querySelectorAll(".vzs")).toHaveLength(1);
    expect(document.querySelector(".clp-overlay")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "TRỞ LẠI" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("runtime popup keys share one screen without executing confirm or upgrade", () => {
    const close=vi.fn(), confirm=vi.fn(); render(<PopupEngine />);
    act(() => openPopup("vip_zalo", {onClose:close,onConfirm:confirm}));
    act(() => openPopup("unknown-vip-feature", {onClose:close,onConfirm:confirm}));
    expect(document.querySelectorAll(".vzs")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", {name:"TRỞ LẠI"}));
    expect(close).toHaveBeenCalledOnce(); expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});