-- Supabase #4 (ybzdpxwbpbkeqkqwbscp) — 💎 ALBUM SIÊU HOT
-- Chạy trong SQL Editor. Chỉ THÊM cột / đổi policy đọc / thêm bucket riêng tư.
-- Không xóa dữ liệu. Album HOT hiện có giữ nguyên (is_super = false).

alter table public.flash_albums
  add column if not exists is_super boolean not null default false;

-- Đọc công khai chỉ cho Album HOT thường. Album Siêu Hot chỉ đọc qua máy chủ (service role) sau khi xác minh VIP.
drop policy if exists "flash albums read" on public.flash_albums;
create policy "flash albums read" on public.flash_albums
  for select to anon, authenticated using (is_super = false);

drop policy if exists "flash album media read" on public.flash_album_media;
create policy "flash album media read" on public.flash_album_media
  for select to anon, authenticated using (
    exists (select 1 from public.flash_albums a where a.id = album_id and a.is_super = false)
  );

-- Bucket RIÊNG TƯ cho media Album Siêu Hot (không có policy đọc công khai).
insert into storage.buckets (id, name, public)
values ('flash-albums-vip', 'flash-albums-vip', false)
on conflict (id) do update set public = false;
