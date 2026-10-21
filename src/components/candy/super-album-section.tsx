/** 💎 Thẻ ALBUM VIP trong "Danh sách Code": ảnh bìa mờ + dây xích 3D. Chỉ VIP (xác minh máy chủ) + đúng Code mới mở. */
import { useState } from "react";
import { Crown, Link2, Lock } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";
import { superOpenFn } from "@/lib/super-albums.functions";
import type { FlashAlbum } from "@/lib/flash-albums.functions";
import type { SuperCodeCard } from "@/lib/super-albums.server";

/** Dải xích 3D: các mắt xích xen kẽ (đứng/nghiêng) với gradient kim loại. */
function ChainBand({ dir, uid }: { dir: "l" | "r"; uid: string }) {
  const gid = `chain-metal-${dir}-${uid}`;
  return (
    <svg
      data-dir={dir}
      className="super-chain pointer-events-none absolute left-1/2 top-1/2 h-7 w-[170%]"
      style={{ ["--chain-rot" as string]: dir === "l" ? "-38deg" : "38deg", marginLeft: "-85%", marginTop: "-0.875rem" }}
      viewBox="0 0 340 28"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--super-chain-light)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--super-chain-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--super-chain-dark)" }} />
        </linearGradient>
      </defs>
      {Array.from({ length: 17 }).map((_, i) =>
        i % 2 === 0 ? (
          <rect key={i} x={i * 20 - 2} y={5} width={26} height={18} rx={9} fill="none" stroke={`url(#${gid})`} strokeWidth={5} />
        ) : (
          <rect key={i} x={i * 20 - 2} y={11} width={26} height={6} rx={3} fill={`url(#${gid})`} />
        ),
      )}
    </svg>
  );
}

/** Ảnh catbox chặn hotlink → đi qua proxy sẵn có (giống Album HOT). */
function coverSrc(url: string) {
  try {
    const host = new URL(url).hostname;
    if (host === "files.catbox.moe" || host === "litter.catbox.moe") return `/api/public/hot-media?u=${encodeURIComponent(url)}`;
  } catch { /* giữ nguyên */ }
  return url;
}

function countLabel(c: SuperCodeCard) {
  return [c.images && `${c.images} ảnh`, c.videos && `${c.videos} video`].filter(Boolean).join(" · ") || "Chưa có media";
}

export function VipAlbumCard({ card, highlight, onOpen }: { card: SuperCodeCard; highlight?: boolean; onOpen: (album: FlashAlbum) => void }) {
  const auth = useAuth();
  const token = auth.session?.access_token;
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const [vipPopup, setVipPopup] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  const open = async () => {
    if (busy) return;
    setBroken(true);
    // Admin: luôn hiện popup "CHƯA VÀO VIP ZALO", không mở media từ thẻ.
    if (!token || auth.isAdmin) { window.setTimeout(() => { setVipPopup(true); setBroken(false); }, 700); return; }
    setBusy(true);
    try {
      const r = await superOpenFn({ data: { token, id: card.id, code: card.code } });
      if (r.ok) onOpen(r.album);
      else window.setTimeout(() => setVipPopup(true), 500);
    } catch {
      setVipPopup(true);
    } finally {
      setBusy(false);
      window.setTimeout(() => setBroken(false), 750);
    }
  };

  return (
    <>
      <button
        type="button"
        data-album-code={card.code}
        data-album-vip="true"
        onClick={() => void open()}
        disabled={busy}
        className={`flash-album-card group w-full min-w-0 overflow-hidden rounded-lg border bg-card text-left shadow-md transition-transform active:scale-[0.98] disabled:opacity-80 ${highlight ? "border-primary ring-2 ring-primary/50" : "border-primary/40"}`}
        aria-label={`Album VIP ${card.name} — cần VIP Zalo`}
      >
        <div className={`relative aspect-[4/5] w-full overflow-hidden bg-muted ${broken ? "super-chain-broken" : ""}`}>
          {card.cover && !coverFailed ? (
            <img
              src={coverSrc(card.cover)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
              onContextMenu={(e) => e.preventDefault()}
              className="pointer-events-none absolute inset-0 h-full w-full scale-125 select-none object-cover blur-2xl saturate-150"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-muted to-accent/40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-transparent to-background/40" />
          <ChainBand dir="l" uid={card.id} />
          <ChainBand dir="r" uid={card.id} />
          <span className="super-lock absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-primary/60 bg-background/90 text-primary shadow-lg">
            <Lock className="h-5 w-5" />
          </span>
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground shadow">
            <Crown className="h-3 w-3" /> VIP
          </span>
        </div>
        <div className="space-y-1 p-3">
          <div className="line-clamp-2 text-sm font-extrabold leading-5 text-primary">{card.name}</div>
          <div className="flex items-center gap-1 font-mono text-xs font-bold text-foreground"><Link2 className="h-3.5 w-3.5 text-primary" />{card.code}</div>
          <div className="text-xs font-semibold text-foreground/70">{busy ? "Đang kiểm tra…" : countLabel(card)}</div>
        </div>
      </button>
      <CommonLockedPopup open={vipPopup} onClose={() => setVipPopup(false)} forceTitle="CHƯA VÀO VIP ZALO" featureName="Album VIP" />
    </>
  );
}
