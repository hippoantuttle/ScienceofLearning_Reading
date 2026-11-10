'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createFlow}=require('../submission-flow.js');
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const session={accessToken:'synthetic-google-token',userId:uid,email:'reader@example.invalid'};
const input={structureType:'claim',mainIdea:'합성 생각',primary:'합성 주장',support:'합성 근거',relation:'합성 관계',retell:'합성 인출',reflection:'',newWords:'',interests:'',rechecked:false};
test('사전 등록 승인·현재 멤버십이 모두 확인된 Google 세션만 로그인하고 미승인은 토큰을 채택하지 않는다',async()=>{
 let member=true,claims=0;
 const make=()=>createFlow({login:async()=>'',adapter:()=>({checkMember:async()=>member}),newId:()=>''});
 const flow=make();await assert.rejects(flow.signInGoogle(session,async()=>false),/사전 등록/);assert.equal(flow.getToken(),null);
 member=false;await assert.rejects(flow.signInGoogle(session,async()=>true),/사전 등록/);assert.equal(flow.getToken(),null);
 member=true;await flow.signInGoogle(session,async token=>{claims++;assert.equal(token,session.accessToken);return true;});
 assert.equal(claims,1);assert.equal(flow.getIdentity(),session.email);assert.equal(flow.getAccountId(),uid);assert.equal(flow.getAuthKind(),'google');
});
test('Google 만료 재시도는 같은 UID·이메일·로그인 방식으로만 허용하며 새 시도에도 계정 결속을 이어간다',async()=>{
 let claims=0;const claim=async()=>{claims++;return true;};
 const make=()=>createFlow({login:async()=> 'password-token',adapter:()=>({checkMember:async()=>true,save:async()=>{throw Error('synthetic offline');}}),newId:()=> 'synthetic-session'});
 const flow=make();await flow.signInGoogle(session,claim);await assert.rejects(flow.submit(input));flow.expire();
 const before=claims;
 await assert.rejects(flow.signInGoogle({...session,userId:other},claim),/같은 Google/);
 await assert.rejects(flow.signInGoogle({...session,email:'other@example.invalid'},claim),/같은 Google/);
 await assert.rejects(flow.signIn(session.email,'synthetic'),/같은 계정/);assert.equal(claims,before);
 await flow.signInGoogle({...session,accessToken:'renewed-synthetic'},claim);
 assert.equal(flow.getToken(),'renewed-synthetic');
 const next=make();next.adopt(flow.getToken(),flow.getIdentity(),flow.getAccountId(),flow.getAuthKind());
 await assert.rejects(next.submit(input));next.expire();await assert.rejects(next.signInGoogle({...session,userId:other},claim),/같은 Google/);
});
