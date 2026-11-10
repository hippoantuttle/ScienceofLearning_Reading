'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const AIContract=require('../ai-client.js'),Worksheet=require('../worksheet.js');
function panel({title='연결한 합성 글',changedUrl=false,fail=false}={}){
  const e={};const element=id=>e[id]??={value:id==='structure'?'claim':'',checked:false,disabled:false,hidden:false,textContent:'',handlers:{},setAttribute(){},focus(){},reset(){},addEventListener(event,fn){this.handlers[event]=fn;}};
  const tab={id:10,windowId:5,url:'https://example.invalid/synthetic',title:'연결 전 제목'};
  const options={title,changedUrl,fail};
  const chrome={windows:{getCurrent:async()=>({id:5})},tabs:{query:async()=>[tab],get:async()=>({...tab,title:options.title,url:options.changedUrl?tab.url+'/changed':tab.url}),sendMessage:async(_id,message)=>message.action==='TOGGLE_BLUR'?{status:'success',enabled:message.enabled}:options.fail?{status:'error',message:'합성 추출 실패'}:{status:'success',text:'합성 본문',token:'fixture',charCount:5,wordCount:2}},scripting:{executeScript:async()=>{}}};
  vm.runInNewContext(fs.readFileSync('sidepanel.js','utf8'),{document:{getElementById:element},chrome,AIContract,Worksheet,URL,confirm:()=>true});
  // Real HTML contains these fields before the article-connect event.
  for(const id of ['submission-article-title','submission-source-url','submission-article-consent'])element(id);
  return {e,options};
}
test('연결 완료된 탭 제목을 채우고 저장 동의와 출처 자동 수집은 하지 않는다',async()=>{
  const p=panel();await p.e.analyze.handlers.click();
  assert.equal(p.e['submission-article-title'].value,'연결한 합성 글');
  assert.equal(p.e['submission-article-consent'].checked,false);assert.equal(p.e['submission-source-url'].value,'');
  p.e['submission-article-title'].value='사용자가 수정한 제목';
  p.options.title='나중에 바뀐 탭 제목';
  assert.equal(p.e['submission-article-title'].value,'사용자가 수정한 제목');
  p.e['submission-article-consent'].checked=true;await p.e.analyze.handlers.click();
  assert.equal(p.e['submission-article-title'].value,'나중에 바뀐 탭 제목');assert.equal(p.e['submission-article-consent'].checked,false);
});
test('제목의 제어문자·잘못된 유니코드를 정리하고 글자 수 제한을 지킨다',async()=>{
  const p=panel({title:'\t'+ '😀'.repeat(205)+'\u0000\n'});await p.e.analyze.handlers.click();
  const title=p.e['submission-article-title'].value;
  assert.equal(title.length,200);assert.equal(Array.from(title).length,100);assert.equal(title.isWellFormed(),true);assert.doesNotMatch(title,/[\x00-\x1f\x7f]/);
  p.options.title='합성\ud800제목';await p.e.analyze.handlers.click();assert.equal(p.e['submission-article-title'].value.isWellFormed(),true);
});
test('연결 실패·탐색 변경 시 이전 제목을 버리고 제목이 없어도 본문 연결을 유지한다',async()=>{
  for(const options of [{changedUrl:true},{fail:true}]){
    const p=panel(options);p.e['submission-article-title'].value='이전 제목';await p.e.analyze.handlers.click();assert.equal(p.e['submission-article-title'].value,'');
  }
  const p=panel({title:undefined});p.options.title=undefined;await p.e.analyze.handlers.click();
  assert.equal(p.e['submission-article-title'].value,'');assert.equal(p.e['article-result'].hidden,false);
});
test('제출은 동의한 제목만 포함하며 비동의 시 자동 채운 제목도 제외한다',async()=>{
  for(const consent of [false,true]){
    const e={};let submitted;
    const element=id=>e[id]??={value:id==='submission-article-title'?'편집한 합성 제목':id==='submission-source-url'?'':'합성 작성',checked:id==='submission-consent'||id==='submission-article-consent'&&consent,disabled:false,addEventListener(_event,fn){this.click=fn;}};
    const flow={hasPending:()=>false,submit:async input=>{submitted=input;return {submissionId:'fixture',savedAt:'2026-11-10T00:00:00Z'};}};
    const context={document:{getElementById:element},SubmissionConfig:{authUrl:'https://example.invalid',publicKey:'synthetic',endpoint:'https://example.invalid/submissions'},SubmissionAuth:{createLogin:()=>()=>{}},SubmissionHttp:{createMembershipCheck:()=>()=>true},SubmissionFlow:{createFlow:()=>flow},crypto:{randomUUID:()=>''},rechecked:false};
    vm.runInNewContext(fs.readFileSync('submission-panel.js','utf8'),context);await e['submission-send'].click();
    assert.equal('articleTitle' in submitted,consent);if(consent){assert.equal(submitted.articleTitle,'편집한 합성 제목');assert.equal(submitted.sourceUrl,'');}
  }
});
