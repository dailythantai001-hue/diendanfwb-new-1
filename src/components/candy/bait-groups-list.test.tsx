import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
vi.mock("@/lib/bait-groups-cache", () => ({ fetchBaitGroups: async () => ({groups:[{id:"group",name:"Group original",province:null,member_count:10,info_text:"Original info"}]}) }));
vi.mock("./group-card", () => ({ GroupCard: ({name,onOpen}: {name:string;onOpen:()=>void}) => <button onClick={onOpen}>{name}</button> }));
vi.mock("./vip-required-popup", () => ({ VipRequiredPopup: ({open,onClose}: {open:boolean;onClose:()=>void}) => open ? <div role="dialog" aria-label="VIP ZALO"><button onClick={onClose}>TRỞ LẠI</button></div> : null }));
import { BaitGroupsList } from "./bait-groups-list";
it("join keeps group information mounted under VIP and restores it on Back", async () => {
  render(<BaitGroupsList />);
  fireEvent.click(await screen.findByRole("button",{name:"Group original"}));
  const info=screen.getByText("Original info");
  fireEvent.click(screen.getByRole("button",{name:/Tham Gia Ngay/}));
  expect(screen.getByRole("dialog",{name:"VIP ZALO"})).toBeTruthy();
  expect(screen.getByText("Original info")).toBe(info);
  fireEvent.click(screen.getByRole("button",{name:"TRỞ LẠI"}));
  expect(screen.getByText("Original info")).toBe(info); cleanup();
});