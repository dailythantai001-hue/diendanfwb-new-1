/**
 * <PendingPostsManager /> — Admin duyệt bài viết có ảnh của thành viên thường.
 * Bài ở trạng thái `pending` chỉ hiển thị công khai sau khi Admin phê duyệt.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { loadAllPending, pendingCountKey, reviewRequest, reviewPendingSnapshot, usePendingPostCount } from "@/lib/admin/pending-review";

type PendingRow = {
  id: string;
  user_id: string;
  content: string | null;
  image_urls: string[] | null;
  image_url: string | null;
  created_at: string;
  profiles?: { username?: string | null; display_name?: string | null; avatar_url?: string | null; account_source?: string | null; is_admin?: boolean | null } | null;
};

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

/** Tài khoản không phải thành viên thật: tài khoản thứ hai/phụ/ảo (account_source='internal'
 * hoặc cờ clone cũ) và Admin (is_admin hoặc có vai trò quản trị). */
function isNonRealMember(p: any, adminIds: Set<string>): boolean {
  if (!p) return true; // không xác định được người đăng → không đưa vào duyệt
  if (p.account_source === "internal") return true;
  if (p.is_clone === true || p.is_virtual === true || p.is_internal === true || p.is_seed_account === true) return true;
  if (p.is_admin === true || adminIds.has(p.id)) return true;
  return false;
}

export function PendingPostsManager({ realMembersOnly = false }: { realMembersOnly?: boolean } = {}) {
  const [viewer, setViewer] = useState<{ imgs: string[]; i: number } | null>(null);
  const qc = useQueryClient();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const operation = useRef(false);
  const loadVersion = useRef(0);
  const { data: pendingCount = 0 } = usePendingPostCount();

  const load = useCallback(async (silent = false) => {
    if (operation.current) return;
    const version = ++loadVersion.current;
    if (!silent) setLoading(true);
    // Bài chờ duyệt ở Supabase 3 chỉ đọc qua server (xác thực Admin trên #1),
    // để RLS #3 có thể ẩn bài pending với khách/thành viên khác.
    let data: PendingRow[] = [];
    try {
      data = await loadAllPending();
    } catch (e: any) {
      if (!silent) toast.error(e?.message || "Không tải được bài chờ duyệt");
      if (version === loadVersion.current) setLoading(false);
      return;
    }
    const list: PendingRow[] = (data || []).filter(Boolean);
    const ids = Array.from(new Set(list.map((p) => p.user_id).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await (supabase.from("profiles") as any)
        .select(realMembersOnly ? "*" : "id,username,display_name,avatar_url")
        .in("id", ids);
      const map = new Map<string, any>((profs || []).map((p: any) => [p.id, p]));
      list.forEach((p) => {
        p.profiles = map.get(p.user_id) ?? null;
      });
    }
    let out = list;
    if (realMembersOnly) {
      let adminIds = new Set<string>();
      try {
        const { data: roles } = await (supabase.from("user_roles") as any)
          .select("user_id")
          .in("user_id", ids);
        adminIds = new Set((roles || []).map((r: any) => r.user_id));
      } catch {
        /* bảng vai trò không đọc được → vẫn lọc theo is_admin / account_source */
      }
      out = list.filter((p) => !isNonRealMember(p.profiles, adminIds));
    }
    if (version === loadVersion.current && !operation.current) {
      setRows(out.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setLoading(false);
    }
  }, [realMembersOnly]);


  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 10000);
    const focus = () => void load(true);
    window.addEventListener("focus", focus);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); loadVersion.current++; };
  }, [load]);

  const processed = (id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
    qc.setQueryData<number>(pendingCountKey, count => Math.max(0, (count || 0) - 1));
  };

  const reviewAll = async (action: "approve" | "reject") => {
    if (operation.current) return;
    if (action === "reject" && !window.confirm("Từ chối tất cả bài đang chờ duyệt và xóa ảnh R2 liên quan?")) return;
    operation.current = true;
    loadVersion.current++;
    setBusy("all");
    try {
      const snapshot = await loadAllPending();
      const result = await reviewPendingSnapshot(snapshot.map(row => row.id), action, processed);
      if (result.succeeded) toast.success(action === "approve" ? `Đã duyệt ${result.succeeded} bài viết` : `Đã từ chối ${result.succeeded} bài viết`);
      if (result.failed) toast.error(`${result.failed} bài chưa xử lý được; vui lòng thử lại`);
      if (result.cleanupFailed) toast.error(`Đã xóa bài nhưng ${result.cleanupFailed} ảnh R2 chưa xóa được`);
      if (action === "approve" && result.succeeded) {
        void qc.invalidateQueries({ queryKey: ["posts"] });
        void qc.invalidateQueries({ queryKey: ["feed"] });
      }
    } catch (e: any) { toast.error(e?.message || "Không xử lý được hàng chờ"); }
    finally {
      operation.current = false; setBusy(null);
      void qc.invalidateQueries({ queryKey: pendingCountKey });
      void load(true);
    }
  };

  // Bảo mật: bài nằm ở Supabase #3 → duyệt/xoá qua endpoint server (xác thực Admin trên #1,
  // ghi #3 bằng khóa server, chỉ đổi bài đang 'pending' nên không xử lý trùng).
  const review = async (id: string, action: "approve" | "reject") => {
    if (operation.current) return;
    operation.current = true;
    loadVersion.current++;
    setBusy(id);
    let res: { ok?: boolean; message?: string; code?: string; cleanupFailed?: number } = {};
    try {
      res = await reviewRequest({ postId: id, action });
    } catch (e: any) {
      res = { ok: false, message: e?.message || "Lỗi mạng" };
    }
    setBusy(null);
    operation.current = false;
    void qc.invalidateQueries({ queryKey: pendingCountKey });
    if (res.code === "NOT_PENDING") {
      processed(id);
      return toast.info(res.message || "Bài viết đã được xử lý");
    }
    if (res.ok !== true) return toast.error(res.message || res.code || "Không thực hiện được");
    processed(id);
    if (action === "approve") {
      toast.success("Đã duyệt bài viết");
      void qc.invalidateQueries({ queryKey: ["posts"] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
    } else {
      if (res.cleanupFailed) toast.error(`Đã xóa bài nhưng ${res.cleanupFailed} ảnh R2 chưa xóa được`);
      else toast.success("Đã từ chối và xóa bài viết");
    }
  };

  const approve = (id: string) => review(id, "approve");

  const reject = async (id: string) => {
    if (!window.confirm("Xóa bài viết này?")) return;
    await review(id, "reject");
  };


  return (
    <div className="ppm">
      <div className="ppm__head">
        <div className="ppm__title">
          <Clock size={15} /> Bài viết chờ duyệt
          {pendingCount > 0 && <span className="ppm__count">{pendingCount}</span>}
        </div>
        <Button variant="ghost" size="unstyled" className="ppm__refresh" disabled={busy !== null} onClick={() => void load()}>
          <RefreshCw size={14} /> Tải lại
        </Button>
      </div>
      <div className="ppm__bulk">
        <Button variant="ghost" size="unstyled" className="ppm__btn is-ok" disabled={loading || busy !== null || pendingCount === 0} onClick={() => void reviewAll("approve")}>
          <Check size={14} /> Duyệt tất cả
        </Button>
        <Button variant="ghost" size="unstyled" className="ppm__btn is-no" disabled={loading || busy !== null || pendingCount === 0} onClick={() => void reviewAll("reject")}>
          <Trash2 size={14} /> Từ chối tất cả
        </Button>
      </div>

      {loading ? (
        <div className="ppm__empty">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="ppm__empty">Không có bài viết nào đang chờ duyệt.</div>
      ) : (
        <div className="ppm__list">
          {rows.map((r) => {
            const imgs = r.image_urls && r.image_urls.length ? r.image_urls : r.image_url ? [r.image_url] : [];
            const name = r.profiles?.display_name || r.profiles?.username || "Thành viên";
            return (
              <div className="ppm__item" key={r.id}>
                <div className="ppm__meta">
                  {r.profiles?.avatar_url ? (
                    <img className="ppm__av" src={r.profiles.avatar_url} alt="" />
                  ) : (
                    <span className="ppm__av ppm__av--empty">{name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <div className="ppm__who">
                    <b>{name}</b>
                    {r.profiles?.username && <span>@{r.profiles.username}</span>}
                    <span>
                      {new Date(r.created_at).toLocaleString("vi-VN")} · {timeAgo(r.created_at)}
                    </span>
                  </div>
                  <span className="ppm__status">Chờ duyệt</span>
                </div>
                {r.content && <div className="ppm__text">{r.content}</div>}
                {imgs.length > 0 && (
                  <div className="ppm__imgs">
                    {imgs.map((u, i) => (
                      <img
                        decoding="async"
                        key={u + i}
                        src={u}
                        alt={`Ảnh ${i + 1}/${imgs.length}`}
                        loading="lazy"
                        onClick={() => setViewer({ imgs, i })}
                      />
                    ))}
                  </div>
                )}
                <div className="ppm__actions">
                  <Button variant="ghost" size="unstyled"
                    className="ppm__btn is-ok"
                    disabled={busy !== null}
                    onClick={() => void approve(r.id)}
                  >
                    <Check size={14} /> Duyệt
                  </Button>
                  <Button variant="ghost" size="unstyled"
                    className="ppm__btn is-no"
                    disabled={busy !== null}
                    onClick={() => void reject(r.id)}
                  >
                    <Trash2 size={14} /> Từ chối
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewer && (
        <div className="ppm__viewer" onClick={() => setViewer(null)}>
          <img src={viewer.imgs[viewer.i]} alt="" onClick={(e) => e.stopPropagation()} />
          {viewer.imgs.length > 1 && (
            <div className="ppm__nav" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setViewer({ ...viewer, i: (viewer.i - 1 + viewer.imgs.length) % viewer.imgs.length })}>‹</button>
              <span>{viewer.i + 1}/{viewer.imgs.length}</span>
              <button onClick={() => setViewer({ ...viewer, i: (viewer.i + 1) % viewer.imgs.length })}>›</button>
            </div>
          )}
        </div>
      )}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ppm{display:flex;flex-direction:column;gap:12px;}
.ppm__head{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.ppm__title{display:inline-flex;align-items:center;gap:7px;font-weight:800;font-size:14px;}
.ppm__count{background:hsl(var(--destructive));color:hsl(var(--destructive-foreground));border-radius:999px;
  padding:1px 8px;font-size:12px;font-weight:800;}
.ppm__refresh{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.14);
  background:transparent;color:inherit;border-radius:10px;padding:6px 10px;font-size:12px;
  font-weight:700;cursor:pointer;}
.ppm__empty{padding:26px 0;text-align:center;font-size:13px;opacity:.6;}
.ppm__list{display:flex;flex-direction:column;gap:10px;}
.ppm__item{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px;
  background:rgba(255,255,255,.03);}
.ppm__meta{font-size:12.5px;display:flex;gap:10px;align-items:center;}
.ppm__av{width:38px;height:38px;border-radius:999px;object-fit:cover;flex:none;}
.ppm__av--empty{display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.1);font-weight:800;}
.ppm__who{display:flex;flex-direction:column;min-width:0;flex:1;}
.ppm__who span{opacity:.65;font-size:11.5px;}
.ppm__status{background:rgba(250,204,21,.16);color:#facc15;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:800;}
.ppm__imgs img{cursor:zoom-in;}
.ppm__viewer{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;}
.ppm__viewer img{max-width:94vw;max-height:82vh;object-fit:contain;border-radius:10px;}
.ppm__nav{display:flex;gap:16px;align-items:center;color:#fff;font-weight:700;}
.ppm__nav button{background:rgba(255,255,255,.15);color:#fff;border:0;border-radius:999px;width:38px;height:38px;font-size:22px;cursor:pointer;}
.ppm__text{margin-top:6px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;}
.ppm__imgs{margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}
.ppm__imgs img{width:100%;height:120px;object-fit:cover;border-radius:10px;}
.ppm__actions{margin-top:10px;display:flex;gap:8px;}
.ppm__bulk{display:flex;flex-wrap:wrap;gap:8px;}
.ppm__btn{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:10px;
  padding:7px 14px;font-size:12.5px;font-weight:800;cursor:pointer;}
.ppm__btn:disabled{opacity:.5;cursor:not-allowed;}
.ppm__btn.is-ok{background:rgba(34,197,94,.18);color:#22c55e;}
.ppm__btn.is-no{background:rgba(239,68,68,.16);color:#ef4444;}
`;

export default PendingPostsManager;
