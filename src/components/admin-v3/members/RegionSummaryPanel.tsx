import { useCallback, useEffect, useState } from "react";
import { loadRegionSummary, type RegionSummary } from "@/lib/admin/region-summary";

export function RegionSummaryPanel() {
  const [data, setData] = useState<RegionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await loadRegionSummary()); }
    catch (e: any) { setError(e?.message || "Không tải được dữ liệu"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rgs">
      <div className="rgs-head">
        <div>
          <div className="rgs-total">{loading ? "…" : (data?.total ?? 0).toLocaleString("vi-VN")}</div>
          <div className="rgs-sub">người dùng thật có khu vực đăng ký
            {data && data.withoutRegion > 0 && <> · {data.withoutRegion.toLocaleString("vi-VN")} chưa chọn khu vực (không tính)</>}
          </div>
        </div>
        <button className="admv3-chip" onClick={() => void load()} disabled={loading}>Tải lại</button>
      </div>

      {loading ? <p className="rgs-msg">Đang tải dữ liệu…</p>
        : error ? <p className="rgs-msg rgs-err" role="alert">Lỗi tải dữ liệu: {error}</p>
        : !data?.rows.length ? <p className="rgs-msg">Chưa có dữ liệu khu vực.</p>
        : (
          <div className="rgs-wrap">
            <table className="rgs-table">
              <thead><tr><th>Xếp hạng</th><th>Khu vực</th><th className="r">Số lượng</th><th className="r">Tỷ lệ</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.region}>
                    <td><span className={`rgs-rank${r.rank <= 3 ? ` top${r.rank}` : ""}`}>TOP {r.rank}</span></td>
                    <td>{r.region}</td>
                    <td className="r">{r.count.toLocaleString("vi-VN")}</td>
                    <td className="r">
                      <div className="rgs-pct"><span style={{ width: `${r.percent}%` }} /></div>
                      {r.percent.toLocaleString("vi-VN")}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <style>{`
        .rgs-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px;border:1px solid hsl(var(--border));border-radius:14px;background:hsl(var(--card));margin-bottom:12px}
        .rgs-total{font-size:26px;font-weight:800;color:hsl(var(--primary))}
        .rgs-sub,.rgs-msg{font-size:13px;color:hsl(var(--muted-foreground))}
        .rgs-msg{padding:24px;text-align:center}
        .rgs-err{color:hsl(var(--destructive))}
        .rgs-wrap{overflow-x:auto;border:1px solid hsl(var(--border));border-radius:14px;background:hsl(var(--card))}
        .rgs-table{width:100%;border-collapse:collapse;font-size:14px;min-width:420px}
        .rgs-table th,.rgs-table td{padding:10px 12px;text-align:left;border-bottom:1px solid hsl(var(--border))}
        .rgs-table th{font-size:12px;text-transform:uppercase;color:hsl(var(--muted-foreground))}
        .rgs-table .r{text-align:right;white-space:nowrap}
        .rgs-rank{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;background:hsl(var(--muted));color:hsl(var(--foreground))}
        .rgs-rank.top1,.rgs-rank.top2,.rgs-rank.top3{background:hsl(var(--primary));color:hsl(var(--primary-foreground))}
        .rgs-pct{display:inline-block;width:60px;height:6px;border-radius:9px;background:hsl(var(--muted));margin-right:8px;vertical-align:middle;overflow:hidden}
        .rgs-pct span{display:block;height:100%;background:hsl(var(--primary))}
      `}</style>
    </div>
  );
}
