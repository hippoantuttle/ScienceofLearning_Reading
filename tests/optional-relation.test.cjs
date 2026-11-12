'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const {buildPayload} = require('../submission-contract.js'), Records = require('../record-contract.js'), Worksheet = require('../worksheet.js'), PdfWorksheet = require('../pdf-worksheet.js');
const answers = {mainIdea:'합성 중심',primary:'합성 주장',support:'합성 근거',relation:'',retell:'합성 Retell'};
const input = {structureType:'claim',...answers,reflection:'',newWords:'',interests:'',rechecked:false};

test('초기·수정본은 선택 설명의 빈칸/공백을 빈 문자열로 정규화하고 작성한 원문은 보존한다', () => {
  for (const value of ['', ' \t\n', '\u3000', '  원문에 근거한 합성 설명  ']) {
    const expected = value.trim() ? value : '';
    assert.equal(buildPayload({...input,relation:value},'synthetic-session').relation,expected);
    assert.equal(Records.answers({...answers,relation:value}).relation,expected);
    assert.equal(Worksheet.validate({main:answers.mainIdea,primary:answers.primary,support:answers.support,relation:value}).valid,true);
  }
  for (const relation of [null,undefined,7,{},'\ud800','x\0y','x'.repeat(10001)]) {
    assert.throws(()=>buildPayload({...input,relation},'synthetic-session'));
    assert.throws(()=>Records.answers({...answers,relation}));
  }
  assert.equal(buildPayload({...input,relation:'😀'.repeat(10000)},'synthetic-session').relation.length,20000);
});

test('PDF는 단위별 중심 생각을 유지하고 공통 선택 설명을 비워 문서 구조도를 제출한다', () => {
  const pdf=PdfWorksheet.create([{pages:[1]},{pages:[2]}]);
  pdf.setMain('첫 단위 중심',0);assert.throws(()=>pdf.toStructure());
  pdf.setMain('둘째 단위 중심',1);pdf.toStructure();
  const values=pdf.serialize({structure:'cause',primary:'합성 원인',support:'합성 결과',relation:''});
  assert.equal(values.relation,'');assert.match(values.mainIdea,/첫 단위 중심/);assert.match(values.mainIdea,/둘째 단위 중심/);
  assert.doesNotThrow(()=>buildPayload({...input,...values},'synthetic-pdf-session'));
});

test('선택 설명은 구조도 아래 네이티브 접힘 영역이며 안내를 답안에 채우지 않는다', () => {
  const html=fs.readFileSync('sidepanel.html','utf8');
  const details=html.match(/<details id="relation-details"[^>]*>([\s\S]*?)<\/details>/);
  assert.ok(details);assert.doesNotMatch(details[0],/<details[^>]*\bopen\b/);
  assert.match(details[1],/<summary>왜 이렇게 연결했나요\? \(선택\)<\/summary>/);
  assert.match(details[1],/원문의 어떤 내용을 보고 두 정보를 연결했는지 짧게 적어보세요\./);
  assert.match(details[1],/원문에 설명된 내용이 있을 때 작성하세요\./);
  assert.match(details[1],/<textarea id="relation"[^>]*><\/textarea>/);
  assert.doesNotMatch(details[1],/\brequired\b/);
  assert.ok(html.indexOf('relation-details') > html.indexOf('id="support"'));
});
