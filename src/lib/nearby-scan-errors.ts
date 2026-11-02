// Shared, user-facing reasons for Quét Gần Đây failures (browser + server).
export const SCAN_SESSION_EXPIRED_MSG = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
export const SCAN_FILTERS_TABLE_MISSING_MSG =
  "Supabase #1 chưa có bảng lưu cấu hình quét (nearby_filters). Hãy chạy file SQL RUN_NOW_2026-10-30_nearby_filters.sql trên Supabase #1.";

export const SCAN_FILTERS_NOT_RETURNED_MSG =
  "Supabase #1 không trả lại bản ghi cấu hình sau khi lưu (có thể thiếu quyền đọc SELECT trên nearby_filters).";

/** Maps a PostgREST error from saving/reading nearby_filters to a specific message. */
export function filtersSaveErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return SCAN_FILTERS_NOT_RETURNED_MSG;
  if (err.code === "PGRST205" || err.code === "42P01") return SCAN_FILTERS_TABLE_MISSING_MSG;
  if (err.code === "42501") return "Supabase #1 từ chối quyền lưu cấu hình quét cho tài khoản này (RLS/GRANT).";
  if (err.code === "PGRST301" || err.code === "PGRST303" || err.code === "401") return SCAN_SESSION_EXPIRED_MSG;
  if (err.code === "23503") return "Tài khoản đăng nhập không tồn tại trong Supabase #1 (auth.users), không lưu được cấu hình.";
  if (err.code === "22P02" || err.code === "23502") return "Dữ liệu cấu hình gửi lên không hợp lệ.";
  return `Không lưu được cài đặt lên Supabase #1 (mã lỗi ${err.code ?? "không rõ"}).`;
}
