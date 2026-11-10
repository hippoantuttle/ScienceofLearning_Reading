import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHandler} from '../server/submissions/worker.mjs';
const require=createRequire(import.meta.url),client=require('../record-client.js');
const id='11111111-1111-4111-8111-111111111111';
const answers={mainIdea:'합성',primary:'합성',support:'합성',relation:'합성',retell:'합성'};
const env={SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'public-fixture',ALLOWED_ORIGIN:'chrome-extension://abcdefghijklmnopabcdefghijklmnop'};
function capability(){
 return new Request('https://worker.invalid/submissions/records?capabilities=1',{headers:{Authorization:'Bearer synthetic',Origin:env.ALLOWED_ORIGIN}});
}
test('구형 Worker의 400 invalid는 미지원 API로 구분하고 답안 POST를 차단한다',async()=>{
 const requests=[];
 const io=client.create({endpoint:'https://worker.invalid/submissions',getToken:()=> 'synthetic',fetchImpl:async(url,options)=>{requests.push({url,method:options.method,body:options.body});return Response.json({error:'invalid'},{status:400});}});
 const saver=client.createSaver({io,recordId:id,newId:()=>id});
 await assert.rejects(saver.save(answers),error=>error.code==='records_api_unavailable'&&/서버 업데이트/.test(error.message));
 assert.equal(saver.hasPending(),true);
 await assert.rejects(saver.save(answers),error=>error.code==='records_api_unavailable');
 assert.equal(requests.length,2);
 assert.ok(requests.every(r=>r.method==='GET'&&!r.body&&r.url.endsWith('?capabilities=1')));
});
test('Worker 준비 검사는 인증 후 limit=0으로만 스키마를 확인한다',async()=>{
 const probes=[];
 const upstream=async(url,opt)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'synthetic'});
  if(url.endsWith('/rpc/is_active_pilot_member'))return Response.json(true);
  const target=new URL(url);probes.push({limit:target.searchParams.get('limit'),method:opt.method});
  return Response.json([]);
 };
 const response=await createHandler(upstream)(capability(),env);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{recordsApiVersion:1,ready:true});
 assert.equal(probes.length,2);assert.ok(probes.every(p=>p.limit==='0'&&p.method==='GET'));
 const denied=await createHandler(async()=>new Response(null,{status:401}))(capability(),env);
 assert.equal(denied.status,401);
});
test('수정본 테이블·열·관계가 없으면 안전한 schema 오류로 구분한다',async()=>{
 for(const code of ['42P01','42703','PGRST200','PGRST204','PGRST205']){
  const handler=createHandler(async url=>{
   if(url.endsWith('/auth/v1/user'))return Response.json({id:'synthetic'});
   if(url.endsWith('/rpc/is_active_pilot_member'))return Response.json(true);
   return Response.json({code,message:'비공개 오류 세부 내용은 노출하지 않는다'},{status:400});
  });
  const result=await handler(capability(),env);assert.equal(result.status,503);
  assert.deepEqual(await result.json(),{error:'records_schema_missing'});
  let posts=0;
  const io=client.create({endpoint:'https://worker.invalid/submissions',getToken:()=> 'synthetic',fetchImpl:async(_url,options)=>{if(options.method==='POST')posts++;return handler(capability(),env);}});
  await assert.rejects(io.save(id,{requestId:id,answers}),error=>error.code==='records_schema_missing'&&!error.message.includes('비공개'));
  assert.equal(posts,0);
 }
});
test('서버 준비 후 동일 요청을 다시 저장하며 400 입력 거절과 네트워크 실패를 구분한다',async()=>{
 let ready=false,payload,requestCount=0;
 const io=client.create({endpoint:'https://worker.invalid/submissions',getToken:()=> 'synthetic',fetchImpl:async(url,opt)=>{
  requestCount++;
  if(String(url).endsWith('?capabilities=1'))return ready?Response.json({recordsApiVersion:1,ready:true}):Response.json({error:'invalid'},{status:400});
  if(opt.method==='POST')payload=JSON.parse(opt.body);
  return Response.json({status:'saved',revision:{id,requestId:id,savedAt:'2026-11-10T00:00:00Z',answers:payload.answers}});
 }});
 const saver=client.createSaver({io,recordId:id,newId:()=>id});
 await assert.rejects(saver.save(answers));assert.equal(requestCount,1);
 ready=true;await saver.save({...answers,mainIdea:'실패 후 편집'});
 assert.equal(payload.requestId,id);assert.equal(payload.answers.mainIdea,'합성');assert.equal(saver.hasPending(),false);
 const badRequest=client.create({endpoint:'https://worker.invalid/submissions',getToken:()=> 'synthetic',fetchImpl:async url=>String(url).endsWith('?capabilities=1')?Response.json({recordsApiVersion:1,ready:true}):Response.json({error:'invalid'},{status:400})});
 await assert.rejects(badRequest.save(id,{requestId:id,answers}),error=>error.status===400&&/요청 형식/.test(error.message)&&!error.message.includes('연결하지'));
});
