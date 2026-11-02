import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useVipZaloSeen } from "./vip-zalo-seen";

function Fixture({ user, plan = "vn", preview = false }: { user?: string; plan?: "vn" | "intl"; preview?: boolean }) {
  const { hasSeen, markSeen } = useVipZaloSeen(user, preview);
  return <div>{Array.from({ length: 5 }, (_, i) => <button key={i} onClick={() => markSeen(plan, String(i))}>{hasSeen(plan, String(i)) ? "viewed" : "unread"}:{i}</button>)}</div>;
}

describe("VIP viewed benefit rules", () => {
  it("five start unread; each individual open persists independently through remount", () => {
    const props = { user: "five-benefits" };
    const view = render(<Fixture {...props} />);
    expect(screen.getAllByRole("button", { name: /unread/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "unread:0" }));
    expect(screen.getAllByRole("button", { name: /unread/ })).toHaveLength(4);
    view.unmount();
    render(<Fixture {...props} />);
    expect(screen.getByRole("button", { name: "viewed:0" })).toBeTruthy();
    for (let i = 1; i < 5; i++) {
      fireEvent.click(screen.getByRole("button", { name: `unread:${i}` }));
      expect(screen.getAllByRole("button", { name: /viewed/ })).toHaveLength(i + 1);
    }
    expect(JSON.parse(localStorage.getItem("vip-zalo-seen:v1:five-benefits") || "[]")).toHaveLength(5);
    cleanup();
  });
  it("isolates users, plans, signed-out state and Admin previews", () => {
    const view = render(<Fixture user="isolation" />);
    fireEvent.click(screen.getByRole("button", { name: "unread:0" }));
    for (const props of [{ user: "other" }, { user: "isolation", plan: "intl" as const }, { user: undefined }, { user: "isolation", preview: true }]) {
      view.rerender(<Fixture {...props} />);
      expect(screen.getAllByRole("button", { name: /unread/ })).toHaveLength(5);
    }
    view.rerender(<Fixture user="isolation" />);
    expect(screen.getByRole("button", { name: "viewed:0" })).toBeTruthy();
    cleanup();
  });
  it("retains in-memory state when browser storage is unavailable", () => {
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const view = render(<Fixture user="blocked-storage" plan="intl" />);
    fireEvent.click(screen.getByRole("button", { name: "unread:0" }));
    view.unmount();
    render(<Fixture user="blocked-storage" plan="intl" />);
    expect(screen.getByRole("button", { name: "viewed:0" })).toBeTruthy();
    storage.mockRestore();
    cleanup();
  });
});