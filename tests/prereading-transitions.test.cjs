const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=require('../ai-client.js');
const Worksheet=require('../worksheet.js');
const good={terms:[{term:'가상 용어',definition:'가상 설명'}],background:[],structureType:'unspecified'};
function setup(requestMock, options={}){
 const ids=['mock-token','mock-recommend','mock-result','mock-status','to-retell','retell-input','review-view','retell-view','revisit-note','back-to-reading','to-review','end-training','finish','finish-status','status','analyze','article-result','worksheet','form-error','reading','preparation','structure','primary-label','support-label','prior','counts','fallback','start-reading','back','main-idea','primary','support','relation'];
 const e=Object.fromEntries(ids.map(id=>[id,{value:'',hidden:false,disabled:false,textContent:'',handlers:{},setAttribute(){},focus(){},addEventListener(t,f){this.handlers[t]=f}}]));
 e.structure.value='claim';e.worksheet.reset=()=>{};
 const tab={id:1,windowId:2,url:'https://example.invalid/test'};const sent=[];
 const chrome={windows:{getCurrent:async()=>({id:2})},tabs:{query:async()=>[tab],get:async()=>tab,connect:()=>({onDisconnect:{addListener(){}},disconnect(){}}),sendMessage:async(_id,msg)=>{sent.push(msg);return msg.action==='EXTRACT_ARTICLE'?(options.failConnect?{status:'error',message:'가상 연결 실패'}:{status:'success',text:'가상 글',charCount:4,wordCount:2,token:'fixture'}):(options.failRestore&&!msg.enabled?{status:'error'}:{status:'success',enabled:msg.enabled})}},scripting:{executeScript:async()=>{}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','sidepanel.js'),'utf8'),{document:{getElementById:id=>e[id]},chrome,URL,Worksheet,AIContract:{...base,requestMock},localPreviewReset:()=>{options.resets=(options.resets||0)+1},localPreviewStartReading:()=>{options.starts=(options.starts||0)+1},confirm:message=>{options.confirmMessage=message;return options.confirm!==false}});
 return {e,sent};
}
test('새 시도 확인은 종료·삭제·같은 글 재연결을 설명하고 취소 시 상태를 유지한다',async()=>{
 const options={confirm:false};const {e}=setup(async()=>good,options);
 await e.analyze.handlers.click();await e['start-reading'].handlers.click();e['main-idea'].value='가상 작성';e.back.handlers.click();
 await e.analyze.handlers.click();
 assert.match(options.confirmMessage,/훈련 종료/);assert.match(options.confirmMessage,/작성 내용/);assert.match(options.confirmMessage,/같은 글/);assert.match(options.confirmMessage,/새.*시도/);
 assert.equal(e['main-idea'].value,'가상 작성');assert.equal(e.preparation.hidden,false);assert.equal(e['mock-recommend'].disabled,true);
});
test('새 시도 글 연결 실패 시 추천을 허용하지 않고 재연결 성공 후 허용한다',async()=>{
 const options={};const {e}=setup(async()=>good,options);await e.analyze.handlers.click();await e['start-reading'].handlers.click();e.back.handlers.click();
 options.failConnect=true;await e.analyze.handlers.click();assert.equal(e['mock-recommend'].disabled,true);assert.equal(e['article-result'].hidden,true);
 options.failConnect=false;await e.analyze.handlers.click();assert.equal(e['mock-recommend'].disabled,false);
});
test('Retell에서 원문 복원 실패하면 훈련 종료 전환 및 추천 활성화를 막는다',async()=>{
 const options={};const {e}=setup(async()=>good,options);await e.analyze.handlers.click();await e['start-reading'].handlers.click();
 for(const id of ['main-idea','primary','support','relation'])e[id].value='가상 입력';await e['to-retell'].handlers.click();
 options.failRestore=true;await e['end-training'].handlers.click();assert.equal(e['retell-view'].hidden,false);assert.equal(e['mock-recommend'].disabled,true);assert.match(e.status.textContent,/복원/);
});
test('패널 읽기 시작과 승인된 새 시도에서 가상 동의 게이트를 전환한다',async()=>{
 const options={confirm:false};const {e}=setup(async()=>good,options);
 await e.analyze.handlers.click();assert.equal(options.resets,1);await e['start-reading'].handlers.click();assert.equal(options.starts,1);
 e.back.handlers.click();await e.analyze.handlers.click();assert.equal(options.resets,1);
 options.confirm=true;await e.analyze.handlers.click();assert.equal(options.resets,2);
});
test('모의 패널은 인증·시간 초과·잘못된 응답에 수동 진행 안내를 표시한다',async()=>{
 for(const message of ['로컬 테스트 인증에 실패했습니다.','로컬 테스트 서버 응답 시간이 초과되었습니다.','모의 응답 형식이 올바르지 않습니다.']){
  const {e}=setup(async()=>{throw new Error(message)});e['mock-token'].value='fixture';await e['mock-recommend'].handlers.click();
  assert.match(e['mock-status'].textContent,/자료 없이 계속/);assert.match(e['mock-status'].textContent,new RegExp(message));assert.equal(e['mock-token'].value,'');assert.equal(e['mock-recommend'].disabled,true);
 }
});
test('패널 단계 전환에서 추천이 숨겨지고 재요청이 차단되며 새 글 연결로 초기화된다',async()=>{
 let calls=0;const {e,sent}=setup(async()=>{calls++;return good});
 await e.analyze.handlers.click();e['mock-token'].value='fixture';await e['mock-recommend'].handlers.click();assert.equal(e['mock-result'].hidden,false);
 await e['start-reading'].handlers.click();assert.equal(e['mock-result'].hidden,true);assert.equal(e['mock-recommend'].disabled,true);
 e.back.handlers.click();assert.equal(e['mock-recommend'].disabled,true);
 await e['start-reading'].handlers.click();for(const id of ['main-idea','primary','support','relation'])e[id].value='가상 입력';
 await e['to-retell'].handlers.click();assert.equal(e['retell-view'].hidden,false);assert.equal(e['mock-recommend'].disabled,true);
 assert.equal(sent.filter(m=>m.action==='TOGGLE_BLUR'&&m.enabled).length,1);
 await e['back-to-reading'].handlers.click();e.back.handlers.click();assert.equal(e['mock-recommend'].disabled,true);
 await e.analyze.handlers.click();assert.equal(e['mock-recommend'].disabled,false);e['mock-token'].value='fixture';await e['mock-recommend'].handlers.click();assert.equal(calls,2);
});
test('읽기 시작 후 지연 성공과 실패 모두 패널에 표시하지 않는다',async()=>{
 for(const failure of [false,true]){
  let settle;const {e}=setup(()=>new Promise((resolve,reject)=>{settle=failure?reject:resolve}));
  await e.analyze.handlers.click();e['mock-token'].value='fixture';const pending=e['mock-recommend'].handlers.click();await e['start-reading'].handlers.click();
  settle(failure?new Error('late'):good);await pending;
  assert.equal(e['mock-result'].hidden,true);assert.equal(e['mock-result'].textContent,'');assert.match(e['mock-status'].textContent,/읽기 시작 후/);
 }
});
