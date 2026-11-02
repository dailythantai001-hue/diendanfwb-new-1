import { z } from "zod";

/** One-time gift: every account receives exactly this many scans, once. Enforced in SB2 SQL (v5). */
export const LIFETIME_SCAN_LIMIT = 20;
export const SCAN_EXHAUSTED_MSG = "Bạn đã sử dụng hết 20 lượt quét tìm bạn.";

const count = z.number().int().nonnegative();
export const quotaSchema = z.object({
  mode: z.literal("lifetime"), limit: z.literal(LIFETIME_SCAN_LIMIT),
  /** Whether the server has recorded this account's one-time 20-scan gift. */
  claimed: z.boolean(),
  used: count.max(LIFETIME_SCAN_LIMIT), remaining: count.max(LIFETIME_SCAN_LIMIT),
  total: count, hits: count, misses: count, server_now: z.string().optional(),
});
export type ScanQuota = z.infer<typeof quotaSchema>;

/** Fail closed: anything other than the server's gift contract (old daily/weekly/v4 replies) is rejected. */
export function parseQuota(raw: unknown): ScanQuota {
  const result = quotaSchema.parse(z.object({}).passthrough().parse(raw));
  if (result.total !== result.hits + result.misses) throw new Error("Thống kê quét không khớp.");
  const expected = result.claimed ? LIFETIME_SCAN_LIMIT - result.used : 0;
  if (result.remaining !== expected) throw new Error("Hạn mức quét không khớp.");
  return result;
}
/** Server reply to the one-time gift claim; `grantedNow` is true for exactly one request per account. */
export function parseGiftClaim(raw: unknown): { quota: ScanQuota; grantedNow: boolean } {
  const { granted_now } = z.object({ granted_now: z.boolean() }).passthrough().parse(raw);
  const quota = parseQuota(raw);
  if (!quota.claimed) throw new Error("Máy chủ chưa xác nhận cấp lượt quét.");
  if (granted_now && quota.used !== 0) throw new Error("Hạn mức quét không khớp.");
  return { quota, grantedNow: granted_now };
}
export const cursorSchema = z.object({ scanned_at: z.string().datetime({ offset: true }), candidate_id: z.string().uuid() });
export type ResultCursor = z.infer<typeof cursorSchema>;
export type ResultPosition = { cursor: ResultCursor | null; until: string | null; hasMore: boolean; source: "v2" | "legacy" };
