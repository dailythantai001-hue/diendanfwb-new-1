import { afterEach, expect, it, vi } from "vitest";
import { pinMobileScan } from "./nearby-scan-scroll";
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });
it("mobile brings the frame between fixed back controls and quota before locking, then restores the original position", () => {
  document.body.innerHTML = '<div class="app-header"></div><main><div class="pk-back-row"></div><div class="pk-card--scan"></div><div class="pk-bar"></div></main>';
  const page = document.querySelector("main"); if (!page) throw new Error("missing fixture");
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  vi.spyOn(window, "scrollY", "get").mockReturnValue(320);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(641);
  const rect = (selector: string, top: number, bottom: number) => {
    const node = document.querySelector(selector); if (!node) throw new Error("missing fixture");
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue({ top, bottom } as DOMRect);
  };
  rect(".app-header", 0, 56); rect(".pk-back-row", 64, 120); rect(".pk-bar", 560, 629); rect(".pk-card--scan", 1200, 1300);
  const frame = page.querySelector(".pk-card--scan"); if (!frame) throw new Error("missing frame");
  Object.defineProperty(frame, "offsetHeight", { value: 100 });
  const scroll = vi.spyOn(window, "scrollTo");
  const release = pinMobileScan(page);
  expect(scroll).toHaveBeenNthCalledWith(1, 0, 1230);
  expect(document.body.style.position).toBe("fixed");
  release();
  expect(scroll).toHaveBeenLastCalledWith(0, 320);
  expect(document.body.style.position).toBe("");
});
it("desktop page scrolling is untouched", () => {
  const scroll = vi.spyOn(window, "scrollTo");
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  pinMobileScan(document.body)();
  expect(scroll).not.toHaveBeenCalled();
  expect(document.body.style.position).toBe("");
});