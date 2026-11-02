# Thống nhất thông báo hạn chế VIP

## Kết quả phạm vi source
Mọi điểm mở popup hạn chế VIP **đang được tìm thấy trong source này** đi qua màn hình `VipZaloScreen`, trực tiếp hoặc qua alias `CommonLockedPopup`. Không sửa điều kiện quyền, không kích hoạt VIP, không thanh toán, không thay schema/project hoặc ghi dữ liệu DB. Cấu hình mới vẫn là `vip_zalo_v2`; không ghi đè `vip_unlock_popup`.

## Các điểm mở đã chuyển hoặc xác nhận dùng màn hình mới
| Điểm mở | File | Cách giữ điều kiện/trạng thái |
|---|---|---|
| Chat gọi thoại/video ở header và menu | `chat-page.tsx` | Đã dùng VIP ZALO; giữ `callNotice` và bản nháp Chat |
| Chat thông tin người dùng: các mạng xã hội và khu vực quốc tế | `chat-user-info-panel.tsx` | Đã dùng VIP ZALO; bảng thông tin giữ mounted |
| Chat nhóm mồi → Tham Gia Ngay | `bait-groups-list.tsx` | Alias mới; không xóa `infoGroup` khi mở VIP, Back giữ bảng nhóm |
| FWB hồ sơ → Kết nối/Yêu thích/Nhắn tin | `fwb-page.tsx` | Alias mới; giữ `miniProfile` và tương tác; hành động liên hệ thống nhất theo VIP ZALO |
| FWB bảng kết nối → Đã thích bạn khi `!isVip` | `liked-sheet.tsx` | Bỏ giao diện giới thiệu VIP riêng; mở VIP ZALO, không đổi tab gốc; vẫn không cho đọc danh sách |
| Chọn Sever/khu vực khác Hỗn Tạp | `sever-picker.tsx` | Giữ khóa mọi khu vực và loading; thay thông báo cũ bằng VIP ZALO; Back đóng màn hình VIP, không chuyển khu vực, không tự hết giờ; giữ menu/lựa chọn/tìm kiếm gốc |
| Xem thông tin liên hệ không đủ quyền | `contact-panel.tsx` | `ZaloVipLockModal` → alias mới; `canOpenContact` và `ensureAllowed` nguyên trạng |
| Liên hệ trong nội dung bài viết | `post/PostBody.tsx` | `ContactVipLockModal` → alias mới; kiểm tra chủ bài/quyền liên hệ nguyên trạng |
| Các mạng xã hội trên thẻ bài viết | `post/PostContactActions.tsx` | Alias mới; giữ menu mounted, tạm dừng listener đóng do click/scroll khi VIP đang mở |
| Facebook/Zalo trên thẻ hồ sơ | `profile-id-card-popup.tsx` | Alias mới; `useIsVip` không sửa; hồ sơ giữ mounted |
| Mạng xã hội ở dải UID hồ sơ | `profile-uid-badge.tsx` | Alias mới; giữ nguyên nhánh chỉnh sửa/khóa |
| Gửi voice trong màn tạo bài | `create-post-view.tsx` | Alias mới; `canSendVoice` nguyên trạng |
| Gửi voice trong composer Feed | `feed-page.tsx` | Alias mới; giữ ngoại lệ Admin/clone và `canSendVoice` |
| Feed hết lượt dưới VIP 5 | `feed-page.tsx` | Thêm nút xem quyền lợi mở VIP ZALO; vẫn chặn đăng, giữ 5/20 lượt và ngưỡng VIP 5; VIP ≥5 hết lượt vẫn nhắc quay lại ngày mai |
| Sự kiện `openPopup(...)` và khóa nhàn rỗi hồ sơ | `popup-engine.tsx`, `profile-page.tsx` | Alias mới cho mọi key runtime; callback `onClose` hiện hữu giữ nguyên, không chạy `onConfirm` hoặc nút wallet cũ |
| Mount tạo nhóm VIP 5 | `chat-page.tsx` | `VipUnlockModal` nay là alias mới; nhưng không có đường mở hoạt động trong source — xem giới hạn bên dưới |
| Mount cộng đồng trên hồ sơ | `profile-page.tsx` | `UnlockLetter` nay là alias mới; mount hiện không có setter mở hoạt động |

Aliases được kiểm thử: `CommonLockedPopup`, `VipUnlockModal`, `VipRequiredPopup`, `ZaloVipLockModal`, `ContactVipLockModal`, `CommunityVipModal`, `VipCommunityPopup`, `UnlockLetter`.

## Những ngoại lệ giữ lại, không phải điểm mở hạn chế VIP đã bỏ sót
- **Admin xem trước cấu hình popup cũ:** `VipPopupManager` chỉ dùng `legacy-vip-popup-preview.tsx`. Giữ giao diện/data cũ để quản lý, không dùng trong luồng người dùng.
- `SeverLockPopup`, `VipInstructionModal`, `LockedPostsCard`, `EngagementLockedCard`: source còn giữ nhưng tìm kiếm không thấy caller hoạt động. `SeverPicker` không còn import/mount popup khóa cũ.
- Payment QR/card, CRM hướng dẫn/thông tin, form đăng ký, chặn moderation/an toàn/tài khoản, nội dung Code/Album không phải thông báo hạn chế VIP; không chuyển đổi hoặc thay quyền.
- Runtime `candy:open-popup` nhận key động; mọi key đều dùng cùng adapter. Không thể liệt kê các tác nhân bên ngoài source phát sự kiện.

## Lưu ý quan trọng về VIP 5 tạo nhóm
Source hiện có `showVipGate = false`, nhưng không có setter đưa nó thành `true`. `showCreateGroup` cũng không có opener hoạt động được tìm thấy. `CreateGroupModal` gọi RPC `create_group`; source không thể xác minh quyền trong RPC đang triển khai ở DB cũ. Không thêm hoặc bỏ quyền trong nhiệm vụ giao diện này. **Không tuyên bố đã kiểm tra điều kiện VIP 5 tạo nhóm đang hoạt động**; chỉ xác nhận mount thông báo đó dùng màn hình mới nếu được mở.

Ngưỡng VIP 5 đang hoạt động trong quota Feed giữ nguyên. Test riêng xác nhận VIP 4 còn bị cooldown khu vực, VIP 5 được bypass theo helper hiện hữu — không phải test tạo nhóm.

## File thực thi thay đổi
- `common-locked-popup.tsx`: cầu nối mới; legacy props/callback CTA không còn hiển thị hoặc thực thi. Callback đóng giữ nguyên.
- `legacy-vip-popup-preview.tsx`: bản nguyên trạng màn hình cũ, riêng Admin.
- `admin-v3/vip/VipPopupManager.tsx`: trỏ bản xem trước cũ riêng biệt.
- `liked-sheet.tsx`, `sever-picker.tsx`, `bait-groups-list.tsx`, `post/PostContactActions.tsx`, `feed-page.tsx`: các điểm riêng và bảo toàn trạng thái.
- Tests mới/cập nhật: `common-locked-popup.test.tsx`, `vip-unified-entrypoints.test.tsx`, `vip-zalo-entrypoints.test.tsx`, `liked-sheet.test.tsx`, `sever-picker.test.tsx`, `bait-groups-list.test.tsx`, `fwb-page.test.tsx`, `contact-permission.test.ts`, `vn-provinces.test.ts`.
- `AGENTS.md`, `roadmap.md`, báo cáo này: quy tắc và giới hạn xác minh.

## Kiểm thử và mức xác minh
- 53 test/13 file đạt: các aliases và runtime event, không thực thi CTA nâng cấp cũ, đóng/Back/Escape, giữ bản nháp/tab/scroll/focus, FWB giữ hồ sơ và tương tác, liên hệ mới thống nhất, nhóm giữ thông tin, bảng yêu thích giữ quyền, khu vực không đổi lựa chọn, contact level 1/2, helper VIP 4/5, quyền server helper, cấu hình/quyền lợi hồi quy.
- Browser Chromium tại 393×852 và 1280×1800: sáu adapter thật cùng mở một màn hình, Back giữ URL/draft/hồ sơ/scroll/focus; ảnh đã xem sau animation, không còn màn hình cũ, không lỗi pageerror. Đây là fixture cô lập với auth/config mô phỏng, **không phải tài khoản thật**.
- Không xác minh mọi opener end-to-end trên DB cũ vì không có phiên đăng nhập dùng được cho hệ thống ngoài; không thử điện thoại vật lý, quyền RPC tạo nhóm hoặc Admin save thật.
- Tìm lại toàn source: old presentation chỉ được import bởi Admin preview; UI regional/liked-you cũ không còn caller trong luồng hoạt động; aliases đều trỏ một màn hình. Static audit không thay thế kiểm thử mọi tài khoản/entrypoint thật.
- Biên dịch tự động cuối đạt `build OK`. Test liên hệ cũ có cảnh báo `act(...)`, không có test thất bại.