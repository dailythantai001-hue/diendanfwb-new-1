import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { communityScanAdmin } from "@/lib/nearby-community.functions";
import { scanAuthHeaders } from "@/lib/nearby-community-auth";
import { validateScanSettings, type ScanSettings } from "@/lib/nearby-community";
import { LIFETIME_SCAN_LIMIT } from "@/lib/scan-v2";

type Overview = Awaited<ReturnType<typeof communityScanAdmin>>;

/** Admin can tune delay/hit rate and VIEW usage. No action can grant, reset or restore scans. */
export function SearchScanTab() {
  const query = useServerFn(communityScanAdmin);
  const [data, setData] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<ScanSettings>({ delay_seconds: 1.6, hit_percent: 50 });
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (save?: ScanSettings) => {
    setBusy(true); setError("");
    try {
      if (save) validateScanSettings(save);
      const result = await query({ data: { offset, save }, headers: await scanAuthHeaders(true) });
      setData(result);
      if (result.settings) setSettings(result.settings);
      if (save) toast.success("Đã lưu cấu hình vào Supabase #2");
    } catch (e) { setError(e instanceof Error ? e.message : "Không tải được thống kê quét."); }
    finally { setBusy(false); }
  }, [query, offset]);
  useEffect(() => { void load(); }, [load]);

  return <section className="space-y-6">
    <form className="flex flex-wrap items-end gap-4" onSubmit={e => { e.preventDefault(); void load(settings); }}>
      <div className="space-y-2"><Label htmlFor="scan-delay">Độ trễ quét (giây)</Label><Input id="scan-delay" type="number" min={0} max={3600} step="0.1" value={settings.delay_seconds} onChange={e => setSettings(s => ({ ...s, delay_seconds: Number(e.target.value) }))} /></div>
      <div className="space-y-2"><Label htmlFor="scan-hits">Tỷ lệ trúng (%)</Label><Input id="scan-hits" type="number" min={0} max={100} step="0.1" value={settings.hit_percent} onChange={e => setSettings(s => ({ ...s, hit_percent: Number(e.target.value) }))} /></div>
      <p className="text-sm py-2">Tỷ lệ xịt: {100 - settings.hit_percent}%</p>
      <Button type="submit" disabled={busy || !data}><Save />Lưu cấu hình</Button>
    </form>

    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <h3 className="font-semibold">Giới hạn {LIFETIME_SCAN_LIMIT} lượt quét trọn đời</h3>
      <p className="text-xs text-muted-foreground">Mỗi tài khoản có đúng {LIFETIME_SCAN_LIMIT} lượt, dùng hết là khóa vĩnh viễn. Không có reset, tặng hay cấp thêm lượt.</p>
    </div>

    <div className="flex items-center justify-between gap-3">
      <div><h3 className="font-semibold text-lg">{data ? `${data.totalReal}/${data.participants}` : "Thống kê quét"}</h3>{data && <p className="text-xs text-muted-foreground">Tổng user thật / Số người đã quét · Đã khóa (hết {LIFETIME_SCAN_LIMIT} lượt): {data.locked}</p>}</div>
      <Button variant="outline" size="icon" title="Tải lại thống kê" aria-label="Tải lại thống kê" disabled={busy} onClick={() => void load()}><RefreshCw /></Button>
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {busy && <p role="status" className="text-muted-foreground">Đang tải…</p>}
    {data && <ul className="divide-y divide-border">{data.rows.map(r => <li key={r.user_id} className="py-3 text-sm break-words">
      <span className="font-medium">{r.name}</span> <span className="text-muted-foreground">Trúng {r.hits} – Xịt {r.misses}.</span>
      <span className="block text-xs">Đã dùng {r.used}/{LIFETIME_SCAN_LIMIT} · còn lại <b>{r.remaining}</b>{r.remaining === 0 ? " · đã khóa" : ""}</span>
      <span className="block text-xs text-muted-foreground font-mono">{r.user_id}</span>
    </li>)}</ul>}
    {data && !data.rows.length && <p className="text-muted-foreground text-sm">Chưa có thành viên quét.</p>}
    {data && <div className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Trang trước" disabled={busy || offset === 0} onClick={() => setOffset(n => Math.max(0, n - 20))}><ChevronLeft /></Button><span className="text-sm">Trang {offset / 20 + 1}</span><Button variant="outline" size="icon" aria-label="Trang sau" disabled={busy || offset + 20 >= data.participants} onClick={() => setOffset(n => n + 20)}><ChevronRight /></Button></div>}
  </section>;
}
