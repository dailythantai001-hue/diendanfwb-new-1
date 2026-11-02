import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => ({ me: { province: "Đà Nẵng" } }) }));
vi.mock("@/lib/admin-db", () => ({ adminSetSiteSetting: vi.fn() }));
vi.mock("@/lib/db/router", () => ({ supabase: {} }));
vi.mock("@/lib/clone-vip-media", () => ({
  getCachedCloneVipMedia: () => undefined,
  requestCloneVipMedia: vi.fn(),
  subscribeCloneVipMedia: () => () => {},
}));
vi.mock("@/components/vip/vip-media", () => ({ VipMedia: () => null }));
vi.mock("@/components/candy/profile-uid-badge", () => ({ SocialGlyph: () => null }));
vi.mock("@/lib/vip-zalo-config", async (orig) => {
  const m: any = await orig();
  return { ...m, useVipZaloConfig: () => ({ cfg: m.normalizeVipZaloConfig({ title: "VIP ZALO {location}" }), loaded: true }) };
});

import { ChatUserInfoToggle } from "./chat-user-info-panel";

afterEach(cleanup);

describe("Chat user info → VIP ZALO screen", () => {
  it("server status opens VIP ZALO; Back returns to the still-open panel", () => {
    render(<ChatUserInfoToggle userId="u1" name="Lan" avatar={null} statusLabel="Hoạt động" online />);
    fireEvent.click(screen.getByRole("button", { name: "Xem thông tin người dùng" }));
    fireEvent.click(screen.getByText("Hỗn Tạp"));
    expect(screen.getByRole("heading", { name: "VIP ZALO Đà Nẵng" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "TRỞ LẠI" }));
    expect(screen.queryByRole("heading", { name: "VIP ZALO Đà Nẵng" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Thông tin người dùng" })).toBeTruthy();
  });
  it("social buttons open VIP ZALO too", () => {
    render(<ChatUserInfoToggle userId="u1" name="Lan" avatar={null} statusLabel="" online={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Xem thông tin người dùng" }));
    fireEvent.click(screen.getByRole("button", { name: "Zalo — Kết bạn" }));
    expect(screen.getByRole("heading", { name: "VIP ZALO Đà Nẵng" })).toBeTruthy();
  });
});

describe("Entry-point wiring stays scoped", () => {
  const chat = readFileSync("src/components/candy/chat-page.tsx", "utf8");
  const fwb = readFileSync("src/components/candy/fwb-page.tsx", "utf8");
  it("Chat voice/video calls use VIP ZALO", () => {
    expect(chat).toMatch(/<VipZaloScreen open=\{!!callNotice\} onClose=\{\(\) => setCallNotice\(null\)\} \/>/);
  });
});
