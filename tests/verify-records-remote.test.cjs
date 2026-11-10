'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {run}=require('../scripts/verify-records-remote.cjs');
const env={SUPABASE_URL:'https://mxhlxenfboiaywyhgyqs.supabase.co',SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-admin',...Object.fromEntries(['A','B','C'].flatMap(name=>[['SUPABASE_TEST_EMAIL_'+name,name+'@example.invalid'],['SUPABASE_TEST_PASSWORD_'+name,'synthetic-password']]))};
function fixture(cleanupOk=true){
  const calls=[];
  return {calls,fetchImpl:async(raw,options)=>{
    const url=new URL(raw);calls.push({url,options});
    if(url.pathname==='/auth/v1/token'){
      const name=JSON.parse(options.body).email[0];return Response.json({access_token:name,user:{id:name}});
    }
    if(url.pathname.endsWith('is_active_pilot_member'))return Response.json(options.headers.Authorization!=='Bearer C');
    if(url.searchParams.get('capabilities')==='1')return Response.json({recordsApiVersion:1,ready:true});
    if(url.pathname==='/submissions/records')return Response.json({items:[],nextCursor:null});
    // Simulate a response failure after the first attempted write.
    if(url.pathname==='/submissions')return Response.json({error:'synthetic'},{status:503});
    assert.equal(url.pathname,'/rest/v1/pilot_submissions');
    if(options.method==='DELETE')return new Response(null,{status:cleanupOk?204:503});
    return Response.json([]);
  }};
}
test('원격 검증은 대상 프로젝트가 다르면 네트워크 전에 거절한다',async()=>{
  let calls=0;await assert.rejects(run({...env,SUPABASE_URL:'https://other.invalid'},async()=>{calls++;}),/테스트 설정 오류/);assert.equal(calls,0);
});
test('저장 응답 실패 뒤에도 시도한 합성 소유자·무작위 세션만 삭제하고 재조회한다',async()=>{
  const f=fixture();await assert.rejects(run(env,f.fetchImpl),error=>error.verificationCode==='original_save_failed');
  const deletion=f.calls.filter(c=>c.options.method==='DELETE');assert.equal(deletion.length,1);
  const query=deletion[0].url.searchParams;assert.equal(query.get('owner_id'),'eq.A');assert.match(query.get('session_id'),/^eq\.[a-f0-9-]{36}$/);
  const write=f.calls.find(c=>c.url.pathname==='/submissions');assert.equal(query.get('session_id'),'eq.'+JSON.parse(write.options.body).sessionId);
  assert.equal(f.calls.at(-1).url.search,deletion[0].url.search);assert.equal(f.calls.at(-1).options.headers.apikey,'synthetic-admin');
});
test('합성 행 정리가 실패하면 검증 성공으로 처리하지 않고 명시적으로 실패한다',async()=>{
  const f=fixture(false);await assert.rejects(run(env,f.fetchImpl),error=>error.verificationCode==='cleanup_unconfirmed');
});
