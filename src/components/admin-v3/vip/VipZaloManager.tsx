/**
 * VipZaloManager — Admin → "Quản lý Popup Chung" → khu vực VIP ZALO (mới).
 * Lưu riêng key `vip_zalo_v2`; không chạm cấu hình popup cũ.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_VIP_ZALO_CONFIG,
  VIP_ZALO_COUNTRIES,
  newBenefitId,
  fetchVipZaloConfig,
  invalidateVipZaloConfig,
  saveVipZaloConfig,
  internationalBenefits,
  type VipZaloBenefit,
  type VipZaloConfig,
} from "@/lib/vip-zalo-config";
import { VipZaloScreen } from "@/components/candy/vip-zalo-screen";
import { VipZaloDetailEditor } from "./VipZaloDetailEditor";

const field: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)", background: "transparent", color: "inherit",
};
const card: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.28)", borderRadius: 14, padding: 14, marginBottom: 16, display: "grid", gap: 10,
};
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(120,120,140,0.35)", cursor: "pointer", background: "transparent", color: "inherit" };

const readFile = (file: File, cb: (v: string) => void) => {
  const r = new FileReader();
  r.onload = () => cb(String(r.result || ""));
  r.readAsDataURL(file);
};

function BenefitEditor({ label, value, onChange, onRemove, onMove }: { label: string; value: VipZaloBenefit; onChange: (b: VipZaloBenefit) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  return (
    <div style={{ ...card, marginBottom: 0 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <strong style={{ fontSize: 14, flex: 1 }}>{label}</strong>
        <button type="button" style={btn} aria-label="Lên" onClick={() => onMove(-1)}>↑</button>
        <button type="button" style={btn} aria-label="Xuống" onClick={() => onMove(1)}>↓</button>
        <button type="button" style={btn} onClick={() => { if (confirm("Xoá quyền lợi này?")) onRemove(); }}>🗑 Xoá quyền lợi</button>
      </div>
      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Icon (emoji hoặc ảnh)
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {value.icon && /^(https?:|\/|data:image)/i.test(value.icon) ? <img src={value.icon} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} /> : null}
          <input style={{ ...field, flex: 1, minWidth: 140 }} placeholder="Emoji hoặc URL ảnh" value={value.icon.startsWith("data:") ? "(ảnh đã tải lên)" : value.icon} onChange={(e) => onChange({ ...value, icon: e.target.value })} />
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, (v) => onChange({ ...value, icon: v })); }} />
        </div>
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Tiêu đề
        <input style={field} value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Mô tả
        <input style={field} value={value.subtitle} onChange={(e) => onChange({ ...value, subtitle: e.target.value })} />
      </label>
      <VipZaloDetailEditor tabs={value.slides} onChange={(slides) => onChange({ ...value, slides })} />
    </div>
  );
}

const blank = (): VipZaloBenefit => ({ id: newBenefitId(), icon: "", title: "", subtitle: "Click vào để xem quyền lợi", slides: [] });

function BenefitList({ list, onChange }: { list: VipZaloBenefit[]; onChange: (l: VipZaloBenefit[]) => void }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const n = [...list];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
      {list.length === 0 ? <div style={{ fontSize: 13, opacity: 0.7 }}>Chưa có quyền lợi nào.</div> : null}
      {list.map((b, i) => (
        <BenefitEditor key={b.id} label={`Quyền lợi ${i + 1}`} value={b}
          onChange={(nb) => onChange(list.map((x, k) => (k === i ? nb : x)))}
          onRemove={() => onChange(list.filter((_, k) => k !== i))}
          onMove={(d) => move(i, d)} />
      ))}
      <button type="button" style={btn} onClick={() => onChange([...list, blank()])}>+ Thêm quyền lợi</button>
    </div>
  );
}

export function VipZaloManager() {
  const [cfg, setCfg] = useState<VipZaloConfig>(DEFAULT_VIP_ZALO_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    invalidateVipZaloConfig();
    void fetchVipZaloConfig().then((c) => { if (alive) { setCfg(c); setLoading(false); } })
      .catch(() => { if (alive) { setLoadError(true); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const save = async () => {
    if (loadError) return;
    const all = [...cfg.vn, ...internationalBenefits(cfg)];
    if (all.some((b) => !b.title.trim())) { toast.error("Mỗi quyền lợi cần có tiêu đề."); return; }
    setSaving(true);
    try { await saveVipZaloConfig(cfg); toast.success("Đã lưu cấu hình VIP ZALO."); }
    catch (e: any) { toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định")); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 16, opacity: 0.7 }}>Đang tải cấu hình VIP ZALO…</div>;
  if (loadError) return <p role="alert">Không tải được cấu hình VIP ZALO. Vui lòng mở lại trang; không thể lưu để tránh ghi đè dữ liệu cũ.</p>;
  const text = (k: "title" | "intro" | "defaultLocation" | "vnLabel" | "intlLabel" | "ctaLabel", label: string, multi = false) => (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>{label}
      {multi
        ? <textarea style={{ ...field, minHeight: 90 }} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
        : <input style={field} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />}
    </label>
  );

  return (
    <div style={{ maxWidth: 720, marginTop: 32, paddingTop: 24, borderTop: "2px dashed rgba(120,120,140,0.35)" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>👑 VIP ZALO (màn hình mới)</h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.72 }}>
        Cấu hình riêng, không ảnh hưởng popup khoá tính năng phía trên. Hỗ trợ biến <code>{"{location}"}</code>.
      </p>

      <div style={card}>
        {text("title", "Tiêu đề")}
        {text("intro", "Nội dung giới thiệu (mỗi dòng 1 ý; dòng đầu là câu dẫn)", true)}
        {text("defaultLocation", "Khu vực mặc định khi hồ sơ chưa có khu vực")}
        {text("vnLabel", "Tên gói Việt Nam")}
        {text("intlLabel", "Tên gói Quốc tế")}
        {text("ctaLabel", "Chữ trên nút đăng ký (chưa hoạt động)")}
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Ảnh/GIF đầu trang
          <input style={field} placeholder="https://…" value={cfg.headerMedia.startsWith("data:") ? "(ảnh đã tải lên)" : cfg.headerMedia} onChange={(e) => setCfg({ ...cfg, headerMedia: e.target.value })} />
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, (v) => setCfg((c) => ({ ...c, headerMedia: v }))); }} />
        </label>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 800 }}>🇻🇳 Quyền lợi VIP Việt Nam</h3>
      <BenefitList list={cfg.vn} onChange={(l) => setCfg((c) => ({ ...c, vn: l }))} />

      <h3 style={{ fontSize: 16, fontWeight: 800 }}>🌏 Quyền lợi VIP Quốc tế (dùng chung)</h3>
      {cfg.intlShared === undefined ? (
        <div>
          <p>{VIP_ZALO_COUNTRIES.map((c) => `${c.name}: ${cfg.intl[c.code]?.length || 0}`).join(" · ")}</p>
          <p>Bộ chung dự kiến: {internationalBenefits(cfg).length} quyền lợi. Giữ mọi nội dung khác nhau; chỉ gộp bản sao giống hệt. Dữ liệu từng nước được giữ nguyên.</p>
          <Button variant="outline" type="button" onClick={() => {
            if (confirm("Tạo bộ chung từ toàn bộ quyền lợi hiện có? Bản sao giống hệt được gộp; nội dung khác nhau được giữ. Dữ liệu gốc từng nước không bị sửa hoặc xoá. Chỉ cập nhật khi bấm Lưu cấu hình VIP ZALO.")) {
              setCfg((c) => ({ ...c, intlShared: internationalBenefits(c) }));
            }
          }}>Tạo bộ quyền lợi chung từ dữ liệu hiện có</Button>
        </div>
      ) : <BenefitList list={cfg.intlShared} onChange={(l) => setCfg((c) => ({ ...c, intlShared: l }))} />}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "12px 0", background: "hsl(var(--background))", borderTop: "1px solid hsl(var(--border))" }}>
        <button type="button" onClick={save} disabled={saving} style={{ ...btn, padding: "10px 20px", fontWeight: 800 }}>
          {saving ? "Đang lưu…" : "💾 Lưu cấu hình VIP ZALO"}
        </button>
        <button type="button" onClick={() => setPreview(true)} style={{ ...btn, padding: "10px 20px" }}>👁️ Xem thử (gồm thay đổi chưa lưu)</button>
      </div>
      <VipZaloScreen open={preview} onClose={() => setPreview(false)} config={cfg} />
    </div>
  );
}

export default VipZaloManager;
