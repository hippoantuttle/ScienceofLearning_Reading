const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const e={};const document={getElementById(id){return e[id]??={value:'',checked:false,disabled:false,hidden:true,textContent:'',addEventListener(_t,f){this.click=f}}}};
 const session={text:'자체 작성 글',fallback:false};let calls=0;
 const context={document,articleSession:session,SubmissionConfig:{feedbackTestEnabled:true,aiEndpoint:'http://127.0.0.1:8787/recommend'},URL,TextEncoder,setTimeout,clearTimeout,AbortController,fetch:async()=>{calls++;return {ok:true,json:async()=>({kind:'feedback',feedback:{suggestions:['다시 점검하세요.']}})}}};
 vm.runInNewContext(fs.readFileSync('feedback-panel.js','utf8'),context);
 const snapshot={sessionId:'11111111-1111-4111-8111-111111111111',mainIdea:'최초',primary:'주장',support:'근거',relation:'관계',retell:'재정리'};
 return {e,context,snapshot,flow:{getToken:()=> 'token'},calls:()=>calls};
}
test('저장 확인 전에 피드백 요청이 없고 동의 후에만 요청한다',async()=>{
 const t=setup();await t.e['feedback-request'].click();assert.equal(t.calls(),0);
 t.context.feedbackSubmissionReady(t.snapshot,t.flow);
 await t.e['feedback-request'].click();assert.equal(t.calls(),0);
 t.e['feedback-consent'].checked=true;await t.e['feedback-request'].click();assert.equal(t.calls(),1);
 assert.match(t.e['feedback-result'].textContent,/점검/);
});
test('수정은 최초 제출을 바꾸지 않고 원본과 수정본을 비교하며 초기화로 지운다',()=>{
 const t=setup();t.context.feedbackSubmissionReady(t.snapshot,t.flow);t.e['feedback-main'].value='수정';t.e['feedback-compare'].click();
 assert.match(t.e['feedback-comparison'].textContent,/최초: 최초/);assert.match(t.e['feedback-comparison'].textContent,/수정: 수정/);assert.equal(t.snapshot.mainIdea,'최초');
 t.context.resetFeedbackPanel();assert.equal(t.e['feedback-section'].hidden,true);assert.equal(t.e['feedback-comparison'].textContent,'');
});

test('수정본 실패·만료 시 입력을 유지하고 같은 계정 재로그인 후 이전 요청을 재확인한다',async()=>{
 const t=setup(),client=require('../record-client.js');let pending,fail=true,expired=0;
 const requestId='22222222-2222-4222-8222-222222222222';
 const io={save:async(_record,p)=>{pending=p;if(fail)throw Object.assign(Error('상단에서 다시 로그인하세요.'),{status:401});return {status:'saved',revision:{id:'revision',requestId,savedAt:'2026-11-10T00:00:00Z'}};},readRevision:async()=>({status:'saved',revision:{id:'revision',requestId,savedAt:'2026-11-10T00:00:00Z',answers:pending.answers}})};
 t.context.RecordClient={create:()=>io,createSaver:client.createSaver};t.context.crypto={randomUUID:()=>requestId};t.context.panelExpireAccount=()=>{expired++;};
 t.context.feedbackSubmissionReady(t.snapshot,t.flow,{submissionId:requestId});
 t.e['feedback-main'].value='저장할 수정';await t.e['revision-save'].click();
 assert.equal(expired,1);assert.equal(t.e['feedback-main'].value,'저장할 수정');assert.match(t.e['revision-status'].textContent,/입력은 유지/);
 t.e['feedback-main'].value='실패 후 추가 수정';fail=false;await t.e['revision-save'].click();
 assert.equal(pending.answers.mainIdea,'저장할 수정');assert.equal(t.e['feedback-main'].value,'실패 후 추가 수정');assert.match(t.e['revision-status'].textContent,/이후 편집/);assert.equal(t.snapshot.mainIdea,'최초');
});

test('본문 추출 fallback은 AI 전송을 계속 막지만 저장 확인된 답안의 직접 수정은 제공한다',async()=>{
 const t=setup();t.context.articleSession.fallback=true;
 t.context.feedbackSubmissionReady(t.snapshot,t.flow);
 assert.equal(t.e['feedback-section'].hidden,false);assert.equal(t.e['feedback-main'].value,'최초');
 assert.equal(t.e['feedback-article'].value,'');assert.equal(t.e['feedback-request'].disabled,true);
 t.e['feedback-consent'].checked=true;await t.e['feedback-request'].click();assert.equal(t.calls(),0);
 t.e['feedback-request'].disabled=false;await t.e['feedback-request'].click();assert.equal(t.calls(),0);
});
