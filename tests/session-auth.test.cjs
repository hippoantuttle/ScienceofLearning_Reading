'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {create,install,KEY}=require('../session-auth.js');
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const config={authUrl:'https://synthetic.supabase.co',endpoint:'https://submit.example.org/submissions',publicKey:'sb_publishable_synthetic'};
const baseSession={accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expiresAt:3600000,userId:uid,email:'reader@example.invalid'};
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r}),resolve:v=>resolve(v)}};
function fixture(){
 const data={},events=[],calls=[],accessLevels=[];let time=0,loginSession={...baseSession};
 const controls={refreshStatus:200,userStatus:200,member:true,claim:true,offline:false,refreshHold:null,userHold:null,loginHold:null,refreshUid:uid};
 const storage={setAccessLevel:async value=>{accessLevels.push(value)},get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value)),remove:async key=>{delete data[key]}};
 const login=async()=>{if(controls.loginHold)await controls.loginHold;return {...loginSession}};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});if(controls.offline)throw Error('sensitive-network-message');
  if(url.includes('grant_type=refresh_token')){
   if(controls.refreshHold)await controls.refreshHold;
   return Response.json({access_token:'synthetic-renewed',refresh_token:'synthetic-rotated',expires_in:3600,user:{id:controls.refreshUid}},{status:controls.refreshStatus});
  }
  if(url.endsWith('/auth/v1/user')){
   if(controls.userHold)await controls.userHold;
   return Response.json({id:loginSession.userId,email:loginSession.email,email_confirmed_at:'synthetic-confirmed',identities:[{provider:'google',identity_data:{email:loginSession.email,email_verified:true}}]},{status:controls.userStatus});
  }
  if(url.includes('/logout?scope=local'))return new Response(null,{status:204});
  if(url.endsWith('claim_google_pilot_access'))return Response.json(controls.claim);
  assert.ok(url.endsWith('is_active_pilot_member'));return Response.json(controls.member);
 };
 const make=()=>create({config,storage,login,fetchImpl,now:()=>time,notify:e=>events.push(e)});
 return {data,events,calls,controls,storage,make,accessLevels,setTime:v=>{time=v},setLogin:v=>{loginSession=v}};
}
test('패널/워커 재생성 후 서버 검증으로 복원하며 저장소 초기화 뒤에는 로그인하지 않는다',async()=>{
 const f=fixture();await f.make().signIn();assert.deepEqual(f.accessLevels,[{accessLevel:'TRUSTED_CONTEXTS'}]);
 assert.deepEqual(await f.make().get(),{accessToken:baseSession.accessToken,userId:uid,email:baseSession.email});
 assert.ok(f.calls.filter(c=>c.url.endsWith('/user')).length>=2);
 assert.equal(JSON.stringify(f.data).includes('provider_token'),false);
 delete f.data[KEY];assert.equal(await f.make().get(),null);
 for(const {url} of f.calls)assert.ok(!url.includes('/recommend')&&!url.includes('/records'));
});
test('만료 임박 때 여러 패널이 갱신을 한 번만 하고 회전한 토큰으로 복원한다',async()=>{
 const f=fixture(),manager=f.make();await manager.signIn();f.setTime(3550000);
 const views=await Promise.all(Array.from({length:8},()=>manager.get({expectedUserId:uid})));
 assert.ok(views.every(s=>s.accessToken==='synthetic-renewed'));
 assert.equal(f.calls.filter(c=>c.url.includes('refresh_token')).length,1);
 assert.equal(f.data[KEY].refreshToken,'synthetic-rotated');
 assert.equal(JSON.stringify(views).includes('synthetic-rotated'),false);
 assert.equal((await f.make().get()).accessToken,'synthetic-renewed');
});
test('401로 거절된 토큰은 한 번 교체하고 이미 교체된 토큰을 다시 갱신하지 않는다',async()=>{
 const f=fixture(),manager=f.make();await manager.signIn();
 await manager.get({rejectedToken:baseSession.accessToken});
 await manager.get({rejectedToken:baseSession.accessToken});
 assert.equal(f.calls.filter(c=>c.url.includes('refresh_token')).length,1);
});
test('일시 통신 장애는 세션을 지우지 않으며 갱신 후 후속 검증 장애에도 회전값을 보존한다',async()=>{
 const f=fixture(),manager=f.make();await manager.signIn();f.controls.offline=true;
 await assert.rejects(manager.get(),e=>e.status===503&&!e.message.includes('sensitive'));assert.ok(f.data[KEY]);
 f.controls.offline=false;f.setTime(3550000);f.controls.userStatus=503;
 await assert.rejects(manager.get(),e=>e.status===503);assert.equal(f.data[KEY].refreshToken,'synthetic-rotated');
 f.controls.userStatus=200;assert.equal((await f.make().get()).accessToken,'synthetic-renewed');
});
test('확정 갱신 거절·참여 회수는 세션을 지우지만 기간 이후 조회 가능 회원은 유지한다',async()=>{
 for(const type of ['refresh','membership']){
  const f=fixture(),manager=f.make();await manager.signIn();
  if(type==='refresh'){f.setTime(3550000);f.controls.refreshStatus=400;}else f.controls.member=false;
  await assert.rejects(manager.get(),e=>[401,403].includes(e.status));assert.equal(f.data[KEY],undefined);assert.equal(f.events.at(-1),'cleared');
 }
 const f=fixture(),manager=f.make();await manager.signIn();
 // The existing RPC determines read eligibility after cohort expiration, not a client deadline.
 f.controls.claim=false;assert.ok(await manager.get());
});
test('동시 호출 각자의 UID 결속과 다른 계정 로그인은 검증한다',async()=>{
 const f=fixture(),manager=f.make();await manager.signIn();
 const results=await Promise.allSettled([manager.get({expectedUserId:uid}),manager.get({expectedUserId:other})]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.status,409);
 f.setLogin({...baseSession,userId:other,email:'other@example.invalid'});
 await assert.rejects(manager.signIn({expectedUserId:uid}),e=>e.status===409);
 assert.equal(f.data[KEY].userId,uid);
});
test('승인 실패와 사용자 바뀜·변조된 저장값은 인증으로 채택하지 않는다',async()=>{
 const f=fixture(),manager=f.make();f.controls.claim=false;await assert.rejects(manager.signIn(),e=>e.status===403);assert.equal(f.data[KEY],undefined);
 f.controls.claim=true;await manager.signIn();f.setTime(3550000);f.controls.refreshUid=other;
 await assert.rejects(manager.get(),e=>e.status===401);assert.equal(f.data[KEY],undefined);
 f.data[KEY]={...baseSession,scope:'different-origin'};assert.equal(await f.make().get(),null);assert.equal(f.data[KEY],undefined);
});
test('로그아웃 후 늦은 갱신 응답은 저장소와 로그인 상태를 되살리지 않는다',async()=>{
 const f=fixture(),manager=f.make();await manager.signIn();f.setTime(3550000);
 const hold=deferred();f.controls.refreshHold=hold.promise;
 const request=manager.get();const rejected=assert.rejects(request,/종료/);
 while(!f.calls.some(c=>c.url.includes('refresh_token')))await new Promise(r=>setImmediate(r));
 assert.deepEqual(await manager.signOut(),{revoked:true});hold.resolve();await rejected;
 assert.equal(f.data[KEY],undefined);assert.equal(await f.make().get(),null);
 assert.equal(f.calls.filter(c=>c.url.includes('/logout?scope=local')).length,1);
});
test('로그아웃은 늦은 OAuth 로그인과 복원 응답을 무효화한다',async()=>{
 const f=fixture(),manager=f.make(),hold=deferred();f.controls.loginHold=hold.promise;
 const pending=manager.signIn(),rejected=assert.rejects(pending,/종료/);
 await manager.signOut();hold.resolve();await rejected;assert.equal(f.data[KEY],undefined);
 f.controls.loginHold=null;await manager.signIn();
 const verifyHold=deferred();f.controls.userHold=verifyHold.promise;
 const restore=manager.get(),expired=assert.rejects(restore,/종료/);
 await new Promise(r=>setImmediate(r));await manager.signOut();verifyHold.resolve();await expired;assert.equal(f.data[KEY],undefined);
});
test('원격 로그아웃 실패에도 로컬 세션은 삭제하고 회수 미확인을 반환한다',async()=>{
 const f=fixture(),manager=f.make();await manager.signIn();f.controls.offline=true;
 assert.deepEqual(await manager.signOut(),{revoked:false});assert.equal(f.data[KEY],undefined);
});
test('저장소 접근 제한이 실패하면 인증을 제공하지 않는다',async()=>{
 const f=fixture();f.storage.setAccessLevel=async()=>{throw Error('storage denied')};
 await assert.rejects(f.make().signIn());assert.equal(f.data[KEY],undefined);
});
test('content script·다른 확장·임의 페이지 인증 메시지는 거절하고 패널에 refresh token을 보내지 않는다',async()=>{
 const id='abcdefghijklmnopabcdefghijklmnop',f=fixture(),manager=f.make();await manager.signIn();let handler;
 install({chrome:{runtime:{id,onMessage:{addListener:fn=>{handler=fn}}}},manager});
 const send=(sender,action='get')=>new Promise(resolve=>handler({type:'reading-auth',action},sender,resolve));
 for(const sender of [{id,url:'https://example.invalid/'},{id,url:`chrome-extension://${id}/sidepanel.html`,tab:{id:1}},{id:'other',url:`chrome-extension://${id}/sidepanel.html`},{id,url:`chrome-extension://${id}/pdf-viewer.html`}])assert.equal((await send(sender)).ok,false);
 const result=await send({id,url:`chrome-extension://${id}/sidepanel.html`});assert.equal(result.ok,true);assert.equal(JSON.stringify(result).includes('synthetic-refresh'),false);
 assert.equal(f.calls.filter(c=>c.url.includes('/logout')).length,0);
});
