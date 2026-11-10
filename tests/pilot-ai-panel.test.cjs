const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=require('../ai-client.js');
const Worksheet=require('../worksheet.js');
const good={terms:[{term:'가상 용어',definition:'가상 설명'}],background:['일반 배경'],structureType:'cause-effect'};
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

// sidepanel.js와 pilot-ai-panel.js를 같은 컨텍스트에서 실행(전역 게이트·세션 공유)
function setup({requestPilot,token='tok',aiEndpoint='https://ai.example.test/recommend',confirmReset=true,articleTestEnabled=false,fallback=false,allowRepeatedRecommendations=false}={}){
 const ids=['mock-token','mock-recommend','mock-result','mock-status','to-retell','retell-input','review-view','retell-view','revisit-note','back-to-reading','to-review','end-training','finish','finish-status','status','analyze','article-result','worksheet','form-error','reading','preparation','structure','primary-label','support-label','counts','fallback','start-reading','back','main-idea','primary','support','relation','prior','ai-email','ai-password','ai-login','ai-recommend','ai-result','ai-status','article-ai-preview','article-ai-consent','article-ai-recommend','article-ai-status'];
 const e=Object.fromEntries(ids.map(id=>[id,{value:'',hidden:false,disabled:false,textContent:'',handlers:{},setAttribute(){},focus(){},addEventListener(t,f){this.handlers[t]=f}}]));
 e.structure.value='claim';e.worksheet.reset=()=>{};e['ai-recommend'].disabled=true;
 const tab={id:1,windowId:2,url:'https://example.invalid/test'};
 const chrome={windows:{getCurrent:async()=>({id:2})},tabs:{query:async()=>[tab],get:async()=>tab,connect:()=>({onDisconnect:{addListener(){}},disconnect(){}}),sendMessage:async(_id,msg)=>msg.action==='EXTRACT_ARTICLE'?{status:'success',text:'가상 본문',wordCount:2,charCount:4,fallback,token:'fixture'}:{status:'success',enabled:false}},scripting:{executeScript:async()=>{}}};
 const calls={pilot:0,logins:0};
 const flow={getToken:()=>token,signIn:async()=>{calls.logins++}};
 const ctx=vm.createContext({document:{getElementById:id=>e[id]},chrome,URL,Worksheet,confirm:()=>confirmReset,
  AIContract:{...base,requestPilot:async(...a)=>{calls.pilot++;calls.args=a;return requestPilot(...a)}},
  SubmissionConfig:{aiEndpoint,articleTestEnabled,allowRepeatedRecommendations},panelFlow:()=>flow,resetPanelSubmission(){}});
 vm.runInContext(read('sidepanel.js'),ctx);
 vm.runInContext(read('pilot-ai-panel.js'),ctx);
 return {e,calls,ctx};
}

test('로컬 개발 설정에서는 읽기 전 추천을 반복하되 읽기 시작 후에는 차단한다',async()=>{
 const {e,calls}=setup({requestPilot:async()=>good,articleTestEnabled:true,allowRepeatedRecommendations:true,aiEndpoint:'http://127.0.0.1:8793/recommend'});
 await e.analyze.handlers.click();e['article-ai-consent'].checked=true;
 await e['article-ai-recommend'].handlers.click();assert.equal(e['article-ai-recommend'].disabled,false);
 await e['article-ai-recommend'].handlers.click();assert.equal(calls.pilot,2);
 await e['start-reading'].handlers.click();assert.equal(e['article-ai-recommend'].disabled,true);
});

test('반복 설정이 있어도 원격 서버에서는 반복 제한을 유지한다',async()=>{
 const {e,calls}=setup({requestPilot:async()=>good,articleTestEnabled:true,allowRepeatedRecommendations:true});
 await e.analyze.handlers.click();e['article-ai-consent'].checked=true;
 await e['article-ai-recommend'].handlers.click();assert.equal(e['article-ai-recommend'].disabled,true);
 e['article-ai-recommend'].disabled=false;await e['article-ai-recommend'].handlers.click();assert.equal(calls.pilot,1);
});

test('실제 글 추천은 기본 비활성이며 본문 확인과 동의 후에만 요청한다',async()=>{
 const off=setup({requestPilot:async()=>good}); await off.e.analyze.handlers.click();
 assert.equal(off.e['article-ai-recommend'].disabled,true);
 const {e,calls}=setup({requestPilot:async()=>good,articleTestEnabled:true});
 await e.analyze.handlers.click(); assert.equal(e['article-ai-preview'].value,'가상 본문');
 await e['article-ai-recommend'].handlers.click(); assert.equal(calls.pilot,0);
 e['article-ai-consent'].checked=true; await e['article-ai-recommend'].handlers.click();
 assert.equal(calls.pilot,1); assert.equal(calls.args[2].article,'가상 본문');
 assert.match(e['ai-result'].textContent,/실제 글 기반/);
});

test('본문 영역을 찾지 못하면 페이지 전체 전송을 차단하고 읽기 시작 시 미리보기를 지운다',async()=>{
 const fallback=setup({requestPilot:async()=>good,articleTestEnabled:true,fallback:true});
 await fallback.e.analyze.handlers.click(); assert.equal(fallback.e['article-ai-recommend'].disabled,true);
 assert.equal(fallback.e['article-ai-preview'].value,'');
 const {e}=setup({requestPilot:async()=>good,articleTestEnabled:true});
 await e.analyze.handlers.click(); e['article-ai-consent'].checked=true;
 await e['start-reading'].handlers.click();
 assert.equal(e['article-ai-preview'].value,''); assert.equal(e['article-ai-consent'].checked,false);
 assert.equal(e['article-ai-recommend'].disabled,true);
});

test('실제 글 추천의 지연 응답은 읽기 시작 후 표시하지 않는다',async()=>{
 let release; const {e,calls}=setup({requestPilot:()=>new Promise(r=>{release=()=>r(good)}),articleTestEnabled:true});
 await e.analyze.handlers.click(); e['article-ai-consent'].checked=true;
 const pending=e['article-ai-recommend'].handlers.click();
 while (!release) await new Promise(r=>setImmediate(r));
 await e['start-reading'].handlers.click(); release(); await pending;
 assert.equal(calls.pilot,1); assert.equal(e['ai-result'].hidden,true); assert.equal(e['ai-result'].textContent,'');
});

test('글 연결 전에는 사용할 수 없고, 연결 후 로그인 토큰으로 한 번만 요청하며 결과는 자동 입력되지 않는다',async()=>{
 const {e,calls}=setup({requestPilot:async()=>good});
 assert.equal(e['ai-recommend'].disabled,true);
 await e['ai-recommend'].handlers.click();assert.equal(calls.pilot,0);
 await e.analyze.handlers.click();assert.equal(e['ai-recommend'].disabled,false);
 await e['ai-recommend'].handlers.click();
 assert.equal(calls.pilot,1);assert.equal(calls.args[0],'tok');assert.equal(calls.args[1],'https://ai.example.test/recommend');
 assert.equal(e['ai-result'].hidden,false);assert.match(e['ai-result'].textContent,/가상 예문/);assert.match(e['ai-result'].textContent,/원인–결과/);
 assert.equal(e.structure.value,'claim');assert.equal(e['main-idea'].value,'');assert.equal(e['ai-recommend'].disabled,true);
 e['ai-recommend'].disabled=false;await e['ai-recommend'].handlers.click();
 assert.equal(calls.pilot,1);assert.match(e['ai-status'].textContent,/한 번만/);
});

test('읽기 시작 후에는 요청할 수 없고 결과가 지워지며, 읽기 시작 전에 보낸 늦은 응답은 폐기된다',async()=>{
 let release;const {e,calls}=setup({requestPilot:()=>new Promise(r=>{release=()=>r(good)})});
 await e.analyze.handlers.click();
 const pending=e['ai-recommend'].handlers.click();
 await e['start-reading'].handlers.click();
 release();await pending;
 assert.equal(e['ai-result'].hidden,true);assert.equal(e['ai-result'].textContent,'');
 assert.equal(e['ai-recommend'].disabled,true);assert.match(e['ai-status'].textContent,/읽기 시작 후/);
 e['ai-recommend'].disabled=false;await e['ai-recommend'].handlers.click();
 assert.equal(calls.pilot,1);assert.equal(e['ai-result'].hidden,true);
});

test('로그인·서버 설정이 없으면 요청하지 않고 안내하며 자료 없이 계속할 수 있다',async()=>{
 const noLogin=setup({requestPilot:async()=>good,token:null});
 await noLogin.e.analyze.handlers.click();await noLogin.e['ai-recommend'].handlers.click();
 assert.equal(noLogin.calls.pilot,0);assert.match(noLogin.e['ai-status'].textContent,/로그인/);assert.match(noLogin.e['ai-status'].textContent,/자료 없이/);
 const noServer=setup({requestPilot:async()=>good,aiEndpoint:''});
 await noServer.e.analyze.handlers.click();await noServer.e['ai-recommend'].handlers.click();
 assert.equal(noServer.calls.pilot,0);assert.match(noServer.e['ai-status'].textContent,/설정되지/);
});

test('서버 오류 메시지는 안전한 문구만 표시하고 알 수 없는 오류는 일반 문구로 바꾼다',async()=>{
 const limit=setup({requestPilot:async()=>{throw new Error('오늘 AI 추천 사용 한도에 도달했습니다.')}});
 await limit.e.analyze.handlers.click();await limit.e['ai-recommend'].handlers.click();
 assert.match(limit.e['ai-status'].textContent,/한도/);assert.match(limit.e['ai-status'].textContent,/자료 없이/);
 const leak=setup({requestPilot:async()=>{throw new Error('Bearer tok failed at https://secret')}});
 await leak.e.analyze.handlers.click();await leak.e['ai-recommend'].handlers.click();
 assert.doesNotMatch(leak.e['ai-status'].textContent,/Bearer|secret/);assert.match(leak.e['ai-status'].textContent,/연결하지 못/);
});

test('새 시도(재연결)는 이전 결과·비밀번호를 지우고 다시 한 번 요청할 수 있게 한다',async()=>{
 const {e,calls}=setup({requestPilot:async()=>good});
 await e.analyze.handlers.click();await e['ai-recommend'].handlers.click();
 e['ai-password'].value='pw';
 await e.analyze.handlers.click();
 assert.equal(e['ai-result'].hidden,true);assert.equal(e['ai-result'].textContent,'');
 assert.equal(e['ai-password'].value,'');assert.equal(e['ai-recommend'].disabled,false);
 await e['ai-recommend'].handlers.click();assert.equal(calls.pilot,2);
});

test('HTML은 새 요소와 스크립트 순서를 갖고 AI 호출 코드는 읽기 단계 입력을 읽지 않는다',()=>{
 const html=read('sidepanel.html');
 for(const id of ['ai-email','ai-password','ai-login','ai-recommend','ai-result','ai-status']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/id="ai-recommend" type="button" disabled/);
 assert.ok(html.indexOf('sidepanel.js')<html.indexOf('pilot-ai-panel.js'));
 const src=read('pilot-ai-panel.js');
 for(const id of ['main-idea','primary','support','relation','retell-input','prior','reflection']) assert.doesNotMatch(src,new RegExp(`['"]${id}['"]`));
 assert.doesNotMatch(src,/innerHTML/);
});
