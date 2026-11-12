-- TASK-024: immutable support context on the existing owner-protected row.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from pg_constraint where conrelid in ('public.pilot_submissions'::regclass,'public.pilot_revisions'::regclass)
    and conname in ('pilot_submissions_relation_text_check','pilot_revisions_relation_text_check')
    and pg_get_constraintdef(oid) like '%btrim%') then
    raise exception 'Apply optional_relation migration before learning_support';
  end if;
end $$;
alter table public.pilot_submissions add column learning_support jsonb;
alter table public.pilot_submissions drop constraint pilot_submissions_schema_version_check;
alter table public.pilot_submissions add constraint pilot_submissions_schema_version_check check ((
  (schema_version=1 and learning_support is null) or
  (schema_version=2 and learning_support is not null and jsonb_typeof(learning_support)='object'
    and learning_support->'version'='1'::jsonb and learning_support->>'mode' in ('guided','independent')
    and jsonb_typeof(learning_support->'candidateExposure')='boolean'
    and octet_length(learning_support::text)<=150000)
) is true);
grant insert(learning_support) on public.pilot_submissions to authenticated;
-- No user data, no SECURITY DEFINER. Presence signals that both migrations were applied.
create function public.reading_support_capabilities() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('supportSchemaVersion',1,'optionalRelation',true)
$$;
revoke all on function public.reading_support_capabilities() from public, anon;
grant execute on function public.reading_support_capabilities() to authenticated;
commit;
