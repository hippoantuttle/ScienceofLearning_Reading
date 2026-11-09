import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validate } = require('../ai-client.js');
import worker, { Budget, callProvider, createTestWorker, createExperimentWorker } from '../server/ai/worker.mjs';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../server/ai/prompts/pre-reading-v1.mjs';

test('provider client sends only fixed synthetic example and validates JSON', async () => {
  let count = 0;
  const data = await callProvider('fake-key', async (url, options) => {
    count++; assert.equal(url,'https://api.deepseek.com/chat/completions');
    const body=JSON.parse(options.body); assert.equal(body.model,'deepseek-flash'); assert.equal(body.max_tokens,512);
    assert.equal(PROMPT_VERSION,'pre-reading-v1'); assert.equal(body.messages[0].content,SYSTEM_PROMPT); assert.equal(body.messages[0].role,'system'); assert.equal(body.messages[1].role,'user');
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({terms:[],background:[],structureType:'unspecified'})}}]});
  });
  assert.equal(count,1); assert.equal(data.structureType,'unspecified');
});

test('provider client rejects malformed or truncated responses', async () => {
  const bad = async () => Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]});
  await assert.rejects(callProvider('fake-key',bad), /invalid response/);
  const extra = async () => Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({terms:[],background:[],structureType:'unspecified',answer:'x'})}}]});
  await assert.rejects(callProvider('fake-key',extra), /invalid recommendation/);
  const empty = async () => Response.json({choices:[{finish_reason:'stop',message:{content:''}}]});
  await assert.rejects(callProvider('fake-key',empty));
});

test('test-only integrated path reserves before simulated provider and returns validated result', async () => {
  let reserved = 0;
  const env = { ACCESS_TOKEN:'fictional', DEEPSEEK_API_KEY:'fake', BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>{reserved++;return new Response(null,{status:200});}})} };
  const subject = createTestWorker(async ()=>{assert.equal(reserved,1);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({terms:[],background:[],structureType:'unspecified'})}}]});});
  const response = await subject.fetch(new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'}),env);
  assert.equal(response.status,200); assert.equal((await response.json()).recommendation.structureType,'unspecified');
});

test('failed provider consumes reservation and retry consumes another', async () => {
  let used=0; const env={ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake',BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>{used++;return new Response(null,{status:200});}})}};
  const subject=createTestWorker(async()=>{throw new Error('offline');});
  for(let i=0;i<2;i++) {const r=await subject.fetch(new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'}),env);assert.equal(r.status,502);}
  assert.equal(used,2);
});

test('provider timeout aborts the transport', async () => {
  await assert.rejects(callProvider('fake', (_url,opts)=>new Promise((_resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('aborted'))))), /aborted/);
});

test('server and panel contract agree on edge case fixtures', async () => {
  const fixtures=[{terms:[],background:[],structureType:'unspecified'}, {terms:[{term:'용어',definition:'뜻'}],background:['배경'],structureType:'cause-effect'}, {terms:[],background:['<script>'],structureType:'unspecified'}, {terms:[],background:[],structureType:'other'}, {terms:[],background:[],structureType:'unspecified',extra:1}, {terms:[{term:'',definition:'뜻'}],background:[],structureType:'unspecified'}];
  for(const fixture of fixtures) {
    const fake=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(fixture)}}]});
    let accepted=true;try{await callProvider('fake',fake);}catch{accepted=false;}
    assert.equal(accepted,validate(fixture));
  }
});

test('format validation alone cannot detect conclusion leakage', async () => {
  const leaked={terms:[],background:['도서관은 주말에 문을 연다.'],structureType:'unspecified'};
  const fake=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(leaked)}}]});
  assert.equal(validate(leaked),true); assert.deepEqual(await callProvider('fake',fake),leaked);
});

test('nonempty payloads are rejected before budget or provider access', async () => {
  let reservations=0, providers=0;
  const env={ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake',BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>{reservations++;return new Response(null,{status:200});}})}};
  const subject=createTestWorker(async()=>{providers++;throw new Error('must not call');});
  for(const body of ['{"articleText":"가상 지시문"}','{"retell":"가상 답변"}','{"unknown":1}','{"":1}','[]','null','{']) {
    const r=await subject.fetch(new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body}),env);
    assert.equal(r.status,400);
  }
  const oversized=await subject.fetch(new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:' '.repeat(1025)}),env);
  assert.equal(oversized.status,413);
  assert.equal(reservations,0);assert.equal(providers,0);
});

test('three calls fit within fifteen minutes and deadline changes do not reset usage', async()=>{
 let value;const storage={transaction:async fn=>fn({get:async()=>value,put:async(_k,v)=>{value=v;}})};
 const budget=new Budget({storage}); const reserve=deadline=>budget.fetch(new Request('https://budget.test/',{method:'POST',headers:{'X-Expires-At':String(deadline)}}));
 assert.equal((await reserve(Date.now()+14*60*1000)).status,200);
 assert.equal((await reserve(Date.now()+13*60*1000)).status,200);
 assert.equal((await reserve(Date.now()+12*60*1000)).status,200);
 assert.equal((await reserve(Date.now()+14*60*1000)).status,429);assert.equal(value.calls,3);
});

test('budget rejects expired and over-fifteen-minute deadlines before saving', async()=>{
 let writes=0;const budget=new Budget({storage:{transaction:async fn=>fn({get:async()=>undefined,put:async()=>{writes++;}})}});
 for(const deadline of [Date.now()-1000,Date.now()+16*60*1000]) {
  const r=await budget.fetch(new Request('https://budget.test/',{method:'POST',headers:{'X-Expires-At':String(deadline)}}));assert.equal(r.status,503);
 }
 assert.equal(writes,0);
});

test('experiment rejects absent or expired deadline before reservation', async()=>{
 let calls=0;const env={EXPERIMENT_ENABLED:'true',ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake',BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>{calls++;return new Response(null,{status:200});}})}};
 const w=createExperimentWorker(async()=>{throw new Error('provider must not be called');});
 const req=()=>new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'});
 for(const d of [undefined,String(Date.now()-1000),String(Date.now()+3600000)]) {env.EXPERIMENT_EXPIRES_AT=d;assert.equal((await w.fetch(req(),env)).status,503);}
 assert.equal(calls,0);
});

test('entry accepts a valid fourteen-minute deadline', async()=>{
 let reserved=0; const env={EXPERIMENT_ENABLED:'true',EXPERIMENT_EXPIRES_AT:String(Date.now()+14*60*1000),ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake',BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>{reserved++;return new Response(null,{status:429});}})}};
 const result=await createExperimentWorker(async()=>{throw new Error('should not call');}).fetch(new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'}),env);
 assert.equal(result.status,429);assert.equal(reserved,1);
});

test('budget preserves usage across recreation and rejects fourth call', async()=>{
 let value={calls:2,reservedMicrodollars:200000}; const storage={transaction:async fn=>fn({get:async()=>value,put:async(_k,v)=>{value=v;}})};
 const reserve=instance=>instance.fetch(new Request('https://budget.test/',{method:'POST',headers:{'X-Expires-At':String(Date.now()+30000)}}));
 assert.equal((await reserve(new Budget({storage}))).status,200);
 assert.equal((await reserve(new Budget({storage}))).status,429);
});

test('provider failure consumes the final available reservation', async()=>{
 let value={calls:2,reservedMicrodollars:200000};const storage={transaction:async fn=>fn({get:async()=>value,put:async(_k,v)=>{value=v;}})};
 const budget=new Budget({storage});let calls=0;
 const env={EXPERIMENT_ENABLED:'true',EXPERIMENT_EXPIRES_AT:String(Date.now()+30000),ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake',BUDGET:{idFromName:()=>1,get:()=>({fetch:req=>budget.fetch(req)})}};
 const w=createExperimentWorker(async()=>{calls++;throw new Error('network');});
 const req=()=>new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'});
 assert.equal((await w.fetch(req(),env)).status,502);assert.equal((await w.fetch(req(),env)).status,429);assert.equal(calls,1);
});

test('provider timeout consumes the final available reservation', {timeout:15000}, async()=>{
 let value={calls:2,reservedMicrodollars:200000};const storage={transaction:async fn=>fn({get:async()=>value,put:async(_k,v)=>{value=v;}})};
 const budget=new Budget({storage});let calls=0;
 const env={EXPERIMENT_ENABLED:'true',EXPERIMENT_EXPIRES_AT:String(Date.now()+30000),ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake',BUDGET:{idFromName:()=>1,get:()=>({fetch:req=>budget.fetch(req)})}};
 const w=createExperimentWorker((_url,opt)=>{calls++;return new Promise((_ok,reject)=>opt.signal.addEventListener('abort',()=>reject(new Error('timeout'))));});
 const req=()=>new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'});
 assert.equal((await w.fetch(req(),env)).status,502);assert.equal((await w.fetch(req(),env)).status,429);assert.equal(calls,1);
});

test('experiment switch gates reservation and returns validated usage', async () => {
 let calls=0; const env={EXPERIMENT_ENABLED:'false',ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake',BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>{calls++;return new Response(null,{status:200});}})}};
 const fake=async()=>Response.json({usage:{prompt_tokens:120,completion_tokens:20,total_tokens:140},choices:[{finish_reason:'stop',message:{content:JSON.stringify({terms:[],background:[],structureType:'unspecified'})}}]});
 env.EXPERIMENT_EXPIRES_AT=String(Date.now()+30000);
 const w=createExperimentWorker(fake); const request=()=>new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'});
 assert.equal((await w.fetch(request(),env)).status,503); assert.equal(calls,0);
 env.EXPERIMENT_ENABLED='true';const r=await w.fetch(request(),env); assert.equal(r.status,200);assert.equal((await r.json()).usage.total_tokens,140);assert.equal(calls,1);
});

test('experiment rejects invalid usage and oversized provider response', async () => {
 const env={EXPERIMENT_ENABLED:'true',ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake',BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>new Response(null,{status:200})})}};
 const req=()=>new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'});
 env.EXPERIMENT_EXPIRES_AT=String(Date.now()+30000);
 const fakeNoUsage=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({terms:[],background:[],structureType:'unspecified'})}}]});
 const fakeHuge=async()=>new Response('x'.repeat(65537));
 assert.equal((await createExperimentWorker(fakeNoUsage).fetch(req(),env)).status,502);
 assert.equal((await createExperimentWorker(fakeHuge).fetch(req(),env)).status,502);
});

test('enabled experiment needs provider secret before reserving', async () => {
  let count=0; const env={EXPERIMENT_ENABLED:'true',ACCESS_TOKEN:'fictional',BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>{count++;return new Response(null,{status:200});}})}};
  const response=await worker.fetch(new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'}),env);
  assert.equal(response.status,503);assert.equal(count,0);
});

test('disabled experiment never consumes budget even with credentials', async () => {
  let count=0; const env={ACCESS_TOKEN:'fictional',DEEPSEEK_API_KEY:'fake', BUDGET:{idFromName:()=>1,get:()=>({fetch:async()=>{count++;return new Response(null,{status:200});}})}};
  const response=await worker.fetch(new Request('https://example.test/recommend',{method:'POST',headers:{Authorization:'Bearer fictional'},body:'{}'}),env);
  assert.equal(response.status,503);assert.equal(count,0);
});

test('worker denies unauthenticated requests before calling provider', async () => {
  let calls=0;
  const response=await worker.fetch(new Request('https://example.test/recommend',{method:'POST',body:'{}'}), { ACCESS_TOKEN:'fictional', DEEPSEEK_API_KEY:'fictional', BUDGET:{idFromName:()=>1,get:()=>({fetch:()=>{calls++;}})} });
  assert.equal(response.status,401); assert.equal(calls,0);
});

test('authenticated request reserves shared budget before provider access', async () => {
  let called = 0;
  const env = { ACCESS_TOKEN:'fictional', DEEPSEEK_API_KEY:'fictional', BUDGET: { idFromName:name=>{assert.equal(name,'experiment');return name;}, get:()=>({fetch:async()=>{called++;return new Response(null,{status:429});}}) } };
  const subject=createTestWorker(async()=>{throw new Error('must not call');});
  const response=await subject.fetch(new Request('https://example.test/recommend',{method:'POST',headers:{Authorization: 'Bearer fictional'},body:'{}'}),env);
  assert.equal(response.status,429); assert.equal(called,1);
});

test('budget atomically reserves calls and maximum cost without refund', async () => {
  let value; const state={storage:{transaction:async fn=>fn({get:async()=>value,put:async(_k,v)=>{value=v;}})}};
  const budget=new Budget(state);
  const r=await budget.fetch(new Request('https://budget.test/',{method:'POST',headers:{'X-Expires-At':String(Date.now()+30000)}}));
  assert.equal(r.status,200); assert.deepEqual(value,{calls:1,reservedMicrodollars:100000});
});

test('persistent budget reserves at most three calls including failures', async () => {
  let value; const state={storage:{transaction:async fn=>fn({get:async()=>value,put:async(_k,v)=>{value=v;}})}};
  const budget=new Budget(state);
  for(let i=0;i<11;i++){const r=await budget.fetch(new Request('https://budget.test/',{method:'POST',headers:{'X-Expires-At':String(Date.now()+30000)}}));assert.equal(r.status,i<3?200:429);}
});
