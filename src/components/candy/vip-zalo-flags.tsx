/** Cờ quốc gia vẽ bằng SVG cho popup chọn quốc gia VIP QUỐC TẾ (khung 30×20, bo góc). */
import type { ReactNode } from "react";
import type { CountryCode } from "@/lib/vip-zalo-config";

const star = (cx: number, cy: number, r: number, inner = 0.382) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

const sun = () => {
  // Mặt trời 12 tia của Đài Loan, tâm (7.5, 5), trong ô xanh 15×10.
  const pts = Array.from({ length: 24 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 12;
    const r = i % 2 ? 2.2 : 3.9;
    return `${(7.5 + r * Math.cos(a)).toFixed(2)},${(5 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <>
      <polygon points={pts} fill="#fff" />
      <circle cx="7.5" cy="5" r="2.15" fill="#000095" />
      <circle cx="7.5" cy="5" r="1.75" fill="#fff" />
    </>
  );
};

const FLAGS: Record<CountryCode, ReactNode> = {
  tw: (
    <>
      <rect width="30" height="20" fill="#fe0000" />
      <rect width="15" height="10" fill="#000095" />
      {sun()}
    </>
  ),
  us: (
    <>
      <rect width="30" height="20" fill="#fff" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={(i * 2 * 20) / 13} width="30" height={20 / 13} fill="#b22234" />
      ))}
      <rect width="13" height={(7 * 20) / 13} fill="#3c3b6e" />
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2, 3].map((c) => <polygon key={`${r}${c}`} points={star(2 + c * 3 + (r % 2) * 1.5 - (r % 2 ? 0.75 : 0), 2 + r * 3.4, 0.95, 0.4)} fill="#fff" />),
      )}
    </>
  ),
  jp: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <circle cx="15" cy="10" r="6" fill="#bc002d" />
    </>
  ),
  kr: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <g transform="rotate(33.7 15 10)">
        <path d="M10 10a5 5 0 0 1 10 0z" fill="#cd2e3a" />
        <path d="M10 10a5 5 0 0 0 10 0z" fill="#0047a0" />
        <circle cx="12.5" cy="10" r="2.5" fill="#cd2e3a" />
        <circle cx="17.5" cy="10" r="2.5" fill="#0047a0" />
      </g>
      {/* 4 quẻ: 건(☰) trên-trái, 곤(☷) dưới-phải, 감(☵) trên-phải, 리(☲) dưới-trái */}
      {(
        [
          [5.2, 4.2, -56.3, [1, 1, 1]],
          [24.8, 15.8, -56.3, [0, 0, 0]],
          [24.8, 4.2, 56.3, [0, 1, 0]],
          [5.2, 15.8, 56.3, [1, 0, 1]],
        ] as const
      ).map(([x, y, rot, bars], k) => (
        <g key={k} transform={`translate(${x} ${y}) rotate(${rot})`}>
          {bars.map((full, i) =>
            full ? (
              <rect key={i} x="-1.1" y={-2.1 + i * 1.6} width="2.2" height="0.9" fill="#000" />
            ) : (
              <g key={i}>
                <rect x="-1.1" y={-2.1 + i * 1.6} width="0.9" height="0.9" fill="#000" />
                <rect x="0.2" y={-2.1 + i * 1.6} width="0.9" height="0.9" fill="#000" />
              </g>
            ),
          )}
        </g>
      ))}
    </>
  ),
  ca: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="7.5" height="20" fill="#d80621" />
      <rect x="22.5" width="7.5" height="20" fill="#d80621" />
      <path
        fill="#d80621"
        d="M15 3.2l-1.1 2.1c-.13.22-.35.2-.57.08l-.8-.41.6 3.17c.12.58-.28.58-.48.33l-1.4-1.57-.23.8c-.03.1-.14.21-.3.18l-1.77-.37.47 1.7c.1.38.18.53-.1.63l-.63.3 3.05 2.47c.12.1.18.27.14.42l-.27.88c1.05-.12 2-.3 3.05-.42.1 0 .25.15.25.26l-.14 3.24h.5l-.08-3.23c0-.12.14-.28.24-.27 1.05.11 2 .3 3.05.41l-.27-.88a.42.42 0 0 1 .14-.42l3.05-2.47-.63-.3c-.28-.1-.2-.25-.1-.63l.47-1.7-1.78.37c-.16.03-.27-.08-.3-.18l-.22-.8-1.4 1.57c-.2.25-.6.25-.48-.33l.6-3.17-.8.41c-.22.12-.44.14-.57-.08z"
      />
    </>
  ),
};

export function CountryFlag({ code }: { code: CountryCode }) {
  return (
    <svg viewBox="0 0 30 20" className="vzs-flag" data-flag={code} aria-hidden="true">
      <defs>
        <clipPath id={`vzs-fc-${code}`}><rect width="30" height="20" rx="3" /></clipPath>
      </defs>
      <g clipPath={`url(#vzs-fc-${code})`}>{FLAGS[code]}</g>
      <rect x=".4" y=".4" width="29.2" height="19.2" rx="2.7" fill="none" stroke="#000" strokeOpacity=".18" strokeWidth=".8" />
    </svg>
  );
}
