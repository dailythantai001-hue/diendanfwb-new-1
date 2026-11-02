import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  menuOpen: true, canDelete: true, isPostOwner: true,
  openPostMenu: vi.fn(), setMenuOpen: vi.fn(), copyUrl: vi.fn(), copyUid: vi.fn(),
  startEdit: vi.fn(), removePost: vi.fn(), openReport: vi.fn(),
}));
vi.mock("./post-card-context", () => ({ usePostCard: () => state }));
import { PostMenu } from "./PostMenu";
beforeEach(() => { vi.clearAllMocks(); state.canDelete = true; state.isPostOwner = true; });
afterEach(cleanup);
it("retains link, UID and delete operations without invoking edit", async () => {
  render(<PostMenu />);
  fireEvent.click(await screen.findByRole("button", { name: "Sao chép liên kết" }));
  fireEvent.click(screen.getByRole("button", { name: "Sao chép Post UID" }));
  fireEvent.click(screen.getByRole("button", { name: "Xóa bài viết" }));
  expect(state.copyUrl).toHaveBeenCalledOnce();
  expect(state.copyUid).toHaveBeenCalledOnce();
  expect(state.removePost).toHaveBeenCalledOnce();
  expect(state.startEdit).not.toHaveBeenCalled();
});
it("retains non-owner report permissions without allowing delete or edit", async () => {
  state.canDelete = false; state.isPostOwner = false;
  render(<PostMenu />);
  const report = await screen.findByRole("button", { name: "Tố cáo nhận thưởng" });
  for (const button of screen.getAllByRole("button")) fireEvent.click(button);
  expect(state.openReport).toHaveBeenCalledOnce();
  expect(state.removePost).not.toHaveBeenCalled();
  expect(state.startEdit).not.toHaveBeenCalled();
  expect(report).toBeDefined();
});