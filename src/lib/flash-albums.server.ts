/**
 * ⚡ ALBUM ẢNH — helper máy chủ. Supabase #4 (ybzdpxwbpbkeqkqwbscp),
 * bảng flash_albums / flash_album_media, bucket `flash-albums`.
 * Service role key chỉ đọc trong hàm, không bao giờ gửi về trình duyệt.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const FLASH_SB4_URL = "https://ybzdpxwbpbkeqkqwbscp.supabase.co";
export const FLASH_BUCKET = "flash-albums";

export function flashAdminClient(): SupabaseClient<any> | null {
  const key = (process.env["SUPABASE4_SERVICE_ROLE_KEY"] || "").trim();
  if (!key) return null;
  return createClient<any>(FLASH_SB4_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export function randomAlbumCode(): string {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 3; i++) s += L[Math.floor(Math.random() * L.length)];
  return `${s}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
}

/** Bucket RIÊNG TƯ cho ALBUM SIÊU HOT — chỉ đọc qua URL ký ngắn hạn sau khi xác minh VIP. */
export const FLASH_VIP_BUCKET = "flash-albums-vip";

export const isMissingColumn = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /is_super/i.test(e.message || ""));

export async function albumIsSuper(sb: SupabaseClient<any>, id: string): Promise<boolean> {
  const { data, error } = await sb.from("flash_albums").select("is_super").eq("id", id).maybeSingle();
  if (error) return false;
  return (data as any)?.is_super === true;
}

export async function bucketFor(sb: SupabaseClient<any>, id: string) {
  return (await albumIsSuper(sb, id)) ? FLASH_VIP_BUCKET : FLASH_BUCKET;
}

async function signIn(sb: SupabaseClient<any>, bucket: string, paths: string[], ttl: number) {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, ttl);
  if (error) console.error("[flash] sign", bucket, error.message);
  for (const d of (data ?? []) as any[]) if (d?.path && d?.signedUrl && !d?.error) map.set(d.path, d.signedUrl);
  return map;
}

/**
 * Ký URL đọc ngắn hạn cho media lưu trong bucket riêng tư.
 * Root cause cũ: lỗi ký (object nằm ở bucket thường vì upload trước khi album thành Siêu Hot,
 * hoặc path lỗi) bị nuốt và URL bị ghi đè thành "" → ảnh trống. Nay: thử bucket VIP, rồi
 * bucket thường (cũng chỉ trả URL ký), cuối cùng giữ URL đã lưu nếu có.
 */
export async function signVipMedia<T extends { storage_path: string | null; url: string }>(sb: SupabaseClient<any>, media: T[], ttl = 3600): Promise<T[]> {
  const paths = [...new Set(media.map((m) => (m.storage_path || "").trim()).filter(Boolean))];
  if (!paths.length) return media;
  const vip = await signIn(sb, FLASH_VIP_BUCKET, paths, ttl);
  const missing = paths.filter((p) => !vip.has(p));
  const pub = await signIn(sb, FLASH_BUCKET, missing, ttl);
  return media.map((m) => {
    const p = (m.storage_path || "").trim();
    if (!p) return m;
    return { ...m, url: vip.get(p) || pub.get(p) || m.url || "" };
  });
}

/** Xoá toàn bộ object dưới 1 thư mục trong bucket (theo trang 1000). */
export async function removeFolder(sb: SupabaseClient<any>, prefix: string, bucket = FLASH_BUCKET): Promise<number> {
  let removed = 0;
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !data?.length) break;
    const paths = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
    if (!paths.length) break;
    const r = await sb.storage.from(bucket).remove(paths);
    if (r.error) throw r.error;
    removed += paths.length;
  }
  return removed;
}
