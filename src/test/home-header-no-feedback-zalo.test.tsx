import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";

// jsdom không có ResizeObserver — header dùng nó để đo chiều cao.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props} />
  ),
}));

import { AppHeader } from "@/components/candy/app-header";
import { LanguageProvider } from "@/i18n/context";

// Quy tắc UI: bảng tin trang chủ KHÔNG còn lối vào "Feedback Zalo" phía trên bài viết.
// Trang /feedback-zalo vẫn tồn tại (đường dẫn cũ còn dùng được) nhưng không được
// gắn nút vào header nữa.
describe("Home header", () => {
  it("drops the Feedback Zalo entry from the community header row", () => {
    render(
      <LanguageProvider>
        <AppHeader showCommunityBadge feedbackZalo />
      </LanguageProvider>,
    );

    expect(screen.queryByRole("link", { name: "Feedback Zalo" })).toBeNull();
    expect(document.querySelector(".feedback-zalo-entry")).toBeNull();
    expect(document.querySelector(".app-header__badge-group")).not.toBeNull();
  });
});
