'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {createFlow}=require('../submission-flow.js');
function setup({member=true,confirmAnswer=true}={}){
 const e={};const document={getElementById(id){return e[id]??={value:'',checked:false,disabled:false,hidden:false,textContent:'',handlers:{},addEventListener(t,f){this.handlers[t]=f},focus(){}}}};
 for(const id of ['ai-email','ai-password','ai-login','account-form','account-status','account-signed-in','account-identity','account-logout'])document.getElementById(id);
 const calls={logins:0,confirms:[]};
 const ctx=vm.createContext({document,confirm:m=>{calls.confirms.push(m);return confirmAnswer},crypto:{randomUUID:()=> 'id'},
  SubmissionConfig:{authUrl:'https://example.invalid',publicKey:'public',endpoint:'https://example.invalid/submissions'},
  SubmissionAuth:{createLogin:()=>async()=>{calls.logins++;return 'tok'}},
  SubmissionHttp:{createMembershipCheck:()=>async()=>member,createHttpAdapter:()=>({save:async()=>{throw Error('offline')},read:async()=>{}})},
  SubmissionFlow:{createFlow}});
 vm.runInContext(fs.readFileSync('submission-panel.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('account-bar.js','utf8'),ctx);
 return {e,ctx,calls};
}
const login=async(t,email='a@example.invalid')=>{t.e['ai-email'].value=email;t.e['ai-password'].value='pw';await t.e['account-form'].handlers.submit({preventDefault(){}});};
test('처음에는 로그인 양식만 보이고, 로그인 후 비밀번호를 비우고 계정을 표시한다',async()=>{
 const t=setup();assert.equal(t.e['account-form'].hidden,false);assert.equal(t.e['account-signed-in'].hidden,true);
 await login(t);
 assert.equal(t.calls.logins,1);assert.equal(t.e['ai-password'].value,'');
 assert.equal(t.e['account-form'].hidden,true);assert.equal(t.e['account-signed-in'].hidden,false);assert.match(t.e['account-identity'].textContent,/a@example\.invalid/);
});
test('로그인 실패는 비밀번호를 비우고 오류를 표시하며 로그인 상태로 바꾸지 않는다',async()=>{
 const t=setup({member:false});await login(t);
 assert.equal(t.e['ai-password'].value,'');assert.match(t.e['account-status'].textContent,/초대/);assert.equal(t.e['account-signed-in'].hidden,true);assert.equal(t.e['ai-login'].disabled,false);
});
test('새 시도(초기화) 후에도 로그인이 유지되고 로그아웃하면 토큰이 사라진다',async()=>{
 const t=setup();await login(t);
 t.ctx.resetPanelSubmission();assert.equal(t.ctx.panelFlow().getToken(),'tok');assert.equal(t.ctx.panelFlow().getIdentity(),'a@example.invalid');
 t.e['account-logout'].handlers.click();
 assert.equal(t.ctx.panelFlow().getToken(),null);assert.equal(t.e['account-form'].hidden,false);assert.equal(t.calls.confirms.length,0);
});
test('저장 확인되지 않은 제출이 있으면 로그아웃 전에 확인하고 취소 시 유지한다',async()=>{
 const t=setup({confirmAnswer:false});await login(t);
 await assert.rejects(t.ctx.panelFlow().submit({structureType:'claim',mainIdea:'가상',primary:'가상',support:'가상',relation:'가상',retell:'가상',reflection:'',newWords:'',interests:'',rechecked:false}));
 t.e['account-logout'].handlers.click();
 assert.match(t.calls.confirms[0],/재시도/);assert.equal(t.ctx.panelFlow().getToken(),'tok');
});
