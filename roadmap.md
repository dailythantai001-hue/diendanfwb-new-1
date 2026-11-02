# Website import and payment QR
## History popup close control (2026-11-02)
- [x] Scope explicit visible pink 44px X to history header outside scrolling list; use existing Button and Radix close, preserve caller/history state and outside-dismiss behavior.
- [x] Mobile 393×566 actual-component isolated browser check: X visible, stays fixed with long-list spacer, X/backdrop dismiss, entry page scroll 400 restored; six history tests pass and automatic build OK. Real authenticated history remains unverified. No SQL/RPC/Supabase/V5 changes.
## Imported-project Nearby Scan diagnosis (2026-11-02)
- [x] Check secret names and server environment: SUPABASE2_SERVICE_ROLE_KEY and SUPABASE1_SERVICE_ROLE_KEY absent; SB1 sign-in uses existing public fallback, scan SB2 requires its server-only credential.
- [x] Confirm effective SB1/SB2 URLs unchanged; SB1 public auth settings GET 200, SB2 public schema GET 401 (does not establish service-role RPC status).
- [x] Inspect published/preview logs: no specific scan exception found; five isolated configuration/quota/result tests pass, missing credential fails before any SB2 request. No app configuration, SQL, RPC or data changes.
- [ ] Verify hosted V5 RPCs and real authenticated scan — blocked by missing SB2 server credential and unavailable external-account session; do not invoke gift/attempt writers during diagnosis.
## Current Nearby Scan scroll and own-account history
- [x] Align active scan above fixed quota bar, mobile lock and prior scroll restoration.
- [x] Add compact history count and newest-first hits/misses with server timestamps and authenticated read-only pagination; nullable legacy outcomes remain unknown.
- [x] 70 tests passed; actual SearchPage mobile fixture at 393×641 verifies alignment from scroll 0/480, lock/restoration and history open/close; automatic build OK. No SQL/RPC/database changes or deployment.
- [ ] Verify real own-account history end-to-end — blocked by unavailable external-account session; isolated browser fixtures do not verify hosted authentication or reads.
## Nearby Scan: 20 lượt trọn đời (2026-11-01 16:36 UTC) — replaces weekly v3
- [x] v4 SQL + pause/resume files; v2/v3 kept. 8/8 disposable-DB tests pass.
- [x] Remove gifts/reset/countdown/weekly UI and server actions; app fails closed on non-lifetime replies; 31 app tests pass.
- [ ] Deploy v4 SQL then frontend — blocked: explicit approval; real SB2 data not reconciled.
## Weekly scan v3 (2026-11-01 16:24 UTC)
- [x] v3 SQL, rollback and reactivate files (v2 kept); per-day weekly-mode counter; conservative install; no changes to old data.
- [x] 10/10 disposable-PostgreSQL scenarios pass (scripts/weekly-scan-v3-postgres-tests.py); app daily-remaining check + 9 unit tests pass.
- [ ] Deploy to SB2 / production — blocked: explicit approval; hosted SB2 data not reconciled (no read access used).
## Complete v2 application preparation (2026-11-01 12:51 UTC)
- [ ] Identify accessible FWB Vietnam deployment and secret configuration without changing secrets.
- [ ] Connect scan server/Admin/user UI to mode-aware quota, gifts, reset, isolated history, statistics, server countdown and uncapped result pages; verify with isolated fixtures.
- [ ] Report proposed legacy RPC fencing, least-privilege read-only access, backup/restore gates and exact outstanding permissions. No hosted SQL/data/security/secret changes.
## Predeployment verification requested (2026-11-01 12:38 UTC)
- [x] Run independent PostgreSQL 17.11 connections against an isolated fixture: 12 scenarios repeated three times passed (36 checks), 12 concurrently active distinct PIDs; 49 regression tests passed.
- [x] Audit repository scan writers and old/new function compatibility; document remaining UI/mode/pagination/retry gaps, privileged legacy entrypoints, complete cutover and backup/restore validation gates. Live writers remain unverified.
- [ ] Reconcile actual SB2 history — blocked: existing SB2 read credentials/connection unavailable; stop rather than infer.
- [x] Deliver test report and staged deployment plan plus raw JSON evidence; no hosted SQL/data changes. Backup/restore validation blocked by unavailable verified provider backup/access. Deployment and complete UI cutover remain gated; not production-ready.
## Revised weekly SQL review (2026-11-01 03:48 UTC)
- [x] Revise draft SQL and operational rollback only: durable gift balance, separate history, exact statistics, unlimited-total pagination, atomic actions and Sunday noon VN.
- [x] 27 isolated SQL/time/regression tests passed; full v2 SQL, rollback and explanations provided in Files. Multi-connection interleaving remains unverified (PGlite queues one connection).
- [ ] Apply SQL and integrate pagination/quota UI — blocked: explicit SQL approval; do not change existing SB2 or data.
## ZIP re-import + weekly scan (2026-11-01)
- [x] Import ZIP into this project (structure and DB config unchanged, same 4 databases).
- [x] 3D Tìm Bạn magnifier icon (transform/opacity animation, reduced-motion fallback).
- [x] Members see a neutral maintenance message instead of Supabase #2 config errors; admins still see details.
- [x] Admin Tìm Kiếm: weekly quota list, +1/+2/custom gift, per-user/all Reset and Clear history, countdown to Sunday 12:00 VN.
- [x] Weekly SQL drafted in supabase-sql/SB2/PENDING_APPROVAL_2026-11-01_SB2_weekly_scan_quota.sql (not run).
- [ ] Run weekly SQL on SB2 — blocked: user approval.
- [ ] Real scan/save verification — blocked: server secrets (SUPABASE2_SERVICE_ROLE_KEY etc.) are not present in this newly imported project.
## Weekly scan administration — planning only
- [x] Open secure SUPABASE2_SERVICE_ROLE_KEY form for existing SB2; user saved it without exposing its value.
- [x] Inspect current scan schema/code: local SQL uses 30/day; restore is today-only and capped at 60. Present weekly quota/gift/reset/history plan with proposed SB2 tables/columns/SQL; no application-code edits or database writes. User chose to clear unused gifts on reset.
- [ ] Implement only after plan and proposed SQL approval; preserve four databases, account identities and old scan results. Current blocker: user approval.
## Current mobile composer and Xem Box
- [x] Hide only mobile quota warning using a dedicated CSS class; blocked calculations, submit disabled state, Hết lượt and VIP benefits remain untouched; desktop warning preserved.
- [x] Label existing group action Xem Box and add last-pass compact mobile sizing; keep icon, count, account reads, popup handler and permissions.
- [x] 15 related tests pass, automatic build OK. Browser renders actual ReactionBar with supplied fixture context at 393px: 32px tall Xem Box, no overflow, same popup/URL and Escape close, no page errors. Isolated blocked-composer markup/CSS verifies hidden warning, disabled Hết lượt and visible VIP control; real authenticated composer flow not exercised and no database writes.
## Current Find friends presentation and SB2 diagnosis
- [x] Reduce Back from 54px to 44px (18.5%), font 16px → 14px and padding/icon size; retain minimum 44px after scrolling and existing locks/header placement.
- [x] Rename bottom Search to Tìm Bạn; distinguish icon/label with semantic accent/bold label and restrained existing blue/violet opacity pulse; unchanged geometry and search callback.
- [x] Exact error originates before any SB2 request at secondaryRead: SUPABASE2_SERVICE_ROLE_KEY absent both in current configured secret names and sandbox environment. Local SQL declares service_role-only tables/RPCs; no evidence this error is an RLS denial. No SQL executed, provider settings changed, or database writes.
- [x] 38 tests pass (including missing-key test asserting no request), automatic build OK. Browser fixtures verify 44px Back, compact 44px, Tìm Bạn/search callback, unchanged geometry, mobile glow, desktop no animation and reduced-motion fallback; no page errors.
- [ ] Verify current hosted SB2 write grants and real scan — missing SUPABASE2_SERVICE_ROLE_KEY and external real-account session block privileged read-only checks/end-to-end flow. Needs user-approved secure configuration before verification; do not assume local SQL proves hosted grants or older checks remain current.
## Current post menu and mobile Search glow
- [x] Remove the only post edit menu entrypoint while retaining copy/delete/report actions and permissions; no database changes.
- [x] Add mobile-only blue/violet Search icon glow with a gentle 12-second opacity cycle, occasional brighter pulse and static reduced-motion fallback; no layout or navigation changes, timers or media downloads.
- [x] Six tests pass and automatic build OK. Actual compiled components in isolated browser fixture verify menu has exactly copy link/copy UID/delete for owner and each original callback runs; Search click returns search, unchanged geometry, mobile glow, desktop absence and reduced-motion animation disabled, no page errors. Real authenticated posting/data actions and physical-phone performance not exercised.
## Current pending-review upgrade
- [x] Add authenticated exact pending count beside Duyệt bài, refreshed every 10 seconds and on focus, hidden at zero; mutations decrement immediately then revalidate.
- [x] Add approve-all and confirmed reject-all across the entire pending snapshot (keyset beyond 100 rows), with synchronous duplicate-click protection and existing server eligibility checks.
- [x] Clean server-read R2 references only after winning the pending-only rejection; missing config retains the row, three idempotent attempts per image, cleanup failures surfaced separately. No SQL/RLS or provider changes; cross-service cleanup is not atomic and durable orphan retry is not added.
- [x] 23 tests across five files pass, automatic build OK. Actual compiled component in browser fixture verifies 5 → 0 → 1 counts, zero hidden, cancel performs no writes, approve-all, confirmed rejection, desktop and 393px layout without overflow/page errors. Unauthenticated endpoint returns 401; content routes already have metadata (three metadata-less routes are redirects).
- [ ] Verify real Admin approval/public feed and actual R2 deletion end-to-end — no existing external Admin session available; browser checks use isolated mocked rows and tests mock R2, no real data writes.
## Current post notice and R2 secrets
- [x] Save the five requested R2 variables securely for the existing bucket; no provider configuration or database changes.
- [x] Replace pending-post modal with a compact green notice, retaining the existing successful-insert gate; four timer tests pass and automatic build OK. Actual component rendered in browser fixture: exact text, green, no buttons, automatic removal, no page errors; real website remains signed out.
- [ ] Verify authenticated posting and actual R2 upload — requires an existing real-account session; no fabricated data writes.
## Unify website VIP restriction presentation
- [x] Audit all found VIP entrypoints; entitlement helpers and all existing permission branches unchanged. Group VIP-5 mount has no active opener in current source; hosted create_group permission unverified.
- [x] Route legacy aliases, liked-you and regional lock presentations to VIP ZALO; preserve old Admin preview/data separately. Keep group/profile/contact menu and regional picker state under overlay.
- [x] 53 tests/13 files pass; desktop/mobile isolated browser verifies six real adapters preserve URL, draft, profile, scroll and focus, one new screen, no errors. Full source search finds old presentation import only in Admin preview; dormant components documented in docs/VIP-ZALO-UNIFIED-2026-10-31.md.
- [ ] Verify all actual signed-in entrypoints and hosted VIP-5 create_group permission — external authenticated session unavailable and source contains no active group opener; cannot claim complete real-site end-to-end verification.
## VIP ZALO benefit reminders and shared international configuration
- [x] Add independent user/plan/benefit browser viewed state and subtle yellow reminders with reduced-motion fallback and isolated Admin preview.
- [x] Add shared international editing after explicit Admin adoption; retain old country arrays and exact JSON snapshot, no hosted data writes or schema change.
- [x] 35 tests across seven files pass; automatic build OK. Compiled actual screen/CSS fixture verified at 393×852 and 1280×1800: five individual markers, close/remount/reload, plan isolation, five countries, detail navigation, unchanged geometry and reduced motion; no browser page errors. Actual website displays sign-in screen.
- [ ] Verify authenticated VIP flow and real Admin save/read on existing external database — no usable authenticated session; mocked configuration persistence and isolated browser fixture are not hosted verification. Cross-device viewed-state synchronization and physical-device performance were not implemented/verified.
## VIP ZALO swipe guidance
- [x] Add a subtle forward cue beside page indicators; show reverse guidance on the last page, retaining navigation, real gestures and support contact.
- [x] 22 related tests pass; automatic build OK. Compiled-component fixture verifies mobile touch 1/2 → 2/2 → 1/2, matching cues, reduced motion, desktop drag and one support button below content with no browser errors. Real-account and physical-phone verification unavailable; no data writes.
## VIP ZALO detail authoring
- [x] Extend existing JSON detail pages compatibly with tab names and ordered content rows; no migration or new database.
- [x] Add Admin tab/row editing, image inputs, ordering and previews; retain old content.
- [x] Render individual banners and rows in swipeable popup, preserving single shared contact action.
- [x] 27 related tests pass; automatic build OK. Isolated compiled-component browser fixture checks 2 tabs, 2 banners, 6 icon rows, simulated save/reload, real touch left/right, dot navigation, vertical scrolling and desktop drag (393×852 and 1280×1800); single contact below pages; no browser errors.
- [ ] Verify real Admin save/reload and hosted media upload — existing external database Admin session unavailable; mocked persistence/upload checks are not hosted verification. Physical-device testing unavailable.
## VIP full-screen presentation
- [x] Inspect shared VIP aliases, Chat call/header prompts, private FWB prompt and Chat VIP-5 group prompt; preserve existing reads/actions. The existing VIP-5 group state has no opener in current source; no new eligibility logic added.
- [x] Present shared VIP full-screen with bottom-up animation, fixed Back/actions, independent scrolling, focus isolation and existing reference-counted body lock; do not navigate on Back.
- [x] Migrate private Chat/FWB presentations, retaining legacy gate copy/action callbacks. Keep FWB's selected mini-profile mounted for exact Back restoration rather than clearing it.
- [x] 22 targeted tests pass (including 8 shared VIP and 2 FWB tests); latest automatic TypeScript/build OK. Actual signed-out homepage loads without page errors. Actual compiled VIP/CSS in mocked auth/config browser fixture verified at 1280×1800, 393×852 and 949×623: full-screen bounds, own scrolling, Back, window scroll 320, container scroll 137, draft and focus restored.
- [ ] Verify every VIP opener end-to-end on real signed-in Chat/FWB/Admin accounts and physical phones — existing external database session unavailable; isolated fixtures are not authenticated verification. Chat VIP-5 prompt additionally has no current opener.
## Current Search interaction changes
- [x] Remove Back's white background strip; compact button height from 54px to 44px on scroll and restore at top. 19 Search tests pass; down/up and transparent surround verified in isolated production-CSS fixtures at iPhone, Android and desktop sizes (authenticated page and physical devices unavailable).
- [x] Keep Back visible beneath the measured header with reserved initial space and an opaque button only, transparent surrounding row.
- [x] Block all Search actions using the actual per-user busy state; release on reveal, rejected request or bounded network wait without changing scan results or animation.
- [x] 44 targeted tests pass; isolated production-CSS layouts checked at 393×623, 412×915 and 1280×1800 (not authenticated end-to-end or physical-device verification).
- [ ] Verify Search scan on a real signed-in account — existing external authentication session unavailable.
## Current nearby scan connection diagnosis
- [x] Locate missing-key message and confirm SUPABASE2_SERVICE_ROLE_KEY absent from project secrets and server environment.
- [x] Check SB2 URL/RPC names and local SQL service_role grants; 44 targeted tests pass (not verification of hosted database grants).
- [x] Configure existing SB2 service-role credential securely; no backend created or database data changed.
- [x] Verify server-side GET 200 for settings/daily/seen (including hit column), overview RPC POST 200, and all four RPCs visible in service-role schema; other three POSTs safely fail UUID validation (22P02), without writes.
- [ ] Verify hosted write grants and full execution of open/attempt/attempt_candidate with a verified real account — not exercised to avoid fabricated users and counted attempts.
- [ ] Verify scan flow on a real account — blocked by unavailable existing authenticated session.
## Search scan administration
- [x] Implement SB2 female-community keyset pagination, retry errors without false exhaustion; 29 scan/SQL/UI tests pass and latest build OK.
- [x] Add lazy Search tab after member management with delay/hit settings and aggregate real-user overview.
- [x] Prepare and validate SB2-only SQL grants, RLS and atomic 30/day counters against isolated Postgres.
- [ ] Connect actual existing SB2 female account source — waiting for exact source name/schema; default second_accounts not exposed by connected #2.
- [ ] Apply pending SB2 scan SQL — external database migration access unavailable; do not claim durable production stats yet.
- [ ] Verify scan/admin central flow on actual accounts — waiting for source, SQL application and existing authenticated session; signed-out page opens without runtime errors.
- [x] Hide Bank/QR ellipsis and action sheet, sharing the existing gesture-disabled condition; regression tests preserve inline copy, QR zoom and ordinary-message classification.
- [x] Import inspected ZIP source, preserving components and existing DB configuration.
- [x] Fix payment QR parsing, card rendering and image zoom without DB changes.
- [x] Verify 23 regression tests, website sign-in rendering, QR card and zoom in browser without DB writes.
- [x] Report authenticated/provider verification blockers accurately.
- [ ] Verify an actual admin-to-user message on the old DB — blocked by unavailable existing authenticated session.
- [ ] Verify uploads and scheduled services — blocked by existing provider server secrets not configured in this project.
# Remove From Reply
- [x] Remove code, tab, cron route, tests; move SB4 SQL to _removed
- [ ] Run SB4 drop SQL — waits on Admin review (PENDING_2026-10-16_DROP_from_reply_SB4.sql)
