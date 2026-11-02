-- Run ONLY on Supabase #2, AFTER RUN_NOW_2026-10-31_SB2_nearby_scan.sql.
-- Additive only: does NOT modify/recreate nearby_scan_settings or nearby_scan_daily,
-- and deletes nothing. Stores per-user scan history as (user UUID, candidate ID, time)
-- only — no names, photos, videos or profile data. Service-role only; the TanStack
-- server verifies the SB1 session and supplies the user UUID itself.
begin;
create table if not exists public.nearby_scan_seen (
  user_id uuid not null,
  candidate_id uuid not null,
  scanned_at timestamptz not null default now(),
  primary key (user_id, candidate_id)
);
grant all on public.nearby_scan_seen to service_role;
revoke all on public.nearby_scan_seen from anon, authenticated;
alter table public.nearby_scan_seen enable row level security;
-- No browser policies. The primary key serves both "has this user scanned X" and
-- "which of these ids has this user scanned" lookups; no extra index needed.

-- Atomic: records the candidate in this user's history AND counts the attempt
-- (via the existing nearby_scan_attempt: 30/day limit, cooldown, hit_percent).
-- Already-scanned candidate => {seen:true}, nothing counted. If the attempt is
-- rejected (limit/cooldown) the whole call rolls back, so no history row is kept.
create or replace function public.nearby_scan_attempt_candidate(p_user uuid, p_candidate uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare res jsonb;
begin
  insert into public.nearby_scan_seen(user_id, candidate_id) values (p_user, p_candidate)
    on conflict do nothing;
  if not found then return jsonb_build_object('seen', true); end if;
  res := public.nearby_scan_attempt(p_user);
  return res || jsonb_build_object('seen', false);
end $$;
revoke all on function public.nearby_scan_attempt_candidate(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nearby_scan_attempt_candidate(uuid, uuid) to service_role;
commit;

-- Undo (only if you want to remove history; this deletes history rows):
-- drop function if exists public.nearby_scan_attempt_candidate(uuid, uuid);
-- drop table if exists public.nearby_scan_seen;
