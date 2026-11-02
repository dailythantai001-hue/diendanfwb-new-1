import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Check, X, HelpCircle, History, Radar } from "lucide-react";
import { avatarSrc } from "@/lib/image-cdn";
import { resolveUserName } from "@/lib/user-name";
import { historyTime, type ScanHistoryPage } from "@/lib/nearby-scan-history";

export function ScanHistoryDialog({ page, loading, error, onClose, onMore, onRetry }: {
  page: ScanHistoryPage | null; loading: boolean; error: string;
  onClose: () => void; onMore: () => void; onRetry: () => void;
}) {
  const t = page?.totals;
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="pkh-overlay">
        <DialogPrimitive.Content className="pk-history-dialog" aria-describedby={undefined}>
          <header className="pkh-head">
            <span className="pkh-head-icon"><History size={18} /></span>
            <DialogPrimitive.Title className="pkh-title">Lịch sử quét</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="pkh-close" aria-label="Đóng lịch sử quét" title="Đóng lịch sử quét">
                <X size={20} aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="pk-history-totals">
            <span><b>{t ? t.total : "…"}</b>Tổng đã quét</span>
            <span className="pk-history-hit"><b>{t ? t.hits : "…"}</b>Quét trúng</span>
            <span className="pk-history-miss"><b>{t ? t.misses : "…"}</b>Quét trượt</span>
          </div>
          {!!t?.unknown && <p className="pk-history-note">{t.unknown} lượt cũ chưa lưu trạng thái trúng/trượt.</p>}
          <div className="pk-history-list" aria-busy={loading}>
            {page?.rows.map(row => {
              const cls = row.hit === true ? "pk-history-hit" : row.hit === false ? "pk-history-miss" : "";
              return <div className="pk-history-entry" key={row.candidate_id}>
                {row.hit === true && row.person?.avatar
                  ? <img src={avatarSrc(row.person.avatar, 80)} alt="" />
                  : <span className={`pk-history-avatar ${cls}`}>{row.hit === true ? <Check size={18} /> : row.hit === false ? <X size={18} /> : <HelpCircle size={18} />}</span>}
                <div className="pkh-entry-body">
                  <strong>{row.hit === true ? (row.person ? resolveUserName(row.person) || "Thành viên" : "Hồ sơ không còn khả dụng") : row.hit === false ? "Không tìm thấy ai" : "Chưa xác định"}</strong>
                  <time dateTime={row.scanned_at}>{historyTime(row.scanned_at)}</time>
                </div>
                <span className={`pkh-badge ${cls}`}>{row.hit === true ? "Trúng" : row.hit === false ? "Trượt" : "?"}</span>
              </div>;
            })}
            {!loading && page && !page.rows.length && <div className="pkh-empty">
              <span className="pkh-empty-icon"><Radar size={26} /></span>
              <strong>Chưa có lịch sử quét</strong>
              <p>Các lượt quét của bạn sẽ hiển thị tại đây.</p>
            </div>}
            {loading && <p role="status" className="pk-history-note pkh-loading">Đang tải lịch sử…</p>}
          </div>
          {error && <div role="alert" className="pkh-error"><p>{error}</p><Button variant="outline" onClick={onRetry} disabled={loading}>Thử lại</Button></div>}
          {page?.hasMore && <Button variant="outline" onClick={onMore} disabled={loading}>Tải thêm lịch sử</Button>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
