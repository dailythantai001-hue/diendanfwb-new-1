-- ĐÃ BỊ THAY THẾ bởi FINAL_PENDING_APPROVAL_2026-11-01_SB2_scan_gift_20_v5.sql. GIỮ LẠI ĐỂ ĐỐI CHIẾU, KHÔNG CHẠY.
-- BẬT LẠI quét sau khi tạm dừng v4 — CHỜ DUYỆT, CHƯA CHẠY. Chạy lại nhiều lần an toàn.
-- Không cấp/reset lượt: bộ đếm trọn đời giữ nguyên.
begin;
select pg_advisory_xact_lock(7240211202601);
do $$ begin
  if to_regclass('public.nearby_scan_v4_deployment') is null then raise exception 'Chưa có v4.'; end if;
end $$;
update public.nearby_scan_v4_deployment set active=true where id=1 and not active;
commit;
