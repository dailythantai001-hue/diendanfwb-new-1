import { z } from "zod";
import { cursorSchema } from "./scan-v2";
import type { CommunityAccount } from "./nearby-community";

export const historyInputSchema = z.object({
  cursor: cursorSchema.nullable(),
  until: z.string().datetime({ offset: true }).nullable(),
}).refine(v => !v.cursor || !!v.until, "Thiếu mốc lịch sử.");
export const historyRowsSchema = z.array(z.object({
  candidate_id: z.string().uuid(), hit: z.boolean().nullable(),
  scanned_at: z.string().datetime({ offset: true }),
}));
export interface ScanHistoryTotals { total: number; hits: number; misses: number; unknown: number }
export interface ScanHistoryPage {
  rows: Array<z.infer<typeof historyRowsSchema>[number] & { person: CommunityAccount | null }>;
  totals: ScanHistoryTotals;
  until: string;
  cursor: z.infer<typeof cursorSchema> | null;
  hasMore: boolean;
}
export function historyTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}