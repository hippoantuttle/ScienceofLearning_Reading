-- TASK-030: administrator-only template. Do not run during local preparation.
-- After deployment approval and capacity expansion, copy to Supabase SQL Editor.
-- Replace the example emails ONLY in that private editor; never put real emails in Git.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $invites$
declare
  v_cohort pilot_private.cohorts%rowtype;
  v_email text;
  v_emails text[] := array['replace-first@example.invalid', 'replace-second@example.invalid'];
begin
  select * into strict v_cohort from pilot_private.cohorts where enabled for update;
  if v_cohort.capacity <> 50 or v_cohort.starts_at > clock_timestamp()
      or v_cohort.expires_at <= clock_timestamp() then
    raise exception 'preflight: a currently usable 50-person cohort is required';
  end if;
  if coalesce(cardinality(v_emails), 0) = 0 then
    raise exception 'preflight: provide the approved Google emails in the private SQL Editor';
  end if;
  foreach v_email in array v_emails loop
    v_email := lower(btrim(v_email));
    if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        or v_email ~ '\.invalid$' then
      raise exception 'preflight: replace all example emails with valid approved Google emails';
    end if;
    insert into pilot_private.google_invites(cohort_id, email)
    values(v_cohort.id, v_email)
    on conflict(cohort_id, email) do nothing;
  end loop;
end $invites$;

-- No emails, user IDs or learner content in the result.
select c.id, c.capacity,
  (select count(*) from pilot_private.google_invites i where i.cohort_id = c.id) as invited_count,
  (select count(*) from pilot_private.google_invites i where i.cohort_id = c.id and i.enabled) as enabled_invites,
  (select count(*) from pilot_private.google_invites i where i.cohort_id = c.id and i.user_id is not null) as claimed_slots
from pilot_private.cohorts c where c.enabled;
commit;
