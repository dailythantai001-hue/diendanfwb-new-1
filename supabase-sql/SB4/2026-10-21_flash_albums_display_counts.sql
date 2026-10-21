-- Supabase #4 (ybzdpxwbpbkeqkqwbscp) — ALBUM SIÊU HOT: số lượng ảnh/video HIỂN THỊ do admin đặt.
-- Chỉ THÊM 2 cột cho phép NULL (NULL = dùng số media thực tế). Không xoá/sửa dữ liệu, không đổi RLS/policy/bucket.
alter table public.flash_albums
  add column if not exists display_image_count integer check (display_image_count is null or display_image_count >= 0),
  add column if not exists display_video_count integer check (display_video_count is null or display_video_count >= 0);
