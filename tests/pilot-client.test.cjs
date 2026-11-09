const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,requestPilot}=require('../ai-client.js');
const good={terms:[],background:[],structureType:'unspecified'};
const URL_OK='https://ai.example.test/recommend';
test('파일럿 클라이언트는 토큰과 빈 본문만 보내고 검증된 추천만 반환한다',async()=>{
 let sent;const fake=async(url,o)=>{sent={url,o};return {ok:true,status:200,json:async()=>({kind:'pilot',recommendation:good,usage:{}})}};
 assert.deepEqual(await requestPilot('tok',URL_OK,{fetchImpl:fake}),good);assert.equal(validate(good),true);
 assert.equal(sent.o.body,'{}');assert.equal(sent.o.headers.Authorization,'Bearer tok');assert.equal(sent.o.credentials,'omit');assert.equal(sent.o.redirect,'error');
});
test('주소 검증: https 또는 loopback의 /recommend만 허용',async()=>{
 const never=async()=>{throw new Error('호출되면 안 됨')};
 for(const bad of ['http://ai.example.test/recommend','https://u:p@ai.example.test/recommend','https://ai.example.test/other','https://ai.example.test/recommend?x=1','not a url'])
  await assert.rejects(requestPilot('tok',bad,{fetchImpl:never}),/주소/);
 await assert.rejects(requestPilot('',URL_OK,{fetchImpl:never}),/로그인/);
 const ok=async()=>({ok:true,status:200,json:async()=>({kind:'pilot',recommendation:good})});
 assert.deepEqual(await requestPilot('tok','http://127.0.0.1:8787/recommend',{fetchImpl:ok}),good);
});
test('상태별 오류 메시지와 잘못된 응답·timeout 처리',async()=>{
 const st=s=>async()=>({ok:false,status:s});
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:st(401)}),/사용할 수 없는/);
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:st(403)}),/사용할 수 없는/);
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:st(429)}),/한도/);
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:st(502)}),/실패/);
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({kind:'mock',recommendation:good})})}),/형식/);
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({kind:'pilot',recommendation:{...good,answer:'x'}})})}),/형식/);
 const slow=(_u,{signal})=>new Promise((_,rej)=>signal.addEventListener('abort',()=>rej(new Error('aborted'))));
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:slow,timeoutMs:20}),/시간/);
});
