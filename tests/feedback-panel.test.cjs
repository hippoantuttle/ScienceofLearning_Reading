const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const SAMPLE={overall:'주제를 자기 말로 묶어 낸 점이 좋습니다.',criteria:[{name:'핵심 내용 포함',reason:'아마 4개를 담은 것 같습니다.'},{name:'변형/자기 언어화',reason:'복사 없이 재진술했습니다.'},{name:'정확성',reason:'왜곡이 없습니다.'},{name:'구조/응집성',reason:'연결어가 부족합니다.'}],strengths:[{quote:'재정리',comment:'핵심을 묶었습니다.'}],improvements:[{quote:'재정리',direction:'문장 사이 관계를 드러내 보세요.'}],missingIdea:'두 번째 근거'};
function setup(){
 const e={};const document={getElementById(id){return e[id]??={value:'',checked:false,disabled:false,hidden:true,textContent:'',addEventListener(_t,f){this.click=f}}}};
 const session={text:'자체 작성 글',fallback:false};let calls=0;
 const context={document,articleSession:session,SubmissionConfig:{feedbackTestEnabled:true,aiEndpoint:'http://127.0.0.1:8787/recommend'},URL,TextEncoder,setTimeout,clearTimeout,AbortController,fetch:async()=>{calls++;return {ok:true,json:async()=>({kind:'feedback',feedback:context.reply??SAMPLE})}}};
 vm.runInNewContext(fs.readFileSync('feedback-panel.js','utf8'),context);
 const snapshot={sessionId:'11111111-1111-4111-8111-111111111111',mainIdea:'최초',primary:'주장',support:'근거',relation:'관계',retell:'재정리'};
 return {e,context,snapshot,flow:{getToken:()=> 'token'},calls:()=>calls};
}
test('저장 확인 전에는 피드백 카드가 없고, 저장 후 카드 안 버튼 클릭(전송 동의)으로만 요청한다',async()=>{
 const t=setup();await t.e['feedback-request'].click();assert.equal(t.calls(),0);
 t.context.feedbackSubmissionReady(t.snapshot,t.flow);
 assert.equal(t.e['feedback-ai-card'].hidden,false);assert.equal(t.e['feedback-ai-card'].open,undefined,'카드는 접힌 상태로 시작한다');
 assert.equal(t.e['feedback-article'].value,'자체 작성 글');
 await t.e['feedback-request'].click();assert.equal(t.calls(),1);
 const out=t.e['feedback-result'].textContent;
 assert.match(out,/총평\n주제를/);assert.match(out,/· 구조\/응집성: 연결어/);assert.match(out,/1\. "재정리"/);assert.match(out,/다시 살펴볼 핵심 아이디어\n두 번째 근거/);
 assert.doesNotMatch(out,/점수|\/4/);
});
test('수정은 최초 제출을 바꾸지 않고 원본과 수정본을 비교하며 초기화로 지운다',()=>{
 const t=setup();t.context.feedbackSubmissionReady(t.snapshot,t.flow);t.e['feedback-main'].value='수정';t.e['feedback-compare'].click();
 assert.match(t.e['feedback-comparison'].textContent,/최초: 최초/);assert.match(t.e['feedback-comparison'].textContent,/수정: 수정/);assert.equal(t.snapshot.mainIdea,'최초');
 t.context.resetFeedbackPanel();assert.equal(t.e['feedback-section'].hidden,true);assert.equal(t.e['feedback-comparison'].textContent,'');
});

test('선택 설명 공백은 미저장 수정으로 오인하지 않고 비교 화면에서 정상 미작성으로 표시한다',()=>{
 const t=setup();t.snapshot.relation='';t.context.feedbackSubmissionReady(t.snapshot,t.flow);t.e['feedback-relation'].value='  \n';
 assert.equal(t.context.feedbackDirty(),false);t.e['feedback-compare'].click();
 assert.match(t.e['feedback-comparison'].textContent,/왜 이렇게 연결했나요\? \(선택\)\n최초: 작성하지 않음 \(선택\)\n수정: 작성하지 않음 \(선택\)/);
 t.e['feedback-relation'].value='합성 추가 설명';assert.equal(t.context.feedbackDirty(),true);
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
 assert.equal(t.e['feedback-ai-card'].hidden,true,'쓸 수 없는 AI 피드백은 카드째 숨긴다');
 await t.e['feedback-request'].click();assert.equal(t.calls(),0);
 t.e['feedback-request'].disabled=false;await t.e['feedback-request'].click();assert.equal(t.calls(),0);
});

test('AI 피드백 기능이 꺼져 있으면 카드를 숨기고 요청하지 않는다',async()=>{
 const t=setup();t.context.SubmissionConfig.feedbackTestEnabled=false;
 t.context.feedbackSubmissionReady(t.snapshot,t.flow);
 assert.equal(t.e['feedback-ai-card'].hidden,true);assert.equal(t.e['feedback-request'].disabled,true);
 t.e['feedback-request'].disabled=false;await t.e['feedback-request'].click();assert.equal(t.calls(),0);
});

test('AI 피드백이 점수 필드·잘못된 항목명·옛 형식이면 표시하지 않는다',async()=>{
 for(const reply of [{...SAMPLE,score:3},{...SAMPLE,criteria:SAMPLE.criteria.slice(0,3)},{...SAMPLE,criteria:[{name:'간결성',reason:'x'},...SAMPLE.criteria.slice(1)]},{suggestions:['다시 점검하세요.']},{...SAMPLE,improvements:[]}]){
  const t=setup();t.context.reply=reply;t.context.feedbackSubmissionReady(t.snapshot,t.flow);await t.e['feedback-request'].click();
  assert.equal(t.e['feedback-result'].textContent,'');assert.equal(t.e['feedback-status'].textContent,'AI 피드백 형식이 올바르지 않습니다.');
 }
});
test('누락 핵심 아이디어가 없으면 해당 단락을 생략한다',async()=>{
 const t=setup();t.context.reply={...SAMPLE,missingIdea:''};t.context.feedbackSubmissionReady(t.snapshot,t.flow);await t.e['feedback-request'].click();
 assert.doesNotMatch(t.e['feedback-result'].textContent,/다시 살펴볼/);
});
