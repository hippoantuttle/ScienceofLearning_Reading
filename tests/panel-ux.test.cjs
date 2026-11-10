'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const AIContract=require('../ai-client.js'),Worksheet=require('../worksheet.js'),PanelUI=require('../panel-ui.js');
function setup(){
  const elements={},options={confirm:true,restore:true},calls={blur:0,restore:0};
  let focused,activate;
  const document={getElementById(id){return elements[id]??={value:id==='structure'?'claim':'',checked:false,hidden:true,disabled:false,textContent:'',attrs:{},handlers:{},selectedOptions:[{textContent:'주장–근거'}],setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},focus(){focused=id;},reset(){},addEventListener(k,f){this.handlers[k]=f;}};}};
  const tab={id:1,windowId:2,url:'https://example.invalid/synthetic',title:'합성 제목'};
  const chrome={windows:{getCurrent:async()=>({id:2})},scripting:{executeScript:async()=>{}},tabs:{
    query:async()=>[tab],get:async()=>tab,onActivated:{addListener(fn){activate=fn;}},
    connect:()=>({onDisconnect:{addListener(){}},disconnect(){}}),
    sendMessage:async(_id,msg)=>{if(msg.action==='EXTRACT_ARTICLE')return {status:'success',text:'합성 글',token:'synthetic',charCount:4,wordCount:2};
      if(msg.enabled){calls.blur++;return {status:'success',enabled:true};}
      calls.restore++;return options.restore?{status:'success',enabled:false}:{status:'error'};
    }
  }};
  const context=vm.createContext({document,chrome,AIContract,Worksheet,PanelUI,URL,confirm:()=>options.confirm});
  vm.runInContext(fs.readFileSync('sidepanel.js','utf8'),context);
  return {elements,options,calls,context,document,focused:()=>focused,activate:info=>activate(info),fill(){for(const id of ['main-idea','primary','support','relation'])document.getElementById(id).value='직접 작성';}};
}
async function reading(t){await t.elements.analyze.handlers.click();await t.elements['start-reading'].handlers.click();}

test('폼 제출은 누락 칸 오류와 포커스를 제공하고 검사 통과 뒤 한 번만 가린다',async()=>{
  const t=setup();await reading(t);let prevented=0;
  await t.elements.worksheet.handlers.submit({preventDefault(){prevented++;}});
  assert.equal(t.calls.blur,0);assert.equal(t.focused(),'main-idea');assert.equal(t.elements['main-idea'].attrs['aria-invalid'],'true');assert.match(t.elements['main-idea-error'].textContent,/중심 생각/);
  t.elements['main-idea'].value='생각';await t.elements.worksheet.handlers.submit();assert.equal(t.focused(),'primary');
  t.fill();await t.elements['to-retell'].handlers.click({preventDefault(){prevented++;}});
  assert.equal(t.calls.blur,1);assert.equal(prevented,2);assert.equal(t.elements['retell-view'].hidden,false);assert.equal(t.focused(),'retell-input');
  assert.equal(t.elements['main-idea'].attrs['aria-invalid'],undefined);assert.equal(t.elements['main-idea-error'].textContent,'');
});
test('유형을 바꿔도 사용자가 작성한 구조도와 관계 설명은 유지한다',async()=>{
  const t=setup();await reading(t);t.fill();t.elements.structure.value='problem';t.elements.structure.handlers.change();
  assert.equal(t.elements['primary-label'].textContent,'핵심 정보 · 문제');assert.equal(t.elements['support-label'].textContent,'보조 정보 · 해결');
  assert.equal(t.elements.primary.value,'직접 작성');assert.equal(t.elements.relation.value,'직접 작성');
});
test('훈련 종료 취소와 원문 복원 실패는 입력을 보존하고, 성공 뒤 새 글 준비로 초기화한다',async()=>{
  const t=setup();await reading(t);t.fill();await t.elements['to-retell'].handlers.click();t.elements['retell-input'].value='기억';
  t.options.confirm=false;await t.elements['end-training'].handlers.click();assert.equal(t.calls.restore,0);assert.equal(t.elements['retell-input'].value,'기억');
  t.options.confirm=true;t.options.restore=false;await t.elements['end-training'].handlers.click();
  assert.equal(t.elements['retell-view'].hidden,false);assert.equal(t.elements['main-idea'].value,'직접 작성');assert.match(t.elements['retell-status'].textContent,/복원/);
  t.options.restore=true;await t.elements['end-training'].handlers.click();
  assert.equal(vm.runInContext('articleSession',t.context),null);assert.equal(t.elements['retell-input'].value,'');assert.equal(t.elements['main-idea'].value,'');
  assert.equal(t.elements.reading.hidden,true);assert.equal(t.elements.preparation.hidden,false);assert.equal(t.elements['article-result'].hidden,true);assert.equal(t.elements['mock-recommend'].disabled,true);assert.equal(t.focused(),'analyze');
});
test('원문 재확인은 기록되고 빈 Retell은 인라인 오류, 정리 화면은 제목으로 포커스가 이동한다',async()=>{
  const t=setup();await reading(t);t.fill();await t.elements['to-retell'].handlers.click();
  await t.elements['to-review'].handlers.click();assert.equal(t.focused(),'retell-input');assert.match(t.elements['retell-error'].textContent,/작성/);assert.equal(t.calls.restore,0);
  await t.elements['back-to-reading'].handlers.click();assert.equal(vm.runInContext('rechecked',t.context),true);
  await t.elements['to-retell'].handlers.click();assert.match(t.elements['revisit-note'].textContent,/다시 확인/);
  t.elements['retell-input'].value='합성 기억';await t.elements['to-review'].handlers.click();
  assert.equal(t.focused(),'step4');assert.equal(t.elements['review-view'].hidden,false);assert.equal(t.elements['summary-retell'].textContent,'합성 기억');assert.equal(t.elements['retell-input'].attrs['aria-invalid'],undefined);
});
test('탭 전환 때 원문 복원이 실패하면 Retell에 오류를 유지하고 입력을 지우지 않는다',async()=>{
  const t=setup();await reading(t);t.fill();await t.elements['to-retell'].handlers.click();t.options.restore=false;
  await t.activate({windowId:2,tabId:3});assert.equal(t.elements['retell-view'].hidden,false);assert.match(t.elements['retell-status'].textContent,/복원/);assert.equal(t.elements.primary.value,'직접 작성');
});
test('결과 알림은 항상 보이는 상태 영역이 담당하고 완료 버튼과 내부 영수증 ID는 노출하지 않는다',()=>{
  const html=fs.readFileSync('sidepanel.html','utf8');
  assert.doesNotMatch(html,/id="finish"|작성 내용 점검|두 카드/);assert.match(html,/<button id="to-retell" type="submit"/);
  assert.doesNotMatch(html.match(/<div id="ai-result"[^>]*>/)[0],/aria-live/);
  for(const id of ['analyze','ai-login','article-ai-recommend','ai-recommend','mock-recommend','local-preview-run','start-reading','to-retell','submission-send','feedback-request','revision-save']){
    const tag=html.match(new RegExp('<button id="'+id+'"[^>]*>'))[0];const refs=tag.match(/aria-describedby="([^"]+)"/)[1].split(' ');
    for(const ref of refs)assert.ok(html.includes('id="'+ref+'"'),ref);
  }
  const element={attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  PanelUI.tone(element,'error');assert.equal(element.attrs.role,'alert');PanelUI.tone(element,'success');assert.equal(element.attrs.role,'status');
  const context=vm.createContext({});vm.runInContext(fs.readFileSync('panel-ui.js','utf8'),context);assert.equal(typeof context.PanelUI.tone,'function');
});
test('라이트/다크 본문·보조문구·버튼·상태 텍스트의 지정 대비는 모두 4.5 이상이다',()=>{
  const css=fs.readFileSync('sidepanel.css','utf8'),blocks=[...css.matchAll(/:root\s*\{([^}]+)\}/g)];
  const luminance=hex=>{const rgb=hex.replace('#','').match(/../g).map(n=>parseInt(n,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const block of blocks){const colors=Object.fromEntries([...block[1].matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(m=>[m[1],m[2]]));
    for(const fg of ['fg','muted','danger','success','warning','accent'])for(const bg of ['bg','surface'])assert.ok(contrast(colors[fg],colors[bg])>=4.5,fg+'/'+bg);
    assert.ok(contrast(colors['accent-fg'],colors.accent)>=4.5,'primary button');
    assert.ok(contrast(colors.fg,colors['callout-bg'])>=4.5,'callout');
  }
});
