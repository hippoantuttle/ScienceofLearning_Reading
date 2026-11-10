'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {create}=require('../google-auth.js');
const id='jenapgoakhnmlmjcdnkfakkkgjobbfbb',uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,email:'reader@example.invalid',email_confirmed_at:'2026-11-10T00:00:00Z',identities:[{provider:'google',identity_data:{email:'reader@example.invalid',email_verified:true}}]};
function setup({changeCallback,changeUser,launchError,fetchError,clock,hold}={}){
 const calls=[],launches=[];let issued;
 const identity={getRedirectURL:path=>`https://${id}.chromiumapp.org/${path}`,launchWebAuthFlow:async options=>{
  launches.push(options);if(hold)await hold;if(launchError)throw Error('sensitive-browser-message');
  const authorize=new URL(options.url),callback=new URL(authorize.searchParams.get('redirect_to'));
  callback.searchParams.set('code','synthetic-one-use-code');issued=authorize;
  if(changeCallback)changeCallback(callback);return callback.href;
 }};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});if(fetchError)return Response.json({sensitive:'not displayed'},{status:503});
  if(url.endsWith('/token?grant_type=pkce'))return Response.json({access_token:'synthetic-session-token',refresh_token:'discard-me',provider_token:'discard-me-too',user:{id:uid}});
  assert.equal(url,'https://synthetic.supabase.co/auth/v1/user');
  return Response.json(changeUser?changeUser(structuredClone(user)):user);
 };
 const login=create({baseUrl:'https://synthetic.supabase.co',publicKey:'sb_publishable_synthetic',identity,extensionId:id,fetchImpl,cryptoImpl:crypto.webcrypto,...(clock?{now:clock}:{})});
 return {login,calls,launches,issued:()=>issued};
}
test('Google PKCE는 정확한 복귀/랜덤 검증값·최소 로그인 범위를 사용하고 확인된 Supabase 사용자만 반환한다',async()=>{
 const t=setup(),result=await t.login(),url=t.issued();
 assert.deepEqual(result,{accessToken:'synthetic-session-token',userId:uid,email:user.email});
 assert.equal(url.origin,'https://synthetic.supabase.co');assert.equal(url.pathname,'/auth/v1/authorize');
 assert.equal(url.searchParams.get('provider'),'google');assert.equal(url.searchParams.get('scopes'),'openid email profile');
 assert.equal(url.searchParams.get('code_challenge_method'),'s256');assert.equal(t.launches[0].interactive,true);
 const body=JSON.parse(t.calls[0].options.body);
 assert.equal(body.auth_code,'synthetic-one-use-code');assert.match(body.code_verifier,/^[\w-]{43}$/);
 assert.equal(url.searchParams.get('code_challenge'),crypto.createHash('sha256').update(body.code_verifier).digest('base64url'));
 assert.ok(!url.href.includes(body.code_verifier));assert.ok(!url.href.includes(user.email));
 assert.equal(t.calls[1].options.headers.Authorization,'Bearer synthetic-session-token');
 assert.equal(JSON.stringify(result).includes('discard-me'),false);
 for(const {options} of t.calls){assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.ok(options.signal);}
});
test('Google 취소·만료·변조 복귀는 토큰 교환 전에 차단하고 오류에 URL/브라우저 내부 메시지를 내보내지 않는다',async t=>{
 const variants=[{launchError:true},{changeCallback:u=>{u.hostname='evil.example.org';}},{changeCallback:u=>{u.searchParams.set('flow','wrong');}},{changeCallback:u=>{u.searchParams.append('code','duplicate');}},{changeCallback:u=>{u.hash='access_token=synthetic';}},{changeCallback:u=>{u.searchParams.set('error','denied');}}];
 for(let i=0;i<variants.length;i++)await t.test(String(i),async()=>{
  const f=setup(variants[i]);await assert.rejects(f.login(),e=>!e.message.includes('sensitive')&&!e.message.includes('https:'));assert.equal(f.calls.length,0);
 });
 let time=0;const expired=setup({clock:()=>time,changeCallback:()=>{time=300001;}});
 await assert.rejects(expired.login(),/종료/);assert.equal(expired.calls.length,0);
});
test('Google 미확인/다른 주체·이메일과 서버 실패는 로그인 완료로 처리하지 않는다',async()=>{
 for(const changeUser of [u=>({...u,id:'22222222-2222-4222-8222-222222222222'}),u=>({...u,email:'other@example.invalid'}),u=>({...u,email_confirmed_at:null}),u=>({...u,identities:[]}),u=>{u.identities[0].identity_data.email_verified=false;return u;}]){
  await assert.rejects(setup({changeUser}).login(),/Google 계정/);
 }
 await assert.rejects(setup({fetchError:true}).login(),e=>!e.message.includes('sensitive'));
});
test('Google 중복 실행과 취소 후 늦은 복귀는 세션을 적용하지 않는다',async()=>{
 let finish;const hold=new Promise(resolve=>{finish=resolve;}),t=setup({hold});
 const first=t.login();await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(t.login(),/진행 중/);t.login.cancel();finish();await assert.rejects(first,/종료/);assert.equal(t.calls.length,0);
});
