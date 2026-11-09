import {test} from 'node:test';import assert from 'node:assert/strict';import {createHandler} from '../server/submissions/worker.mjs';
const data={schemaVersion:1,sessionId:'11111111-1111-4111-8111-111111111111',structureType:'claim',mainIdea:'가상',primary:'가상',support:'가상',relation:'가상',retell:'가상',reflection:'',newWords:'',interests:'',rechecked:false};
const env={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public-test',ALLOWED_ORIGIN:'chrome-extension://abcdefghijklmnopabcdefghijklmnop'};
function req(body=data,method='POST',token='fixture'){return new Request('https://worker.invalid/submissions',{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',origin:env.ALLOWED_ORIGIN,'idempotency-key':data.sessionId},body:method==='POST'?JSON.stringify(body):undefined});}
test('Worker는 신규 공개 키를 apikey로, 로그인 토큰을 Bearer로 분리한다',async()=>{
 const modern={...env,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};delete modern.SUPABASE_ANON_KEY;let seen;const fake=async(_url,opt)=>{seen=opt.headers;return new Response('',{status:401})};
 assert.equal((await createHandler(fake)(req(),modern)).status,401);assert.equal(seen.apikey,'sb_publishable_test');assert.equal(seen.Authorization,'Bearer fixture');
});
test('인증되더라도 비활성 또는 미등록 사용자는 제출·조회 전에 차단한다',async()=>{
 let databaseTouched=false;const fake=async(url)=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:'inactive-user'});if(url.endsWith('/rest/v1/rpc/is_active_pilot_member'))return Response.json(false);databaseTouched=true;return new Response('',{status:500});};
 assert.equal((await createHandler(fake)(req(),env)).status,403);assert.equal(databaseTouched,false);
});
test('검증된 사용자로만 저장하고 서버 재조회가 일치해야 성공한다',async()=>{
 let stored,owner;const fetchImpl=async(url,opt)=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:'user-a'});if(url.endsWith('/rest/v1/rpc/is_active_pilot_member'))return Response.json(true);if(opt.method==='POST'){stored=JSON.parse(opt.body);owner=stored.owner_id;return new Response('',{status:201});}return Response.json([{...stored,id:'saved-id',saved_at:'2026-11-09T00:00:00Z'}]);};
 const result=await createHandler(fetchImpl)(req(),env);assert.equal(result.status,200);assert.equal(owner,'user-a');assert.equal((await result.json()).status,'saved');
});
test('사용자 위조·유효하지 않은 토큰·다른 내용 중복은 거부한다',async()=>{
 let stored;const fetchImpl=async(url,opt)=>{if(url.endsWith('/auth/v1/user'))return opt.headers.Authorization==='Bearer invalid'?new Response('',{status:401}):Response.json({id:'user-a'});if(url.endsWith('/rest/v1/rpc/is_active_pilot_member'))return Response.json(true);if(opt.method==='POST'){if(stored)return new Response('',{status:409});stored=JSON.parse(opt.body);return new Response('',{status:201});}return Response.json([{...stored,id:'saved-id',saved_at:'2026-11-09T00:00:00Z'}]);};
 const handle=createHandler(fetchImpl);assert.equal((await handle(req({...data,owner_id:'other'}),env)).status,400);assert.equal((await handle(req(data,'POST','invalid'),env)).status,401);
 assert.equal((await handle(req(),env)).status,200);assert.equal((await handle(req(),env)).status,200);assert.equal((await handle(req({...data,mainIdea:'다른 가상'}),env)).status,409);
});
