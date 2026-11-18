-- TASK-030: administrator-only operation. NOT executed during local preparation.
-- Run after the capacity migration, after user testing ends and deployment is approved.
-- Selects the one enabled, currently usable cohort; preserves ID, dates and membership.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $capacity$
declare
  v_cohort pilot_private.cohorts%rowtype;
begin
  select * into strict v_cohort from pilot_private.cohorts where enabled for update;
  if v_cohort.starts_at > clock_timestamp() or v_cohort.expires_at <= clock_timestamp() then
    raise exception 'preflight: enabled cohort is outside its training window';
  end if;
  if v_cohort.capacity not in (5, 14, 50) then
    raise exception 'preflight: unexpected current capacity';
  end if;
  if (select count(*) from pilot_private.google_invites
      where cohort_id = v_cohort.id and user_id is not null) > 50 then
    raise exception 'preflight: claimed slots exceed target capacity';
  end if;
  update pilot_private.cohorts set capacity = 50 where id = v_cohort.id;
end $capacity$;

select c.id, c.capacity, c.starts_at, c.expires_at, c.enabled,
  (select count(*) from pilot_private.google_invites i where i.cohort_id = c.id) as invited_count,
  (select count(*) from pilot_private.google_invites i where i.cohort_id = c.id and i.user_id is not null) as claimed_slots
from pilot_private.cohorts c where c.enabled;
commit;
