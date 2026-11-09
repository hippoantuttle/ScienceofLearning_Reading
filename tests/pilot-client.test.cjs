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
test('서버 오류 코드는 안전한 문구로 바뀌고 알 수 없는 코드는 상태 코드 기준 문구를 쓴다',async()=>{
 const body=(status,error)=>async()=>({ok:false,status,json:async()=>({error})});
 for(const [status,code,re] of [[503,'auth_unreachable',/로그인 확인/],[503,'budget_unavailable',/사용량/],[503,'disabled',/꺼져/],[503,'configuration',/설정/],[502,'provider',/공급자/],[403,'forbidden',/허용하지/],[403,'inactive',/사용할 수 없는/],[401,'unauthorized',/다시 로그인/],[429,'limit',/한도/]])
  await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:body(status,code)}),re);
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:body(503,'<script>x</script>')}),/요청이 실패/);
 await assert.rejects(requestPilot('t',URL_OK,{fetchImpl:async()=>({ok:false,status:503,json:async()=>{throw new Error('bad')}})}),/요청이 실패/);
 const {pilotMessages}=require('../ai-client.js');assert.ok(pilotMessages.includes('AI 추천 사용량 확인에 실패했습니다.'));
});
