-- CHỜ DUYỆT v3 — KHÔNG CHẠY TRÊN DB THẬT KHI CHƯA ĐƯỢC ĐỒNG Ý.
-- Thay thế bản v2 (PENDING_APPROVAL_2026-11-01_SB2_weekly_scan_quota.sql, chưa từng chạy; giữ để đối chiếu).
-- Chỉ dự án Supabase #2: pymwwuscoftmdcmmeckp. Dừng quét/Admin, sao lưu trước khi chạy.
-- Không ALTER/RLS/UPDATE/DELETE/DROP bảng cũ (nearby_scan_settings/daily/seen); chỉ thêm bảng/hàm mới.
--
-- THAY ĐỔI so với v2:
--  1. Bảng mới nearby_scan_mode_day: đếm riêng theo ngày VN các lượt quét làm ở chế độ TUẦN.
--     Ở chế độ ngày: hôm nay = nearby_scan_daily.total (cũ, không sửa) + mode_day.weekly_total.
--     Tổng này < 30 mới cho quét => hoàn tác giữa tuần không cấp thêm lượt vượt 30/ngày.
--  2. Lượt quét ở chế độ ngày cũng trừ vào hạn mức cơ bản tuần (base_used), nên chuyển qua lại
--     nhiều lần không làm "hồi" lại lượt đã dùng. Lượt tặng KHÔNG bị dùng ở chế độ ngày.
--  3. Cài đặt không còn dừng khi lịch sử cũ thiếu/không khớp (vd 10 lượt thiếu lịch sử ngày 31/10,
--     5 dòng hit NULL). Không tạo lịch sử giả, không đổi NULL. Sai lệch được ghi vào bảng đối soát
--     nearby_scan_reconciliation (chỉ để đọc). Hạn mức tuần hiện tại khởi tạo THẬN TRỌNG:
--     max(số dòng seen trong tuần, tổng daily.total từ ngày bắt đầu tuần), tối đa 20.
--  4. Chế độ ngày áp dụng cả thời gian chờ theo lượt quét cuối (kể cả lượt làm ở chế độ tuần).
--  5. Nhật ký chuyển chế độ nearby_scan_mode_log; file hoàn tác/kích hoạt lại idempotent.
-- Hoàn tác: ROLLBACK_PENDING_2026-11-01_SB2_weekly_scan_quota_v3.sql
-- Bật lại tuần: REACTIVATE_PENDING_2026-11-01_SB2_weekly_scan_quota_v3.sql
begin;
select pg_advisory_xact_lock(7240211202601);

do $$ begin
  if to_regclass('public.nearby_scan_weekly') is not null
     or to_regclass('public.nearby_scan_accounts') is not null
     or to_regclass('public.nearby_scan_deployment') is not null
     or to_regclass('public.nearby_scan_mode_day') is not null then
    raise exception 'Đã có cấu trúc tuần (v1/v2/v3): phải đối chiếu trước, không áp dụng chồng.';
  end if;
  if to_regprocedure('public.nearby_scan_open(uuid)') is null
     or to_regprocedure('public.nearby_scan_attempt(uuid)') is null
     or to_regprocedure('public.nearby_scan_attempt_candidate(uuid,uuid)') is null
     or to_regprocedure('public.nearby_scan_overview(integer)') is null then
    raise exception 'Thiếu hàm quét cũ; chưa đủ điều kiện triển khai.';
  end if;
  if exists(select 1 from public.nearby_scan_seen where scanned_at>clock_timestamp()) then
    raise exception 'Có lịch sử quét ở thời điểm tương lai: dừng để đối soát, không suy đoán.';
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

create table public.nearby_scan_mode_log (
  seq bigint generated always as identity primary key,
  mode text not null check (mode in ('weekly','daily')),
  changed_at timestamptz not null default clock_timestamp(),
  note text not null
);
grant all on public.nearby_scan_mode_log to service_role;
revoke all on public.nearby_scan_mode_log from public, anon, authenticated;
alter table public.nearby_scan_mode_log enable row level security;
insert into public.nearby_scan_mode_log(mode,note) values('weekly','install v3');

-- Bảo toàn phiên bản hàm ngày THỰC TẾ đang chạy (không giả định giống file SQL cũ).
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
  used bigint not null default 0 check (used>=0),          -- lượt kể từ reset gần nhất (mọi chế độ)
  base_used bigint not null default 0 check (base_used between 0 and 20),
  total bigint not null default 0,                         -- thống kê lượt có kết quả trong tuần
  hits bigint not null default 0,
  misses bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,week_start),
  check (total=hits+misses and hits>=0 and misses>=0)
);
grant all on public.nearby_scan_weekly to service_role;
revoke all on public.nearby_scan_weekly from public, anon, authenticated;
alter table public.nearby_scan_weekly enable row level security;

-- MỚI v3: bộ đếm theo ngày VN cho lượt làm ở chế độ tuần. Không bao giờ ghi vào nearby_scan_daily.
create table public.nearby_scan_mode_day (
  user_id uuid not null,
  scan_date date not null,
  weekly_total integer not null default 0,
  weekly_hits integer not null default 0,
  weekly_misses integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,scan_date),
  check (weekly_total=weekly_hits+weekly_misses and weekly_hits>=0 and weekly_misses>=0)
);
grant all on public.nearby_scan_mode_day to service_role;
revoke all on public.nearby_scan_mode_day from public, anon, authenticated;
alter table public.nearby_scan_mode_day enable row level security;

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

-- Chỉ bảng này được Xóa lịch sử. seen vẫn là danh sách đã quét VĨNH VIỄN. hit NULL giữ nguyên NULL.
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

-- MỚI v3: đối soát chỉ đọc (không sửa dữ liệu cũ, không tạo lịch sử giả).
create table public.nearby_scan_reconciliation (
  user_id uuid not null,
  scan_date date not null,
  daily_total integer not null,
  seen_rows integer not null,
  seen_hits integer not null,
  seen_misses integer not null,
  seen_null integer not null,
  missing_history integer not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(user_id,scan_date)
);
grant all on public.nearby_scan_reconciliation to service_role;
revoke all on public.nearby_scan_reconciliation from public, anon, authenticated;
alter table public.nearby_scan_reconciliation enable row level security;

create or replace function public.nearby_scan_week_start(p_at timestamptz default now())
returns timestamptz language sql immutable set search_path=public as $$
  select ((date_trunc('day',(p_at at time zone 'Asia/Ho_Chi_Minh')-interval '12 hours')
    -make_interval(days=>extract(dow from (p_at at time zone 'Asia/Ho_Chi_Minh')-interval '12 hours')::int)
    +interval '12 hours') at time zone 'Asia/Ho_Chi_Minh');
$$;

-- Ngày VN dùng CHUNG với hàm ngày cũ (now() = thời điểm bắt đầu giao dịch).
create or replace function public.nearby_scan_vn_date()
returns date language sql stable set search_path=public as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

insert into public.nearby_scan_reconciliation(user_id,scan_date,daily_total,seen_rows,seen_hits,seen_misses,seen_null,missing_history)
with d as (select user_id,scan_date,total from public.nearby_scan_daily),
s as (
  select user_id,(scanned_at at time zone 'Asia/Ho_Chi_Minh')::date scan_date,count(*)::int n,
    count(*) filter(where hit=true)::int h,count(*) filter(where hit=false)::int m,count(*) filter(where hit is null)::int z
  from public.nearby_scan_seen group by 1,2
)
select user_id,scan_date,coalesce(d.total,0),coalesce(s.n,0),coalesce(s.h,0),coalesce(s.m,0),coalesce(s.z,0),
  greatest(0,coalesce(d.total,0)-coalesce(s.n,0))
from d full join s using(user_id,scan_date)
where coalesce(d.total,0)<>coalesce(s.n,0) or coalesce(s.z,0)>0;

insert into public.nearby_scan_accounts(user_id,legacy_total,legacy_hits,legacy_misses,last_attempt_at)
select user_id,sum(total),sum(hits),sum(misses),max(updated_at) filter(where total>0)
from public.nearby_scan_daily group by user_id;
insert into public.nearby_scan_accounts(user_id)
select distinct user_id from public.nearby_scan_seen on conflict do nothing;

-- Tuần hiện tại: hạn mức khởi tạo thận trọng; không dựa vào lịch sử có thể thiếu.
insert into public.nearby_scan_weekly(user_id,week_start,used,base_used,total,hits,misses)
with c as (select public.nearby_scan_week_start(cutover_at) ws,cutover_at from public.nearby_scan_deployment where id=1),
s as (
  select s.user_id,count(*) n,count(*) filter(where s.hit=true) h,count(*) filter(where s.hit=false) m
  from public.nearby_scan_seen s,c where s.scanned_at>=c.ws and s.scanned_at<=c.cutover_at group by s.user_id
), d as (
  select d.user_id,sum(d.total) n from public.nearby_scan_daily d,c
  where d.scan_date>=(c.ws at time zone 'Asia/Ho_Chi_Minh')::date group by d.user_id
), u as (select user_id from s union select user_id from d)
select u.user_id,c.ws,greatest(coalesce(s.n,0),coalesce(d.n,0)),least(20,greatest(coalesce(s.n,0),coalesce(d.n,0))),
  coalesce(s.h,0)+coalesce(s.m,0),coalesce(s.h,0),coalesce(s.m,0)
from u cross join c left join s using(user_id) left join d using(user_id)
where greatest(coalesce(s.n,0),coalesce(d.n,0))>0;

insert into public.nearby_scan_saved_results select user_id,candidate_id,scanned_at
from public.nearby_scan_seen where hit=true;
insert into public.nearby_scan_history select user_id,candidate_id,scanned_at,hit from public.nearby_scan_seen;

-- Thứ tự khóa duy nhất: global chia sẻ → user. Đổi chế độ/Admin toàn cục: global độc quyền.
create or replace function public.nearby_scan_lock_user(p_user uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if p_user is null then raise exception 'Thiếu tài khoản.'; end if;
  perform pg_advisory_xact_lock_shared(7240211202601);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,71));
end $$;

-- Lượt đã dùng hôm nay ở MỌI chế độ = daily cũ (chỉ đọc) + đếm chế độ tuần.
create or replace function public.nearby_scan_today(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'total',coalesce((select total from public.nearby_scan_daily where user_id=p_user and scan_date=public.nearby_scan_vn_date()),0)
      +coalesce((select weekly_total from public.nearby_scan_mode_day where user_id=p_user and scan_date=public.nearby_scan_vn_date()),0),
    'hits',coalesce((select hits from public.nearby_scan_daily where user_id=p_user and scan_date=public.nearby_scan_vn_date()),0)
      +coalesce((select weekly_hits from public.nearby_scan_mode_day where user_id=p_user and scan_date=public.nearby_scan_vn_date()),0),
    'misses',coalesce((select misses from public.nearby_scan_daily where user_id=p_user and scan_date=public.nearby_scan_vn_date()),0)
      +coalesce((select weekly_misses from public.nearby_scan_mode_day where user_id=p_user and scan_date=public.nearby_scan_vn_date()),0));
$$;

create or replace function public.nearby_scan_open(p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a public.nearby_scan_accounts; w public.nearby_scan_weekly; t timestamptz; ws timestamptz; mode_value text; d jsonb;
begin
  perform public.nearby_scan_lock_user(p_user);
  t:=clock_timestamp(); ws:=public.nearby_scan_week_start(t);
  insert into public.nearby_scan_accounts(user_id) values(p_user) on conflict do nothing;
  insert into public.nearby_scan_weekly(user_id,week_start) values(p_user,ws) on conflict do nothing;
  select * into strict a from public.nearby_scan_accounts where user_id=p_user;
  select * into strict w from public.nearby_scan_weekly where user_id=p_user and week_start=ws;
  select mode into strict mode_value from public.nearby_scan_deployment where id=1;
  if mode_value='daily' then
    d:=public.nearby_scan_today(p_user);
    return d || jsonb_build_object('mode','daily','remaining',greatest(0,30-(d->>'total')::bigint),
      'gift_balance',a.gift_balance,'server_now',t);
  end if;
  return jsonb_build_object('mode','weekly','total',w.total,'hits',w.hits,'misses',w.misses,
    'used',w.used,'base_used',w.base_used,'gifted',a.gift_balance,'gift_balance',a.gift_balance,
    'remaining',20-w.base_used+a.gift_balance,'week_start',ws,'next_reset',ws+interval '7 days','server_now',t);
end $$;

create or replace function public.nearby_scan_attempt(p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a public.nearby_scan_accounts; w public.nearby_scan_weekly; cfg public.nearby_scan_settings;
  t timestamptz; ws timestamptz; is_hit boolean; mode_value text; old jsonb; spend integer:=0; d jsonb; today date;
begin
  perform public.nearby_scan_lock_user(p_user);
  t:=clock_timestamp(); ws:=public.nearby_scan_week_start(t); today:=public.nearby_scan_vn_date();
  insert into public.nearby_scan_accounts(user_id) values(p_user) on conflict do nothing;
  insert into public.nearby_scan_weekly(user_id,week_start) values(p_user,ws) on conflict do nothing;
  select * into strict a from public.nearby_scan_accounts where user_id=p_user for update;
  select * into strict w from public.nearby_scan_weekly where user_id=p_user and week_start=ws for update;
  select * into strict cfg from public.nearby_scan_settings where id=1;
  select mode into strict mode_value from public.nearby_scan_deployment where id=1;
  if a.last_attempt_at is not null and a.last_attempt_at+cfg.delay_seconds*interval '1 second'>t then
    raise exception 'Lượt quét trước chưa hoàn tất.';
  end if;
  if mode_value='daily' then
    if (public.nearby_scan_today(p_user)->>'total')::bigint>=30 then
      raise exception 'Bạn đã dùng hết lượt quét hôm nay.';
    end if;
    -- Hàm ngày đã chụp từ DB thật; vẫn tự kiểm tra 30 trên bộ đếm cũ. Lỗi => rollback toàn bộ.
    old:=public.nearby_scan_legacy_attempt(p_user);
    is_hit:=(old->>'hit')::boolean;
    if is_hit is null then raise exception 'Hàm ngày cũ không trả hit hợp lệ.'; end if;
  else
    if 20-w.base_used+a.gift_balance<=0 then raise exception 'Bạn đã dùng hết lượt quét tuần này.'; end if;
    is_hit:=random()*100<cfg.hit_percent;
    if w.base_used>=20 then spend:=1; end if;
    insert into public.nearby_scan_mode_day(user_id,scan_date,weekly_total,weekly_hits,weekly_misses,updated_at)
      values(p_user,today,1,case when is_hit then 1 else 0 end,case when is_hit then 0 else 1 end,t)
      on conflict(user_id,scan_date) do update set weekly_total=nearby_scan_mode_day.weekly_total+1,
        weekly_hits=nearby_scan_mode_day.weekly_hits+excluded.weekly_hits,
        weekly_misses=nearby_scan_mode_day.weekly_misses+excluded.weekly_misses,updated_at=t;
  end if;
  update public.nearby_scan_accounts set
    gift_balance=gift_balance-spend,gifts_spent=gifts_spent+spend,
    new_total=new_total+1,new_hits=new_hits+case when is_hit then 1 else 0 end,
    new_misses=new_misses+case when is_hit then 0 else 1 end,last_attempt_at=t
    where user_id=p_user returning * into a;
  -- Cả hai chế độ đều trừ hạn mức cơ bản tuần: chuyển qua lại không hồi lượt.
  update public.nearby_scan_weekly set
    used=used+1,base_used=base_used+case when base_used<20 then 1 else 0 end,
    total=total+1,hits=hits+case when is_hit then 1 else 0 end,
    misses=misses+case when is_hit then 0 else 1 end,updated_at=t
    where user_id=p_user and week_start=ws returning * into w;
  if mode_value='daily' then
    d:=public.nearby_scan_today(p_user);
    return d || jsonb_build_object('hit',is_hit,'mode','daily','remaining',greatest(0,30-(d->>'total')::bigint),
      'gift_balance',a.gift_balance,'delay_seconds',cfg.delay_seconds,'scanned_at',t,'server_now',t);
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
      (public.nearby_scan_today(a.user_id)->>'total')::bigint today_total,
      case when c.mode='weekly' then 20-coalesce(w.base_used,0)+a.gift_balance
        else greatest(0,30-(public.nearby_scan_today(a.user_id)->>'total')::bigint) end week_remaining
    from public.nearby_scan_accounts a cross join context c
    left join public.nearby_scan_weekly w on w.user_id=a.user_id and w.week_start=c.ws
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
  select mode into strict mode_value from public.nearby_scan_deployment where id=1;
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

-- Admin/danh tính xác minh bằng #1 trên server; mọi helper khóa quyền gọi từ browser.
do $$ declare sig text; begin
  foreach sig in array array['nearby_scan_legacy_open(uuid)','nearby_scan_legacy_attempt(uuid)',
    'nearby_scan_lock_user(uuid)','nearby_scan_week_start(timestamptz)','nearby_scan_vn_date()',
    'nearby_scan_today(uuid)','nearby_scan_open(uuid)',
    'nearby_scan_attempt(uuid)','nearby_scan_attempt_candidate(uuid,uuid)','nearby_scan_overview(integer)',
    'nearby_scan_results_page(uuid,timestamptz,uuid,integer,timestamptz)',
    'nearby_scan_admin_action(uuid,uuid,text,uuid,integer)'] loop
    execute format('revoke all on function public.%s from public,anon,authenticated',sig);
    execute format('grant execute on function public.%s to service_role',sig);
  end loop;
end $$;
commit;
