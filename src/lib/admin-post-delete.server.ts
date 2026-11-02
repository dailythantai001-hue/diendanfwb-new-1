/**
 * Xóa bài viết dành riêng cho admin — chạy phía máy chủ.
 * Quyền: CHỈ profiles.is_admin === true trên Supabase #1, đọc bằng khóa máy chủ
 * sau khi xác thực access token với Supabase Auth. Không tin giá trị từ trình duyệt.
 * Xóa: đúng một dòng posts trên Supabase #3 (giống cơ chế xóa hiện tại, không đụng media dùng chung).
 */
import process from "node:process";

const SB1_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SB3_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";
const SB1_ANON = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

const env = (k: string) => (process.env[k] || "").trim();

export type AdminDeleteResult = { ok: true } | { ok: false; error: string };

export function isStrictAdminRow(row: unknown): boolean {
  return !!row && typeof row === "object" && (row as { is_admin?: unknown }).is_admin === true;
}

export async function adminDeletePost(token: string, postId: string): Promise<AdminDeleteResult> {
  const k1 = env("SUPABASE1_SERVICE_ROLE_KEY");
  const k3 = env("SUPABASE3_SERVICE_ROLE_KEY");
  const missing = [!k1 && "SUPABASE1_SERVICE_ROLE_KEY", !k3 && "SUPABASE3_SERVICE_ROLE_KEY"].filter(Boolean);
  if (missing.length) return { ok: false, error: `Máy chủ thiếu cấu hình: ${missing.join(", ")}` };

  const u = await fetch(`${SB1_URL}/auth/v1/user`, { headers: { apikey: SB1_ANON, Authorization: `Bearer ${token}` } });
  if (!u.ok) return { ok: false, error: "Phiên đăng nhập không hợp lệ." };
  const uid = ((await u.json()) as { id?: string })?.id;
  if (!uid) return { ok: false, error: "Phiên đăng nhập không hợp lệ." };

  const pf = await fetch(`${SB1_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=is_admin&limit=1`, {
    headers: { apikey: k1, Authorization: `Bearer ${k1}` },
  });
  if (!pf.ok) return { ok: false, error: "Không kiểm tra được quyền admin." };
  const rows = (await pf.json()) as unknown[];
  if (!isStrictAdminRow(rows?.[0])) return { ok: false, error: "Bạn không có quyền xóa bài viết này." };

  const del = await fetch(`${SB3_URL}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`, {
    method: "DELETE",
    headers: { apikey: k3, Authorization: `Bearer ${k3}`, Prefer: "return=minimal" },
  });
  if (!del.ok) {
    console.error("[admin-post-delete] delete failed", del.status);
    return { ok: false, error: "Xóa bài viết thất bại." };
  }
  return { ok: true };
}
