import { SUPABASE_INSTANCES } from "@/lib/db/config";
import { femaleSecondAccountQuery, femaleSecondAccountsByIdsQuery, isRealScanUser, isRecentRowVisible, type CommunityAccount, type RecentScanRow } from "./nearby-community";
import { cursorSchema, parseQuota, parseGiftClaim, type ResultCursor, type ResultPosition, type ScanQuota } from "./scan-v2";
import { normalizeFilters, type ScanFilters } from "./nearby-scan";
import { SCAN_FILTERS_TABLE_MISSING_MSG, SCAN_SESSION_EXPIRED_MSG } from "./nearby-scan-errors";
import { historyRowsSchema, type ScanHistoryPage, type ScanHistoryTotals } from "./nearby-scan-history";

function credentialHeaders(key: string, token?: string) {
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}
export async function primaryRead(path: string, token: string, extra: RequestInit = {}) {
  const cfg = SUPABASE_INSTANCES.primary;
  const r = await fetch(`${cfg.url}/${path}`, { ...extra, headers: { ...credentialHeaders(cfg.anonKey, token), ...extra.headers } });
  if (!r.ok) throw new Error(await primaryErrorMessage(path, r));
  return r;
}
/** Specific, payload-free reason for a failed SB1 request (never a blanket "please sign in again"). */
async function primaryErrorMessage(path: string, r: Response): Promise<string> {
  if (path.startsWith("auth/v1/") && (r.status === 401 || r.status === 403))
    return SCAN_SESSION_EXPIRED_MSG;
  const body = r.status === 404 ? await r.json().catch(() => null) as { code?: string } | null : null;
  if (body?.code === "PGRST205" && path.startsWith("rest/v1/nearby_filters"))
    return SCAN_FILTERS_TABLE_MISSING_MSG;
  if (r.status === 401 || r.status === 403) return "Supabase #1 từ chối quyền đọc dữ liệu quét của tài khoản này.";
  return "Không đọc được dữ liệu quét từ Supabase #1. Vui lòng thử lại.";
}
export async function scanIdentity(token: string, admin = false): Promise<string> {
  const user = await (await primaryRead("auth/v1/user", token)).json() as { id?: string };
  if (!user.id) throw new Error("Vui lòng đăng nhập lại.");
  if (admin) {
    const rows = await (await primaryRead(`rest/v1/bangchu?auth_user_id=eq.${user.id}&select=status,is_active&limit=1`, token)).json() as Array<{ status: string; is_active: boolean }>;
    if (rows.some(r => r.status === "approved" && r.is_active)) return user.id;
    const roles = await (await primaryRead(`rest/v1/user_roles?user_id=eq.${user.id}&select=role`, token)).json() as Array<{ role: string }>;
    if (!roles.some(r => ["admin", "super_admin", "admin_1"].includes(r.role)))
      throw new Error("Bạn không có quyền quản trị.");
  } else {
    const rows = await (await primaryRead(`rest/v1/profiles?id=eq.${user.id}&select=account_source,is_virtual,is_seed_account&limit=1`, token)).json();
    if (!rows[0] || !isRealScanUser(rows[0])) throw new Error("Thống kê quét chỉ dành cho thành viên thật.");
  }
  return user.id;
}
export class ScanV2Unavailable extends Error {}
export const LIFETIME_SQL_MISSING_MSG = "Supabase #2 chưa có gói quà 20 lượt quét. Cần duyệt và chạy file FINAL_PENDING_APPROVAL_2026-11-01_SB2_scan_gift_20_v5.sql.";
const PASS_THROUGH = new Set(["Bạn đã sử dụng hết 20 lượt quét tìm bạn.", "Lượt quét trước chưa hoàn tất.", "Chức năng quét đang tạm dừng.", "Bạn chưa nhận lượt quét tặng."]);
/** Messages a regular member may see; configuration/infra details stay admin-only. */
export function publicScanError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : "";
  if (PASS_THROUGH.has(msg) || !/Supabase|SQL|cấu hình quyền/.test(msg)) return e instanceof Error ? e : new Error("Có lỗi xảy ra. Vui lòng thử lại.");
  return new Error("Chức năng Tìm Bạn đang được bảo trì. Vui lòng thử lại sau.");
}
export async function secondaryRead(path: string, init: RequestInit = {}) {
  const key = process.env["SUPABASE2_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("Chưa cấu hình quyền lưu chức năng quét vào Supabase #2.");
  const r = await fetch(`${SUPABASE_INSTANCES.media.url}/rest/v1/${path}`, { ...init, headers: { ...credentialHeaders(key), ...init.headers } });
  if (!r.ok) {
    if (r.status === 404 && /nearby_scan_quota|nearby_scan_claim_gift|nearby_scan_results_page|nearby_scan_gift|nearby_scan_v5_deployment/.test(path))
      throw new ScanV2Unavailable(LIFETIME_SQL_MISSING_MSG);
    if (r.status === 404) {
      if (/nearby_scan_seen|nearby_scan_attempt_candidate/.test(path))
        throw new Error("Supabase #2 chưa có bảng lịch sử quét. Hãy chạy file SQL RUN_NOW_2026-10-31_SB2_nearby_scan_history.sql trên Supabase #2.");
      throw new Error("Supabase #2 chưa có bảng cấu hình/thống kê quét. Hãy chạy file SQL RUN_NOW_2026-10-31_SB2_nearby_scan.sql trên Supabase #2.");
    }
    if (r.status === 400) {
      const payload = await r.json().catch(() => null) as { message?: string } | null;
      if (payload?.message && PASS_THROUGH.has(payload.message))
        throw new Error(payload.message);
    }
    // No provider payloads (or credential-bearing requests) are returned to the browser.
    throw new Error("Không đọc hoặc lưu được dữ liệu quét vào Supabase #2. Vui lòng thử lại.");
  }
  return r;
}
type SecondAccountRow = {
  id: string; full_name: string | null; display_name: string | null;
  avatar: string | null; avatar_url: string | null; age: number | null;
  gender: string; province: string | null; intent: string | null;
};
/** Page of female second-account ids from Supabase #1 (ids only, no profile data). */
export async function femaleAccountIds(token: string, cursor: string | null): Promise<Array<{ id: string }>> {
  const rows = await (await primaryRead(`rest/v1/profiles?${femaleSecondAccountQuery(cursor)}`, token)).json() as Array<{ id: string }>;
  return rows.map(r => ({ id: r.id }));
}
/** One verified female second account (account_source='internal', gender='female') or null. */
function toAccount(r: SecondAccountRow): CommunityAccount {
  return {
    id: r.id, full_name: r.full_name, display_name: r.display_name,
    avatar: r.avatar || r.avatar_url, age: r.age, gender: r.gender,
    province: r.province, intent: r.intent,
  };
}
/** One verified female second account (account_source='internal', gender='female') or null. */
export async function femaleAccount(token: string, id: string): Promise<CommunityAccount | null> {
  const rows = await (await primaryRead(`rest/v1/profiles?${femaleSecondAccountQuery(null, id)}`, token)).json() as SecondAccountRow[];
  const r = rows[0];
  if (!r || r.id !== id || r.gender !== "female") return null;
  return toAccount(r);
}
/** Registered province from the verified user's own SB1 profile (never from the browser). */
export async function userProvince(token: string, uid: string): Promise<string | null> {
  const rows = await (await primaryRead(`rest/v1/profiles?id=eq.${uid}&select=province&limit=1`, token)).json() as Array<{ province: string | null }>;
  return rows[0]?.province?.trim() || null;
}
/** The scan config this user actually SAVED in SB1 (RLS: own row), or null if never saved. */
export async function savedFilters(token: string, uid: string): Promise<ScanFilters | null> {
  const rows = await (await primaryRead(`rest/v1/nearby_filters?user_id=eq.${uid}&select=filters&limit=1`, token)).json() as Array<{ filters: unknown }>;
  return rows[0] ? normalizeFilters(rows[0].filters) : null;
}
export type HydratedResult = { candidate_id: string; hit: boolean; scanned_at: string; person: CommunityAccount | null };
async function hydrateResults<T extends { candidate_id: string; hit: boolean | null; scanned_at: string }>(token: string, rows: T[]): Promise<Array<T & { person: CommunityAccount | null }>> {
  const ids = rows.filter(r => r.hit).map(r => r.candidate_id);
  const people = new Map<string, CommunityAccount>();
  // Bounded URLs and requests; no one-shot 500+ UUID query.
  for (let offset = 0; offset < ids.length; offset += 40) {
    const group = ids.slice(offset, offset + 40);
    const data = await (await primaryRead(`rest/v1/profiles?${femaleSecondAccountsByIdsQuery(group)}`, token)).json() as SecondAccountRow[];
    data.filter(r => r.gender === "female").forEach(r => people.set(r.id, toAccount(r)));
  }
  return rows.map(r => ({ ...r, person: r.hit ? people.get(r.candidate_id) ?? null : null }));
}
export async function savedResultsPage(token: string, uid: string, cursor: ResultCursor | null = null, until: string | null = null,
  source: "v2" | "legacy" = "v2"): Promise<{ rows: HydratedResult[]; position: ResultPosition }> {
  if (!UUID_RE.test(uid)) throw new Error("Tài khoản không hợp lệ.");
  if (source === "v2") {
    try {
      const data = await (await secondaryRead("rpc/nearby_scan_results_page", { method: "POST", body: JSON.stringify({
        p_user: uid, p_after_time: cursor?.scanned_at ?? null, p_after_id: cursor?.candidate_id ?? null, p_limit: 100, p_until: until,
      }) })).json() as { rows: Array<{ candidate_id: string; scanned_at: string }>; has_more: boolean; until: string; next_cursor: ResultCursor | null };
      return { rows: await hydrateResults(token, data.rows.map(r => ({ ...r, hit: true }))),
        position: { cursor: data.next_cursor ? cursorSchema.parse(data.next_cursor) : null, until: data.until, hasMore: data.has_more, source: "v2" } };
    } catch (e) {
      // Only missing RPC permits legacy mode; permission/network failures must remain errors.
      if (!(e instanceof ScanV2Unavailable) || cursor || until) throw e;
    }
  }
  const cutoff = until ?? new Date().toISOString();
  const q = new URLSearchParams({ select: "candidate_id,hit,scanned_at", user_id: `eq.${uid}`, hit: "is.true",
    scanned_at: `lte.${cutoff}`, order: "scanned_at.asc,candidate_id.asc", limit: "101" });
  if (cursor) q.set("or", `(scanned_at.gt.${cursor.scanned_at},and(scanned_at.eq.${cursor.scanned_at},candidate_id.gt.${cursor.candidate_id}))`);
  const rows = await (await secondaryRead(`nearby_scan_seen?${q}`)).json() as RecentScanRow[];
  const page = rows.slice(0, 100), last = page.at(-1);
  return { rows: await hydrateResults(token, page), position: { until: cutoff, cursor: last ? { scanned_at: last.scanned_at, candidate_id: last.candidate_id } : null,
    hasMore: rows.length > 100, source: "legacy" } };
}
export async function recentMisses(uid: string): Promise<HydratedResult[]> {
  // Transient presentation only, read from the permanent scanned list (never deleted).
  const query = `select=candidate_id,hit,scanned_at&user_id=eq.${uid}&hit=is.false&scanned_at=gte.${encodeURIComponent(new Date(Date.now() - 13000).toISOString())}&order=scanned_at.desc&limit=100`;
  const rows = await (await secondaryRead(`nearby_scan_seen?${query}`)).json() as RecentScanRow[];
  return rows.filter(r => isRecentRowVisible(r, Date.now())).map(r => ({ ...r, person: null }));
}
/** Compatibility API; consumers needing all results use savedResultsPage with continuation. */
export async function recentResults(token: string, uid: string): Promise<HydratedResult[] | null> {
  try { const [page, misses] = await Promise.all([savedResultsPage(token, uid), recentMisses(uid)]); return [...page.rows, ...misses]; }
  catch { return null; }
}
/** Read-only: the one-time 20-scan gift counted by SB2 (v5). Missing v5 fails closed (no scanning). */
export async function readQuota(uid: string): Promise<ScanQuota> {
  if (!UUID_RE_Q.test(uid)) throw new Error("Tài khoản không hợp lệ.");
  const raw = await (await secondaryRead("rpc/nearby_scan_quota", { method: "POST", body: JSON.stringify({ p_user: uid }) })).json() as unknown;
  return parseQuota(raw);
}
/** One-time gift claim in SB2 (row per user, per-user lock): grantedNow is true for exactly one request ever. */
export async function claimGift(uid: string): Promise<{ quota: ScanQuota; grantedNow: boolean }> {
  if (!UUID_RE_Q.test(uid)) throw new Error("Tài khoản không hợp lệ.");
  const raw = await (await secondaryRead("rpc/nearby_scan_claim_gift", { method: "POST", body: JSON.stringify({ p_user: uid }) })).json() as unknown;
  return parseGiftClaim(raw);
}
const UUID_RE_Q = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Permanent own-user history, including pre-gift rows. GET/HEAD only; never invokes a scan RPC. */
export async function scanHistoryTotals(uid: string, until: string): Promise<ScanHistoryTotals> {
  if (!UUID_RE.test(uid)) throw new Error("Tài khoản không hợp lệ.");
  const count = async (hit?: string) => {
    const q = new URLSearchParams({ select: "candidate_id", user_id: `eq.${uid}`, scanned_at: `lte.${until}` });
    if (hit) q.set("hit", hit);
    const response = await secondaryRead(`nearby_scan_seen?${q}`, { method: "HEAD", headers: { Prefer: "count=exact" } });
    const raw = response.headers.get("content-range")?.split("/")[1];
    if (!raw || !/^\d+$/.test(raw)) throw new Error("Không đọc được tổng lịch sử quét. Vui lòng thử lại.");
    return Number(raw);
  };
  const [total, hits, misses] = await Promise.all([count(), count("is.true"), count("is.false")]);
  if (hits + misses > total) throw new Error("Không xác nhận được thống kê lịch sử quét.");
  return { total, hits, misses, unknown: total - hits - misses };
}
export async function scanHistoryPage(access: string, uid: string, cursor: ResultCursor | null, until: string | null): Promise<ScanHistoryPage> {
  if (!UUID_RE.test(uid)) throw new Error("Tài khoản không hợp lệ.");
  const cutoff = until ?? new Date().toISOString();
  const q = new URLSearchParams({ select: "candidate_id,hit,scanned_at", user_id: `eq.${uid}`, scanned_at: `lte.${cutoff}`, order: "scanned_at.desc,candidate_id.desc", limit: "51" });
  if (cursor) q.set("or", `(scanned_at.lt.${cursor.scanned_at},and(scanned_at.eq.${cursor.scanned_at},candidate_id.lt.${cursor.candidate_id}))`);
  const [response, totals] = await Promise.all([secondaryRead(`nearby_scan_seen?${q}`), scanHistoryTotals(uid, cutoff)]);
  const rows = historyRowsSchema.parse(await response.json());
  const batch = rows.slice(0, 50), last = batch.at(-1);
  return { rows: await hydrateResults(access, batch), totals, until: cutoff, hasMore: rows.length > 50,
    cursor: last ? { candidate_id: last.candidate_id, scanned_at: last.scanned_at } : null };
}
/** Which of `ids` this (server-verified) user already scanned, from SB2 history. */
export async function seenCandidates(uid: string, ids: string[]): Promise<Set<string>> {
  const safe = ids.filter(id => UUID_RE.test(id));
  if (!safe.length || !UUID_RE.test(uid)) return new Set();
  const rows = await (await secondaryRead(`nearby_scan_seen?select=candidate_id&user_id=eq.${uid}&candidate_id=in.(${safe.join(",")})`)).json() as Array<{ candidate_id: string }>;
  return new Set(rows.map(r => r.candidate_id));
}
