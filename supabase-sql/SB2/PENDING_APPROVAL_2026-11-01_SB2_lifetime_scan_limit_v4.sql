-- ĐÃ BỊ THAY THẾ bởi FINAL_PENDING_APPROVAL_2026-11-01_SB2_scan_gift_20_v5.sql. GIỮ LẠI ĐỂ ĐỐI CHIẾU, KHÔNG CHẠY.
-- CHỜ DUYỆT v4 — 20 LƯỢT QUÉT TRỌN ĐỜI. KHÔNG CHẠY TRÊN DB THẬT KHI CHƯA ĐƯỢC ĐỒNG Ý.
-- Thay thế hoàn toàn thiết kế tuần v2/v3 (các file đó giữ lại chỉ để đối chiếu, KHÔNG chạy).
-- Chỉ Supabase #2 (pymwwuscoftmdcmmeckp). Dừng quét, sao lưu trước khi chạy.
--
-- Quy tắc: mỗi user có đúng 20 lượt trong toàn bộ vòng đời. Hết 20 => khóa vĩnh viễn.
--  * Không reset ngày/tuần/tháng; không lượt tặng; không chức năng Admin cấp/reset lượt.
--  * Lượt cũ đã dùng (trước khi chạy file này) ĐƯỢC TÍNH vào 20:
--      prior_used = max(tổng nearby_scan_daily.total, số dòng nearby_scan_seen) — chọn số lớn hơn
--      nên 10 lượt thiếu lịch sử vẫn được tính, không ai được thừa lượt.
--  * Bộ đếm nằm ở bảng mới nearby_scan_lifetime; xóa lịch sử/reload/đăng xuất không ảnh hưởng.
--  * CHECK ở mức bảng: prior_used + new_used không vượt max(20, prior_used) => kể cả lỗi logic
--    hay gọi đồng thời cũng không thể ghi quá 20.
--  * RPC cũ nearby_scan_attempt(uuid) bị thay bằng hàm luôn từ chối; nearby_scan_open/overview
--    chỉ đọc. Đường đếm lượt DUY NHẤT: nearby_scan_attempt_candidate(uuid,uuid).
--  * Không ALTER/UPDATE/DELETE/DROP bảng cũ, không đổi RLS bảng cũ. nearby_scan_daily ngừng được ghi
--    (giữ nguyên làm dữ liệu lịch sử). Dữ liệu 31/10 và 5 dòng hit NULL không bị đụng tới.
-- Tạm dừng khẩn cấp: ROLLBACK_PENDING_2026-11-01_SB2_lifetime_scan_limit_v4.sql (không cấp thêm lượt).
begin;
select pg_advisory_xact_lock(7240211202601);

do $$ begin
  if to_regclass('public.nearby_scan_lifetime') is not null
     or to_regclass('public.nearby_scan_v4_deployment') is not null then
    raise exception 'Đã có cấu trúc v4: không áp dụng chồng.';
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

-- Lưu nguyên văn định nghĩa hàm cũ (chỉ để đối chiếu; KHÔNG tạo bản sao gọi được).
create table public.nearby_scan_v4_deployment (
  id smallint primary key check (id=1),
  active boolean not null,
  cutover_at timestamptz not null,
  original_functions jsonb not null
);
grant all on public.nearby_scan_v4_deployment to service_role;
revoke all on public.nearby_scan_v4_deployment from public, anon, authenticated;
alter table public.nearby_scan_v4_deployment enable row level security;
insert into public.nearby_scan_v4_deployment
select 1,true,clock_timestamp(),coalesce(jsonb_object_agg(sig,pg_get_functiondef(to_regprocedure(sig)))
  filter(where to_regprocedure(sig) is not null),'{}'::jsonb)
from unnest(array['public.nearby_scan_open(uuid)','public.nearby_scan_attempt(uuid)',
  'public.nearby_scan_attempt_candidate(uuid,uuid)','public.nearby_scan_overview(integer)']) sig;

create table public.nearby_scan_lifetime (
  user_id uuid primary key,
  prior_used bigint not null check (prior_used>=0),   -- lượt đã dùng trước v4 (bất biến)
  prior_hits bigint not null default 0 check (prior_hits>=0),
  prior_misses bigint not null default 0 check (prior_misses>=0),
  new_used integer not null default 0 check (new_used>=0),
  new_hits integer not null default 0 check (new_hits>=0),
  new_misses integer not null default 0 check (new_misses>=0),
  last_attempt_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (new_used=new_hits+new_misses),
  check (prior_used+new_used<=greatest(20,prior_used))
);
grant all on public.nearby_scan_lifetime to service_role;
revoke all on public.nearby_scan_lifetime from public, anon, authenticated;
alter table public.nearby_scan_lifetime enable row level security;

-- prior_used không bao giờ được sửa sau khi tạo (chặn cả cập nhật nhầm bằng tay qua API).
create or replace function public.nearby_scan_lifetime_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'Không được xóa bộ đếm lượt quét trọn đời.'; end if;
  if new.user_id<>old.user_id or new.prior_used<>old.prior_used or new.prior_hits<>old.prior_hits
     or new.prior_misses<>old.prior_misses or new.new_used<old.new_used then
    raise exception 'Bộ đếm lượt quét trọn đời chỉ được tăng.';
  end if;
  return new;
end $$;
create trigger nearby_scan_lifetime_guard before update or delete on public.nearby_scan_lifetime
  for each row execute function public.nearby_scan_lifetime_guard();

-- Hàm tạo dòng đếm (dùng khi cài và khi user chưa có dòng): luôn tính lượt cũ từ dữ liệu cũ.
create or replace function public.nearby_scan_lifetime_ensure(p_user uuid)
returns void language sql security invoker set search_path=public as $$
  insert into public.nearby_scan_lifetime(user_id,prior_used,prior_hits,prior_misses)
  select p_user,
    greatest(coalesce((select sum(total) from public.nearby_scan_daily where user_id=p_user),0),
             (select count(*) from public.nearby_scan_seen where user_id=p_user)),
    coalesce((select sum(hits) from public.nearby_scan_daily where user_id=p_user),0),
    coalesce((select sum(misses) from public.nearby_scan_daily where user_id=p_user),0)
  on conflict(user_id) do nothing;
$$;

select public.nearby_scan_lifetime_ensure(u) from (
  select user_id u from public.nearby_scan_daily union select user_id from public.nearby_scan_seen) x;

create or replace function public.nearby_scan_quota_json(l public.nearby_scan_lifetime)
returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object('mode','lifetime','limit',20,
    'used',least(20,l.prior_used+l.new_used),
    'remaining',greatest(0,20-(l.prior_used+l.new_used)),
    'locked',(l.prior_used+l.new_used)>=20,
    'total',l.prior_hits+l.prior_misses+l.new_hits+l.new_misses,
    'hits',l.prior_hits+l.new_hits,'misses',l.prior_misses+l.new_misses);
$$;

-- CHỈ ĐỌC: không ghi gì. User chưa từng quét được tính từ dữ liệu cũ ngay lúc đọc.
create or replace function public.nearby_scan_quota(p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare l public.nearby_scan_lifetime;
begin
  if p_user is null then raise exception 'Thiếu tài khoản.'; end if;
  select * into l from public.nearby_scan_lifetime where user_id=p_user;
  if not found then
    l.prior_used:=greatest(coalesce((select sum(total) from public.nearby_scan_daily where user_id=p_user),0),
                           (select count(*) from public.nearby_scan_seen where user_id=p_user));
    l.prior_hits:=coalesce((select sum(hits) from public.nearby_scan_daily where user_id=p_user),0);
    l.prior_misses:=coalesce((select sum(misses) from public.nearby_scan_daily where user_id=p_user),0);
    l.new_used:=0; l.new_hits:=0; l.new_misses:=0;
  end if;
  return public.nearby_scan_quota_json(l) || jsonb_build_object('active',
    (select active from public.nearby_scan_v4_deployment where id=1),'server_now',statement_timestamp());
end $$;

-- Giữ tên cũ cho tương thích nhưng CHỈ ĐỌC (không còn tạo dòng daily).
create or replace function public.nearby_scan_open(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
  select public.nearby_scan_quota(p_user);
$$;

-- RPC cũ: không còn đường đếm lượt riêng (không lưu lịch sử) => luôn từ chối.
create or replace function public.nearby_scan_attempt(p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
  raise exception 'Hàm quét cũ đã ngừng; chỉ dùng nearby_scan_attempt_candidate.';
end $$;

-- Đường DUY NHẤT tính lượt. Khóa theo user + FOR UPDATE + CHECK bảng => an toàn đồng thời.
-- Mọi lỗi giữa chừng rollback toàn bộ (seen, bộ đếm).
create or replace function public.nearby_scan_attempt_candidate(p_user uuid,p_candidate uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare l public.nearby_scan_lifetime; cfg public.nearby_scan_settings; t timestamptz; is_hit boolean; on_ boolean;
begin
  if p_user is null or p_candidate is null then raise exception 'Thiếu tài khoản.'; end if;
  perform pg_advisory_xact_lock_shared(7240211202601);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,71));
  select active into strict on_ from public.nearby_scan_v4_deployment where id=1;
  if not on_ then raise exception 'Chức năng quét đang tạm dừng.'; end if;
  perform public.nearby_scan_lifetime_ensure(p_user);
  select * into strict l from public.nearby_scan_lifetime where user_id=p_user for update;
  -- Đã quét ứng viên này => không tính lượt (kể cả khi đã hết lượt).
  if exists(select 1 from public.nearby_scan_seen where user_id=p_user and candidate_id=p_candidate) then
    return jsonb_build_object('seen',true);
  end if;
  if l.prior_used+l.new_used>=20 then raise exception 'Bạn đã dùng hết 20 lượt quét.'; end if;
  select * into strict cfg from public.nearby_scan_settings where id=1;
  t:=clock_timestamp();
  if l.last_attempt_at is not null and l.last_attempt_at+cfg.delay_seconds*interval '1 second'>t then
    raise exception 'Lượt quét trước chưa hoàn tất.';
  end if;
  is_hit:=random()*100<cfg.hit_percent;
  insert into public.nearby_scan_seen(user_id,candidate_id,scanned_at,hit) values(p_user,p_candidate,t,is_hit);
  update public.nearby_scan_lifetime set new_used=new_used+1,
    new_hits=new_hits+case when is_hit then 1 else 0 end,
    new_misses=new_misses+case when is_hit then 0 else 1 end,last_attempt_at=t
    where user_id=p_user returning * into l;
  return public.nearby_scan_quota_json(l) || jsonb_build_object('seen',false,'hit',is_hit,
    'scanned_at',t,'delay_seconds',cfg.delay_seconds,'server_now',t);
end $$;

-- Kết quả trúng: đọc thẳng từ seen (vĩnh viễn), keyset 100/trang, không giới hạn tổng.
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

-- Admin: chỉ xem. Không có bất kỳ hàm Admin nào thay đổi lượt.
create or replace function public.nearby_scan_overview(p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object('mode','lifetime','limit',20,
    'active',(select active from public.nearby_scan_v4_deployment where id=1),
    'participants',(select count(*) from public.nearby_scan_lifetime),
    'locked',(select count(*) from public.nearby_scan_lifetime where prior_used+new_used>=20),
    'rows',coalesce((select jsonb_agg(public.nearby_scan_quota_json(x.p) || jsonb_build_object('user_id',(x.p).user_id)
      order by (x.p).user_id) from (select p from public.nearby_scan_lifetime p
      order by p.user_id limit 20 offset greatest(p_offset,0)) x),'[]'::jsonb));
$$;

do $$ declare sig text; begin
  foreach sig in array array['nearby_scan_lifetime_ensure(uuid)','nearby_scan_quota_json(public.nearby_scan_lifetime)',
    'nearby_scan_quota(uuid)','nearby_scan_open(uuid)','nearby_scan_attempt(uuid)',
    'nearby_scan_attempt_candidate(uuid,uuid)','nearby_scan_results_page(uuid,timestamptz,uuid,integer,timestamptz)',
    'nearby_scan_overview(integer)','nearby_scan_lifetime_guard()'] loop
    execute format('revoke all on function public.%s from public,anon,authenticated',sig);
    execute format('grant execute on function public.%s to service_role',sig);
  end loop;
end $$;
commit;
