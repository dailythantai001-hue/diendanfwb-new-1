-- CHỜ DUYỆT v2 — KHÔNG CHẠY TRÊN DB THẬT KHI CHƯA ĐƯỢC ĐỒNG Ý.
-- Chỉ dự án Supabase #2: pymwwuscoftmdcmmeckp.
-- SQL Editor không tự biết mã dự án: người chạy phải chọn đúng #2.
-- Dừng quét/Admin, sao lưu toàn bộ schema/data trước triển khai.
-- Giữ 4 dự án; không ALTER/RLS/DELETE/DROP bảng cũ; giữ seen vĩnh viễn.
-- Bản v1 chưa được chạy. Nếu đã có bất kỳ bảng/hàm v2, dừng để đối chiếu.
-- Hoàn tác vận hành dùng file ROLLBACK_PENDING_2026-11-01_SB2_weekly_scan_quota.sql.
begin;
select pg_advisory_xact_lock(7240211202601);

do $$ begin
  if to_regclass('public.nearby_scan_weekly') is not null
     or to_regclass('public.nearby_scan_accounts') is not null
     or to_regclass('public.nearby_scan_deployment') is not null then
    raise exception 'Đã có cấu trúc tuần: phải đối chiếu trước, không áp dụng chồng.';
  end if;
  if to_regprocedure('public.nearby_scan_open(uuid)') is null
     or to_regprocedure('public.nearby_scan_attempt(uuid)') is null
     or to_regprocedure('public.nearby_scan_attempt_candidate(uuid,uuid)') is null
     or to_regprocedure('public.nearby_scan_overview(integer)') is null then
    raise exception 'Thiếu hàm quét cũ; chưa đủ điều kiện triển khai.';
  end if;
end $$;

create table public.nearby_scan_deployment (
  id smallint primary key check (id=1),
  mode text not null check (mode in ('weekly','daily')),
  cutover_at timestamptz not null,
  original_functions jsonb not null
);
grant all on public.nearby_scan_deployment to service_role;
revoke all on public.nearby_scan_deployment from public, anon, authenticated;
alter table public.nearby_scan_deployment enable row level security;
insert into public.nearby_scan_deployment
select 1,'weekly',clock_timestamp(),jsonb_object_agg(sig,pg_get_functiondef(to_regprocedure(sig)))
from unnest(array['public.nearby_scan_open(uuid)','public.nearby_scan_attempt(uuid)',
  'public.nearby_scan_attempt_candidate(uuid,uuid)','public.nearby_scan_overview(integer)']) sig;

-- Bảo toàn phiên bản hàm ngày THỰC TẾ, không giả định file SQL cũ giống DB đang chạy.
do $$ declare defs jsonb; begin
  select original_functions into defs from public.nearby_scan_deployment where id=1;
  execute replace(defs->>'public.nearby_scan_open(uuid)',
    'FUNCTION public.nearby_scan_open(', 'FUNCTION public.nearby_scan_legacy_open(');
  execute replace(defs->>'public.nearby_scan_attempt(uuid)',
    'FUNCTION public.nearby_scan_attempt(', 'FUNCTION public.nearby_scan_legacy_attempt(');
end $$;

create table public.nearby_scan_accounts (
  user_id uuid primary key,
  gift_balance bigint not null default 0 check (gift_balance>=0),
  gifts_granted bigint not null default 0 check (gifts_granted>=0),
  gifts_spent bigint not null default 0 check (gifts_spent>=0),
  legacy_total bigint not null default 0,
  legacy_hits bigint not null default 0,
  legacy_misses bigint not null default 0,
  new_total bigint not null default 0,
  new_hits bigint not null default 0,
  new_misses bigint not null default 0,
  last_attempt_at timestamptz,
  check (gift_balance=gifts_granted-gifts_spent),
  check (legacy_total=legacy_hits+legacy_misses and legacy_hits>=0 and legacy_misses>=0),
  check (new_total=new_hits+new_misses and new_hits>=0 and new_misses>=0)
);
grant all on public.nearby_scan_accounts to service_role;
revoke all on public.nearby_scan_accounts from public, anon, authenticated;
alter table public.nearby_scan_accounts enable row level security;

create table public.nearby_scan_weekly (
  user_id uuid not null,
  week_start timestamptz not null,
  used bigint not null default 0 check (used>=0), -- hạn mức kể từ reset gần nhất
  base_used bigint not null default 0 check (base_used between 0 and 20),
  total bigint not null default 0,
  hits bigint not null default 0,
  misses bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,week_start),
  check (total=hits+misses and hits>=0 and misses>=0)
);
grant all on public.nearby_scan_weekly to service_role;
revoke all on public.nearby_scan_weekly from public, anon, authenticated;
alter table public.nearby_scan_weekly enable row level security;

create table public.nearby_scan_quota_actions (
  request_id uuid primary key,
  admin_id uuid not null,
  user_id uuid,
  week_start timestamptz not null,
  action text not null check (action in ('gift','reset_one','reset_all','clear_history_one','clear_history_all')),
  amount integer not null check (amount between 0 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  result jsonb not null,
  check ((action in ('reset_all','clear_history_all'))=(user_id is null)),
  check ((action='gift' and amount>=1) or (action<>'gift' and amount=0))
);
grant all on public.nearby_scan_quota_actions to service_role;
revoke all on public.nearby_scan_quota_actions from public, anon, authenticated;
alter table public.nearby_scan_quota_actions enable row level security;

create table public.nearby_scan_saved_results (
  user_id uuid not null,
  candidate_id uuid not null,
  scanned_at timestamptz not null,
  primary key(user_id,candidate_id)
);
grant all on public.nearby_scan_saved_results to service_role;
revoke all on public.nearby_scan_saved_results from public, anon, authenticated;
alter table public.nearby_scan_saved_results enable row level security;
create index nearby_scan_saved_results_page on public.nearby_scan_saved_results(user_id,scanned_at,candidate_id);

-- Chỉ bảng này được Xóa lịch sử. seen vẫn là danh sách đã quét VĨNH VIỄN.
create table public.nearby_scan_history (
  user_id uuid not null,
  candidate_id uuid not null,
  scanned_at timestamptz not null,
  hit boolean,
  primary key(user_id,candidate_id)
);
grant all on public.nearby_scan_history to service_role;
revoke all on public.nearby_scan_history from public, anon, authenticated;
alter table public.nearby_scan_history enable row level security;

create or replace function public.nearby_scan_week_start(p_at timestamptz default now())
returns timestamptz language sql immutable set search_path=public as $$
  select ((date_trunc('day',(p_at at time zone 'Asia/Ho_Chi_Minh')-interval '12 hours')
    -make_interval(days=>extract(dow from (p_at at time zone 'Asia/Ho_Chi_Minh')-interval '12 hours')::int)
    +interval '12 hours') at time zone 'Asia/Ho_Chi_Minh');
$$;

-- FAIL CLOSED: kỳ hiện tại phải có lịch sử đầy đủ để xác định mốc trưa Chủ nhật.
-- Tổng trọn đời lấy snapshot daily; tuần backfill KHÔNG được cộng lần nữa vào tổng đó.
do $$ declare ws timestamptz; cutoff timestamptz; begin
  select cutover_at into cutoff from public.nearby_scan_deployment where id=1;
  ws:=public.nearby_scan_week_start(cutoff);
  if exists (
    with d as (
      select user_id,scan_date,total,hits,misses from public.nearby_scan_daily
      where scan_date >= (ws at time zone 'Asia/Ho_Chi_Minh')::date
    ), s as (
      select user_id,(scanned_at at time zone 'Asia/Ho_Chi_Minh')::date scan_date,
        count(*) n,count(*) filter(where hit=true) h,count(*) filter(where hit=false) m
      from public.nearby_scan_seen
      where scanned_at >= ((ws at time zone 'Asia/Ho_Chi_Minh')::date::timestamp at time zone 'Asia/Ho_Chi_Minh')
      group by user_id,(scanned_at at time zone 'Asia/Ho_Chi_Minh')::date
    ) select 1 from d full join s using(user_id,scan_date)
      where coalesce(d.total,0)<>coalesce(s.n,0)
         or coalesce(d.hits,0)<>coalesce(s.h,0)
         or coalesce(d.misses,0)<>coalesce(s.m,0)
  ) or exists(select 1 from public.nearby_scan_seen where scanned_at>cutoff) then
    raise exception 'Lịch sử tuần hiện tại không đầy đủ/không khớp bộ đếm ngày: dừng, cần đối soát được duyệt; không suy đoán.';
  end if;
end $$;

insert into public.nearby_scan_accounts(user_id,legacy_total,legacy_hits,legacy_misses,last_attempt_at)
select user_id,sum(total),sum(hits),sum(misses),max(updated_at) filter(where total>0)
from public.nearby_scan_daily group by user_id;
insert into public.nearby_scan_accounts(user_id)
select distinct user_id from public.nearby_scan_seen on conflict do nothing;
insert into public.nearby_scan_weekly(user_id,week_start,used,base_used,total,hits,misses)
select s.user_id,public.nearby_scan_week_start(d.cutover_at),count(*),least(20,count(*)),count(*),
  count(*) filter(where s.hit=true),count(*) filter(where s.hit=false)
from public.nearby_scan_seen s cross join public.nearby_scan_deployment d
where s.hit is not null and s.scanned_at>=public.nearby_scan_week_start(d.cutover_at)
  and s.scanned_at<=d.cutover_at group by s.user_id,d.cutover_at;
insert into public.nearby_scan_saved_results select user_id,candidate_id,scanned_at
from public.nearby_scan_seen where hit=true;
insert into public.nearby_scan_history select user_id,candidate_id,scanned_at,hit from public.nearby_scan_seen;

-- Ordre unique: global partagé → user; Admin global: global exclusif → request → users triés.
-- Hash collision ne fait que sérialiser davantage; aucune identité n'est fusionnée.
create or replace function public.nearby_scan_lock_user(p_user uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if p_user is null then raise exception 'Thiếu tài khoản.'; end if;
  perform pg_advisory_xact_lock_shared(7240211202601);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,71));
end $$;

create or replace function public.nearby_scan_open(p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a public.nearby_scan_accounts; w public.nearby_scan_weekly; t timestamptz; ws timestamptz; mode_value text; old jsonb;
begin
  perform public.nearby_scan_lock_user(p_user);
  t:=clock_timestamp(); ws:=public.nearby_scan_week_start(t);
  insert into public.nearby_scan_accounts(user_id) values(p_user) on conflict do nothing;
  insert into public.nearby_scan_weekly(user_id,week_start) values(p_user,ws) on conflict do nothing;
  select * into strict a from public.nearby_scan_accounts where user_id=p_user;
  select * into strict w from public.nearby_scan_weekly where user_id=p_user and week_start=ws;
  select mode into mode_value from public.nearby_scan_deployment where id=1;
  if mode_value='daily' then
    old:=public.nearby_scan_legacy_open(p_user);
    return old || jsonb_build_object('mode','daily','remaining',greatest(0,30-(old->>'total')::bigint),
      'gift_balance',a.gift_balance,'server_now',t);
  end if;
  return jsonb_build_object('mode','weekly','total',w.total,'hits',w.hits,'misses',w.misses,
    'used',w.used,'base_used',w.base_used,'gifted',a.gift_balance,'gift_balance',a.gift_balance,
    'remaining',20-w.base_used+a.gift_balance,'week_start',ws,'next_reset',ws+interval '7 days','server_now',t);
end $$;

create or replace function public.nearby_scan_attempt(p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a public.nearby_scan_accounts; w public.nearby_scan_weekly; cfg public.nearby_scan_settings;
  t timestamptz; ws timestamptz; is_hit boolean; mode_value text; old jsonb; spend integer:=0;
begin
  perform public.nearby_scan_lock_user(p_user);
  t:=clock_timestamp(); ws:=public.nearby_scan_week_start(t);
  insert into public.nearby_scan_accounts(user_id) values(p_user) on conflict do nothing;
  insert into public.nearby_scan_weekly(user_id,week_start) values(p_user,ws) on conflict do nothing;
  select * into strict a from public.nearby_scan_accounts where user_id=p_user for update;
  select * into strict w from public.nearby_scan_weekly where user_id=p_user and week_start=ws for update;
  select * into strict cfg from public.nearby_scan_settings where id=1;
  select mode into mode_value from public.nearby_scan_deployment where id=1;
  if mode_value='daily' then
    -- Phiên bản ngày đã được chụp từ DB thật; lỗi cũng rollback toàn bộ.
    old:=public.nearby_scan_legacy_attempt(p_user);
    is_hit:=(old->>'hit')::boolean;
    if is_hit is null then raise exception 'Hàm ngày cũ không trả hit hợp lệ.'; end if;
  else
    if 20-w.base_used+a.gift_balance<=0 then raise exception 'Bạn đã dùng hết lượt quét tuần này.'; end if;
    if a.last_attempt_at is not null and a.last_attempt_at+cfg.delay_seconds*interval '1 second'>t then
      raise exception 'Lượt quét trước chưa hoàn tất.';
    end if;
    is_hit:=random()*100<cfg.hit_percent;
    if w.base_used>=20 then spend:=1; end if;
  end if;
  update public.nearby_scan_accounts set
    gift_balance=gift_balance-spend,gifts_spent=gifts_spent+spend,
    new_total=new_total+1,new_hits=new_hits+case when is_hit then 1 else 0 end,
    new_misses=new_misses+case when is_hit then 0 else 1 end,last_attempt_at=t
    where user_id=p_user returning * into a;
  update public.nearby_scan_weekly set
    used=used+case when mode_value='weekly' then 1 else 0 end,
    base_used=base_used+case when mode_value='weekly' and base_used<20 then 1 else 0 end,
    total=total+1,hits=hits+case when is_hit then 1 else 0 end,
    misses=misses+case when is_hit then 0 else 1 end,updated_at=t
    where user_id=p_user and week_start=ws returning * into w;
  if mode_value='daily' then
    return old || jsonb_build_object('mode','daily','remaining',greatest(0,30-(old->>'total')::bigint),
      'gift_balance',a.gift_balance,'scanned_at',t,'server_now',t);
  end if;
  return jsonb_build_object('mode','weekly','hit',is_hit,'total',w.total,'hits',w.hits,'misses',w.misses,
    'used',w.used,'base_used',w.base_used,'gift_balance',a.gift_balance,'gifted',a.gift_balance,
    'remaining',20-w.base_used+a.gift_balance,'delay_seconds',cfg.delay_seconds,
    'week_start',ws,'next_reset',ws+interval '7 days','scanned_at',t,'server_now',t);
end $$;

create or replace function public.nearby_scan_attempt_candidate(p_user uuid,p_candidate uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare res jsonb; t timestamptz;
begin
  perform public.nearby_scan_lock_user(p_user);
  if p_candidate is null then raise exception 'Thiếu tài khoản ứng viên.'; end if;
  insert into public.nearby_scan_seen(user_id,candidate_id) values(p_user,p_candidate) on conflict do nothing;
  if not found then return jsonb_build_object('seen',true); end if;
  res:=public.nearby_scan_attempt(p_user); t:=(res->>'scanned_at')::timestamptz;
  update public.nearby_scan_seen set hit=(res->>'hit')::boolean,scanned_at=t
    where user_id=p_user and candidate_id=p_candidate;
  insert into public.nearby_scan_history values(p_user,p_candidate,t,(res->>'hit')::boolean);
  if (res->>'hit')::boolean then
    insert into public.nearby_scan_saved_results values(p_user,p_candidate,t) on conflict do nothing;
  end if;
  return res || jsonb_build_object('seen',false);
end $$;

-- Keyset: 100/trang, không giới hạn TỔNG. Cursor=(scanned_at,candidate_id).
-- Chụp p_until ở trang đầu; dùng lại ở mọi trang để kết quả mới không làm lệch trang.
create or replace function public.nearby_scan_results_page(p_user uuid,
  p_after_time timestamptz default null,p_after_id uuid default null,
  p_limit integer default 100,p_until timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; cutoff timestamptz:=coalesce(p_until,statement_timestamp());
begin
  if p_user is null or p_limit<1 or p_limit>200 or p_limit is null
    or (p_after_time is null)<>(p_after_id is null) then raise exception 'Phân trang không hợp lệ.'; end if;
  with batch as (
    select candidate_id,scanned_at from public.nearby_scan_saved_results
    where user_id=p_user and scanned_at<=cutoff
      and (p_after_time is null or (scanned_at,candidate_id)>(p_after_time,p_after_id))
    order by scanned_at,candidate_id limit p_limit+1
  ), page as (select * from batch order by scanned_at,candidate_id limit p_limit),
  last_row as (select * from page order by scanned_at desc,candidate_id desc limit 1)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(page order by scanned_at,candidate_id) from page),'[]'::jsonb),
    'has_more',(select count(*)>p_limit from batch),'until',cutoff,
    'next_cursor',(select jsonb_build_object('scanned_at',scanned_at,'candidate_id',candidate_id) from last_row)) into result;
  return result;
end $$;

create or replace function public.nearby_scan_overview(p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public as $$
  with context as(select public.nearby_scan_week_start(statement_timestamp()) ws,mode from public.nearby_scan_deployment where id=1),
  grouped as (
    select a.user_id,a.legacy_total+a.new_total total,a.legacy_hits+a.new_hits hits,a.legacy_misses+a.new_misses misses,
      coalesce(w.used,0) week_used,coalesce(w.total,0) week_total,coalesce(w.hits,0) week_hits,coalesce(w.misses,0) week_misses,
      a.gift_balance week_gifted,a.gift_balance gift_balance,a.gifts_granted,a.gifts_spent,
      case when c.mode='weekly' then 20-coalesce(w.base_used,0)+a.gift_balance
        else greatest(0,30-coalesce(d.total,0)) end week_remaining
    from public.nearby_scan_accounts a cross join context c
    left join public.nearby_scan_weekly w on w.user_id=a.user_id and w.week_start=c.ws
    left join public.nearby_scan_daily d on d.user_id=a.user_id and d.scan_date=(statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
  ), page as(select * from grouped order by user_id limit 20 offset greatest(p_offset,0))
  select jsonb_build_object('participants',(select count(*) from grouped),'mode',(select mode from context),
    'week_start',(select ws from context),'next_reset',(select ws+interval '7 days' from context),'server_now',statement_timestamp(),
    'rows',coalesce((select jsonb_agg(page order by user_id) from page),'[]'::jsonb));
$$;

create or replace function public.nearby_scan_admin_action(p_request uuid,p_admin uuid,p_action text,
  p_user uuid default null,p_amount integer default 0)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare prior public.nearby_scan_quota_actions; u uuid; ws timestamptz; t timestamptz; r jsonb; n bigint; mode_value text;
begin
  if p_request is null or p_admin is null or p_action is null or p_amount is null
     or p_action not in ('gift','reset_one','reset_all','clear_history_one','clear_history_all')
     or (p_action in ('reset_all','clear_history_all'))<>(p_user is null)
     or (p_action='gift' and (p_amount<1 or p_amount>1000))
     or (p_action<>'gift' and p_amount<>0) then raise exception 'Thao tác Admin không hợp lệ.'; end if;
  if p_action in ('reset_all','clear_history_all') then
    perform pg_advisory_xact_lock(7240211202601);
  else perform pg_advisory_xact_lock_shared(7240211202601); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,72));
  select * into prior from public.nearby_scan_quota_actions where request_id=p_request;
  if found then
    if prior.admin_id<>p_admin or prior.user_id is distinct from p_user
      or prior.action<>p_action or prior.amount<>p_amount then raise exception 'Mã yêu cầu đã dùng cho thao tác khác.'; end if;
    return prior.result || jsonb_build_object('duplicate',true);
  end if;
  select mode into mode_value from public.nearby_scan_deployment where id=1;
  if mode_value<>'weekly' then raise exception 'Quản lý tuần đã tạm dừng sau hoàn tác.'; end if;
  if p_user is not null then perform public.nearby_scan_lock_user(p_user); end if;
  t:=clock_timestamp(); ws:=public.nearby_scan_week_start(t);
  if p_action='gift' then
    insert into public.nearby_scan_accounts(user_id,gift_balance,gifts_granted) values(p_user,p_amount,p_amount)
      on conflict(user_id) do update set gift_balance=nearby_scan_accounts.gift_balance+p_amount,
        gifts_granted=nearby_scan_accounts.gifts_granted+p_amount;
    r:=public.nearby_scan_open(p_user);
  elsif p_action='reset_one' then
    insert into public.nearby_scan_accounts(user_id) values(p_user) on conflict do nothing;
    insert into public.nearby_scan_weekly(user_id,week_start) values(p_user,ws) on conflict do nothing;
    update public.nearby_scan_weekly set used=0,base_used=0,updated_at=t where user_id=p_user and week_start=ws;
    r:=public.nearby_scan_open(p_user);
  elsif p_action='reset_all' then
    n:=0;
    for u in select user_id from public.nearby_scan_accounts order by user_id loop
      insert into public.nearby_scan_weekly(user_id,week_start) values(u,ws) on conflict do nothing;
      update public.nearby_scan_weekly set used=0,base_used=0,updated_at=t where user_id=u and week_start=ws;
      n:=n+1;
    end loop;
    r:=jsonb_build_object('affected',n);
  elsif p_action='clear_history_one' then
    delete from public.nearby_scan_history where user_id=p_user;
    get diagnostics n=row_count; r:=jsonb_build_object('deleted_history_rows',n);
  else
    delete from public.nearby_scan_history;
    get diagnostics n=row_count; r:=jsonb_build_object('deleted_history_rows',n);
  end if;
  r:=r || jsonb_build_object('duplicate',false);
  insert into public.nearby_scan_quota_actions(request_id,admin_id,user_id,week_start,action,amount,created_at,result)
    values(p_request,p_admin,p_user,ws,p_action,p_amount,t,r);
  return r;
end $$;

-- Admin/danh tính luôn được xác minh bằng #1 trên server; SQL không tin auth.uid() #2.
-- Mọi helper/alias đều khóa quyền gọi từ browser, không riêng các RPC chính.
do $$ declare sig text; begin
  foreach sig in array array['nearby_scan_legacy_open(uuid)','nearby_scan_legacy_attempt(uuid)',
    'nearby_scan_lock_user(uuid)','nearby_scan_week_start(timestamptz)','nearby_scan_open(uuid)',
    'nearby_scan_attempt(uuid)','nearby_scan_attempt_candidate(uuid,uuid)','nearby_scan_overview(integer)',
    'nearby_scan_results_page(uuid,timestamptz,uuid,integer,timestamptz)',
    'nearby_scan_admin_action(uuid,uuid,text,uuid,integer)'] loop
    execute format('revoke all on function public.%s from public,anon,authenticated',sig);
    execute format('grant execute on function public.%s to service_role',sig);
  end loop;
end $$;
commit;
