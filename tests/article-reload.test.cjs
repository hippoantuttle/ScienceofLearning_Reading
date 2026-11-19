// 작성 중 기사 탭이 새로고침되어 content.js가 사라져도, 본문이 같으면 다시 주입해 다시 말하기로 이어 간다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const worksheet=require('../worksheet.js');
const AIContract=require('../ai-client.js');
const TrainingDraft=require('../training-draft.js');
const ARTICLE=['합성 기사 첫 문단은 도서관 운영 시간을 길게 설명하고 주말과 평일을 비교한다.','합성 기사 둘째 문단은 이용자 설문 결과를 소개하고 연장 운영의 필요성을 주장한다.','합성 기사 셋째 문단은 예산과 인력 배치 계획을 다루며 결론을 제시한다.','조회수 10'];

test('content.js PING_SESSION은 연결한 토큰일 때만 살아 있다고 답한다',()=>{
 const listeners=[];
 const node={innerText:'가상 글입니다',isConnected:true,style:{},querySelectorAll:()=>[]};
 const context={document:{querySelectorAll:s=>s==='article'?[node]:[],body:node},location:{href:'https://example.invalid/a'},crypto:{randomUUID:()=>'token'},window:{addEventListener(){},removeEventListener(){}},chrome:{runtime:{onMessage:{addListener:fn=>listeners.push(fn)}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8'),context);
 const send=m=>{let result;listeners[0](m,{},r=>result=r);return result;};
 assert.equal(send({action:'PING_SESSION',token:'token'}).alive,false,'추출 전');
 send({action:'EXTRACT_ARTICLE'});
 assert.equal(send({action:'PING_SESSION',token:'token'}).alive,true);
 assert.equal(send({action:'PING_SESSION',token:'wrong'}).alive,false);
 assert.equal('text' in send({action:'PING_SESSION',token:'token'}),false,'본문을 보내지 않는다');
});

function harness(){
 const ids=['mock-token','mock-recommend','mock-result','mock-status','to-retell','retell-input','review-view','retell-view','revisit-note','back-to-reading','to-review','end-training','status','analyze','article-result','worksheet','form-error','reading','preparation','structure','primary-label','support-label','prior','counts','fallback','start-reading','back','main-idea','primary','support','relation','connect-status','retell-status'];
 const elements=Object.fromEntries(ids.map(id=>[id,{id,value:'',hidden:false,textContent:'',handlers:{},setAttribute(){},removeAttribute(){},focus(){},addEventListener(type,fn){this.handlers[type]=fn}}]));
 elements.structure.value='claim';elements.structure.selectedOptions=[{textContent:'주장'}];
 elements.worksheet.reset=()=>{};
 const tab={id:10,windowId:5,url:'https://example.invalid/article',title:'합성 기사 제목'};
 // 페이지 상태: alive=false면 content.js가 없는 상태(새로고침 직후)
 const page={alive:true,token:'t1',text:ARTICLE.join('\n'),injections:0,blurred:false};
 const sent=[];const ports=[];const updated=[];
 const chrome={runtime:{sendMessage:async()=>({status:'error'})},windows:{getCurrent:async()=>({id:5})},
  scripting:{executeScript:async()=>{page.injections++;if(!page.alive){page.alive=true;page.token=null;}}},
  tabs:{query:async()=>[tab],get:async()=>tab,onUpdated:{addListener:fn=>updated.push(fn)},
   connect:()=>{const listeners=[];const port={onDisconnect:{addListener:fn=>listeners.push(fn)},disconnect(){},fire(){listeners.forEach(fn=>fn());}};ports.push(port);return port;},
   sendMessage:async(_id,msg)=>{
    if(!page.alive)throw new Error('Could not establish connection. Receiving end does not exist.');
    sent.push(msg);
    if(msg.action==='EXTRACT_ARTICLE'){page.token='t'+(page.injections+1)+'-'+sent.length;page.blurred=false;return{status:'success',text:page.text,charCount:5,wordCount:2,fallback:false,token:page.token};}
    if(msg.action==='PING_SESSION')return{status:'success',alive:msg.token===page.token};
    if(msg.action==='TOGGLE_BLUR'){if(msg.enabled&&msg.token!==page.token)return{status:'error',message:'연결한 본문이 변경되었습니다. 다시 연결하세요.'};page.blurred=msg.enabled;return{status:'success',enabled:msg.enabled};}
   }}};
 const source=fs.readFileSync(path.join(__dirname,'..','sidepanel.js'),'utf8');
 const ctx={document:{getElementById:id=>elements[id]},chrome,URL,Worksheet:worksheet,AIContract,TrainingDraft,confirm:()=>true};
 vm.runInNewContext(source,ctx);
 const reload=()=>{page.alive=false;page.token=null;page.blurred=false;};
 return {elements,page,sent,ports,reload,ctx,tab,update:change=>Promise.all(updated.map(fn=>fn(tab.id,change)))};
}
async function readyToRetell(h){
 await h.elements.analyze.handlers.click();
 await h.elements['start-reading'].handlers.click();
 for(const [id,value] of Object.entries({'main-idea':'내 생각',primary:'정보 하나',support:'정보 둘',relation:'연결'})) h.elements[id].value=value;
}

test('읽기·구조화 중 새로고침되어도 본문이 같으면 다시 주입해 다시 말하기로 이어 간다',async()=>{
 const h=harness();await readyToRetell(h);
 h.reload();
 await h.elements['to-retell'].handlers.click();
 assert.equal(h.page.injections,2,'연결 1회 + 새로고침 뒤 재주입 1회');
 assert.equal(h.elements['retell-view'].hidden,false);
 assert.equal(h.page.blurred,true);
 assert.equal(h.elements['main-idea'].value,'내 생각','작성 내용 유지');
});

test('새로고침 뒤 제목이 같고 일부 줄만 바뀌면 같은 글로 보고 이어 간다(기록용 본문은 연결 때 그대로)',async()=>{
 const h=harness();await readyToRetell(h);
 h.reload();h.page.text=[...ARTICLE.slice(0,3),'조회수 12'].join('\n');h.tab.title='(3) 합성 기사 제목';
 await h.elements['to-retell'].handlers.click();
 assert.equal(h.elements['retell-view'].hidden,false);
 assert.equal(h.page.blurred,true);
 assert.equal(vm.runInContext('articleSession.text',h.ctx),ARTICLE.join('\n'));
});

test('새로고침 뒤 제목이 다르면 본문이 비슷해도 이어 가지 않는다(본문이 완전히 같을 때만 제목과 무관하게 통과)',async()=>{
 const h=harness();await readyToRetell(h);
 h.reload();h.tab.title='다른 기사 제목';h.page.text=[...ARTICLE.slice(0,3),'조회수 12'].join('\n');
 await h.elements['to-retell'].handlers.click();
 assert.equal(h.elements['retell-view'].hidden,true);
 assert.match(h.elements['form-error'].textContent,/같은 글로 확인하지 못했습니다/);
});

test('새로고침 뒤 본문 대부분이 달라졌으면 가리지 않고 읽기 단계에 머문다',async()=>{
 const h=harness();await readyToRetell(h);
 h.reload();h.page.text=[ARTICLE[0],'로그인 후 전체 기사를 볼 수 있습니다.'].join('\n');
 await h.elements['to-retell'].handlers.click();
 assert.equal(h.elements['retell-view'].hidden,true);
 assert.equal(h.elements.reading.hidden,false);
 assert.equal(h.sent.filter(m=>m.action==='TOGGLE_BLUR'&&m.enabled).length,0);
 assert.match(h.elements['form-error'].textContent,/같은 글로 확인하지 못했습니다/);
 assert.doesNotMatch(h.elements['form-error'].textContent,/원문 복원 여부/);
 assert.equal(h.elements['main-idea'].value,'내 생각');
});

test('다시 말하기 중 새로고침되면 읽기로 돌아와 재확인으로 기록하고, 다시 들어갈 수 있다',async()=>{
 const h=harness();await readyToRetell(h);
 await h.elements['to-retell'].handlers.click();
 assert.equal(h.elements['retell-view'].hidden,false);
 h.reload();h.ports.at(-1).fire();
 assert.equal(h.elements['retell-view'].hidden,true);
 assert.equal(h.elements.reading.hidden,false);
 assert.match(h.elements['form-error'].textContent,/이어서 할 수 있습니다/);
 await h.elements['to-retell'].handlers.click();
 assert.equal(h.elements['retell-view'].hidden,false);
 assert.equal(h.page.blurred,true);
 assert.equal(h.elements['revisit-note'].textContent,'이전에 원문을 다시 확인했습니다.');
});

test('새로고침으로 content.js가 없어도 원문 복원(읽기로 돌아가기)이 막히지 않는다',async()=>{
 const h=harness();await readyToRetell(h);
 await h.elements['to-retell'].handlers.click();
 h.reload();
 await h.elements['back-to-reading'].handlers.click();
 assert.equal(h.elements.reading.hidden,false);
 assert.equal(h.elements['retell-view'].hidden,true);
 assert.doesNotMatch(h.elements['retell-status'].textContent,/원문 복원 여부/);
});

function contentPage(text,href){
 const listeners=[];
 const style={getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty(){},removeProperty(){}};
 const node={innerText:text,isConnected:true,style,getBoundingClientRect:()=>({left:0,top:0,width:1,height:1}),querySelectorAll:()=>[]};
 const location={href};
 const context={URL,document:{querySelectorAll:q=>q==='article'?[node]:[],body:node,documentElement:{append(){}},createElement:()=>({style:{},setAttribute(){},remove(){}})},location,crypto:{randomUUID:()=>'token'},window:{addEventListener(){},removeEventListener(){}},chrome:{runtime:{onMessage:{addListener:fn=>listeners.push(fn)}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8'),context);
 const send=m=>{let result;listeners[0](m,{},r=>result=r);return result;};
 return {node,location,send};
}
test('content.js: 주소의 #만 바뀌거나 본문 안 짧은 줄(오디오 플레이어 시간)만 바뀌면 그대로 가린다',()=>{
 const text=['본문',...ARTICLE.slice(0,3),'00:00','/','01:35'].join('\n');
 const p=contentPage(text,'https://news.example.org/arti/1.html');
 p.send({action:'EXTRACT_ARTICLE'});
 p.location.href='https://news.example.org/arti/1.html#google_vignette';
 p.node.innerText=['본문',...ARTICLE.slice(0,3),'5:01'].join('\n');
 assert.equal(p.send({action:'PING_SESSION',token:'token'}).alive,true);
 assert.equal(p.send({action:'TOGGLE_BLUR',enabled:true,token:'token'}).status,'success');
 assert.equal(p.send({action:'TOGGLE_BLUR',enabled:false,token:'token'}).status,'success');
});
test('content.js: 경로가 바뀌거나 본문 대부분이 바뀌면 가리지 않는다',()=>{
 const p=contentPage(ARTICLE.join('\n'),'https://news.example.org/arti/1.html');
 p.send({action:'EXTRACT_ARTICLE'});
 p.location.href='https://news.example.org/arti/2.html';
 assert.equal(p.send({action:'TOGGLE_BLUR',enabled:true,token:'token'}).status,'error');
 p.location.href='https://news.example.org/arti/1.html';
 p.node.innerText=[ARTICLE[0],'로그인 후 전체 기사를 볼 수 있습니다.'].join('\n');
 assert.equal(p.send({action:'PING_SESSION',token:'token'}).alive,false);
 assert.equal(p.send({action:'TOGGLE_BLUR',enabled:true,token:'token'}).status,'error');
});
test('패널: 광고가 주소에 #google_vignette를 붙여도 다시 말하기로 넘어가고, 다시 말하기 중 #만 바뀌면 끊지 않는다',async()=>{
 const h=harness();await readyToRetell(h);
 h.tab.url='https://example.invalid/article#google_vignette';
 await h.elements['to-retell'].handlers.click();
 assert.equal(h.elements['retell-view'].hidden,false);
 assert.doesNotMatch(h.elements['form-error'].textContent,/다른 탭/);
 h.tab.url='https://example.invalid/article#goog_rewarded';
 await h.update({url:h.tab.url});
 assert.equal(h.elements['retell-view'].hidden,false,'#만 바뀌면 다시 말하기 유지');
 assert.equal(h.page.blurred,true);
 h.tab.url='https://example.invalid/other-article';
 await h.update({url:h.tab.url});
 assert.equal(h.elements['retell-view'].hidden,true,'다른 주소로 이동하면 중단');
 assert.match(h.elements['form-error'].textContent,/페이지가 변경/);
});
test('sameArticleUrl은 # 뒷부분만 무시한다',()=>{
 const h=harness();const same=(a,b)=>vm.runInContext('sameArticleUrl('+JSON.stringify(a)+','+JSON.stringify(b)+')',h.ctx);
 assert.equal(same('https://a.example.org/x?id=1','https://a.example.org/x?id=1#google_vignette'),true);
 assert.equal(same('https://a.example.org/x?id=1','https://a.example.org/x?id=2'),false);
 assert.equal(same('https://a.example.org/x','https://a.example.org/y'),false);
});
