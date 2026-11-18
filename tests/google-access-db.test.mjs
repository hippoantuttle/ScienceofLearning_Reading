import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let PGlite;try{({PGlite}=require('../tmp/task015/node_modules/@electric-sql/pglite'));}catch{}
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const email=n=>'reader'+n+'@example.test';
const capacityMigration=readFileSync(new URL('../server/migrations/20261118042724_cohort_capacity_50.sql',import.meta.url),'utf8');
const capacityOperation=readFileSync(new URL('../server/operations/set-active-cohort-capacity-50.sql',import.meta.url),'utf8');
const invitationTemplate=readFileSync(new URL('../server/operations/register-google-invites.template.sql',import.meta.url),'utf8');
async function fixture(capacity=5,{migrate=true,userCount=18}={}){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 grant usage on schema auth,public to authenticated;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table auth.identities(user_id uuid references auth.users(id),provider text,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const name of ['../server/migrations/001-pilot-draft.sql','../server/migrations/20261110045614_revision_storage.sql','../server/migrations/20261110140000_google_cohort_access.sql'])await db.exec(readFileSync(new URL(name,import.meta.url),'utf8'));
 if(migrate)await db.exec(capacityMigration);
 await db.query("insert into pilot_private.cohorts values ('team-test',$1,now()-interval '1 hour',now()+interval '1 day',true)",[capacity]);
 for(let n=1;n<=Math.max(userCount,capacity+1);n++){
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[uid(n),email(n)]);
  await db.query("insert into auth.identities values($1,'google',$2)",[uid(n),JSON.stringify({email:email(n),email_verified:true})]);
 }
 async function asUser(n,fn){return db.transaction(async tx=>{
  await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(n)]);return fn(tx);
 });}
 const boolean=async(n,sql='select public.claim_google_pilot_access() as result',params=[])=> (await asUser(n,tx=>tx.query(sql,params))).rows[0].result;
 const invite=async n=>db.query("insert into pilot_private.google_invites(cohort_id,email) values('team-test',$1)",[email(n)]);
 const active=n=>boolean(n,'select public.is_active_pilot_member() as result');
 const training=n=>boolean(n,'select public.is_active_pilot_cohort_member($1) as result',['team-test']);
 return {db,asUser,boolean,invite,active,training};
}
const options={skip:!PGlite?'로컬 PGlite 설치 필요: TASK-020 실제 SQL 검증 미실시':false};
test('TASK-020/030 PostgreSQL: 검증된 사전 등록 Google 이메일·정원 5/14/50·반복 승인·직접 권한 변경 차단',options,async t=>{
 for(const capacity of [5,14,50])await t.test(String(capacity),async()=>{
  const f=await fixture(capacity);try{
   assert.equal(await f.boolean(1),false);assert.equal(await f.active(1),false);
   for(let n=1;n<=capacity+1;n++)await f.invite(n);
   // Concurrent callers are queued by PGlite's one connection. Actual SQL locks
   // and capacity are exercised; distributed/multi-connection contention is not.
   const claims=await Promise.all(Array.from({length:capacity+1},(_,n)=>f.boolean(n+1)));
   assert.equal(claims.filter(Boolean).length,capacity);assert.equal(await f.boolean(1),true);
   assert.equal(Number((await f.db.query('select count(*) as n from public.pilot_members')).rows[0].n),capacity);
   assert.equal(await f.training(1),true);
   assert.equal(await f.boolean(1,'select public.is_active_pilot_cohort_member($1) as result',['other-cohort']),false);
   for(const query of ["select * from pilot_private.google_invites","update public.pilot_members set enabled=true","insert into pilot_private.google_invites(cohort_id,email) values('team-test','fake@example.invalid')","select pilot_private.verified_google_email()"]){
    await assert.rejects(f.asUser(1,tx=>tx.query(query)),error=>error.code==='42501');
   }
   await assert.rejects(f.db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select public.claim_google_pilot_access()');}),error=>error.code==='42501');
   const exposed=(await f.db.query("select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_google_pilot_access','is_active_pilot_member','can_start_pilot_training','is_active_pilot_cohort_member')")).rows;
   assert.equal(exposed.length,4);assert.ok(exposed.every(x=>x.prosecdef===false));
  }finally{await f.db.close();}
 });
});

test('TASK-030 PostgreSQL: 5명에서 50명으로 확대해도 기존 역할·명단·기록·보안 설정을 보존하고 51번째는 거절한다',options,async()=>{
 const f=await fixture(5,{migrate:false,userCount:51});try{
  for(let n=1;n<=5;n++){await f.invite(n);assert.equal(await f.boolean(n),true);}
  await f.db.query("update public.pilot_members set role='operator' where user_id=$1",[uid(1)]);
  const saved=(await f.asUser(1,tx=>tx.query(`insert into public.pilot_submissions(owner_id,session_id,schema_version,structure_type,main_idea,primary_text,support_text,relation_text,retell,rechecked)
   values($1,$2,1,'claim','합성 생각','합성 주장','합성 근거','합성 관계','합성 인출',false) returning *`,[uid(1),uid(101)]))).rows[0];
  const snapshot=async()=>({
   cohort:(await f.db.query('select id,starts_at,expires_at,enabled from pilot_private.cohorts order by id')).rows,
   members:(await f.db.query('select * from public.pilot_members order by user_id')).rows,
   invites:(await f.db.query('select * from pilot_private.google_invites order by email')).rows,
   security:(await f.db.query("select n.nspname,c.relname,c.relrowsecurity,c.relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','pilot_private') and c.relkind='r' order by n.nspname,c.relname")).rows,
   functions:(await f.db.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) as definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','pilot_private') order by n.nspname,p.proname")).rows
  });
  const before=await snapshot();
  await assert.rejects(f.db.query('update pilot_private.cohorts set capacity=50'),e=>e.code==='23514');
  await assert.rejects(f.db.exec(capacityOperation),e=>e.code==='23514');await f.db.exec('rollback');
  assert.equal((await f.db.query('select capacity from pilot_private.cohorts')).rows[0].capacity,5);
  await f.db.exec(capacityMigration);
  assert.equal((await f.db.query('select capacity from pilot_private.cohorts')).rows[0].capacity,5,'schema migration alone does not change the current cohort');
  for(const capacity of [0,6,49,51])await assert.rejects(f.db.query('update pilot_private.cohorts set capacity=$1',[capacity]),e=>e.code==='23514');
  await f.db.exec(capacityOperation);
  assert.equal((await f.db.query('select capacity from pilot_private.cohorts')).rows[0].capacity,50);
  assert.deepEqual(await snapshot(),before);
  await f.db.exec(capacityOperation);assert.deepEqual(await snapshot(),before,'capacity operation is safe to repeat');
  assert.equal(await f.boolean(1),true);assert.equal(await f.active(1),true);assert.equal(await f.training(1),true);
  assert.deepEqual((await f.asUser(1,tx=>tx.query('select * from public.pilot_submissions where id=$1',[saved.id]))).rows[0],saved);
  assert.equal(await f.boolean(6),false,'uninvited account remains blocked after capacity expansion');
  for(let n=6;n<=51;n++)await f.invite(n);
  const claims=await Promise.all(Array.from({length:46},(_,n)=>f.boolean(n+6)));
  assert.equal(claims.filter(Boolean).length,45);assert.equal(await f.boolean(51),false);
  assert.equal((await f.db.query('select count(*)::int as n from public.pilot_members')).rows[0].n,50);
  assert.equal((await f.db.query('select role from public.pilot_members where user_id=$1',[uid(1)])).rows[0].role,'operator');
  assert.equal((await f.db.query('select role from public.pilot_members where user_id=$1',[uid(6)])).rows[0].role,'participant');
  assert.equal((await f.asUser(6,tx=>tx.query('select id from public.pilot_submissions where id=$1',[saved.id]))).rows.length,0);
  await assert.rejects(f.asUser(6,tx=>tx.query('update pilot_private.cohorts set capacity=5')),e=>e.code==='42501');
  await f.db.exec("update pilot_private.cohorts set expires_at=now()-interval '1 minute'");
  assert.equal(await f.training(6),false);assert.equal(await f.active(6),true);
  await f.db.query('update pilot_private.google_invites set enabled=false where user_id=$1',[uid(6)]);
  assert.equal(await f.active(6),false);assert.equal(await f.boolean(6),false);
 }finally{await f.db.close();}
});

test('TASK-030 PostgreSQL: 회차가 없거나 사용 기간 밖이면 정원 변경을 중단한다',options,async t=>{
 for(const setup of ["update pilot_private.cohorts set enabled=false","update pilot_private.cohorts set expires_at=now()-interval '1 minute'","update pilot_private.cohorts set starts_at=now()+interval '1 hour'"]){
  await t.test(setup,async()=>{
   const f=await fixture();try{
    await f.db.exec(setup);await assert.rejects(f.db.exec(capacityOperation));await f.db.exec('rollback');
    assert.equal((await f.db.query('select capacity from pilot_private.cohorts')).rows[0].capacity,5);
   }finally{await f.db.close();}
  });
 }
});

test('TASK-030 PostgreSQL: 초대 양식은 예시·빈 명단·잘못된 이메일을 거절하고 중복·비활성·기존 계정 결속을 보존한다',options,async()=>{
 const f=await fixture();try{
  await f.invite(1);await f.invite(2);await f.boolean(1);
  await f.db.query('update pilot_private.google_invites set enabled=false where email=$1',[email(2)]);
  const inviteSql=emails=>invitationTemplate.replace("array['replace-first@example.invalid', 'replace-second@example.invalid']",emails);
  const synthetic="array['reader1@example.test', 'reader2@example.test', ' Reader6@Example.Test ', 'reader6@example.test']";
  // example.test is synthetic; unlike the unfilled .invalid markers, it exercises the template.
  await assert.rejects(f.db.exec(inviteSql(synthetic)),/50-person cohort/);await f.db.exec('rollback');
  await f.db.exec(capacityOperation);
  for(const sql of [invitationTemplate,inviteSql('array[]::text[]'),inviteSql("array['bad address']"),inviteSql("array['reader6@example.test', null]"),inviteSql("array['reader6@example.test', 'replace-first@example.invalid']")]){
   await assert.rejects(f.db.exec(sql));await f.db.exec('rollback');
   assert.equal((await f.db.query('select count(*)::int as n from pilot_private.google_invites')).rows[0].n,2,'failed batch is rolled back');
  }
  const before=(await f.db.query('select * from pilot_private.google_invites order by email')).rows;
  const executable=inviteSql(synthetic);
  await f.db.exec(executable);await f.db.exec(executable);
  const after=(await f.db.query('select * from pilot_private.google_invites order by email')).rows;
  assert.equal(after.length,3);
  assert.deepEqual(after.slice(0,2),before);
  assert.equal(after[2].email,'reader6@example.test');assert.equal(after[2].user_id,null);assert.equal(after[2].enabled,true);
 }finally{await f.db.close();}
});
test('TASK-020 PostgreSQL: 미확인·다른 제공자·user_metadata 위조·계정 이메일 변경·비활성 회원은 자동 승인되지 않는다',options,async()=>{
 const f=await fixture();try{
  for(let n=1;n<=5;n++)await f.invite(n);
  await f.db.query("update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false') where user_id=$1",[uid(1)]);
  assert.equal(await f.boolean(1),false);
  await f.db.query("update auth.identities set provider='email' where user_id=$1",[uid(2)]);
  await f.db.query("update auth.users set raw_user_meta_data=$1 where id=$2",[JSON.stringify({provider:'google',email_verified:true,email:email(2)}),uid(2)]);
  assert.equal(await f.boolean(2),false);
  await f.db.query('update auth.users set email_confirmed_at=null where id=$1',[uid(3)]);
  assert.equal(await f.boolean(3),false);
  await f.db.query('update auth.users set email=$1 where id=$2',[email(1),uid(4)]);
  assert.equal(await f.boolean(4),false);
  await f.db.query("insert into public.pilot_members(user_id,role,enabled) values($1,'participant',false)",[uid(5)]);
  assert.equal(await f.boolean(5),false);
  assert.equal((await f.db.query('select enabled from public.pilot_members where user_id=$1',[uid(5)])).rows[0].enabled,false);
 }finally{await f.db.close();}
});
test('TASK-020 PostgreSQL: 본인 원본/수정본 RLS·기한 후 조회/쓰기 분리·승인 회수·명단 삭제 후 차단',options,async()=>{
 const f=await fixture();try{
  await f.invite(1);await f.invite(2);await f.boolean(1);await f.boolean(2);
  const insert=(owner,session)=>f.asUser(owner,tx=>tx.query(`insert into public.pilot_submissions(owner_id,session_id,schema_version,structure_type,main_idea,primary_text,support_text,relation_text,retell,rechecked)
   values($1,$2,1,'claim','합성 생각','합성 주장','합성 근거','합성 관계','합성 인출',false) returning id`,[uid(owner),uid(session)]));
  const row=(await insert(1,101)).rows[0];
  await assert.rejects(f.asUser(2,tx=>tx.query(`insert into public.pilot_revisions(owner_id,submission_id,request_id,main_idea,primary_text,support_text,relation_text,retell)
   values($1,$2,$3,'합성','합성','합성','합성','합성')`,[uid(2),row.id,uid(201)])));
  assert.equal((await f.asUser(2,tx=>tx.query('select * from public.pilot_submissions where id=$1',[row.id]))).rows.length,0);
  await f.db.exec("update pilot_private.cohorts set expires_at=now()-interval '1 minute'");
  assert.equal(await f.training(1),false);assert.equal(await f.active(1),true);
  assert.equal(await f.boolean(1),true,'기간이 끝난 기존 회원은 신규 승인 없이 기록 조회 로그인 가능');
  assert.equal((await f.asUser(1,tx=>tx.query('select id from public.pilot_submissions'))).rows.length,1);
  await assert.rejects(insert(1,102),error=>error.code==='42501');
  await f.db.query('update pilot_private.google_invites set enabled=false where user_id=$1',[uid(1)]);
  assert.equal(await f.active(1),false);assert.equal(await f.boolean(1),false);
  assert.equal((await f.asUser(1,tx=>tx.query('select id from public.pilot_submissions'))).rows.length,0);
  await f.db.query('delete from pilot_private.google_invites where user_id=$1',[uid(2)]);
  assert.equal(await f.active(2),false,'삭제한 Google 명단을 legacy 승인으로 되돌리지 않음');
  await f.db.query("insert into public.pilot_members(user_id,role,enabled) values($1,'operator',true)",[uid(18)]);
  assert.equal(await f.active(18),true,'기존 본인 비밀번호 시험의 멤버십 유지');
 }finally{await f.db.close();}
});
