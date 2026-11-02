-- BẬT LẠI quét sau khi tạm dừng v5 — CHỜ DUYỆT, CHƯA CHẠY. Chạy lại nhiều lần an toàn.
-- Không cấp/reset lượt: gói 20 lượt giữ nguyên.
begin;
select pg_advisory_xact_lock(7240211202601);
do $$ begin
  if to_regclass('public.nearby_scan_v5_deployment') is null then raise exception 'Chưa có v5.'; end if;
end $$;
update public.nearby_scan_v5_deployment set active=true where id=1 and not active;
commit;
