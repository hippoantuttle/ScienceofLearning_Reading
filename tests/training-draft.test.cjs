'use strict';
// TASK-027 C: 임시저장 형식·저장소·복원 API. 합성 자료만 사용한다.
const {test} = require('node:test'), assert = require('node:assert/strict');
const TrainingDraft = require('../training-draft.js'), ReadingSupport = require('../reading-support.js'), PdfWorksheet = require('../pdf-worksheet.js');
const article = '합성 마을은 주말 도서관을 열었다. 주민들이 요청했다. 자원봉사자가 돕는다. 운영 시간은 늘었다.';
async function sample(overrides = {}) {
  return {version:1, savedAt:Date.now(), owner:null, step:'reading', rechecked:false,
    article:{kind:'web', tabId:1, windowId:2, url:'https://example.invalid/a', textHash:await TrainingDraft.sha256(article)},
    fields:{'main-idea':'합성'}, checks:{}, pdf:null, guided:null, ...overrides};
}

test('형식 검사: 허용 키·단계·해시만 받고 본문·알 수 없는 필드를 거절한다', async () => {
  assert.ok(TrainingDraft.validate(await sample()));
  for (const bad of [{version:2}, {step:'feedback-section'}, {owner:'user@example.invalid'}, {fields:{article}}, {fields:{'main-idea':1}}, {checks:{'submission-consent':true}}, {pdf:{mains:['x']}}, {guided:{mode:'auto'}}])
    assert.equal(TrainingDraft.validate(await sample(bad)), null, JSON.stringify(bad));
  const noHash = await sample(); noHash.article.textHash = 'abc'; assert.equal(TrainingDraft.validate(noHash), null);
  assert.equal(TrainingDraft.validate(await sample({fields:{'main-idea':'가'.repeat(20001)}})), null, '지나치게 긴 값 거절');
});

test('계정은 원문 대신 해시로 묶고, 로그아웃 상태는 null이다', async () => {
  const key = await TrainingDraft.ownerKey('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.match(key, /^[0-9a-f]{64}$/); assert.equal(key.includes('aaaa'), false);
  assert.equal(await TrainingDraft.ownerKey(null), null);
  assert.notEqual(key, await TrainingDraft.ownerKey('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
});

test('저장소: 잘못된 값은 쓰지 않고, 깨진 저장값은 없는 것으로 읽으며, 저장소 오류에도 패널을 멈추지 않는다', async () => {
  const data = {}, area = {get:async k => ({[k]:data[k]}), set:async v => Object.assign(data, v), remove:async k => { delete data[k]; }};
  const store = TrainingDraft.createStore(area), draft = await sample();
  assert.equal(await store.save({...draft, step:'x'}), false); assert.equal(data[TrainingDraft.KEY], undefined);
  assert.equal(await store.save(draft), true); assert.deepEqual(await store.load(), draft);
  data[TrainingDraft.KEY] = {version:1, step:'reading'}; assert.equal(await store.load(), null);
  await store.clear(); assert.equal(data[TrainingDraft.KEY], undefined);
  const broken = TrainingDraft.createStore({get:async () => { throw Error('x'); }, set:async () => { throw Error('x'); }, remove:async () => { throw Error('x'); }});
  assert.equal(await broken.load(), null); assert.equal(await broken.save(draft), false); await broken.clear();
  const none = TrainingDraft.createStore(undefined); assert.equal(await none.load(), null); assert.equal(await none.save(draft), false);
});

test('안내 문구에는 단계와 시각만 있고 답안 내용은 없다', async () => {
  const text = TrainingDraft.describe(await sample({savedAt:Date.now() - 5 * 60000, step:'retell-view'}));
  assert.match(text, /다시 말하기 단계/); assert.match(text, /5분 전/); assert.equal(text.includes('합성'), false);
});

test('초급 게이트 복원: 요청은 항상 닫히고, 실제로 본 후보만 노출로 되살린다', async () => {
  const gate = ReadingSupport.create({article, accountId:'synthetic', mode:'guided', enabled:true});
  const state = gate.restore({phase:'retell', status:'ready', attempts:1, candidateExposure:true, candidateIds:['s0003','s0001']});
  assert.equal(state.phase, 'mainIdea', 'Retell은 다시 가리기 전 중심 생각 단계로 복원');
  assert.equal(state.requestClosed, true); assert.deepEqual(state.candidateIds, ['s0001','s0003'], '원문 순서');
  assert.equal(state.candidateExposure, true); assert.equal(gate.canRetry(), false);
  await assert.rejects(gate.request(async () => ({}), {consent:true, requestId:'11111111-1111-4111-8111-111111111111'}), /request_not_allowed/);
  assert.throws(() => gate.restore({phase:'reading', attempts:0}), /invalid_phase/, '한 번만 복원');
  const unseen = ReadingSupport.create({article, accountId:'synthetic', mode:'guided', enabled:true});
  const s2 = unseen.restore({phase:'reading', status:'ready', attempts:1, candidateExposure:false, candidateIds:['s0001','s0002']});
  assert.equal(s2.candidateExposure, false); assert.deepEqual(s2.candidateIds, []); assert.equal(s2.status, 'cancelled', '표시 전 응답은 노출이 아니다');
  const pending = ReadingSupport.create({article, accountId:'synthetic', mode:'guided', enabled:true}).restore({phase:'reading', status:'pending', attempts:1, candidateExposure:false, candidateIds:[]});
  assert.equal(pending.status, 'cancelled');
  for (const bad of [{phase:'ended', attempts:0}, {phase:'reading', attempts:3}, {phase:'reading', attempts:1, candidateExposure:true, candidateIds:['s0001','s9999']}])
    assert.throws(() => ReadingSupport.create({article, accountId:'synthetic', mode:'guided', enabled:true}).restore(bad), JSON.stringify(bad));
});

test('PDF 단위 복원: 단위 수가 같을 때만, 모두 작성했을 때만 구조도 단계로 되살린다', () => {
  const units = [{pages:[1]}, {pages:[2]}, {pages:[3]}];
  const a = PdfWorksheet.create(units); a.setMain('합성 1', 0); a.setMain('합성 2', 1); a.go(1);
  const snap = a.snapshot(); assert.deepEqual(snap, {mains:['합성 1','합성 2',''], index:1, phase:'units'});
  const b = PdfWorksheet.create(units); b.restore(snap); assert.equal(b.getMain(0), '합성 1'); assert.equal(b.index(), 1); assert.equal(b.phase(), 'units');
  const c = PdfWorksheet.create(units); c.restore({mains:['a','b','c'], index:2, phase:'structure'}); assert.equal(c.phase(), 'structure');
  const d = PdfWorksheet.create(units); d.restore({mains:['a','','c'], index:9, phase:'structure'}); assert.equal(d.phase(), 'units', '미작성 단위가 있으면 단위 단계'); assert.equal(d.index(), 0);
  assert.throws(() => PdfWorksheet.create(units).restore({mains:['a','b'], index:0, phase:'units'}), /다릅니다/);
});

test('같은 글 판단: 제목(알림 수 무시) + 본문 글자 수 기준 75% 이상 줄 일치',async()=>{
  const base=['첫째 문단은 충분히 긴 합성 문장으로 이루어져 있으며 주제를 소개한다.','둘째 문단도 충분히 긴 합성 문장으로 근거를 제시하고 설명을 이어 간다.','셋째 문단은 결론을 정리하며 합성 기사를 마무리하는 긴 문장이다.','조회수 10'];
  const text=base.join('\n');
  assert.equal(TrainingDraft.normalizeTitle(' (12)  합성   제목 '),'합성 제목');
  assert.equal(await TrainingDraft.sameArticle({title:'합성 제목',text},{title:'(3) 합성 제목',text:[...base.slice(0,3),'조회수 99'].join('\n')}),true,'짧은 줄 하나만 바뀜');
  assert.equal(await TrainingDraft.sameArticle({title:'합성 제목',text},{title:'다른 제목',text}),false,'제목이 다르면 같은 글이 아님');
  assert.equal(await TrainingDraft.sameArticle({title:'합성 제목',text},{title:'합성 제목',text:base[0]}),false,'본문 대부분이 없음(페이월 등)');
  assert.equal(await TrainingDraft.sameArticle({title:'합성 제목',text},{title:'합성 제목',text:'메뉴\n'+text+'\n광고'}),true,'본문 전체가 포함되면 같은 글');
  assert.equal(TrainingDraft.SIMILARITY_THRESHOLD,0.75);
  const four=['가'.repeat(25),'나'.repeat(25),'다'.repeat(25),'라'.repeat(25)];
  assert.equal(await TrainingDraft.sameArticle({title:'t',text:four.join('\n')},{title:'t',text:four.slice(0,3).join('\n')}),true,'75% 남으면 같은 글');
  assert.equal(await TrainingDraft.sameArticle({title:'t',text:four.join('\n')},{title:'t',text:[...four.slice(0,2),'다'.repeat(24)].join('\n')}),false,'75% 미만이면 다른 글');
  const draft=await sample();draft.article.title='합성 제목';draft.article.text=text;assert.ok(TrainingDraft.validate(draft),'웹 기사는 처음 불러온 본문을 담을 수 있다');
  const pdf=await sample();pdf.article.kind='pdf';pdf.article.text=text;assert.equal(TrainingDraft.validate(pdf),null,'PDF 본문은 담지 않는다');
  const big=await sample();big.article.text='가'.repeat(TrainingDraft.MAX_ARTICLE_TEXT+1);assert.equal(TrainingDraft.validate(big),null);
});
