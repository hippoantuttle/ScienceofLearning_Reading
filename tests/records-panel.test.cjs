'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const RecordClient=require('../record-client.js');
const id='11111111-1111-4111-8111-111111111111';
function setup({session=null,restore=true,confirm=true,list,detail,revisions}={}){
  class Element{
    constructor(tag='div'){this.tag=tag;this.handlers={};this.children=[];this.hidden=false;this.disabled=false;this.value='';this.checked=false;this._text='';}
    set textContent(value){this._text=value;this.children=[];}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    append(...children){this.children.push(...children);}
    addEventListener(type,fn){this.handlers[type]=fn;}
    focus(){this.focused=true;}
    reset(){this.didReset=true;}
  }
  const e={},document={getElementById:name=>e[name]??=new Element(),createElement:tag=>new Element(tag)},calls={list:0,restore:0,reset:0,confirm:0,expire:0};
  const io={list:async()=>{calls.list++;return list?list():{items:[],nextCursor:null};},detail:detail||(async()=>({status:'saved',submissionId:id,savedAt:'2026-11-10T00:00:00Z',payload:{mainIdea:'<img src=x onerror=alert(1)>',primary:'최초 핵심',support:'최초 보조',relation:'최초 관계',retell:'최초 Retell'}})),revisions:revisions||(async()=>({items:[{id:'revision',savedAt:'2026-11-10T01:00:00Z',answers:{mainIdea:'저장 수정',primary:'수정 핵심',support:'수정 보조',relation:'수정 관계',retell:'수정 Retell'}}],nextCursor:null}))};
  const ctx=vm.createContext({document,articleSession:session,operationBusy:false,analyzeButton:{disabled:false},confirm:()=>{calls.confirm++;return confirm;},restoreBlind:async()=>{calls.restore++;return restore;},recommendationGate:{reset(){}},resetPanelSubmission(){calls.reset++;},panelFlow:()=>({getToken:()=> 'A'}),panelExpireAccount(){calls.expire++;},SubmissionConfig:{endpoint:'https://example.invalid/submissions'},RecordClient:{create:()=>io},Date,Number,Array,String});
  vm.runInContext(fs.readFileSync('records-panel.js','utf8'),ctx);
  e['records-section']=document.getElementById('records-section');e['records-section'].hidden=true;
  return {ctx,e,calls,document};
}
test('독해 도중 기록 이동 취소·복원 실패는 조회를 차단하고 입력을 유지한다',async()=>{
  for(const options of [{confirm:false},{restore:false}]){
    const t=setup({session:{token:'fixture'},...options});t.document.getElementById('prior').value='미저장 생각';
    await t.e['records-open'].handlers.click();assert.equal(t.calls.list,0);assert.equal(t.e.prior.value,'미저장 생각');assert.equal(t.e['records-section'].hidden,true);
  }
});
test('명시 종료·원문 복원 뒤에만 기록을 조회하며 이전 articleSession 없이 다시 열 수 있다',async()=>{
  const t=setup({session:{token:'fixture'}});await t.e['records-open'].handlers.click();
  assert.equal(t.calls.restore,1);assert.equal(t.calls.list,1);assert.equal(t.ctx.articleSession,null);assert.equal(t.e['records-section'].hidden,false);assert.match(t.e['records-status'].textContent,/기록이 없습니다/);
  t.e['records-close'].handlers.click();assert.equal(t.e['records-section'].hidden,true);assert.equal(t.e.preparation.hidden,false);
  await t.e['records-open'].handlers.click();assert.equal(t.calls.restore,1);assert.equal(t.calls.list,2);
});
test('이전 세션 없는 최초본·수정본 선택 조회는 HTML을 텍스트로 표시하고 훈련 입력에 채우지 않는다',async()=>{
  const t=setup();await t.e['records-open'].handlers.click();await t.ctx.recordsSelect(id);
  assert.equal(t.e['records-detail'].hidden,false);assert.match(t.e['records-content'].textContent,/<img src=x/);
  assert.equal(t.e['records-content'].children.some(c=>c.tag==='img'),false);
  t.e['records-versions'].value='revision';t.e['records-versions'].handlers.change();assert.match(t.e['records-content'].textContent,/저장 수정/);
  assert.equal(t.document.getElementById('main-idea').value,'');
});
test('다른 기록·새 훈련·로그아웃으로 세대가 바뀌면 늦은 조회 응답을 폐기한다',async()=>{
  let resolve;const t=setup({list:()=>new Promise(r=>resolve=r)});const pending=t.e['records-open'].handlers.click();
  await Promise.resolve();await Promise.resolve();t.ctx.resetRecordsPanel();t.ctx.articleSession={token:'new'};
  resolve({items:[{submissionId:id,articleTitle:'과거 답안'}],nextCursor:null});await pending;
  assert.equal(t.e['records-list'].children.length,0);
});
test('만료·비활성 안내는 저장본 화면을 비우고 재로그인을 안내한다',async()=>{
  const error=Object.assign(Error('다시 로그인하세요.'),{status:401}),t=setup({list:()=>{throw error;}});
  await t.e['records-open'].handlers.click();assert.equal(t.calls.expire,1);assert.equal(t.e['records-detail'].hidden,true);assert.match(t.e['records-status'].textContent,/로그인/);
});
test('기록 API는 만료·충돌·오프라인을 구분하며 비인증 요청과 부적절한 주소를 거절한다',async()=>{
  for(const status of [401,403,404,409]){
    const io=RecordClient.create({endpoint:'https://example.invalid/submissions',getToken:()=> 'A',fetchImpl:async url=>String(url).endsWith('?capabilities=1')?Response.json({recordsApiVersion:1,ready:true}):Response.json({error:'fixture'},{status})});
    await assert.rejects(io.list(),error=>error.status===status);
  }
  const offline=RecordClient.create({endpoint:'https://example.invalid/submissions',getToken:()=> 'A',fetchImpl:async()=>{throw Error('민감한 서버 응답');}});
  await assert.rejects(offline.list(),/입력은 유지/);
  assert.throws(()=>RecordClient.create({endpoint:'http://example.com',getToken:()=> 'A'}),/주소/);
  await assert.rejects(RecordClient.create({endpoint:'https://example.invalid',getToken:()=>null}).list(),/로그인/);
});
test('수정본 별도 재조회가 다르면 완료하지 않고 같은 식별자·내용을 유지한다',async()=>{
  const sent=[],answers={mainIdea:'가상',primary:'가상',support:'가상',relation:'가상',retell:'가상'};
  let mismatch=true;
  const saver=RecordClient.createSaver({recordId:id,newId:()=>id,io:{save:async(_id,p)=>{sent.push(p);return {status:'saved',revision:{id:'saved',requestId:id,savedAt:'2026-11-10T00:00:00Z'}};},readRevision:async()=>({status:'saved',revision:{id:'saved',requestId:id,savedAt:'2026-11-10T00:00:00Z',answers:{...answers,mainIdea:mismatch?'다름':'가상'}}})}});
  await assert.rejects(saver.save(answers),/일치하지/);assert.equal(saver.hasPending(),true);mismatch=false;
  await saver.save({...answers,mainIdea:'실패 후 편집'});assert.equal(sent[1].answers.mainIdea,'가상');assert.equal(sent[0].requestId,sent[1].requestId);
});
test('수정본 ID가 누락되거나 잘못된 응답은 저장 완료로 처리하지 않고 같은 요청으로 재확인한다',async()=>{
  const answers={mainIdea:'합성',primary:'합성',support:'합성',relation:'합성',retell:'합성'};
  for(const invalidId of [undefined,null,'','   ',0,{}]){
    let valid=false,issued=0;const sent=[];
    const version=()=>({id:valid?id:invalidId,requestId:id,savedAt:'2026-11-10T00:00:00Z',answers});
    const saver=RecordClient.createSaver({recordId:id,newId:()=>{issued++;return id;},io:{
      save:async(_id,p)=>{sent.push(p);return {status:'saved',revision:version()};},
      readRevision:async()=>({status:'saved',revision:version()})
    }});
    await assert.rejects(saver.save(answers),/일치하지/);
    assert.equal(saver.hasPending(),true);
    valid=true;
    assert.equal((await saver.save({...answers,mainIdea:'실패 뒤 편집'})).id,id);
    assert.equal(issued,1);assert.deepEqual(sent[1],sent[0]);assert.equal(saver.hasPending(),false);
  }
});
