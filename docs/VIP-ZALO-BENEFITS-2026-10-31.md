# VIP ZALO: nhắc quyền lợi và bộ quốc tế dùng chung

## File thay đổi
- `src/lib/vip-zalo-config.ts`: bộ chung, giữ dữ liệu cũ, ID quyền lợi cũ ổn định, không cho lỗi đọc trở thành cấu hình trống có thể lưu.
- `src/lib/vip-zalo-seen.ts`: thêm kho trạng thái đã xem theo tài khoản/gói/quyền lợi.
- `src/components/candy/vip-zalo-screen.tsx`: nhắc từng mục, đánh dấu đúng mục khi mở, dùng bộ quốc tế chung sau xác nhận quốc gia.
- `src/components/admin-v3/vip/VipZaloManager.tsx`: quản lý một bộ quốc tế, xác nhận tạo bộ chung từ nội dung cũ.
- `src/styles/vip-zalo-screen.css`: lớp nền/viền vàng nhẹ, chu kỳ 3,6 giây, chỉ thay đổi độ trong suốt, không đổi kích thước; giảm chuyển động dùng màu tĩnh.
- Tests: `src/lib/vip-zalo-config.test.ts`, `src/lib/vip-zalo-seen.test.tsx`, `src/components/candy/vip-zalo-screen.test.tsx`, `src/components/admin-v3/vip/VipZaloManager.test.tsx`.
- `AGENTS.md`, `roadmap.md`: quy tắc bảo toàn và phạm vi kiểm tra.

## Trạng thái đã xem
Khóa trình duyệt `vip-zalo-seen:v1:<userId>`, mỗi mục lưu cặp `[vn|intl, benefitId]`. ID tài khoản lấy từ phiên đăng nhập; hồ sơ là nguồn dự phòng. Mở một mục chỉ đánh dấu mục đó. Bộ nhớ dùng chung giữ trạng thái khi màn hình bị đóng/mở lại; trình duyệt giữ qua tải lại. Đổi tài khoản hoặc gói không kế thừa trạng thái của tài khoản/gói khác. Quốc gia dùng chung trạng thái của gói quốc tế. Xem thử Admin có vùng trạng thái riêng, không đánh dấu thay người dùng. Nếu trình duyệt chặn lưu, giữ được trong phiên hiện tại nhưng không đảm bảo sau tải lại.

Không đồng bộ trạng thái giữa thiết bị; xóa dữ liệu trình duyệt sẽ mất dấu đã xem. Không có bảng mới hoặc thay đổi dữ liệu hồ sơ.

## Cấu hình quốc tế và bảo toàn
Vẫn dùng `admin_site_settings` với key `vip_zalo_v2`. Trường `intlShared` là danh sách duy nhất cho năm quốc gia. `vn` độc lập. `intl` cũ vẫn giữ; `intlLegacySnapshot` giữ nguyên JSON gốc kể cả trường không được phiên bản này hiểu.

Trước khi Admin chuyển đổi, màn hình dùng tập hợp chỉ đọc của mọi quyền lợi cũ theo thứ tự Đài Loan, Mỹ, Nhật Bản, Hàn Quốc, Canada; gộp bản sao giống hệt, giữ nội dung khác nhau và phân biệt ID trùng. Không tự chọn nội dung một nước và bỏ các nước khác; vì vậy tổng số quyền lợi có thể lớn hơn bộ của một nước.

Admin thấy số mục từng nước và số mục bộ chung dự kiến, bấm **Tạo bộ quyền lợi chung từ dữ liệu hiện có**, xác nhận, rồi sửa/sắp xếp và bấm **Lưu cấu hình VIP ZALO**. Đây là thao tác chủ động của Admin, không chạy chuyển đổi dữ liệu trên website lúc kiểm tra. Sau khi có bộ chung, thêm/sửa/xóa/sắp xếp chỉ tác động bộ chung. Bộ chung rỗng vẫn rỗng, không tự phục hồi từ dữ liệu cũ.

Không tạo dự án/bảng/cấu hình dịch vụ mới, không ghi DB thật trong quá trình thực hiện, không sửa `vip_unlock_popup`, popup nhiều trang, Chat/FWB hoặc cờ quốc gia. Không thêm quyền lợi mặc định.

## Kết quả kiểm tra
**35/35 test tự động, 7 file:** trạng thái từng mục; năm mục ban đầu chưa xem; remount; tài khoản/gói/preview độc lập; lưu bị chặn; năm quốc gia cùng bộ năm mục; sửa bộ chung và đọc lại với lưu mô phỏng; dữ liệu cũ và Việt Nam được giữ; bộ chung rỗng; ID cũ ổn định; popup/detail editor/entrypoint hồi quy.

**Trình duyệt Chromium, màn hình cô lập dùng code VIP thật và CSS website:** 393×852 và 1280×1800, kiểm tra năm mục nhắc ban đầu; mục 1 dừng, 4 mục còn lại tiếp tục; mở lần lượt; đóng chi tiết; đóng/mở lại VIP; tải lại; gói Việt Nam/quốc tế độc lập; cả năm quốc gia cùng nội dung; điều hướng trang chi tiết; kích thước/vị trí mục không đổi; giảm chuyển động không chạy animation. Ảnh đã được xem trực quan; không có lỗi pageerror trong các lần thử cuối.

**Website thực tế:** mở localhost và xác nhận màn hình đăng nhập hiển thị. Chưa đăng nhập tài khoản thật, chưa thử luồng VIP trên dữ liệu thật hoặc lưu Admin vào DB cũ. Màn hình cô lập dùng danh tính/nội dung mẫu chỉ để kiểm thử, không lưu quyền lợi mẫu lên website. Chưa thử điện thoại vật lý hoặc đo hiệu năng điện thoại. Không thể xem kiểm thử mô phỏng là xác nhận DB đang hoạt động end-to-end.

**Kiểm tra biên dịch tự động:** kết quả cuối `build OK`. Có cảnh báo `act(...)` từ các test liên hệ Admin hiện hữu; không có test thất bại.