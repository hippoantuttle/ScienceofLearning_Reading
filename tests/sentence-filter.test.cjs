'use strict';
// 2026-11-19 초급 「원문에서 추가」 목록 정리 규칙. 합성 자료만 사용한다(실제 기사 문장 형식만 본뜸).
const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SentenceFilter = require('../sentence-filter.js'), SentenceSource = require('../sentence-source.js');

test('뉴스 페이지의 화면 장치·기자·날짜·광고·출처 줄은 숨기고 본문 문장은 남긴다', () => {
  const lines = ['본문', '사회환경', '합성 도서관 운영 시간 늘린다…주민 요청 반영', '홍길동기자', '수정 2026-11-11 15:40', '펼침', '5:01',
    '합성 도서관은 주말에도 문을 연다.', '광고', 'AFP 연합뉴스', 'Xinhua 연합뉴스', '사진=합성시청 제공', '주민들이 주말 운영을 요청했다.',
    '홍길동 기자 hong@example.org', 'ⓒ 합성신문 무단 전재 및 재배포 금지', '왜일까?'];
  const snapshot = SentenceSource.segment(lines.join('\n'));
  const kinds = SentenceFilter.classify(snapshot.sentences, {noise: ['본문'], captions: []});
  const visible = snapshot.sentences.filter(s => kinds[s.id] !== 'noise').map(s => s.text);
  assert.deepEqual(visible, ['합성 도서관 운영 시간 늘린다…주민 요청 반영', '합성 도서관은 주말에도 문을 연다.', '주민들이 주말 운영을 요청했다.']);
  assert.equal(snapshot.sentences.length, lines.length, '문장 분할·ID는 바꾸지 않는다');
});

test('페이지 구조 힌트: 버튼 등 noise 줄은 숨기고, 사진 설명은 숨기지 않고 caption으로 표시한다', () => {
  const article = '사회환경\n도서관 앞에서 주민들이 줄을 서 있다. 오전 9시 모습이다.\n합성 도서관은 주말에도 문을 연다.';
  const snapshot = SentenceSource.segment(article);
  const kinds = SentenceFilter.classify(snapshot.sentences, {noise: ['사회환경'], captions: ['도서관 앞에서 주민들이 줄을 서 있다. 오전 9시 모습이다.']});
  assert.deepEqual(snapshot.sentences.map(s => kinds[s.id]), ['noise', 'caption', 'caption', null]);
});

test('기자 이름 규칙은 짧은 줄에만 적용하고, 본문 문장 속 기자 언급은 숨기지 않는다', () => {
  assert.equal(SentenceFilter.noiseByText('홍길동 기자'), true);
  assert.equal(SentenceFilter.noiseByText('홍길동 기자는 지난 10일 합성 도서관을 찾아 주민들과 운영 시간 연장 문제를 놓고 오랫동안 이야기를 나눴다.'), false);
  assert.equal(SentenceFilter.noiseByText('광고 시장이 커지면서 합성 업계의 경쟁도 치열해지고 있다.'), false);
});

test('힌트 형식 검사: 문자열 배열만 받고 길이·개수를 제한한다', () => {
  assert.deepEqual(SentenceFilter.hints(null), {noise: [], captions: []});
  assert.deepEqual(SentenceFilter.hints({noise: ['  버튼  ', 3, '버튼'], captions: 'x'}), {noise: ['버튼'], captions: []});
  assert.equal(SentenceFilter.hints({noise: Array.from({length: 1000}, (_, i) => 'n' + i)}).noise.length, SentenceFilter.MAX_HINTS);
  assert.equal(SentenceFilter.hints({noise: ['가'.repeat(SentenceFilter.MAX_HINT_LENGTH + 1)]}).noise.length, 0);
});

test('검색은 대소문자·띄어쓰기 차이를 무시한 부분 일치다', () => {
  assert.equal(SentenceFilter.matches('기후 재원 상당 부분이 민간 대출이다.', '기후재원'), true);
  assert.equal(SentenceFilter.matches('COP31 기후총회', 'cop31'), true);
  assert.equal(SentenceFilter.matches('합성 도서관', '박물관'), false);
  assert.equal(SentenceFilter.matches('합성 도서관', '   '), true, '빈 검색어는 모두 보여 준다');
});

test('content.js: 본문 영역 안의 버튼·화면낭독기 글자·광고 영역·사진 설명을 힌트로 모으고 본문 text는 그대로 둔다', () => {
  const listeners = [];
  const el = (text, extra = {}) => ({innerText: text, className: '', getAttribute() { return null; }, ...extra});
  const nodes = {
    button: [el('펼침')], sr: [el('본문')], figcaption: [el('도서관 앞에서 주민들이 줄을 서 있다.\nAFP 연합뉴스')],
    classed: [el('광고', {className: 'BaseAd_adWrapper__x'}), el('본문 전체', {className: 'ArticleDetailView_article__eB2xf'}), el('불러오는 중', {className: 'loading'})]
  };
  const text = '본문\n펼침\n합성 도서관은 주말에도 문을 연다. 주민들이 오래전부터 요청해 온 일이다. 자원봉사자들이 운영을 돕기로 했다.\n광고\n도서관 앞에서 주민들이 줄을 서 있다.\nAFP 연합뉴스';
  const target = {innerText: text, isConnected: true, style: {}, querySelectorAll(selector) {
    if (selector === 'figcaption') return nodes.figcaption;
    if (selector === '[class]') return nodes.classed;
    if (selector.includes('sr-only')) return [...nodes.button, ...nodes.sr];
    return [];
  }};
  const context = {URL, document: {querySelectorAll: q => q === 'article' ? [target] : [], body: target}, location: {href: 'https://news.example.org/a'}, crypto: {randomUUID: () => 'token'},
    window: {addEventListener() {}, removeEventListener() {}}, chrome: {runtime: {onMessage: {addListener: fn => listeners.push(fn)}}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8'), context);
  let result; listeners[0]({action: 'EXTRACT_ARTICLE'}, {}, r => { result = r; });
  assert.equal(result.text, text, '본문은 그대로');
  assert.deepEqual([...result.hints.noise], ['펼침', '본문', '광고'], '광고 클래스만 잡고 loading 등은 잡지 않는다');
  assert.deepEqual([...result.hints.captions], ['도서관 앞에서 주민들이 줄을 서 있다.', 'AFP 연합뉴스']);
});
