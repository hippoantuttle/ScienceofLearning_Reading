const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const PdfParagraphs = require('../pdf-paragraphs.js');
const PdfWorksheet = require('../pdf-worksheet.js');
const PdfUnits = require('../pdf-units.js');
const worksheet = require('../worksheet.js');
const AIContract = require('../ai-client.js');
const {sampleDocument, koreanDocument} = require('./fixtures/synthetic-pdf.cjs');

const line = (text, x, y, height = 11, width = text.length * 5) => ({str: text, transform: [height, 0, 0, height, x, y], width, height, hasEOL: true});

test('PDF 텍스트 항목을 줄로 묶고 같은 줄의 조각 사이 공백을 복원한다', () => {
  const lines = PdfParagraphs.linesFromItems([
    {str: 'Hello', transform: [11, 0, 0, 11, 72, 700], width: 25, height: 11, hasEOL: false},
    {str: 'world', transform: [11, 0, 0, 11, 102, 700], width: 25, height: 11, hasEOL: true},
    {str: '', transform: [11, 0, 0, 11, 0, 0], width: 0, height: 0, hasEOL: true},
    {str: '다음 줄', transform: [11, 0, 0, 11, 72, 686], width: 30, height: 11, hasEOL: true},
    {type: 'beginMarkedContent'}
  ]);
  assert.deepEqual(lines.map(item => item.text), ['Hello world', '다음 줄']);
});

test('반복 머리말·쪽번호 제거, 들여쓰기·간격 문단 분할, 쪽 넘김 연결, 제목 자동 제외', () => {
  const pages = [
    {pageNumber: 3, lines: PdfParagraphs.linesFromItems([line('Journal Header', 72, 760, 9), line('제목 블록', 72, 720, 16), line('첫 문단은 여기서 시작하고', 90, 690, 11, 260), line('끝납니다.', 72, 676, 11, 60), line('둘째 문단은 들여쓰기로', 90, 662, 11, 260), line('이어지고 다음 쪽으로', 72, 648, 11, 280), line('3', 300, 40, 9)])},
    {pageNumber: 4, lines: PdfParagraphs.linesFromItems([line('Journal Header', 72, 760, 9), line('넘어가서 끝납니다.', 72, 720, 11, 120), line('4', 300, 40, 9)])}
  ];
  const result = PdfParagraphs.paragraphsFromPages(pages);
  assert.deepEqual(result.map(item => [item.text, item.pages, item.included]), [
    ['제목 블록', [3], false],
    ['첫 문단은 여기서 시작하고 끝납니다.', [3], true],
    ['둘째 문단은 들여쓰기로 이어지고 다음 쪽으로 넘어가서 끝납니다.', [3, 4], true]
  ]);
  const merged = PdfParagraphs.mergeWithNext(result, 1);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[1].pages, [3, 4]);
  assert.equal(PdfParagraphs.mergeWithNext(result, 2).length, 3);
  assert.equal(PdfParagraphs.pageLabel([3, 4]), 'p.3–4');
});

test('고정 PDF.js로 합성 PDF를 열어 문단을 추출한다(직접 만든 비민감 자료)', async () => {
  const root = path.join(__dirname, '..');
  const lib = await import(pathToFileURL(path.join(root, 'vendor/pdfjs/pdf.min.mjs')).href);
  lib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, 'vendor/pdfjs/pdf.worker.min.mjs')).href;
  const doc = await lib.getDocument({data: new Uint8Array(sampleDocument()), isEvalSupported: false, disableFontFace: true, verbosity: 0, standardFontDataUrl: pathToFileURL(path.join(root, 'vendor/pdfjs/standard_fonts/')).href}).promise;
  try {
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      pages.push({pageNumber: number, lines: PdfParagraphs.linesFromItems((await page.getTextContent()).items)});
    }
    const result = PdfParagraphs.paragraphsFromPages(pages);
    assert.equal(result.length, 6);
    assert.equal(result[0].heading, true);
    assert.match(result[2].text, /every participant in the group\.$/);
    assert.deepEqual(result[3].pages, [1, 2]);
    assert.doesNotMatch(result.map(item => item.text).join(' '), /Synthetic Reading Journal/);
  } finally { await doc.destroy(); }
});

test('한글 CID 글꼴 PDF는 패키지의 CMap이 있어야 추출되고 제목·문단이 나뉜다', async () => {
  const root = path.join(__dirname, '..');
  const lib = await import(pathToFileURL(path.join(root, 'vendor/pdfjs/pdf.min.mjs')).href);
  lib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, 'vendor/pdfjs/pdf.worker.min.mjs')).href;
  const extract = async cMapUrl => {
    const doc = await lib.getDocument({data: new Uint8Array(koreanDocument()), isEvalSupported: false, verbosity: 0, cMapUrl, cMapPacked: true}).promise;
    try { return PdfParagraphs.paragraphsFromPages([{pageNumber: 1, lines: PdfParagraphs.linesFromItems((await (await doc.getPage(1)).getTextContent()).items)}]); }
    finally { await doc.destroy(); }
  };
  assert.deepEqual(await extract(undefined), [], 'CMap 없이는 한글을 읽지 못한다(패키지 포함 필요성 확인)');
  const result = await extract(path.join(root, 'vendor/pdfjs/cmaps') + path.sep);
  assert.deepEqual(result.map(item => [item.text, item.included]), [
    ['도시 정원', false],
    ['도시 정원은 이웃이 만나는 방식을 바꾸고 아이들에게 먹거리를 배울 자리를 준다.', true],
    ['그러나 땅이 부족한 곳에서는 주택과 경쟁한다.', true]
  ]);
});


test('블록 사각형은 PDF 좌표로 남고 쪽을 넘는 문단은 쪽마다 사각형을 갖는다', () => {
  const pages = [
    {pageNumber: 1, lines: PdfParagraphs.linesFromItems([line('첫 줄은 이어지고', 90, 700, 10, 200), line('다음 쪽으로', 72, 686, 10, 230)])},
    {pageNumber: 2, lines: PdfParagraphs.linesFromItems([line('끝납니다.', 72, 720, 10, 60)])}
  ];
  const [block] = PdfParagraphs.paragraphsFromPages(pages);
  assert.deepEqual(block.rects.map(rect => rect.page), [1, 2]);
  assert.deepEqual(block.rects[0], {page: 1, x1: 72, y1: 683.5, x2: 302, y2: 708.5});
});

test('클릭으로 단위를 지정·해제하고 Shift+클릭으로 연속 블록을 한 단위로 묶는다', () => {
  const blocks = [{text: '제목', pages: [1], heading: true, rects: []}, ...['가', '나', '다', '라'].map((text, i) => ({text, pages: [i < 2 ? 1 : 2], heading: false, rects: [{page: i < 2 ? 1 : 2}]}))];
  const units = PdfUnits.create(blocks);
  assert.deepEqual(units.autoSelect(), [[1, 1], [2, 2], [3, 3], [4, 4]]);
  assert.deepEqual(units.clear(), []);
  assert.deepEqual(units.click(2), [[2, 2]]);
  assert.deepEqual(units.click(4, {extend: true}), [[2, 4]]);
  assert.equal(units.unitOf(3), 0);
  assert.deepEqual(units.click(0), [[0, 0], [2, 4]]);
  assert.deepEqual(units.click(3), [[0, 0]], '묶음 안 블록 클릭은 그 단위를 해제한다');
  assert.equal(units.anchor(), null);
  assert.deepEqual(units.click(1, {extend: true}), [[0, 0], [1, 1]], '기준이 없으면 Shift+클릭도 한 블록 지정');
  assert.deepEqual(units.click(3, {extend: true}), [[0, 0], [1, 3]]);
  const [first, second] = units.materialize(texts => texts.join('/'));
  assert.deepEqual(first, {text: '제목', pages: [1], rects: [], blocks: [0, 0]});
  assert.deepEqual([second.text, second.pages, second.blocks], ['가/나/다', [1, 2], [1, 3]]);
  assert.throws(() => units.click(9));
});

test('단위마다 중심 생각만 쓰고, 모두 마친 뒤 문서 전체 구조도로 기존 제출 필드를 채운다', () => {
  assert.throws(() => PdfWorksheet.create([]));
  const sheet = PdfWorksheet.create([{pages: [1]}, {pages: [1, 2]}, {pages: [2]}]);
  assert.equal(sheet.phase(), 'units');
  assert.equal(sheet.firstIncomplete(), 0);
  sheet.setMain('하나');
  sheet.go(1); sheet.setMain('둘');
  assert.throws(() => sheet.toStructure(), /모든 단위/);
  assert.throws(() => sheet.serialize({}), /구조도 단계가 아닙니다/);
  sheet.go(2); sheet.setMain('셋');
  assert.deepEqual(sheet.completed(), [true, true, true]);
  sheet.toStructure();
  assert.equal(sheet.phase(), 'structure');
  const packed = sheet.serialize({structure: 'problem', primary: '문제', support: '해결', relation: '이어짐'});
  assert.deepEqual(packed, {structureType: 'problem', mainIdea: '[단위 1 · p.1] 하나\n\n[단위 2 · p.1–2] 둘\n\n[단위 3 · p.2] 셋', primary: '문제', support: '해결', relation: '이어짐'});
  assert.throws(() => sheet.serialize({structure: 'claim', primary: '가'.repeat(PdfWorksheet.LIMIT + 1), support: 'a', relation: 'b'}), /핵심 정보/);
  sheet.toUnits(); sheet.setMain('가'.repeat(PdfWorksheet.LIMIT));
  assert.throws(() => sheet.toStructure(), /단위별 중심 생각 합계가 10,000자를 넘습니다/);
  assert.throws(() => sheet.go(3));
});

function panelHarness() {
  const ids = ['mock-token','mock-recommend','mock-result','mock-status','to-retell','retell-input','retell-error','review-view','retell-view','revisit-note','back-to-reading','to-review','end-training','status','analyze','connect-status','article-result','worksheet','form-error','reading','preparation','structure','primary-label','support-label','prior','counts','fallback','start-reading','reading-start-status','back','main-idea','main-idea-label','main-idea-block','structure-block','retell-submit-block','primary','support','relation','submission-article-title','open-pdf-viewer','pdf-nav','pdf-nav-label','pdf-nav-progress','pdf-nav-select','pdf-prev','pdf-next','pdf-to-structure','pdf-nav-status','pdf-structure-intro','pdf-units-summary','pdf-back-units','summary-main','summary-type','summary-primary','summary-support','summary-relation','summary-retell','step4'];
  const elements = Object.fromEntries(ids.map(id => [id, {id, value: '', hidden: false, disabled: false, textContent: '', handlers: {}, setAttribute() {}, removeAttribute() {}, focus() {}, addEventListener(type, fn) { this.handlers[type] = fn; }}]));
  for (const id of ['retell-view', 'review-view', 'reading', 'pdf-nav', 'pdf-structure-intro']) elements[id].hidden = true;
  elements.structure.value = 'claim';
  elements.structure.selectedOptions = [{textContent: '주장–근거'}];
  elements['pdf-nav-select'].options = [];
  elements['pdf-nav-select'].replaceChildren = (...options) => { elements['pdf-nav-select'].options = options; };
  elements.worksheet.reset = () => { for (const id of ['main-idea', 'primary', 'support', 'relation']) elements[id].value = ''; elements.structure.value = 'claim'; };
  const viewerUrl = 'chrome-extension://abc/pdf-viewer.html';
  const tab = {id: 21, windowId: 5, url: viewerUrl, title: 'secret-file-name.pdf'};
  const runtimeMessages = [], tabMessages = [], ports = [], panelListeners = [];
  const chrome = {
    runtime: {
      getURL: name => 'chrome-extension://abc/' + name,
      onMessage: {addListener: fn => panelListeners.push(fn)},
      sendMessage: async message => {
        runtimeMessages.push(message);
        if (message.target !== 'pdf-viewer' || message.tabId !== 21) throw new Error('Receiving end does not exist.');
        if (message.action === 'EXTRACT_ARTICLE') return {status: 'success', kind: 'pdf', text: '가 나\n\n다', charCount: 6, wordCount: 3, fallback: false, token: 'pdf-token', title: 'PDF p.2–3', paragraphs: [{pages: [2]}, {pages: [2, 3]}]};
        if (message.action === 'TOGGLE_BLUR') return {status: 'success', enabled: message.enabled};
        return {status: 'success'};
      },
      connect: info => { const port = {name: info.name, onDisconnect: {addListener() {}}, disconnect() { this.closed = true; }}; ports.push(port); return port; }
    },
    windows: {getCurrent: async () => ({id: 5})},
    tabs: {query: async () => [tab], get: async () => tab, connect: () => { throw new Error('web port used'); }, sendMessage: async (...args) => { tabMessages.push(args); throw new Error('web message used'); }, create: async () => ({})},
    scripting: {executeScript: async () => { throw new Error('content script injected into viewer'); }}
  };
  const ctx = {document: {getElementById: id => elements[id], createElement: () => ({value: '', textContent: ''})}, chrome, URL, Promise, Worksheet: worksheet, PdfWorksheet, AIContract, confirm: () => true};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sidepanel.js'), 'utf8'), ctx);
  return {elements, runtimeMessages, tabMessages, ports, panelListeners, ctx};
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('패널은 PDF 뷰어와 연결해 단위별 중심 생각 → 문서 구조도 → 전체 Retell 가림 → 묶은 정리를 수행한다', async () => {
  const {elements: e, runtimeMessages, tabMessages, ports, panelListeners, ctx} = panelHarness();
  await e.analyze.handlers.click();
  assert.equal(tabMessages.length, 0);
  assert.equal(e['submission-article-title'].value, 'PDF p.2–3', '파일명(탭 제목)을 자동으로 쓰지 않는다');
  assert.match(e.fallback.textContent, /단위 2개.*AI 추천·피드백 없이/);
  assert.equal(e['pdf-nav'].hidden, false);
  assert.equal(e['structure-block'].hidden, true, '단위 단계에서는 구조도를 숨긴다');
  assert.equal(e['retell-submit-block'].hidden, true);
  assert.equal(e['main-idea-label'].textContent, '단위 1 · p.2의 중심 생각');
  await e['start-reading'].handlers.click();

  e['main-idea'].value = '첫 생각';
  await e['pdf-next'].handlers.click();
  assert.equal(e['main-idea'].value, '');
  assert.deepEqual(runtimeMessages.filter(m => m.action === 'FOCUS_PARAGRAPH').map(m => [m.index, m.token]), [[1, 'pdf-token']]);
  assert.deepEqual(runtimeMessages.filter(m => m.action === 'UNIT_STATUS').at(-1).completed, [true, false]);

  // 둘째 단위를 비운 채 구조도로 가면 막힌다.
  await e['pdf-to-structure'].handlers.click();
  assert.equal(e['structure-block'].hidden, true);
  assert.match(e['pdf-nav-status'].textContent, /단위 2 · p\.2–3의 중심 생각을 아직 작성하지 않았습니다/);

  // 뷰어 번호표 → 패널 이동(토큰이 다르면 조용히 무시)
  let reply = null;
  panelListeners[0]({target: 'side-panel', action: 'GOTO_UNIT', index: 0, token: 'other'}, {tab: {id: 21}}, value => { reply = value; });
  assert.equal(reply, null);
  e['main-idea'].value = '둘째 생각';
  panelListeners[0]({target: 'side-panel', action: 'GOTO_UNIT', index: 0, token: 'pdf-token'}, {tab: {id: 21}}, value => { reply = value; });
  await tick();
  assert.equal(reply?.status, 'success');
  assert.equal(e['main-idea'].value, '첫 생각');

  await e['pdf-to-structure'].handlers.click();
  assert.equal(e['structure-block'].hidden, false);
  assert.equal(e['pdf-nav'].hidden, true);
  assert.equal(e['main-idea-block'].hidden, true);
  assert.equal(e['pdf-units-summary'].textContent, '[단위 1 · p.2] 첫 생각\n\n[단위 2 · p.2–3] 둘째 생각');

  // 구조도 미작성이면 Retell 가림 요청이 없다.
  await e['to-retell'].handlers.click();
  assert.equal(e['retell-view'].hidden, true);
  assert.equal(runtimeMessages.filter(m => m.action === 'TOGGLE_BLUR' && m.enabled).length, 0);

  e.structure.value = 'cause'; e.structure.selectedOptions = [{textContent: '원인–결과'}];
  e.primary.value = '원인'; e.support.value = '결과'; e.relation.value = '이어짐';
  await e['to-retell'].handlers.click();
  assert.equal(e['retell-view'].hidden, false);
  assert.deepEqual(ports.map(port => port.name), ['reading-retell:21']);
  assert.equal(runtimeMessages.filter(m => m.action === 'TOGGLE_BLUR' && m.enabled).length, 1);

  e['retell-input'].value = '문서 전체 다시 말하기';
  await e['to-review'].handlers.click();
  assert.equal(e['review-view'].hidden, false);
  assert.equal(e['summary-main'].textContent, '[단위 1 · p.2] 첫 생각\n\n[단위 2 · p.2–3] 둘째 생각');
  assert.equal(e['summary-type'].textContent, '문서 전체 · 원인–결과');
  assert.equal(e['summary-primary'].textContent, '원인');
  const packed = vm.runInContext('worksheetSubmissionValues()', ctx);
  assert.equal([packed.structureType, packed.primary, packed.relation].join('|'), 'cause|원인|이어짐');

  await e['end-training'].handlers.click();
  assert.equal(e['pdf-nav'].hidden, true);
  assert.equal(e['structure-block'].hidden, false, '웹 기사 화면으로 돌아오면 구조도를 다시 보인다');
  assert.equal(vm.runInContext('pdfWorksheet', ctx), null);
});

test('웹 탭의 PDF 주소는 뷰어 사용을 안내하고 본문 스크립트를 주입하지 않는다', async () => {
  const {elements: e, ctx} = panelHarness();
  const tab = {id: 30, windowId: 5, url: 'https://example.invalid/report.pdf'};
  ctx.chrome.tabs.query = async () => [tab];
  ctx.chrome.tabs.get = async () => tab;
  await e.analyze.handlers.click();
  assert.match(e['connect-status'].textContent, /PDF 뷰어 열기/);
  assert.equal(e['pdf-nav'].hidden, true);
});
