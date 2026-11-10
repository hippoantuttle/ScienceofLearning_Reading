import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalPilotWorker} from '../server/ai/pilot-local-worker.mjs';
const origin='chrome-extension://test';
const env={ALLOWED_ORIGIN:origin,SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public',DEEPSEEK_API_KEY:'fake',PILOT_AI_ENABLED:'true',PILOT_USER_DAILY_LIMIT:'1',PILOT_GLOBAL_DAILY_LIMIT:'1'};
const userId='11111111-1111-4111-8111-111111111111';
const worker=createLocalPilotWorker({
 fetchImpl:async(url,init)=>url.endsWith('/auth/v1/user')?(init.headers.Authorization==='Bearer good'?Response.json({id:userId}):new Response(null,{status:401})):Response.json(true),
 providerFetch:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({terms:[],background:[],structureType:'unspecified'})}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}})
});
const call=(host,token)=>worker.fetch(new Request(`${host}/recommend`,{method:'POST',headers:{origin,...(token?{authorization:`Bearer ${token}`}:{})},body:'{}'}),env);
test('로컬은 기존 사용자·전체 한도를 초과해도 요청하며 인증은 유지한다',async()=>{
 assert.equal((await call('http://127.0.0.1:8787',null)).status,401);
 assert.equal((await call('http://127.0.0.1:8787','invalid')).status,401);
 assert.equal((await call('http://127.0.0.1:8787','good')).status,200);
 assert.equal((await call('http://127.0.0.1:8787','good')).status,200);
});
test('로컬 전용 Worker는 원격 주소 요청을 처리하지 않는다',async()=>{
 assert.equal((await call('https://example.workers.dev','good')).status,403);
});
