-- TASK-015 검토용 로컬 초안. 실환경 적용·배포는 별도 승인 후.
-- 파일명은 supabase migration new revision_storage로 생성. 기존 저장소 디렉터리에 보관.
begin;
alter table public.pilot_submissions
  add constraint pilot_submission_owner_unique unique(id, owner_id),
  add column article_title text,
  add column source_url text,
  add constraint pilot_article_metadata_check check (
    (article_title is null and source_url is null) or
    (article_title is not null and source_url is not null
     and length(article_title) <= 200 and article_title !~ '[[:cntrl:]]'
     and (source_url = '' or
       (source_url ~ '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'
        and source_url !~ '\.(local|internal|test|invalid)$')))
  );
-- 서버 식별자와 저장 시각은 DB가 발급한다. 최초본 UPDATE/DELETE는 계속 불허.
revoke insert on public.pilot_submissions from authenticated;
grant insert(owner_id, session_id, schema_version, structure_type, main_idea, primary_text,
  support_text, relation_text, retell, reflection, new_words, interests, rechecked,
  article_title, source_url) on public.pilot_submissions to authenticated;
create index pilot_submission_recent on public.pilot_submissions(owner_id, saved_at desc, id desc);

create table public.pilot_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  submission_id uuid not null,
  request_id uuid not null,
  main_idea text not null check (length(btrim(main_idea, E' \t\n\r\f' || chr(11))) > 0 and length(main_idea) <= 10000),
  primary_text text not null check (length(btrim(primary_text, E' \t\n\r\f' || chr(11))) > 0 and length(primary_text) <= 10000),
  support_text text not null check (length(btrim(support_text, E' \t\n\r\f' || chr(11))) > 0 and length(support_text) <= 10000),
  relation_text text not null check (length(btrim(relation_text, E' \t\n\r\f' || chr(11))) > 0 and length(relation_text) <= 10000),
  retell text not null check (length(btrim(retell, E' \t\n\r\f' || chr(11))) > 0 and length(retell) <= 10000),
  saved_at timestamptz not null default clock_timestamp(),
  unique(owner_id, submission_id, request_id),
  foreign key(submission_id, owner_id) references public.pilot_submissions(id, owner_id) on delete cascade
);
create index pilot_revision_recent on public.pilot_revisions(owner_id, submission_id, saved_at desc, id desc);
alter table public.pilot_revisions enable row level security;
revoke all on public.pilot_revisions from public, anon, authenticated;
grant select on public.pilot_revisions to authenticated;
grant insert(owner_id, submission_id, request_id, main_idea, primary_text, support_text, relation_text, retell)
  on public.pilot_revisions to authenticated;
create policy pilot_revision_own_select on public.pilot_revisions for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_pilot_member()));
create policy pilot_revision_own_insert on public.pilot_revisions for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and (select public.is_active_pilot_member())
    and exists(select 1 from public.pilot_submissions s where s.id = submission_id and s.owner_id = (select auth.uid()))
  );
-- UPDATE/DELETE는 부여하지 않는다. 관리자 원본 삭제가 수정본에도 cascade된다.
notify pgrst, 'reload schema';
commit;
