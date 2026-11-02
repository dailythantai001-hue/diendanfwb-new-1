-- ============================================================================
-- PROPOSAL ONLY — NOT RUN. Supabase #1 (gxfxqbhxoghdhokwjpex), table public.profiles
-- Phase 1: visitors who are NOT signed in (role anon) may read only public columns.
-- Does not delete data, does not change RLS policies, does not touch signed-in users.
--
-- Found on 2026-10-31 (counts only, no values read):
--   * anon (public key) can SELECT every column of profiles, incl. phone (363 rows filled),
--     birthday (332), zalo (18), email/password/last_ip (currently empty).
--   * Signed-in users (role authenticated) can also read these columns for ALL members.
--     That needs Phase 2 (code change: own data + admin reads via SECURITY DEFINER RPCs)
--     because the app reads profiles with select("*") for the signed-in user.
-- ============================================================================

-- STEP 0 (read-only): see current column grants before changing anything.
-- select grantee, privilege_type, column_name from information_schema.column_privileges
--  where table_schema='public' and table_name='profiles' and grantee in ('anon','authenticated') order by 1,3;

begin;
-- Table-level SELECT is replaced by an explicit list of public columns for anon only.
revoke select on public.profiles from anon;
grant select (
  id, public_id, username, display_name, full_name, nickname,
  avatar, avatar_url, cover_url, bio, gender, age, province, city, region, intent,
  vip_level, verified, badge_id, identity_crown, identity_flag, identity_pet,
  title_gif_url, profile_gif, followers_count, following_count, posts_count,
  is_online, last_seen, created_at
) on public.profiles to anon;
commit;

-- ROLLBACK (restores today's behaviour exactly):
-- begin; revoke select on public.profiles from anon; grant select on public.profiles to anon; commit;

-- ----------------------------------------------------------------------------
-- Phase 2 (needs code changes first — do NOT run as SQL alone):
--   1. Add RPC get_my_private_profile() SECURITY DEFINER returning phone/email/birthday/zalo
--      for auth.uid() only; switch auth-provider select("*") to explicit public columns + RPC.
--   2. Move admin reads of phone/last_ip (phone-verifications, MembersManager, AntiClonePanel,
--      device-intel) to admin-checked SECURITY DEFINER RPCs.
--   3. Then: revoke select on public.profiles from authenticated; grant select (<public cols>,
--      plus columns the app filters on) on public.profiles to authenticated;
-- ----------------------------------------------------------------------------
