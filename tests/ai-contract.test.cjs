const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,createGate,requestMock}=require('../ai-client.js');
const good={terms:[{term:'가상 용어',definition:'가상 설명'}],background:['일반 배경 예시입니다.'],structureType:'unspecified'};
test('응답 계약은 초과 필드·태그·제한 초과 및 미지정 유형을 거절한다',()=>{
 assert.equal(validate(good),true);
 assert.equal(validate({...good,conclusion:'답'}),false);
 assert.equal(validate({...good,terms:[{term:'<img>',definition:'설명'}]}),false);
 assert.equal(validate({...good,background:Array(4).fill('예시')}),false);
 assert.equal(validate({...good,structureType:'unknown'}),false);
});
test('로컬 중계는 인증 없는 요청을 거부하고 인증된 모의 요청만 처리한다',async()=>{
 const {createServer}=require('../server/ai/relay.cjs');
 const server=createServer({token:'local-test-only'}); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const address=`http://127.0.0.1:${server.address().port}/recommend`;
  const bad=await fetch(address,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(bad.status,401);
  const content=await fetch(address,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer local-test-only'},body:JSON.stringify({article:'가상 문장'})});assert.equal(content.status,400);
  const invalid=await fetch(address,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer local-test-only'},body:'not-json'});assert.equal(invalid.status,400);
  const large=await fetch(address,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer local-test-only'},body:' '.repeat(1025)});assert.equal(large.status,413);
  const mockData=await requestMock('local-test-only',{fetchImpl:(url,options)=>{assert.equal(url,'http://127.0.0.1:8787/recommend');return fetch(address,options)}});assert.equal(validate(mockData),true);
  const ok=await fetch(address,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer local-test-only'},body:'{}'});assert.equal(ok.status,200);const data=await ok.json();assert.equal(data.kind,'mock');assert.equal(validate(data.recommendation),true);
 } finally {await new Promise(r=>server.close(r));}
});
test('클라이언트는 토큰과 빈 요청만 전송하며 인증 실패를 처리한다',async()=>{
 let sent; const fake=async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({kind:'mock',recommendation:good})}};
 assert.deepEqual(await requestMock('test-token',{fetchImpl:fake}),good);
 assert.equal(sent.url,'http://127.0.0.1:8787/recommend');assert.equal(sent.options.body,'{}');assert.equal(sent.options.headers.Authorization,'Bearer test-token');
 await assert.rejects(requestMock('bad',{fetchImpl:async()=>({ok:false,status:401})}),/인증/);
});
test('클라이언트 timeout은 지연된 요청을 종료한다',async()=>{
 const slow=(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
 await assert.rejects(requestMock('test-token',{fetchImpl:slow,timeoutMs:20}),/시간/);
});
test('모의 서버는 인증된 요청 빈도를 제한한다',async()=>{
 const {createServer}=require('../server/ai/relay.cjs');
 const server=createServer({token:'local-test-only'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const url=`http://127.0.0.1:${server.address().port}/recommend`;
  for(let i=0;i<10;i++) { const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer local-test-only'},body:'{}'});assert.equal(r.status,200); }
  const blocked=await fetch(url,{method:'POST',headers:{Authorization:'Bearer local-test-only'},body:'{}'});assert.equal(blocked.status,429);
 } finally {await new Promise(r=>server.close(r));}
});
test('요청 본문이 중단되면 서버가 timeout으로 연결을 종료한다',async()=>{
 const {createServer}=require('../server/ai/relay.cjs');const http=require('node:http');
 const server=createServer({token:'local-test-only'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const result=await new Promise((resolve,reject)=>{
   const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/recommend',method:'POST',headers:{Authorization:'Bearer local-test-only','Content-Length':'20'}});
   const timer=setTimeout(()=>{req.destroy();reject(new Error('서버 timeout이 동작하지 않음'));},8000);
   req.on('error',err=>{clearTimeout(timer);resolve(err.code)});req.on('response',()=>{clearTimeout(timer);reject(new Error('불완전 요청에 응답함'));});
   req.write('{');
  });
  assert.equal(result,'ECONNRESET');
 } finally {await new Promise(r=>server.close(r));}
});
test('잘못된 모의 응답과 JSON 파싱 실패는 거부한다',async()=>{
 await assert.rejects(requestMock('test',{fetchImpl:async()=>({ok:true,json:async()=>({kind:'mock',recommendation:{...good,structureType:'invalid'}})})}),/형식/);
 await assert.rejects(requestMock('test',{fetchImpl:async()=>({ok:true,json:async()=>{throw new SyntaxError('invalid JSON')}})}),SyntaxError);
});
test('명시 초기화 뒤 재요청을 허용하고 이전 세대의 늦은 성공과 실패는 폐기한다',async()=>{
 for(const failure of [false,true]) {
  const gate=createGate();let settle;
  const old=gate.request(()=>new Promise((resolve,reject)=>{settle=failure?reject:resolve}));
  gate.startReading();gate.reset();
  const fresh=await gate.request(async()=>good);assert.deepEqual(fresh,good);
  settle(failure?new Error('old'):good);assert.equal(await old,null);
  await assert.rejects(gate.request(async()=>good),/한 번/);
 }
});
test('읽기 시작 뒤 지연된 실패도 폐기한다',async()=>{
 const gate=createGate();let reject;const pending=gate.request(()=>new Promise((_,r)=>reject=r));
 gate.startReading();reject(new Error('late'));assert.equal(await pending,null);
});
test('읽기 시작 뒤 지연 응답은 폐기하며 재요청도 거부한다',async()=>{
 const gate=createGate();let resolve;const result=gate.request(()=>new Promise(r=>resolve=r));
 gate.startReading();resolve(good);assert.equal(await result,null);
 await assert.rejects(gate.request(async()=>good));
});
