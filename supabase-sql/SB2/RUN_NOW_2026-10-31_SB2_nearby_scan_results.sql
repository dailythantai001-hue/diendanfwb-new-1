-- Run ONLY on Supabase #2, AFTER RUN_NOW_2026-10-31_SB2_nearby_scan_history.sql.
-- Additive: does NOT recreate nearby_scan_settings / nearby_scan_daily / nearby_scan_seen
-- and deletes nothing. Adds ONE boolean column so a reload can restore today's results
-- (hit = found / miss = "không hợp"). Old history rows keep hit = NULL (not restored).
-- Still no names, photos, videos or profile data in Supabase #2.
begin;
alter table public.nearby_scan_seen add column if not exists hit boolean;
-- Restore reads "this user's rows from today, by time".
create index if not exists nearby_scan_seen_user_time_idx on public.nearby_scan_seen(user_id, scanned_at);

-- Same atomic behaviour as before (history row + counted attempt via nearby_scan_attempt:
-- 30/day limit, cooldown, Admin hit_percent); now also records the server's hit/miss.
create or replace function public.nearby_scan_attempt_candidate(p_user uuid, p_candidate uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare res jsonb;
begin
  insert into public.nearby_scan_seen(user_id, candidate_id) values (p_user, p_candidate)
    on conflict do nothing;
  if not found then return jsonb_build_object('seen', true); end if;
  res := public.nearby_scan_attempt(p_user);
  update public.nearby_scan_seen set hit = (res->>'hit')::boolean
    where user_id = p_user and candidate_id = p_candidate;
  return res || jsonb_build_object('seen', false);
end $$;
revoke all on function public.nearby_scan_attempt_candidate(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nearby_scan_attempt_candidate(uuid, uuid) to service_role;
commit;

-- Undo (keeps all rows; only removes the extra column/index):
-- drop index if exists public.nearby_scan_seen_user_time_idx;
-- alter table public.nearby_scan_seen drop column if exists hit;
