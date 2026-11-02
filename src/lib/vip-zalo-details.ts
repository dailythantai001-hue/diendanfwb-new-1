/** Ordered arrays remain inside the existing vip_zalo_v2 JSON value. */
export interface VipZaloContentRow {
  id: string;
  icon: string;
  title: string;
  body: string;
}

export interface VipZaloSlide {
  id?: string;
  name?: string;
  title: string;
  body: string;
  image: string;
  rows?: VipZaloContentRow[];
}

const text = (v: unknown) => typeof v === "string" ? v : "";
export const detailId = () => crypto.randomUUID();
export const emptyDetailRow = (): VipZaloContentRow => ({ id: detailId(), icon: "", title: "", body: "" });
export const emptyDetailTab = (): VipZaloSlide => ({ id: detailId(), name: "", title: "", body: "", image: "", rows: [] });

export function normalizeDetailTab(raw: unknown): VipZaloSlide | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  return {
    id: text(v.id) || detailId(),
    name: text(v.name),
    // Legacy introduction fields are retained, not converted destructively into rows.
    title: text(v.title), body: text(v.body), image: text(v.image),
    rows: Array.isArray(v.rows) ? v.rows.filter((r) => r && typeof r === "object").map((r) => ({
      id: text(r.id) || detailId(), icon: text(r.icon), title: text(r.title), body: text(r.body),
    })) : [],
  };
}

export function moveDetailItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  if (index < 0 || index >= items.length || next < 0 || next >= items.length) return items;
  const result = [...items];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

export const isDetailImage = (v: string) => /^(https?:\/\/|\/(?!\/)|data:image)/i.test(v);