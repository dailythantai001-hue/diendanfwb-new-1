import { useCallback, useEffect, useRef, useState, type SyntheticEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Settings, Radar, X, Mars, Venus, Lock, ArrowLeft, History } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { openCommunityScan, communityScanPage, runCommunityScan, readScanConfig, refreshCommunityQuota, communityResultsPage, claimScanGift, communityHistory, communityHistoryTotals } from "@/lib/nearby-community.functions";
import { pinMobileScan } from "@/lib/nearby-scan-scroll";
import type { ScanHistoryPage, ScanHistoryTotals } from "@/lib/nearby-scan-history";
import { ScanHistoryDialog } from "@/components/candy/scan-history-dialog";
import { scanAuthHeaders } from "@/lib/nearby-community-auth";
import { CommunityPager, MISS_VISIBLE_MS, randomHitScore, scanProgress, type CommunityAccount } from "@/lib/nearby-community";
import {
  cardsFromRecent, mergeResultCards, getScanSession, isCardVisible, revealCard, scanAgeLabel, updateScanSession, useScanSession,
  type DoneCard, type ScanRow,
} from "@/lib/nearby-scan-session";
import { useAuth } from "@/components/candy/auth-provider";
import { ZaloIcon } from "@/components/candy/zalo-icon";
import { avatarSrc } from "@/lib/image-cdn";
import { resolveUserName } from "@/lib/user-name";
import { sendConnectionRequest } from "@/lib/fwb-matches";
import { zaloLogoUrl } from "@/lib/crm-community-vip";
import {
  AGE_MAX, AGE_MIN, DEFAULT_FILTERS, DIST_MAX, DIST_MIN, LOCKED_MAX_KM, SCAN_CONFIG_MSG,
  isScanConfigComplete, needOf, isDistanceLocked, simulatedDistanceKm,
  type BodyFilter, type NeedFilter, type ScanFilters,
} from "@/lib/nearby-scan";
import { cachedFilters, saveFilters } from "@/lib/nearby-filters-store";
import { provinceDistricts, scanDistrictFor } from "@/lib/scan-districts";
import { parseQuota, SCAN_EXHAUSTED_MSG } from "@/lib/scan-v2";
import { ScanGiftIntro } from "@/components/candy/scan-gift-intro";
import { CloneVipNameMedia } from "@/components/vip/clone-vip-name-media";

import "@/styles/search-page.css";
import "@/styles/search-filter-sheet.css";
import "@/styles/search-page-pink.css";
import "@/styles/search-filter-foot-fix.css";
import "@/styles/search-page-scan-cards.css";
import "@/styles/search-page-scan-age.css";
import "@/styles/search-page-scan-camera.css";
import "@/styles/search-page-scan-config.css";
import "@/styles/search-page-back-nav.css";
import "@/styles/search-filter-area.css";
import "@/styles/search-page-history.css";

interface SearchPageProps {
  onViewProfile: (userId: string) => void;
  onOpenPost?: (postId: string) => void;
  onOpenChat?: (userId: string) => void;
  onBack?: () => void;
}

const FAIL_EXIT_MS = 450;
const SCAN_REQUEST_TIMEOUT_MS = 60_000;
// Bound only network waiting, never the existing 10-second reveal animation.
async function scanRequest<T>(request: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Kết nối bị gián đoạn. Vui lòng thử lại.")), SCAN_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
const LOCK_MSG = "Bạn chưa thể quét gần đây. Chưa mở khóa tính năng này.";
const NEED_TAG: Record<NeedFilter, string> = { fwb: "Tìm FWB", ons: "Tìm ONS", love: "Tìm người yêu" };

function successCard(p: CommunityAccount, key: string, f: ScanFilters, myProvince: string | null, uid: string | null, scannedAt: number = Date.now()): DoneCard {
  const district = p.district ?? scanDistrictFor(uid ?? "", p.id, myProvince, f.districts ?? []);
  const row: ScanRow = { id: p.id, name: resolveUserName(p) || "Thành viên", avatar: p.avatar,
    age: Number(p.age) || 0, gender: "female", need: needOf(p.intent), province: p.province, district };
  return { key, status: "success", row, score: randomHitScore(), scannedAt };
}

/** Female second accounts from Supabase #1; scan settings/stats/history in Supabase #2. */
export function SearchPage({ onViewProfile, onOpenChat, onBack }: SearchPageProps) {
  const { me } = useAuth();
  const uid = me?.id ?? null;
  const myProvince = (me as any)?.province || null;
  const session = useScanSession(uid);
  const [filters, setFilters] = useState<ScanFilters>(DEFAULT_FILTERS);
  // Whether the SAVED config (read by the server from SB1) has every required criterion.
  const [configured, setConfigured] = useState(false);
  // Specific reason the saved config could not be read (e.g. missing table) — never shown as "not configured".
  const [configError, setConfigError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const quota = session.quota;
  const [resultsError, setResultsError] = useState("");
  const [zaloLogo, setZaloLogo] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const openScan = useServerFn(openCommunityScan);
  const loadPage = useServerFn(communityScanPage);
  const runScan = useServerFn(runCommunityScan);
  const readConfig = useServerFn(readScanConfig);
  const refreshQuota = useServerFn(refreshCommunityQuota);
  const fetchResults = useServerFn(communityResultsPage);
  const claimGift = useServerFn(claimScanGift);
  const fetchHistory = useServerFn(communityHistory);
  const fetchHistoryTotals = useServerFn(communityHistoryTotals);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState<ScanHistoryPage | null>(null);
  const [historyTotals, setHistoryTotals] = useState<ScanHistoryTotals | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const historyEpoch = useRef(0);
  const historyInFlight = useRef(false);
  // True only after the server confirmed THIS request granted the one-time gift.
  const [giftIntro, setGiftIntro] = useState(false);
  const pagerRef = useRef<CommunityPager<{ id: string }> | null>(null);
  const filtersRef = useRef<ScanFilters>(DEFAULT_FILTERS);
  const pendingRef = useRef<{ id: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const scanning = session.busy;
  const pageRef = useRef<HTMLDivElement>(null);
  const actionsLocked = () => getScanSession(uid).busy;
  const blockAction = (event: SyntheticEvent) => {
    if (!actionsLocked()) return;
    event.preventDefault(); event.stopPropagation();
  };
  const blockKeyAction = (event: KeyboardEvent) => {
    // Arrow/Page keys and Space on the page itself still allow scrolling.
    if (event.key === "Enter" || (event.key === " " && (event.target as HTMLElement).closest("button, a, input, [role=button]"))) blockAction(event);
  };
  useEffect(() => {
    // Presentation only: scrolling never updates the scan session or animation.
    const syncBackSize = () => {
      if (pageRef.current) pageRef.current.dataset.backCompact = window.scrollY > 48 ? "true" : "false";
    };
    syncBackSize();
    window.addEventListener("scroll", syncBackSize, { passive: true });
    return () => window.removeEventListener("scroll", syncBackSize);
  }, []);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".app-header");
    if (!header) return;
    const measure = () => pageRef.current?.style.setProperty("--search-header-bottom", `${Math.max(0, header.getBoundingClientRect().bottom)}px`);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(header);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  // Presentation-only scroll lock while a scan runs: the whole page stays pinned on the
  // scan view (status frame + quota bar). The previous scroll position is restored when
  // the scan ends or the page unmounts. Never touches the scan session or the animation.
  useEffect(() => {
    if (!scanning || !pageRef.current) return;
    return pinMobileScan(pageRef.current);
  }, [scanning]);

  useEffect(() => {
    const epoch = ++historyEpoch.current;
    setHistoryOpen(false); setHistoryPage(null); setHistoryTotals(null); setHistoryError("");
    historyInFlight.current = false; setHistoryLoading(false);
    if (uid && !scanning) void scanRequest(async () => fetchHistoryTotals({ headers: await scanAuthHeaders() }))
      .then(totals => { if (epoch === historyEpoch.current) setHistoryTotals(totals); })
      .catch(() => { /* Unknown is displayed as —, never replaced with fake zero. */ });
    return () => { historyEpoch.current++; };
  }, [uid, scanning, fetchHistoryTotals]);

  const loadHistory = async (more = false) => {
    if (!uid || actionsLocked() || historyInFlight.current) return;
    const epoch = historyEpoch.current;
    historyInFlight.current = true; setHistoryLoading(true); setHistoryError("");
    try {
      const next = await scanRequest(async () => fetchHistory({ data: {
        cursor: more ? historyPage?.cursor ?? null : null,
        until: more ? historyPage?.until ?? null : null,
      }, headers: await scanAuthHeaders() }));
      if (epoch !== historyEpoch.current) return;
      setHistoryPage(previous => more && previous ? { ...next, rows: [...previous.rows, ...next.rows] } : next);
      setHistoryTotals(next.totals);
    } catch (e) {
      if (epoch === historyEpoch.current) setHistoryError(e instanceof Error ? e.message : "Không tải được lịch sử quét.");
    } finally {
      if (epoch === historyEpoch.current) { historyInFlight.current = false; setHistoryLoading(false); }
    }
  };

  useEffect(() => { void zaloLogoUrl().then(setZaloLogo); }, []);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setLoading(true); setLoadError(""); setConfigured(false); setConfigError("");
    pendingRef.current = null;
    // Random start; the server removes accounts this user already scanned (persistent history).
    pagerRef.current = new CommunityPager(
      async cursor => loadPage({ data: { cursor }, headers: await scanAuthHeaders() }),
      { wrap: true, start: crypto.randomUUID() },
    );
    const cached = cachedFilters(uid);
    setFilters(cached); filtersRef.current = cached;
    void (async () => {
      const opened = await openScan({ headers: await scanAuthHeaders() });
      if (opened.stats.claimed) return opened;
      // First visit: ask the server to record the one-time gift; animate only on a confirmed new grant.
      const gift = await claimGift({ headers: await scanAuthHeaders() });
      if (alive && gift.grantedNow) setGiftIntro(true);
      return { ...opened, stats: gift.quota };
    })().then(result => {
      if (!alive) return;
      const f = result.filters ?? cached;
      setFilters(f); filtersRef.current = f;
      setConfigured(result.configured);
      setConfigError(result.configError ?? "");
      if (!getScanSession(uid).busy) updateScanSession(uid, s => ({ ...s, quota: parseQuota(result.stats) }));
      // After a reload / new sign-in: restore today's results for THIS user from server history.
      if (!getScanSession(uid).restored) {
        const restored = result.recent
          ? cardsFromRecent(result.recent, result.now, Date.now(), (p, key, at) => successCard(p, key, f, myProvince, uid, at))
          : [];
        updateScanSession(uid, s => {
          const cards = mergeResultCards(s.cards, restored);
          return { ...s, cards, position: result.position, busy: s.busy || cards.some(c => c.status === "scanning"), restored: result.recent !== null };
        });
      }
    }).catch(e => {
      if (alive) setLoadError(e instanceof Error ? e.message : "Không tải được chức năng quét.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uid, openScan, loadPage, myProvince, claimGift]);

  const reloadQuota = useCallback(async () => {
    if (!uid || getScanSession(uid).busy) return;
    try {
      const q = await refreshQuota({ headers: await scanAuthHeaders() });
      if (!getScanSession(uid).busy) updateScanSession(uid, s => ({ ...s, quota: q }));
    } catch { /* Keep last verified quota; do not invent clean/exhausted state. */ }
  }, [uid, refreshQuota]);
  useEffect(() => {
    const onFocus = () => { void reloadQuota(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void reloadQuota(); }, 30000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [reloadQuota]);
  const loadMoreResults = async () => {
    if (!uid) return;
    const state = getScanSession(uid), position = state.position;
    if (state.busy || state.resultsLoading || !position?.hasMore) return;
    updateScanSession(uid, s => ({ ...s, resultsLoading: true })); setResultsError("");
    try {
      const page = await fetchResults({ data: { cursor: position.cursor, until: position.until, source: position.source }, headers: await scanAuthHeaders() });
      const added = cardsFromRecent(page.rows, Date.now(), Date.now(), (p, key, at) => successCard(p, key, filtersRef.current, myProvince, uid, at));
      updateScanSession(uid, s => ({ ...s, cards: mergeResultCards(s.cards, added), position: page.position }));
    } catch (e) { setResultsError(e instanceof Error ? e.message : "Không tải được kết quả."); }
    finally { updateScanSession(uid, s => ({ ...s, resultsLoading: false })); }
  };

  const finishCard = useCallback((key: string) => {
    if (!uid) return;
    updateScanSession(uid, s => ({ ...s, busy: false, cards: s.cards.map(c => c.key === key ? revealCard(c) : c) }));
  }, [uid]);
  const dropCard = useCallback((key: string) => {
    if (!uid) return;
    updateScanSession(uid, s => ({ ...s, cards: s.cards.filter(c => c.key !== key) }));
  }, [uid]);

  const scan = async () => {
    if (!uid || getScanSession(uid).busy || loading || getScanSession(uid).resultsLoading) return;
    if (getScanSession(uid).quota?.remaining === 0) { toast.error(SCAN_EXHAUSTED_MSG); return; }
    // Required scan config must be saved first (the server checks the saved row again).
    if (configError) { toast.error(configError); setSheet(true); return; }
    if (!configured || !isScanConfigComplete(filtersRef.current)) { toast.error(SCAN_CONFIG_MSG); return; }
    if (isDistanceLocked(filters)) { toast.error(LOCK_MSG); setSheet(true); return; }
    if (!myProvince) { toast.error("Hãy cập nhật khu vực trong hồ sơ để quét gần đây."); return; }
    const wait = getScanSession(uid).cooldownUntil - Date.now();
    if (wait > 0) { toast(`Vui lòng chờ ${Math.ceil(wait / 1000)} giây nữa để quét tiếp.`); return; }
    // The 10 s animation starts immediately; the server decides the result meanwhile.
    const key = `${uid}:${Date.now()}`;
    updateScanSession(uid, s => ({ ...s, busy: true, cards: [...s.cards, { key, status: "scanning", startedAt: Date.now() }] }));
    const abort = () => updateScanSession(uid, s => ({ ...s, busy: false, cards: s.cards.filter(c => c.key !== key) }));
    try {
      if (loadError) {
        const opened = await scanRequest(async () => openScan({ headers: await scanAuthHeaders() }));
        updateScanSession(uid, s => ({ ...s, quota: parseQuota(opened.stats) })); setLoadError("");
        if (opened.stats.remaining === 0) { abort(); return; }
      }
      let result: Awaited<ReturnType<typeof runScan>> | null = null;
      // A removed or already-scanned candidate is skipped without using a scan.
      for (let tries = 0; tries < 5 && (!result || result.stale); tries++) {
        const candidate = pendingRef.current || await scanRequest(async () => pagerRef.current?.next());
        if (!candidate) {
          toast("Bạn đã quét hết người phù hợp hiện có. Quay lại sau nhé.");
          abort(); return;
        }
        // Keep this candidate for retry if the server did not accept the attempt.
        pendingRef.current = candidate;
        result = await scanRequest(async () => runScan({ data: { candidate: candidate.id }, headers: await scanAuthHeaders() }));
        pendingRef.current = null;
      }
      if (!result || result.stale) throw new Error("Không tìm được tài khoản phù hợp. Vui lòng thử lại.");
      updateScanSession(uid, s => ({ ...s, quota: parseQuota(result) }));
      const p = result.person;
      const done: DoneCard = p ? successCard(p, key, filtersRef.current, myProvince, uid) : { key, status: "fail", shownAt: 0 };
      const cooldownUntil = Date.now() + result.delay_seconds * 1000;
      updateScanSession(uid, s => ({ ...s, cooldownUntil,
        cards: s.cards.map(c => c.key === key && c.status === "scanning" ? { ...c, result: done, readyAt: Date.now() } : c) }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không tải được trang kế tiếp. Vui lòng thử lại.";
      if (msg === SCAN_CONFIG_MSG) setConfigured(false);
      toast.error(msg);
      abort();
    }
  };

  const addFriend = async (r: ScanRow) => {
    if (actionsLocked() || !me?.id || sent.has(r.id)) return;
    const res = await sendConnectionRequest({
      fromUser: me.id,
      candidate: { id: r.id, kind: "demo", display_name: r.name, avatar_url: r.avatar, province: r.province, bio: null, age: r.age },
    });
    if (res.requestId || res.matchedNow) {
      setSent((s) => new Set(s).add(r.id));
      toast.success(res.matchedNow ? `Đã kết bạn với ${r.name}!` : `Đã gửi lời mời kết bạn tới ${r.name}`);
    }
  };

  const applyFilters = async (f: ScanFilters): Promise<boolean> => {
    if (actionsLocked() || !uid || isDistanceLocked(f)) return false;
    if (!isScanConfigComplete(f)) { toast.error(SCAN_CONFIG_MSG); return false; }
    const { saved, error } = await saveFilters(f);
    if (error || !saved) { setConfigError(error ?? ""); toast.error(error ?? "Không lưu được cài đặt lên máy chủ. Vui lòng thử lại."); return false; }
    // Success only once the server reads the saved config back for this verified account.
    let check: Awaited<ReturnType<typeof readConfig>>;
    try { check = await readConfig({ headers: await scanAuthHeaders() }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Không xác nhận được cấu hình đã lưu."); return false; }
    if (check.configError || !check.configured || !check.filters) {
      setConfigError(check.configError ?? ""); setConfigured(false);
      toast.error(check.configError || "Máy chủ chưa đọc được cấu hình vừa lưu. Vui lòng thử lại.");
      return false;
    }
    setFilters(check.filters);
    filtersRef.current = check.filters;
    setConfigError("");
    setConfigured(true);
    setSheet(false);
    toast.success("Đã lưu cài đặt tìm kiếm");
    return true;
  };

  // Misses past their 3 s window are never shown again (e.g. after returning to the tab).
  const now = Date.now();
  const cards = session.cards.filter(c => isCardVisible(c, now));
  const needsConfig = !loading && !loadError && !configured;
  useEffect(() => {
    // Re-render once an expired miss should be dropped while away from its own timer.
    const fails = session.cards.filter(c => c.status === "fail");
    if (!fails.length) return;
    const t = setTimeout(() => setTick(n => n + 1), MISS_VISIBLE_MS + FAIL_EXIT_MS);
    return () => clearTimeout(t);
  }, [session.cards]);

  if (giftIntro) return <ScanGiftIntro onDone={() => setGiftIntro(false)} />;
  return (
    <div ref={pageRef} className="nb-page pk-page" aria-busy={scanning}
      onClickCapture={blockAction} onDoubleClickCapture={blockAction} onPointerDownCapture={blockAction}
      onKeyDownCapture={blockKeyAction} onKeyUpCapture={blockKeyAction} onContextMenuCapture={blockAction}>
      {
        <div className="pk-back-space"><div className="pk-back-row">
        {onBack &&
        <Button variant="ghost" size="unstyled" type="button" className="pk-back" disabled={scanning} onClick={() => { if (!actionsLocked()) onBack(); }} aria-label="Trở về Kênh Thế Giới">
          <ArrowLeft /><span>TRỞ VỀ</span>
        </Button>}
        <Button variant="ghost" size="unstyled" type="button" className="pk-back pk-history-button" disabled={scanning || !uid} aria-label="Lịch sử quét" onClick={() => {
          if (actionsLocked()) return;
          setHistoryPage(null); setHistoryOpen(true); void loadHistory();
        }}><History /><span>Đã quét: {historyTotals?.total ?? "—"}</span></Button>
        </div></div>
      }
      <h1 className="nb-title">Tìm Người Đang Online</h1>

      <div className={`pk-list${scanning ? " is-focus" : ""}`}>
        {loading && <p className="nb-empty">Đang tải...</p>}
        {loadError && <p className="nb-empty" role="alert">{loadError}</p>}
        {needsConfig && !cards.length && <p className="nb-empty" role="alert">{configError || SCAN_CONFIG_MSG}</p>}
        {!loading && !loadError && !needsConfig && !cards.length && (
          <p className="nb-empty">
            {myProvince ? "Nhấn “Quét gần đây” để bắt đầu tìm người phù hợp với bạn." : "Cập nhật khu vực trong hồ sơ để tìm bạn gần bạn."}
          </p>
        )}
        {cards.map((c) => {
          if (c.status === "scanning") return <ScanningCard key={c.key} startedAt={c.startedAt} ready={!!c.result} onDone={() => finishCard(c.key)} />;
          if (c.status === "fail") return <FailCard key={c.key} shownAt={c.shownAt} onGone={() => dropCard(c.key)} />;
          const r = c.row;
          const km = simulatedDistanceKm(uid ?? "", r.id, filters);
          const age = scanAgeLabel(c.scannedAt, now);
          return (
            <div key={c.key} className="pk-card">
              <span className={`pk-age pk-age--${age.tone}`} aria-hidden="true">{age.text}</span>
              <Button variant="ghost" size="unstyled" type="button" className="pk-avatar" disabled={scanning} onClick={() => { if (!actionsLocked()) onViewProfile(r.id); }} aria-label={r.name}>
                {r.avatar ? <img src={avatarSrc(r.avatar, 160)} alt="" loading="lazy" decoding="async" width={80} height={80} /> : <span>{r.name.slice(0, 1)}</span>}
              </Button>
              <div className="pk-info">
                <Button variant="ghost" size="unstyled" type="button" className="pk-name" disabled={scanning} onClick={() => { if (!actionsLocked()) onViewProfile(r.id); }}>
                  <span>{r.name}</span>
                  <CloneVipNameMedia userId={r.id} />
                  {r.gender === "female" ? <Venus className="pk-g pk-g--f" /> : r.gender === "male" ? <Mars className="pk-g pk-g--m" /> : null}
                </Button>
                <div className="pk-meta">
                  {r.age ? `${r.age} tuổi` : "Thành viên"}{r.district ? ` · ${r.district}` : ""} · {km} km
                </div>
                {r.need && <span className="pk-need">{NEED_TAG[r.need]}</span>}
                <span className="pk-score">{c.score}% phù hợp</span>
              </div>
              <div className="pk-actions">
                <Button variant="ghost" size="unstyled" type="button" className="pk-btn pk-btn--zalo" onClick={() => addFriend(r)} disabled={scanning || sent.has(r.id)} aria-label="Kết bạn Zalo">
                  <span className="pk-zalo-ic">{zaloLogo ? <img src={zaloLogo} alt="" /> : <ZaloIcon size={18} />}</span>
                  <span>{sent.has(r.id) ? "ĐÃ GỬI" : "ZALO"}</span>
                </Button>
                <Button variant="ghost" size="unstyled" type="button" className="pk-btn pk-btn--chat" disabled={scanning} onClick={() => { if (!actionsLocked()) onOpenChat?.(r.id); }} aria-label="Nhắn tin">
                  <MessageCircle /><span>Nhắn tin</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {resultsError && <p role="alert" className="text-destructive">{resultsError}</p>}
      {session.position?.hasMore && <Button variant="outline" disabled={scanning || session.resultsLoading} onClick={() => void loadMoreResults()}>{session.resultsLoading ? "Đang tải…" : "Tải thêm kết quả"}</Button>}
      {quota?.claimed && quota.remaining === 0 && <p className="text-sm text-muted-foreground" role="status">{SCAN_EXHAUSTED_MSG}</p>}
      <div className="pk-bar">
        <div className="pk-count" aria-label="Lượt quét còn lại (tổng 20 lượt)"><b>{quota?.remaining ?? "—"}</b><small>/20 lượt còn lại</small></div>
        <Button variant="ghost" size="unstyled" type="button" className={`pk-scan${scanning ? " is-on" : ""}`} onClick={scan} disabled={scanning || loading || session.resultsLoading || quota?.remaining === 0 || !quota} aria-label="Quét gần đây">
          <Radar /><span>{scanning ? "Đang quét" : "Quét gần đây"}</span>
        </Button>
        <Button variant="ghost" size="unstyled" type="button" className={`pk-gear${sheet ? " is-on" : ""}${needsConfig && !sheet ? " pk-gear--attention" : ""}`} disabled={scanning} onClick={() => { if (!actionsLocked()) setSheet((v) => !v); }} aria-expanded={sheet && !scanning} aria-label="Cài đặt" data-attention={needsConfig ? "true" : undefined}>
          <Settings />
        </Button>
      </div>

      {sheet && !scanning && <FilterSheet initial={filters} province={myProvince} onClose={() => { if (!actionsLocked()) setSheet(false); }} onApply={applyFilters} />}
      {historyOpen && !scanning && <ScanHistoryDialog page={historyPage} loading={historyLoading} error={historyError}
        onClose={() => setHistoryOpen(false)} onMore={() => void loadHistory(true)} onRetry={() => void loadHistory(!!historyPage)} />}
    </div>
  );
}

/** "Không hợp": visible exactly 3 s from when it was shown, then a soft fade + collapse, then removed. */
function FailCard({ shownAt, onGone }: { shownAt: number; onGone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const goneRef = useRef(onGone);
  goneRef.current = onGone;
  useEffect(() => {
    let t2: ReturnType<typeof setTimeout> | undefined;
    // Remaining time survives tab switches: the 3 s are counted from `shownAt`.
    const t1 = setTimeout(() => {
      // Freeze the current height so the collapse animates from the real size.
      ref.current?.style.setProperty("--pk-h", `${ref.current.offsetHeight}px`);
      setLeaving(true);
      t2 = setTimeout(() => goneRef.current(), FAIL_EXIT_MS);
    }, Math.max(0, shownAt + MISS_VISIBLE_MS - Date.now()));
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
  }, [shownAt]);
  return (
    <div ref={ref} className={`pk-card pk-card--fail${leaving ? " is-leaving" : ""}`} aria-live="polite">
      <div className="pk-fail-x" aria-hidden="true"><X /></div>
      <div className="pk-info"><div className="pk-fail-name"><span className="pk-fail-tag">XỊT</span> <span>NGƯỜI NÀY KHÔNG HỢP</span></div></div>
    </div>
  );
}

/**
 * Đang quét: đúng 10 giây, tiến trình tuyến tính (không tăng vọt). Dừng ở 99% nếu
 * máy chủ chưa trả kết quả. Tiếp tục đúng chỗ cũ khi quay lại tab (tính từ `startedAt`).
 * Hiệu ứng camera lia/zoom chỉ là CSS, không dùng camera thật.
 */
function ScanningCard({ onDone, ready, startedAt }: { onDone: () => void; ready: boolean; startedAt: number }) {
  const [pct, setPct] = useState(() => scanProgress(Date.now() - startedAt, ready));
  const ref = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  useEffect(() => {
    // Mobile alignment + locking belongs to the page and happens before pinning the body.
    if (!window.matchMedia("(max-width: 767px)").matches) ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    const already = Math.max(0, Date.now() - startedAt);
    let t0: number | null = null;
    let raf = 0;
    const tick = (t: number) => {
      if (t0 === null) t0 = t - already;
      const p = scanProgress(t - t0, readyRef.current);
      setPct(p);
      if (p >= 100) { doneRef.current(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startedAt]);
  return (
    <div ref={ref} className="pk-card pk-card--scan pk-cam" role="status" aria-label="Đang quét">
      <span className="pk-cam-frame" aria-hidden="true"><i /><i /><i /><i /></span>
      <div className="pk-scan-ic" aria-hidden="true"><Radar /></div>
      <div className="pk-info">
        <div className="pk-scan-text">Đang tìm người phù hợp với yêu cầu của bạn...</div>
        <div className="pk-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(pct)}>
          <div className="pk-progress__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="pk-progress__pct">{Math.floor(pct)}%</div>
      </div>
    </div>
  );
}

function Range({ min, max, lo, hi, unit, lockedMax, onChange }: { min: number; max: number; lo: number; hi: number; unit: string; lockedMax?: number; onChange: (lo: number, hi: number) => void }) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="fs-range">
      <div className="fs-range__vals">
        <span className={`fs-pill${lockedMax && lo <= lockedMax ? " is-locked" : ""}`}><small>Từ</small><b>{lo}</b> {unit}</span>
        <span className="fs-range__dash" />
        <span className="fs-pill"><small>Đến</small><b>{hi}</b> {unit}</span>
      </div>
      <div className="fs-range__track">
        {lockedMax ? <div className="fs-range__lock" style={{ left: 0, width: `${pct(lockedMax)}%` }} /> : null}
        <div className="fs-range__fill" style={{ left: `${pct(Math.max(lo, lockedMax ? lockedMax : lo))}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" min={min} max={max} value={lo} aria-label="Tối thiểu" onChange={(e) => onChange(Math.min(Number(e.target.value), hi), hi)} />
        <input type="range" min={min} max={max} value={hi} aria-label="Tối đa" onChange={(e) => onChange(lo, Math.max(Number(e.target.value), lo))} />
      </div>
      <div className="fs-range__ends">
        <span>{min}{lockedMax ? `–${lockedMax} km: chưa mở khóa` : ""}</span><span>{max} {unit}</span>
      </div>
    </div>
  );
}

function FilterSheet({ initial, province, onClose, onApply }: { initial: ScanFilters; province: string | null; onClose: () => void; onApply: (f: ScanFilters) => Promise<boolean> }) {
  const area = provinceDistricts(province);
  const [f, setF] = useState<ScanFilters>(initial);
  const selected = f.districts ?? [];
  const [saving, setSaving] = useState(false);
  const locked = isDistanceLocked(f);
  const pick = <T extends string>(list: T[], v: T, label: string, key: "needs" | "bodies") => (
    <Button variant="ghost" size="unstyled" key={v} type="button" aria-pressed={list.includes(v)} className={`fs-opt${list.includes(v) ? " is-on" : ""}`}
      onClick={() => setF({ ...f, [key]: list.includes(v) ? [] : [v] })}>{label}</Button>
  );
  const save = async () => {
    if (locked) { toast.error(LOCK_MSG); return; }
    setSaving(true);
    await onApply(f);
    setSaving(false);
  };
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);
  return createPortal(
    <div className="fs-backdrop" onClick={onClose}>
      <div className="fs-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Cài đặt nhu cầu">
        <div className="fs-grab" />
        <div className="fs-head">
          <span />
          <h2>Cài đặt nhu cầu</h2>
          <Button variant="ghost" size="unstyled" type="button" className="fs-close" onClick={onClose} aria-label="Đóng"><X /></Button>
        </div>
        <div className="fs-body">
          <section className="fs-sec fs-area"><h3>Khu vực{area ? <small className="fs-area__prov">{area.province}</small> : null}</h3>
            {area ? (
              <div className="fs-area__list">
                {area.districts.map(d => {
                  const on = selected.includes(d);
                  return (
                    <Button variant="ghost" size="unstyled" key={d} type="button" aria-pressed={on} className={`fs-opt${on ? " is-on" : ""}`}
                      onClick={() => setF({ ...f, districts: on ? [] : [d] })}>{d}</Button>
                  );
                })}
              </div>
            ) : (
              <p className="fs-lock-msg" role="alert"><Lock />Vui lòng cập nhật khu vực (tỉnh/thành) trong hồ sơ để chọn quận/huyện.</p>
            )}
          </section>
          <section className="fs-sec"><h3>Vóc dáng</h3><div className="fs-opts fs-opts--3">
            {pick<BodyFilter>(f.bodies, "slim", "Mình dây", "bodies")}{pick<BodyFilter>(f.bodies, "fit", "Cân đối", "bodies")}{pick<BodyFilter>(f.bodies, "chubby", "Múp rụp", "bodies")}
          </div></section>
          <section className="fs-sec"><h3>Nhu cầu</h3><div className="fs-opts fs-opts--3">
            {pick<NeedFilter>(f.needs, "fwb", "FWB", "needs")}{pick<NeedFilter>(f.needs, "ons", "ONS", "needs")}{pick<NeedFilter>(f.needs, "love", "NGƯỜI YÊU", "needs")}
          </div></section>
          <section className="fs-sec"><h3>Độ tuổi</h3>
            <Range min={AGE_MIN} max={AGE_MAX} lo={f.ageMin} hi={f.ageMax} unit="tuổi" onChange={(lo, hi) => setF({ ...f, ageMin: lo, ageMax: hi })} />
          </section>
          <section className="fs-sec"><h3>Khoảng cách</h3>
            <Range min={DIST_MIN} max={DIST_MAX} lo={f.distMin} hi={f.distMax} unit="km" lockedMax={LOCKED_MAX_KM} onChange={(lo, hi) => setF({ ...f, distMin: lo, distMax: hi })} />
            {locked && <p className="fs-lock-msg" role="alert"><Lock />{LOCK_MSG}</p>}
          </section>
        </div>
        <div className="fs-foot">
          <Button variant="ghost" size="unstyled" type="button" className="fs-reset" onClick={() => setF(DEFAULT_FILTERS)}>ĐẶT LẠI</Button>
          <Button variant="ghost" size="unstyled" type="button" className="fs-save" onClick={save} disabled={locked || saving}>{saving ? "Đang lưu..." : "LƯU CÀI ĐẶT"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
