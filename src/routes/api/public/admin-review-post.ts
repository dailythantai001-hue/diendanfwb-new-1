/**
 * Admin → Tài khoản thứ hai → Duyệt bài.
 *
 * Bài viết nằm trên Supabase #3, nhưng #3 không xác thực được JWT của #1
 * (auth.uid() = NULL) và không có RPC duyệt bài với chữ ký đang dùng. Vì vậy:
 *   1) Xác thực Admin trên Supabase #1 bằng token người gọi.
 *   2) Kiểm tra lại người đăng là thành viên thật (đọc hồ sơ #1 bằng token Admin).
 *   3) Cập nhật bài trên #3 bằng SB3_SERVICE_ROLE_KEY (chỉ ở server), có điều kiện
 *      status='pending' để bấm lặp lại không tạo thay đổi trùng.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SB1_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SB1_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";
const SB3_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";
const UUID_RE = /^[0-9a-f-]{36}$/i;
const noSession = { storage: undefined, persistSession: false, autoRefreshToken: false } as const;

function sb1For(token: string) {
  return createClient(SB1_URL, SB1_KEY, {
    auth: noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function isAdmin(token: string): Promise<boolean> {
  const sb1 = sb1For(token);
  const { data: auth } = await sb1.auth.getUser(token);
  const uid = auth?.user?.id;
  if (!uid) return false;
  const { data: bc } = await sb1
    .from("bangchu")
    .select("status,is_active")
    .eq("auth_user_id", uid)
    .maybeSingle();
  if (bc && (bc as any).status === "approved" && (bc as any).is_active) return true;
  const { data: pf } = await sb1.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
  return (pf as any)?.is_admin === true;
}

/** true = chắc chắn thành viên thật; false = nội bộ / không xác định được. */
async function isRealMember(token: string, userId: string): Promise<boolean> {
  const sb1 = sb1For(token);
  const { data: p, error } = await sb1.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error || !p) return false;
  const x = p as any;
  if (x.account_source === "internal") return false;
  if (x.is_clone === true || x.is_virtual === true || x.is_internal === true || x.is_seed_account === true) return false;
  if (x.is_admin === true) return false;
  const { data: roles } = await sb1.from("user_roles").select("user_id").eq("user_id", userId).limit(1);
  if (roles && roles.length) return false;
  return true;
}

export const Route = createFileRoute("/api/public/admin-review-post")({
  server: {
    handlers: {
      // Danh sách bài chờ duyệt — chỉ Admin (xác thực trên #1), đọc #3 bằng khóa server.
      GET: async ({ request }) => {
        const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ ok: false, message: "Chưa đăng nhập" }, { status: 401 });
        if (!(await isAdmin(token))) {
          return Response.json({ ok: false, message: "Bạn không có quyền admin" }, { status: 403 });
        }
        const serviceKey = process.env["SB3_SERVICE_ROLE_KEY"];
        if (!serviceKey) {
          return Response.json({ ok: false, message: "Thiếu cấu hình server" }, { status: 503 });
        }
        const sb3 = createClient(SB3_URL, serviceKey, { auth: noSession });
        const params = new URL(request.url).searchParams;
        if (params.get("countOnly") === "1") {
          const { count, error } = await sb3.from("posts").select("id", { count: "exact", head: true }).eq("status", "pending");
          if (error) return Response.json({ ok: false, message: "Không tải được số bài chờ duyệt" }, { status: 500 });
          return Response.json({ ok: true, count: count ?? 0 }, { headers: { "cache-control": "no-store" } });
        }
        const after = params.get("after"), cutoff = params.get("cutoff");
        if ((after && !UUID_RE.test(after)) || (cutoff && !Number.isFinite(Date.parse(cutoff)))) {
          return Response.json({ ok: false, message: "Yêu cầu không hợp lệ" }, { status: 400 });
        }
        let query = sb3
          .from("posts")
          .select("id,user_id,content,image_urls,image_url,created_at")
          .eq("status", "pending")
          .order("id", { ascending: true })
          .limit(100);
        if (after) query = query.gt("id", after);
        if (cutoff) query = query.lte("created_at", cutoff);
        const { data, error } = await query;
        if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
        return Response.json(
          { ok: true, rows: data ?? [] },
          { headers: { "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ ok: false, message: "Chưa đăng nhập" }, { status: 401 });
        if (!(await isAdmin(token))) {
          return Response.json({ ok: false, message: "Bạn không có quyền admin" }, { status: 403 });
        }
        let body: { postId?: string; action?: string } = {};
        try {
          body = await request.json();
        } catch {
          /* ignore */
        }
        const postId = String(body.postId || "");
        const action = body.action;
        if (!UUID_RE.test(postId) || (action !== "approve" && action !== "reject")) {
          return Response.json({ ok: false, message: "Yêu cầu không hợp lệ" }, { status: 400 });
        }
        const serviceKey = process.env["SB3_SERVICE_ROLE_KEY"];
        if (!serviceKey) {
          return Response.json({ ok: false, message: "Thiếu cấu hình server" }, { status: 503 });
        }
        const sb3 = createClient(SB3_URL, serviceKey, { auth: noSession });
        const { data: post, error: readErr } = await sb3
          .from("posts")
          .select("id,user_id,status,image_urls,image_url")
          .eq("id", postId)
          .maybeSingle();
        if (readErr) return Response.json({ ok: false, message: readErr.message }, { status: 500 });
        if (!post || (post as any).status !== "pending") {
          return Response.json({ ok: false, code: "NOT_PENDING", message: "Bài viết đã được xử lý hoặc không còn tồn tại" }, { status: 409 });
        }
        if (action === "approve" && !(await isRealMember(token, (post as any).user_id))) {
          return Response.json({ ok: false, code: "NOT_REAL_MEMBER", message: "Người đăng không phải thành viên thật" }, { status: 422 });
        }
        // Prepare before deleting so a missing R2 configuration leaves the pending row intact.
        // Only the winner of the conditional deletion may remove images (never a competing approval).
        let cleanup: (() => Promise<number>) | undefined;
        if (action === "reject") {
          const { postImageUrls, prepareReviewImageCleanup } = await import("@/lib/admin/pending-review-r2.server");
          try { cleanup = prepareReviewImageCleanup(postImageUrls(post)); }
          catch { return Response.json({ ok: false, message: "Không thể chuẩn bị xóa ảnh R2; bài viết chưa bị xóa" }, { status: 503 }); }
        }
        const q =
          action === "approve"
            ? sb3.from("posts").update({ status: "published" }).eq("id", postId).eq("status", "pending").select("id")
            : sb3.from("posts").delete().eq("id", postId).eq("status", "pending").select("id");
        const { data, error } = await q;
        if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
        if (!data || data.length === 0) {
          return Response.json({ ok: false, code: "NOT_PENDING", message: "Bài viết đã được xử lý" }, { status: 409 });
        }
        const cleanupFailed = cleanup ? await cleanup() : 0;
        return Response.json({ ok: true, action, cleanupFailed }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
