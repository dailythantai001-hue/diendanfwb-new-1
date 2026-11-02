import type { ScanFilters } from "@/lib/nearby-scan";

/** Số hồ sơ mỗi lần đọc từ Supabase 1 cho trang "Tìm bạn mới" (yêu cầu: 10–20). */
export const NEARBY_PAGE_SIZE = 20;
/** Số trang tối đa đọc liên tiếp trong một lô khi bộ lọc phía máy loại bớt hồ sơ. */
export const NEARBY_MAX_PAGES_PER_BATCH = 3;

/** Cột tối thiểu: tên + avatar để hiển thị, và các cột bộ lọc cần. Chiều cao/cân nặng chỉ khi lọc dáng người. */
export function nearbyColumns(f: Pick<ScanFilters, "bodies">): string {
  const base = ["id", "display_name", "full_name", "avatar", "age", "gender", "intent", "province"];
  if (f.bodies.length) base.push("height", "weight");
  return base.join(", ");
}
