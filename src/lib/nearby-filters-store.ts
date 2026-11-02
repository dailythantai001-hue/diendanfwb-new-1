// Lưu cài đặt "Tìm bạn mới" theo từng tài khoản trên Supabase #1 (bảng public.nearby_filters),
// localStorage chỉ là bộ nhớ đệm để mở trang nhanh — chỉ ghi khi máy chủ đã lưu thành công.
import { supabase } from "@/lib/db/router";
import { DEFAULT_FILTERS, normalizeFilters, type ScanFilters } from "@/lib/nearby-scan";
import { filtersSaveErrorMessage, SCAN_FILTERS_NOT_RETURNED_MSG } from "@/lib/nearby-scan-errors";

const sb = supabase as unknown as any;
const key = (uid: string) => `nfwb:nearby-filters:v2:${uid}`;

const normalize = normalizeFilters;

export function cachedFilters(uid: string): ScanFilters {
  try {
    const v = localStorage.getItem(key(uid)) ?? localStorage.getItem("nfwb:nearby-filters:v1");
    return normalize(v ? JSON.parse(v) : null);
  } catch { return DEFAULT_FILTERS; }
}

export function cacheFilters(uid: string, f: ScanFilters) {
  try { localStorage.setItem(key(uid), JSON.stringify(f)); } catch { /* noop */ }
}

export async function loadFilters(uid: string): Promise<ScanFilters> {
  const { data, error } = await sb.from("nearby_filters").select("filters").eq("user_id", uid).maybeSingle();
  if (error || !data) return cachedFilters(uid);
  const f = normalize(data.filters);
  cacheFilters(uid, f);
  return f;
}

/**
 * Upserts the signed-in user's own row (user id from the SB1 session, matching RLS) and
 * returns the row read back from the database. `error` is a specific user-facing reason.
 */
export async function saveFilters(f: ScanFilters): Promise<{ saved: ScanFilters | null; error: string | null }> {
  const { data: sess } = await sb.auth.getSession();
  const uid: string | undefined = sess?.session?.user?.id;
  if (!uid) return { saved: null, error: filtersSaveErrorMessage({ code: "401" }) };
  const { data, error } = await sb.from("nearby_filters")
    .upsert({ user_id: uid, filters: f, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("filters").maybeSingle();
  if (error) {
    console.warn("[nearby] save filters", error.code, error.message);
    return { saved: null, error: filtersSaveErrorMessage(error) };
  }
  if (!data) return { saved: null, error: SCAN_FILTERS_NOT_RETURNED_MSG };
  const saved = normalize(data.filters);
  cacheFilters(uid, saved);
  return { saved, error: null };
}
