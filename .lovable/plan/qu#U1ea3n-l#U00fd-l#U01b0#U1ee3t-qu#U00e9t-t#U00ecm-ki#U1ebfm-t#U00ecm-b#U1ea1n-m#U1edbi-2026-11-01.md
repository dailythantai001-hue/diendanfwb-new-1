# Quản lý lượt quét — Tìm kiếm / Tìm bạn mới

## Đã thực hiện và phạm vi chờ duyệt
- Ghi chú import ghi nhận khóa đã được lưu trước đây; kho secret và môi trường máy chủ hiện tại không có `SUPABASE2_SERVICE_ROLE_KEY`. Chưa xác minh nơi đã lưu; không yêu cầu nhập lại.
- Chỉ sửa bản SQL/hoàn tác chờ duyệt và kiểm thử PostgreSQL biệt lập. Không chạy SQL, sửa dữ liệu, RLS hay chức năng website trên #2. Cấu trúc đang chạy thực tế vẫn cần đối chiếu chỉ đọc.
- Không tạo Supabase mới, không di chuyển dữ liệu, không thay đổi Chat, VIP hoặc bài viết.

## Kết quả kiểm tra
- SQL hiện có đặt **30 lượt/ngày**, chưa có hạn mức tuần hay lượt tặng: `RUN_NOW_2026-10-31_SB2_nearby_scan.sql`, bảng `nearby_scan_daily` và hàm `nearby_scan_attempt`.
- `nearby_scan_seen` giữ lịch sử theo từng người dùng và tài khoản đã quét, có cột `hit`. Việc tính lượt và ghi lịch sử đang được xử lý nguyên tử qua `nearby_scan_attempt_candidate`.
- `recentResults` hiện ưu tiên tối đa 500 kết quả trúng, có dự phòng lịch sử trong ngày tối đa 60. SQL phân trang chưa đủ: sau khi duyệt cần thay đường đọc server và giao diện để tải tiếp đầy đủ.
- Admin hiện đã có giao diện tặng/reset/xóa và đếm ngược, nhưng lời xác nhận và cách tính cũ chưa phù hợp yêu cầu mới; sẽ sửa đồng bộ sau duyệt. Quyền Admin tiếp tục kiểm tra trên #1 trước khi đọc/ghi #2.

## Những thay đổi sẽ triển khai

### 1. Tặng lượt theo tài khoản
- Giữ hai cài đặt hiện có; bổ sung mục **Tặng lượt** và danh sách tài khoản từng quét, phân trang và nút làm mới thủ công.
- Hiển thị tên/ID, lượt dùng hạn mức từ lần Reset gần nhất, tổng lần quét thực tế/trúng/xịt tuần, số dư tặng, tổng tặng/đã tiêu và lượt còn lại. Thành viên lấy từ #1; hạn mức ở #2 dùng UUID #1.
- Bấm từng tài khoản để tặng **+1**, **+2** hoặc nhập số nguyên dương. Cập nhật ngay số còn lại khi thành công; không báo thành công nếu lưu lỗi.
- Chặn bấm lặp, cộng lượt nguyên tử; mỗi yêu cầu có mã duy nhất để gửi lại do mất mạng không cộng hai lần.

### 2. Hạn mức và reset tuần
- **20 lượt cơ bản/tuần/tài khoản**, thêm lượt Admin tặng. Một lần quét hợp lệ, dù trúng hay không trúng, sử dụng một lượt như quy trình hiện tại; ứng viên đã quét hoặc yêu cầu lỗi không bị tính thêm.
- Dùng cơ bản trước: `còn lại = 20 - base_used + gift_balance`. `gift_balance = gifts_granted - gifts_spent` lưu riêng theo người, không thuộc một tuần; chỉ giảm khi cơ bản đã hết và lượt quét thành công.
- Kỳ tuần bắt đầu đúng **12:00 Chủ nhật, Asia/Ho_Chi_Minh** (05:00 UTC). Chủ nhật trước 12:00 vẫn thuộc kỳ trước.
- **Bảo toàn mọi lượt tặng chưa tiêu qua Reset thủ công và đổi tuần.** Không hoàn lại lượt tặng đã tiêu: tặng 5, dùng 22 lượt (20 cơ bản + 2 tặng), còn 3; Reset cho 20 cơ bản + 3 tặng = 23. Reset lần nữa vẫn 23, không nhân đôi.
- Đếm ngược ngày/giờ/phút/giây đến mốc reset, dựa trên thời gian server, cập nhật nhẹ mỗi giây. Khi hết giờ, tải lại hạn mức; đồng hồ trình duyệt không quyết định quyền quét.
- Reset tự động bằng kỳ thời gian trong cơ sở dữ liệu: ngay tại mốc 12:00, mọi lượt đọc/quét dùng kỳ mới với 0 dùng hạn mức, 20 cơ bản mới cộng số dư tặng giữ nguyên, kể cả website không mở. Không phụ thuộc cron hoặc việc xóa bảng vào giờ reset. Kỳ cũ được giữ để kiểm tra, không được tính vào hạn mức mới.

### 3. Reset và Xóa lịch sử tách biệt
- **Reset** chỉ đặt `used=0, base_used=0`; giữ số dư tặng, tổng/trúng/xịt thực tế, dữ liệu tuần cũ và thời gian chờ. Không đổi mốc Chủ nhật kế tiếp. Reset-all nguyên tử với quét/tặng.
- **Xóa lịch sử** chỉ xóa `nearby_scan_history` (nhật ký có thể xóa), không xóa `nearby_scan_seen` (danh sách đã quét vĩnh viễn), bảng kết quả trúng, hạn mức, thống kê, tài khoản/ảnh hoặc nhật ký Admin.
- Kết quả trúng lưu riêng, ID và thời gian ổn định. Xóa lịch sử **không cho quét lại** ứng viên đã quét (trúng/xịt/chưa xác định). Yêu cầu lặp không trừ lượt, không ghi đè hoặc xóa kết quả.
- Danh sách tài khoản từng dùng quét được lấy từ thống kê đã giữ và nhật ký hạn mức, không phụ thuộc lịch sử có thể bị xóa.

### 4. Giữ kết quả qua tuần
- Trước khi chuyển phần khôi phục, sao lưu các kết quả `hit = true` hiện có sang bảng kết quả riêng, giữ nguyên `user_id`, `candidate_id` và thời điểm.
- Kết quả trúng từ mọi tuần: RPC keyset mặc định 100/trang, tối đa 200/trang, **không giới hạn tổng**. Cursor `(scanned_at,candidate_id)`, chụp `until` trang đầu và dùng lại; nút Tải tiếp đọc đến hết, lấy hồ sơ #1 theo từng trang. Không lấy một mảng 500 rồi coi là đầy đủ.
- Không xóa dữ liệu `nearby_scan_daily` cũ. Các kết quả chưa từng được lưu hoặc hồ sơ nguồn đã bị xóa trước đây không thể được tạo lại từ thông tin không còn tồn tại.

## Chi tiết kỹ thuật và SQL dự kiến — chỉ để duyệt

### Supabase #2: cấu trúc mới
Bản v2 có **6 bảng mới**, không còn 3 bảng; không ALTER hoặc đổi RLS bảng cũ:
- `nearby_scan_accounts`: số dư tặng xuyên tuần; snapshot thống kê ngày cũ và bộ đếm mới tách biệt; thời gian chờ.
- `nearby_scan_weekly`: hạn mức dùng/base từ Reset gần nhất, tách tổng/trúng/xịt thực tế không bị Reset xóa.
- `nearby_scan_quota_actions`: yêu cầu Admin, payload và kết quả để retry không cộng lại; không cho tái dùng mã với payload khác.
- `nearby_scan_saved_results`: ID/thời gian kết quả trúng bất biến, phục vụ phân trang.
- `nearby_scan_history`: nhật ký có thể xóa, độc lập danh sách đã quét vĩnh viễn.
- `nearby_scan_deployment`: thời điểm chuyển, chế độ tuần/ngày, định nghĩa hàm thực tế trước triển khai.
Mỗi bảng có GRANT service_role và RLS; browser không có quyền. Không tạo FK tới auth #2; luôn xác minh danh tính/Admin #1 trước RPC.

### Thống kê và chuyển tiếp
- Tổng trọn đời = snapshot tổng ngày trước triển khai + tổng mới sau triển khai. Trúng/xịt cộng hai phần không giao nhau, không MAX và không cộng lại backfill tuần.
- Tổng quét thực tế tuần luôn = trúng + xịt; Reset chỉ xóa dùng hạn mức, không xóa thống kê thực tế. Giao diện phân biệt hai số khi có Reset.
- Trước chuyển: đối chiếu từng ngày từ ngày Chủ nhật với lịch sử đầy đủ và hit; tính phần sau 12:00 đúng bằng timestamp. Nếu không khớp/mất lịch sử, SQL dừng toàn bộ để đối soát riêng, không tự suy đoán hoặc bỏ qua.
- Dừng mọi nguồn ghi quét/Admin, backup và đọc cấu trúc thực tế trước chạy. Bản v1 chưa chạy; nếu phát hiện bảng tuần đã tồn tại, v2 dừng thay vì áp dụng chồng.

### Đồng thời và mốc tuần
- Quét/tặng/reset một người khóa global chia sẻ rồi khóa theo user; thao tác tất cả khóa global độc quyền. Mã yêu cầu Admin có khóa riêng, payload phải khớp khi retry. Mọi khóa giữ đến COMMIT.
- Mọi scan lỗi rollback toàn bộ lịch sử/lượt/kết quả. Candidate trùng không bị trừ. Hai lượt cuối chỉ một được dùng nếu chỉ còn một slot.
- Tặng +1/+2 cộng nguyên tử; không cập nhật từ bản sao số dư client. Tổng tặng, đã tiêu và số dư có CHECK ràng buộc.
- Lấy clock server sau khi chờ khóa; mốc Chủ nhật 12:00 Asia/Ho_Chi_Minh = 05:00 UTC. Đồng hồ UI dùng `server_now/next_reset`, không quyết định quyền quét.
- PostgreSQL biệt lập đã kiểm thử quy tắc; chưa stress-test nhiều kết nối PostgreSQL thật. PGlite chạy hàng đợi một kết nối, không phải bằng chứng cho các lịch xen kẽ nhiều phiên.

### Hoàn tác vận hành
- File riêng chuyển `mode=daily` dưới khóa global; gọi bản hàm ngày thực tế đã chụp. Không chạy lại SQL cũ, không DROP bảng hay dữ liệu.
- Giữ wrapper ghi seen/history/saved_results cho mọi hit mới, cùng RPC phân trang và thống kê chính xác. Quota ngày theo hàm cũ; số dư tặng được giữ nhưng đóng băng, Admin tuần bị chặn.
- Giao diện phải đọc mode và chuyển ngày/tuần đúng cùng đợt; không thể hứa hiển thị đầy đủ nếu vẫn giữ đường đọc cũ 500.
- Đây là rollback chức năng, không khôi phục thời gian DB. Muốn phục hồi đầy đủ nhật ký đã xóa cần backup/PITR riêng được duyệt.

## Kiểm chứng và thứ tự thực hiện
1. Cung cấp ngay kế hoạch và toàn bộ SQL v2/hoàn tác để xem; đã chạy kiểm thử dữ liệu giả, không chạy trên #2.
2. Trình SQL cuối cùng để bạn duyệt **riêng**; không chạy SQL chỉ vì kế hoạch được duyệt.
3. Sau khi được đồng ý áp dụng cấu trúc, cập nhật đúng phần Tìm kiếm và kiểm tra:
   - 20 lần hợp lệ hết lượt; +1/+2/số nhập cộng đúng tài khoản, tài khoản khác không thay đổi.
   - Gửi lặp và quét đồng thời không vượt hạn mức hay cộng tặng hai lần.
   - Chủ nhật 11:59:59 → 12:00:00 Việt Nam: 20 cơ bản mới, tặng dư giữ nguyên, kết quả cũ vẫn hiện sau tải lại.
   - Reset giữ tặng/kết quả/thống kê; Xóa lịch sử giữ hạn mức, seen vĩnh viễn và kết quả trúng.
   - Người không phải Admin không được tặng/reset/xóa; lỗi lưu không tạo thông báo thành công.
4. Kiểm tra thực tế bằng tài khoản Admin/người dùng hiện có khi có phiên hợp lệ; không tạo tài khoản giả hoặc dùng lượt thật khi chưa được cho phép.
5. Kiểm tra tải tiếp 601+ kết quả, hit mới sau rollback, reset-all/quét/tặng nhiều phiên thật trên môi trường biệt lập trước khi dùng dữ liệu thật.
