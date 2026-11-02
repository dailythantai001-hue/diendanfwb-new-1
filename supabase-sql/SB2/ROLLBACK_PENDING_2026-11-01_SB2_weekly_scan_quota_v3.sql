-- HOÀN TÁC VẬN HÀNH v3 (về chế độ NGÀY 30 lượt) — CHỜ DUYỆT, CHƯA CHẠY.
-- Thay bản ROLLBACK_PENDING_2026-11-01_SB2_weekly_scan_quota.sql (giữ để đối chiếu).
-- Chỉ Supabase #2, SAU KHI v3 COMMIT. Không DROP/DELETE/UPDATE dữ liệu cũ; chạy lại nhiều lần an toàn.
-- Giữa tuần: lượt hôm nay = nearby_scan_daily (cũ) + nearby_scan_mode_day (lượt chế độ tuần),
-- nên KHÔNG cấp thêm lượt vượt 30/ngày. Lượt tặng đóng băng (không mất, không dùng ở chế độ ngày).
-- Khóa độc quyền chờ mọi lượt quét/Admin đang chạy xong rồi mới đổi chế độ.
-- Không chạy lại các file RUN_NOW_2026-10-31 cũ: sẽ ghi đè wrapper và bỏ bộ đếm hợp nhất.
begin;
select pg_advisory_xact_lock(7240211202601);
do $$ begin
  if to_regclass('public.nearby_scan_deployment') is null
    or to_regclass('public.nearby_scan_mode_day') is null
    or to_regprocedure('public.nearby_scan_today(uuid)') is null
    or to_regprocedure('public.nearby_scan_legacy_attempt(uuid)') is null then
    raise exception 'Chưa có v3 đầy đủ; không thể hoàn tác vận hành.';
  end if;
end $$;
-- Phòng trường hợp nguồn cũ ghi hit vào seen trước khi dừng traffic (chỉ thêm, không sửa).
insert into public.nearby_scan_saved_results(user_id,candidate_id,scanned_at)
select user_id,candidate_id,scanned_at from public.nearby_scan_seen where hit=true
on conflict(user_id,candidate_id) do nothing;
insert into public.nearby_scan_mode_log(mode,note)
select 'daily','rollback v3' from public.nearby_scan_deployment where id=1 and mode<>'daily';
update public.nearby_scan_deployment set mode='daily' where id=1 and mode<>'daily';
commit;
