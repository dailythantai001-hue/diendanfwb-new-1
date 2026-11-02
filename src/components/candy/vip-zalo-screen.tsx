/**
 * VipZaloScreen — màn hình VIP ZALO mới (giai đoạn 1, chỉ giao diện).
 * Độc lập với CommonLockedPopup: cấu hình riêng (key vip_zalo_v2), dùng chung
 * useVipScreen để giữ trang gốc mounted (TRỞ LẠI khôi phục cuộn/nhập liệu).
 * Không thanh toán, không kích hoạt VIP.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Headset, Smartphone, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { fetchCommunityPage } from "@/lib/connect/community-content";
import { openExternalLinkWithFeedback } from "@/lib/external-link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/candy/auth-provider";
import { useVipScreen } from "./use-vip-screen";
import { useVipZaloSeen } from "@/lib/vip-zalo-seen";
import {
  VIP_ZALO_COUNTRIES,
  fillLocation,
  internationalBenefits,
  useVipZaloConfig,
  type CountryCode,
  type VipZaloBenefit,
  type VipZaloConfig,
} from "@/lib/vip-zalo-config";
import { CountryFlag } from "./vip-zalo-flags";
import { VipZaloDetailPages } from "./vip-zalo-detail-pages";
import "@/styles/vip-zalo-screen.css";

const isImage = (v: string) => /^(https?:\/\/|\/|data:image)/i.test(v);

/** Ngôi sao 5 cánh đều, tâm (cx, cy), bán kính ngoài r. */
const star = (cx: number, cy: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.382 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

function VnFlagIcon() {
  return (
    <svg viewBox="0 0 40 40" className="vzs-svg" data-icon="vn">
      <defs>
        <linearGradient id="vzs-vn-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0353b" /><stop offset="1" stopColor="#b5121b" />
        </linearGradient>
        <linearGradient id="vzs-vn-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="3" y="8" width="34" height="24" rx="5" fill="url(#vzs-vn-bg)" />
      <polygon points={star(20, 20.6, 7.6)} fill="#ffd400" />
      <rect x="3" y="8" width="34" height="24" rx="5" fill="url(#vzs-vn-sheen)" />
      <rect x="3.5" y="8.5" width="33" height="23" rx="4.5" fill="none" stroke="#fff" strokeOpacity=".25" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 40 40" className="vzs-svg" data-icon="intl">
      <defs>
        <radialGradient id="vzs-gl-bg" cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#7cc4ff" /><stop offset=".55" stopColor="#6d4dff" /><stop offset="1" stopColor="#e0389b" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="15" fill="url(#vzs-gl-bg)" />
      <g fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="1.2">
        <ellipse cx="20" cy="20" rx="6.5" ry="15" />
        <line x1="20" y1="5" x2="20" y2="35" />
        <path d="M6.2 14h27.6M5 20h30M6.2 26h27.6" />
      </g>
      <ellipse cx="14.5" cy="12.5" rx="5" ry="3" fill="#fff" opacity=".28" transform="rotate(-30 14.5 12.5)" />
      <circle cx="20" cy="20" r="15" fill="none" stroke="#fff" strokeOpacity=".35" />
    </svg>
  );
}

export interface VipZaloScreenProps {
  open: boolean;
  onClose: () => void;
  /** Admin "Xem thử": hiển thị cấu hình đang soạn (kể cả chưa lưu). */
  config?: VipZaloConfig;
}

/**
 * Liên hệ Admin — DÙNG CHUNG cho nút ở màn hình chính và popup chi tiết.
 * Mở đúng link admin_url của trang Cộng đồng VIP. Không thanh toán/kích hoạt VIP.
 */
function useAdminContact() {
  const [busy, setBusy] = useState(false);
  const contact = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const c = await fetchCommunityPage();
      if (c.show_admin && c.admin_url) openExternalLinkWithFeedback(c.admin_url);
      else toast.info("Admin chưa cấu hình link liên hệ");
    } catch {
      toast.error("Không tải được thông tin liên hệ. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, contact };
}

function VipZaloContactButton({ label = "LIÊN HỆ ADMIN HỖ TRỢ", className = "" }: { label?: string; className?: string }) {
  const { busy, contact } = useAdminContact();
  return (
    <Button variant="ghost" type="button" className={`vzs-contact ${className}`.trim()} onClick={contact} disabled={busy} aria-busy={busy}>
      <Headset aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}

export function VipZaloScreen({ open, onClose, config }: VipZaloScreenProps) {
  const loaded = useVipZaloConfig().cfg;
  const cfg = config ?? loaded;
  const { me, session } = useAuth();
  const { hasSeen, markSeen } = useVipZaloSeen(session?.user.id ?? me?.id, !!config);
  const screenRef = useVipScreen(open, onClose);
  const [plan, setPlan] = useState<"vn" | "intl" | null>(null);
  const [country, setCountry] = useState<CountryCode | null>(null);
  const [picking, setPicking] = useState(false);
  const [draftCountry, setDraftCountry] = useState<CountryCode | null>(null);
  const [sheet, setSheet] = useState<VipZaloBenefit | null>(null);
  // Hướng dẫn "xem quyền lợi": chỉ là trình bày + cuộn, không đụng dữ liệu.
  const [guide, setGuide] = useState(false);
  const [guideKey, setGuideKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const startGuide = () => { setGuide(true); setGuideKey((k) => k + 1); };
  const endGuide = () => setGuide(false);

  useEffect(() => {
    if (!guide) return;
    const box = scrollRef.current;
    const sec = sectionRef.current;
    if (!box || !sec) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const top = sec.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 72;
    box.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    // Khóa cuộn sau khi đã cuộn tới nơi.
    const t = window.setTimeout(() => box.setAttribute("data-guide-lock", "true"), reduce ? 0 : 550);
    return () => { window.clearTimeout(t); box.removeAttribute("data-guide-lock"); };
  }, [guide, guideKey]);

  useEffect(() => { if (!open) setGuide(false); }, [open]);

  if (!open || typeof document === "undefined") return null;

  const area = ((me as any)?.province || (me as any)?.location || "") as string;
  const rt = (t: string) => fillLocation(t, area, cfg.defaultLocation);

  const items: VipZaloBenefit[] =
    plan === "vn"
      ? cfg.vn
      : plan === "intl" && country
        ? internationalBenefits(cfg)
        : [];
  const countryInfo = VIP_ZALO_COUNTRIES.find((c) => c.code === country);

  const openSheet = (b: VipZaloBenefit) => {
    if (plan) markSeen(plan, b.id);
    endGuide();
    setSheet(b);
  };

  return createPortal(
    <div ref={screenRef} className="vzs" role="dialog" aria-modal="true" aria-label={rt(cfg.title)}>
      <div className="vzs-glow" aria-hidden="true" />
      <div className="vzs-nav">
        <Button variant="ghost" type="button" className="vzs-back" onClick={() => { endGuide(); onClose(); }}>
          <ChevronLeft aria-hidden="true" /> TRỞ LẠI
        </Button>
      </div>

      <div ref={scrollRef} className="vzs-scroll" data-scroll-lock-ignore>
        <header className="vzs-head">
          {cfg.headerMedia && isImage(cfg.headerMedia) ? (
            <div className="vzs-media"><img src={cfg.headerMedia} alt="" decoding="async" /></div>
          ) : null}
          <h2 className="vzs-title">{rt(cfg.title)}</h2>
          <div className="vzs-intro">
            {rt(cfg.intro)
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l, i) => (
                i === 0 ? (
                  <p key={i} className="vzs-lead">{l.replace(/^[✦•\-\s]+/, "")}</p>
                ) : (
                  <p key={i} className="vzs-point">
                    <span className="vzs-point-ic" aria-hidden="true">{i === 1 ? <UsersRound /> : <Smartphone />}</span>
                    <span>{l.replace(/^[✦•\-\s]+/, "")}</span>
                  </p>
                )
              ))}
          </div>
        </header>

        <div className="vzs-plans" role="radiogroup" aria-label="Chọn gói VIP">
          {(["vn", "intl"] as const).map((p) => (
            <Button variant="ghost"
              key={p}
              type="button"
              role="radio"
              aria-checked={plan === p}
              className="vzs-plan" data-plan={p}
              data-active={plan === p}
              onClick={() => {
                if (p === "vn") {
                  setPlan("vn");
                  setCountry(null);
                  startGuide();
                } else {
                  setDraftCountry(country);
                  setPicking(true);
                }
              }}
            >
              <span className="vzs-plan-ic" aria-hidden="true">{p === "vn" ? <VnFlagIcon /> : <GlobeIcon />}</span>
              <span className="vzs-plan-txt">
                <span className="vzs-plan-name">{p === "vn" ? cfg.vnLabel : cfg.intlLabel}</span>
                {p === "intl" && plan === "intl" && countryInfo ? <span className="vzs-plan-sub"><CountryFlag code={countryInfo.code} /> {countryInfo.name}</span> : null}
              </span>
              <span className="vzs-radio" aria-hidden="true" />
            </Button>
          ))}
        </div>

        <section ref={sectionRef} className="vzs-section" data-guide={guide && items.length > 0 ? "on" : undefined} aria-label="QUYỀN LỢI GỒM GÌ?">
          <h3 className="vzs-section-title">QUYỀN LỢI GỒM GÌ?</h3>
          {guide && items.length > 0 ? (
            <div className="vzs-guide" role="status">
              <span className="vzs-guide-label">👇 BẤM VÀO ĐÂY ĐỂ XEM QUYỀN LỢI</span>
              <Button variant="ghost" type="button" size="icon" className="vzs-guide-x" aria-label="Đóng hướng dẫn" onClick={endGuide}>
                <X aria-hidden="true" />
              </Button>
              <svg className="vzs-guide-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14m0 0-6-6m6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          ) : null}
          {!plan ? <div className="vzs-blank" aria-hidden="true" /> : null}
          {plan && items.length === 0 ? <p className="vzs-hint">Chưa có quyền lợi.</p> : null}
          {items.length > 0 ? <div className="vzs-list">{items.map((it, i) => (
            <Button variant="ghost" key={it.id || i} type="button" className="vzs-benefit" data-unseen={plan ? !hasSeen(plan, it.id) : false} onClick={() => openSheet(it)}>
              <span className="vzs-benefit-ic" aria-hidden="true">
                {it.icon && isImage(it.icon) ? <img src={it.icon} alt="" loading="lazy" /> : it.icon || i + 1}
              </span>
              <span className="vzs-benefit-txt">
                <span className="vzs-benefit-tt">{rt(it.title)}</span>
                {it.subtitle ? <span className="vzs-blink">{rt(it.subtitle)}</span> : null}
              </span>
              <ChevronRight className="vzs-benefit-chev" aria-hidden="true" />
            </Button>
          ))}</div> : null}
        </section>

        <div className="vzs-actions">
          <VipZaloContactButton label={rt(cfg.ctaLabel)} className="vzs-cta" />
        </div>
      </div>

      {picking ? (
        <div className="vzs-pick-wrap">
          <div className="vzs-dim" onClick={() => setPicking(false)} aria-hidden="true" />
          <div className="vzs-pick" role="dialog" aria-label="Chọn quốc gia">
            <h4>Chọn quốc gia</h4>
            <div className="vzs-countries" role="radiogroup" aria-label="Quốc gia">
              {VIP_ZALO_COUNTRIES.map((c) => (
                <Button variant="ghost" key={c.code} type="button" role="radio" aria-checked={draftCountry === c.code}
                  className="vzs-country" data-active={draftCountry === c.code} onClick={() => setDraftCountry(c.code)}>
                  <CountryFlag code={c.code} />
                  <span className="vzs-country-name">{c.name}</span>
                </Button>
              ))}
            </div>
            <div className="vzs-pick-act">
              <Button variant="ghost" type="button" className="vzs-pick-cancel" onClick={() => setPicking(false)}>Huỷ</Button>
              <Button variant="ghost" type="button" className="vzs-pick-ok" disabled={!draftCountry}
                onClick={() => { if (!draftCountry) return; setCountry(draftCountry); setPlan("intl"); setPicking(false); startGuide(); }}>
                Xác nhận
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {sheet ? (
        <div className="vzs-sheet-wrap">
          <div className="vzs-dim" onClick={() => setSheet(null)} aria-hidden="true" />
          <div className="vzs-sheet" role="dialog" aria-label={rt(sheet.title)}>
            <div className="vzs-grab" aria-hidden="true" />
            <div className="vzs-sheet-head">
              <h4>{rt(sheet.title)}</h4>
              <Button variant="ghost" type="button" size="icon" className="vzs-sheet-x" aria-label="Đóng" onClick={() => setSheet(null)}>
                <X />
              </Button>
            </div>
            <VipZaloDetailPages key={sheet.id} tabs={sheet.slides} renderText={rt} />
            <div className="vzs-sheet-foot"><VipZaloContactButton /></div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export default VipZaloScreen;
