-- 읽기 전용: 테이블 RLS와 정책 메타데이터만 확인. 사용자·응답 데이터 조회 안 함.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       coalesce(array_agg(p.policyname order by p.policyname) filter (where p.policyname is not null), array[]::name[]) as policies
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
where n.nspname='public' and c.relname in ('pilot_members','pilot_submissions')
group by c.relname,c.relrowsecurity order by c.relname;
