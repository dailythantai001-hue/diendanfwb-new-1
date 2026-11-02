// Quận/huyện theo 63 tỉnh/thành (đơn vị hành chính cấp huyện). Dùng cho bộ lọc "Khu vực".
// Tỉnh/thành được xác định từ khu vực đăng ký trong hồ sơ — không bao giờ đoán tỉnh khác.
import { provinceNormKey } from "./nearby-scan";

const RAW: Record<string, string> = {
  "TP. Hồ Chí Minh": "Quận 1|Quận 3|Quận 4|Quận 5|Quận 6|Quận 7|Quận 8|Quận 10|Quận 11|Quận 12|Bình Thạnh|Gò Vấp|Phú Nhuận|Tân Bình|Tân Phú|Bình Tân|TP. Thủ Đức|Bình Chánh|Hóc Môn|Củ Chi|Nhà Bè|Cần Giờ",
  "Hà Nội": "Ba Đình|Hoàn Kiếm|Hai Bà Trưng|Đống Đa|Tây Hồ|Cầu Giấy|Thanh Xuân|Hoàng Mai|Long Biên|Nam Từ Liêm|Bắc Từ Liêm|Hà Đông|TX. Sơn Tây|Ba Vì|Chương Mỹ|Đan Phượng|Đông Anh|Gia Lâm|Hoài Đức|Mê Linh|Mỹ Đức|Phú Xuyên|Phúc Thọ|Quốc Oai|Sóc Sơn|Thạch Thất|Thanh Oai|Thanh Trì|Thường Tín|Ứng Hòa",
  "Đà Nẵng": "Hải Châu|Thanh Khê|Sơn Trà|Ngũ Hành Sơn|Liên Chiểu|Cẩm Lệ|Hòa Vang|Hoàng Sa",
  "Hải Phòng": "Hồng Bàng|Ngô Quyền|Lê Chân|Hải An|Kiến An|Đồ Sơn|Dương Kinh|TP. Thủy Nguyên|An Dương|An Lão|Kiến Thụy|Tiên Lãng|Vĩnh Bảo|Cát Hải|Bạch Long Vĩ",
  "Cần Thơ": "Ninh Kiều|Bình Thủy|Cái Răng|Ô Môn|Thốt Nốt|Phong Điền|Cờ Đỏ|Thới Lai|Vĩnh Thạnh",
  "An Giang": "TP. Long Xuyên|TP. Châu Đốc|TX. Tân Châu|TX. Tịnh Biên|An Phú|Châu Phú|Châu Thành|Chợ Mới|Phú Tân|Thoại Sơn|Tri Tôn",
  "Bà Rịa - Vũng Tàu": "TP. Vũng Tàu|TP. Bà Rịa|TX. Phú Mỹ|Châu Đức|Xuyên Mộc|Long Đất|Côn Đảo",
  "Bạc Liêu": "TP. Bạc Liêu|TX. Giá Rai|Đông Hải|Hòa Bình|Hồng Dân|Phước Long|Vĩnh Lợi",
  "Bắc Giang": "TP. Bắc Giang|TX. Việt Yên|TX. Chũ|Hiệp Hòa|Lạng Giang|Lục Nam|Lục Ngạn|Sơn Động|Tân Yên|Yên Dũng|Yên Thế",
  "Bắc Kạn": "TP. Bắc Kạn|Ba Bể|Bạch Thông|Chợ Đồn|Chợ Mới|Na Rì|Ngân Sơn|Pác Nặm",
  "Bắc Ninh": "TP. Bắc Ninh|TP. Từ Sơn|TX. Quế Võ|TX. Thuận Thành|Gia Bình|Lương Tài|Tiên Du|Yên Phong",
  "Bến Tre": "TP. Bến Tre|Ba Tri|Bình Đại|Châu Thành|Chợ Lách|Giồng Trôm|Mỏ Cày Bắc|Mỏ Cày Nam|Thạnh Phú",
  "Bình Dương": "TP. Thủ Dầu Một|TP. Dĩ An|TP. Thuận An|TP. Tân Uyên|TP. Bến Cát|Bàu Bàng|Bắc Tân Uyên|Dầu Tiếng|Phú Giáo",
  "Bình Định": "TP. Quy Nhơn|TX. An Nhơn|TX. Hoài Nhơn|An Lão|Hoài Ân|Phù Cát|Phù Mỹ|Tây Sơn|Tuy Phước|Vân Canh|Vĩnh Thạnh",
  "Bình Phước": "TP. Đồng Xoài|TX. Bình Long|TX. Phước Long|TX. Chơn Thành|Bù Đăng|Bù Đốp|Bù Gia Mập|Đồng Phú|Hớn Quản|Lộc Ninh|Phú Riềng",
  "Bình Thuận": "TP. Phan Thiết|TX. La Gi|Bắc Bình|Đức Linh|Hàm Tân|Hàm Thuận Bắc|Hàm Thuận Nam|Phú Quý|Tánh Linh|Tuy Phong",
  "Cà Mau": "TP. Cà Mau|Cái Nước|Đầm Dơi|Năm Căn|Ngọc Hiển|Phú Tân|Thới Bình|Trần Văn Thời|U Minh",
  "Cao Bằng": "TP. Cao Bằng|Bảo Lâm|Bảo Lạc|Hà Quảng|Hạ Lang|Hòa An|Nguyên Bình|Quảng Hòa|Thạch An|Trùng Khánh",
  "Đắk Lắk": "TP. Buôn Ma Thuột|TX. Buôn Hồ|Buôn Đôn|Cư Kuin|Cư M'gar|Ea H'leo|Ea Kar|Ea Súp|Krông Ana|Krông Bông|Krông Búk|Krông Năng|Krông Pắc|Lắk|M'Đrắk",
  "Đắk Nông": "TP. Gia Nghĩa|Cư Jút|Đắk Glong|Đắk Mil|Đắk R'lấp|Đắk Song|Krông Nô|Tuy Đức",
  "Điện Biên": "TP. Điện Biên Phủ|TX. Mường Lay|Điện Biên|Điện Biên Đông|Mường Ảng|Mường Chà|Mường Nhé|Nậm Pồ|Tủa Chùa|Tuần Giáo",
  "Đồng Nai": "TP. Biên Hòa|TP. Long Khánh|Cẩm Mỹ|Định Quán|Long Thành|Nhơn Trạch|Tân Phú|Thống Nhất|Trảng Bom|Vĩnh Cửu|Xuân Lộc",
  "Đồng Tháp": "TP. Cao Lãnh|TP. Sa Đéc|TP. Hồng Ngự|Cao Lãnh|Châu Thành|Hồng Ngự|Lai Vung|Lấp Vò|Tam Nông|Tân Hồng|Thanh Bình|Tháp Mười",
  "Gia Lai": "TP. Pleiku|TX. An Khê|TX. Ayun Pa|Chư Păh|Chư Prông|Chư Pưh|Chư Sê|Đak Đoa|Đak Pơ|Đức Cơ|Ia Grai|Ia Pa|Kbang|Kông Chro|Krông Pa|Mang Yang|Phú Thiện",
  "Hà Giang": "TP. Hà Giang|Bắc Mê|Bắc Quang|Đồng Văn|Hoàng Su Phì|Mèo Vạc|Quản Bạ|Quang Bình|Vị Xuyên|Xín Mần|Yên Minh",
  "Hà Nam": "TP. Phủ Lý|TX. Duy Tiên|TX. Kim Bảng|Bình Lục|Lý Nhân|Thanh Liêm",
  "Hà Tĩnh": "TP. Hà Tĩnh|TX. Hồng Lĩnh|TX. Kỳ Anh|Cẩm Xuyên|Can Lộc|Đức Thọ|Hương Khê|Hương Sơn|Kỳ Anh|Lộc Hà|Nghi Xuân|Thạch Hà|Vũ Quang",
  "Hải Dương": "TP. Hải Dương|TP. Chí Linh|TX. Kinh Môn|Bình Giang|Cẩm Giàng|Gia Lộc|Kim Thành|Nam Sách|Ninh Giang|Thanh Hà|Thanh Miện|Tứ Kỳ",
  "Hậu Giang": "TP. Vị Thanh|TP. Ngã Bảy|TX. Long Mỹ|Châu Thành|Châu Thành A|Long Mỹ|Phụng Hiệp|Vị Thủy",
  "Hòa Bình": "TP. Hòa Bình|Cao Phong|Đà Bắc|Kim Bôi|Lạc Sơn|Lạc Thủy|Lương Sơn|Mai Châu|Tân Lạc|Yên Thủy",
  "Hưng Yên": "TP. Hưng Yên|TX. Mỹ Hào|Ân Thi|Khoái Châu|Kim Động|Phù Cừ|Tiên Lữ|Văn Giang|Văn Lâm|Yên Mỹ",
  "Khánh Hòa": "TP. Nha Trang|TP. Cam Ranh|TX. Ninh Hòa|Cam Lâm|Diên Khánh|Khánh Sơn|Khánh Vĩnh|Trường Sa|Vạn Ninh",
  "Kiên Giang": "TP. Rạch Giá|TP. Hà Tiên|TP. Phú Quốc|An Biên|An Minh|Châu Thành|Giang Thành|Giồng Riềng|Gò Quao|Hòn Đất|Kiên Hải|Kiên Lương|Tân Hiệp|U Minh Thượng|Vĩnh Thuận",
  "Kon Tum": "TP. Kon Tum|Đăk Glei|Đăk Hà|Đăk Tô|Ia H'Drai|Kon Plông|Kon Rẫy|Ngọc Hồi|Sa Thầy|Tu Mơ Rông",
  "Lai Châu": "TP. Lai Châu|Mường Tè|Nậm Nhùn|Phong Thổ|Sìn Hồ|Tam Đường|Tân Uyên|Than Uyên",
  "Lạng Sơn": "TP. Lạng Sơn|Bắc Sơn|Bình Gia|Cao Lộc|Chi Lăng|Đình Lập|Hữu Lũng|Lộc Bình|Tràng Định|Văn Lãng|Văn Quan",
  "Lào Cai": "TP. Lào Cai|TX. Sa Pa|Bắc Hà|Bảo Thắng|Bảo Yên|Bát Xát|Mường Khương|Si Ma Cai|Văn Bàn",
  "Lâm Đồng": "TP. Đà Lạt|TP. Bảo Lộc|Bảo Lâm|Cát Tiên|Đạ Huoai|Đam Rông|Di Linh|Đơn Dương|Đức Trọng|Lạc Dương|Lâm Hà",
  "Long An": "TP. Tân An|TX. Kiến Tường|Bến Lức|Cần Đước|Cần Giuộc|Châu Thành|Đức Hòa|Đức Huệ|Mộc Hóa|Tân Hưng|Tân Thạnh|Tân Trụ|Thạnh Hóa|Thủ Thừa|Vĩnh Hưng",
  "Nam Định": "TP. Nam Định|Giao Thủy|Hải Hậu|Mỹ Lộc|Nam Trực|Nghĩa Hưng|Trực Ninh|Vụ Bản|Xuân Trường|Ý Yên",
  "Nghệ An": "TP. Vinh|TX. Cửa Lò|TX. Hoàng Mai|TX. Thái Hòa|Anh Sơn|Con Cuông|Diễn Châu|Đô Lương|Hưng Nguyên|Kỳ Sơn|Nam Đàn|Nghi Lộc|Nghĩa Đàn|Quế Phong|Quỳ Châu|Quỳ Hợp|Quỳnh Lưu|Tân Kỳ|Thanh Chương|Tương Dương|Yên Thành",
  "Ninh Bình": "TP. Ninh Bình|TP. Tam Điệp|Gia Viễn|Hoa Lư|Kim Sơn|Nho Quan|Yên Khánh|Yên Mô",
  "Ninh Thuận": "TP. Phan Rang - Tháp Chàm|Bác Ái|Ninh Hải|Ninh Phước|Ninh Sơn|Thuận Bắc|Thuận Nam",
  "Phú Thọ": "TP. Việt Trì|TX. Phú Thọ|Cẩm Khê|Đoan Hùng|Hạ Hòa|Lâm Thao|Phù Ninh|Tam Nông|Tân Sơn|Thanh Ba|Thanh Sơn|Thanh Thủy|Yên Lập",
  "Phú Yên": "TP. Tuy Hòa|TX. Sông Cầu|TX. Đông Hòa|Đồng Xuân|Phú Hòa|Sơn Hòa|Sông Hinh|Tây Hòa|Tuy An",
  "Quảng Bình": "TP. Đồng Hới|TX. Ba Đồn|Bố Trạch|Lệ Thủy|Minh Hóa|Quảng Ninh|Quảng Trạch|Tuyên Hóa",
  "Quảng Nam": "TP. Tam Kỳ|TP. Hội An|TX. Điện Bàn|Bắc Trà My|Đại Lộc|Đông Giang|Duy Xuyên|Hiệp Đức|Nam Giang|Nam Trà My|Nông Sơn|Núi Thành|Phú Ninh|Phước Sơn|Quế Sơn|Tây Giang|Thăng Bình|Tiên Phước",
  "Quảng Ngãi": "TP. Quảng Ngãi|TX. Đức Phổ|Ba Tơ|Bình Sơn|Lý Sơn|Minh Long|Mộ Đức|Nghĩa Hành|Sơn Hà|Sơn Tây|Sơn Tịnh|Trà Bồng|Tư Nghĩa",
  "Quảng Ninh": "TP. Hạ Long|TP. Cẩm Phả|TP. Móng Cái|TP. Uông Bí|TP. Đông Triều|TX. Quảng Yên|Ba Chẽ|Bình Liêu|Cô Tô|Đầm Hà|Hải Hà|Tiên Yên|Vân Đồn",
  "Quảng Trị": "TP. Đông Hà|TX. Quảng Trị|Cam Lộ|Cồn Cỏ|Đa Krông|Gio Linh|Hải Lăng|Hướng Hóa|Triệu Phong|Vĩnh Linh",
  "Sóc Trăng": "TP. Sóc Trăng|TX. Ngã Năm|TX. Vĩnh Châu|Châu Thành|Cù Lao Dung|Kế Sách|Long Phú|Mỹ Tú|Mỹ Xuyên|Thạnh Trị|Trần Đề",
  "Sơn La": "TP. Sơn La|Bắc Yên|Mai Sơn|Mộc Châu|Mường La|Phù Yên|Quỳnh Nhai|Sông Mã|Sốp Cộp|Thuận Châu|Vân Hồ|Yên Châu",
  "Tây Ninh": "TP. Tây Ninh|TX. Hòa Thành|TX. Trảng Bàng|Bến Cầu|Châu Thành|Dương Minh Châu|Gò Dầu|Tân Biên|Tân Châu",
  "Thái Bình": "TP. Thái Bình|Đông Hưng|Hưng Hà|Kiến Xương|Quỳnh Phụ|Thái Thụy|Tiền Hải|Vũ Thư",
  "Thái Nguyên": "TP. Thái Nguyên|TP. Sông Công|TP. Phổ Yên|Đại Từ|Định Hóa|Đồng Hỷ|Phú Bình|Phú Lương|Võ Nhai",
  "Thanh Hóa": "TP. Thanh Hóa|TP. Sầm Sơn|TX. Bỉm Sơn|TX. Nghi Sơn|Bá Thước|Cẩm Thủy|Đông Sơn|Hà Trung|Hậu Lộc|Hoằng Hóa|Lang Chánh|Mường Lát|Nga Sơn|Ngọc Lặc|Như Thanh|Như Xuân|Nông Cống|Quan Hóa|Quan Sơn|Quảng Xương|Thạch Thành|Thiệu Hóa|Thọ Xuân|Thường Xuân|Triệu Sơn|Vĩnh Lộc|Yên Định",
  "Thừa Thiên Huế": "Thuận Hóa|Phú Xuân|TX. Hương Thủy|TX. Hương Trà|TX. Phong Điền|A Lưới|Nam Đông|Phú Lộc|Phú Vang|Quảng Điền",
  "Tiền Giang": "TP. Mỹ Tho|TP. Gò Công|TX. Cai Lậy|Cái Bè|Cai Lậy|Châu Thành|Chợ Gạo|Gò Công Đông|Gò Công Tây|Tân Phú Đông|Tân Phước",
  "Trà Vinh": "TP. Trà Vinh|TX. Duyên Hải|Càng Long|Cầu Kè|Cầu Ngang|Châu Thành|Duyên Hải|Tiểu Cần|Trà Cú",
  "Tuyên Quang": "TP. Tuyên Quang|Chiêm Hóa|Hàm Yên|Lâm Bình|Na Hang|Sơn Dương|Yên Sơn",
  "Vĩnh Long": "TP. Vĩnh Long|TX. Bình Minh|Bình Tân|Long Hồ|Mang Thít|Tam Bình|Trà Ôn|Vũng Liêm",
  "Vĩnh Phúc": "TP. Vĩnh Yên|TP. Phúc Yên|Bình Xuyên|Lập Thạch|Sông Lô|Tam Đảo|Tam Dương|Vĩnh Tường|Yên Lạc",
  "Yên Bái": "TP. Yên Bái|TX. Nghĩa Lộ|Lục Yên|Mù Cang Chải|Trạm Tấu|Trấn Yên|Văn Chấn|Văn Yên|Yên Bình",
};

const BY_KEY = new Map<string, { province: string; districts: string[] }>(
  Object.entries(RAW).map(([province, list]) => [provinceNormKey(province), { province, districts: list.split("|") }]),
);
BY_KEY.set("hcm", BY_KEY.get(provinceNormKey("TP. Hồ Chí Minh"))!);
BY_KEY.set("saigon", BY_KEY.get(provinceNormKey("TP. Hồ Chí Minh"))!);
BY_KEY.set("hue", BY_KEY.get(provinceNormKey("Thừa Thiên Huế"))!);

/** Tỉnh/thành chuẩn + danh sách quận/huyện theo khu vực đăng ký; null nếu không xác định được. */
export function provinceDistricts(province: string | null | undefined): { province: string; districts: string[] } | null {
  if (!province || !province.trim()) return null;
  return BY_KEY.get(provinceNormKey(province)) ?? null;
}

/** Chỉ giữ các quận/huyện thật sự thuộc tỉnh đăng ký (không trùng lặp, đúng thứ tự gốc). */
export function sanitizeDistricts(province: string | null | undefined, selected: readonly string[]): string[] {
  const info = provinceDistricts(province);
  if (!info) return [];
  const set = new Set(selected);
  return info.districts.filter(d => set.has(d));
}

/**
 * Khu vực hiển thị cho một ứng viên (hồ sơ không lưu quận/huyện): ổn định cho từng cặp
 * user–ứng viên và LUÔN nằm trong các quận/huyện đã chọn ("Tất cả" = toàn bộ quận/huyện của tỉnh).
 */
export function scanDistrictFor(userId: string, candidateId: string, province: string | null | undefined, selected: readonly string[]): string | null {
  const info = provinceDistricts(province);
  if (!info) return null;
  const valid = sanitizeDistricts(province, selected);
  const pool = valid.length ? valid : info.districts;
  let h = 0x811c9dc5;
  const s = `district:${userId}:${candidateId}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return pool[h % pool.length]!;
}
