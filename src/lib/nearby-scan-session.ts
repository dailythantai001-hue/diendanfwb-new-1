// Scan results for the current browser session, keyed by the signed-in user's id.
// Lives outside the React tree so switching tabs (unmount/remount) keeps cards and
// in-flight scans. It is only a view cache: after a reload the server restores
// today's results from Supabase #2 history (see openCommunityScan.recent).
import { useSyncExternalStore } from "react";
import { MISS_VISIBLE_MS, SCAN_ANIMATION_MS, isRecentRowVisible, type CommunityAccount } from "./nearby-community";
import type { ResultPosition, ScanQuota } from "./scan-v2";
import type { NeedFilter } from "./nearby-scan";

export interface ScanRow {
  id: string; name: string; avatar: string | null; age: number;
  gender: string | null; need: NeedFilter | null; province: string | null;
  district?: string | null;
}
export type DoneCard =
  | { key: string; status: "success"; row: ScanRow; score: number; scannedAt: number }
  | { key: string; status: "fail"; shownAt: number };
/** `result` is the server's decision, revealed only when the 10 s animation ends. */
export type ScanCard = DoneCard | { key: string; status: "scanning"; startedAt: number; result?: DoneCard; readyAt?: number };

export interface ScanSession {
  cards: ScanCard[];
  busy: boolean;
  /** Server cooldown (admin "độ trễ"): next scan allowed at this time. */
  cooldownUntil: number;
  /** Server results for this user were merged into this session (once per page load). */
  restored: boolean;
  position?: ResultPosition;
  resultsLoading?: boolean;
  quota?: ScanQuota;
}
const EMPTY: ScanSession = Object.freeze({ cards: [], busy: false, cooldownUntil: 0, restored: false }) as ScanSession;
const sessions = new Map<string, ScanSession>();
const listeners = new Set<() => void>();

export function getScanSession(uid: string | null | undefined): ScanSession {
  return (uid && sessions.get(uid)) || EMPTY;
}
export function updateScanSession(uid: string, fn: (s: ScanSession) => ScanSession) {
  sessions.set(uid, fn(getScanSession(uid)));
  listeners.forEach(l => l());
}
export function resetScanSessions() { sessions.clear(); listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function useScanSession(uid: string | null | undefined): ScanSession {
  return useSyncExternalStore(subscribe, () => getScanSession(uid), () => EMPTY);
}

/** A miss is visible for exactly MISS_VISIBLE_MS after it is shown. */
export function isCardVisible(c: ScanCard, now: number): boolean {
  return c.status !== "fail" || c.shownAt + MISS_VISIBLE_MS > now;
}
/** Reveal the server result once the animation is over (a miss starts its 3 s from then). */
export function revealCard(c: ScanCard, now: () => number = Date.now): ScanCard {
  if (c.status !== "scanning" || !c.result) return c;
  if (c.result.status !== "fail") return c.result;
  // Normally revealed right at the end of the animation; if revealed late (tab was away),
  // the 3 s still count from when it should have appeared.
  return { ...c.result, shownAt: Math.min(now(), Math.max(c.startedAt + SCAN_ANIMATION_MS, c.readyAt ?? 0)) };
}

type RecentRow = { candidate_id: string; hit: boolean; scanned_at: string; person: CommunityAccount | null };
/**
 * Cards for today's server history rows. `serverNow` aligns timers with the server clock.
 * A scan still inside its 10 s animation is restored as "scanning" with its known result.
 */
export function cardsFromRecent(
  rows: RecentRow[], serverNow: number, clientNow: number,
  toSuccess: (p: CommunityAccount, key: string, scannedAt: number) => DoneCard,
): ScanCard[] {
  const skew = clientNow - serverNow;
  const out: ScanCard[] = [];
  for (const r of rows) {
    if (!isRecentRowVisible(r, serverNow)) continue;
    const at = Date.parse(r.scanned_at) + skew;
    const key = `restored:${r.candidate_id}`;
    const result: DoneCard | null = r.hit
      ? (r.person ? toSuccess(r.person, key, at) : null)
      : { key, status: "fail", shownAt: at + SCAN_ANIMATION_MS };
    if (!result) continue;
    out.push(at + SCAN_ANIMATION_MS > clientNow ? { key, status: "scanning", startedAt: at, result, readyAt: at } : result);
  }
  return out;
}

// ---- Scan-age label (Vietnam calendar days, from the server-stored scan time) ----
const vnDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
function vnDayNumber(ms: number): number {
  const [y, m, d] = vnDayFmt.format(ms).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}
/** Whole Vietnam-calendar days between the scan and now (0 = scanned today). */
export function scanAgeDays(scannedAt: number, now: number = Date.now()): number {
  return Math.max(0, vnDayNumber(now) - vnDayNumber(scannedAt));
}
/** Label for a result card: NEW (today, red), "1N trước" (green), "NN trước" (blue). */
export function scanAgeLabel(scannedAt: number, now: number = Date.now()): { text: string; tone: "new" | "d1" | "old" } {
  const days = scanAgeDays(scannedAt, now);
  if (days <= 0) return { text: "NEW", tone: "new" };
  if (days === 1) return { text: "1N trước", tone: "d1" };
  return { text: `${days}N trước`, tone: "old" };
}

/** Preserve in-flight results and deduplicate by candidate, not presentation key. */
export function mergeResultCards(existing: ScanCard[], incoming: ScanCard[]): ScanCard[] {
  const ids = new Set(existing.flatMap(c => c.status === "success" ? [c.row.id] : c.status === "scanning" && c.result?.status === "success" ? [c.result.row.id] : []));
  const merged = [...existing];
  for (const c of incoming) {
    const id = c.status === "success" ? c.row.id : c.status === "scanning" && c.result?.status === "success" ? c.result.row.id : null;
    if (id && ids.has(id)) continue;
    if (id) ids.add(id);
    merged.push(c);
  }
  return merged;
}
