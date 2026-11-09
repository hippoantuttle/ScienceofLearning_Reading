-- 읽기 전용 사전 확인: 기존 객체가 있으면 마이그레이션을 실행하지 않는다.
select to_regclass('public.pilot_members') is not null as pilot_members_exists,
       to_regclass('public.pilot_submissions') is not null as pilot_submissions_exists,
       to_regprocedure('public.is_active_pilot_member()') is not null as membership_function_exists;
