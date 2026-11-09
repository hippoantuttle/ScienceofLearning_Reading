-- 검토용 초안: 실행·배포 전 Supabase 실제 RLS 및 초대 설정 별도 검증 필수.
-- 회원/역할 등록은 서버 관리자만 수행하며 이메일 명단은 이 저장소에 보관하지 않는다.
begin;
-- 충돌 시 아무 객체도 수정하지 않고 트랜잭션을 중단한다.
do $$ begin
  if to_regclass('public.pilot_members') is not null or to_regclass('public.pilot_submissions') is not null or to_regprocedure('public.is_active_pilot_member()') is not null then
    raise exception 'Pilot objects already exist; stop and review';
  end if;
end $$;
create table public.pilot_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('participant','team','operator')),
  enabled boolean not null default true
);
alter table public.pilot_members enable row level security;
revoke all on public.pilot_members from public, anon, authenticated;

-- 보안 정의 함수는 호출자가 아닌 내부 auth.uid()만 조회하며 임의 ID 입력을 받지 않는다.
create function public.is_active_pilot_member()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.pilot_members m where m.user_id = auth.uid() and m.enabled = true) $$;
revoke all on function public.is_active_pilot_member() from public, anon;
grant execute on function public.is_active_pilot_member() to authenticated;

create table public.pilot_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  schema_version integer not null check (schema_version = 1),
  structure_type text not null check (structure_type in ('claim','cause','problem')),
  main_idea text not null check (length(btrim(main_idea, E' \t\n\r\f' || chr(11))) > 0 and length(main_idea) <= 10000),
  primary_text text not null check (length(btrim(primary_text, E' \t\n\r\f' || chr(11))) > 0 and length(primary_text) <= 10000),
  support_text text not null check (length(btrim(support_text, E' \t\n\r\f' || chr(11))) > 0 and length(support_text) <= 10000),
  relation_text text not null check (length(btrim(relation_text, E' \t\n\r\f' || chr(11))) > 0 and length(relation_text) <= 10000),
  retell text not null check (length(btrim(retell, E' \t\n\r\f' || chr(11))) > 0 and length(retell) <= 10000),
  reflection text not null default '' check (length(reflection) <= 10000),
  new_words text not null default '' check (length(new_words) <= 10000),
  interests text not null default '' check (length(interests) <= 10000),
  rechecked boolean not null,
  saved_at timestamptz not null default now(),
  unique(owner_id,session_id)
);
alter table public.pilot_submissions enable row level security;
revoke all on public.pilot_submissions from public, anon, authenticated;
grant select, insert on public.pilot_submissions to authenticated;
create policy pilot_own_select on public.pilot_submissions for select to authenticated
  using (owner_id = auth.uid() and public.is_active_pilot_member());
create policy pilot_own_insert on public.pilot_submissions for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_pilot_member());
-- participant/team/operator 모두 자기 행만. 운영자의 교차 조회·삭제 권한은 부여하지 않는다.
-- 초대 전용 가입 설정, 관리자 절차, 삭제 요청 처리·백업 보존, 멱등 재시도 서버 로직 별도 구현/검증 필요.
commit;
