const {test}=require('node:test');const assert=require('node:assert/strict');
const {createHttpAdapter}=require('../submission-http.js');
test('인증 후 지정 HTTPS 중계에만 제출하고 오류를 보존한다',async()=>{
 const sent=[];const adapter=createHttpAdapter({endpoint:'https://example.invalid/submissions',getToken:async()=> 'synthetic',fetchImpl:async(url,options)=>{sent.push({url,options});return {ok:true,json:async()=>({status:'saved',submissionId:'id',savedAt:'2026-11-09T00:00:00Z'})}}});
 const result=await adapter.save({schemaVersion:1,sessionId:'fixture'},'fixture');assert.equal(result.status,'saved');assert.equal(sent[0].url,'https://example.invalid/submissions');assert.equal(sent[0].options.headers['Idempotency-Key'],'fixture');assert.equal(sent[0].options.headers.Authorization,'Bearer synthetic');
});
test('저장한 세션을 동일 인증으로 재조회한다',async()=>{
 const sent=[];const adapter=createHttpAdapter({endpoint:'https://example.invalid/submissions',getToken:async()=> 'synthetic',fetchImpl:async(url,options)=>{sent.push({url,options});return {ok:true,json:async()=>({status:'saved'})}}});
 await adapter.read('fixture');assert.equal(sent[0].url,'https://example.invalid/submissions?sessionId=fixture');assert.equal(sent[0].options.method,'GET');assert.equal(sent[0].options.headers.Authorization,'Bearer synthetic');
});
test('HTTPS 아닌 대상, 인증 없음, 서버 오류는 거부한다',async()=>{
 assert.throws(()=>createHttpAdapter({endpoint:'http://example.invalid/x',getToken:async()=>''}));
 const missing=createHttpAdapter({endpoint:'https://example.invalid/x',getToken:async()=>''});await assert.rejects(missing.save({},'id'),/로그인/);
 const denied=createHttpAdapter({endpoint:'https://example.invalid/x',getToken:async()=> 'synthetic',fetchImpl:async()=>({ok:false,status:403})});await assert.rejects(denied.save({},'id'),/403/);
});
