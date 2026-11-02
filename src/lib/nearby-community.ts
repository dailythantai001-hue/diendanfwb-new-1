export const COMMUNITY_PAGE_SIZE = 20;
export type ScanSettings = { delay_seconds: number; hit_percent: number };
export type CommunityAccount = {
  id: string; full_name: string | null; display_name?: string | null;
  avatar: string | null; age: number | null; gender: string;
  province: string | null; intent: string | null;
  /** Quận/huyện hiển thị, luôn thuộc khu vực người quét đã lưu. */
  district?: string | null;
};
export type ScanStat = { user_id: string; total: number; hits: number; misses: number };

/** Each scan animation lasts exactly this long (independent of the server cooldown). */
export const SCAN_ANIMATION_MS = 10_000;
/** Scores at or below this are "không hợp"; hits always display above it. */
export const SCAN_THRESHOLD = 50;

/**
 * Linear progress (0–100) over SCAN_ANIMATION_MS. Holds at 99% until the server
 * result is ready, so the animation never completes before the real result.
 */
export function scanProgress(elapsedMs: number, ready: boolean): number {
  const p = Math.max(0, Math.min(100, (elapsedMs / SCAN_ANIMATION_MS) * 100));
  return ready ? p : Math.min(99, p);
}
/** The server (hit_percent) decides hit/miss; a hit is always shown above the threshold. */
export function hitDisplayScore(score: number): number {
  return Math.min(100, Math.max(SCAN_THRESHOLD + 1, Math.round(score)));
}

/** Display % for a HIT: independent uniform random integer in 51–100 (inclusive). Misses never get a %. */
export function randomHitScore(rnd: () => number = Math.random): number {
  const lo = SCAN_THRESHOLD + 1;
  return Math.min(100, lo + Math.floor(rnd() * (100 - lo + 1)));
}

/** A page may be filtered server-side; `last` is the raw keyset cursor (null = end of list). */
export type CommunityPage<T> = T[] | { items: T[]; last: string | null };

/**
 * Only an empty raw page proves exhaustion; errors never advance the cursor.
 * With `wrap`, reaching the end continues ONCE from the first account up to the
 * random `start`, so each account is offered at most once per session; already
 * scanned accounts are filtered out by the server from persistent history.
 */
export class CommunityPager<T extends { id: string }> {
  private cursor: string | null;
  private exhausted = false;
  private wrapped = false;
  private queue: T[] = [];
  private seen = new Set<string>();
  constructor(
    private fetchPage: (cursor: string | null) => Promise<CommunityPage<T>>,
    private opts: { wrap?: boolean; start?: string | null } = {},
  ) {
    this.cursor = opts.start ?? null;
  }
  async next(): Promise<T | null> {
    for (;;) {
      const next = this.queue.shift();
      if (next) {
        if (this.seen.has(next.id)) continue;
        this.seen.add(next.id);
        return next;
      }
      if (this.exhausted) return null;
      const raw = await this.fetchPage(this.cursor);
      const items = Array.isArray(raw) ? raw : raw.items;
      const last = Array.isArray(raw) ? (raw[raw.length - 1]?.id ?? null) : raw.last;
      if (!last) {
        if (this.opts.wrap && !this.wrapped && this.cursor !== null && this.opts.start) {
          // End of the list: cover the accounts before the random start once.
          this.wrapped = true;
          this.cursor = null;
          continue;
        }
        this.exhausted = true;
        return null;
      }
      if (last === this.cursor) throw new Error("Không thể tải trang kế tiếp. Vui lòng thử lại.");
      this.cursor = last;
      const start = this.opts.start;
      if (this.wrapped && start && last >= start) {
        // Second pass reached the starting point: everything after it was already covered.
        this.queue.push(...items.filter(i => i.id <= start));
        this.exhausted = true;
      } else this.queue.push(...items);
    }
  }
}

export function validateScanSettings(value: ScanSettings): ScanSettings {
  if (!Number.isFinite(value.delay_seconds) || value.delay_seconds < 0 || value.delay_seconds > 3600)
    throw new Error("Độ trễ phải từ 0 đến 3600 giây.");
  if (!Number.isFinite(value.hit_percent) || value.hit_percent < 0 || value.hit_percent > 100)
    throw new Error("Tỷ lệ trúng phải từ 0 đến 100%.");
  return value;
}
export function isRealScanUser(p: { account_source?: string | null; is_virtual?: boolean | null; is_seed_account?: boolean | null }) {
  return p.account_source !== "internal" && p.is_virtual !== true && p.is_seed_account !== true;
}

/** Profile fields returned only for a HIT result (nothing stored anywhere). */
export const SCAN_RESULT_FIELDS = "id,full_name,display_name,avatar,avatar_url,age,gender,province,intent";

/**
 * Supabase #1 profiles query for the scan pool: only FEMALE second accounts
 * (account_source = 'internal'), keyset-paginated by id. Pages carry ids only;
 * profile fields are read for a single verified candidate.
 */
export function femaleSecondAccountQuery(cursor: string | null, id?: string): string {
  const query = new URLSearchParams({
    select: id ? SCAN_RESULT_FIELDS : "id",
    account_source: "eq.internal",
    gender: "eq.female",
    order: "id.asc",
    limit: id ? "1" : String(COMMUNITY_PAGE_SIZE),
  });
  if (id) query.set("id", `eq.${id}`);
  else if (cursor) query.set("id", `gt.${cursor}`);
  return query.toString();
}
/** Same female + internal filter, for a set of ids (restoring today's hits). */
export function femaleSecondAccountsByIdsQuery(ids: string[]): string {
  return new URLSearchParams({
    select: SCAN_RESULT_FIELDS, account_source: "eq.internal", gender: "eq.female",
    id: `in.(${ids.join(",")})`, limit: String(Math.max(1, ids.length)),
  }).toString();
}

/** A result that was scanned today, as stored in SB2 history (ids + server hit/miss only). */
export type RecentScanRow = { candidate_id: string; hit: boolean; scanned_at: string };
/** Start of the current scan day (Asia/Ho_Chi_Minh, UTC+7) as ISO, same day as the 30/day counter. */
export function scanDayStartIso(now = Date.now()): string {
  const d = new Date(now + 7 * 3600_000);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - 7 * 3600_000).toISOString();
}
/** Misses stay visible only for the animation + 3 s; hits stay for the scan day. */
export const MISS_VISIBLE_MS = 3000;
export function isRecentRowVisible(row: RecentScanRow, now: number): boolean {
  if (row.hit) return true;
  return Date.parse(row.scanned_at) + SCAN_ANIMATION_MS + MISS_VISIBLE_MS > now;
}
