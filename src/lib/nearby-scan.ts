// "Tìm bạn mới" — lọc hồ sơ thật theo giới tính, tuổi, nhu cầu, khoảng cách, vóc dáng.
// Khoảng cách tính giữa tâm tỉnh/thành của 2 người (hồ sơ không lưu toạ độ GPS).

export type GenderFilter = "male" | "female";
export type NeedFilter = "fwb" | "ons" | "love";
export type BodyFilter = "slim" | "fit" | "chubby";

export interface ScanFilters {
  genders: GenderFilter[];
  ageMin: number;
  ageMax: number;
  needs: NeedFilter[];
  distMin: number;
  distMax: number;
  bodies: BodyFilter[];
  /** Quận/huyện thuộc tỉnh đăng ký; rỗng = Tất cả khu vực. */
  districts: string[];
}

export const AGE_MIN = 18;
export const AGE_MAX = 40;
export const DIST_MIN = 1;
export const DIST_MAX = 200;
export const SCAN_LIMIT = 30;
/** 1–10 km là vùng chưa mở khóa; khoảng cách hợp lệ bắt đầu từ 11 km. */
export const LOCKED_MAX_KM = 10;
export const UNLOCKED_MIN_KM = LOCKED_MAX_KM + 1;
export function isDistanceLocked(f: Pick<ScanFilters, "distMin">): boolean { return f.distMin <= LOCKED_MAX_KM; }


export const DEFAULT_FILTERS: ScanFilters = {
  genders: [],
  ageMin: AGE_MIN,
  ageMax: AGE_MAX,
  needs: [],
  distMin: LOCKED_MAX_KM + 1,
  distMax: DIST_MAX,
  bodies: [],
  districts: [],
};

/** Toạ độ trung tâm (tỉnh lỵ) 63 tỉnh/thành. */
const PROVINCE_COORDS: Record<string, [number, number]> = {
  "An Giang": [10.386, 105.435], "Bà Rịa - Vũng Tàu": [10.346, 107.084], "Bạc Liêu": [9.294, 105.727],
  "Bắc Giang": [21.273, 106.194], "Bắc Kạn": [22.147, 105.835], "Bắc Ninh": [21.186, 106.076],
  "Bến Tre": [10.241, 106.376], "Bình Dương": [10.980, 106.651], "Bình Định": [13.776, 109.224],
  "Bình Phước": [11.535, 106.883], "Bình Thuận": [10.928, 108.102], "Cà Mau": [9.177, 105.150],
  "Cao Bằng": [22.666, 106.258], "Cần Thơ": [10.045, 105.747], "Đà Nẵng": [16.054, 108.202],
  "Đắk Lắk": [12.668, 108.038], "Đắk Nông": [12.004, 107.688], "Điện Biên": [21.386, 103.023],
  "Đồng Nai": [10.957, 106.843], "Đồng Tháp": [10.456, 105.633], "Gia Lai": [13.983, 108.000],
  "Hà Giang": [22.823, 104.984], "Hà Nam": [20.541, 105.914], "Hà Nội": [21.028, 105.854],
  "Hà Tĩnh": [18.343, 105.906], "Hải Dương": [20.940, 106.333], "Hải Phòng": [20.845, 106.688],
  "Hậu Giang": [9.784, 105.470], "Hòa Bình": [20.817, 105.338], "Hưng Yên": [20.646, 106.051],
  "Khánh Hòa": [12.238, 109.197], "Kiên Giang": [10.012, 105.081], "Kon Tum": [14.350, 108.000],
  "Lai Châu": [22.396, 103.458], "Lạng Sơn": [21.853, 106.761], "Lào Cai": [22.486, 103.970],
  "Lâm Đồng": [11.940, 108.458], "Long An": [10.536, 106.413], "Nam Định": [20.434, 106.177],
  "Nghệ An": [18.679, 105.681], "Ninh Bình": [20.251, 105.975], "Ninh Thuận": [11.565, 108.988],
  "Phú Thọ": [21.322, 105.402], "Phú Yên": [13.088, 109.092], "Quảng Bình": [17.468, 106.622],
  "Quảng Nam": [15.573, 108.474], "Quảng Ngãi": [15.120, 108.792], "Quảng Ninh": [20.951, 107.080],
  "Quảng Trị": [16.750, 107.185], "Sóc Trăng": [9.603, 105.980], "Sơn La": [21.327, 103.914],
  "Tây Ninh": [11.310, 106.098], "Thái Bình": [20.447, 106.336], "Thái Nguyên": [21.594, 105.848],
  "Thanh Hóa": [19.807, 105.776], "Thừa Thiên Huế": [16.463, 107.590], "Tiền Giang": [10.360, 106.365],
  "TP. Hồ Chí Minh": [10.776, 106.701], "Trà Vinh": [9.935, 106.345], "Tuyên Quang": [21.823, 105.218],
  "Vĩnh Long": [10.254, 105.972], "Vĩnh Phúc": [21.309, 105.605], "Yên Bái": [21.705, 104.875],
};

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .toLowerCase().replace(/^(tp\.?|thanh pho|tinh)\s*/, "").replace(/[^a-z]/g, "");
}
const NORM_COORDS = new Map(Object.entries(PROVINCE_COORDS).map(([k, v]) => [norm(k), v]));
/** Khóa so khớp tên tỉnh/thành (bỏ dấu, bỏ tiền tố TP./Tỉnh). */
export const provinceNormKey = (s: string) => norm(s);
NORM_COORDS.set("hcm", PROVINCE_COORDS["TP. Hồ Chí Minh"]);
NORM_COORDS.set("saigon", PROVINCE_COORDS["TP. Hồ Chí Minh"]);
NORM_COORDS.set("hue", PROVINCE_COORDS["Thừa Thiên Huế"]);

export function provinceCoords(p: string | null | undefined): [number, number] | null {
  if (!p) return null;
  return NORM_COORDS.get(norm(p)) ?? null;
}

/** Khoảng cách km giữa 2 tỉnh; cùng tỉnh = 0; thiếu dữ liệu = null. */
export function provinceDistanceKm(a: string | null | undefined, b: string | null | undefined): number | null {
  const ca = provinceCoords(a), cb = provinceCoords(b);
  if (!ca || !cb) return null;
  if (ca === cb) return 0;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (cb[0] - ca[0]) * rad, dLng = (cb[1] - ca[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(ca[0] * rad) * Math.cos(cb[0] * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function needOf(intent: string | null | undefined): NeedFilter | null {
  const i = (intent || "").trim().toLowerCase();
  if (i === "fwb") return "fwb";
  if (i === "ons") return "ons";
  if (i === "love" || i === "dating" || i === "serious") return "love";
  return null;
}

export const NEED_LABEL: Record<NeedFilter, string> = { fwb: "FWB", ons: "ONS", love: "NGƯỜI YÊU" };

/** Vóc dáng theo BMI từ chiều cao (cm) / cân nặng (kg) thật trong hồ sơ. */
export function bodyOf(height: unknown, weight: unknown): BodyFilter | null {
  const h = Number(height), w = Number(weight);
  if (!h || !w || h < 120 || h > 230 || w < 30 || w > 200) return null;
  const bmi = w / (h / 100) ** 2;
  if (bmi < 18.5) return "slim";
  if (bmi < 23) return "fit";
  return "chubby";
}

export interface ScanProfile {
  [key: string]: unknown;
  id: string;
  age: number | null;
  gender: string | null;
  intent: string | null;
  province: string | null;
  height?: unknown;
  weight?: unknown;
}

/** Trả về khoảng cách (km) nếu hồ sơ khớp bộ lọc, ngược lại null. */
export function matchProfile(p: ScanProfile, f: ScanFilters, myProvince: string | null): number | null {
  const age = Number(p.age);
  if (!age || age < f.ageMin || age > f.ageMax) return null;
  if (f.genders.length && !f.genders.includes((p.gender || "") as GenderFilter)) return null;
  const need = needOf(p.intent);
  if (!need) return null;
  if (f.needs.length && !f.needs.includes(need)) return null;
  if (f.bodies.length) {
    const b = bodyOf(p.height, p.weight);
    if (!b || !f.bodies.includes(b)) return null;
  }
  const d = provinceDistanceKm(myProvince, p.province);
  if (d === null) return null;
  // Cùng tỉnh (0 km) luôn tính là trong phạm vi khoảng cách tối thiểu.
  if (d > f.distMax) return null;
  if (d > 0 && d < f.distMin) return null;
  return d;
}

/** Điểm phù hợp tối thiểu để một lượt quét được coi là thành công. */
export const SCAN_PASS_MIN = 50;

/** Điểm phù hợp 0–100: 5 tiêu chí (tuổi, giới tính, nhu cầu, vóc dáng, khoảng cách), mỗi tiêu chí 20 điểm.
 *  Tiêu chí nào người dùng không cài đặt thì được tính trọn điểm. Không loại bỏ hồ sơ — chỉ chấm điểm. */
export function matchScore(p: ScanProfile, f: ScanFilters, myProvince: string | null): number {
  let score = 0;
  const age = Number(p.age);
  if (age && age >= f.ageMin && age <= f.ageMax) score += 20;
  if (!f.genders.length || f.genders.includes((p.gender || "") as GenderFilter)) score += 20;
  const need = needOf(p.intent);
  if (!f.needs.length || (need !== null && f.needs.includes(need))) score += 20;
  if (!f.bodies.length) score += 20;
  else {
    const b = bodyOf(p.height, p.weight);
    if (b && f.bodies.includes(b)) score += 20;
  }
  const d = provinceDistanceKm(myProvince, p.province);
  if (d !== null && d <= f.distMax && (d === 0 || d >= f.distMin)) score += 20;
  return score;
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Lượt quét theo ngày (lưu trên máy) ----
function scanKey(userId: string, now = new Date()): string {
  return `nfwb:nearby-scans:${userId}:${now.toISOString().slice(0, 10)}`;
}
export function getScansUsed(userId: string): number {
  if (typeof window === "undefined") return 0;
  return Math.min(SCAN_LIMIT, Number(window.localStorage.getItem(scanKey(userId)) || 0) || 0);
}
export function consumeScan(userId: string): number | null {
  const used = getScansUsed(userId);
  if (used >= SCAN_LIMIT) return null;
  try { window.localStorage.setItem(scanKey(userId), String(used + 1)); } catch { /* noop */ }
  return used + 1;
}

// ---------------------------------------------------------------------------
// Bắt buộc cấu hình quét + khoảng cách mô phỏng (chỉ phục vụ giao diện).

export const SCAN_CONFIG_MSG = "Vui lòng cài đặt cấu hình quét trước khi bắt đầu!";

/** Chuẩn hóa cấu hình đã lưu: bỏ lọc giới tính; nhu cầu và vóc dáng chỉ chọn một. */
export function normalizeFilters(raw: unknown): ScanFilters {
  const f = { ...DEFAULT_FILTERS, ...(raw && typeof raw === "object" ? raw : {}) } as ScanFilters;
  const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  return { ...f, genders: [], needs: arr<NeedFilter>(f.needs).slice(0, 1), bodies: arr<BodyFilter>(f.bodies).slice(0, 1),
    districts: arr<unknown>(f.districts).filter((d): d is string => typeof d === "string" && d.length > 0 && d.length <= 60).slice(0, 1) };
}

const NEEDS: NeedFilter[] = ["fwb", "ons", "love"];
const BODIES: BodyFilter[] = ["slim", "fit", "chubby"];
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/**
 * Cấu hình ĐÃ LƯU có đủ tiêu chí bắt buộc không: độ tuổi, nhu cầu (1), vóc dáng (1),
 * khoảng cách (đã mở khóa, ≤ 200 km). `null` = chưa từng lưu => chưa đủ.
 */
export function isScanConfigComplete(f: ScanFilters | null | undefined): boolean {
  if (!f) return false;
  return isInt(f.ageMin) && isInt(f.ageMax) && f.ageMin >= AGE_MIN && f.ageMax <= AGE_MAX && f.ageMin <= f.ageMax
    && f.needs.length === 1 && NEEDS.includes(f.needs[0]!)
    && f.bodies.length === 1 && BODIES.includes(f.bodies[0]!)
    && isInt(f.distMin) && isInt(f.distMax) && f.distMin > LOCKED_MAX_KM && f.distMax <= DIST_MAX && f.distMin <= f.distMax;
}

export const SIM_DIST_MIN = 10;
export const SIM_DIST_MAX = 200;

/**
 * Khoảng cách MÔ PHỎNG (không phải GPS): ổn định cho từng cặp user–ứng viên,
 * luôn nằm trong khoảng user đã chọn, sau khi chuẩn hóa về 10–200 km.
 */
export function simulatedDistanceKm(userId: string, candidateId: string, f: Pick<ScanFilters, "distMin" | "distMax">): number {
  const clamp = (v: number) => Math.min(SIM_DIST_MAX, Math.max(SIM_DIST_MIN, Math.round(Number(v) || 0)));
  let lo = clamp(f.distMin), hi = clamp(f.distMax);
  if (lo > hi) [lo, hi] = [hi, lo];
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  const s = `${userId}:${candidateId}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return lo + (h % (hi - lo + 1));
}
