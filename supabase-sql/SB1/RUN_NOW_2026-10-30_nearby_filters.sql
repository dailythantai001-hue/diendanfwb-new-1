-- Cài đặt "Tìm bạn mới" theo từng tài khoản. Chỉ TẠO bảng mới, không sửa/xóa dữ liệu cũ.
CREATE TABLE IF NOT EXISTS public.nearby_filters (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.nearby_filters TO authenticated;
GRANT ALL ON public.nearby_filters TO service_role;
ALTER TABLE public.nearby_filters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own nearby filters read" ON public.nearby_filters;
DROP POLICY IF EXISTS "own nearby filters insert" ON public.nearby_filters;
DROP POLICY IF EXISTS "own nearby filters update" ON public.nearby_filters;
CREATE POLICY "own nearby filters read" ON public.nearby_filters FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own nearby filters insert" ON public.nearby_filters FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own nearby filters update" ON public.nearby_filters FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Làm mới bộ nhớ đệm của API để bảng mới dùng được ngay.
NOTIFY pgrst, 'reload schema';
