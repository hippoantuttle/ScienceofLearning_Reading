const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const mock=require('../submission-client.js');
test('재조회 실패는 모의 성공으로 표시하지 않는다',async()=>{
 const e={button:{disabled:false,addEventListener(_t,f){this.click=f}},status:{textContent:''}};
 const document={getElementById:id=>id==='synthetic-submit'?e.button:e.status};
 const createClient=()=>({submit:async()=>({status:'mock-saved',submissionId:'x'}),read:async()=>{throw new Error('offline')}});
 vm.runInNewContext(fs.readFileSync('submission-demo.js','utf8'),{document,...mock,createClient,JSON});await e.button.click();assert.match(e.status.textContent,/실패/);assert.equal(e.button.disabled,false);
});
test('합성 제출 UI는 저장 재조회 성공 후에만 모의 완료를 표시한다',async()=>{
 const e={button:{disabled:false,addEventListener(_t,f){this.click=f}},status:{textContent:''}};
 const document={getElementById:id=>id==='synthetic-submit'?e.button:e.status};
 vm.runInNewContext(fs.readFileSync('submission-demo.js','utf8'),{document,...mock,JSON});await e.button.click();assert.match(e.status.textContent,/모의/);assert.match(e.status.textContent,/재조회/);
});
