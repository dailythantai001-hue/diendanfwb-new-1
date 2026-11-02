import { useState } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CommonLockedPopup } from "./common-locked-popup";
vi.mock("@/lib/admin-db", () => ({ adminSetSiteSetting: vi.fn() }));
vi.mock("@/lib/db/router", () => ({ supabase: {} }));
vi.mock("@/lib/vip-zalo-config", async (orig) => { const m: any = await orig(); return { ...m, useVipZaloConfig: () => ({ cfg: m.normalizeVipZaloConfig({title: "VIP ZALO {location}"}), loaded: true }) }; });

vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => ({ me: { province: "Hà Nội" } }) }));
vi.mock("@/lib/vip-unlock-link", () => ({ useVipUnlockLink: () => "https://example.com/support" }));
vi.mock("@/lib/vip-unlock-config", () => ({
  useVipUnlockConfig: () => ({
    title: "VIP {location}", message: "Quyền lợi {location}", defaultLocation: "Toàn Quốc",
    buttonLabel: "Liên hệ Admin", buttonColor: "gold", headerMedia: "/vip.gif", icon: "👑", link: "example.com/admin",
    features: [{ icon: "💬", title: "Zalo {location}", subtitle: "Mô tả Admin {location}\nGiữ nguyên dòng hai" }, { icon: "🎥", title: "Video", subtitle: "" }],
  }),
  renderLocationText: (s: string, location: string) => s.replace(/\{location\}/gi, location),
}));

beforeEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });
afterEach(cleanup);
describe("VIP popup presentation preserves behavior", () => {
  it("uses only new configuration and never executes legacy upgrade actions", () => {
    const action=vi.fn(); render(<CommonLockedPopup open onClose={vi.fn()} gate={{title:"Old",message:"Old",actionLabel:"Old action",onAction:action}} />);
    expect(screen.getByRole("dialog", { name: "VIP ZALO Hà Nội" })).toBeTruthy();
    expect(document.querySelector(".clp-overlay")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "VIP VIỆT NAM" }));
    expect(action).not.toHaveBeenCalled();
  });
  it("Back and Escape close without navigating; screen clicks do not dismiss", () => {
    const close = vi.fn(); render(<CommonLockedPopup open onClose={close} />);
    fireEvent.click(screen.getByRole("heading", { name: "VIP ZALO Hà Nội" })); expect(close).not.toHaveBeenCalled();
    const href = window.location.href;
    fireEvent.click(screen.getByRole("button", { name: "TRỞ LẠI" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog")); expect(close).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe(href);
    expect(sessionStorage.getItem("goto-vip-zalo-tab")).toBeNull();
  });
  it("does not render while closed", () => {
    render(<CommonLockedPopup open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("restores the originating tab, draft, scroll containers and focus on Back", () => {
    function Origin() {
      const [open, setOpen] = useState(false);
      const [tab, setTab] = useState("Chat");
      const [draft, setDraft] = useState("");
      return <><button onClick={() => setTab("FWB")}>FWB</button><output>{tab}</output>
        <input aria-label="Draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div data-testid="origin-scroll"><button onClick={() => setOpen(true)}>Open VIP</button></div>
        <CommonLockedPopup open={open} onClose={() => setOpen(false)} /></>;
    }
    const scrollTo = vi.spyOn(window, "scrollTo");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 420 });
    render(<Origin />);
    fireEvent.click(screen.getByRole("button", { name: "FWB" }));
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "unfinished message" } });
    const scroller = screen.getByTestId("origin-scroll"); scroller.scrollTop = 187; scroller.scrollLeft = 42;
    const opener = screen.getByRole("button", { name: "Open VIP" }); opener.focus();
    fireEvent.click(opener);
    expect(document.body.style.position).toBe("fixed");
    expect(scroller.closest<HTMLElement>("body > div")?.inert).toBe(true);
    scroller.scrollTop = 0; scroller.scrollLeft = 0;
    fireEvent.click(screen.getByRole("button", { name: "TRỞ LẠI" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("FWB");
    expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("unfinished message");
    expect(scroller.scrollTop).toBe(187); expect(scroller.scrollLeft).toBe(42);
    expect(document.activeElement).toBe(opener);
    expect(scroller.closest<HTMLElement>("body > div")?.inert).not.toBe(true);
    expect(document.body.style.position).toBe("");
    expect(scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: "instant" });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });
  it("traps keyboard focus in VIP and uses the latest close callback", () => {
    const first = vi.fn(); const latest = vi.fn();
    const { rerender } = render(<CommonLockedPopup open onClose={first} />);
    const back = screen.getByRole("button", { name: "TRỞ LẠI" });
    expect(document.activeElement).toBe(back);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "LIÊN HỆ ADMIN HỖ TRỢ" }));
    fireEvent.keyDown(window, { key: "Tab" }); expect(document.activeElement).toBe(back);
    rerender(<CommonLockedPopup open onClose={latest} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(latest).toHaveBeenCalledOnce(); expect(first).not.toHaveBeenCalled();
  });
});