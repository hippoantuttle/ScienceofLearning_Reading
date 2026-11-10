import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHandler} from '../server/submissions/worker.mjs';
const require=createRequire(import.meta.url);
const {create:client,createSaver}=require('../record-client.js');
let PGlite;
try { ({PGlite}=require('../tmp/task015/node_modules/@electric-sql/pglite')); } catch {}
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const answers={mainIdea:'합성 중심 생각',primary:'합성 주장',support:'합성 근거',relation:'합성 관계',retell:'합성 Retell'};
const input=n=>({schemaVersion:1,sessionId:sid(n),structureType:'claim',...answers,reflection:'합성 감상',newWords:'',interests:'',rechecked:false});
const env={SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'public-fixture',ALLOWED_ORIGIN:'chrome-extension://abcdefghijklmnopabcdefghijklmnop'};
async function fixture(){
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; grant usage on schema auth,public to authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    insert into auth.users values ('${A}'),('${B}'),('${C}');`);
  await db.exec(readFileSync(new URL('../server/migrations/001-pilot-draft.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../server/migrations/20261110045614_revision_storage.sql',import.meta.url),'utf8'));
  await db.exec(`insert into pilot_members values ('${A}','participant',true),('${B}','team',true),('${C}','participant',false);`);
  async function asUser(owner,fn){
    return db.transaction(async tx=>{
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
      return fn(tx);
    });
  }
  const trace=[];
  const upstream=async(raw,opt)=>{
    const url=new URL(raw),owner={A,B,C}[opt.headers.Authorization?.replace('Bearer ','')];trace.push({path:url.pathname,owner,method:opt.method});
    if(url.pathname==='/auth/v1/user')return owner?Response.json({id:owner}):new Response(null,{status:401});
    if(url.pathname.endsWith('/rpc/is_active_pilot_member'))return Response.json((await asUser(owner,tx=>tx.query('select public.is_active_pilot_member() as active'))).rows[0].active);
    const table=url.pathname.split('/').at(-1);
    assert.ok(['pilot_submissions','pilot_revisions'].includes(table));
    try{
      const result=await asUser(owner,async tx=>{
        if(opt.method==='POST'){
          const row=JSON.parse(opt.body),keys=Object.keys(row);assert.ok(keys.every(k=>/^[a-z_]+$/.test(k)));
          await tx.query('insert into '+table+' ('+keys.join(',')+') values ('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(row));
          return null;
        }
        let sql='select '+(url.searchParams.get('select')?.includes('pilot_revisions')?"s.id,s.saved_at,s.article_title,s.source_url,(select coalesce(json_agg(x),'[]') from (select id from pilot_revisions r where r.submission_id=s.id limit 1) x) as pilot_revisions":'*')+' from '+table+' s where true';
        const params=[];
        for(const key of ['owner_id','id','session_id','submission_id','request_id']){
          const value=url.searchParams.get(key);if(!value)continue;assert.ok(value.startsWith('eq.'));params.push(value.slice(3));sql+=' and s.'+key+'=$'+params.length;
        }
        const before=url.searchParams.get('or');
        if(before){const match=before.match(/^\(saved_at\.lt\.(.+),and\(saved_at\.eq\.(.+),id\.lt\.([a-f0-9-]+)\)\)$/);assert.ok(match);assert.equal(match[1],match[2]);params.push(match[1],match[3]);sql+=' and (s.saved_at,s.id)<($'+(params.length-1)+'::timestamptz,$'+params.length+'::uuid)';}
        if(url.searchParams.has('order'))sql+=' order by saved_at desc,id desc';
        params.push(Number(url.searchParams.get('limit')||100));sql+=' limit $'+params.length;
        const rows=(await tx.query(sql,params)).rows;
        // PostgREST의 timestamptz JSON 표현을 흉내 낸다. SQL 실행·RLS 판정은 실제 PostgreSQL이다.
        return rows.map(row=>({...row,saved_at:row.saved_at instanceof Date?row.saved_at.toISOString():row.saved_at}));
      });
      return result===null?new Response(null,{status:201}):Response.json(result);
    }catch(error){return Response.json({error:'fixture_db'},{status:error.code==='23505'||error.code==='23503'?409:error.code==='42501'?403:400});}
  };
  const handler=createHandler(upstream);
  async function request(path='',{method='GET',body,token='A',origin=env.ALLOWED_ORIGIN,key}={}){
    return handler(new Request('https://worker.invalid/submissions'+path,{method,headers:{...(origin?{Origin:origin}:{}),Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json','Idempotency-Key':key||body.requestId||body.sessionId}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  }
  const io=token=>client({endpoint:'https://worker.invalid/submissions',getToken:()=>token,fetchImpl:(url,opt)=>request(url.replace('https://worker.invalid/submissions',''),{method:opt.method,body:opt.body?JSON.parse(opt.body):undefined,token,key:opt.headers['Idempotency-Key']})});
  return {db,asUser,trace,request,io};
}
test('TASK-015 PostgreSQL: 원본 불변·다중 수정·멱등·경합·소유권·삭제·페이지·재로그인', {skip:!PGlite?'로컬 PGlite 설치 필요: TASK-015 결과 문서 참조':false}, async t=>{
  const f=await fixture();t.after(()=>f.db.close());
  const saved=await f.request('',{method:'POST',body:input(1)});assert.equal(saved.status,200);const original=await saved.json();
  const io=f.io('A'),other=f.io('B'),inactive=f.io('C');
  const detail=await io.detail(original.submissionId);assert.deepEqual(detail.payload,input(1));
  const revision={requestId:sid(2),answers:{...answers,mainIdea:'수정 합성'}};
  const attempts=await Promise.all([io.save(original.submissionId,revision),io.save(original.submissionId,revision)]);
  assert.equal(attempts[0].revision.id,attempts[1].revision.id);
  await assert.rejects(io.save(original.submissionId,{...revision,answers:{...answers,mainIdea:'충돌'}}),error=>error.status===409);
  await io.save(original.submissionId,{...revision,requestId:sid(3)});
  assert.deepEqual((await io.detail(original.submissionId)).payload,input(1));
  assert.equal((await io.revisions(original.submissionId)).items.length,2);
  const reopened=f.io('A');assert.equal((await reopened.detail(original.submissionId)).submissionId,original.submissionId);
  assert.equal((await reopened.readRevision(original.submissionId,sid(2))).revision.answers.mainIdea,'수정 합성');
  assert.equal((await io.list()).items[0].hasRevisions,true);
  assert.equal((await other.list()).items.length,0);
  for(const access of [()=>other.detail(original.submissionId),()=>other.save(original.submissionId,revision),()=>inactive.list(),()=>f.io('bad').list()])await assert.rejects(access);
  const row={owner_id:B,submission_id:original.submissionId,request_id:sid(9),main_idea:'합성',primary_text:'합성',support_text:'합성',relation_text:'합성',retell:'합성'};
  const keys=Object.keys(row),insert='insert into pilot_revisions('+keys.join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+')';
  await assert.rejects(f.asUser(B,tx=>tx.query(insert,Object.values(row))),error=>['42501','23503'].includes(error.code));
  await assert.rejects(f.db.query(insert,Object.values(row)),error=>error.code==='23503');
  await assert.rejects(f.asUser(C,tx=>tx.query(insert,Object.values({...row,owner_id:C}))));
  assert.equal((await f.asUser(B,tx=>tx.query('select * from pilot_revisions'))).rows.length,0);
  await assert.rejects(f.asUser(A,tx=>tx.query("update pilot_submissions set main_idea='위조'")),error=>error.code==='42501');
  await assert.rejects(f.asUser(A,tx=>tx.query('update pilot_revisions set owner_id=$1',[B])),error=>error.code==='42501');
  await assert.rejects(f.asUser(A,tx=>tx.query('delete from pilot_revisions')),error=>error.code==='42501');
  await assert.rejects(f.db.transaction(async tx=>{await tx.exec('set local role anon');return tx.query('select * from pilot_revisions');}),error=>error.code==='42501');
  await assert.rejects(f.asUser(A,tx=>tx.query('insert into pilot_revisions(id,'+keys.join(',')+') values($1,'+keys.map((_,i)=>'$'+(i+2)).join(',')+')',[sid(90),...Object.values({...row,owner_id:A})])),error=>error.code==='42501');
  await assert.rejects(f.asUser(A,tx=>tx.query('insert into pilot_revisions(saved_at,'+keys.join(',')+') values($1,'+keys.map((_,i)=>'$'+(i+2)).join(',')+')',['2026-01-01T00:00:00Z',...Object.values({...row,owner_id:A})])),error=>error.code==='42501');
  for(let n=10;n<23;n++)assert.equal((await f.request('',{method:'POST',body:input(n)})).status,200);
  const first=await io.list(),second=await io.list(first.nextCursor);
  assert.equal(first.items.length,10);assert.ok(first.nextCursor);assert.equal(second.items.length,4);assert.equal(new Set([...first.items,...second.items].map(x=>x.submissionId)).size,14);
  assert.ok(first.items.every(x=>!('payload' in x)&&!('mainIdea' in x)));
  assert.equal((await f.request('/records?cursor=malformed')).status,400);
  assert.equal((await f.request('/records',{origin:'https://evil.example'})).status,403);
  assert.equal((await f.request('/records/'+original.submissionId+'/revisions',{method:'POST',body:revision,origin:null})).status,403);
  assert.equal((await f.request('/records',{origin:null})).status,200);
  // 오래된 최초본에는 글 정보가 없어도 된다. 신규 선택 정보는 별도 동의 입력만 저장한다.
  assert.equal((await io.detail(original.submissionId)).payload.articleTitle,undefined);
  const metadata={...input(70),articleTitle:'합성 공개 글',sourceUrl:'https://example.com'};
  const withArticle=await f.request('',{method:'POST',body:metadata});assert.equal(withArticle.status,200);
  const metadataId=(await withArticle.json()).submissionId;
  assert.deepEqual((await io.detail(metadataId)).payload,metadata);
  assert.equal((await f.request('',{method:'POST',body:input(70)})).status,409);
  assert.equal((await f.request('',{method:'POST',body:{...metadata,sourceUrl:'https://example.com/story?token=synthetic'}})).status,400);
  for(const source of ['https://user:pw@example.com','https://example.com/path','https://example.com?email=synthetic','https://example.com#private','http://localhost','http://127.0.0.1']){
    assert.equal((await f.request('',{method:'POST',body:{...input(71),articleTitle:'합성',sourceUrl:source}})).status,400);
  }
  for(let n=30;n<41;n++)await io.save(original.submissionId,{requestId:sid(n),answers});
  const versions=await io.revisions(original.submissionId),older=await io.revisions(original.submissionId,versions.nextCursor);
  assert.equal(versions.items.length,10);assert.equal(older.items.length,3);assert.equal(new Set([...versions.items,...older.items].map(x=>x.id)).size,13);
  // 유효한 기존 토큰도 회원 비활성화 뒤에는 사용할 수 없다.
  await f.db.query('update pilot_members set enabled=false where user_id=$1',[A]);
  await assert.rejects(io.list(),error=>error.status===403);
  assert.equal((await f.asUser(A,tx=>tx.query('select * from pilot_revisions'))).rows.length,0);
  await f.db.query('update pilot_members set enabled=true where user_id=$1',[A]);
  // 응답만 유실되어도 DB에 저장된 동일 버전을 재확인한다.
  let lose=true;const saver=createSaver({recordId:original.submissionId,newId:()=>sid(50),io:{...io,save:async(...args)=>{const result=await io.save(...args);if(lose){lose=false;throw Error('합성 응답 유실');}return result;}}});
  await assert.rejects(saver.save(answers));assert.equal(saver.hasPending(),true);
  assert.equal((await saver.save({...answers,mainIdea:'실패 후 편집'})).answers.mainIdea,answers.mainIdea);
  await f.db.query('delete from pilot_submissions where id=$1',[original.submissionId]);
  assert.equal((await f.db.query('select * from pilot_revisions where submission_id=$1',[original.submissionId])).rows.length,0);
  await assert.rejects(io.detail(original.submissionId),error=>error.status===404);
  await assert.rejects(io.readRevision(original.submissionId,sid(2)),error=>error.status===404);
  await assert.rejects(io.save(original.submissionId,revision),error=>error.status===404);
  await f.db.query('delete from pilot_submissions where id=$1',[metadataId]);
  await assert.rejects(io.detail(metadataId),error=>error.status===404);
  assert.equal((await io.list()).items.some(x=>x.submissionId===metadataId),false);
});
