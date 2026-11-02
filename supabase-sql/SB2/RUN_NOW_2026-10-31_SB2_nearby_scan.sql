-- Run ONLY on Supabase #2. Does not copy accounts or modify SB1/existing tables.
-- Private service-role-only tables: SB1 identity/admin authorization is verified
-- in TanStack server functions before any privileged query. No cross-DB auth.uid assumptions.
begin;
create table if not exists public.nearby_scan_settings (
  id smallint primary key check (id = 1),
  delay_seconds numeric not null check (delay_seconds between 0 and 3600),
  hit_percent numeric not null check (hit_percent between 0 and 100)
);
grant all on public.nearby_scan_settings to service_role;
revoke all on public.nearby_scan_settings from anon, authenticated;
alter table public.nearby_scan_settings enable row level security;
-- No browser policies: only authorized server endpoints may access these rows.
insert into public.nearby_scan_settings values (1, 1.6, 50) on conflict (id) do nothing;

create table if not exists public.nearby_scan_daily (
  user_id uuid not null,
  scan_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  total integer not null default 0 check (total between 0 and 30),
  hits integer not null default 0 check (hits >= 0),
  misses integer not null default 0 check (misses >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, scan_date),
  check (total = hits + misses)
);
grant all on public.nearby_scan_daily to service_role;
revoke all on public.nearby_scan_daily from anon, authenticated;
alter table public.nearby_scan_daily enable row level security;
-- PK supports per-user aggregation/atomic updates. Date index supports daily reporting.
create index if not exists nearby_scan_daily_date_idx on public.nearby_scan_daily(scan_date);

create or replace function public.nearby_scan_open(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.nearby_scan_daily;
begin
  insert into public.nearby_scan_daily(user_id) values(p_user) on conflict do nothing;
  select * into strict r from public.nearby_scan_daily where user_id=p_user
    and scan_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
  return jsonb_build_object('total',r.total,'hits',r.hits,'misses',r.misses);
end $$;
revoke all on function public.nearby_scan_open(uuid) from public, anon, authenticated;
grant execute on function public.nearby_scan_open(uuid) to service_role;

create or replace function public.nearby_scan_attempt(p_user uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.nearby_scan_daily; cfg public.nearby_scan_settings; hit boolean;
begin
  insert into public.nearby_scan_daily(user_id) values(p_user) on conflict do nothing;
  select * into strict r from public.nearby_scan_daily where user_id=p_user
    and scan_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date for update;
  select * into strict cfg from public.nearby_scan_settings where id=1;
  if r.total >= 30 then raise exception 'Bạn đã dùng hết lượt quét hôm nay.'; end if;
  if r.total > 0 and r.updated_at + (cfg.delay_seconds * interval '1 second') > clock_timestamp()
    then raise exception 'Lượt quét trước chưa hoàn tất.'; end if;
  hit := random() * 100 < cfg.hit_percent;
  update public.nearby_scan_daily set total=total+1,
    hits=hits+case when hit then 1 else 0 end,
    misses=misses+case when hit then 0 else 1 end, updated_at=clock_timestamp()
    where user_id=p_user and scan_date=r.scan_date returning * into r;
  return jsonb_build_object('hit',hit,'total',r.total,'hits',r.hits,'misses',r.misses,'delay_seconds',cfg.delay_seconds);
end $$;
revoke all on function public.nearby_scan_attempt(uuid) from public, anon, authenticated;
grant execute on function public.nearby_scan_attempt(uuid) to service_role;

create or replace function public.nearby_scan_overview(p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = public as $$
  with grouped as (
    select user_id, sum(total) as total, sum(hits) as hits, sum(misses) as misses
    from public.nearby_scan_daily group by user_id
  ), page as (
    select * from grouped order by user_id limit 20 offset greatest(p_offset,0)
  ) select jsonb_build_object('participants',(select count(*) from grouped),
    'rows',coalesce((select jsonb_agg(page order by user_id) from page),'[]'::jsonb));
$$;
revoke all on function public.nearby_scan_overview(integer) from public, anon, authenticated;
grant execute on function public.nearby_scan_overview(integer) to service_role;
commit;

-- Second accounts are NOT stored here. Scan results come from Supabase #1
-- (profiles where account_source = 'internal' and gender = 'female').
-- This file only creates scan settings + per-user daily counters (no names, no media).
