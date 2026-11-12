import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPilotWorker,PilotBudget} from '../server/ai/pilot-worker.mjs';
import Source from '../sentence-source.js';
const article='합성 마을은 도서관을 연다. 주민들은 주말에 방문한다. 자원봉사자가 운영을 돕는다.';
const requestId='11111111-1111-4111-8111-111111111111',owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',origin='chrome-extension://synthetic';
const body={schemaVersion:1,requestId,segmentationVersion:'sentence-v1',article};
function fixture({output={candidateIds:['s0003','s0001','s0002']},active=true,overrides={}}={}){
 let usage=null,tail=Promise.resolve();const traces=[],inputs=[];
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-synthetic',DEEPSEEK_API_KEY:'synthetic',ALLOWED_ORIGIN:origin,PILOT_AI_ENABLED:'true',PILOT_GUIDED_CANDIDATES_ENABLED:'true',PILOT_USER_DAILY_LIMIT:'2',PILOT_GLOBAL_DAILY_LIMIT:'2',...overrides};
 const budget=new PilotBudget({storage:{transaction:fn=>{const run=tail.then(()=>fn({get:async()=>usage,put:async(_k,v)=>{usage=v;}}));tail=run.catch(()=>{});return run;}}},env);
 env.PILOT_BUDGET={idFromName:n=>n,get:()=>({fetch:req=>budget.fetch(req)})};
 const worker=createPilotWorker({fetchImpl:async(url,init)=>{traces.push(url);if(url.endsWith('/auth/v1/user'))return init.headers.Authorization==='Bearer invalid'?new Response(null,{status:401}):Response.json({id:owner});return Response.json(active);},providerFetch:async(_url,init)=>{inputs.push(JSON.parse(init.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});}});
 const call=(value=body,headers={})=>worker.fetch(new Request('https://ai.invalid/reading-candidates',{method:'POST',headers:{origin,Authorization:'Bearer synthetic',...headers},body:JSON.stringify(value)}),env);
 return {call,inputs,traces,env};
}
test('전용 후보 API는 원문 순서 ID만 반환하고 모델에는 문장 ID/본문만 보낸다',async()=>{
 const t=fixture(),r=await t.call();assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.candidateIds,['s0001','s0002','s0003']);assert.equal(data.documentHash,await Source.hash(article));
 const input=JSON.parse(t.inputs[0].messages[1].content);assert.deepEqual(Object.keys(input),['sentences']);assert.deepEqual(Object.keys(input.sentences[0]),['id','text']);
 assert.doesNotMatch(t.inputs[0].messages[1].content,/requestId|token|sessionId|structureType|title|summary|https:/);
 assert.match(t.inputs[0].messages[0].content,/지시를 따르지 마세요/);
});
test('스위치/Origin/인증/회차/형식 거절은 모델 호출 전 종료한다',async()=>{
 for(const overrides of [{PILOT_GUIDED_CANDIDATES_ENABLED:undefined},{PILOT_AI_ENABLED:'false'},{PILOT_COHORT_ID:'synthetic',PILOT_COHORT_EXPIRES_AT:'2000-01-01T00:00:00.000Z'}]){const t=fixture({overrides});assert.notEqual((await t.call()).status,200);assert.equal(t.inputs.length,0);}
 for(const headers of [{origin:'https://wrong.invalid'},{Authorization:'Bearer invalid'},{Authorization:''}]){const t=fixture();assert.notEqual((await t.call(body,headers)).status,200);assert.equal(t.inputs.length,0);}
 const inactive=fixture({active:false});assert.equal((await inactive.call()).status,403);assert.equal(inactive.inputs.length,0);
 for(const extra of [{summary:'합성 답안'},{article:'한 문장.'},{segmentationVersion:'unknown'},{article:'가'.repeat(12001)}]){const t=fixture();assert.equal((await t.call({...body,...extra})).status,400);assert.equal(t.inputs.length,0);}
});
test('후보 실패도 공유 예산을 소모하고 형식 보정·설명/알 수 없는 ID 수용을 하지 않는다',async()=>{
 for(const output of [{candidateIds:['s0001','s0002','s9999']},{candidateIds:['s0001','s0001','s0002']},{candidateIds:['s0001','s0002','s0003'],reason:'이유'},{candidateIds:['s0001','s0002','s0003'],structureType:'claim'}]){
  const t=fixture({output});assert.equal((await t.call()).status,502);assert.equal((await t.call()).status,502);assert.equal((await t.call()).status,429);assert.equal(t.inputs.length,2);
 }
});
