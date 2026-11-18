'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {RUNTIME, readVendor, validateConfig, stripDevelopment, makeZip, assemble, build} = require('../scripts/build-extension.cjs');
const config = {authUrl:'https://synthetic.supabase.co', publicKey:'sb_publishable_synthetic', endpoint:'https://submit.example.org/submissions', aiEndpoint:'https://ai.example.org/recommend', articleTestEnabled:false, feedbackTestEnabled:false};

test('공개 설정은 비밀키·사용자 JWT·로컬 주소·실험 설정을 거부한다', () => {
  assert.deepEqual(validateConfig(config), config);
  for (const publicKey of ['', 'sb_secret_synthetic', 'service_role', 'arbitrary']) assert.throws(() => validateConfig({...config, publicKey}));
  const jwt = payload => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.synthetic';
  assert.equal(validateConfig({...config, publicKey:jwt({role:'anon', ref:'synthetic'})}).authUrl, config.authUrl);
  for (const payload of [{role:'service_role', ref:'synthetic'}, {role:'authenticated', sub:'synthetic'}, {role:'anon', ref:'other'}, {role:'anon', ref:'synthetic', sub:'user'}]) assert.throws(() => validateConfig({...config, publicKey:jwt(payload)}));
  for (const endpoint of ['http://127.0.0.1:8793', 'https://127.0.0.1', 'https://localhost', 'https://example.local', 'https://secret@submit.example.org', 'https://submit.example.org/?token=synthetic', 'https://submit.example.org/#key', 'https://submit.example.org:8443']) assert.throws(() => validateConfig({...config, endpoint}));
  assert.throws(() => validateConfig({...config, allowRepeatedRecommendations:true}));
  assert.throws(() => validateConfig({...config, aiEndpoint:'', articleTestEnabled:true}));
  assert.throws(() => validateConfig({...config, aiEndpoint:new URL(config.endpoint).origin + '/recommend'}));
  for (const endpoint of ['https://submit.example.org', 'https://submit.example.org/', 'https://submit.example.org/submissions/', 'https://submit.example.org/records']) assert.throws(() => validateConfig({...config, endpoint}));
  assert.throws(() => validateConfig({...config, aiEndpoint:'https://reading-prereading-experiment.patrick020308.workers.dev/recommend'}));
  assert.throws(() => validateConfig({...config, aiEndpoint:false}));
  assert.throws(() => validateConfig({...config, feedbackTestEnabled:'false'}));
});

test('설치본은 허용 목록만 읽고 개발 UI·주소·로컬 설정·서버 파일을 제외한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-build-source-'));
  try {
    for (const file of [...RUNTIME, 'manifest.json']) fs.copyFileSync(path.join(__dirname, '..', file), path.join(root, file));
    fs.cpSync(path.join(__dirname, '..', 'vendor', 'pdfjs'), path.join(root, 'vendor', 'pdfjs'), {recursive:true});
    // Synthetic sentinels: any automatic copying of unlisted files is a regression.
    for (const file of ['submission-config.local.js', '.env', '.dev.vars', 'private.pem', 'participant.response.json', 'vendor/pdfjs/unlisted.mjs']) fs.writeFileSync(path.join(root, file), 'SYNTHETIC_EXCLUDED_SENTINEL');
    const result = assemble({root, config});
    const vendorNames = Object.keys(readVendor(root).files);
    assert.ok(vendorNames.includes('vendor/pdfjs/pdf.min.mjs') && vendorNames.some(name => name.startsWith('vendor/pdfjs/cmaps/')));
    assert.deepEqual(Object.keys(result.files).sort(), [...RUNTIME, ...vendorNames, 'manifest.json', 'submission-config.js'].sort());
    for(const page of ['sidepanel.html','pdf-viewer.html']){
      const styles=[...result.files[page].toString().matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>match[1]);
      assert.ok(styles.includes('ui-theme.css'),'shared theme is linked in '+page);
      for(const style of styles)assert.ok(result.files[style]?.length,'packaged stylesheet '+style);
    }
    const all = Object.values(result.files).map(b => b.toString()).join('\n');
    assert.doesNotMatch(all, /SYNTHETIC_EXCLUDED_SENTINEL|http:\/\/127\.0\.0\.1|submission-config\.local|requestMock|allowRepeatedRecommendations|@development-/);
    assert.doesNotMatch(result.files['sidepanel.html'].toString(), /dev-only|mock-token|local-preview|synthetic-submit/);
    assert.deepEqual(result.manifest.host_permissions, ['https://synthetic.supabase.co/*', 'https://submit.example.org/*', 'https://ai.example.org/*']);
    assert.equal(result.extensionId, 'jenapgoakhnmlmjcdnkfakkkgjobbfbb');
    assert.match(result.manifest.content_security_policy.extension_pages, /connect-src 'self' https:\/\/synthetic.supabase.co https:\/\/submit.example.org https:\/\/ai.example.org;/);
    fs.appendFileSync(path.join(root, 'vendor', 'pdfjs', 'pdf.min.mjs'), '\n// tampered');
    assert.throws(() => assemble({root, config}), /vendor 해시 불일치/);
    fs.cpSync(path.join(__dirname, '..', 'vendor', 'pdfjs', 'pdf.min.mjs'), path.join(root, 'vendor', 'pdfjs', 'pdf.min.mjs'));
    assert.ok(makeZip(result.files).equals(makeZip(assemble({root, config}).files)));
    fs.appendFileSync(path.join(root, 'background.js'), '\nconst forbidden = "sb_secret_SYNTHETIC_FOR_BUILD_TEST";');
    assert.throws(() => assemble({root, config}), /비밀값/);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});

test('검토 전용 산출물은 네트워크 권한과 연결을 차단하며 개발 영역 경계 오류를 거절한다', () => {
  const result = assemble({reviewOnly:true});
  assert.deepEqual(result.manifest.host_permissions, []);
  assert.match(result.manifest.content_security_policy.extension_pages, /connect-src 'self';/);
  assert.match(result.files['submission-config.js'].toString(), /"authUrl":""/);
  assert.match(result.manifest.name, /검토 전용/);
  assert.throws(() => assemble({reviewOnly:true, config}));
  for (const source of ['// @development-start\nunfinished', '// @development-end']) assert.throws(() => stripDevelopment(source));
});

function panelFixture(files, fetchImpl, storageData = {}) {
  const html = files['sidepanel.html'].toString(), elements = {};
  let fixtureDocument;
  function element(tag='div'){
    return {tag,tagName:tag.toUpperCase(),value:'',hidden:false,disabled:false,checked:false,children:[],attrs:{},handlers:{},classList:{toggle(){},add(){}},_text:'',
      get textContent(){return this._text+this.children.map(c=>c.textContent).join('');},set textContent(v){this._text=String(v);this.children=[];},
      setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},
      addEventListener(k,v){const old=this.handlers[k];this.handlers[k]=old?async(...args)=>{await old(...args);return v(...args);}:v;},removeEventListener(k,v){if(this.handlers[k]===v)delete this.handlers[k];},focus(){fixtureDocument.activeElement=this;},reset(){},
      matches(selector){return selector.split(',').includes(this.tag.toLowerCase());},
      setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;},
      getBoundingClientRect(){const side=this.attrs['data-side'],id=this.attrs['data-port-node'];const cx=id==='n1'?120:180,cy=id==='n1'?100:340;const dx={left:-70,right:70,top:0,bottom:0}[side]||0,dy={top:-60,bottom:60,left:0,right:0}[side]||0;return side?{left:cx+dx-15,top:cy+dy-15,width:30,height:30}:{left:0,top:0,width:300,height:700};},
      append(...items){for(const x of items){x.parent=this;this.children.push(x);}},prepend(x){x.parent=this;this.children.unshift(x);},
      insertBefore(x,before){x.parent=this;this.children=this.children.filter(c=>c!==x);const at=this.children.indexOf(before);this.children.splice(at<0?this.children.length:at,0,x);},
      remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);},querySelector(selector){return selector==='option[value=""]'?this.children.find(c=>c.value==='')||null:null;},
      selectedOptions:[{textContent:'주장–근거'}]};
  }
  for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const id=tag[1];elements[id]=Object.assign(element(tag[0].match(/^<([\w-]+)/)[1]),{value:id==='structure'?'claim':id==='reading-mode'?'independent':'',hidden:/\shidden\b/.test(tag[0]),disabled:/\sdisabled\b/.test(tag[0])});
  }
  const tab = {id:1, windowId:2, url:'https://article.example.org/synthetic', title:'합성 제목'}, events = {}, calls = {blur:0, restore:0, network:0};
  const panelStorage = {session:{get:async key=>({[key]:structuredClone(storageData[key])}),set:async value=>Object.assign(storageData,structuredClone(value)),remove:async key=>{delete storageData[key]}}};
  const chrome = {storage:panelStorage, windows:{getCurrent:async()=>({id:2})}, scripting:{executeScript:async()=>{}}, tabs:{
    query:async()=>[tab], get:async()=>tab,
    onActivated:{addListener(fn){events.activate=fn;}}, onUpdated:{addListener(fn){events.update=fn;}},
    connect:()=>({onDisconnect:{addListener(){}}, disconnect(){}}),
    sendMessage:async(_id, message)=>{if(message.action==='EXTRACT_ARTICLE')return {status:'success', text:storageData.__articleText||'직접 작성한 가상 글입니다.', wordCount:4, charCount:15, token:'synthetic'};
      if(message.action==='PING_SESSION')return {status:'success', alive:message.token==='synthetic'};
      if(message.enabled)calls.blur++;else calls.restore++;return {status:'success', enabled:!!message.enabled};}
  }};
  const extensionId='jenapgoakhnmlmjcdnkfakkkgjobbfbb', workerListeners=[], panelListeners=[];
  const deliver=(listeners,message,sender)=>new Promise((resolve,reject)=>{if(!listeners.length)return reject(Error('no receiver'));for(const fn of listeners)fn(message,sender,resolve);});
  chrome.identity={getRedirectURL:path=>`https://${extensionId}.chromiumapp.org/${path}`,launchWebAuthFlow:async()=>{throw Error('no fixture login')}};
  chrome.runtime={id:extensionId,getURL:path=>`chrome-extension://${extensionId}/${path}`,onMessage:{addListener:fn=>panelListeners.push(fn)},sendMessage:message=>deliver(workerListeners,message,{id:extensionId,url:`chrome-extension://${extensionId}/sidepanel.html`})};
  const workerChrome={...chrome,action:{onClicked:{addListener(){}}},sidePanel:{setPanelBehavior:async()=>{}},
    storage:{session:{setAccessLevel:async()=>{},get:async key=>({[key]:structuredClone(storageData[key])}),set:async value=>Object.assign(storageData,structuredClone(value)),remove:async key=>{delete storageData[key]}}},
    runtime:{...chrome.runtime,onMessage:{addListener:fn=>workerListeners.push(fn)},sendMessage:async message=>{for(const fn of panelListeners)fn(message,{id:extensionId});}}};
  const worker=vm.createContext({chrome:workerChrome,URL,URLSearchParams,TextEncoder,AbortController,setTimeout,clearTimeout,crypto:globalThis.crypto,atob,btoa,console:{info(){},error(){}},fetch:fetchImpl});
  worker.importScripts=(...names)=>{for(const name of names)vm.runInContext(files[name].toString(),worker,{filename:name});};
  vm.runInContext(files['background.js'].toString(),worker,{filename:'background.js'});
  fixtureDocument={getElementById:id=>elements[id] || null,createElement:element,createElementNS:(_ns,tag)=>element(tag),querySelectorAll:()=>[],activeElement:null};
  const context = vm.createContext({document:fixtureDocument, chrome, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout,
    crypto:globalThis.crypto, structuredClone, atob, btoa,
    confirm:()=>true, MutationObserver:class {observe(){}}, fetch:async(...args)=>{calls.network++;if(fetchImpl)return fetchImpl(...args);throw Error('NETWORK_BLOCKED');}});
  for (const match of html.matchAll(/<script src="([^"]+)"/g)) vm.runInContext(files[match[1]].toString(), context, {filename:match[1]});
  return {elements, context, events, tab, calls, storageData};
}

async function waitFor(check){for(let n=0;n<200;n++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('합성 패널 상태 전환 대기 초과');}
function findBoardElement(t,key){
  const walk=node=>node?.attrs?.['data-board-focus']===key?node:node?.children?.map(walk).find(Boolean);
  const result=walk(t.elements['guided-nodes'])||walk(t.elements['guided-edges']);assert.ok(result,'블록 조작 요소 '+key);return result;
}
const guidedArticle='합성 도서관은 주말에도 문을 연다. 주민들이 주말 운영을 요청했다. 자원봉사자가 운영을 돕는다.';
async function startBlockReview(type='claim') {
  const t=panelFixture(assemble({reviewOnly:true,guidedReview:true}).files,null,{__articleText:guidedArticle}),e=t.elements;
  await e.analyze.handlers.click();e['reading-mode'].value='guided';await e['reading-mode'].handlers.change();
  await e['start-reading'].handlers.click();e.structure.value=type;await e.structure.handlers.change();
  e['guided-source-picker'].open=true;await e['guided-source-picker'].handlers.toggle();
  for(const [index,role] of [[0,'primary'],[1,'support']]) {
    await e['guided-source-list'].children[index].children[1].handlers.click();
    await findBoardElement(t,'place:'+role).handlers.click();
  }
  return t;
}

test('블록 설치본: 세 유형의 네 변 연결점·두 번 클릭·기존 관계 방향·서버 형식',async()=>{
  for(const [type,from,to,relationType] of [['claim','n2','n1','supports'],['cause','n1','n2','causes'],['problem','n2','n1','addresses']]) {
    const t=await startBlockReview(type);
    for(const id of ['n1','n2'])for(const side of ['top','right','bottom','left'])assert.ok(findBoardElement(t,'port:'+id+':'+side));
    assert.equal(vm.runInContext('guidedSession.editor.read().edges.length',t.context),0,'배치만으로 연결 생성 안 함');
    await findBoardElement(t,'port:n1:bottom').handlers.click();
    await findBoardElement(t,'port:n2:top').handlers.click();
    const g=JSON.parse(vm.runInContext('JSON.stringify(guidedSession.editor.validate())',t.context));
    assert.deepEqual(g.edges,[{from,to,relationType}]);
    assert.equal(g.nodes.length,2);assert.equal(t.calls.network,0);
    assert.equal('guided-from' in t.elements,false);assert.equal('guided-to' in t.elements,false);assert.equal('guided-relation' in t.elements,false);
  }
});

test('블록 설치본: 선 삭제·입력란 Delete 보호·문장/설명 보존·Esc 취소·무효화 뒤 콜백 차단',async()=>{
  const t=await startBlockReview(),e=t.elements;
  e.relation.value='직접 작성한 연결 이유';
  await findBoardElement(t,'port:n2:right').handlers.click();await findBoardElement(t,'port:n1:left').handlers.click();
  const before=vm.runInContext('JSON.stringify(guidedSession.editor.read().nodes)',t.context);
  const oldPort=findBoardElement(t,'port:n2:right'),keyboard=e['guided-work'].handlers.keydown;
  let prevented=0;
  await keyboard({key:'Delete',target:e.relation,preventDefault(){prevented++;}});
  assert.equal(prevented,0);assert.equal(vm.runInContext('guidedSession.editor.read().edges.length',t.context),1);
  await keyboard({key:'Delete',target:e['guided-delete-edge'],preventDefault(){prevented++;}});
  assert.equal(vm.runInContext('guidedSession.editor.read().edges.length',t.context),0);
  assert.equal(vm.runInContext('JSON.stringify(guidedSession.editor.read().nodes)',t.context),before);
  assert.equal(e.relation.value,'직접 작성한 연결 이유');assert.equal(e['guided-edge-tools'].hidden,true);
  await findBoardElement(t,'port:n2:top').handlers.click();
  await keyboard({key:'Escape',target:e['guided-nodes'],preventDefault(){}});
  await findBoardElement(t,'port:n1:bottom').handlers.click();
  assert.equal(vm.runInContext('guidedSession.editor.read().edges.length',t.context),0,'Esc로 첫 연결점 선택이 취소됐다');
  await findBoardElement(t,'port:n2:top').handlers.click();await e['guided-delete-edge'].handlers.click();
  assert.equal(vm.runInContext('guidedSession.editor.read().edges.length',t.context),0);
  vm.runInContext('guidedInvalidate()',t.context);
  await oldPort.handlers.click();await keyboard({key:'Delete',target:e['guided-nodes'],preventDefault(){}});
  assert.equal(e['guided-nodes'].children.length,0);assert.equal(e['guided-edge-tools'].hidden,true);
});

test('블록 설치본: 드래그 연결·포인터 취소와 재배열은 기존 출처·연결을 유지한다',async()=>{
  const t=await startBlockReview(),e=t.elements;
  const start=findBoardElement(t,'port:n2:top');
  assert.equal(start.parent.draggable,false,'연결점을 감싼 블록이 HTML 드래그를 가로채지 않는다');
  assert.equal(findBoardElement(t,'drag:n2').draggable,true,'블록 이동은 별도 손잡이에서 시작한다');
  const down={button:0,pointerId:1,clientX:180,clientY:280,stopPropagation(){}};
  await start.handlers.pointerdown(down);await start.handlers.pointermove({pointerId:1,clientX:120,clientY:160});
  await start.handlers.pointercancel();
  assert.equal(vm.runInContext('guidedSession.editor.read().edges.length',t.context),0);
  await start.handlers.pointerdown(down);await start.handlers.pointermove({pointerId:1,clientX:120,clientY:160});
  await start.handlers.pointerup({pointerId:1,clientX:120,clientY:160});
  assert.equal(vm.runInContext('guidedSession.editor.read().edges.length',t.context),1);
  await e['guided-source-list'].children[2].children[1].handlers.click();await findBoardElement(t,'place:support').handlers.click();
  await findBoardElement(t,'port:n3:right').handlers.click();await findBoardElement(t,'port:n1:right').handlers.click();
  const oldEdges=vm.runInContext('JSON.stringify(guidedSession.editor.read().edges)',t.context);
  await findBoardElement(t,'up:n3').handlers.click();
  const g=JSON.parse(vm.runInContext('JSON.stringify(guidedSession.editor.validate())',t.context));
  assert.deepEqual(g.nodes.map(n=>n.sentenceId),['s0001','s0003','s0002']);assert.deepEqual(g.nodes.map(n=>n.order),[0,1,2]);
  assert.equal(JSON.stringify(g.edges),oldEdges);assert.ok(g.nodes.every(n=>n.source==='learner_added'));
  assert.match(vm.runInContext('guidedSession.editor.textFields().support',t.context),/^자원봉사자가/);
});

test('블록 설치본: 원문 드래그 배치와 유형 변경은 기존 연결을 자동 재해석하지 않는다',async()=>{
  const t=await startBlockReview(),e=t.elements;
  const walk=node=>node.attrs?.['data-board-role']==='support'?node:node.children?.map(walk).find(Boolean);
  const zone=walk(e['guided-nodes']);
  await zone.handlers.drop({preventDefault(){},stopPropagation(){},dataTransfer:{getData:()=> 'reading-sentence:s0003'}});
  assert.equal(vm.runInContext('guidedSession.editor.read().nodes.length',t.context),3);
  await findBoardElement(t,'port:n2:left').handlers.click();await findBoardElement(t,'port:n1:right').handlers.click();
  const edges=vm.runInContext('JSON.stringify(guidedSession.editor.read().edges)',t.context);
  e.structure.value='cause';await e.structure.handlers.change();
  assert.equal(vm.runInContext('JSON.stringify(guidedSession.editor.read().edges)',t.context),edges);
  assert.match(e['guided-edges'].textContent,/역할\/유형 확인 필요/);
  await e['guided-to-main'].handlers.click();assert.equal(e['main-idea'].disabled,true);
});
test('초급 설치본: 명시 요청→빈 역할/연결→직접 배치/연결→중심 생각→Retell→v2 저장/재조회',async()=>{
 const {createHandler}=await import('../server/submissions/worker.mjs');
 const {createPilotWorker}=await import('../server/ai/pilot-worker.mjs');
 const origin='chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb',owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const env={ALLOWED_ORIGIN:origin,SUPABASE_URL:config.authUrl,SUPABASE_PUBLISHABLE_KEY:config.publicKey,DEEPSEEK_API_KEY:'synthetic',PILOT_AI_ENABLED:'true',PILOT_GUIDED_CANDIDATES_ENABLED:'true',PILOT_USER_DAILY_LIMIT:'unlimited',PILOT_GLOBAL_DAILY_LIMIT:'unlimited'};
 let row=null,models=0;
 const upstream=async(url,init)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:owner});
  if(url.endsWith('/rpc/is_active_pilot_member'))return Response.json(true);
  if(url.endsWith('/rpc/reading_support_capabilities'))return Response.json({supportSchemaVersion:1,optionalRelation:true});
  if(init.method==='POST'){row={...JSON.parse(init.body),id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',saved_at:'2026-11-12T00:00:00Z'};return new Response(null,{status:201});}
  return Response.json(row?[row]:[]);
 };
 const submissions=createHandler(upstream),ai=createPilotWorker({fetchImpl:upstream,providerFetch:async()=>{models++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({candidateIds:['s0001','s0002','s0003']})}}]});}});
 const fetchImpl=async(url,init)=>{
  const u=new URL(url);if(u.origin===config.authUrl){if(u.pathname==='/auth/v1/token')return Response.json({access_token:'synthetic'});return Response.json(true);}
  const req=new Request(url,{...init,headers:{...init.headers,...(init.method==='POST'?{origin}:{})}});
  return u.origin===new URL(config.aiEndpoint).origin?ai.fetch(req,env):submissions(req,env);
 };
 const files=assemble({config:{...config,guidedReadingEnabled:true}}).files;
 const t=panelFixture(files,fetchImpl,{__articleText:guidedArticle}),e=t.elements;
 e['ai-email'].value='synthetic@example.invalid';e['ai-password'].value='synthetic';await e['account-form'].handlers.submit({preventDefault(){}});
 await e.analyze.handlers.click();e['reading-mode'].value='guided';await e['reading-mode'].handlers.change();assert.equal(models,0);
 await e['start-reading'].handlers.click();await waitFor(()=>vm.runInContext('guidedSession.gate.state().candidateExposure',t.context));
 assert.equal(models,1);assert.equal(e.structure.value,'claim');assert.equal(e['main-idea-block'].hidden,false);assert.equal(e['main-idea'].disabled,true);assert.equal(e['to-retell'].hidden,false);assert.equal(e['to-retell'].disabled,true);
 assert.equal(vm.runInContext('guidedSession.editor.read().nodes.length',t.context),0);
 e.structure.value='claim';await e.structure.handlers.change();
 for(const [index,role]of [[0,'primary'],[1,'support']]){await e['guided-candidates'].children[index].children[1].handlers.click();await findBoardElement(t,'place:'+role).handlers.click();}
 await e['guided-to-main'].handlers.click();assert.equal(e['main-idea'].disabled,true,'미연결은 진행 차단');
 await findBoardElement(t,'port:n2:right').handlers.click();await findBoardElement(t,'port:n1:left').handlers.click();
 const wireBeforeRetell=findBoardElement(t,'port:n2:top');
 await e['guided-to-main'].handlers.click();assert.equal(e['main-idea-block'].hidden,false);assert.equal(e['main-idea'].disabled,false);assert.equal(e['to-retell'].disabled,false);
 assert.equal(e['guided-back-structure'].hidden,false);e['main-idea'].value='주민의 필요를 반영해 도서관 운영을 넓혔다.';
 await e['guided-back-structure'].handlers.click();assert.equal(e['main-idea'].disabled,true);assert.equal(e['to-retell'].disabled,true);assert.equal(e['guided-back-structure'].hidden,true);
 assert.equal(e['main-idea'].value,'주민의 필요를 반영해 도서관 운영을 넓혔다.','구조화로 돌아가도 중심 생각 보존');assert.equal(models,1,'구조화 복귀는 AI 요청을 다시 열지 않는다');
 await e['guided-to-main'].handlers.click();assert.equal(e['main-idea'].disabled,false);assert.equal(e['to-retell'].disabled,false);e.relation.value='';
 await e['to-retell'].handlers.click();assert.equal(e.reading.hidden,true);assert.equal(e['retell-view'].hidden,false);
 assert.equal(e['guided-nodes'].hidden,true);assert.equal(e['guided-edges'].hidden,true);assert.equal(e['guided-edge-tools'].hidden,true);
 await wireBeforeRetell.handlers.click();assert.equal(e['guided-nodes'].hidden,true,'Retell의 오래된 연결점 콜백으로 도움을 다시 열지 않는다');
 assert.equal(vm.runInContext('guidedSession.gate.visibleCandidates().length',t.context),0);
 e['retell-input'].value='합성 마을의 주민 요청에 따라 도서관은 주말에 운영한다.';await e['to-review'].handlers.click();
 assert.equal(e['review-view'].hidden,false);assert.match(e['summary-graph'].textContent,/AI 문장 후보를 본 수행/);
 await e['submission-send'].handlers.click();assert.match(e['submission-status'].textContent,/저장했습니다/);
 assert.equal(row.schema_version,2);assert.equal(row.learning_support.candidateExposure,true);assert.equal(row.learning_support.graph.nodes.length,2);assert.equal(row.relation_text,'');
 assert.deepEqual(Object.keys(row.learning_support.graph.edges[0]).sort(),['from','relationType','to'],'연결점 위치는 기존 서버 계약에 넣지 않는다');
 assert.equal(row.learning_support.graph.nodes.some(n=>n.sentenceId==='s0003'),false,'미사용 후보 텍스트 저장 없음');
 assert.equal(vm.runInContext('panelFlow().verifiedSnapshot().learningSupport.graph.edges.length',t.context),1);
 assert.equal(models,1,'제출/재조회/모드 선택의 자동 AI 호출 없음');
 await e['back-to-reading'].handlers.click();
 const before=vm.runInContext('JSON.stringify(guidedSession.editor.read())',t.context);
 for(const action of ['guided-no-candidates','guided-manual']){
  await e[action].handlers.click();assert.equal(e['guided-return'].hidden,false);
  if(action==='guided-no-candidates'){assert.equal(e['guided-source-picker'].open,true);assert.equal(e['guided-source-list'].children.length,3);}
  if(action==='guided-manual'){e.structure.value='cause';await e.structure.handlers.change();e.primary.value='임시 수동 작성';}
  await e['guided-return'].handlers.click();assert.equal(e.structure.value,'claim');
  assert.equal(vm.runInContext('JSON.stringify(guidedSession.editor.read())',t.context),before);
  assert.equal(e['guided-candidates'].children.length,3);assert.equal(vm.runInContext('guidedSession.gate.state().candidateExposure',t.context),true);
 }
 assert.equal(models,1,'복귀는 기존 후보만 복원하고 새 AI 요청을 하지 않는다');
 await findBoardElement(t,'remove:n1').handlers.click();await findBoardElement(t,'remove:n2').handlers.click();
 assert.equal(vm.runInContext('guidedSession.editor.read().nodes.length',t.context),0);
 assert.equal(vm.runInContext('guidedSession.gate.state().candidateExposure',t.context),true,'블록을 모두 빼도 실제 후보 노출 이력 유지');
});

test('초급 설치본: 늦은 후보 결과·로그아웃 결과 차단, 직접 작성 뒤에도 노출 이력 유지',async()=>{
 const Source=require('../sentence-source.js');let finish;
 const fetchImpl=async(url,init)=>{if(url.includes('/auth/v1/token'))return Response.json({access_token:'synthetic'});if(url.includes('/rpc/'))return Response.json(true);if(url.endsWith('/reading-candidates'))return new Promise(r=>finish=async()=>r(Response.json({kind:'reading-candidates',schemaVersion:1,requestId:JSON.parse(init.body).requestId,documentHash:await Source.hash(guidedArticle),segmentationVersion:'sentence-v1',promptVersion:'reading-candidates-v1',modelId:'synthetic',candidateIds:['s0001','s0002','s0003']})));throw Error('unexpected');};
 for(const action of ['structuring','logout','manual','manual-after-exposure']){
  finish=null;const t=panelFixture(assemble({config:{...config,guidedReadingEnabled:true}}).files,fetchImpl,{__articleText:guidedArticle}),e=t.elements;
  e['ai-email'].value='synthetic@example.invalid';e['ai-password'].value='synthetic';await e['account-form'].handlers.submit({preventDefault(){}});
  await e.analyze.handlers.click();e['reading-mode'].value='guided';await e['reading-mode'].handlers.change();await e['start-reading'].handlers.click();await waitFor(()=>!!finish);
  if(action==='manual-after-exposure'){await finish();await waitFor(()=>vm.runInContext('guidedSession.gate.state().candidateExposure',t.context));}
  if(action==='structuring'){e.structure.value='claim';await e.structure.handlers.change();}
  else if(action==='logout')await e['account-logout'].handlers.click();
  else await e['guided-manual'].handlers.click();
  await finish();await new Promise(r=>setTimeout(r,15));
  assert.equal(e['guided-candidates'].children.length,0);assert.equal(vm.runInContext('guidedSession.gate.state().candidateExposure',t.context),action==='manual-after-exposure');
  if(action==='manual-after-exposure'){e.structure.value='claim';await e.structure.handlers.change();e.primary.value='직접 작성한 합성 주장';e.support.value='직접 작성한 합성 근거';await e['guided-to-main'].handlers.click();const data=vm.runInContext('worksheetSubmissionValues().learningSupport',t.context);assert.equal(data.activity,'manual');assert.equal(data.candidateExposure,true);assert.equal(data.graph,null);}
 }
});

test('실제 패키지 스크립트는 개발 DOM 없이 읽기·Retell·복원·종료를 실행한다', async () => {
  const t = panelFixture(assemble({reviewOnly:true}).files), e=t.elements;
  await e.analyze.handlers.click();
  assert.equal(e['article-result'].hidden, false);
  await e['start-reading'].handlers.click();
  assert.equal(e.reading.hidden, false);
  assert.equal(vm.runInContext('recommendationGate.canRequest()', t.context), false);
  for (const id of ['main-idea','primary','support','relation']) e[id].value='합성 답안';
  await e.worksheet.handlers.submit({preventDefault(){}});
  assert.equal(t.calls.blur, 1); assert.equal(e['retell-view'].hidden, false);
  e['retell-input'].value='합성 다시 말하기';
  await e['to-review'].handlers.click();
  assert.equal(t.calls.restore, 1); assert.equal(e['review-view'].hidden, false);
  assert.equal(e['summary-retell'].textContent, '합성 다시 말하기');
  // No configured service: submission failure is explicit and preserves inputs.
  
  await e['submission-send'].handlers.click();
  assert.match(e['submission-status'].textContent, /설정되지|유지/);
  assert.equal(e['main-idea'].value, '합성 답안');
  await e['end-training'].handlers.click();
  assert.equal(e.preparation.hidden, false); assert.equal(e['main-idea'].value, '');
  assert.equal(t.calls.network, 0);
});

test('원격 설정 설치본도 읽기 중 AI와 과거 기록을 차단하고 탭 전환에서 원문을 복원한다', async () => {
  const t=panelFixture(assemble({config:{...config, articleTestEnabled:true}}).files), e=t.elements;
  await e.analyze.handlers.click(); await e['start-reading'].handlers.click();
  assert.equal(e['article-ai-recommend'].disabled, true); assert.equal(e['ai-result'].hidden, true);
  assert.equal(vm.runInContext('recommendationGate.canRequest()',t.context), false);
  assert.equal(vm.runInContext('recordsCurrent(recordsGeneration)',t.context), false);
  for (const id of ['main-idea','primary','support','relation']) e[id].value='합성 답안';
  await e.worksheet.handlers.submit();
  await t.events.activate({windowId:2, tabId:3});
  assert.equal(e['retell-view'].hidden, true); assert.equal(e.reading.hidden, false); assert.equal(t.calls.restore, 1);
  assert.equal(e.primary.value,'합성 답안'); assert.equal(t.calls.network, 0);
});

test('빌드는 기존 경로를 덮어쓰지 않으며 검토본임을 보고서에 명시한다', () => {
  const label='test-' + require('node:crypto').randomUUID();
  const {destination, report}=build({reviewOnly:true, label});
  try {
    assert.match(report.mode, /review-only/); assert.equal(report.chromeVerified,false); assert.equal(report.remoteVerified,false);
    assert.ok(fs.existsSync(path.join(destination, 'extension.zip')));
    assert.equal(report.runtimeFiles.length, RUNTIME.length+2+Object.keys(readVendor(path.join(__dirname,'..')).files).length);
    assert.ok(fs.existsSync(path.join(destination, 'extension', 'vendor', 'pdfjs', 'pdf.worker.min.mjs')));
    assert.throws(() => build({reviewOnly:true, label}));
    assert.throws(() => build({reviewOnly:true, label:'../escape'}));
  } finally { fs.rmSync(destination, {recursive:true, force:true}); }
});

test('생성된 설치본의 로그인·최초 제출·재조회가 실제 Worker 경로와 일치하고 루트 주소 404를 재현한다', async () => {
  const {createHandler}=await import('../server/submissions/worker.mjs');
  for (const legacyRoot of [true, false]) {
    let row=null, databaseWrites=0;
    const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', recordId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const env={SUPABASE_URL:config.authUrl, SUPABASE_PUBLISHABLE_KEY:config.publicKey, ALLOWED_ORIGIN:'chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb'};
    const worker=createHandler(async(url, options)=>{
      const route=new URL(url).pathname;
      if(route==='/auth/v1/user')return Response.json({id:owner});
      if(route==='/rest/v1/rpc/is_active_pilot_member')return Response.json(true);
      if(route==='/rest/v1/pilot_revisions')return Response.json([]);
      assert.equal(route,'/rest/v1/pilot_submissions');
      if(options.method==='POST'){
        databaseWrites++;row={...JSON.parse(options.body),id:recordId,saved_at:'2026-11-10T00:00:00Z'};
        return new Response(null,{status:201});
      }
      return Response.json(row&&new URL(url).searchParams.get('limit')!=='0'?[row]:[]);
    });
    const paths=[];
    const fetchImpl=async(url, options)=>{
      const route=new URL(url);
      if(route.origin===config.authUrl){
        if(route.pathname==='/auth/v1/token')return Response.json({access_token:'synthetic-account-token'});
        assert.equal(route.pathname,'/rest/v1/rpc/is_active_pilot_member');return Response.json(true);
      }
      assert.equal(route.origin,new URL(config.endpoint).origin);
      paths.push(route.pathname);
      // Browser-added Origin on POST; extension GET may omit it.
      const headers={...options.headers,...(options.method==='POST'?{Origin:env.ALLOWED_ORIGIN}:{})};
      return worker(new Request(url,{...options,headers}),env);
    };
    const files=assemble({config}).files;
    if(legacyRoot)files['submission-config.js']=Buffer.from(files['submission-config.js'].toString().replace(config.endpoint,new URL(config.endpoint).origin));
    const t=panelFixture(files,fetchImpl), e=t.elements;
    e['ai-email'].value='synthetic@example.invalid';e['ai-password'].value='synthetic-only';
    await e['account-form'].handlers.submit({preventDefault(){}});
    assert.equal(e['account-form'].hidden,true);
    await e.analyze.handlers.click();await e['start-reading'].handlers.click();
    for(const id of ['main-idea','primary','support','relation'])e[id].value='합성 답안';
    await e.worksheet.handlers.submit();e['retell-input'].value='합성 다시 말하기';await e['to-review'].handlers.click();
    await e['submission-send'].handlers.click();
    if(legacyRoot){
      assert.match(e['submission-status'].textContent,/저장 요청 실패 \(404\)/);
      assert.equal(databaseWrites,0);assert.equal(e['main-idea'].value,'합성 답안');
      assert.equal(vm.runInContext('panelFlow().verifiedSnapshot()',t.context),null);
      assert.deepEqual(paths,['/']);
    } else {
      assert.match(e['submission-status'].textContent,/저장했습니다/);
      assert.equal(databaseWrites,1);assert.equal(row.main_idea,'합성 답안');
      assert.deepEqual(paths,['/submissions','/submissions']);
      assert.equal(vm.runInContext('panelFlow().verifiedSnapshot().mainIdea',t.context),'합성 답안');
      assert.equal(e['feedback-section'].hidden,false);
      const io=vm.runInContext('RecordClient.create({endpoint:SubmissionConfig.endpoint,getToken:()=>panelFlow().getToken()})',t.context);
      const records=await io.list();
      assert.equal(records.items.length,1);assert.equal(records.items[0].submissionId,recordId);
      assert.deepEqual(paths,['/submissions','/submissions','/submissions/records','/submissions/records']);
    }
  }
});

test('설치본의 제출 장애 복구는 실제 Worker와 연결해 원래 답안·동일 요청·단일 저장을 보존한다', async t => {
  const {createHandler}=await import('../server/submissions/worker.mjs');
  for(const mode of ['offline','lost-save-response','expired-save','expired-read']) await t.test(mode,async()=>{
    const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', recordId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const env={SUPABASE_URL:config.authUrl,SUPABASE_PUBLISHABLE_KEY:config.publicKey,ALLOWED_ORIGIN:'chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb'};
    let row=null, writes=0, rejectIdentity=false, faultPending=true, logins=0;
    const attempts=[];
    const worker=createHandler(async(url,options)=>{
      const route=new URL(url);
      if(route.pathname==='/auth/v1/user')return rejectIdentity?Response.json({},{status:401}):Response.json({id:owner});
      if(route.pathname==='/rest/v1/rpc/is_active_pilot_member')return Response.json(true);
      assert.equal(route.pathname,'/rest/v1/pilot_submissions');
      if(options.method==='POST'){
        const next=JSON.parse(options.body);
        if(row){assert.equal(row.session_id,next.session_id);return new Response(null,{status:409});}
        row={...next,id:recordId,saved_at:'2026-11-10T00:00:00Z'};writes++;
        return new Response(null,{status:201});
      }
      return Response.json(row?[row]:[]);
    });
    const fetchImpl=async(url,options)=>{
      const route=new URL(url);
      if(route.origin===config.authUrl){
        if(route.pathname==='/auth/v1/token')return Response.json({access_token:'synthetic-token-'+(++logins)});
        assert.equal(route.pathname,'/rest/v1/rpc/is_active_pilot_member');return Response.json(true);
      }
      assert.equal(route.origin,new URL(config.endpoint).origin);
      if(options.method==='POST') attempts.push({payload:JSON.parse(options.body),key:options.headers['Idempotency-Key']});
      const inject=faultPending && (mode==='expired-read'?options.method==='GET':options.method==='POST');
      if(inject){
        faultPending=false;
        if(mode==='offline')throw new TypeError('synthetic offline');
        rejectIdentity=mode.startsWith('expired-');
      }
      const response=await worker(new Request(url,{...options,headers:{...options.headers,...(options.method==='POST'?{Origin:env.ALLOWED_ORIGIN}:{})}}),env);
      rejectIdentity=false;
      if(inject && mode==='lost-save-response')throw new TypeError('synthetic response lost after write');
      return response;
    };
    const fixture=panelFixture(assemble({config}).files,fetchImpl),e=fixture.elements;
    const signIn=async email=>{
      e['ai-email'].value=email;e['ai-password'].value='synthetic-only';
      await e['account-form'].handlers.submit({preventDefault(){}});
    };
    await signIn('owner@example.invalid');
    await e.analyze.handlers.click();await e['start-reading'].handlers.click();
    for(const id of ['main-idea','primary','support','relation'])e[id].value='최초 합성 답안';
    await e.worksheet.handlers.submit();e['retell-input'].value='합성 인출';await e['to-review'].handlers.click();
    await e['submission-send'].handlers.click();
    assert.equal(vm.runInContext('panelFlow().verifiedSnapshot()',fixture.context),null);
    assert.equal(e['main-idea'].value,'최초 합성 답안');
    assert.equal(e['feedback-section'].hidden,true);
    assert.doesNotMatch(e['submission-status'].textContent,/확인이 완료/);
    if(mode.startsWith('expired-')){
      assert.equal(e['account-form'].hidden,false,'401이면 제출을 버리지 않고 같은 계정 재로그인을 제공해야 한다');
      assert.match(e['submission-status'].textContent,/만료.*같은 계정/);
      const previousLogins=logins;
      await signIn('other@example.invalid');
      assert.equal(logins,previousLogins,'다른 계정으로 대기 제출을 옮기는 로그인은 전송 전에 차단');
      assert.match(e['account-status'].textContent,/같은 계정/);
      await signIn('owner@example.invalid');assert.equal(e['account-form'].hidden,true);
    }
    e['main-idea'].value='실패 후 편집한 답안';
    await e['submission-send'].handlers.click();
    assert.match(e['submission-status'].textContent,/저장했습니다/);
    assert.equal(writes,1);assert.equal(row.main_idea,'최초 합성 답안');
    assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);
    assert.equal(e['main-idea'].value,'실패 후 편집한 답안');
    assert.equal(vm.runInContext('panelFlow().verifiedSnapshot().mainIdea',fixture.context),'최초 합성 답안');
    assert.equal(e['feedback-section'].hidden,false);
  });
});

test('설치본은 AI 한도·장애 후에도 직접 제출·수정 저장을 허용하고 읽기 중 AI 재요청을 차단한다',async t=>{
  for(const aiStatus of [429,503])await t.test(String(aiStatus),async()=>{
    const recordId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let snapshot=null,revision=null,aiCalls=0;
    const fetchImpl=async(url,options)=>{
      const route=new URL(url);
      if(route.origin===config.authUrl){
        if(route.pathname==='/auth/v1/token')return Response.json({access_token:'synthetic-only'});
        assert.equal(route.pathname,'/rest/v1/rpc/is_active_pilot_member');return Response.json(true);
      }
      if(route.origin===new URL(config.aiEndpoint).origin){
        aiCalls++;return Response.json({error:aiStatus===429?'limit':'unavailable'},{status:aiStatus});
      }
      assert.equal(route.origin,new URL(config.endpoint).origin);
      if(route.pathname==='/submissions'){
        if(options.method==='POST')snapshot=JSON.parse(options.body);
        return Response.json({status:'saved',submissionId:recordId,savedAt:'2026-11-10T00:00:00Z',...(options.method==='GET'?{payload:snapshot}:{})});
      }
      if(route.searchParams.get('capabilities')==='1')return Response.json({recordsApiVersion:1,ready:true});
      assert.ok(route.pathname.startsWith('/submissions/records/'+recordId+'/revisions'));
      if(options.method==='POST'){
        const body=JSON.parse(options.body);
        revision={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',requestId:body.requestId,savedAt:'2026-11-10T00:01:00Z',answers:body.answers};
      }
      return Response.json({status:'saved',revision});
    };
    const fixture=panelFixture(assemble({config:{...config,articleTestEnabled:true,feedbackTestEnabled:true}}).files,fetchImpl),e=fixture.elements;
    e['ai-email'].value='synthetic@example.invalid';e['ai-password'].value='synthetic-only';
    await e['account-form'].handlers.submit({preventDefault(){}});
    await e.analyze.handlers.click();
    await e['article-ai-recommend'].handlers.click();
    assert.equal(aiCalls,1);assert.equal(e['ai-result'].hidden,true);
    assert.match(e['article-ai-status'].textContent,aiStatus===429?/한도/:/실패/);
    await e['start-reading'].handlers.click();
    // Even a forced button state cannot bypass the reading-stage request gate.
    e['article-ai-recommend'].disabled=false;
    e['article-ai-preview'].value='직접 작성한 가상 글입니다.';
    await e['article-ai-recommend'].handlers.click();assert.equal(aiCalls,1);
    for(const id of ['main-idea','primary','support','relation'])e[id].value='직접 쓴 합성 답안';
    await e.worksheet.handlers.submit();e['retell-input'].value='직접 인출';await e['to-review'].handlers.click();
    await e['submission-send'].handlers.click();
    assert.match(e['submission-status'].textContent,/저장했습니다/);
    await e['feedback-request'].handlers.click();
    assert.equal(aiCalls,2);assert.equal(e['feedback-result'].textContent,'');
    assert.match(e['feedback-status'].textContent,aiStatus===429?/한도/:/피드백을 받지 못했습니다/);
    assert.match(e['feedback-status'].textContent,/제출은 저장되어 있습니다/);
    e['feedback-main'].value='AI 없이 직접 고친 합성 답안';
    await e['revision-save'].handlers.click();
    assert.match(e['revision-status'].textContent,/저장 및 재조회 확인/);
    assert.equal(revision.answers.mainIdea,'AI 없이 직접 고친 합성 답안');
    assert.equal(snapshot.mainIdea,'직접 쓴 합성 답안');assert.equal(aiCalls,2);
  });
});

test('Google 설치본은 identity만 선택적으로 추가하고 비밀/임의 OAuth 설정을 거부한다',()=>{
  const result=assemble({config:{...config,googleLoginEnabled:true}});
  assert.deepEqual(result.manifest.permissions,['sidePanel','activeTab','scripting','identity','storage']);
  assert.equal(result.manifest.host_permissions.some(host=>host.includes('google')),false);
  assert.ok(!assemble({config}).manifest.permissions.includes('identity'));
  assert.ok(!assemble({reviewOnly:true}).manifest.permissions.includes('identity'));
  assert.throws(()=>assemble({config:{...config,googleLoginEnabled:'true'}}));
  assert.throws(()=>assemble({config:{...config,googleClientSecret:'synthetic-only'}}));
});

test('Google 설치본은 검증된 계정의 사전 등록 승인 후 로그인하고 만료 시 같은 UID로 원래 제출을 재시도한다',async()=>{
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let eligible=false,currentUser=owner,claims=0,expire=true,payload=null,saves=0;
  const fetchImpl=async(url,options)=>{
    const route=new URL(url);
    if(route.origin===config.authUrl){
      if(route.pathname==='/auth/v1/token'){
        const grant=route.searchParams.get('grant_type');assert.ok(['pkce','refresh_token'].includes(grant));return Response.json({access_token:'synthetic-'+currentUser+(grant==='refresh_token'?'-renewed':''),refresh_token:'synthetic-refresh',expires_in:3600,user:{id:currentUser}});
      }
      if(route.pathname==='/auth/v1/user')return Response.json({id:currentUser,email:currentUser===owner?'owner@example.invalid':'other@example.invalid',email_confirmed_at:'2026-11-10T00:00:00Z',identities:[{provider:'google',identity_data:{email:currentUser===owner?'owner@example.invalid':'other@example.invalid',email_verified:true}}]});
      if(route.pathname.endsWith('/claim_google_pilot_access')){claims++;assert.deepEqual(JSON.parse(options.body),{});return Response.json(eligible);}
      assert.ok(route.pathname.endsWith('/is_active_pilot_member'));return Response.json(true);
    }
    assert.equal(route.pathname,'/submissions');
    if(expire)return Response.json({error:'unauthorized'},{status:401});
    if(options.method==='POST'){payload=JSON.parse(options.body);saves++;}
    return Response.json({status:'saved',submissionId:other,savedAt:'2026-11-10T00:00:00Z',...(options.method==='GET'?{payload}:{})});
  };
  const fixture=panelFixture(assemble({config:{...config,googleLoginEnabled:true}}).files,fetchImpl),e=fixture.elements;
  fixture.context.chrome.identity.launchWebAuthFlow=async({url})=>{const callback=new URL(new URL(url).searchParams.get('redirect_to'));callback.searchParams.set('code','synthetic-code');return callback.href;};
  assert.equal(e['account-form'].hidden,true);assert.equal(e['account-google'].hidden,false);
  await e['account-google-login'].handlers.click();assert.match(e['account-status'].textContent,/사전 등록/);
  assert.equal(vm.runInContext('panelFlow().getToken()',fixture.context),null);
  eligible=true;await e['account-google-login'].handlers.click();assert.equal(e['account-google'].hidden,true);
  assert.match(e['account-identity'].textContent,/owner@example.invalid/);
  await e.analyze.handlers.click();await e['start-reading'].handlers.click();
  for(const id of ['main-idea','primary','support','relation'])e[id].value='Google 합성 답안';
  await e.worksheet.handlers.submit();e['retell-input'].value='합성 인출';await e['to-review'].handlers.click();
  await e['submission-send'].handlers.click();
  assert.equal(e['account-google'].hidden,false);assert.equal(e['main-idea'].value,'Google 합성 답안');
  const before=claims;currentUser=other;await e['account-google-login'].handlers.click();
  assert.equal(claims,before);assert.match(e['account-status'].textContent,/같은 Google/);
  currentUser=owner;expire=false;await e['account-google-login'].handlers.click();await e['submission-send'].handlers.click();
  assert.equal(saves,1);assert.match(e['submission-status'].textContent,/저장했습니다/);
});

test('Google 설치본은 패널·워커 재생성 후 복원하고 자동 AI/기록 호출 없이 브라우저 세션 종료를 반영한다',async()=>{
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',storage={},calls=[];
  const fetchImpl=async(url)=>{
    calls.push(url);const route=new URL(url);
    if(route.pathname==='/auth/v1/token')return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:owner}});
    if(route.pathname==='/auth/v1/user')return Response.json({id:owner,email:'reader@example.invalid',email_confirmed_at:'synthetic-confirmed',identities:[{provider:'google',identity_data:{email:'reader@example.invalid',email_verified:true}}]});
    if(route.pathname==='/auth/v1/logout')return new Response(null,{status:204});
    assert.ok(route.pathname.startsWith('/rest/v1/rpc/'));return Response.json(true);
  };
  const files=assemble({config:{...config,googleLoginEnabled:true}}).files;
  const first=panelFixture(files,fetchImpl,storage);
  first.context.chrome.identity.launchWebAuthFlow=async({url})=>{const callback=new URL(new URL(url).searchParams.get('redirect_to'));callback.searchParams.set('code','synthetic-code');return callback.href;};
  await first.elements['account-google-login'].handlers.click();
  assert.match(first.elements['account-identity'].textContent,/reader@example/);
  const reopened=panelFixture(files,fetchImpl,storage);
  await vm.runInContext('panelRestoreSession()',reopened.context);
  assert.match(reopened.elements['account-identity'].textContent,/reader@example/);
  assert.equal(calls.filter(u=>u.includes('/auth/v1/token')).length,1,'복원은 OAuth를 다시 실행하지 않는다');
  assert.equal(calls.some(u=>u.includes('/recommend')||u.includes('/records')),false,'복원은 사용자 콘텐츠를 요청하지 않는다');
  await reopened.elements['account-logout'].handlers.click();
  assert.equal(Object.keys(storage).length,0);
  const signedOut=panelFixture(files,fetchImpl,storage);
  await vm.runInContext('panelRestoreSession()',signedOut.context);
  assert.equal(signedOut.elements['account-signed-in'].hidden,true);
  assert.equal(calls.some(u=>u.includes('/logout?scope=local')),true);
  const restarted=panelFixture(files,fetchImpl,{});
  await vm.runInContext('panelRestoreSession()',restarted.context);
  assert.equal(restarted.elements['account-signed-in'].hidden,true);
});

test('Google 설치본의 저장은 401 뒤 같은 내용으로 한 번 갱신 재시도하고 피드백도 최신 토큰을 사용한다',async()=>{
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',recordId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let refreshes=0,aiCalls=0,snapshot;const attempts=[];
  const fetchImpl=async(url,options)=>{
    const route=new URL(url);
    if(route.pathname==='/auth/v1/token'){
      if(route.searchParams.get('grant_type')==='refresh_token')refreshes++;
      return Response.json({access_token:refreshes?'synthetic-new':'synthetic-old',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:owner}});
    }
    if(route.pathname==='/auth/v1/user')return Response.json({id:owner,email:'reader@example.invalid',email_confirmed_at:'confirmed',identities:[{provider:'google',identity_data:{email:'reader@example.invalid',email_verified:true}}]});
    if(route.pathname.startsWith('/rest/v1/rpc/'))return Response.json(true);
    if(route.pathname==='/submissions'){
      if(options.method==='POST'){
        attempts.push(options);
        if(attempts.length===1)return Response.json({error:'unauthorized'},{status:401});
        snapshot=JSON.parse(options.body);
      }
      assert.equal(options.headers.Authorization,'Bearer synthetic-new');
      return Response.json({status:'saved',submissionId:recordId,savedAt:'2026-11-11T00:00:00Z',...(options.method==='GET'?{payload:snapshot}:{})});
    }
    assert.equal(route.pathname,'/feedback');assert.equal(options.headers.Authorization,'Bearer synthetic-new');aiCalls++;
    return Response.json({kind:'feedback',feedback:{overall:'직접 관계를 잘 잡았습니다.',criteria:[{name:'핵심 내용 포함',reason:'r'},{name:'변형/자기 언어화',reason:'r'},{name:'정확성',reason:'r'},{name:'구조/응집성',reason:'r'}],strengths:[{quote:'q',comment:'c'}],improvements:[{quote:'q',direction:'d'}],missingIdea:''}});
  };
  const t=panelFixture(assemble({config:{...config,googleLoginEnabled:true,feedbackTestEnabled:true}}).files,fetchImpl),e=t.elements;
  t.context.chrome.identity.launchWebAuthFlow=async({url})=>{const callback=new URL(new URL(url).searchParams.get('redirect_to'));callback.searchParams.set('code','synthetic-code');return callback.href;};
  await e['account-google-login'].handlers.click();assert.equal(aiCalls,0);
  await e.analyze.handlers.click();await e['start-reading'].handlers.click();
  for(const id of ['main-idea','primary','support','relation'])e[id].value='합성 답안';
  await e.worksheet.handlers.submit();e['retell-input'].value='합성 인출';await e['to-review'].handlers.click();
  await e['submission-send'].handlers.click();
  assert.equal(refreshes,1);assert.equal(attempts.length,2);
  assert.equal(attempts[0].body,attempts[1].body);assert.equal(attempts[0].headers['Idempotency-Key'],attempts[1].headers['Idempotency-Key']);
  assert.match(e['submission-status'].textContent,/저장했습니다/);
  await e['feedback-request'].handlers.click();assert.equal(aiCalls,1);assert.match(e['feedback-result'].textContent,/직접 관계/);
});

test('초급 UI 검토본은 기본 비활성 제품 스위치와 분리되고 네트워크 권한이 없다',()=>{
 const normal=assemble({config}).files;assert.doesNotMatch(normal['submission-config.js'].toString(),/"guidedReadingEnabled":true/);
 const review=assemble({reviewOnly:true,guidedReview:true});assert.deepEqual(review.manifest.host_permissions,[]);assert.match(review.files['submission-config.js'].toString(),/"guidedReadingEnabled":true/);
 assert.match(review.manifest.content_security_policy.extension_pages,/connect-src 'self';/);
 assert.throws(()=>assemble({config,guidedReview:true}));assert.throws(()=>validateConfig({...config,guidedReadingEnabled:'true'}));
});

// TASK-027 C: 임시저장(chrome.storage.session)과 이어가기. 합성 글·답안만 사용하며 네트워크 호출이 없어야 한다.
async function guidedMainIdeaPanel(){
  const t=await startBlockReview(),e=t.elements;
  await findBoardElement(t,'port:n2:right').handlers.click();await findBoardElement(t,'port:n1:left').handlers.click();
  await e['guided-to-main'].handlers.click();assert.equal(e['main-idea'].disabled,false);
  e['main-idea'].value='합성 중심 생각';e.relation.value='합성 이유';e.prior.value='합성 메모';
  return t;
}
const draftKey='readingTrainingDraft';
test('TASK-027 C: 초급 구조화 중 임시저장은 해시·처음 불러온 웹 본문·배치·연결만 담고, 새 패널에서 AI 재요청 없이 그대로 이어간다',async()=>{
  const t1=await guidedMainIdeaPanel();
  await vm.runInContext('draftFlush()',t1.context);
  const saved=t1.storageData[draftKey];assert.ok(saved,'임시저장 생성');
  assert.equal(saved.step,'reading');assert.equal(saved.guided.stage,'mainIdea');assert.equal(saved.guided.graph.nodes.length,2);assert.equal(saved.guided.graph.edges.length,1);
  assert.match(saved.article.textHash,/^[0-9a-f]{64}$/);assert.equal(saved.article.text,guidedArticle,'웹 기사는 처음 불러온 본문을 담는다');assert.equal(Object.values(saved.fields).includes(guidedArticle),false);assert.equal(JSON.stringify(saved.guided).includes(guidedArticle),false);
  assert.equal(saved.fields['main-idea'],'합성 중심 생각');assert.equal(saved.owner,null);
  const t2=panelFixture(assemble({reviewOnly:true,guidedReview:true}).files,null,t1.storageData),e=t2.elements;
  await waitFor(()=>e['draft-resume'].hidden===false);assert.match(e['draft-resume-summary'].textContent,/읽기·구조화 단계/);
  await e['draft-resume-continue'].handlers.click();
  await waitFor(()=>e.reading.hidden===false&&vm.runInContext('guidedSession?.stage',t2.context)==='mainIdea');
  assert.equal(e['draft-resume'].hidden,true);assert.equal(e['main-idea'].value,'합성 중심 생각');assert.equal(e['main-idea'].disabled,false);assert.equal(e.prior.value,'합성 메모');assert.equal(e.relation.value,'합성 이유');
  const graph=JSON.parse(vm.runInContext('JSON.stringify(guidedSession.editor.validate())',t2.context));
  assert.equal(graph.nodes.length,2);assert.equal(graph.edges.length,1);
  assert.equal(vm.runInContext('guidedSession.gate.state().requestClosed',t2.context),true,'이어가기는 AI 후보 요청을 열지 않는다');
  assert.equal(t2.calls.network,0);assert.equal(vm.runInContext('rechecked',t2.context),false,'읽기 단계 이어가기는 재확인이 아니다');
  await e['to-retell'].handlers.click();assert.equal(e['retell-view'].hidden,false);
});
test('TASK-027 C: 다시 말하기 단계 이어가기는 원문을 다시 가리고 재확인으로 기록한다',async()=>{
  const t1=await guidedMainIdeaPanel(),e1=t1.elements;
  await e1['to-retell'].handlers.click();e1['retell-input'].value='합성 다시 말하기';
  await vm.runInContext('draftFlush()',t1.context);assert.equal(t1.storageData[draftKey].step,'retell-view');
  const t2=panelFixture(assemble({reviewOnly:true,guidedReview:true}).files,null,t1.storageData),e=t2.elements;
  await waitFor(()=>e['draft-resume'].hidden===false);await e['draft-resume-continue'].handlers.click();
  await waitFor(()=>e['retell-view'].hidden===false);
  assert.equal(t2.calls.blur,1);assert.equal(e['retell-input'].value,'합성 다시 말하기');assert.equal(vm.runInContext('rechecked',t2.context),true);
  assert.match(e['revisit-note'].textContent,/재확인/);assert.equal(e['guided-nodes'].hidden,true,'Retell에서 구조도 도움을 가린다');assert.equal(t2.calls.network,0);
});
test('TASK-027 C: 본문이 바뀌면 이어가지 않고 임시저장을 남기며, 삭제·훈련 종료·저장 완료 때 지운다',async()=>{
  const t1=await guidedMainIdeaPanel();await vm.runInContext('draftFlush()',t1.context);
  const changed={...structuredClone(t1.storageData),__articleText:'합성 도서관은 평일에만 문을 연다. 다른 글이다. 내용이 바뀌었다.'};
  const t2=panelFixture(assemble({reviewOnly:true,guidedReview:true}).files,null,changed),e=t2.elements;
  await waitFor(()=>e['draft-resume'].hidden===false);await e['draft-resume-continue'].handlers.click();
  await waitFor(()=>/본문 대부분이/.test(e['draft-resume-status'].textContent));
  assert.equal(e['draft-resume'].hidden,false);assert.ok(changed[draftKey],'불일치 시 임시저장 유지');
  await e['draft-resume-discard'].handlers.click();await waitFor(()=>!changed[draftKey]);assert.equal(e['draft-resume'].hidden,true);
  const t3=await guidedMainIdeaPanel();await vm.runInContext('draftFlush()',t3.context);
  await t3.elements['to-retell'].handlers.click();await t3.elements['end-training'].handlers.click();await waitFor(()=>!t3.storageData[draftKey]);
  const t4=await guidedMainIdeaPanel();await vm.runInContext('draftFlush()',t4.context);assert.ok(t4.storageData[draftKey]);
  t4.elements['training-context'].dataset={saved:'true'};await vm.runInContext('draftFlush()',t4.context);assert.equal(t4.storageData[draftKey],undefined,'저장 완료 뒤에는 임시저장 삭제');
});

test('웹 기사 임시저장은 같은 주소·제목이고 본문 대부분이 같으면 일부 줄이 바뀌어도 이어가고, 대부분 다르면 이어가지 않는다',async()=>{
  const lines=['합성 기사 첫 문단은 도서관 운영 시간을 길게 설명한다. 주말 운영과 평일 운영의 차이를 비교한다.','합성 기사 둘째 문단은 이용자 설문 결과를 자세히 소개하고 연장 운영의 필요성을 주장한다.','합성 기사 셋째 문단은 예산 문제와 인력 배치 계획을 함께 다루며 결론을 제시한다.','조회수 10'];
  const t1=panelFixture(assemble({reviewOnly:true}).files,null,{__articleText:lines.join('\n')}),e1=t1.elements;
  await e1.analyze.handlers.click();await e1['start-reading'].handlers.click();
  e1['main-idea'].value='합성 중심';e1.primary.value='합성 주장';e1.support.value='합성 근거';
  await vm.runInContext('draftFlush()',t1.context);
  const saved=t1.storageData[draftKey];assert.equal(saved.article.title,'합성 제목');assert.equal(saved.article.text,lines.join('\n'));
  const slightly={...structuredClone(t1.storageData),__articleText:[...lines.slice(0,3),'조회수 12'].join('\n')};
  const t2=panelFixture(assemble({reviewOnly:true}).files,null,slightly),e2=t2.elements;
  await waitFor(()=>e2['draft-resume'].hidden===false);await e2['draft-resume-continue'].handlers.click();
  await waitFor(()=>e2.reading.hidden===false);assert.equal(e2['main-idea'].value,'합성 중심');assert.equal(e2.primary.value,'합성 주장');
  assert.equal(vm.runInContext('articleSession.text',t2.context),lines.join('\n'),'처음 불러온 본문으로 이어간다');
  const mostly={...structuredClone(t1.storageData),__articleText:[lines[0],'로그인 후 전체 기사를 볼 수 있습니다.'].join('\n')};
  const t3=panelFixture(assemble({reviewOnly:true}).files,null,mostly),e3=t3.elements;
  await waitFor(()=>e3['draft-resume'].hidden===false);await e3['draft-resume-continue'].handlers.click();
  await waitFor(()=>/본문 대부분이/.test(e3['draft-resume-status'].textContent));assert.equal(e3.reading.hidden,true);assert.ok(mostly[draftKey],'불일치 시 임시저장 유지');
});

test('초급: 본문 일부가 바뀐 같은 글이면 임시저장을 처음 불러온 본문·배치 그대로 이어가고, 같은 주소 새로고침은 초급 세션을 무효화하지 않는다',async()=>{
  const t1=await guidedMainIdeaPanel();
  assert.equal(vm.runInContext('guidedInvalidated',t1.context),false);
  t1.events.update(1,{status:'loading'});assert.equal(vm.runInContext('guidedInvalidated',t1.context),false,'같은 주소 새로고침');
  await vm.runInContext('draftFlush()',t1.context);
  const changed={...structuredClone(t1.storageData),__articleText:guidedArticle+'\n조회수 3'};
  const t2=panelFixture(assemble({reviewOnly:true,guidedReview:true}).files,null,changed),e=t2.elements;
  await waitFor(()=>e['draft-resume'].hidden===false);await e['draft-resume-continue'].handlers.click();
  await waitFor(()=>e.reading.hidden===false&&vm.runInContext('guidedSession?.stage',t2.context)==='mainIdea');
  assert.equal(vm.runInContext('articleSession.text',t2.context),guidedArticle,'처음 불러온 본문 유지');
  const graph=JSON.parse(vm.runInContext('JSON.stringify(guidedSession.editor.validate())',t2.context));
  assert.equal(graph.nodes.length,2);assert.equal(graph.edges.length,1);assert.equal(t2.calls.network,0);
  t2.events.update(1,{url:'https://article.example.org/other'});assert.equal(vm.runInContext('guidedInvalidated',t2.context),true,'주소가 바뀌면 무효화');
});

test('TASK-028 중급: 관계 카드 추가·빈칸 검사·삭제, 합친 값으로 정리·저장 값 구성, 임시저장 포함',async()=>{
  const t=panelFixture(assemble({reviewOnly:true}).files),e=t.elements;
  await e.analyze.handlers.click();await e['start-reading'].handlers.click();
  e['main-idea'].value='합성 중심';e.primary.value='합성 주장 하나';e.support.value='합성 근거 하나';
  assert.equal(e.pair2.hidden,true);assert.equal(e['pair1-title'].hidden,true);
  await e['pair-add'].handlers.click();assert.equal(e.pair2.hidden,false);assert.equal(e['pair1-title'].hidden,false);
  await e['pair-add'].handlers.click();e['pair3-primary'].value='지울 주장';
  await e['pair3-remove'].handlers.click();assert.equal(e.pair3.hidden,true);assert.equal(e['pair3-primary'].value,'');
  e['pair2-primary'].value='합성 주장 둘';
  await e.worksheet.handlers.submit({preventDefault(){}});
  assert.equal(t.calls.blur,0,'추가 관계의 빈칸이 있으면 원문을 가리지 않는다');
  assert.equal(e['pair2-support'].attrs['aria-invalid'],'true');assert.match(e['pair2-support-error'].textContent,/관계 2/);
  e['pair2-support'].value='합성 근거 둘';e['pair2-relation'].value='합성 이유 둘';
  const packed=JSON.parse(vm.runInContext('JSON.stringify(worksheetSubmissionValues())',t.context));
  assert.equal(packed.primary,'[관계 1]\n합성 주장 하나\n\n[관계 2]\n합성 주장 둘');
  assert.equal(packed.relation,'[관계 1]\n\n\n[관계 2]\n합성 이유 둘');
  const draft=await vm.runInContext('draftCollect()',t.context);
  assert.equal(draft.fields['pair2-support'],'합성 근거 둘');assert.ok(vm.runInContext('TrainingDraft',t.context).validate(draft));
  await e.worksheet.handlers.submit({preventDefault(){}});assert.equal(t.calls.blur,1);
  e['retell-input'].value='합성 다시 말하기';await e['to-review'].handlers.click();
  assert.equal(e['review-view'].hidden,false);
  const view=e['summary-graph'].children.find(c=>c.className==='pair-view');
  assert.ok(view,'정리 화면에 관계별 보기');assert.equal(view.children.length,2);assert.match(view.children[1].textContent,/합성 주장 둘.*합성 근거 둘.*합성 이유 둘/s);
  assert.equal(e['summary-primary'].textContent,'위 관계별 보기 참고','같은 내용을 필드별로 반복하지 않는다');
  vm.runInContext('pairReset()',t.context);assert.equal(e.pair2.hidden,true);assert.equal(e['pair2-primary'].value,'');
  e['pair3-support'].value='복원된 근거';vm.runInContext('pairShowFilled()',t.context);
  assert.equal(e.pair2.hidden,false);assert.equal(e.pair3.hidden,false);assert.equal(e.pair4.hidden,true,'값이 있는 마지막 카드까지 복원');
});

test('TASK-028 초급: 주장 기준 관계 카드에 연결된 근거가 묶이고, 카드에 바로 근거를 놓으면 연결까지 된다(저장 형식 동일)',async()=>{
  const t=await startBlockReview(),e=t.elements;
  const zone=role=>{const walk=node=>node.attrs?.['data-board-role']===role?node:node.children?.map(walk).find(Boolean);return walk(e['guided-nodes']);};
  const pair=id=>{const walk=node=>node.attrs?.['data-pair']===id?node:node.children?.map(walk).find(Boolean);return walk(e['guided-nodes']);};
  assert.ok(pair('n1'),'주장 블록마다 관계 카드');assert.match(zone('support').textContent,/주민들이 주말 운영을 요청했다/,'연결 전 근거는 짝 없는 영역');
  await findBoardElement(t,'port:n2:top').handlers.click();await findBoardElement(t,'port:n1:bottom').handlers.click();
  assert.match(pair('n1').textContent,/주민들이 주말 운영을 요청했다/);assert.doesNotMatch(zone('support').textContent,/주민들이/);
  await e['guided-source-list'].children[2].children[1].handlers.click();
  await findBoardElement(t,'pair-place:n1').handlers.click();
  const g=JSON.parse(vm.runInContext('JSON.stringify(guidedSession.editor.validate())',t.context));
  assert.deepEqual(g.edges,[{from:'n2',to:'n1',relationType:'supports'},{from:'n3',to:'n1',relationType:'supports'}]);
  assert.match(pair('n1').textContent,/자원봉사자가/);
  const fields=JSON.parse(vm.runInContext('JSON.stringify(guidedSession.editor.textFields())',t.context));
  assert.equal(fields.support,'주민들이 주말 운영을 요청했다.\n자원봉사자가 운영을 돕는다.','저장 문자열 형식은 그대로');
  assert.equal(t.calls.network,0);
});
