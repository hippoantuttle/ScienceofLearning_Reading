const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('추출 전 가림 요청은 실패해야 한다', () => {
  const listeners = [];
  const context = { window:{addEventListener(){}}, document: { querySelectorAll: () => [], body: { innerText: '' } }, chrome: { runtime: { onMessage: { addListener: fn => listeners.push(fn) } } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8'), context);
  let result;
  listeners[0]({ action: 'TOGGLE_BLUR', enabled: true }, {}, value => { result = value; });
  assert.equal(result?.status, 'error');
});

test('추출 대상을 가리고 해제하며 원래 인라인 스타일을 보존한다', () => {
  const listeners = [];
  const values = new Map([['filter', ['contrast(1.2)', 'important']]]);
  const style = { getPropertyValue:k=>values.get(k)?.[0]||'', getPropertyPriority:k=>values.get(k)?.[1]||'', setProperty:(k,v,p='')=>values.set(k,[v,p]), removeProperty:k=>values.delete(k) };
  const node = { innerText:'가상 글입니다', isConnected:true, style, getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}), querySelectorAll:()=>[] };
  const overlay = { style:{}, textContent:'', setAttribute(){}, remove(){ this.removed=true; } };
  const document = { querySelectorAll:s=>s==='article'?[node]:[], body:node, documentElement:{append(){}}, createElement:()=>overlay };
  const context = { document, location:{href:'https://example.invalid/a'}, crypto:{randomUUID:()=> 'token'}, window:{addEventListener(){},removeEventListener(){}}, chrome:{runtime:{onMessage:{addListener:fn=>listeners.push(fn)}}} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8'),context);
  const send = m => {let result;listeners[0](m,{},r=>result=r);return result;};
  const extracted=send({action:'EXTRACT_ARTICLE'});
  assert.equal(send({action:'TOGGLE_BLUR',enabled:true,token:'wrong'}).status,'error');
  assert.deepEqual(values.get('filter'),['contrast(1.2)','important']);
  assert.equal(send({action:'TOGGLE_BLUR',enabled:true,token:extracted.token}).status,'success');
  assert.equal(values.get('filter')[0],'blur(10px)');
  assert.equal(send({action:'TOGGLE_BLUR',enabled:false,token:extracted.token}).status,'success');
  assert.deepEqual(values.get('filter'),['contrast(1.2)','important']);
});
