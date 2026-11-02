-- BẬT LẠI chế độ TUẦN sau hoàn tác v3 — CHỜ DUYỆT, CHƯA CHẠY. Chạy lại nhiều lần an toàn.
-- Lượt quét ở chế độ ngày đã trừ vào hạn mức cơ bản tuần, nên bật lại không hồi lượt.
-- Lượt tặng đóng băng được dùng tiếp. Không sửa/xóa dữ liệu.
begin;
select pg_advisory_xact_lock(7240211202601);
do $$ begin
  if to_regclass('public.nearby_scan_mode_day') is null or to_regclass('public.nearby_scan_mode_log') is null then
    raise exception 'Chưa có v3 đầy đủ.';
  end if;
end $$;
insert into public.nearby_scan_mode_log(mode,note)
select 'weekly','reactivate v3' from public.nearby_scan_deployment where id=1 and mode<>'weekly';
update public.nearby_scan_deployment set mode='weekly' where id=1 and mode<>'weekly';
commit;
