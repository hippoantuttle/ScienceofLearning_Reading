'use strict';
// TASK-019 v3 확장 전용 PDF 뷰어. PDF.js 화면 부품(PDFViewer)으로 원본을 보여 주고,
// 원본 위 블록 상자를 클릭해 읽기 단위를 지정한다. 파일은 이 페이지 메모리에만 두고 저장·전송하지 않는다.
// 사이드패널과는 확장 메시지로 웹 기사용 content.js와 같은 계약(본문 추출·가림·연결 포트)을 쓴다.
(() => {
  const MAX_BYTES = 50 * 1024 * 1024;
  const MAX_PAGES = 30;
  const asset = path => chrome.runtime.getURL('vendor/pdfjs/' + path);
  const el = id => document.getElementById(id);
  let lib = null, viewerLib = null, eventBus = null, pdfViewer = null, linkService = null;
  let pdfDocument = null, loadingTask = null, generation = 0;
  let range = null, blocks = [], units = null, confirmed = false, session = null, sessionUnits = [], masked = false;
  let currentUnit = -1, completed = [], myTabId = null;

  chrome.tabs.getCurrent().then(tab => { myTabId = Number.isInteger(tab?.id) ? tab.id : null; }, () => { myTabId = null; });

  function status(message, tone = 'status') {
    const target = el('viewer-status');
    target.textContent = message;
    target.dataset.tone = tone;
    target.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  }
  function invalidateSession() { session = null; sessionUnits = []; currentUnit = -1; completed = []; }
  const joinTexts = texts => PdfParagraphs.joinLines(texts.map(text => ({text})));

  async function ensureViewer() {
    if (pdfViewer) return;
    lib = await import(asset('pdf.min.mjs'));
    lib.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');
    globalThis.pdfjsLib = lib; // pdf_viewer.mjs가 같은 버전의 핵심 라이브러리를 이 이름으로 찾는다.
    viewerLib = await import(asset('web/pdf_viewer.mjs'));
    eventBus = new viewerLib.EventBus();
    linkService = new viewerLib.PDFLinkService({eventBus, externalLinkTarget: viewerLib.LinkTarget.BLANK, externalLinkRel: 'noopener noreferrer nofollow'});
    const findController = new viewerLib.PDFFindController({eventBus, linkService});
    pdfViewer = new viewerLib.PDFViewer({container: el('viewerContainer'), viewer: el('viewer'), eventBus, linkService, findController, removePageBorders: false});
    linkService.setViewer(pdfViewer);
    eventBus.on('pagesinit', () => { pdfViewer.currentScaleValue = 'page-width'; });
    // 창 크기가 바뀌거나 처음 배치가 늦게 끝나도 '쪽 너비' 같은 맞춤 배율을 다시 계산한다.
    new ResizeObserver(() => {
      const preset = pdfViewer?.currentScaleValue;
      if (pdfDocument && el('viewerContainer').clientWidth > 0 && ['page-width', 'page-fit', 'auto'].includes(preset)) pdfViewer.currentScaleValue = preset;
    }).observe(el('viewerContainer'));
    eventBus.on('pagerendered', ({pageNumber}) => drawPage(pageNumber));
    eventBus.on('pagechanging', ({pageNumber}) => { el('page-number').value = String(pageNumber); });
    eventBus.on('scalechanging', ({presetValue, scale}) => {
      const select = el('zoom-select'), preset = presetValue || String(scale);
      if ([...select.options].some(option => option.value === preset && !option.hidden)) select.value = preset;
      else { const custom = select.querySelector('option[value="custom"]'); custom.textContent = Math.round(scale * 100) + '%'; select.value = 'custom'; }
    });
    eventBus.on('updatefindmatchescount', ({matchesCount}) => showFindCount(matchesCount));
    eventBus.on('updatefindcontrolstate', ({state, matchesCount}) => showFindCount(matchesCount, state));
  }
  function showFindCount(count, state) {
    const target = el('find-count');
    if (!el('find-input').value) { target.textContent = ''; return; }
    if (state === viewerLib.FindState.NOT_FOUND) { target.textContent = '결과 없음'; return; }
    if (count?.total) target.textContent = `${count.current}/${count.total}`;
  }

  async function closeDocument() {
    const task = loadingTask;
    loadingTask = null; pdfDocument = null;
    if (pdfViewer) { pdfViewer.setDocument(null); linkService.setDocument(null); }
    if (task) { try { await task.destroy(); } catch { /* 이미 닫힘 */ } }
  }

  function setControls() {
    const loaded = !!pdfDocument;
    for (const id of ['page-from', 'page-to', 'apply-range']) el(id).disabled = masked || !loaded || confirmed;
    el('pdf-file').disabled = masked;
    el('doc-tools').hidden = masked || !loaded;
    el('designate-bar').hidden = masked || !units || confirmed;
    el('ready-bar').hidden = masked || !confirmed;
    document.body.classList.toggle('reading', confirmed);
  }

  el('pdf-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (session && !confirm('다른 파일을 열면 사이드 패널 연결이 해제됩니다. 계속할까요?')) { event.target.value = ''; return; }
    const mine = ++generation;
    invalidateSession(); confirmed = false; blocks = []; units = null; range = null;
    await closeDocument(); setControls();
    if (file.size > MAX_BYTES) { status('파일이 너무 큽니다(50MB 이하만 지원).', 'error'); return; }
    status('PDF를 여는 중입니다.');
    try {
      await ensureViewer();
      const data = new Uint8Array(await file.arrayBuffer());
      if (mine !== generation) return;
      const task = lib.getDocument({data, cMapUrl: asset('cmaps/'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts/'), isEvalSupported: false, enableXfa: false});
      loadingTask = task;
      task.onPassword = () => { task.destroy(); };
      const loaded = await task.promise;
      if (mine !== generation) { loaded.destroy(); return; }
      pdfDocument = loaded;
      pdfViewer.setDocument(loaded);
      linkService.setDocument(loaded, null);
      el('page-count').textContent = `/ ${loaded.numPages}`;
      for (const id of ['page-from', 'page-to', 'page-number']) el(id).max = String(loaded.numPages);
      el('page-from').value = '1';
      el('page-to').value = String(Math.min(loaded.numPages, MAX_PAGES));
      el('page-number').value = '1';
      setControls();
      await extract(mine);
    } catch {
      if (mine !== generation) return;
      await closeDocument(); setControls();
      status('PDF를 열 수 없습니다. 암호가 걸렸거나 손상되었거나 지원하지 않는 파일입니다.', 'error');
    }
  });

  el('apply-range').addEventListener('click', async () => {
    if (!pdfDocument || masked || confirmed) return;
    await extract(++generation);
  });

  async function extract(mine) {
    const from = Number(el('page-from').value), to = Number(el('page-to').value), total = pdfDocument.numPages;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > total || from > to) { status(`읽기 범위를 1~${total}쪽 안에서 다시 입력하세요.`, 'error'); return; }
    if (to - from + 1 > MAX_PAGES) { status(`읽기 범위는 한 번에 최대 ${MAX_PAGES}쪽입니다. 범위를 줄이세요.`, 'error'); return; }
    invalidateSession(); confirmed = false; blocks = []; units = null; range = null; setControls(); redrawAll();
    status(`p.${from}–${to}에서 문단 상자를 찾고 있습니다.`);
    try {
      const pages = [];
      for (let number = from; number <= to; number++) {
        const page = await pdfDocument.getPage(number);
        const content = await page.getTextContent();
        if (mine !== generation) return;
        pages.push({pageNumber: number, lines: PdfParagraphs.linesFromItems(content.items)});
      }
      const found = PdfParagraphs.paragraphsFromPages(pages);
      if (!found.length) { status('이 범위에서 텍스트를 찾지 못했습니다. 스캔한 PDF(이미지)는 지원하지 않습니다.', 'error'); return; }
      range = {from, to}; blocks = found; units = PdfUnits.create(blocks); units.autoSelect();
      setControls(); redrawAll();
      pdfViewer.currentPageNumber = from;
      status(`문단 상자 ${found.length}개 중 ${units.count()}개를 단위로 자동 지정했습니다. 원본 위 상자를 클릭해 바꾸세요.`);
    } catch {
      if (mine === generation) status('텍스트를 추출하지 못했습니다. 다른 범위나 파일로 다시 시도하세요.', 'error');
    }
  }

  // 단위 번호: 블록 → 단위 인덱스
  function unitIndexOfBlock(index) { return units ? units.unitOf(index) : -1; }
  function drawPage(pageNumber) {
    const view = pdfViewer?.getPageView(pageNumber - 1);
    if (!view?.div) return;
    view.div.querySelector('.unit-layer')?.remove();
    if (!range || !units || pageNumber < range.from || pageNumber > range.to) return;
    const layer = document.createElement('div');
    layer.className = 'unit-layer';
    const ranges = units.list();
    blocks.forEach((block, index) => {
      const unit = unitIndexOfBlock(index);
      if (confirmed && unit < 0) return;
      (block.rects || []).forEach(rect => {
        if (rect.page !== pageNumber) return;
        const [a, b, c, d] = view.viewport.convertToViewportRectangle([rect.x1, rect.y1, rect.x2, rect.y2]);
        const box = document.createElement(confirmed ? 'div' : 'button');
        box.className = 'unit-block' + (unit >= 0 ? ' selected' : '') + (block.heading ? ' heading' : '') + (confirmed && unit === currentUnit ? ' current' : '');
        Object.assign(box.style, {left: `${Math.min(a, c) - 3}px`, top: `${Math.min(b, d) - 2}px`, width: `${Math.abs(c - a) + 6}px`, height: `${Math.abs(d - b) + 4}px`});
        box.dataset.block = String(index);
        const preview = block.text.slice(0, 30);
        if (!confirmed) {
          box.type = 'button';
          box.setAttribute('aria-pressed', String(unit >= 0));
          box.setAttribute('aria-label', `${PdfParagraphs.pageLabel(block.pages)} 상자 ${index + 1}: ${preview}… ${unit >= 0 ? `단위 ${unit + 1}에 지정됨` : '지정 안 됨'}`);
          box.addEventListener('click', event => designate(index, event.shiftKey));
          box.addEventListener('keydown', event => { if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); designate(index, true); } });
        }
        // 단위 번호표는 그 단위의 첫 블록 첫 사각형에만 붙인다.
        if (unit >= 0 && ranges[unit][0] === index && rect === block.rects[0]) {
          const badge = document.createElement(confirmed ? 'button' : 'span');
          badge.className = 'unit-badge' + (confirmed && completed[unit] ? ' done' : '');
          badge.textContent = `단위 ${unit + 1}` + (confirmed && completed[unit] ? ' ✓' : '');
          if (confirmed) {
            badge.type = 'button';
            badge.setAttribute('aria-label', `단위 ${unit + 1}${completed[unit] ? ' 작성함' : ''} · 사이드 패널에서 이 단위로 이동`);
            badge.addEventListener('click', () => requestPanelUnit(unit));
          }
          box.append(badge);
        }
        layer.append(box);
      });
    });
    view.div.append(layer);
  }
  function redrawAll() {
    if (!pdfViewer || !pdfDocument) return;
    for (let number = 1; number <= pdfDocument.numPages; number++) {
      if (range && number >= range.from && number <= range.to) drawPage(number);
      else pdfViewer.getPageView(number - 1)?.div?.querySelector('.unit-layer')?.remove();
    }
  }
  function designate(index, extend) {
    if (!units || confirmed || masked) return;
    units.click(index, {extend});
    redrawAll();
    document.querySelector(`.unit-block[data-block="${index}"]`)?.focus();
    status(`단위 ${units.count()}개를 지정했습니다.` + (units.count() ? '' : ' 하나 이상 지정해야 읽기를 시작할 수 있습니다.'));
  }
  el('units-auto').addEventListener('click', () => { if (units && !confirmed) { units.autoSelect(); redrawAll(); status(`단위 ${units.count()}개로 자동 지정했습니다.`); } });
  el('units-clear').addEventListener('click', () => { if (units && !confirmed) { units.clear(); redrawAll(); status('지정을 모두 해제했습니다. 원본 위 상자를 클릭해 단위를 지정하세요.'); } });

  el('confirm-extraction').addEventListener('click', () => {
    if (!units?.count()) { status('단위를 하나 이상 지정하세요.', 'error'); return; }
    confirmed = true; setControls(); redrawAll();
    status(`단위 ${units.count()}개로 확정했습니다. 사이드 패널에서 「현재 글 연결」을 누르세요.`);
    el('edit-extraction').focus();
  });
  el('edit-extraction').addEventListener('click', () => {
    if (masked) return;
    if (session && !confirm('사이드 패널 연결이 해제되고 작성 중인 훈련은 다시 연결해야 합니다. 계속할까요?')) return;
    invalidateSession(); confirmed = false; setControls(); redrawAll();
    status('단위를 다시 지정하세요. 완료 후 사이드 패널에서 다시 연결해야 합니다.');
  });

  // 쪽 이동·확대·찾기 (PDF.js 부품 기능)
  el('page-prev').addEventListener('click', () => { if (pdfViewer && pdfDocument) pdfViewer.currentPageNumber = Math.max(1, pdfViewer.currentPageNumber - 1); });
  el('page-next').addEventListener('click', () => { if (pdfViewer && pdfDocument) pdfViewer.currentPageNumber = Math.min(pdfDocument.numPages, pdfViewer.currentPageNumber + 1); });
  el('page-number').addEventListener('change', event => {
    const value = Number(event.target.value);
    if (pdfViewer && pdfDocument && Number.isInteger(value) && value >= 1 && value <= pdfDocument.numPages) pdfViewer.currentPageNumber = value;
    else if (pdfViewer) event.target.value = String(pdfViewer.currentPageNumber);
  });
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  function zoom(direction) {
    if (!pdfViewer || !pdfDocument) return;
    const scale = pdfViewer.currentScale;
    const next = direction > 0 ? ZOOM_STEPS.find(step => step > scale + 0.01) : [...ZOOM_STEPS].reverse().find(step => step < scale - 0.01);
    if (next) pdfViewer.currentScaleValue = String(next);
  }
  el('zoom-in').addEventListener('click', () => zoom(1));
  el('zoom-out').addEventListener('click', () => zoom(-1));
  el('zoom-select').addEventListener('change', event => { if (pdfViewer && pdfDocument && event.target.value !== 'custom') pdfViewer.currentScaleValue = event.target.value; });
  function find(type, findPrevious = false) {
    if (!eventBus || !pdfDocument) return;
    if (!el('find-input').value || masked) { eventBus.dispatch('findbarclose', {source: null}); el('find-count').textContent = ''; return; }
    eventBus.dispatch('find', {source: null, type, query: el('find-input').value, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious, matchDiacritics: false});
  }
  el('find-input').addEventListener('input', () => find(''));
  el('find-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); find('again', event.shiftKey); } });
  el('find-next').addEventListener('click', () => find('again'));
  el('find-prev').addEventListener('click', () => find('again', true));

  function scrollToUnit(index) {
    const rect = sessionUnits[index]?.rects?.[0];
    if (!rect || !pdfViewer) return;
    pdfViewer.scrollPageIntoView({pageNumber: rect.page, destArray: [null, {name: 'XYZ'}, Math.max(0, rect.x1 - 20), rect.y2 + 40, null]});
  }
  function requestPanelUnit(index) {
    if (!session) return;
    chrome.runtime.sendMessage({target: 'side-panel', action: 'GOTO_UNIT', index, token: session.token}).then(
      response => { if (response?.status !== 'success') status(response?.message || '사이드 패널에서 이동하지 못했습니다.', 'error'); },
      () => status('사이드 패널이 열려 있는지 확인하세요.', 'error'));
  }

  // Retell 중에는 원본·찾기·쪽 이동을 화면 트리에서 숨겨 페이지 내 검색에도 걸리지 않게 한다.
  function setMasked(enabled) {
    masked = enabled;
    el('viewerContainer').hidden = enabled;
    el('mask').hidden = !enabled;
    if (enabled && eventBus) { el('find-input').value = ''; find(''); el('find-count').textContent = ''; }
    setControls();
    if (!enabled) pdfViewer?.update();
    status(enabled ? '다시 말하기 중에는 원문을 가립니다. 사이드 패널에서 원문을 복원할 수 있습니다.' : '원문을 표시합니다.');
  }
  function restore() { if (masked) setMasked(false); }
  function sessionValid(token) { return !!session && !!token && token === session.token && session.generation === generation && confirmed; }

  function handle(message) {
    if (message.action === 'EXTRACT_ARTICLE') {
      restore();
      if (!pdfDocument || !confirmed || !units?.count()) return {status: 'error', code: 'NOT_CONFIRMED', message: 'PDF 뷰어에서 파일을 열고 단위를 지정한 뒤 「지정 완료」를 누르고 연결하세요.'};
      sessionUnits = units.materialize(joinTexts);
      const text = sessionUnits.map(unit => unit.text).join('\n\n');
      session = {token: crypto.randomUUID(), generation};
      currentUnit = 0; completed = sessionUnits.map(() => false);
      redrawAll(); scrollToUnit(0);
      return {status: 'success', kind: 'pdf', text, wordCount: text.split(/\s+/).filter(Boolean).length, charCount: text.length, fallback: false, token: session.token,
        title: `PDF p.${range.from}–${range.to}`, paragraphs: sessionUnits.map(unit => ({pages: unit.pages.slice()})), url: location.href};
    }
    if (message.action === 'TOGGLE_BLUR') {
      if (message.enabled === true && !sessionValid(message.token)) { restore(); return {status: 'error', code: 'STALE_TARGET', message: '연결한 PDF가 변경되었습니다. 다시 연결하세요.'}; }
      setMasked(message.enabled === true);
      return {status: 'success', enabled: masked};
    }
    if (!sessionValid(message.token)) return {status: 'error', code: 'STALE_TARGET', message: '연결한 PDF가 변경되었습니다. 다시 연결하세요.'};
    if (message.action === 'FOCUS_PARAGRAPH') {
      if (!Number.isInteger(message.index) || message.index < 0 || message.index >= sessionUnits.length) return {status: 'error', code: 'BAD_INDEX', message: '단위 번호 오류'};
      currentUnit = message.index; redrawAll(); scrollToUnit(currentUnit);
      return {status: 'success'};
    }
    if (message.action === 'UNIT_STATUS') {
      if (!Array.isArray(message.completed) || message.completed.length !== sessionUnits.length || !message.completed.every(value => typeof value === 'boolean')) return {status: 'error', code: 'BAD_STATUS', message: '단위 상태 오류'};
      completed = message.completed.slice(); redrawAll();
      return {status: 'success'};
    }
    return {status: 'error', code: 'UNKNOWN_ACTION', message: '지원하지 않는 요청입니다.'};
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.target !== 'pdf-viewer' || sender?.id !== chrome.runtime.id || myTabId === null || message.tabId !== myTabId) return;
    try { sendResponse(handle(message)); }
    catch { restore(); sendResponse({status: 'error', code: 'VIEWER_FAILED', message: 'PDF 뷰어 요청을 처리하지 못했습니다.'}); }
  });
  chrome.runtime.onConnect.addListener(port => {
    if (myTabId === null || port.name !== 'reading-retell:' + myTabId) { port.disconnect(); return; }
    port.onDisconnect.addListener(restore);
  });
  window.addEventListener('pagehide', () => { restore(); closeDocument(); });
  setControls();
})();
