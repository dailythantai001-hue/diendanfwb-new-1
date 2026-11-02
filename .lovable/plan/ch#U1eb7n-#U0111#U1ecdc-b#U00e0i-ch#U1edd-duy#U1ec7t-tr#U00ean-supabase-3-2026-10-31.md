# Chặn đọc bài "chờ duyệt" trên Supabase #3

## Hiện trạng (đã kiểm tra, chưa thay đổi gì)
- Khách chưa đăng nhập đọc được bài `status = pending` trên #3: truy vấn chỉ dùng khóa công khai vẫn trả về bài pending đang có.
- Trang chủ hiện tải cả bài pending về trình duyệt rồi mới ẩn bằng code. Bài vẫn đọc được qua công cụ mạng của trình duyệt.
- Phiên #3 của thành viên có cùng ID với tài khoản #1, nên trên #3 xác định được "chủ bài viết".
- #3 **không** xác định chắc chắn được Admin, vì quyền Admin nằm ở #1. Vì vậy không nên dựa vào RLS #3 để cho Admin đọc pending.
- Khi đăng bài, website ghi bài rồi đọc lại ID bài vừa tạo. Vì vậy người đăng phải đọc được bài pending của chính mình, nếu không việc đăng bài sẽ lỗi.
- Chưa đọc được danh sách chính sách RLS thật đang chạy trên bảng `posts` của #3 (cần chạy câu kiểm tra ở Bước 1).

## Phương án

### Bước 1 – Kiểm tra (chỉ đọc, bạn chạy trên SQL Editor của #3)
```sql
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename='posts';
select relrowsecurity, relforcerowsecurity from pg_class where oid='public.posts'::regclass;
```

### Bước 2 – Sửa code trước (chưa đụng database)
- Tab Duyệt bài không đọc pending trực tiếp từ #3 nữa. Nó gọi điểm server `admin-review-post` (thêm cách đọc danh sách).
- Server xác thực Admin trên #1 bằng phiên người gọi, rồi đọc pending trên #3 bằng khóa server. Bộ lọc thành viên thật giữ nguyên.
- Duyệt/Từ chối giữ nguyên như vừa sửa, vốn đã chạy bằng khóa server.
- Tab vẫn hoạt động cả trước lẫn sau khi chạy SQL.

### Bước 3 – SQL đề xuất (chỉ chạy khi bạn đồng ý, trên #3)
```sql
BEGIN;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posts_hide_pending_from_others ON public.posts;
CREATE POLICY posts_hide_pending_from_others
  ON public.posts
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (status IS DISTINCT FROM 'pending' OR user_id = auth.uid());
COMMIT;
```
Vì sao an toàn:
- Chính sách dạng RESTRICTIVE chỉ **thu hẹp** quyền. Nó ghép thêm điều kiện "AND" vào các chính sách đọc đang có, không mở thêm quyền và không cần xóa chính sách cũ.
- Bài đã đăng (`published`) và các trạng thái khác không bị ảnh hưởng. Quy tắc ẩn bài hay xóa mềm cũ vẫn áp dụng.
- Khóa server (service role) bỏ qua RLS, nên tab Duyệt bài và nút Duyệt/Từ chối vẫn chạy.

Hoàn tác:
```sql
DROP POLICY IF EXISTS posts_hide_pending_from_others ON public.posts;
```

### Bước 4 – Kiểm tra sau khi chạy
- Khách: truy vấn pending bằng khóa công khai trả về 0 bài. Bài đã đăng vẫn hiện đủ (199 bài).
- Thành viên thường: đăng bài có ảnh thành công, thấy bài của mình, không thấy pending của người khác.
- Admin: tab Duyệt bài hiện bài pending; Duyệt làm bài lên trang chủ; Từ chối xóa bài; tải lại trang vẫn giữ kết quả.

## Bảng quyền sau khi sửa
| Ai | Bài đã đăng | Pending của mình | Pending của người khác |
|---|---|---|---|
| Khách | Đọc được | – | Không |
| Thành viên thường | Đọc được | Đọc được | Không |
| Admin trên website | Đọc được | Đọc được | Chỉ qua server, đã xác thực Admin ở #1 |

## Lưu ý
- Nếu có công cụ Admin khác sửa hoặc xóa trực tiếp bài pending từ trình duyệt qua phiên #3, công cụ đó sẽ không còn thấy bài pending. Hiện chỉ tab Duyệt bài làm việc này, và tab đã chuyển sang server.
- Không đổi đăng nhập, không đổi #1, không tạo bảng mới.
