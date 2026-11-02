# Nearby Scan v5 — Quà 20 lượt (CHỜ DUYỆT, CHƯA TRIỂN KHAI)

## File SQL FINAL duy nhất cần chạy
`supabase-sql/SB2/FINAL_PENDING_APPROVAL_2026-11-01_SB2_scan_gift_20_v5.sql` — chỉ trên Supabase #2.

KHÔNG chạy v4 (`*_lifetime_scan_limit_v4.sql`) hay tuần v2/v3 — giữ lại để đối chiếu. File v5 tự từ chối nếu phát hiện v4/v2/v3 đã chạy.

## Thứ tự triển khai (chỉ khi được xác nhận)
1. Sao lưu Supabase #2 (backup/PITR).
2. Chạy file FINAL v5 trên Supabase #2.
3. Kiểm tra nhanh: `select nearby_scan_quota('<uuid thật>')` trả `claimed:false` (chưa ai được cấp tự động).
4. Publish frontend (giao diện hiệu ứng quà + quét theo gói).
5. Tạm dừng khẩn cấp nếu cần: `ROLLBACK_PENDING_2026-11-01_SB2_scan_gift_20_v5.sql`; bật lại: `RESUME_PENDING_2026-11-01_SB2_scan_gift_20_v5.sql` (không cấp/khôi phục lượt).

Lưu ý: trước bước 2, bản frontend mới sẽ báo "đang bảo trì" ở mục Tìm kiếm (fail closed) — vì vậy SQL phải chạy trước khi publish.

## Thay đổi so với v4
- v4 tính lượt cũ vào 20; v5 KHÔNG trừ lượt cũ — mọi tài khoản (cũ và mới) nhận gói 20 mới một lần.
- Lịch sử `nearby_scan_seen`/`nearby_scan_daily` giữ nguyên; người đã quét trước đây vẫn không hiện lại, không tốn lượt.
- Không sửa/xóa bảng cũ, không đổi RLS bảng cũ. Bảng mới: `nearby_scan_gift`, `nearby_scan_v5_deployment` (chỉ service_role).

## Kiểm thử (PostgreSQL cục bộ dùng một lần, không đụng DB thật)
`scripts/gift-scan-v5-postgres-tests.py` — 11/11 PASS, kết quả: `docs/GIFT-SCAN-V5-TEST-RESULTS.json`.
