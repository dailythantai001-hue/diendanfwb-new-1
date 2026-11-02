-- FINAL v5 — QUÀ 20 LƯỢT QUÉT TÌM BẠN (MỘT LẦN DUY NHẤT). CHỜ DUYỆT, KHÔNG CHẠY KHI CHƯA ĐƯỢC ĐỒNG Ý.
-- Chỉ Supabase #2. Đây là FILE DUY NHẤT cần chạy. Thay thế v4 (v4 + tuần v2/v3 giữ lại để đối chiếu, KHÔNG chạy).
-- Dừng quét và sao lưu (backup/PITR) trước khi chạy.
--
-- Quy tắc:
--  * Mỗi tài khoản (kể cả tài khoản đã tồn tại) nhận gói 20 lượt MỘT LẦN qua nearby_scan_claim_gift.
--    Dòng quà = khóa chính user_id => không thể nhận lại (reload, đăng nhập lại, thiết bị khác, gọi đồng thời).
--  * Lượt cũ (nearby_scan_daily / nearby_scan_seen trước v5) KHÔNG trừ vào gói 20. Lịch sử cũ giữ nguyên:
--    ứng viên đã quét trước đây vẫn không hiện lại và không tốn lượt.
--  * Mỗi lượt quét thành công trừ 1. Hết 20 => khóa vĩnh viễn. Không reset ngày/tuần/tháng,
--    không có hàm Admin tặng/cộng/reset/khôi phục.
--  * CHECK bảng (used<=20) + trigger chỉ-tăng + khóa theo user => đồng thời cũng không âm/vượt 20.
--  * Không ALTER/UPDATE/DELETE/DROP bảng cũ, không đổi RLS bảng cũ. nearby_scan_daily ngừng được ghi.
-- Tạm dừng khẩn cấp: ROLLBACK_PENDING_2026-11-01_SB2_scan_gift_20_v5.sql (không cấp thêm lượt).
begin;
select pg_advisory_xact_lock(7240211202601);

do $$ begin
  if to_regclass('public.nearby_scan_gift') is not null
     or to_regclass('public.nearby_scan_v5_deployment') is not null then
    raise exception 'Đã có cấu trúc v5: không áp dụng chồng.';
  end if;
  if to_regclass('public.nearby_scan_lifetime') is not null
     or to_regclass('public.nearby_scan_v4_deployment') is not null then
    raise exception 'Phát hiện cấu trúc v4 (tính lượt cũ): dừng để đối chiếu, không áp dụng chồng.';
  end if;
  if to_regclass('public.nearby_scan_deployment') is not null
     or to_regclass('public.nearby_scan_weekly') is not null
     or to_regclass('public.nearby_scan_accounts') is not null
     or to_regprocedure('public.nearby_scan_admin_action(uuid,uuid,text,uuid,integer)') is not null then
    raise exception 'Phát hiện cấu trúc tuần v2/v3 (có lượt tặng/reset): dừng để đối chiếu, không áp dụng chồng.';
  end if;
  if to_regclass('public.nearby_scan_daily') is null or to_regclass('public.nearby_scan_seen') is null
     or to_regclass('public.nearby_scan_settings') is null then
    raise exception 'Thiếu bảng quét cũ; chưa đủ điều kiện triển khai.';
  end if;
  if not exists(select 1 from information_schema.columns
     where table_schema='public' and table_name='nearby_scan_seen' and column_name='hit') then
    raise exception 'nearby_scan_seen chưa có cột hit (RUN_NOW_2026-10-31_SB2_nearby_scan_results.sql).';
  end if;
  if exists(select 1 from public.nearby_scan_seen where scanned_at>clock_timestamp()) then
    raise exception 'Có lịch sử quét ở thời điểm tương lai: dừng để đối soát.';
  end if;
end $$;

-- Lưu nguyên văn định nghĩa hàm cũ (chỉ để đối chiếu).
create table public.nearby_scan_v5_deployment (
  id smallint primary key check (id=1),
  active boolean not null,
  cutover_at timestamptz not null,
  original_functions jsonb not null
);
grant all on public.nearby_scan_v5_deployment to service_role;
revoke all on public.nearby_scan_v5_deployment from public, anon, authenticated;
alter table public.nearby_scan_v5_deployment enable row level security;
insert into public.nearby_scan_v5_deployment
select 1,true,clock_timestamp(),coalesce(jsonb_object_agg(sig,pg_get_functiondef(to_regprocedure(sig)))
  filter(where to_regprocedure(sig) is not null),'{}'::jsonb)
from unnest(array['public.nearby_scan_open(uuid)','public.nearby_scan_attempt(uuid)',
  'public.nearby_scan_attempt_candidate(uuid,uuid)','public.nearby_scan_overview(integer)']) sig;

-- Một dòng / tài khoản = đã nhận quà. Không có dòng = chưa nhận.
create table public.nearby_scan_gift (
  user_id uuid primary key,
  granted_at timestamptz not null default clock_timestamp(),
  gift_limit integer not null default 20 check (gift_limit=20),
  used integer not null default 0 check (used>=0 and used<=20),
  hits integer not null default 0 check (hits>=0),
  misses integer not null default 0 check (misses>=0),
  last_attempt_at timestamptz,
  check (used=hits+misses)
);
grant all on public.nearby_scan_gift to service_role;
revoke all on public.nearby_scan_gift from public, anon, authenticated;
alter table public.nearby_scan_gift enable row level security;

-- Bất biến: không xóa, không đổi người nhận/thời điểm nhận/gói, used chỉ tăng đúng 1 mỗi lần.
create or replace function public.nearby_scan_gift_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'Không được xóa gói lượt quét.'; end if;
  if new.user_id<>old.user_id or new.granted_at<>old.granted_at or new.gift_limit<>old.gift_limit
     or new.used not in (old.used, old.used+1) or new.hits<old.hits or new.misses<old.misses then
    raise exception 'Gói lượt quét chỉ được trừ dần.';
  end if;
  return new;
end $$;
create trigger nearby_scan_gift_guard before update or delete on public.nearby_scan_gift
  for each row execute function public.nearby_scan_gift_guard();
-- Không cho chèn dòng quà "đã dùng 0 nhưng sửa số" bất thường.
create or replace function public.nearby_scan_gift_insert_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.used<>0 or new.hits<>0 or new.misses<>0 or new.last_attempt_at is not null then
    raise exception 'Gói quà mới phải bắt đầu từ 0 lượt đã dùng.';
  end if;
  return new;
end $$;
create trigger nearby_scan_gift_insert_guard before insert on public.nearby_scan_gift
  for each row execute function public.nearby_scan_gift_insert_guard();

create or replace function public.nearby_scan_gift_json(p_user uuid)
returns jsonb language sql stable set search_path=public as $$
  select case when g.user_id is null then
      jsonb_build_object('mode','lifetime','limit',20,'claimed',false,'used',0,'remaining',0,
        'locked',true,'total',0,'hits',0,'misses',0)
    else jsonb_build_object('mode','lifetime','limit',20,'claimed',true,'granted_at',g.granted_at,
        'used',g.used,'remaining',20-g.used,'locked',g.used>=20,
        'total',g.hits+g.misses,'hits',g.hits,'misses',g.misses) end
  from (select p_user) x left join public.nearby_scan_gift g on g.user_id=p_user;
$$;

-- CHỈ ĐỌC.
create or replace function public.nearby_scan_quota(p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
begin
  if p_user is null then raise exception 'Thiếu tài khoản.'; end if;
  return public.nearby_scan_gift_json(p_user) || jsonb_build_object('active',
    (select active from public.nearby_scan_v5_deployment where id=1),'server_now',statement_timestamp());
end $$;

-- Nhận quà: đúng một lần. granted_now=true chỉ trả về cho đúng 1 yêu cầu duy nhất trong đời tài khoản.
create or replace function public.nearby_scan_claim_gift(p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare on_ boolean; n integer;
begin
  if p_user is null then raise exception 'Thiếu tài khoản.'; end if;
  perform pg_advisory_xact_lock_shared(7240211202601);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,71));
  select active into strict on_ from public.nearby_scan_v5_deployment where id=1;
  if not on_ then raise exception 'Chức năng quét đang tạm dừng.'; end if;
  insert into public.nearby_scan_gift(user_id) values(p_user) on conflict(user_id) do nothing;
  get diagnostics n = row_count;
  return public.nearby_scan_gift_json(p_user) || jsonb_build_object('granted_now',n=1,'server_now',clock_timestamp());
end $$;

create or replace function public.nearby_scan_open(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
  select public.nearby_scan_quota(p_user);
$$;

create or replace function public.nearby_scan_attempt(p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
  raise exception 'Hàm quét cũ đã ngừng; chỉ dùng nearby_scan_attempt_candidate.';
end $$;

-- Đường DUY NHẤT trừ lượt. Khóa theo user + FOR UPDATE + CHECK bảng. Lỗi giữa chừng rollback toàn bộ.
create or replace function public.nearby_scan_attempt_candidate(p_user uuid,p_candidate uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare g public.nearby_scan_gift; cfg public.nearby_scan_settings; t timestamptz; is_hit boolean; on_ boolean;
begin
  if p_user is null or p_candidate is null then raise exception 'Thiếu tài khoản.'; end if;
  perform pg_advisory_xact_lock_shared(7240211202601);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,71));
  select active into strict on_ from public.nearby_scan_v5_deployment where id=1;
  if not on_ then raise exception 'Chức năng quét đang tạm dừng.'; end if;
  select * into g from public.nearby_scan_gift where user_id=p_user for update;
  if not found then raise exception 'Bạn chưa nhận lượt quét tặng.'; end if;
  -- Đã quét ứng viên này (kể cả trước v5) => không tính lượt.
  if exists(select 1 from public.nearby_scan_seen where user_id=p_user and candidate_id=p_candidate) then
    return jsonb_build_object('seen',true);
  end if;
  if g.used>=20 then raise exception 'Bạn đã sử dụng hết 20 lượt quét tìm bạn.'; end if;
  select * into strict cfg from public.nearby_scan_settings where id=1;
  t:=clock_timestamp();
  if g.last_attempt_at is not null and g.last_attempt_at+cfg.delay_seconds*interval '1 second'>t then
    raise exception 'Lượt quét trước chưa hoàn tất.';
  end if;
  is_hit:=random()*100<cfg.hit_percent;
  insert into public.nearby_scan_seen(user_id,candidate_id,scanned_at,hit) values(p_user,p_candidate,t,is_hit);
  update public.nearby_scan_gift set used=used+1,
    hits=hits+case when is_hit then 1 else 0 end,
    misses=misses+case when is_hit then 0 else 1 end,last_attempt_at=t
    where user_id=p_user;
  return public.nearby_scan_gift_json(p_user) || jsonb_build_object('seen',false,'hit',is_hit,
    'scanned_at',t,'delay_seconds',cfg.delay_seconds,'server_now',t);
end $$;

-- Kết quả trúng: đọc thẳng từ seen (cả lịch sử cũ), keyset.
create or replace function public.nearby_scan_results_page(p_user uuid,
  p_after_time timestamptz default null,p_after_id uuid default null,
  p_limit integer default 100,p_until timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; cutoff timestamptz:=coalesce(p_until,statement_timestamp());
begin
  if p_user is null or p_limit is null or p_limit<1 or p_limit>200
    or (p_after_time is null)<>(p_after_id is null) then raise exception 'Phân trang không hợp lệ.'; end if;
  with batch as (
    select candidate_id,scanned_at from public.nearby_scan_seen
    where user_id=p_user and hit=true and scanned_at<=cutoff
      and (p_after_time is null or (scanned_at,candidate_id)>(p_after_time,p_after_id))
    order by scanned_at,candidate_id limit p_limit+1
  ), page as (select * from batch order by scanned_at,candidate_id limit p_limit),
  last_row as (select * from page order by scanned_at desc,candidate_id desc limit 1)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(page order by scanned_at,candidate_id) from page),'[]'::jsonb),
    'has_more',(select count(*)>p_limit from batch),'until',cutoff,
    'next_cursor',(select jsonb_build_object('scanned_at',scanned_at,'candidate_id',candidate_id) from last_row)) into result;
  return result;
end $$;

-- Admin: chỉ xem. Không có hàm Admin nào thay đổi lượt.
create or replace function public.nearby_scan_overview(p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object('mode','lifetime','limit',20,
    'active',(select active from public.nearby_scan_v5_deployment where id=1),
    'participants',(select count(*) from public.nearby_scan_gift),
    'locked',(select count(*) from public.nearby_scan_gift where used>=20),
    'rows',coalesce((select jsonb_agg(public.nearby_scan_gift_json(x.user_id) || jsonb_build_object('user_id',x.user_id)
      order by x.user_id) from (select user_id from public.nearby_scan_gift
      order by user_id limit 20 offset greatest(p_offset,0)) x),'[]'::jsonb));
$$;

do $$ declare sig text; begin
  foreach sig in array array['nearby_scan_gift_json(uuid)','nearby_scan_quota(uuid)','nearby_scan_claim_gift(uuid)',
    'nearby_scan_open(uuid)','nearby_scan_attempt(uuid)','nearby_scan_attempt_candidate(uuid,uuid)',
    'nearby_scan_results_page(uuid,timestamptz,uuid,integer,timestamptz)','nearby_scan_overview(integer)',
    'nearby_scan_gift_guard()','nearby_scan_gift_insert_guard()'] loop
    execute format('revoke all on function public.%s from public,anon,authenticated',sig);
    execute format('grant execute on function public.%s to service_role',sig);
  end loop;
end $$;
commit;
