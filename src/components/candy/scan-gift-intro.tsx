import { useEffect, useRef, useState } from "react";
import { LIFETIME_SCAN_LIMIT } from "@/lib/scan-v2";
import "@/styles/scan-gift.css";

export const GIFT_STEP_MS = 130;
export const GIFT_HOLD_MS = 1400;

/** Shown only after the server confirmed the one-time gift: counts +1 … +20, then hands over to Search. */
export function ScanGiftIntro({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (n < LIFETIME_SCAN_LIMIT) {
      const t = setTimeout(() => setN(v => v + 1), n === 0 ? 600 : GIFT_STEP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => doneRef.current(), GIFT_HOLD_MS);
    return () => clearTimeout(t);
  }, [n]);
  const finished = n >= LIFETIME_SCAN_LIMIT;
  return (
    <div className="sg-intro" role="dialog" aria-modal="true" aria-label="Quà tặng lượt quét">
      <div className={`sg-card${finished ? " is-done" : ""}`}>
        <div className="sg-gift" aria-hidden>🎁</div>
        <h2 className="sg-title">ADMIN TẶNG BẠN {LIFETIME_SCAN_LIMIT} LƯỢT QUÉT TÌM BẠN!</h2>
        <div className="sg-count" aria-live="polite">
          {n > 0 && <span key={n} className="sg-plus">+{n}</span>}
        </div>
        <div className="sg-bar"><div className="sg-bar__fill" style={{ width: `${(n / LIFETIME_SCAN_LIMIT) * 100}%` }} /></div>
        <p className="sg-sub">{finished ? "Đã nhận đủ! Đang mở Tìm kiếm…" : "Đang cộng lượt quét…"}</p>
      </div>
    </div>
  );
}
