const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateInput,createLocalPreview,SYNTHETIC_TEXT}=require('../local-preview.js');
test('가상 입력 계약은 공백·초과·추가 필드를 거부한다',()=>{
 assert.equal(validateInput({text:' '}),false);assert.equal(validateInput({text:'a'.repeat(4000)}),true);
 assert.equal(validateInput({text:'😀'.repeat(4000)}),true);assert.equal(validateInput({text:'😀'.repeat(4001)}),false);
 assert.equal(validateInput({text:'a',extra:'x'}),false);assert.equal(validateInput({text:'\ud800'}),false);
});
test('새 시도 초기화 뒤 지연된 성공·실패는 폐기한다',async()=>{
 for(const fail of [false,true]){
  const gate=createLocalPreview();let settle;const old=gate.request(true,()=>new Promise((resolve,reject)=>{settle=fail?reject:resolve}));
  gate.startReading();gate.reset();settle(fail?new Error('late'):'late');assert.equal(await old,null);
  assert.equal(await gate.request(true,async()=> 'new'),'new');
 }
});
test('미동의·읽기 중에는 모의 요청을 실행하지 않고 초기화 시 이전 결과를 폐기한다',async()=>{
 const gate=createLocalPreview();let calls=0,resolve;
 const fetcher=()=>{calls++;return new Promise(r=>resolve=r)};
 await assert.rejects(gate.request(false,fetcher));assert.equal(calls,0);
 const pending=gate.request(true,fetcher);gate.startReading();resolve('가상');assert.equal(await pending,null);
 await assert.rejects(gate.request(true,fetcher));assert.equal(calls,1);
 gate.reset();assert.equal(await gate.request(true,async()=>SYNTHETIC_TEXT),SYNTHETIC_TEXT);
});
