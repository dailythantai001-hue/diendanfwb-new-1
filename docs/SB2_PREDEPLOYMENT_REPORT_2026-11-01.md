# Báo cáo kiểm chứng SQL v2 và kế hoạch triển khai

Ngày: 01/11/2026. Dự án duy nhất dự kiến thay đổi: **Supabase #2 `pymwwuscoftmdcmmeckp`**.

## 1. Kết luận: CHƯA ĐỦ ĐIỀU KIỆN TRIỂN KHAI

- Đã chạy kiểm thử bằng **PostgreSQL 17.11 thật, nhiều kết nối độc lập**, trên máy thử nghiệm riêng với dữ liệu giả. Không phải PGlite xếp hàng một kết nối.
- 12 tình huống đạt, lặp lại **3 lần: 36/36 lượt kiểm tra đạt**; thêm 49 kiểm thử hiện có đạt ở 7 tệp.
- Kiểm tra mã nguồn phát hiện những điểm giao diện/chuyển đổi cần hoàn thiện. **Không xác nhận giao diện đã nối đầy đủ RPC v2.** Kế hoạch dưới đây bắt buộc nối đầy đủ trước mở lại tính năng.
- **Chưa đối chiếu được lịch sử thật #2**, chưa kiểm tra định nghĩa hàm/quyền/nguồn ghi đang triển khai, chưa tạo hoặc phục hồi thử backup thật. Đây là điều kiện dừng, không được bỏ qua.
- Danh sách secret hiện tại chỉ có `LOVABLE_API_KEY`, `LOVABLE_CRON_SECRET`; `SUPABASE2_SERVICE_ROLE_KEY` vắng mặt cả trong cấu hình và môi trường máy chủ. Không có kết nối được chia sẻ hoặc quyền PostgreSQL quản lý. Không yêu cầu nhập lại khóa; chưa xác định được nơi khóa trước đây đang được lưu.
- Không chạy SQL trên #2, không sửa dữ liệu/quyền/schema, không tạo dự án thay thế, không thay đổi website đang sử dụng. SQL v2 và rollback giữ nguyên trong lần kiểm tra này. Chỉ thêm kiểm thử và tài liệu.

## 2. Bằng chứng kiểm thử nhiều kết nối

### Môi trường và cách kiểm tra

PostgreSQL 17.11, database giả `weekly_concurrency_fixture`, Unix socket riêng trong `/tmp`, không lắng nghe địa chỉ mạng. Mỗi thao tác sử dụng một tiến trình `psql` và kết nối libpq riêng; tối đa 32 tác vụ đồng thời. Đo `pg_stat_activity` xác nhận **12 PID PostgreSQL riêng cùng active**, giữ khóa chia sẻ trong cùng khoảng thời gian.

Nạp ba bản SQL quét ngày trong repository, rồi áp dụng SQL v2 **chỉ vào database giả**. Đây không phải bản sao dữ liệu thật; không chứng minh định nghĩa đang chạy ở #2 giống repository.

Runner lưu tại `scripts/weekly-scan-postgres-concurrency.py`; bằng chứng JSON ba lần chạy kèm trong Files. Runner chỉ cho phép socket thử nghiệm cố định, không đọc khóa hay URL #2.

| Tình huống | Kết quả và điều đã xác nhận |
|---|---|
| 12 kết nối độc lập | 12 PID cùng active; không phải một hàng đợi PGlite |
| 4 người dùng, 40 yêu cầu/người | 160 yêu cầu: đúng 80 thành công, 80 bị từ chối hết lượt; mỗi người đúng 20; seen/saved/counters khớp |
| 24 yêu cầu cùng người/cùng ứng viên | Chỉ 1 lượt được tính, 23 trả `seen=true`; không trừ lặp |
| 24 lần cùng mã yêu cầu tặng +2 | Chỉ cộng 2 lượt, một kết quả mới; 23 kết quả duplicate; đổi số tiền với cùng mã bị từ chối |
| 10 yêu cầu tặng +1 song song với 40 lượt quét | Sau thử vét hạn mức bằng ứng viên mới: đúng 30 lượt, 10 đã tặng/10 đã dùng, dư 0; không mất/cộng trùng |
| Quét + 5 lần tặng +2 + 2 reset cùng người | Nhật ký cùng giao dịch/khóa ghi thứ tự thực tế; mô phỏng lại từng bước khớp `remaining` và số dư; tổng tặng 17, đã dùng 7, dư 10 |
| Reset tất cả + xóa lịch sử tất cả + 10 người được tặng/quét | 42 thao tác đạt, 30 kết quả trúng còn nguyên, 20 lượt tặng còn nguyên; không deadlock trong lần thử |
| Xóa lịch sử sau tranh chấp | Chỉ history về 0; seen/saved/thống kê còn nguyên; ứng viên cũ không bị tính lại |
| 40 lượt đồng thời, tỷ lệ trúng 0% | Đúng 20 xịt, 0 trúng, còn 0; không vượt 20 |
| 24 lượt đồng thời, độ trễ 60 giây | Chỉ 1 thành công, 23 bị chặn; chỉ 1 seen được lưu, insert bị từ chối rollback |
| Mốc tuần + giữ lượt tặng | 04:59:59 UTC thuộc tuần 25/10; đúng 05:00:00 UTC chuyển 01/11; sang tuần vẫn giữ 7 tặng, còn 27 |
| Hoàn tác rồi 40 lượt đồng thời | Giữ 1 trúng trước hoàn tác + đúng 30 trúng mới; tổng saved/actual 31; không vượt 30/ngày; tặng tuần bị chặn |

**Đọc kết quả reset đúng cách:** reset là chủ động cấp lại 20 lượt cơ bản. Vì vậy tổng số quét thực tế có thể vượt 20 sau một hoặc nhiều reset; không coi đó là vượt hạn mức. Hạn mức kiểm tra tại từng giao dịch là `20 - base_used + gift_balance`. Thống kê thực tế không về 0. Khi gift/reset tranh chấp, thứ tự giao dịch hợp lệ có thể làm số lượt thành công khác nhau giữa các lần chạy; runner xác nhận đúng từng bước theo thứ tự đã khóa, không ép một kết quả ngẫu nhiên cố định.

49 kiểm thử bổ sung gồm 13 kiểm thử SQL v2, 4 thời gian tuần, 16 logic cộng đồng, 1 cấu hình, 5 SQL ngày, 5 lịch sử, 5 phục hồi kết quả. Bao gồm phân trang 601 trúng cùng timestamp không thiếu/trùng, quyền browser bị từ chối, và migration từ chối dữ liệu giả thiếu lịch sử, không để lại bảng mới.

**Giới hạn bằng chứng:** ba lần thử không phải chứng minh mọi lịch chạy vô hạn, mọi lỗi phần cứng, hoặc mọi phiên bản PostgreSQL. Chưa kiểm tra bản SQL/hàm/dữ liệu/traffic thật #2; chưa thử tải nhiều máy/chuyển tuần thực bằng đồng hồ hệ thống. Kiểm thử dùng 0%/100% để đếm chính xác, không đánh giá phân phối ngẫu nhiên 50%.

## 3. Tương thích hàm và tất cả nguồn ghi tìm được

### Đường ghi đang được mã nguồn hiện tại sử dụng

| Đường vào | Nguồn ghi |
|---|---|
| `openCommunityScan` | RPC `nearby_scan_open(p_user)`; mở trang cũng tạo hàng bộ đếm |
| `runCommunityScan` | RPC `nearby_scan_attempt_candidate(p_user,p_candidate)`; seen + lượt + kết quả cùng giao dịch |
| `communityScanAdmin` khi lưu | REST PATCH `nearby_scan_settings` (độ trễ/tỷ lệ) |
| `communityScanQuotaAction` | RPC `nearby_scan_admin_action(p_request,p_admin,p_action,p_user,p_amount)` |

Các đường trên nằm trong `src/lib/nearby-community.functions.ts`; kiểm tra người dùng/Admin tại #1 trước quyền dịch vụ #2. Không thấy frontend hiện tại ghi trực tiếp bộ đếm/lịch sử #2.

### Nguồn ghi SQL v2

- Bootstrap/backfill ghi deployment/accounts/weekly/saved_results/history, chụp hàm cũ.
- Open tạo account/tuần hiện tại; ở mode daily gọi legacy open.
- Attempt cập nhật số dư tặng, counters actual và quota; ở daily còn gọi hàm ngày cũ.
- Candidate wrapper ghi seen, gọi attempt, cập nhật kết quả/time, thêm history và saved hit.
- Admin action ghi gifts, reset `used/base_used`, hoặc chỉ xóa history; ghi request idempotency.
- Rollback bổ sung saved hit còn thiếu từ seen rồi chuyển mode daily; không DROP dữ liệu.

### Nguồn cũ/dormant cần kiểm tra trên hệ thống thật

- Các script `RUN_NOW_2026-10-31_SB2_nearby_scan*.sql` dùng `CREATE OR REPLACE`: chạy lại có thể ghi đè wrapper v2. Bản history ban đầu không lưu outcome; bản results mới thêm hit.
- RPC raw `nearby_scan_attempt(uuid)` tính lượt nhưng không có ứng viên nên không ghi seen/saved. Alias `nearby_scan_legacy_attempt(uuid)` ghi daily mà không đi qua actual counters v2 nếu bị gọi trực tiếp. V2 vẫn cấp quyền service_role cho chúng. **Không được tuyên bố đã loại bỏ mọi bypass.**
- localStorage `consumeScan` trong `src/lib/nearby-scan.ts`: 30/ngày theo UTC, không thấy caller runtime; không phải nguồn dữ liệu có thẩm quyền.
- `docs/sql/RUN_NOW_connect_v2_weekly_scan.sql`: hệ `connect_scan_usage` 30/tuần riêng.
- `docs/connect-lixi-system.sql`: `connect_start_lixi`, `connect_finish_lixi`, `connect_scan`, `purge_old_connect_history` ghi session/credit/history và xóa lịch sử >7 ngày; không thấy caller runtime hiện tại.
- `supabase/sql/RUN_NOW_nearby_scan_more.sql`: chỉ trừ gem ở profiles, không cấp quota v2; không dùng thay tặng lượt.
- Script purge dữ liệu thử và trigger interaction-points có nhắc bảng scan cũ; chưa biết có cài đặt hoặc đang hoạt động trên DB thật.

**Kết luận nguồn ghi:** inventory repository đã hoàn thành, nhưng inventory đang triển khai chưa thể chứng nhận. Phải đọc hàm/overload/trigger/cron/quyền, các release cũ, tiến trình bên ngoài và nơi dùng service key. `pg_stat_statements`/log nếu có chỉ là bằng chứng bổ sung, không chứng minh không có writer chưa xuất hiện. Khóa advisory v2 không tự chặn hàm cũ không tuân thủ khóa.

### Tương thích chữ ký

Bốn chữ ký cũ vẫn giữ: `nearby_scan_open(uuid)`, `nearby_scan_attempt(uuid)`, `nearby_scan_attempt_candidate(uuid,uuid)`, `nearby_scan_overview(integer)`. Không thấy mismatch tên tham số của caller hiện tại. Tuy nhiên `total` từ daily đổi sang actual của tuần, **không được lấy làm quota**; giao diện phải dùng trường `remaining`.

Hàm rollback dùng định nghĩa thực tế đã chụp; kiểm thử hiện nay chỉ chứng nhận định nghĩa fixture. Phải đối chiếu `pg_get_functiondef`, tham số có tên, returns JSONB, search_path/security/ACL/dependency trên #2 trước áp dụng. Có hàm cũ khác kỳ vọng trả `hit` hoặc dùng tên khác: dừng, không đoán.

## 4. Cam kết nối đầy đủ Admin và Tìm Bạn: hạng mục bắt buộc, CHƯA HOÀN THÀNH

| Hạng mục | Hiện tại | Phải làm trước mở traffic |
|---|---|---|
| Hạn mức người dùng | `search-page.tsx` lấy `total`, trừ `SCAN_LIMIT=30`, nhãn hôm nay | Dùng `mode/remaining/gift_balance/base_used/used` từ server; chặn khi còn 0; đọc lại sau gift/reset và focus |
| Kết quả đầy đủ | `recentResults` đọc saved `limit=500`; không cursor | RPC `nearby_scan_results_page`; 100/trang, cursor `(scanned_at,candidate_id)`, giữ `until`, nút tải tiếp, không tổng cap; hydrate profiles từng nhóm có giới hạn |
| Store theo người dùng | Chỉ cards/busy/restored/cooldown | Thêm cursor/has_more/until và chống tải trùng; khử trùng bằng candidate ID; remount không mất trang hay animation |
| Tặng/reset/xóa | Đã có nút và RPC call | Nối authoritative state v2 và refresh; confirmation đúng: giữ lượt tặng; xóa chỉ history, không seen/saved |
| Retry tặng | Mỗi lần bấm sinh UUID mới | Giữ mã + payload cho thao tác chưa rõ kết quả; retry/reconcile cùng mã, cả reload nếu đã ghi nhận pending; thao tác mới có mã mới |
| Đồng hồ | Tính Chủ nhật bằng helper, dùng thời gian máy chủ web | Trả nguyên `server_now/next_reset/week_start` từ #2, bù sai lệch mạng/clock, refresh ở mốc reset; không dùng local tính thay quota |
| Admin mode | Server bỏ mode/reset fields; UI luôn tuần | Mode weekly/daily rõ ràng; không giả lập quota khi RPC thiếu; daily khóa actions tuần, giữ xem đầy đủ trúng |
| Chọn tài khoản | Overview chỉ gồm người từng mở/quét | Có chọn/tìm người dùng thật #1 kể cả chưa mở quét; đọc quota target từ server, không giả định có trong overview |
| Kiểu dữ liệu/validation | Các type chỉ giữ fields cũ; amount reset có thể khác 0 | Contract chung đầy đủ; validation amount đúng SQL; giữ kiểm tra quyền/danh tính #1 |
| Rollback UI | Chưa phân biệt mode | Giữ RPC phân trang và candidate wrapper; chỉ đổi hiển thị/quota sang daily, không phục hồi reader cũ cap 500 |

Không thay account source, filters, hình ảnh, khoảng cách mô phỏng, đường dẫn dock hoặc hiệu ứng quét hiện tại. Cần kiểm thử giao diện bằng tài khoản được xác minh trước khi tuyên bố hoàn tất; không thay bằng demo/signed-out.

## 5. Đối chiếu lịch sử thực tế: CHƯA THỰC HIỆN, DỪNG

Thiếu quyền đọc #2. Không gọi RPC `open` để kiểm tra kết nối vì RPC này ghi hàng mới. Không thử `attempt` trên người dùng thật khi chưa cho phép.

Khi có quyền đọc sẵn có, thực hiện **transaction READ ONLY, REPEATABLE READ**. Phải lưu kết quả đối chiếu có timestamp/cutoff và mã dự án, bảo vệ UUID người dùng; không đưa dữ liệu cá nhân vào báo cáo công khai.

Checklist cần kết quả thật:
1. Version/schema/cột/constraint, settings id=1, bốn signatures, định nghĩa hàm, ACL, policies, triggers, cron/jobs.
2. Theo từng người/ngày Việt Nam: `daily.total = daily.hits + daily.misses`; seen count/hit=true/hit=false đối chiếu daily. Báo riêng seen.hit=NULL; tuyệt đối không biến NULL thành hit/miss.
3. Đối chiếu toàn bộ lịch sử để đánh giá snapshot lifetime; tách kiểm tra kỳ hiện tại theo logic fail-closed SQL v2. Ngày Chủ nhật phải kiểm tra cả sáng trước 12:00 và chiều sau 12:00, không nhóm theo UTC.
4. Timestamps NULL/tương lai, seen không có daily, daily không có seen, trùng hoặc thiếu định danh, profiles #1 đã xóa/đổi phân loại (ID được giữ nhưng có thể không hiển thị do lọc hiện tại).
5. Count/hash bộ seen IDs và hit IDs trước/sau; daily tổng theo người trước cutover; inventory old tables/function ACL. Backfill phải chỉ thêm, không xóa tài khoản hay seen.
6. Nếu đã có bất kỳ cấu trúc v1/v2, không áp dụng chồng; dừng báo phiên bản tồn tại. Nếu dữ liệu thiếu/không khớp, gửi số lượng/phạm vi sai lệch; không tự sửa hoặc suy đoán.

**Không đủ quyền đọc cũng là dừng, không phải “không có sai lệch”.** Kiểm thử fail-closed trên dữ liệu giả đã đạt, không thay thế đối chiếu thật.

## 6. Kế hoạch backup #2 và xác minh trước triển khai

Chưa thực hiện backup. Trước tiên người quản trị kiểm tra trang Backups của **đúng #2**, loại backup khả dụng (daily/PITR/logical), thời gian khôi phục và quyền tải/restore. Không giả định gói hiện tại có PITR hoặc file tải được. Nếu chỉ có backup ngày quá cũ hoặc không thể phục hồi thử: dừng triển khai đến khi có phương án được xác minh.

### Phạm vi backup bắt buộc

- Toàn bộ schema/data #2, không chỉ ba bảng scan: tables, constraints, indexes, views, sequences, functions, triggers, extensions, grants/roles và RLS/policies.
- Định nghĩa thực tế/ACL bốn hàm scan và dependency, cấu hình jobs. Không coi CSV bảng là backup đầy đủ.
- Nếu #2 dùng Storage: backup DB không bao gồm byte ảnh/video. Ghi rõ file-object/bucket backup riêng và giới hạn phục hồi; SQL này không sửa/xóa object.
- Credentials không nhét vào báo cáo/Files; giữ trong nơi bảo mật của người quản trị. Không tạo hay di chuyển dữ liệu sang dự án Supabase mới.

### Trình tự xác minh

1. Đặt maintenance trên **mọi writer**, gồm open/scan/Admin settings/quota, cron và script ngoài; chờ yêu cầu đang chạy kết thúc. Advisory lock không đủ để fence old functions.
2. Lấy điểm backup cuối sau khi drained bằng cơ chế backup/export chính thức của dự án, do người quản trị có quyền thực hiện. Xác nhận tên/mã dự án, UTC timestamp, loại backup, phạm vi/khả năng restore; giữ manifest không chứa khóa.
3. Nếu có artifact tải được: ghi checksum SHA-256 file backup và kích thước để phát hiện file hỏng. Checksum **không** chứng minh restore thành công.
4. Phục hồi vào môi trường PostgreSQL thử riêng tương thích version/extension/role #2; không restore lên production, không provision Supabase thay thế. Nếu physical/PITR không restore được ở local, cần phương án diễn tập do nhà cung cấp hỗ trợ và được bạn duyệt riêng; chưa chứng nhận chỉ dựa vào trạng thái “backup thành công”.
5. Restore phải hoàn tất không lỗi. So sánh exact row counts mọi bảng liên quan, manifest schema/constraints/function bodies/ACL, sorted seen IDs/hit IDs và aggregate daily. Dùng cùng snapshot cutoff hoặc maintenance; không so số liệu đang thay đổi.
6. Trên bản phục hồi: chạy đối chiếu fail-closed, áp dụng v2, kiểm thử nhiều kết nối và rollback; xác nhận hit cũ + hit mới sau rollback đều phân trang được. Chạy kiểm tra quyền với service-role/browser và mọi dependency đã phục hồi.
7. Chỉ đánh dấu backup VERIFIED khi có bằng chứng restore + so sánh đạt, nơi lưu an toàn và người có quyền phục hồi. Nếu một bước thiếu/lỗi, giữ maintenance hoặc chưa bắt đầu triển khai.

Backup dữ liệu sau cutover cũng cần có trước mọi thao tác phục hồi thực. Restore toàn DB về trước sẽ bỏ dữ liệu mới sau backup, nên **không** dùng như rollback vận hành thường ngày; ưu tiên chuyển mode không xóa dữ liệu.

## 7. Kế hoạch triển khai theo từng bước, mỗi cổng không đạt phải dừng

1. **Giữ nguyên production.** Hoàn tất quyền đọc và inventory thực tế; giải quyết nơi lưu khóa đã nhập bằng quản lý cấu hình được phép, không yêu cầu gửi lại khóa trong chat.
2. **Đối chiếu READ ONLY #2.** Dừng nếu thiếu/sai; báo bạn. Xác nhận không có v1/v2 đã triển khai; so signature/definition/ACL.
3. **Hoàn thiện server + Admin + Tìm Bạn** theo mục 4 trong nhánh chuẩn bị, không nối writer mới với production trước SQL. Kiểm thử mode cũ/v2/rollback, mất phản hồi gift và retry, tài khoản chưa scan, 601+ kết quả, reset clock.
4. **Khóa nguồn ghi cũ.** Inventory và maintenance toàn hệ thống, drain; cấm replay SQL cũ. Chỉ cho phép candidate/admin wrappers được duyệt. Nếu cần đổi grants/roles để ngăn raw/legacy callers, trình riêng SQL và tác động; không tự đổi security invoker thành security definer.
5. **Backup cuối và phục hồi diễn tập** theo mục 6; đối chiếu lại tại cutoff. Ghi baseline và bằng chứng backup VERIFIED.
6. **Gửi hồ sơ chốt**: SQL + rollback chính xác (phiên bản/hash nội dung), compatibility, writer inventory, dữ liệu đối chiếu, backup proof và thay đổi website. **Chờ bạn xác nhận riêng “áp dụng”**; đồng ý nguyên tắc/plan không thay thế phê duyệt SQL.
7. **Sau khi được duyệt**, chọn đúng #2, giữ maintenance, chạy đúng v2 transaction; fail-closed lỗi thì rollback transaction/dừng báo, không chữa dữ liệu để ép qua.
8. **Triển khai đồng bộ server và hai giao diện** khi maintenance còn bật. Chặn bundles/server cũ tiếp tục viết; kiểm tra mode, pagination và preserved IDs/counts trước reopen.
9. **Kiểm tra có phép trên tài khoản thật**: quét và đọc lại qua UI, tặng +1/+2/tùy ý, retry cùng mã, reset giữ gifts/results, xóa chỉ history, tải tiếp >500, đồng hồ Chủ nhật 12:00 VN. Đây là các thao tác ghi cần thuộc phạm vi bạn cho phép; không tự thử trước.
10. **Mở lại đúng writer paths**, giám sát `actual_total=hits+misses`, `gift_balance=granted-spent>=0`, base_used 0..20, quota/history/saved consistency. Sai lệch: dừng tính năng, không giả thành exhausted.
11. **Nếu hoàn tác**, maintenance + drain + backup sau cutover, chỉ chạy rollback vận hành được duyệt; giữ v2 wrappers và reader phân trang, chuyển UI daily; kiểm chứng trúng mới trước reopen, gifts đóng băng còn nguyên. Không chạy lại SQL ngày cũ.

## 8. Việc đang bị chặn

- Đối chiếu lịch sử/định nghĩa/quyền/writers thật: chưa có quyền đọc dự án #2 trong phiên này.
- Backup thật và diễn tập restore: chưa có backup khả dụng hoặc quyền nhà cung cấp được xác minh.
- Nối đầy đủ UI/server và kiểm tra tài khoản thật: công việc chuyển đổi còn lại; chưa áp dụng trong lần kiểm chứng này.
- Áp dụng SQL hoặc rollback production: **chờ bạn phê duyệt riêng**, và chỉ sau khi các cổng trên đạt.

Báo cáo này không coi kết quả local là chứng nhận production sẵn sàng.
