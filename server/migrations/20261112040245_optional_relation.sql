-- TASK-024: 추가 연결 설명만 선택화. 데이터·NOT NULL·RLS·권한은 유지한다.
begin;
alter table public.pilot_submissions
  drop constraint pilot_submissions_relation_text_check,
  add constraint pilot_submissions_relation_text_check check (length(relation_text) <= 10000);
alter table public.pilot_revisions
  drop constraint pilot_revisions_relation_text_check,
  add constraint pilot_revisions_relation_text_check check (length(relation_text) <= 10000);
commit;
