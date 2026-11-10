'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const PanelShell=require('../panel-shell.js');const AIContract=require('../ai-client.js');
test('개발자 도구는 로컬 루프백 AI 엔드포인트에서만 켠다',()=>{
 for(const url of ['http://127.0.0.1:8793/recommend','http://localhost:8793/recommend','http://[::1]:8793/recommend'])assert.equal(PanelShell.devToolsEnabled({aiEndpoint:url},AIContract),true,url);
 for(const url of ['https://ai.example.test/recommend','http://ai.example.test/recommend','https://127.0.0.1/recommend','','not a url',undefined])assert.equal(PanelShell.devToolsEnabled({aiEndpoint:url},AIContract),false,String(url));
 assert.equal(PanelShell.devToolsEnabled(null,AIContract),false);
});
test('개발자 도구 숨김은 hidden과 inert를 함께 바꾼다',()=>{
 const el={hidden:true,attrs:{inert:''},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}};
 const doc={querySelectorAll:()=>[el]};
 PanelShell.applyDevTools(doc,true);assert.equal(el.hidden,false);assert.equal('inert' in el.attrs,false);
 PanelShell.applyDevTools(doc,false);assert.equal(el.hidden,true);assert.equal('inert' in el.attrs,true);
});
test('단계 표시는 보이는 가장 뒤 단계를 현재로 표시하고 이전 단계를 완료로 표시한다',()=>{
 const sections=Object.fromEntries(PanelShell.STEPS.map(id=>[id,{hidden:true}]));
 const items=PanelShell.STEPS.map(step=>({dataset:{step},attrs:{},classes:new Set(),setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},classList:null}));
 for(const item of items)item.classList={toggle:(c,on)=>on?item.classes.add(c):item.classes.delete(c)};
 const doc={getElementById:id=>sections[id],querySelectorAll:()=>items};
 sections.preparation.hidden=false;assert.equal(PanelShell.renderStepper(doc),'preparation');assert.equal(items[0].attrs['aria-current'],'step');
 sections.preparation.hidden=true;sections['review-view'].hidden=false;sections['feedback-section'].hidden=false;
 assert.equal(PanelShell.renderStepper(doc),'feedback-section');assert.equal(items[4].attrs['aria-current'],'step');
 assert.equal('aria-current' in items[0].attrs,false);assert.ok(items[3].classes.has('done'));assert.ok(!items[4].classes.has('done'));
});
test('HTML: 글 연결이 읽기 준비의 첫 행동이고 개발 도구는 기본 숨김이며 제출 화면에 별도 로그인이 없다',()=>{
 const html=fs.readFileSync('sidepanel.html','utf8');
 const prep=html.slice(html.indexOf('id="preparation"'),html.indexOf('id="reading"'));
 const firstControl=prep.search(/<(button|input|textarea|select)\b/);assert.ok(prep.slice(firstControl).startsWith('<button id="analyze"'));
 assert.ok(prep.indexOf('id="prior"')<prep.indexOf('id="article-ai-recommend"'));assert.ok(prep.indexOf('id="article-ai-recommend"')<prep.indexOf('id="start-reading"'));
 for(const m of html.matchAll(/<details[^>]*class="dev-only"[^>]*>/g)){assert.match(m[0],/ hidden/);assert.match(m[0],/ inert/);}
 const devBlocks=[...html.matchAll(/<details[^>]*class="dev-only"[\s\S]*?<\/details>/g)].map(m=>m[0]).join('');
 for(const id of ['local-preview-run','mock-recommend','ai-recommend','synthetic-submit'])assert.match(devBlocks,new RegExp(`id="${id}"`));
 for(const id of ['submission-email','submission-password','submission-login'])assert.doesNotMatch(html,new RegExp(`id="${id}"`));
 assert.equal((html.match(/type="password" autocomplete="current-password"/g)||[]).length,1);
 assert.ok(html.indexOf('account-bar.js')>html.indexOf('submission-panel.js'));assert.ok(html.indexOf('panel-shell.js')>html.indexOf('submission-config.local.js'));
});
