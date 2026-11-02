import { describe, expect, it } from "vitest";
import { emptyDetailRow, emptyDetailTab, moveDetailItem, normalizeDetailTab } from "./vip-zalo-details";

describe("VIP ZALO detail data", () => {
  it("keeps old title, body and image without inventing rows", () => {
    const old = { title: "Đã lưu", body: "  Nội dung cũ\nDòng 2  ", image: "data:image/png;base64,old" };
    expect(normalizeDetailTab(old)).toMatchObject({ ...old, rows: [] });
  });
  it("keeps independent banners and all rows after JSON save/read", () => {
    const tabs = [0, 1].map((i) => ({ ...emptyDetailTab(), name: `Tab ${i}`, image: `https://example.com/banner-${i}.png`, rows: Array.from({ length: 4 }, (_, j) => ({ ...emptyDetailRow(), icon: `https://example.com/icon-${j}.png`, title: `Hàng ${j}`, body: `Nội dung ${j}` })) }));
    expect(JSON.parse(JSON.stringify(tabs)).map(normalizeDetailTab)).toEqual(tabs);
    expect(tabs.map((t) => t.rows?.length)).toEqual([4, 4]);
  });
  it("preserves empty authored tabs and rows", () => {
    const tab = { ...emptyDetailTab(), rows: [emptyDetailRow()] };
    expect(normalizeDetailTab(tab)).toEqual(tab);
  });
  it("reorders tabs and rows without losing content", () => {
    const items = [{ id: "a", body: "A" }, { id: "b", body: "B" }, { id: "c", body: "C" }];
    expect(moveDetailItem(items, 1, -1)).toEqual([items[1], items[0], items[2]]);
    expect(moveDetailItem(items, 1, 1)).toEqual([items[0], items[2], items[1]]);
    expect(moveDetailItem(items, 0, -1)).toEqual(items);
  });
});