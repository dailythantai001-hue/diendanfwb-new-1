import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaUploadButton } from "@/components/admin-v3/connect/MediaUploadButton";
import { VipZaloDetailContent } from "@/components/candy/vip-zalo-detail-pages";
import { emptyDetailRow, emptyDetailTab, isDetailImage, moveDetailItem, type VipZaloSlide } from "@/lib/vip-zalo-details";
import "@/styles/vip-zalo-detail-editor.css";
import "@/styles/vip-zalo-screen.css";

function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div className="vzde-image-field">
    <label>{label}<input aria-label={label} placeholder="https://…" value={value.startsWith("data:") ? "" : value} onChange={(e) => onChange(e.target.value)} /></label>
    <div className="vzde-tools"><MediaUploadButton label="Tải ảnh lên" folder="vip-zalo" onUploaded={onChange} compact />
      {value ? <Button variant="ghost" size="sm" onClick={() => onChange("")}>Gỡ ảnh</Button> : null}</div>
    {value && isDetailImage(value) ? <img src={value} alt={`Xem trước ${label.toLowerCase()}`} className="vzde-image-preview" /> : null}
  </div>;
}

function OrderControls({ index, length, kind, onMove, onRemove }: { index: number; length: number; kind: string; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return <div className="vzde-tools">
    <Button variant="ghost" size="icon" title={`Di chuyển ${kind} lên`} aria-label={`Di chuyển ${kind} lên`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
    <Button variant="ghost" size="icon" title={`Di chuyển ${kind} xuống`} aria-label={`Di chuyển ${kind} xuống`} disabled={index === length - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
    <Button variant="ghost" size="icon" title={`Xóa ${kind}`} aria-label={`Xóa ${kind}`} onClick={() => { if (confirm(`Xóa ${kind} và nội dung bên trong?`)) onRemove(); }}><Trash2 /></Button>
  </div>;
}

export function VipZaloDetailEditor({ tabs, onChange }: { tabs: VipZaloSlide[]; onChange: (tabs: VipZaloSlide[]) => void }) {
  const [activeId, setActiveId] = useState<string | undefined>(tabs[0]?.id);
  const [preview, setPreview] = useState(false);
  const selected = Math.max(0, tabs.findIndex((t) => t.id === activeId));
  const tab = tabs[selected];
  const patch = (change: Partial<VipZaloSlide>) => onChange(tabs.map((t, i) => i === selected ? { ...t, ...change } : t));
  return <section className="vzde" aria-label="Nội dung chi tiết">
    <div className="vzde-heading"><strong>NỘI DUNG CHI TIẾT</strong><Button variant="outline" size="sm" onClick={() => { const t = emptyDetailTab(); onChange([...tabs, t]); setActiveId(t.id); }}><Plus /> Thêm tab</Button></div>
    <div className="vzde-tab-list" role="tablist" aria-label="Tab nội dung">{tabs.map((t, i) => <Button key={t.id || i} variant={i === selected ? "secondary" : "ghost"} role="tab" aria-selected={i === selected} onClick={() => setActiveId(t.id)}>{i + 1}. {t.name || t.title || "Tab chưa đặt tên"}</Button>)}</div>
    {tab ? <div className="vzde-panel" role="tabpanel" aria-label={`Tab ${selected + 1}`}>
      <div className="vzde-heading"><strong>Tab {selected + 1}</strong><OrderControls index={selected} length={tabs.length} kind="tab" onMove={(d) => onChange(moveDetailItem(tabs, selected, d))} onRemove={() => { onChange(tabs.filter((_, i) => i !== selected)); setActiveId(tabs[selected - 1]?.id || tabs[selected + 1]?.id); }} /></div>
      <label>Tên tab (quản lý)<input value={tab.name || ""} onChange={(e) => patch({ name: e.target.value })} /></label>
      <ImageField label="URL ảnh nền" value={tab.image} onChange={(image) => patch({ image })} />
      <label>Tiêu đề trang<input value={tab.title} onChange={(e) => patch({ title: e.target.value })} /></label>
      <label>Nội dung giới thiệu<textarea rows={3} value={tab.body} onChange={(e) => patch({ body: e.target.value })} /></label>
      <div className="vzde-heading"><strong>Hàng nội dung ({tab.rows?.length || 0})</strong><Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}><Eye />{preview ? "Ẩn xem trước" : "Xem trước tab"}</Button></div>
      {(tab.rows || []).map((row, i, rows) => <fieldset key={row.id} className="vzde-row">
        <legend>Hàng {i + 1}</legend>
        <OrderControls index={i} length={rows.length} kind={`hàng ${i + 1}`} onMove={(d) => patch({ rows: moveDetailItem(rows, i, d) })} onRemove={() => patch({ rows: rows.filter((_, k) => k !== i) })} />
        <ImageField label={`URL icon hàng ${i + 1}`} value={row.icon} onChange={(icon) => patch({ rows: rows.map((r, k) => k === i ? { ...r, icon } : r) })} />
        <label>Tiêu đề hàng<input value={row.title} onChange={(e) => patch({ rows: rows.map((r, k) => k === i ? { ...r, title: e.target.value } : r) })} /></label>
        <label>Mô tả hàng<textarea rows={3} value={row.body} onChange={(e) => patch({ rows: rows.map((r, k) => k === i ? { ...r, body: e.target.value } : r) })} /></label>
        {(row.icon || row.title || row.body) ? <div className="vzde-row-preview"><VipZaloDetailContent tab={{ title: "", body: "", image: "", rows: [row] }} /></div> : null}
      </fieldset>)}
      <Button variant="outline" onClick={() => patch({ rows: [...(tab.rows || []), emptyDetailRow()] })}><Plus /> Thêm hàng nội dung</Button>
      {preview ? <div className="vzde-tab-preview"><VipZaloDetailContent tab={tab} /></div> : null}
    </div> : null}
  </section>;
}