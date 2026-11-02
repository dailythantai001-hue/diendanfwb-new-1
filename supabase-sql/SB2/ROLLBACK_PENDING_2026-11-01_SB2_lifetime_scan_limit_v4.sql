-- ĐÃ BỊ THAY THẾ bởi FINAL_PENDING_APPROVAL_2026-11-01_SB2_scan_gift_20_v5.sql. GIỮ LẠI ĐỂ ĐỐI CHIẾU, KHÔNG CHẠY.
-- TẠM DỪNG KHẨN CẤP v4 — CHỜ DUYỆT, CHƯA CHẠY. Chạy lại nhiều lần an toàn.
-- Không khôi phục chế độ 30 lượt/ngày (vì sẽ cấp thêm lượt, trái quy tắc 20 trọn đời).
-- Chỉ tắt quét: mọi lượt mới bị từ chối; KHÔNG sửa/xóa dữ liệu, bộ đếm hay lịch sử.
-- Bật lại: RESUME_PENDING_2026-11-01_SB2_lifetime_scan_limit_v4.sql.
-- Khôi phục toàn bộ DB về thời điểm trước v4 chỉ bằng backup/PITR và phải duyệt riêng.
begin;
select pg_advisory_xact_lock(7240211202601); -- chờ mọi lượt quét đang chạy xong
do $$ begin
  if to_regclass('public.nearby_scan_v4_deployment') is null then raise exception 'Chưa có v4.'; end if;
end $$;
update public.nearby_scan_v4_deployment set active=false where id=1 and active;
commit;
