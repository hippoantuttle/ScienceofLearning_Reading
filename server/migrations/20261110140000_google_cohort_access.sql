-- TASK-020 Google cohort access. Apply once in Supabase SQL Editor (transactional).
-- Preflight aborts without changes if the live schema differs from what this expects.
begin;
do $pre$ begin
  if to_regclass('public.pilot_members') is null or to_regclass('public.pilot_submissions') is null or to_regclass('public.pilot_revisions') is null
     or to_regprocedure('public.is_active_pilot_member()') is null then raise exception 'preflight: base pilot objects missing'; end if;
  if to_regnamespace('pilot_private') is not null or to_regprocedure('public.claim_google_pilot_access()') is not null then raise exception 'preflight: TASK-020 objects already exist'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='pilot_members' and column_name='auth_mode') then raise exception 'preflight: auth_mode already exists'; end if;
  if (select count(*) from pg_policies where schemaname='public' and ((tablename='pilot_submissions' and policyname='pilot_own_insert') or (tablename='pilot_revisions' and policyname='pilot_revision_own_insert')))<>2 then raise exception 'preflight: expected insert policies missing'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.pilot_members'::regclass and contype in ('p','u') and conkey=array[(select attnum from pg_attribute where attrelid='public.pilot_members'::regclass and attname='user_id')]::int2[]) then raise exception 'preflight: pilot_members.user_id unique key missing'; end if;
end $pre$;
create schema pilot_private;
revoke all on schema pilot_private from public, anon, authenticated;
alter table public.pilot_members add column auth_mode text not null default 'legacy'
  check (auth_mode in ('legacy','google'));
create table pilot_private.cohorts (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{2,63}$'),
  capacity integer not null check (capacity in (5,14)),
  starts_at timestamptz not null, expires_at timestamptz not null,
  enabled boolean not null default false, check (starts_at < expires_at)
);
create unique index pilot_one_enabled_cohort on pilot_private.cohorts ((enabled)) where enabled;
create table pilot_private.google_invites (
  cohort_id text not null references pilot_private.cohorts(id) on delete restrict,
  email text not null check (email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  enabled boolean not null default true,
  user_id uuid references auth.users(id) on delete set null,
  primary key (cohort_id,email), unique (cohort_id,user_id)
);
create index pilot_google_invite_user on pilot_private.google_invites(user_id) where user_id is not null;
alter table pilot_private.cohorts enable row level security;
alter table pilot_private.google_invites enable row level security;
revoke all on all tables in schema pilot_private from public, anon, authenticated;

-- Read provider-controlled identity data, never user_metadata/client input.
create function pilot_private.verified_google_email()
returns text language sql stable security definer set search_path=pg_catalog
as $$
 select lower(btrim(u.email)) from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
 and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
   and i.identity_data->'email_verified'='true'::jsonb
   and lower(i.identity_data->>'email')=lower(btrim(u.email)))
$$;
revoke all on function pilot_private.verified_google_email() from public,anon,authenticated;

-- Expiry stops new training/AI, not existing own-record review. Invite/member
-- revocation removes access too. No caller can supply an arbitrary user ID.
create function pilot_private.member_access(p_training boolean,p_cohort text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
 select auth.uid() is not null and exists(
  select 1 from public.pilot_members m where m.user_id=auth.uid() and m.enabled
  and ((m.auth_mode='legacy' and p_cohort is null) or (m.auth_mode='google' and exists(
   select 1 from pilot_private.google_invites i join pilot_private.cohorts c on c.id=i.cohort_id
   where i.user_id=m.user_id and i.enabled and i.email=pilot_private.verified_google_email()
   and (p_cohort is null or c.id=p_cohort)
   and (not p_training or (c.enabled and c.starts_at<=statement_timestamp() and c.expires_at>statement_timestamp()))
  )))
 )
$$;
revoke all on function pilot_private.member_access(boolean,text) from public,anon,authenticated;
grant usage on schema pilot_private to authenticated;
grant execute on function pilot_private.member_access(boolean,text) to authenticated;

create function pilot_private.claim_google_access()
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare
 v_user uuid:=auth.uid(); v_email text; v_cohort text; v_capacity integer;
 v_existing uuid; v_count integer;
begin
 if v_user is null then return false; end if;
 v_email:=pilot_private.verified_google_email();
 if v_email is null then return false; end if;
 select count(*),min(c.id) into v_count,v_cohort
 from pilot_private.google_invites i join pilot_private.cohorts c on c.id=i.cohort_id
 where i.email=v_email and i.enabled and c.enabled and c.starts_at<=clock_timestamp() and c.expires_at>clock_timestamp();
 if v_count<>1 then
  -- Already approved Google users may sign in to review their own records
  -- after training expires. This never claims a new invitation or training slot.
  return exists(select 1 from public.pilot_members m where m.user_id=v_user and m.auth_mode='google')
    and pilot_private.member_access(false,null);
 end if;
 -- Lock one cohort to serialize sign-ins and keep capacity authoritative.
 select c.capacity into v_capacity from pilot_private.cohorts c
 where c.id=v_cohort and c.enabled and c.starts_at<=clock_timestamp() and c.expires_at>clock_timestamp() for update;
 if not found then return false; end if;
 select i.user_id into v_existing from pilot_private.google_invites i
 where i.cohort_id=v_cohort and i.email=v_email and i.enabled for update;
 if not found or (v_existing is not null and v_existing<>v_user) then return false; end if;
 if exists(select 1 from public.pilot_members m where m.user_id=v_user and not m.enabled) then return false; end if;
 if v_existing is null then
  select count(*) into v_count from pilot_private.google_invites i where i.cohort_id=v_cohort and i.user_id is not null;
  if v_count>=v_capacity then return false; end if;
 end if;
 -- Never re-enable disabled membership or elevate an existing role.
 insert into public.pilot_members(user_id,role,enabled,auth_mode)
 values(v_user,case when v_capacity=5 then 'team' else 'participant' end,true,'google')
 on conflict(user_id) do update set auth_mode='google' where public.pilot_members.enabled;
 update pilot_private.google_invites set user_id=v_user where cohort_id=v_cohort and email=v_email;
 return pilot_private.member_access(true,v_cohort);
end;
$$;
revoke all on function pilot_private.claim_google_access() from public,anon,authenticated;
grant execute on function pilot_private.claim_google_access() to authenticated;

-- Only invoker wrappers are public. Input cannot contain email/ID/role/approval.
create function public.claim_google_pilot_access()
returns boolean language sql volatile security invoker set search_path=pg_catalog
as $$ select pilot_private.claim_google_access() $$;
create or replace function public.is_active_pilot_member()
returns boolean language sql stable security invoker set search_path=pg_catalog
as $$ select pilot_private.member_access(false,null) $$;
create function public.can_start_pilot_training()
returns boolean language sql stable security invoker set search_path=pg_catalog
as $$ select pilot_private.member_access(true,null) $$;
create function public.is_active_pilot_cohort_member(p_cohort_id text)
returns boolean language sql stable security invoker set search_path=pg_catalog
as $$ select p_cohort_id is not null and pilot_private.member_access(true,p_cohort_id) $$;
revoke all on function public.claim_google_pilot_access(),public.is_active_pilot_member(),public.can_start_pilot_training(),public.is_active_pilot_cohort_member(text) from public,anon,authenticated;
grant execute on function public.claim_google_pilot_access(),public.is_active_pilot_member(),public.can_start_pilot_training(),public.is_active_pilot_cohort_member(text) to authenticated;

alter policy pilot_own_insert on public.pilot_submissions
 with check (owner_id=(select auth.uid()) and (select public.can_start_pilot_training()));
alter policy pilot_revision_own_insert on public.pilot_revisions
 with check (owner_id=(select auth.uid()) and (select public.can_start_pilot_training())
 and exists(select 1 from public.pilot_submissions s where s.id=submission_id and s.owner_id=(select auth.uid())));
notify pgrst,'reload schema';
commit;
