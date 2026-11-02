-- TẠM DỪNG KHẨN CẤP v5 — CHỜ DUYỆT, CHƯA CHẠY. Chạy lại nhiều lần an toàn.
-- Chỉ tắt quét + nhận quà: KHÔNG sửa/xóa gói lượt, lịch sử hay dữ liệu cũ. Không cấp thêm lượt.
-- Bật lại: RESUME_PENDING_2026-11-01_SB2_scan_gift_20_v5.sql.
begin;
select pg_advisory_xact_lock(7240211202601);
do $$ begin
  if to_regclass('public.nearby_scan_v5_deployment') is null then raise exception 'Chưa có v5.'; end if;
end $$;
update public.nearby_scan_v5_deployment set active=false where id=1 and active;
commit;
