-- TASK-030: allow a 50-person cohort without changing live capacity or membership.
-- Apply only after deployment approval. Run the separate capacity operation after this.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table pilot_private.cohorts in access exclusive mode;

do $pre$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'pilot_private.cohorts'::regclass
      and conname = 'cohorts_capacity_check' and contype = 'c'
      and pg_get_constraintdef(oid) = 'CHECK ((capacity = ANY (ARRAY[5, 14])))'
  ) then
    raise exception 'preflight: expected 5/14 capacity constraint missing; review schema before applying';
  end if;
end $pre$;

alter table pilot_private.cohorts drop constraint cohorts_capacity_check;
alter table pilot_private.cohorts add constraint cohorts_capacity_check
  check (capacity in (5, 14, 50));
commit;
