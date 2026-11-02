import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ page: vi.fn(), run: vi.fn(), open: vi.fn(), save: vi.fn(), read: vi.fn(), refresh: vi.fn(), results: vi.fn(), claim: vi.fn(), history: vi.fn(), historyTotals: vi.fn(), friend: vi.fn(), uid: { current: "real-1" } }));
const toasts = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("sonner", () => toasts);
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/nearby-community.functions", () => ({ communityScanPage: calls.page, runCommunityScan: calls.run, openCommunityScan: calls.open, readScanConfig: calls.read, refreshCommunityQuota: calls.refresh, communityResultsPage: calls.results, claimScanGift: calls.claim, communityHistory: calls.history, communityHistoryTotals: calls.historyTotals }));
vi.mock("@/lib/nearby-community-auth", () => ({ scanAuthHeaders: async () => ({}) }));
vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => ({ me: { id: calls.uid.current, province: "Hà Nội" } }) }));
vi.mock("@/lib/nearby-filters-store", async () => { const { DEFAULT_FILTERS } = await import("@/lib/nearby-scan"); return { cachedFilters: () => DEFAULT_FILTERS, loadFilters: async () => DEFAULT_FILTERS, saveFilters: calls.save }; });
vi.mock("@/lib/crm-community-vip", () => ({ zaloLogoUrl: async () => null }));
vi.mock("@/lib/fwb-matches", () => ({ sendConnectionRequest: calls.friend }));
vi.mock("@/components/vip/clone-vip-name-media", () => ({ CloneVipNameMedia: () => null }));
import { SearchPage } from "./search-page";
import { getScanSession, resetScanSessions } from "@/lib/nearby-scan-session";
import { SCAN_CONFIG_MSG, type ScanFilters } from "@/lib/nearby-scan";
let clock = 0;
beforeEach(() => {
  // Each animation frame advances a virtual clock by 2 s, so the 10 s scan runs in ~5 frames.
  clock = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(clock += 2000), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  calls.uid.current = "real-1";
  calls.historyTotals.mockResolvedValue({ total: 23, hits: 10, misses: 12, unknown: 1 });
  calls.save.mockImplementation(async (f: ScanFilters) => ({ saved: f, error: null }));
  calls.read.mockImplementation(async () => ({ filters: saved, configured: true, configError: null }));
  resetScanSessions();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const person = { id: "female-1", full_name: "Cộng đồng 1", avatar: null, gender: "female", age: 25, province: "Hà Nội", intent: "fwb" };
const saved: ScanFilters = { genders: [], ageMin: 20, ageMax: 35, needs: ["fwb"], distMin: 50, distMax: 100, bodies: ["fit"], districts: [] };
const pageOf = (...ids: string[]) => ({ items: ids.map(id => ({ id })), last: ids[ids.length - 1] ?? null });
type Opened = { filters?: ScanFilters | null; configured?: boolean; configError?: string | null; recent?: unknown[] | null; now?: number };
function opened(o: Opened = {}) {
  return { settings: { delay_seconds: 0, hit_percent: 50 }, stats: { mode: "lifetime", claimed: true, limit: 20, used: 0, remaining: 20, total: 0, hits: 0, misses: 0 }, filters: saved, configured: true, configError: null, recent: [], now: Date.now(), ...o };
}
async function start(o?: Opened) {
  calls.open.mockResolvedValue(opened(o));
  const view = render(<SearchPage onViewProfile={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Quét gần đây" })).not.toBeDisabled());
  return view;
}
const scanBtn = () => screen.getByRole("button", { name: "Quét gần đây" });
const gear = () => screen.getByRole("button", { name: "Cài đặt" });

it("no saved config: scanning is blocked with the message and the gear glows", async () => {
  await start({ filters: null, configured: false });
  expect(gear()).toHaveClass("pk-gear--attention");
  fireEvent.click(scanBtn());
  expect(toasts.toast.error).toHaveBeenCalledWith(SCAN_CONFIG_MSG);
  expect(calls.run).not.toHaveBeenCalled();
  expect(calls.page).not.toHaveBeenCalled();
});
it("saving a complete config clears the glow and then allows scanning", async () => {
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockResolvedValueOnce({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 });
  await start({ filters: null, configured: false });
  fireEvent.click(gear());
  fireEvent.click(screen.getByRole("button", { name: "FWB" }));
  fireEvent.click(screen.getByRole("button", { name: "Cân đối" }));
  fireEvent.click(screen.getByRole("button", { name: "LƯU CÀI ĐẶT" }));
  await waitFor(() => expect(calls.save).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(gear()).not.toHaveClass("pk-gear--attention"));
  fireEvent.click(scanBtn());
  await screen.findByText("Cộng đồng 1");
  expect(calls.run).toHaveBeenCalledTimes(1);
});
it("an incomplete config (no Vóc dáng) cannot be saved", async () => {
  await start({ filters: null, configured: false });
  fireEvent.click(gear());
  fireEvent.click(screen.getByRole("button", { name: "FWB" }));
  fireEvent.click(screen.getByRole("button", { name: "LƯU CÀI ĐẶT" }));
  await waitFor(() => expect(toasts.toast.error).toHaveBeenCalledWith(SCAN_CONFIG_MSG));
  expect(calls.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  expect(gear()).toHaveClass("pk-gear--attention");
});
it("a hit shows no account-type line, scores above 50% and a distance inside the saved 50–100 km", async () => {
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockResolvedValueOnce({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 });
  await start();
  fireEvent.click(scanBtn());
  await screen.findByText("Cộng đồng 1");
  expect(screen.queryByText(/Tài khoản cộng đồng|tài khoản thứ hai/i)).toBeNull();
  expect(Number(screen.getByText(/% phù hợp/).textContent?.replace(/\D/g, ""))).toBeGreaterThan(50);
  const km = Number(/(\d+) km/.exec(screen.getByText(/km/).textContent ?? "")?.[1]);
  expect(km).toBeGreaterThanOrEqual(50);
  expect(km).toBeLessThanOrEqual(100);
  expect(screen.getByText("19")).toBeInTheDocument();
});
it("a miss shows 'NGƯỜI NÀY KHÔNG HỢP' then removes itself after 3 seconds", async () => {
  calls.page.mockResolvedValueOnce(pageOf("female-2"));
  calls.run.mockResolvedValueOnce({ person: null, hit: false, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 0, misses: 1, delay_seconds: 0 });
  await start();
  fireEvent.click(scanBtn());
  await screen.findByText("NGƯỜI NÀY KHÔNG HỢP");
  const shownAt = Date.now();
  await waitFor(() => expect(screen.queryByText("NGƯỜI NÀY KHÔNG HỢP")).toBeNull(), { timeout: 5000 });
  expect(Date.now() - shownAt).toBeGreaterThanOrEqual(2900);
}, 10000);
it("switching tabs (unmount + remount) keeps the found person without a new scan", async () => {
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockResolvedValueOnce({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 });
  const view = await start();
  fireEvent.click(scanBtn());
  await screen.findByText("Cộng đồng 1");
  view.unmount();
  await start({ recent: [] });
  expect(screen.getByText("Cộng đồng 1")).toBeInTheDocument();
  expect(calls.run).toHaveBeenCalledTimes(1);
});
it("a scan still running when leaving the tab finishes and shows its result on return", async () => {
  let resolve: (v: unknown) => void = () => {};
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const view = await start();
  fireEvent.click(scanBtn());
  await waitFor(() => expect(calls.run).toHaveBeenCalled());
  view.unmount();
  resolve({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 });
  calls.open.mockResolvedValue(opened());
  render(<SearchPage onViewProfile={() => {}} />);
  await screen.findByText("Cộng đồng 1");
});
it("after a reload, today's server results for this user are restored", async () => {
  await start({ recent: [{ candidate_id: "female-1", hit: true, scanned_at: new Date(Date.now() - 60_000).toISOString(), person }] });
  expect(await screen.findByText("Cộng đồng 1")).toBeInTheDocument();
  expect(calls.run).not.toHaveBeenCalled();
});
it("user B never sees user A's results", async () => {
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockResolvedValueOnce({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 });
  const view = await start();
  fireEvent.click(scanBtn());
  await screen.findByText("Cộng đồng 1");
  view.unmount();
  calls.uid.current = "real-2";
  await start({ recent: [] });
  expect(screen.queryByText("Cộng đồng 1")).toBeNull();
});
it("the scan card waits for the server result and never reveals a result on its own", async () => {
  let resolve: (v: unknown) => void = () => {};
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  await start();
  fireEvent.click(scanBtn());
  await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99"));
  expect(screen.queryByText("NGƯỜI NÀY KHÔNG HỢP")).toBeNull();
  resolve({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 });
  await screen.findByText("Cộng đồng 1");
});
it("retries a failed page and never treats it as exhaustion", async () => {
  calls.page.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockResolvedValueOnce({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 });
  await start();
  fireEvent.click(scanBtn());
  await waitFor(() => expect(calls.page).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(scanBtn()).not.toBeDisabled());
  expect(calls.run).not.toHaveBeenCalled();
  fireEvent.click(scanBtn());
  await screen.findByText("Cộng đồng 1");
  expect(calls.page).toHaveBeenCalledTimes(2);
});
it("an unreadable saved config shows its specific reason instead of 'please configure'", async () => {
  const reason = "Supabase #1 chưa có bảng lưu cấu hình quét (nearby_filters). Hãy chạy file SQL RUN_NOW_2026-10-30_nearby_filters.sql trên Supabase #1.";
  await start({ filters: null, configured: false, configError: reason });
  expect(screen.getByRole("alert")).toHaveTextContent(reason);
  fireEvent.click(scanBtn());
  expect(toasts.toast.error).toHaveBeenCalledWith(reason);
  expect(toasts.toast.error).not.toHaveBeenCalledWith(SCAN_CONFIG_MSG);
  expect(calls.run).not.toHaveBeenCalled();
});
it("a failed save reports the save error and never shows success", async () => {
  calls.save.mockResolvedValueOnce({ saved: null, error: "Supabase #1 từ chối quyền lưu cấu hình quét cho tài khoản này." });
  await start({ filters: null, configured: false });
  fireEvent.click(gear());
  fireEvent.click(screen.getByRole("button", { name: "FWB" }));
  fireEvent.click(screen.getByRole("button", { name: "Cân đối" }));
  fireEvent.click(screen.getByRole("button", { name: "LƯU CÀI ĐẶT" }));
  await waitFor(() => expect(toasts.toast.error).toHaveBeenCalledWith("Supabase #1 từ chối quyền lưu cấu hình quét cho tài khoản này."));
  expect(toasts.toast.success).not.toHaveBeenCalled();
  expect(calls.read).not.toHaveBeenCalled();
});
it("save succeeds only after the server reads the saved config back", async () => {
  calls.read.mockResolvedValueOnce({ filters: null, configured: false, configError: null });
  await start({ filters: null, configured: false });
  fireEvent.click(gear());
  fireEvent.click(screen.getByRole("button", { name: "FWB" }));
  fireEvent.click(screen.getByRole("button", { name: "Cân đối" }));
  fireEvent.click(screen.getByRole("button", { name: "LƯU CÀI ĐẶT" }));
  await waitFor(() => expect(calls.read).toHaveBeenCalledTimes(1));
  expect(toasts.toast.success).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  expect(gear()).toHaveClass("pk-gear--attention");
});

it("shows a large TRỞ VỀ button above the title that calls onBack", async () => {
  const onBack = vi.fn();
  calls.open.mockResolvedValue(opened());
  render(<SearchPage onViewProfile={() => {}} onBack={onBack} />);
  const back = await screen.findByRole("button", { name: "Trở về Kênh Thế Giới" });
  expect(back).toHaveTextContent("TRỞ VỀ");
  fireEvent.click(back);
  expect(onBack).toHaveBeenCalledTimes(1);
});

it("omits the TRỞ VỀ button when no onBack handler is given", async () => {
  await start();
  expect(screen.queryByRole("button", { name: "Trở về Kênh Thế Giới" })).toBeNull();
});

it("blocks every Search action during the scan and unlocks them only after reveal", async () => {
  let resolve: (v: unknown) => void = () => {};
  const onBack = vi.fn(), onViewProfile = vi.fn(), onOpenChat = vi.fn();
  calls.page.mockResolvedValueOnce(pageOf("female-2"));
  calls.run.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  calls.open.mockResolvedValue(opened({ recent: [{ candidate_id: person.id, hit: true, scanned_at: new Date(Date.now() - 60_000).toISOString(), person }] }));
  render(<SearchPage onBack={onBack} onViewProfile={onViewProfile} onOpenChat={onOpenChat} />);
  await screen.findByText(person.full_name);
  fireEvent.click(scanBtn());
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(1));
  const controls = screen.getAllByRole("button");
  for (const control of controls) {
    expect(control).toBeDisabled();
    fireEvent.click(control);
    fireEvent.pointerDown(control);
    fireEvent.keyDown(control, { key: "Enter" });
    fireEvent.keyUp(control, { key: " " });
  }
  expect(onBack).not.toHaveBeenCalled();
  expect(onViewProfile).not.toHaveBeenCalled();
  expect(onOpenChat).not.toHaveBeenCalled();
  expect(calls.friend).not.toHaveBeenCalled();
  expect(calls.run).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
  const before = getScanSession("real-1");
  fireEvent.scroll(window, { target: { scrollY: 500 } });
  expect(getScanSession("real-1")).toBe(before);
  await act(async () => { resolve({ person: { ...person, id: "female-2" }, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 }); });
  await waitFor(() => expect(scanBtn()).not.toBeDisabled());
  expect(getScanSession("real-1").busy).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Trở về Kênh Thế Giới" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Nhắn tin" })[0]);
  fireEvent.click(gear());
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onOpenChat).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("locks page scroll during the scan and restores it when the scan ends", async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  let resolve: (v: unknown) => void = () => {};
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  await start();
  vi.stubGlobal("scrollY", 320);
  const scrollTo = vi.spyOn(window, "scrollTo");
  fireEvent.click(scanBtn());
  await waitFor(() => expect(calls.run).toHaveBeenCalledTimes(1));
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.body.style.position).toBe("fixed");
  expect(document.body.style.top).toBe("-320px");
  expect(document.documentElement.style.overflow).toBe("hidden");
  // touch attempts cannot scroll the pinned page (default is prevented)
  const touch = new Event("touchmove", { cancelable: true, bubbles: true });
  document.body.dispatchEvent(touch);
  expect(touch.defaultPrevented).toBe(true);
  await act(async () => { resolve({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 }); });
  await waitFor(() => expect(scanBtn()).not.toBeDisabled());
  expect(document.body.style.overflow).toBe("");
  expect(document.body.style.position).toBe("");
  expect(document.body.style.top).toBe("");
  expect(document.documentElement.style.overflow).toBe("");
  expect(scrollTo).toHaveBeenCalledWith(0, 320);
});

it("history uses server totals including older scans and opening it never consumes a scan", async () => {
  calls.history.mockResolvedValue({ rows: [
    { candidate_id: "female-1", hit: true, scanned_at: "2026-11-02T03:00:00Z", person },
    { candidate_id: "female-2", hit: false, scanned_at: "2026-11-01T03:00:00Z", person: null },
    { candidate_id: "female-3", hit: null, scanned_at: "2026-10-01T03:00:00Z", person: null },
  ], totals: { total: 23, hits: 10, misses: 12, unknown: 1 }, until: "2026-11-02T04:00:00Z", cursor: null, hasMore: false });
  await start();
  await screen.findByText("Đã quét: 23");
  fireEvent.click(screen.getByRole("button", { name: "Lịch sử quét" }));
  await screen.findByText("Không tìm thấy ai");
  expect(screen.getByText("Chưa xác định")).toBeInTheDocument();
  expect(screen.getByText(/10:00:00.*02\/11\/2026/)).toBeInTheDocument();
  expect(calls.history).toHaveBeenCalledWith({ data: { cursor: null, until: null }, headers: {} });
  expect(calls.run).not.toHaveBeenCalled();
  expect(calls.claim).not.toHaveBeenCalled();
  expect(getScanSession("real-1").quota?.remaining).toBe(20);
});

it("releases every control when a scan request fails", async () => {
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockRejectedValueOnce(new Error("Mất kết nối"));
  calls.open.mockResolvedValue(opened());
  render(<SearchPage onViewProfile={() => {}} onBack={() => {}} />);
  await waitFor(() => expect(scanBtn()).not.toBeDisabled());
  fireEvent.click(scanBtn());
  await waitFor(() => expect(toasts.toast.error).toHaveBeenCalledWith("Mất kết nối"));
  for (const control of screen.getAllByRole("button")) expect(control).not.toBeDisabled();
  expect(getScanSession("real-1").busy).toBe(false);
  expect(getScanSession("real-1").cards).toHaveLength(0);
});

it("unlocks a stalled connection and ignores a late response without inventing a result", async () => {
  let resolve: (v: unknown) => void = () => {};
  calls.page.mockResolvedValueOnce(pageOf("female-1"));
  calls.run.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  await start();
  vi.useFakeTimers();
  fireEvent.click(scanBtn());
  await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
  expect(calls.run).toHaveBeenCalledTimes(1);
  expect(getScanSession("real-1").busy).toBe(false);
  expect(scanBtn()).not.toBeDisabled();
  expect(gear()).not.toBeDisabled();
  await act(async () => { resolve({ person, hit: true, mode: "lifetime", claimed: true, limit: 20, used: 1, remaining: 19, total: 1, hits: 1, misses: 0, delay_seconds: 0 }); });
  expect(getScanSession("real-1").cards).toHaveLength(0);
});

it("lifetime quota: 12 used shows 8 left; 20 used locks scanning even after reload", async () => {
  const stats = { mode: "lifetime", claimed: true, limit: 20, used: 12, remaining: 8, total: 12, hits: 7, misses: 5 };
  calls.open.mockResolvedValue({ ...opened(), stats });
  const view = render(<SearchPage onViewProfile={() => {}} />);
  await waitFor(() => expect(getScanSession("real-1").quota?.remaining).toBe(8));
  expect(scanBtn()).not.toBeDisabled();
  view.unmount(); resetScanSessions();
  calls.open.mockResolvedValue({ ...opened(), stats: { ...stats, used: 20, remaining: 0, total: 20, hits: 15 } });
  render(<SearchPage onViewProfile={() => {}} />);
  await waitFor(() => expect(getScanSession("real-1").quota?.remaining).toBe(0));
  expect(scanBtn()).toBeDisabled();
});
it("loads every result page beyond 500 using the original snapshot and keeps cursor across remount", async () => {
  const until = "2026-11-01T05:00:00Z";
  const rows = (lo: number, hi: number) => Array.from({ length: hi-lo }, (_, n) => ({ candidate_id: `f${lo+n}`, hit: true, scanned_at: "2026-10-31T05:00:00Z", person: { ...person, id: `f${lo+n}`, full_name: `Account ${lo+n}` } }));
  const pos = (n: number, hasMore: boolean) => ({ source: "v2", until, cursor: { scanned_at: "2026-10-31T05:00:00Z", candidate_id: `f${n}` }, hasMore });
  calls.open.mockResolvedValue({ ...opened({ recent: rows(0,100) }), position: pos(99,true) });
  calls.results.mockImplementation(async ({ data }: any) => {
    expect(data.until).toBe(until);
    const lo = Number(data.cursor.candidate_id.slice(1))+1, hi = Math.min(lo+100,601);
    return { rows: rows(lo,hi), position: pos(hi-1,hi<601) };
  });
  const view = render(<SearchPage onViewProfile={() => {}} />);
  await waitFor(() => expect(getScanSession("real-1").cards).toHaveLength(100));
  for (let n=0;n<6;n++) {
    const load = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === "Tải thêm kết quả");
    expect(load).toBeDefined();
    if (!load) throw new Error("Missing continuation control");
    await act(async () => fireEvent.click(load));
    await waitFor(() => expect(getScanSession("real-1").cards).toHaveLength(Math.min(200+n*100,601)));
  }
  expect(calls.results).toHaveBeenCalledTimes(6);
  expect(Array.from(view.container.querySelectorAll('button')).find(b => b.textContent === "Tải thêm kết quả")).toBeUndefined();
  view.unmount(); render(<SearchPage onViewProfile={() => {}} />);
  await screen.findByText("Account 600");
  expect(getScanSession("real-1").cards).toHaveLength(601);
}, 30000);

const unclaimed = { mode: "lifetime", claimed: false, limit: 20, used: 0, remaining: 0, total: 0, hits: 0, misses: 0 };
const fresh = { mode: "lifetime", claimed: true, limit: 20, used: 0, remaining: 20, total: 0, hits: 0, misses: 0 };
it("first visit: gift intro runs only after the server confirms the grant, counts to +20, then opens Search", async () => {
  calls.open.mockResolvedValue({ ...opened(), stats: unclaimed });
  calls.claim.mockResolvedValue({ quota: fresh, grantedNow: true });
  render(<SearchPage onViewProfile={() => {}} />);
  expect(await screen.findByText(/ADMIN TẶNG BẠN 20 LƯỢT QUÉT TÌM BẠN!/)).toBeInTheDocument();
  expect(await screen.findByText("+20", {}, { timeout: 6000 })).toBeInTheDocument();
  await waitFor(() => expect(scanBtn()).not.toBeDisabled(), { timeout: 4000 });
  expect(calls.claim).toHaveBeenCalledTimes(1);
  expect(getScanSession("real-1").quota?.remaining).toBe(20);
}, 12000);
it("already claimed (reload / other device): no intro and no new claim", async () => {
  await start();
  expect(calls.claim).not.toHaveBeenCalled();
  expect(screen.queryByText(/ADMIN TẶNG BẠN/)).toBeNull();
});
it("claim answered 'already granted' (race with another device): no intro", async () => {
  calls.open.mockResolvedValue({ ...opened(), stats: unclaimed });
  calls.claim.mockResolvedValue({ quota: { ...fresh, used: 5, remaining: 15, total: 5, hits: 2, misses: 3 }, grantedNow: false });
  render(<SearchPage onViewProfile={() => {}} />);
  await waitFor(() => expect(getScanSession("real-1").quota?.remaining).toBe(15));
  expect(screen.queryByText(/ADMIN TẶNG BẠN/)).toBeNull();
});
it("server refusing the claim shows no fake intro and no scans", async () => {
  calls.open.mockResolvedValue({ ...opened(), stats: unclaimed });
  calls.claim.mockRejectedValue(new Error("Chức năng quét đang tạm dừng."));
  render(<SearchPage onViewProfile={() => {}} />);
  await waitFor(() => expect(screen.getByText("Chức năng quét đang tạm dừng.")).toBeInTheDocument());
  expect(screen.queryByText(/ADMIN TẶNG BẠN/)).toBeNull();
  expect(getScanSession("real-1").quota).toBeFalsy();
});
it("all 20 used: scanning locked with the agreed message", async () => {
  calls.open.mockResolvedValue({ ...opened(), stats: { ...fresh, used: 20, remaining: 0, total: 20, hits: 9, misses: 11 } });
  render(<SearchPage onViewProfile={() => {}} />);
  expect(await screen.findByText("Bạn đã sử dụng hết 20 lượt quét tìm bạn.")).toBeInTheDocument();
  expect(scanBtn()).toBeDisabled();
});
