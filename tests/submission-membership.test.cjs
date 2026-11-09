const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {createMembershipCheck}=require('../submission-http.js');
const cfg={baseUrl:'https://example.supabase.co',publicKey:'public-key'};
test('멤버십 확인은 Supabase RPC를 POST로 호출하고 true만 활성으로 인정한다',async()=>{
 let sent;const ok=v=>async(url,o)=>{sent={url,o};return {ok:true,status:200,json:async()=>v}};
 assert.equal(await createMembershipCheck({...cfg,fetchImpl:ok(true)})('tok'),true);
 assert.equal(sent.url,'https://example.supabase.co/rest/v1/rpc/is_active_pilot_member');
 assert.equal(sent.o.method,'POST');assert.equal(sent.o.body,'{}');assert.equal(sent.o.headers.Authorization,'Bearer tok');assert.equal(sent.o.headers.apikey,'public-key');assert.equal(sent.o.credentials,'omit');
 for(const v of [false,null,'true',1,{}])assert.equal(await createMembershipCheck({...cfg,fetchImpl:ok(v)})('tok'),false);
});
test('401·403은 비활성, 그 밖의 오류는 확인 실패, 잘못된 설정·빈 토큰은 거절한다',async()=>{
 const st=s=>async()=>({ok:false,status:s});
 assert.equal(await createMembershipCheck({...cfg,fetchImpl:st(401)})('tok'),false);
 assert.equal(await createMembershipCheck({...cfg,fetchImpl:st(403)})('tok'),false);
 await assert.rejects(createMembershipCheck({...cfg,fetchImpl:st(500)})('tok'),/확인에 실패/);
 await assert.rejects(createMembershipCheck({...cfg,fetchImpl:async()=>{throw new Error('offline')}})('tok'),/offline/);
 await assert.rejects(createMembershipCheck({...cfg,fetchImpl:st(200)})(''),/로그인/);
 for(const bad of [{baseUrl:'http://x.test',publicKey:'k'},{baseUrl:'https://x.test/path',publicKey:'k'},{baseUrl:'https://x.test',publicKey:'sb_secret_x'},{baseUrl:'https://x.test',publicKey:''}])assert.throws(()=>createMembershipCheck(bad),/설정 오류/);
});
test('패널의 회원 확인은 제출 Worker의 GET이 아니라 Supabase 확인 함수를 사용한다',async()=>{
 const e={};const doc={getElementById(id){return e[id]??={value:'',checked:false,textContent:'',disabled:false,addEventListener(_t,f){this.click=f}}}};
 let adapterFactory,membershipArgs,httpCalls=0;const checked=[];
 const ctx={document:doc,SubmissionConfig:{authUrl:'https://example.supabase.co',publicKey:'public-key',endpoint:'https://worker.example.test/submissions'},SubmissionAuth:{createLogin:()=>async()=> 'tok'},
  SubmissionHttp:{createHttpAdapter:()=>({checkMember:async()=>{httpCalls++;return false},save:async()=>{},read:async()=>{}}),createMembershipCheck:a=>{membershipArgs=a;return async t=>{checked.push(t);return true}}},
  SubmissionFlow:{createFlow:a=>{adapterFactory=a.adapter;return {signIn:async()=>{},hasPending:()=>false}}},crypto:{randomUUID:()=> 'id'}};
 vm.runInNewContext(fs.readFileSync('submission-panel.js','utf8'),ctx);
 await e['submission-login'].click();
 assert.equal(JSON.stringify(membershipArgs),JSON.stringify({baseUrl:'https://example.supabase.co',publicKey:'public-key'}));
 const adapter=adapterFactory('tok');assert.equal(await adapter.checkMember(),true);assert.equal(JSON.stringify(checked),JSON.stringify(['tok']));assert.equal(httpCalls,0);
 assert.equal(typeof adapter.save,'function');assert.equal(typeof adapter.read,'function');
});
