-- HOÀN TÁC VẬN HÀNH v2 — CHỜ DUYỆT, CHƯA CHẠY.
-- Chỉ Supabase #2 pymwwuscoftmdcmmeckp, SAU KHI v2 COMMIT thành công.
-- Không khôi phục thời gian về trước; không DROP/DELETE dữ liệu.
-- Dừng traffic quét/Admin, sao lưu, chuyển UI sang mode daily cùng đợt.
-- Giữ nguyên seen, saved_results, history, phân trang, thống kê và số dư tặng.
-- Chuyển sang hàm ngày THỰC TẾ đã chụp trước triển khai.
-- Wrapper open/attempt v2 tự dispatch daily, candidate v2 vẫn lưu mọi hit mới.
-- Tặng/Reset/Xóa tuần bị chặn; số dư tặng đóng băng, không tự xóa hoặc dùng trong chế độ ngày.
-- Không chạy lại SQL cũ vì sẽ bỏ phần ghi saved_results cho hit mới.
begin;
select pg_advisory_xact_lock(7240211202601);
do $$ begin
  if to_regclass('public.nearby_scan_deployment') is null
    or to_regprocedure('public.nearby_scan_legacy_attempt(uuid)') is null
    or to_regprocedure('public.nearby_scan_results_page(uuid,timestamptz,uuid,integer,timestamptz)') is null then
    raise exception 'Chưa có v2 đầy đủ; không thể hoàn tác vận hành.';
  end if;
end $$;
-- Phòng trường hợp một nguồn cũ ghi hit vào seen trước khi dừng traffic.
insert into public.nearby_scan_saved_results(user_id,candidate_id,scanned_at)
select user_id,candidate_id,scanned_at from public.nearby_scan_seen where hit=true
on conflict(user_id,candidate_id) do nothing;
update public.nearby_scan_deployment set mode='daily' where id=1;
-- Những hàm/chữ ký v2 vẫn nguyên vẹn: không có khoảng trống làm mất hit mới.
-- daily không bị cộng vào legacy snapshot; mỗi lần quét tăng new_total đúng một lần.
commit;
-- ROLLBACK; chỉ dùng khi giao dịch chưa COMMIT hoặc đang bị lỗi.
-- Phục hồi chính xác toàn bộ DB về thời điểm cũ cần backup/PITR riêng và duyệt riêng.
