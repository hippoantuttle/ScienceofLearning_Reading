const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const LocalPreview=require('../local-preview.js');
test('화면은 가상 본문 표시·동의 전 차단·읽기 시작 시 동의 해제한다',async()=>{
 const ids=['local-preview-text','local-preview-consent','local-preview-run','local-preview-status'];const e=Object.fromEntries(ids.map(id=>[id,{textContent:'',checked:false,disabled:false,addEventListener(t,f){this[t]=f}}]));
 const ctx={LocalPreview,document:{getElementById:id=>e[id]}};vm.runInNewContext(fs.readFileSync('local-preview-ui.js','utf8'),ctx);
 assert.equal(e['local-preview-text'].textContent,LocalPreview.SYNTHETIC_TEXT);
 await e['local-preview-run'].click();assert.match(e['local-preview-status'].textContent,/동의/);
 e['local-preview-consent'].checked=true;ctx.localPreviewStartReading();assert.equal(e['local-preview-consent'].checked,false);assert.equal(e['local-preview-run'].disabled,true);
 ctx.localPreviewReset();assert.equal(e['local-preview-consent'].checked,false);assert.equal(e['local-preview-run'].disabled,false);
});
