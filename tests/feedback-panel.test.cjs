const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const SAMPLE={overall:'주제를 자기 말로 묶어 낸 점이 좋습니다.',criteria:[{name:'핵심 내용 포함',reason:'아마 4개를 담은 것 같습니다.'},{name:'변형/자기 언어화',reason:'복사 없이 재진술했습니다.'},{name:'정확성',reason:'왜곡이 없습니다.'},{name:'구조/응집성',reason:'연결어가 부족합니다.'}],strengths:[{quote:'재정리',comment:'핵심을 묶었습니다.'}],improvements:[{quote:'재정리',direction:'문장 사이 관계를 드러내 보세요.'}],missingIdea:'두 번째 근거'};
function setup(){
 const e={};const document={getElementById(id){return e[id]??={value:'',checked:false,disabled:false,hidden:true,textContent:'',addEventListener(_t,f){this.click=f}}}};
 const session={text:'자체 작성 글',fallback:false};let calls=0;
 const context={document,articleSession:session,SubmissionConfig:{feedbackTestEnabled:true,aiEndpoint:'http://127.0.0.1:8787/recommend'},URL,TextEncoder,setTimeout,clearTimeout,AbortController,fetch:async(...args)=>{calls++;return context.transport?context.transport(...args):{ok:true,json:async()=>({kind:'feedback',feedback:context.reply??SAMPLE})}}};
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
  assert.equal(t.e['feedback-result'].textContent,'');assert.match(t.e['feedback-status'].textContent,/AI 응답을 확인하지 못했습니다/);
 }
});

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};
const success=()=>({ok:true,json:async()=>({kind:'feedback',feedback:SAMPLE})});
const flush=()=>new Promise(setImmediate);
function googleFlow(){const flow=require('../submission-flow.js').createFlow({login:async()=>'',adapter:()=>({checkMember:async()=>true}),newId:()=>''});flow.adopt('token','synthetic@example.invalid','11111111-1111-4111-8111-111111111111','google');return flow;}
const rotated=flow=>flow.resumeGoogle({accessToken:'rotated',email:'synthetic@example.invalid',userId:'11111111-1111-4111-8111-111111111111'});

test('인증 대기 중 두 번 클릭해도 한 번만 전송하고 실패 후 다시 요청할 수 있다',async()=>{
 const t=setup(),auth=deferred();t.context.panelFreshToken=()=>auth.promise;t.context.feedbackSubmissionReady(t.snapshot,t.flow);
 const a=t.e['feedback-request'].click(),b=t.e['feedback-request'].click();assert.equal(t.e['feedback-request'].disabled,true);assert.equal(t.calls(),0);
 auth.resolve('token');await Promise.all([a,b]);assert.equal(t.calls(),1);assert.equal(t.e['feedback-request'].disabled,false);
 await t.e['feedback-request'].click();assert.equal(t.calls(),2);
});

test('같은 Google 계정의 정상 토큰 갱신 중 받은 피드백은 표시한다',async()=>{
 const t=setup(),flow=googleFlow(),pending=deferred();t.context.transport=()=>pending.promise;t.context.feedbackSubmissionReady(t.snapshot,flow);
 const running=t.e['feedback-request'].click();rotated(flow);pending.resolve(success());await running;
 assert.match(t.e['feedback-result'].textContent,/총평/);assert.doesNotMatch(t.e['feedback-status'].textContent,/기다리고/);
});

test('만료 후 같은 계정 재로그인·다른 계정 변경 뒤 늦은 결과와 오류는 표시하지 않는다',async()=>{
 for(const change of ['expired','account'])for(const ok of [true,false]){
  const t=setup(),flow=googleFlow(),pending=deferred();let expired=0;t.context.panelExpireAccount=()=>expired++;t.context.transport=()=>pending.promise;t.context.feedbackSubmissionReady(t.snapshot,flow);
  const running=t.e['feedback-request'].click();
  if(change==='expired'){flow.expire();rotated(flow);}else flow.adopt('other','other@example.invalid','22222222-2222-4222-8222-222222222222','google');
  pending.resolve(ok?success():{ok:false,status:401,json:async()=>({error:'unauthorized'})});await running;
  assert.equal(t.e['feedback-result'].textContent,'');assert.match(t.e['feedback-status'].textContent,/로그인 정보가 변경/);assert.equal(expired,0);assert.equal(t.e['feedback-request'].disabled,false);
 }
});

test('인증 대기 중 초기화하면 요청하지 않고, 이전 요청 finally가 새 요청을 풀지 않는다',async()=>{
 const t=setup(),auth=deferred();t.context.panelFreshToken=()=>auth.promise;t.context.feedbackSubmissionReady(t.snapshot,t.flow);
 const running=t.e['feedback-request'].click();t.context.resetFeedbackPanel();auth.resolve('token');await running;assert.equal(t.calls(),0);assert.equal(t.e['feedback-section'].hidden,true);
 const old=deferred(),next=deferred();delete t.context.panelFreshToken;t.context.feedbackSubmissionReady(t.snapshot,t.flow);t.context.transport=()=>old.promise;
 const a=t.e['feedback-request'].click();t.context.resetFeedbackPanel();t.context.feedbackSubmissionReady(t.snapshot,t.flow);t.context.transport=()=>next.promise;
 const b=t.e['feedback-request'].click();old.resolve(success());await a;assert.equal(t.e['feedback-request'].disabled,true);assert.equal(t.e['feedback-result'].textContent,'');
 next.resolve(success());await b;assert.equal(t.e['feedback-request'].disabled,false);assert.match(t.e['feedback-result'].textContent,/총평/);
});

test('새 문서의 늦은 응답과 응답 본문 대기 중 인증 변경을 차단하고 대기를 종료한다',async()=>{
 for(const changed of ['document','body']){
  const t=setup(),flow=googleFlow(),pending=deferred();t.context.feedbackSubmissionReady(t.snapshot,flow);
  t.context.transport=changed==='body'?async()=>({ok:true,json:()=>pending.promise}):()=>pending.promise;
  const running=t.e['feedback-request'].click();await flush();
  if(changed==='body')flow.expire();else t.context.articleSession={text:'새 합성 글'};
  pending.resolve(changed==='body'?{kind:'feedback',feedback:SAMPLE}:success());await running;
  assert.equal(t.e['feedback-result'].textContent,'');assert.doesNotMatch(t.e['feedback-status'].textContent,/기다리고 있습니다/);assert.equal(t.e['feedback-request'].disabled,false);
 }
});

test('실패 유형 안내·문의 번호를 표시하며 원격 임의 문구를 노출하거나 자동 재전송하지 않는다',async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 for(const [http,code,message] of [[401,'unauthorized','로그인이 만료'],[403,'inactive','참여 권한'],[429,'limit','요청이 많습니다'],[502,'provider_timeout','응답이 지연'],[502,'feedback_strength_quote','AI 응답을 확인'],[502,'provider_http','연결하지 못했습니다'],[503,'disabled','사용할 수 없습니다']]){
  const t=setup();let expired=0;t.context.panelExpireAccount=()=>expired++;t.context.transport=async()=>({ok:false,status:http,json:async()=>({error:'provider',code,requestId:id,message:'SYNTHETIC_PRIVATE_PAYLOAD'})});t.context.feedbackSubmissionReady(t.snapshot,t.flow);
  t.e['feedback-retell'].value='편집 중 합성 답안';await t.e['feedback-request'].click();
  assert.match(t.e['feedback-status'].textContent,new RegExp(message));assert.match(t.e['feedback-error-code'].textContent,new RegExp(id));assert.equal(t.e['feedback-error-details'].hidden,false);
  assert.doesNotMatch(t.e['feedback-status'].textContent,/SYNTHETIC_PRIVATE/);assert.equal(t.e['feedback-retell'].value,'편집 중 합성 답안');assert.equal(t.calls(),1);assert.equal(expired,http===401?1:0);
 }
});

test('재요청 실패 시 이전 결과·답안을 보존하고 잘못된 오류 번호는 숨긴다',async()=>{
 const t=setup();t.context.feedbackSubmissionReady(t.snapshot,t.flow);await t.e['feedback-request'].click();const previous=t.e['feedback-result'].textContent;
 t.context.transport=async()=>({ok:false,status:502,json:async()=>({code:'arbitrary private string',requestId:'SYNTHETIC_PRIVATE_PAYLOAD'})});
 await t.e['feedback-request'].click();assert.equal(t.e['feedback-result'].textContent,previous);assert.match(t.e['feedback-status'].textContent,/이전 피드백/);assert.equal(t.e['feedback-error-details'].hidden,true);
 t.context.transport=async()=>{throw new TypeError('SYNTHETIC_PRIVATE_PAYLOAD')};await t.e['feedback-request'].click();assert.doesNotMatch(t.e['feedback-status'].textContent,/SYNTHETIC_PRIVATE/);assert.equal(t.calls(),3);
});

test('클라이언트 timeout도 대기 상태를 끝내고 입력과 수동 재시도를 유지한다',async()=>{
 const t=setup();t.context.setTimeout=(fn,ms)=>setTimeout(fn,ms===60000?1:ms);
 t.context.transport=(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(Error('private'),{name:'AbortError'}))));
 t.context.feedbackSubmissionReady(t.snapshot,t.flow);await t.e['feedback-request'].click();
 assert.match(t.e['feedback-status'].textContent,/응답이 지연/);assert.equal(t.e['feedback-request'].disabled,false);assert.equal(t.calls(),1);
});
test('누락 핵심 아이디어가 없으면 해당 단락을 생략한다',async()=>{
 const t=setup();t.context.reply={...SAMPLE,missingIdea:''};t.context.feedbackSubmissionReady(t.snapshot,t.flow);await t.e['feedback-request'].click();
 assert.doesNotMatch(t.e['feedback-result'].textContent,/다시 살펴볼/);
});
