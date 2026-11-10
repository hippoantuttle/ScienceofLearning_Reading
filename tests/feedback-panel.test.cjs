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
