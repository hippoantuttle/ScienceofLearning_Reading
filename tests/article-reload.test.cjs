// 작성 중 기사 탭이 새로고침되어 content.js가 사라져도, 본문이 같으면 다시 주입해 다시 말하기로 이어 간다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const worksheet=require('../worksheet.js');
const AIContract=require('../ai-client.js');

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
 const tab={id:10,windowId:5,url:'https://example.invalid/article'};
 // 페이지 상태: alive=false면 content.js가 없는 상태(새로고침 직후)
 const page={alive:true,token:'t1',text:'가상 본문',injections:0,blurred:false};
 const sent=[];const ports=[];
 const chrome={runtime:{sendMessage:async()=>({status:'error'})},windows:{getCurrent:async()=>({id:5})},
  scripting:{executeScript:async()=>{page.injections++;if(!page.alive){page.alive=true;page.token=null;}}},
  tabs:{query:async()=>[tab],get:async()=>tab,
   connect:()=>{const listeners=[];const port={onDisconnect:{addListener:fn=>listeners.push(fn)},disconnect(){},fire(){listeners.forEach(fn=>fn());}};ports.push(port);return port;},
   sendMessage:async(_id,msg)=>{
    if(!page.alive)throw new Error('Could not establish connection. Receiving end does not exist.');
    sent.push(msg);
    if(msg.action==='EXTRACT_ARTICLE'){page.token='t'+(page.injections+1)+'-'+sent.length;page.blurred=false;return{status:'success',text:page.text,charCount:5,wordCount:2,fallback:false,token:page.token};}
    if(msg.action==='PING_SESSION')return{status:'success',alive:msg.token===page.token};
    if(msg.action==='TOGGLE_BLUR'){if(msg.enabled&&msg.token!==page.token)return{status:'error',message:'연결한 본문이 변경되었습니다. 다시 연결하세요.'};page.blurred=msg.enabled;return{status:'success',enabled:msg.enabled};}
   }}};
 const source=fs.readFileSync(path.join(__dirname,'..','sidepanel.js'),'utf8');
 const ctx={document:{getElementById:id=>elements[id]},chrome,URL,Worksheet:worksheet,AIContract,confirm:()=>true};
 vm.runInNewContext(source,ctx);
 const reload=()=>{page.alive=false;page.token=null;page.blurred=false;};
 return {elements,page,sent,ports,reload,ctx};
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

test('새로고침 뒤 본문이 달라졌으면 가리지 않고 읽기 단계에 머문다',async()=>{
 const h=harness();await readyToRetell(h);
 h.reload();h.page.text='바뀐 본문';
 await h.elements['to-retell'].handlers.click();
 assert.equal(h.elements['retell-view'].hidden,true);
 assert.equal(h.elements.reading.hidden,false);
 assert.equal(h.sent.filter(m=>m.action==='TOGGLE_BLUR'&&m.enabled).length,0);
 assert.match(h.elements['form-error'].textContent,/본문이 연결할 때와 달라/);
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
