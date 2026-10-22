/** ALBUM VIP: tìm thẻ khóa theo Code (máy chủ). Chỉ trả ảnh bìa ký ngắn hạn + số lượng, không media. */
export type SuperCodeCard = {
  id: string;
  name: string;
  code: string;
  images: number;
  videos: number;
  cover: string | null;
  created_at: string;
};

export function displayCount(custom: unknown, actual: number): number {
  const n = typeof custom === "number" ? custom : custom == null || custom === "" ? NaN : Number(custom);
  return Number.isInteger(n) && n >= 0 ? n : actual;
}

export async function findSuperCardByCode(code: string): Promise<SuperCodeCard | null> {
  const F = await import("@/lib/flash-albums.server");
  const sb = F.flashAdminClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("flash_albums")
    .select("*, media:flash_album_media(id, kind, storage_path, url)")
    .eq("is_super", true)
    .ilike("code", code)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const r: any = data;
  if (String(r.code || "").trim().toUpperCase() !== code.toUpperCase()) return null;
  const media: any[] = Array.isArray(r.media) ? r.media : [];
  const coverM = media.find((m) => m.id === r.cover_media_id && m.kind === "image") ?? media.find((m) => m.kind === "image") ?? null;
  let cover: string | null = null;
  if (coverM) {
    const signed = await F.signVipMedia(sb, [coverM], 900).catch(() => []);
    cover = (signed[0] as any)?.url || null;
  }
  return {
    id: r.id,
    name: r.name,
    code: String(r.code).toUpperCase(),
    // Số HIỂN THỊ: ưu tiên số admin đặt; chưa đặt → đếm media thực tế.
    images: displayCount(r.display_image_count, media.filter((m) => m.kind === "image").length),
    videos: displayCount(r.display_video_count, media.filter((m) => m.kind === "video").length),
    cover,
    created_at: r.created_at,
  };
}
