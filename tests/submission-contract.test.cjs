const {test}=require('node:test');const assert=require('node:assert/strict');
const {createSubmission,buildPayload}=require('../submission-contract.js');
const input={structureType:'claim',mainIdea:'가상 중심',primary:'가상 하나',support:'가상 둘',relation:'가상 관계',retell:'가상 재구성',reflection:'',newWords:'',interests:'',rechecked:false};
test('문자 수는 유니코드 코드포인트, 필수 공백은 ASCII 공백류 기준이다',()=>{
 assert.doesNotThrow(()=>buildPayload({...input,mainIdea:'😀'.repeat(10000)},'id'));
 assert.throws(()=>buildPayload({...input,mainIdea:'😀'.repeat(10001)},'id'));
 assert.throws(()=>buildPayload({...input,mainIdea:'\t\n \r'},'id'));
});
test('작성값 계약은 원문·URL 등을 제외하고 필수값을 확인한다',()=>{
 const p=buildPayload(input,'session-test');assert.equal(p.mainIdea,input.mainIdea);assert.equal('url' in p,false);assert.equal('article' in p,false);
 assert.throws(()=>buildPayload({...input,retell:'  '},'session-test'));assert.throws(()=>buildPayload({...input,url:'x'},'session-test'));
});
test('실패 후 동일 스냅샷과 동일 키로 재시도하고 저장 확인 전 성공시키지 않는다',async()=>{
 let attempts=0;const seen=[];const adapter={save:async(payload,key)=>{seen.push([payload,key]);if(++attempts===1)throw new Error('network');return {status:'saved',submissionId:'saved-1',savedAt:'2026-11-09T00:00:00Z'};}};
 const flow=createSubmission(adapter,()=> 'session-test');await assert.rejects(flow.submit(input));input.mainIdea='변경된 값';const receipt=await flow.retry();
 assert.equal(receipt.status,'saved');assert.deepEqual(seen[0],seen[1]);assert.equal(seen[1][0].mainIdea,'가상 중심');
});
test('잘못된 저장 응답은 실패이며 원본 보존, 동시 중복 요청은 차단',async()=>{
 let resolve;const flow=createSubmission({save:()=>new Promise(r=>{resolve=r})},()=> 'session-two');const p=flow.submit(input);await assert.rejects(flow.retry(),/진행/);resolve({status:'saved'});await assert.rejects(p,/응답/);assert.ok(flow.snapshot());
});
