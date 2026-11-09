const {test}=require('node:test');const assert=require('node:assert/strict');
const {createMockStore,createClient,EXAMPLE}=require('../submission-client.js');
test('가상 제출은 저장 확인·재조회하며 중복은 한 건만 저장한다',async()=>{
 const store=createMockStore(),client=createClient(store,'synthetic-owner');
 const a=await client.submit(EXAMPLE);const b=await client.submit(EXAMPLE);
 assert.equal(a.status,'mock-saved');assert.equal(a.submissionId,b.submissionId);assert.deepEqual(await client.read(a.submissionId),EXAMPLE);assert.equal(store.count(),1);
});
test('다른 사용자 조회와 동일 세션 다른 내용, 미인증은 거부한다',async()=>{
 const store=createMockStore(),a=createClient(store,'synthetic-owner'),b=createClient(store,'other');const saved=await a.submit(EXAMPLE);
 await assert.rejects(b.read(saved.submissionId));await assert.rejects(a.submit({...EXAMPLE,mainIdea:'바뀐 가상 값'}));await assert.rejects(createClient(store,'').submit(EXAMPLE));
});
