/**
 * 💎 ALBUM SIÊU HOT — phía người dùng. Chỉ thành viên VIP (xác minh trên máy chủ
 * bằng quy tắc VIP sẵn có) mới nhận được Code + media. Người thường chỉ nhận
 * thẻ khóa: id, tiêu đề, số lượng ảnh/video — không Code, không URL media.
 * Media tải lên nằm trong bucket riêng tư, chỉ trả URL ký ngắn hạn.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { FlashAlbum } from "@/lib/flash-albums.functions";

export type SuperLockedCard = { id: string; name: string; images: number; videos: number; codeLength: number; cover: string | null };

async function adminSb() {
  const F = await import("@/lib/flash-albums.server");
  const sb = F.flashAdminClient();
  if (!sb) throw new Error("Thiếu khoá máy chủ Supabase #4.");
  return { sb, F };
}

export const superPublicListFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ albums: SuperLockedCard[]; error: string | null }> => {
    try {
      const { sb, F } = await adminSb();
      const { data, error } = await sb
        .from("flash_albums")
        .select("id, name, code, created_at, cover_media_id, media:flash_album_media(id, kind, storage_path, url, display_order)")
        .eq("is_super", true)
        .order("created_at", { ascending: false });
      if (error) {
        if (F.isMissingColumn(error)) return { albums: [], error: null };
        throw error;
      }
      const rows = data ?? [];
      // Chỉ ký URL ngắn hạn cho ẢNH BÌA (hiển thị mờ trên thẻ) — không lộ media khác.
      const covers = rows.map((r: any) => {
        const media = Array.isArray(r.media) ? r.media : [];
        return media.find((m: any) => m.id === r.cover_media_id && m.kind === "image") ?? media.find((m: any) => m.kind === "image") ?? null;
      });
      const signed = await F.signVipMedia(sb, covers.filter(Boolean), 900).catch(() => [] as any[]);
      const coverUrl = new Map(signed.map((m: any) => [m.id, m.url || null]));
      return {
        albums: rows.map((r: any, i: number) => {
          const media = Array.isArray(r.media) ? r.media : [];
          return {
            cover: covers[i] ? coverUrl.get(covers[i].id) ?? null : null,
            id: r.id,
            name: r.name,
            images: media.filter((m: any) => m.kind === "image").length,
            videos: media.filter((m: any) => m.kind === "video").length,
            codeLength: String(r.code || "").length,
          };
        }),
        error: null,
      };
    } catch (e) {
      console.error("[superPublicListFn]", e);
      return { albums: [], error: "Không tải được Album Siêu Hot." };
    }
  },
);

/** Mở album: xác minh VIP trên máy chủ rồi mới trả Code + URL media. */
export const superOpenFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().max(4000).optional(), id: z.string().uuid(), code: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; album: FlashAlbum } | { ok: false; reason: "not_vip" | "not_found" | "bad_code" }> => {
    const S = await import("@/lib/admin-purge.server");
    const vip = await S.verifyVipUser(data.token);
    if (!vip.ok) return { ok: false, reason: "not_vip" };
    const { sb, F } = await adminSb();
    const { data: row, error } = await sb
      .from("flash_albums")
      .select("*, media:flash_album_media(*)")
      .eq("id", data.id)
      .eq("is_super", true)
      .maybeSingle();
    if (error || !row) return { ok: false, reason: "not_found" };
    // Bắt buộc đúng Code của chính album này (VIP thôi chưa đủ).
    if (String(row.code || "").trim().toUpperCase() !== data.code.trim().toUpperCase()) return { ok: false, reason: "bad_code" };
    const media = [...(row.media ?? [])].sort((a: any, b: any) => {
      const ao = a.display_order ?? Number.MAX_SAFE_INTEGER, bo = b.display_order ?? Number.MAX_SAFE_INTEGER;
      return ao !== bo ? ao - bo : String(a.created_at).localeCompare(String(b.created_at));
    });
    const album: FlashAlbum = {
      ...row,
      like_count: Number(row.like_count) || 0,
      view_count: Number(row.view_count) || 0,
      media: await F.signVipMedia(sb, media),
    };
    return { ok: true, album };
  });
