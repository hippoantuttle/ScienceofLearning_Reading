import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cohortSettings} from '../server/pilot-access.mjs';
import {createPilotWorker} from '../server/ai/pilot-worker.mjs';
import {createHandler} from '../server/submissions/worker.mjs';
const origin='chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb';
const uid='11111111-1111-4111-8111-111111111111';
const config={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',ALLOWED_ORIGIN:origin,PILOT_COHORT_ID:'team-five',PILOT_COHORT_EXPIRES_AT:new Date(Date.now()+86400000).toISOString()};
function setup({eligible=true,rpcStatus=200,override={}}={}){
 const calls={provider:0,budget:0,db:0,cohort:0};
 const fetchImpl=async(url,options)=>{
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers.Authorization,'Bearer synthetic-token');
  if(url.endsWith('/auth/v1/user'))return Response.json({id:uid});
  if(url.endsWith('/rpc/is_active_pilot_member'))return Response.json(true);
  if(url.endsWith('/rpc/is_active_pilot_cohort_member')){
   calls.cohort++;assert.deepEqual(JSON.parse(options.body),{p_cohort_id:'team-five'});
   return Response.json(eligible,{status:rpcStatus});
  }
  calls.db++;return Response.json([]);
 };
 const env={...config,PILOT_AI_ENABLED:'true',PILOT_ARTICLE_ENABLED:'true',PILOT_FEEDBACK_ENABLED:'true',DEEPSEEK_API_KEY:'synthetic-only',...override,
  PILOT_BUDGET:{idFromName:name=>{assert.equal(name,'cohort:team-five');return 1;},get:()=>({fetch:async()=>{calls.budget++;return new Response(null,{status:200});}})}};
 const ai=createPilotWorker({fetchImpl,providerFetch:async()=>{calls.provider++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({terms:[],background:[],structureType:'unspecified'})}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});}});
 const request=(path,method='POST',body={})=>new Request('https://worker.example.org'+path,{method,headers:{Origin:origin,Authorization:'Bearer synthetic-token','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 return {calls,env,ai:()=>ai.fetch(request('/recommend'),env),submit:()=>createHandler(fetchImpl)(request('/submissions'),env),read:()=>createHandler(fetchImpl)(request('/submissions?membership=1','GET'),env)};
}
test('회차 누락/형식 오류/만료는 실패로 닫고 정상 회차만 별도 예산과 모델에 접근한다',async()=>{
 assert.deepEqual(cohortSettings({}),{enabled:false});
 assert.equal(cohortSettings({PILOT_COHORT_ID:'team-five'}),null);
 assert.equal(cohortSettings({...config,PILOT_COHORT_ID:'../escape'}),null);
 const good=setup();assert.equal((await good.ai()).status,200);assert.equal(good.calls.cohort,1);assert.equal(good.calls.budget,1);assert.equal(good.calls.provider,1);
 for(const override of [{PILOT_COHORT_EXPIRES_AT:'invalid'},{PILOT_COHORT_EXPIRES_AT:new Date(Date.now()-1000).toISOString()}]){
  const t=setup({override});assert.notEqual((await t.ai()).status,200);assert.notEqual((await t.submit()).status,200);
  assert.equal(t.calls.provider,0);assert.equal(t.calls.budget,0);assert.equal(t.calls.db,0);
 }
});
test('다른 회차/미승인·RPC 장애는 AI 예산·모델·제출 저장 전에 차단한다',async()=>{
 for(const option of [{eligible:false},{eligible:false,rpcStatus:503}]){
  const t=setup(option);assert.equal((await t.ai()).status,option.rpcStatus===503?503:403);
  assert.equal((await t.submit()).status,option.rpcStatus===503?503:403);
  assert.equal(t.calls.budget,0);assert.equal(t.calls.provider,0);assert.equal(t.calls.db,0);
 }
});
test('회차 종료 후 기존 활성 본인 기록 조회 경로는 유지하고 새 제출·AI를 거절한다',async()=>{
 const t=setup({override:{PILOT_COHORT_EXPIRES_AT:new Date(Date.now()-1000).toISOString()}});
 assert.equal((await t.read()).status,200);assert.equal(t.calls.cohort,0);
 assert.equal((await t.submit()).status,403);assert.equal((await t.ai()).status,403);
 assert.equal(t.calls.db,0);assert.equal(t.calls.provider,0);
});
