-- Supabase #3 — chặn ĐỌC bài status='pending' với khách và thành viên khác.
-- CHƯA CHẠY. Chỉ chạy trên SQL Editor của Supabase #3 khi chủ dự án đồng ý.
-- Không xóa/sửa policy cũ, không đổi INSERT/UPDATE/DELETE, không bật/tắt RLS.

-- ========== BƯỚC 0: KIỂM TRA (chỉ đọc) ==========
-- select policyname, permissive, roles, cmd, qual, with_check
--   from pg_policies where schemaname='public' and tablename='posts';
-- select relrowsecurity, relforcerowsecurity from pg_class where oid='public.posts'::regclass;
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='posts' and column_name in ('status','user_id');
-- -> Kỳ vọng: user_id = uuid. Nếu là text thì báo lại trước khi chạy.

-- ========== BƯỚC 1: ÁP DỤNG ==========
BEGIN;
CREATE POLICY posts_hide_pending_from_others
  ON public.posts
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (
    status IS DISTINCT FROM 'pending'
    OR user_id = (SELECT auth.uid())
  );
COMMIT;

-- ========== HOÀN TÁC ==========
-- DROP POLICY IF EXISTS posts_hide_pending_from_others ON public.posts;
