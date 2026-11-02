import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { VipZaloDetailEditor } from "./VipZaloDetailEditor";
import { emptyDetailTab, type VipZaloSlide } from "@/lib/vip-zalo-details";

vi.mock("@/components/admin-v3/connect/MediaUploadButton", () => ({ MediaUploadButton: ({ onUploaded }: { onUploaded: (u: string) => void }) => <button onClick={() => onUploaded("https://example.com/upload.png")}>Tải ảnh lên</button> }));
let result: VipZaloSlide[] = [];
function Harness() {
  const [tabs, setTabs] = useState<VipZaloSlide[]>([{ ...emptyDetailTab(), title: "Tiêu đề cũ", body: "Mô tả cũ" }]);
  result = tabs;
  return <VipZaloDetailEditor tabs={tabs} onChange={setTabs} />;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("Admin detail authoring", () => {
  it("adds, edits, reorders and removes tabs while keeping old fields", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm tab" }));
    fireEvent.change(screen.getByLabelText("Tên tab (quản lý)"), { target: { value: "Tab mới" } });
    fireEvent.change(screen.getByLabelText("URL ảnh nền"), { target: { value: "https://example.com/new.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Di chuyển tab lên" }));
    expect(result.map((t) => t.name)).toEqual(["Tab mới", ""]);
    expect(result[1]).toMatchObject({ title: "Tiêu đề cũ", body: "Mô tả cũ" });
    expect(result[0].image).toBe("https://example.com/new.png");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Xóa tab" }));
    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("Mô tả cũ");
  });
  it("creates more than two rows, edits, uploads, orders and deletes them", () => {
    render(<Harness />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Thêm hàng nội dung" }));
    const first = within(screen.getByRole("group", { name: "Hàng 1" }));
    fireEvent.change(first.getByLabelText("Tiêu đề hàng"), { target: { value: "Nội dung tự nhập" } });
    fireEvent.change(first.getByLabelText("Mô tả hàng"), { target: { value: "Mô tả tự nhập" } });
    fireEvent.click(first.getByRole("button", { name: "Tải ảnh lên" }));
    fireEvent.click(first.getByRole("button", { name: "Di chuyển hàng 1 xuống" }));
    expect(result[0].rows).toHaveLength(3);
    expect(result[0].rows?.[1]).toMatchObject({ icon: "https://example.com/upload.png", title: "Nội dung tự nhập", body: "Mô tả tự nhập" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Xóa hàng 2" }));
    expect(result[0].rows).toHaveLength(2);
  });
});