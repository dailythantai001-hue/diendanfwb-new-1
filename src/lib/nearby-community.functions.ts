import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { cursorSchema, parseQuota } from "./scan-v2";
import { validateScanSettings, type ScanSettings } from "./nearby-community";
import { isScanConfigComplete, SCAN_CONFIG_MSG } from "./nearby-scan";
import { provinceDistricts, sanitizeDistricts, scanDistrictFor } from "./scan-districts";
import { historyInputSchema } from "./nearby-scan-history";

export const DISTRICT_PROFILE_MSG = "Vui lòng cập nhật khu vực (tỉnh/thành) trong hồ sơ để chọn quận/huyện.";
export const DISTRICT_INVALID_MSG = "Khu vực đã chọn không thuộc tỉnh/thành bạn đăng ký. Vui lòng chọn lại trong Cài đặt tìm kiếm.";

function token() {
  const value = getRequestHeader("authorization");
  if (!value?.startsWith("Bearer ")) throw new Error("Vui lòng đăng nhập lại.");
  return value.slice(7);
}
/** Saved SB1 config for the verified user; a failed read is reported, never treated as "not configured". */
async function readSavedConfig(s: typeof import("./nearby-community.server"), access: string, uid: string) {
  try {
    const filters = await s.savedFilters(access, uid);
    return { filters, configured: isScanConfigComplete(filters), configError: null as string | null };
  } catch (e) {
    return { filters: null, configured: false, configError: e instanceof Error ? e.message : "Không đọc được cấu hình quét đã lưu." };
  }
}
export const openCommunityScan = createServerFn({ method: "POST" }).handler(async () => {
  const s = await import("./nearby-community.server");
  try { return await openScanImpl(s); } catch (e) { throw s.publicScanError(e); }
});
async function openScanImpl(s: typeof import("./nearby-community.server")) {
  const access = token();
  const uid = await s.scanIdentity(access);
  const [stats, settings, config, results, misses] = await Promise.all([
    s.readQuota(uid),
    s.secondaryRead("nearby_scan_settings?select=delay_seconds,hit_percent&id=eq.1").then(r => r.json() as Promise<ScanSettings[]>),
    readSavedConfig(s, access, uid),
    s.savedResultsPage(access, uid),
    s.recentMisses(uid),
  ]);
  if (!settings[0]) throw new Error("Chưa có cấu hình quét.");
  // `configured` comes from the config actually saved in SB1, not from the UI state.
  const quota = stats;
  return { settings: settings[0], stats: quota, ...config, recent: [...results.rows, ...misses], position: results.position, now: Date.now() };
}
/** Read-back after saving: confirms the server sees the saved config for the verified user. */
export const readScanConfig = createServerFn({ method: "POST" }).handler(async () => {
  const s = await import("./nearby-community.server");
  const access = token();
  const uid = await s.scanIdentity(access);
  return readSavedConfig(s, access, uid);
});
export const communityScanPage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ cursor: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./nearby-community.server");
    try {
    const access = token();
    const uid = await s.scanIdentity(access);
    const ids = await s.femaleAccountIds(access, data.cursor);
    // Accounts this user already scanned (persistent SB2 history) never come back.
    const seen = await s.seenCandidates(uid, ids.map(i => i.id));
    return { items: ids.filter(i => !seen.has(i.id)), last: ids[ids.length - 1]?.id ?? null };
    } catch (e) { throw s.publicScanError(e); }
  });
export const runCommunityScan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ candidate: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./nearby-community.server");
    try { return await runScanImpl(s, data.candidate); } catch (e) { throw s.publicScanError(e); }
  });
async function runScanImpl(s: typeof import("./nearby-community.server"), candidate: string) {
    const data = { candidate };
    const access = token();
    // UUID always comes from the verified SB1 session, never from the browser.
    const uid = await s.scanIdentity(access);
    // Required scan config must be SAVED (SB1) before any attempt is counted.
    const [saved, province] = await Promise.all([s.savedFilters(access, uid), s.userProvince(access, uid)]);
    if (!saved || !isScanConfigComplete(saved)) throw new Error(SCAN_CONFIG_MSG);
    // Area filter: saved districts must belong to the province registered in the user's own profile.
    if (saved.districts.length > 1) throw new Error(DISTRICT_INVALID_MSG);
    if (saved.districts.length) {
      if (!provinceDistricts(province)) throw new Error(DISTRICT_PROFILE_MSG);
      if (sanitizeDistricts(province, saved.districts).length !== saved.districts.length) throw new Error(DISTRICT_INVALID_MSG);
    }
    const person = await s.femaleAccount(access, data.candidate);
    // Candidate no longer a female second account: no attempt is counted; client moves on.
    if (!person) return { stale: true as const } as const;
    // Atomic: history row + counted attempt (limit, cooldown, hit_percent) in SB2.
    const result = await (await s.secondaryRead("rpc/nearby_scan_attempt_candidate", { method: "POST", body: JSON.stringify({ p_user: uid, p_candidate: person.id }) })).json() as { seen: boolean; hit: boolean; total: number; hits: number; misses: number; delay_seconds: number };
    // Already scanned by this user (e.g. on another device): nothing counted, client moves on.
    if (result.seen) return { stale: true as const };
    const district = result.hit ? scanDistrictFor(uid, person.id, province, saved.districts) : null;
    return { stale: false as const, ...result, ...parseQuota(result), person: result.hit ? { ...person, district } : null };
}
export const communityScanAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ offset: z.number().int().min(0), save: z.object({ delay_seconds: z.number(), hit_percent: z.number() }).optional() }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./nearby-community.server");
    const access = token();
    const adminId = await s.scanIdentity(access, true);
    if (data.save) {
      validateScanSettings(data.save);
      await s.secondaryRead("nearby_scan_settings?id=eq.1", { method: "PATCH", body: JSON.stringify(data.save) });
    }
    const settings = await (await s.secondaryRead("nearby_scan_settings?id=eq.1&select=delay_seconds,hit_percent")).json() as ScanSettings[];
    const overview = await (await s.secondaryRead("rpc/nearby_scan_overview", { method: "POST", body: JSON.stringify({ p_offset: data.offset }) })).json() as { mode?: string; participants: number; locked: number; rows: Array<{ user_id: string; used: number; remaining: number; total: number; hits: number; misses: number }> };
    if (overview.mode !== "lifetime") throw new Error("Supabase #2 chưa có gói quà 20 lượt quét (v5).");
    const countResponse = await s.primaryRead("rest/v1/profiles?select=id&or=(account_source.is.null,account_source.neq.internal)&is_virtual=not.is.true&is_seed_account=not.is.true", access, { method: "HEAD", headers: { Prefer: "count=exact" } });
    const rawCount = countResponse.headers.get("content-range")?.split("/")[1];
    if (!rawCount || rawCount === "*") throw new Error("Không xác định được tổng số thành viên thật.");
    const ids = overview.rows.map(r => r.user_id);
    const names = ids.length ? await (await s.primaryRead(`rest/v1/profiles?select=id,display_name,full_name&id=in.(${ids.join(",")})&or=(account_source.is.null,account_source.neq.internal)&is_virtual=not.is.true&is_seed_account=not.is.true`, access)).json() as Array<{ id: string; display_name: string | null; full_name: string | null }> : [];
    return { adminId, settings: settings[0], totalReal: Number(rawCount), participants: overview.participants, locked: overview.locked,
      rows: overview.rows.map(r => ({ ...r, name: names.find(n => n.id === r.user_id)?.display_name || names.find(n => n.id === r.user_id)?.full_name || "Thành viên" })) };
  });
/** One-time 20-scan gift: the server records it once per account; the intro animation runs only when grantedNow. */
export const claimScanGift = createServerFn({ method: "POST" }).handler(async () => {
  const s = await import("./nearby-community.server");
  try { const uid = await s.scanIdentity(token()); return await s.claimGift(uid); }
  catch (e) { throw s.publicScanError(e); }
});
/** Authenticated read-only refresh; no counter-creating RPC is invoked. */
export const refreshCommunityQuota = createServerFn({ method: "POST" }).handler(async () => {
  const s = await import("./nearby-community.server");
  try { const uid = await s.scanIdentity(token()); return await s.readQuota(uid); }
  catch (e) { throw s.publicScanError(e); }
});
export const communityResultsPage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ cursor: cursorSchema.nullable(), until: z.string().datetime({ offset: true }).nullable(), source: z.enum(["v2", "legacy"]) })
    .refine(v => !v.cursor || !!v.until, "Thiếu mốc kết quả.").parse(d))
  .handler(async ({ data }) => {
    const s = await import("./nearby-community.server");
    try { const access = token(), uid = await s.scanIdentity(access); return await s.savedResultsPage(access, uid, data.cursor, data.until, data.source); }
    catch (e) { throw s.publicScanError(e); }
  });

/** Identity is verified in SB1 before every service-only SB2 history read; no caller-supplied user id. */
export const communityHistory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => historyInputSchema.parse(data))
  .handler(async ({ data }) => {
    const s = await import("./nearby-community.server");
    try {
      const access = token(), uid = await s.scanIdentity(access);
      return await s.scanHistoryPage(access, uid, data.cursor, data.until);
    } catch (e) { throw s.publicScanError(e); }
  });
export const communityHistoryTotals = createServerFn({ method: "POST" }).handler(async () => {
  const s = await import("./nearby-community.server");
  try { const uid = await s.scanIdentity(token()); return await s.scanHistoryTotals(uid, new Date().toISOString()); }
  catch (e) { throw s.publicScanError(e); }
});
