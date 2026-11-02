/**
 * Cấu hình màn hình VIP ZALO mới (giai đoạn 1).
 *
 * Lưu ở bảng hiện có `admin_site_settings` với key RIÊNG `vip_zalo_v2`, qua
 * cùng RPC admin (save_admin_site_settings) — KHÔNG đụng key `vip_unlock_popup`
 * của popup cũ, nên sửa cấu hình mới không làm thay đổi CommonLockedPopup.
 * Không mở realtime channel riêng: đọc 1 lần (cache + inflight dedupe), làm mới
 * khi Admin lưu (event cục bộ).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/db/router";
import { adminSetSiteSetting } from "@/lib/admin-db";
import { normalizeDetailTab, type VipZaloSlide } from "@/lib/vip-zalo-details";
export type { VipZaloSlide } from "@/lib/vip-zalo-details";

export const VIP_ZALO_SETTING_KEY = "vip_zalo_v2";
const EVENT = "vip-zalo-config-changed";

export interface VipZaloBenefit {
  id: string;
  /** Emoji/ký tự hoặc URL ảnh icon do Admin tải lên. */
  icon: string;
  title: string;
  subtitle: string;
  slides: VipZaloSlide[];
}

export const VIP_ZALO_COUNTRIES = [
  { code: "tw", flag: "🇹🇼", name: "Đài Loan" },
  { code: "us", flag: "🇺🇸", name: "Mỹ" },
  { code: "jp", flag: "🇯🇵", name: "Nhật Bản" },
  { code: "kr", flag: "🇰🇷", name: "Hàn Quốc" },
  { code: "ca", flag: "🇨🇦", name: "Canada" },
] as const;
export type CountryCode = (typeof VIP_ZALO_COUNTRIES)[number]["code"];

export interface VipZaloConfig {
  headerMedia: string;
  title: string;
  intro: string;
  defaultLocation: string;
  vnLabel: string;
  intlLabel: string;
  ctaLabel: string;
  vn: VipZaloBenefit[];
  intl: Record<CountryCode, VipZaloBenefit[]>;
  /** One active international list; old country lists are retained, never overwritten. */
  intlShared?: VipZaloBenefit[];
  /** Exact original country JSON, including fields unrecognized by this version. */
  intlLegacySnapshot?: unknown;
}

export const newBenefitId = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_VIP_ZALO_CONFIG: VipZaloConfig = {
  headerMedia: "",
  title: "VIP ZALO {location}",
  intro:
    "Kết bạn với thành viên khác chỉ với một nút bấm.\nĐược tham gia các nhóm kín của khu vực {location}\nĐược tải app kín dành riêng cho khu vực {location}",
  defaultLocation: "Toàn Quốc",
  vnLabel: "VIP VIỆT NAM",
  intlLabel: "VIP QUỐC TẾ",
  ctaLabel: "LIÊN HỆ ADMIN HỖ TRỢ",
  // Không có quyền lợi mặc định: Admin tự thêm.
  vn: [],
  intl: Object.fromEntries(VIP_ZALO_COUNTRIES.map((c) => [c.code, []])) as unknown as VipZaloConfig["intl"],
};

const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
/** Giá trị mặc định cũ (chưa từng được Admin sửa) → dùng mặc định mới. */
const LEGACY_DEFAULTS: Record<string, string[]> = {
  intro: ["Kết bạn với thành viên khác chỉ với một nút bấm.\nĐƯỢC THAM GIA CÁC NHÓM KÍN CỦA KHU VỰC {location}\nĐƯỢC TẢI APP KÍN DÀNH RIÊNG CHO KHU VỰC {location}"],
  ctaLabel: ["Đăng ký VIP ZALO"],
};

function normBenefit(raw: any, fallbackId: string): VipZaloBenefit | null {
  if (!raw || typeof raw !== "object") return null;
  const slides = Array.isArray(raw.slides)
    ? (raw.slides as any[])
        .map(normalizeDetailTab)
        .filter((s): s is VipZaloSlide => s !== null)
    : [];
  return {
    id: str(raw.id, "").trim() || fallbackId,
    icon: str(raw.icon, "").trim(),
    title: str(raw.title, "").trim(),
    subtitle: str(raw.subtitle, "").trim(),
    slides,
  };
}

/** Mảng mới; hoặc object cũ theo key (chỉ giữ mục Admin đã soạn nội dung, bỏ tên mặc định). */
function normList(raw: unknown, scope: string): VipZaloBenefit[] {
  if (Array.isArray(raw)) return raw.map((b, i) => normBenefit(b, `legacy-${scope}-${i}`)).filter((x): x is VipZaloBenefit => !!x && !!x.title);
  if (raw && typeof raw === "object")
    return Object.values(raw as Record<string, unknown>)
      .map((b, i) => normBenefit(b, `legacy-${scope}-${i}`))
      .filter((x): x is VipZaloBenefit => !!x && !!x.title && x.slides.length > 0);
  return [];
}

export function normalizeVipZaloConfig(raw: unknown): VipZaloConfig {
  const d = DEFAULT_VIP_ZALO_CONFIG;
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const pick = (k: keyof VipZaloConfig) => {
    const val = str(v[k], d[k] as string).trim();
    return !val || LEGACY_DEFAULTS[k]?.includes(val) ? (d[k] as string) : val;
  };
  const vn = normList(v.vn, "vn");
  const intl = {} as VipZaloConfig["intl"];
  VIP_ZALO_COUNTRIES.forEach(({ code }) => (intl[code] = normList(v.intl?.[code], code)));
  return {
    headerMedia: str(v.headerMedia, "").trim(),
    title: pick("title"),
    intro: pick("intro"),
    defaultLocation: pick("defaultLocation"),
    vnLabel: pick("vnLabel"),
    intlLabel: pick("intlLabel"),
    ctaLabel: pick("ctaLabel"),
    vn,
    intl,
    ...(Array.isArray(v.intlShared) ? { intlShared: normList(v.intlShared, "intl") } : {}),
    ...(v.intlLegacySnapshot !== undefined
      ? { intlLegacySnapshot: v.intlLegacySnapshot }
      : { intlLegacySnapshot: v.intl ?? d.intl }),
  };
}

/** Read-only compatibility projection; no database migration or country writes. */
export function internationalBenefits(cfg: VipZaloConfig): VipZaloBenefit[] {
  if (cfg.intlShared !== undefined) return cfg.intlShared;
  const result: VipZaloBenefit[] = [];
  const usedIds = new Set<string>();
  const contents = new Set<string>();
  for (const { code } of VIP_ZALO_COUNTRIES) {
    for (const benefit of cfg.intl[code] || []) {
      // Exact copies are one benefit; distinct country content is never discarded.
      const signature = JSON.stringify(benefit);
      if (contents.has(signature)) continue;
      contents.add(signature);
      let id = benefit.id;
      while (usedIds.has(id)) id = `${code}:${id}`;
      usedIds.add(id);
      result.push({ ...benefit, id });
    }
  }
  return result;
}

let cached: VipZaloConfig | null = null;
let inflight: Promise<VipZaloConfig> | null = null;

export function fetchVipZaloConfig(): Promise<VipZaloConfig> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = (async () => {
    let cfg: VipZaloConfig;
    try {
      const { data, error } = await (supabase as any)
        .from("admin_site_settings")
        .select("value")
        .eq("key", VIP_ZALO_SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      cfg = normalizeVipZaloConfig(data?.value);
    } catch (error) {
      inflight = null;
      throw error;
    }
    cached = cfg;
    inflight = null;
    return cfg;
  })();
  return inflight;
}

export function invalidateVipZaloConfig() {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

export async function saveVipZaloConfig(cfg: VipZaloConfig): Promise<void> {
  await adminSetSiteSetting(VIP_ZALO_SETTING_KEY, normalizeVipZaloConfig(cfg));
  invalidateVipZaloConfig();
}

export function useVipZaloConfig(): { cfg: VipZaloConfig; loaded: boolean } {
  const [state, setState] = useState({ cfg: cached || DEFAULT_VIP_ZALO_CONFIG, loaded: !!cached });
  useEffect(() => {
    let alive = true;
    const load = () => void fetchVipZaloConfig().then((c) => alive && setState({ cfg: c, loaded: true })).catch(() => {});
    load();
    window.addEventListener(EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, load);
    };
  }, []);
  return state;
}

export function fillLocation(text: string, location: string | null | undefined, fallback: string): string {
  const area = (location || "").trim() || fallback.trim() || DEFAULT_VIP_ZALO_CONFIG.defaultLocation;
  return String(text || "").replace(/\{location\}/gi, area);
}
