/**
 * Tổng hợp khu vực — đếm user thật theo trường `profiles.province` (khu vực
 * người dùng chọn khi đăng ký). Chỉ ĐỌC, không ghi, không suy đoán theo IP.
 * Loại trừ dùng chung quy tắc isSystemAccount (tài khoản thứ hai/internal,
 * clone, bot, seed, virtual, bangchu, chatdel) + admin (is_admin / role).
 */
import { supabase } from "@/lib/supabase";
import { isSystemAccount, loadBangchuIds } from "@/lib/admin-member-detail";
import { provinceNormKey } from "@/lib/nearby-scan";

export interface RegionRow { rank: number; region: string; count: number; percent: number }
export interface RegionSummary { rows: RegionRow[]; total: number; withoutRegion: number }

const FULL =
  "id, username, email, province, role, is_admin, account_source, is_clone, is_internal, is_virtual, is_seed_account, is_bot";
const SAFE = "id, username, province, role, is_admin, account_source, is_virtual, is_seed_account";
const PAGE = 1000;

export function isAdminRow(r: any): boolean {
  return r?.is_admin === true || String(r?.role ?? "").toLowerCase() === "admin";
}

/** Gộp theo tên tỉnh đã chuẩn hóa; mỗi id tính đúng 1 lần. */
export function aggregateRegions(rows: any[], systemIds: Set<string>): RegionSummary {
  const seen = new Set<string>();
  const groups = new Map<string, { names: Map<string, number>; count: number }>();
  let withoutRegion = 0;
  for (const r of rows) {
    if (!r?.id || seen.has(r.id)) continue;
    if (isAdminRow(r) || isSystemAccount(r, systemIds)) continue;
    seen.add(r.id);
    const name = String(r.province ?? "").trim();
    if (!name) { withoutRegion++; continue; }
    const key = provinceNormKey(name);
    const g = groups.get(key) ?? { names: new Map(), count: 0 };
    g.count++;
    g.names.set(name, (g.names.get(name) ?? 0) + 1);
    groups.set(key, g);
  }
  const total = Array.from(groups.values()).reduce((s, g) => s + g.count, 0);
  const list = Array.from(groups.values())
    .map((g) => ({
      region: Array.from(g.names.entries()).sort((a, b) => b[1] - a[1])[0][0],
      count: g.count,
    }))
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region, "vi"));
  return {
    total,
    withoutRegion,
    rows: list.map((x, i) => ({
      rank: i + 1,
      ...x,
      percent: total ? Math.round((x.count / total) * 1000) / 10 : 0,
    })),
  };
}

async function fetchAll(cols: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase.from("profiles") as any)
      .select(cols).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadRegionSummary(): Promise<RegionSummary> {
  let rows: any[];
  try { rows = await fetchAll(FULL); } catch { rows = await fetchAll(SAFE); }
  const ids = await loadBangchuIds();
  return aggregateRegions(rows, ids);
}
