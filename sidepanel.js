// Contract: EXTRACT_ARTICLE -> {status, text, wordCount, charCount, fallback};
// TOGGLE_BLUR -> {status, enabled}; failures -> {status:'error', code, message}.
// wordCount is whitespace-separated tokens, charCount is JS string length.
const statusElement = document.getElementById('status');
const analyzeButton = document.getElementById('analyze');
const resultElement = document.getElementById('article-result');
let articleSession = null; // In-memory only; bind future actions to this tab and URL.
let blindPort = null;
let pdfWorksheet = null; // TASK-019 v3: PDF 세션의 단위별 중심 생각·단계. 패널 메모리에만 둔다.
let rechecked = false;
let operationBusy = false;
let allowLocalRepeatedRecommendations = false;
// @development-start
allowLocalRepeatedRecommendations = (() => {
  try { return SubmissionConfig.allowRepeatedRecommendations === true && AIContract.isLoopbackEndpoint(SubmissionConfig.aiEndpoint); }
  catch { return false; }
})();
// @development-end
const recommendationGate = AIContract.createGate({allowRepeatedRequests:allowLocalRepeatedRecommendations});

function showStatus(message, isError = false, target = statusElement) {
  target = target || statusElement;
  target.setAttribute?.('role', isError ? 'alert' : 'status');
  target.setAttribute?.('data-tone', isError ? 'error' : 'success');
  target.textContent = message;
}
function clearWorksheetErrors() {
  for (const id of ['main-idea','primary','support','relation']) {
    document.getElementById(id)?.removeAttribute?.('aria-invalid');
    const error = document.getElementById(id+'-error'); if (error) error.textContent='';
  }
  document.getElementById('form-error').textContent='';
}

function tabTitleForRecord(value) {
  if (typeof value !== 'string') return '';
  const clean = value.toWellFormed().replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  let title = '';
  // Respect the input's UTF-16 maxlength without splitting a surrogate pair.
  for (const character of clean) {
    if (title.length + character.length > 200) break;
    title += character;
  }
  return title;
}

// TASK-019: 확장 전용 PDF 뷰어 탭은 content.js 대신 확장 메시지로 같은 계약을 사용한다.
const PDF_VIEWER_PAGE = 'pdf-viewer.html';
function isPdfViewerUrl(value) {
  try { const url = new URL(value), base = new URL(chrome.runtime.getURL(PDF_VIEWER_PAGE)); return url.origin === base.origin && url.pathname === base.pathname; }
  catch { return false; }
}
function articleMessage(session, message) {
  return session?.kind === 'pdf'
    ? chrome.runtime.sendMessage({...message, target:'pdf-viewer', tabId:session.tabId})
    : chrome.tabs.sendMessage(session.tabId, message);
}
function articlePort(session) {
  return session?.kind === 'pdf'
    ? chrome.runtime.connect({name:'reading-retell:' + session.tabId})
    : chrome.tabs.connect(session.tabId, {name:'reading-retell'});
}
function setHidden(id, hidden) { const element = document.getElementById(id); if (element) element.hidden = hidden; }
// TASK-019 v3 화면 단계: units(단위별 중심 생각) → structure(문서 전체 구조도·Retell 이동). 웹 기사는 기존 화면 그대로.
function applyPdfPhase() {
  const phase = pdfWorksheet ? pdfWorksheet.phase() : null;
  setHidden('pdf-nav', phase !== 'units');
  setHidden('pdf-structure-intro', phase !== 'structure');
  setHidden('main-idea-block', phase === 'structure');
  setHidden('structure-block', phase === 'units');
  setHidden('retell-submit-block', phase === 'units');
  const label = document.getElementById('main-idea-label');
  if (label) label.textContent = phase === 'units' ? `${pdfWorksheet.label()}의 중심 생각` : '중심 생각';
  if (phase === 'structure') { const summary = document.getElementById('pdf-units-summary'); if (summary) summary.textContent = pdfWorksheet.mainIdea(); }
}
function resetPdfMode() {
  pdfWorksheet = null;
  setHidden('step-feedback', false);
  applyPdfPhase();
  const status = document.getElementById('pdf-nav-status'); if (status) status.textContent = '';
}
function savePdfCurrent() { if (pdfWorksheet?.phase() === 'units') pdfWorksheet.setMain(document.getElementById('main-idea').value); }
function pdfStructureValues() {
  return {structure:document.getElementById('structure').value, primary:document.getElementById('primary').value, support:document.getElementById('support').value, relation:document.getElementById('relation').value};
}
function sendPdfUnitStatus() {
  if (!pdfWorksheet || articleSession?.kind !== 'pdf') return;
  Promise.resolve(articleMessage(articleSession, {action:'UNIT_STATUS', completed:pdfWorksheet.completed(), token:articleSession.token})).catch(() => {});
}
function renderPdfNav() {
  if (!pdfWorksheet) return;
  const index = pdfWorksheet.index(), count = pdfWorksheet.count();
  document.getElementById('pdf-nav-label').textContent = `${pdfWorksheet.label()} / 전체 ${count}단위`;
  document.getElementById('pdf-nav-progress').textContent = `${pdfWorksheet.completedCount()}/${count}`;
  const select = document.getElementById('pdf-nav-select');
  if (select.options.length !== count) {
    select.replaceChildren(...Array.from({length:count}, (_, at) => { const option = document.createElement('option'); option.value = String(at); return option; }));
  }
  Array.from(select.options).forEach((option, at) => { option.textContent = pdfWorksheet.label(at) + (pdfWorksheet.isComplete(at) ? ' · 작성함' : ''); });
  select.value = String(index);
  document.getElementById('pdf-prev').disabled = index === 0;
  document.getElementById('pdf-next').disabled = index === count - 1;
  applyPdfPhase();
}
async function gotoPdfUnit(next) {
  if (!pdfWorksheet) return;
  savePdfCurrent();
  pdfWorksheet.go(next);
  document.getElementById('main-idea').value = pdfWorksheet.getMain();
  clearWorksheetErrors(); renderPdfNav(); sendPdfUnitStatus();
  const status = document.getElementById('pdf-nav-status'); status.textContent = '';
  try {
    const response = await articleMessage(articleSession, {action:'FOCUS_PARAGRAPH', index:next, token:articleSession?.token});
    if (response?.status !== 'success') throw new Error(response?.message);
  } catch (error) { showStatus(error?.message || 'PDF 뷰어에서 단위를 표시하지 못했습니다. 뷰어 탭을 확인하세요.', true, status); }
}
// 제출 패널이 사용하는 답안 값. PDF는 단위별 중심 생각을 [단위 n] 표기로 묶고 구조도는 문서 전체 값 하나다.
function worksheetSubmissionValues() {
  if (articleSession?.kind === 'pdf' && pdfWorksheet) return pdfWorksheet.serialize(pdfStructureValues());
  const v = id => document.getElementById(id).value;
  return {structureType:v('structure'), mainIdea:v('main-idea'), primary:v('primary'), support:v('support'), relation:v('relation')};
}
document.getElementById('open-pdf-viewer')?.addEventListener('click', async () => {
  try {
    const panelWindow = await chrome.windows.getCurrent();
    await chrome.tabs.create({url:chrome.runtime.getURL(PDF_VIEWER_PAGE), windowId:panelWindow.id});
    showStatus('새 탭에서 PDF를 열고 「지정 완료」를 누르면 이 패널에 자동으로 연결됩니다.', false, document.getElementById('connect-status'));
  } catch { showStatus('PDF 뷰어를 열지 못했습니다.', true, document.getElementById('connect-status')); }
});
document.getElementById('pdf-prev')?.addEventListener('click', () => { if (pdfWorksheet && pdfWorksheet.index() > 0) gotoPdfUnit(pdfWorksheet.index() - 1); });
document.getElementById('pdf-next')?.addEventListener('click', () => { if (pdfWorksheet && pdfWorksheet.index() < pdfWorksheet.count() - 1) gotoPdfUnit(pdfWorksheet.index() + 1).then(() => document.getElementById('main-idea').focus()); });
document.getElementById('pdf-nav-select')?.addEventListener('change', event => { const next = Number(event.target.value); if (pdfWorksheet && Number.isInteger(next)) gotoPdfUnit(next); });
document.getElementById('main-idea')?.addEventListener?.('change', () => { if (pdfWorksheet?.phase() === 'units') { savePdfCurrent(); renderPdfNav(); sendPdfUnitStatus(); } });
document.getElementById('pdf-to-structure')?.addEventListener('click', async () => {
  if (!pdfWorksheet) return;
  savePdfCurrent();
  const missing = pdfWorksheet.firstIncomplete();
  if (missing !== null) {
    if (missing !== pdfWorksheet.index()) await gotoPdfUnit(missing);
    showStatus(`${pdfWorksheet.label()}의 중심 생각을 아직 작성하지 않았습니다. 모든 단위를 작성해야 구조도로 넘어갑니다.`, true, document.getElementById('pdf-nav-status'));
    document.getElementById('main-idea').focus(); return;
  }
  try { pdfWorksheet.toStructure(); }
  catch (error) { showStatus(error.message, true, document.getElementById('pdf-nav-status')); return; }
  sendPdfUnitStatus(); applyPdfPhase(); updateStructureLabels();
  document.getElementById('structure').focus();
  showStatus('모든 단위의 중심 생각을 작성했습니다. 문서 전체 구조도를 작성한 뒤 다시 말하기로 이동하세요.');
});
document.getElementById('pdf-back-units')?.addEventListener('click', () => {
  if (!pdfWorksheet) return;
  pdfWorksheet.toUnits();
  document.getElementById('main-idea').value = pdfWorksheet.getMain();
  renderPdfNav();
  document.getElementById('main-idea').focus();
});
// 뷰어의 단위 번호표 → 패널 이동. 연결 토큰이 같은 패널만 응답한다(다른 창의 패널은 조용히 무시).
// TASK-021: 뷰어에서 「지정 완료」를 누르면 같은 창의 패널이 그 탭을 자동으로 연결한다.
// 다른 창의 패널은 응답하지 않는다(먼저 응답한 패널이 결과가 되므로 창 id를 동기적으로 확인).
let panelWindowId = null;
Promise.resolve(chrome.windows?.getCurrent?.()).then(win => { if (Number.isInteger(win?.id)) panelWindowId = win.id; }, () => {});
function handlePdfReady(sender, sendResponse) {
  const tab = sender?.tab;
  if (sender?.id !== chrome.runtime.id || !tab || !isPdfViewerUrl(sender.url || tab.url) || panelWindowId === null || tab.windowId !== panelWindowId) return false;
  if (operationBusy || analyzeButton.disabled) { sendResponse({status:'busy', message:'사이드 패널이 다른 작업 중입니다. 잠시 후 패널에서 「현재 탭 글 연결」을 누르세요.'}); return false; }
  if (articleSession && !(articleSession.kind === 'pdf' && articleSession.tabId === tab.id)) { sendResponse({status:'busy', message:'사이드 패널에 진행 중인 훈련이 있습니다. 패널에서 「현재 탭 글 연결」을 눌러 새로 시작하세요.'}); return false; }
  connectCurrentTab({skipConfirm:true}).then(() => {
    const connected = articleSession?.kind === 'pdf' && articleSession.tabId === tab.id;
    sendResponse(connected ? {status:'success'} : {status:'error', message:document.getElementById('connect-status')?.textContent || '사이드 패널에 연결하지 못했습니다.'});
  }, () => sendResponse({status:'error', message:'사이드 패널에 연결하지 못했습니다.'}));
  return true;
}
chrome.runtime?.onMessage?.addListener?.((message, sender, sendResponse) => {
  if (message?.target === 'side-panel' && message.action === 'PDF_READY') return handlePdfReady(sender, sendResponse);
  if (message?.target !== 'side-panel' || message.action !== 'GOTO_UNIT') return;
  if (!pdfWorksheet || articleSession?.kind !== 'pdf' || message.token !== articleSession.token || (sender?.tab && sender.tab.id !== articleSession.tabId)) return;
  if (document.getElementById('reading').hidden) { sendResponse({status:'error', message:'읽기·구조화 단계에서만 단위를 이동할 수 있습니다.'}); return; }
  if (!Number.isInteger(message.index) || message.index < 0 || message.index >= pdfWorksheet.count()) { sendResponse({status:'error', message:'단위 번호 오류'}); return; }
  if (pdfWorksheet.phase() === 'structure') pdfWorksheet.toUnits();
  gotoPdfUnit(message.index);
  sendResponse({status:'success'});
});

analyzeButton.addEventListener('click', () => connectCurrentTab());
async function connectCurrentTab({skipConfirm = false} = {}) {
  if (operationBusy || analyzeButton.disabled) return;
  if (articleSession && !skipConfirm && !confirm('훈련 종료 후 작성 내용을 지우고 새 시도를 시작할까요? 같은 글도 새 시도이며 이전 인출 수행과 구분됩니다.')) return;
  analyzeButton.disabled=true;
  if (articleSession && !await restoreBlind(document.getElementById('connect-status'))) {analyzeButton.disabled=false;return;}
  if (typeof resetRecordsPanel === 'function') resetRecordsPanel();
  const recordsSection=document.getElementById('records-section');if(recordsSection)recordsSection.hidden=true;
  const trainingContext=document.getElementById('training-context');if(trainingContext)trainingContext.hidden=false;
  recommendationGate.reset();
  if (typeof resetPanelSubmission === 'function') resetPanelSubmission();
  if (typeof resetPilotAi === 'function') resetPilotAi();
  if (typeof localPreviewReset === 'function') localPreviewReset();
  // @development-start
  document.getElementById('mock-result').textContent = '';
  document.getElementById('mock-result').hidden = true;
  document.getElementById('mock-status').textContent = '';
  document.getElementById('mock-token').value = '';
  document.getElementById('mock-recommend').disabled = true;
  // @development-end
  if (articleSession) document.getElementById('prior').value = '';
  const articleConsent=document.getElementById('submission-article-consent');if(articleConsent)articleConsent.checked=false;
  for(const id of ['submission-article-title','submission-source-url']){const el=document.getElementById(id);if(el)el.value='';}
  document.getElementById('worksheet').reset();
  clearWorksheetErrors();
  resetPdfMode();
  document.getElementById('reading').hidden = true;
  document.getElementById('preparation').hidden = false;
  updateStructureLabels();
  analyzeButton.disabled = true;
  resultElement.hidden = true;
  articleSession = null;
  showStatus('기사 본문을 확인하고 있습니다.', false, document.getElementById('connect-status'));
  try {
    const panelWindow = await chrome.windows.getCurrent();
    if (!Number.isInteger(panelWindow?.id) || panelWindow.id < 0) throw new Error('패널이 속한 창을 확인할 수 없습니다. 다시 열어 주세요.');
    const [tab] = await chrome.tabs.query({ active: true, windowId: panelWindow.id });
    if (!tab || tab.id == null || tab.windowId !== panelWindow.id) throw new Error('활성 탭을 찾을 수 없습니다. 기사 창에서 확장 프로그램을 다시 여세요.');
    let viewer = isPdfViewerUrl(tab.url);
    let response;
    if (!viewer && !tab.url) {
      // 탭 주소가 보이지 않는 경우에도 이 확장의 PDF 뷰어인지 확인한다(뷰어는 자기 탭 id일 때만 응답).
      try { const probe = await articleMessage({kind:'pdf', tabId:tab.id}, { action: 'EXTRACT_ARTICLE' }); if (probe?.kind === 'pdf' || probe?.code === 'NOT_CONFIRMED') { viewer = true; response = probe; } } catch { /* 뷰어 아님 */ }
    }
    if (viewer && response) {
      if (response.status === 'success' && (!Array.isArray(response.paragraphs) || !response.paragraphs.length)) throw new Error('PDF 뷰어 응답을 확인하지 못했습니다.');
    } else if (viewer) {
      response = await articleMessage({kind:'pdf', tabId:tab.id}, { action: 'EXTRACT_ARTICLE' });
      if (response?.status === 'success' && (response.kind !== 'pdf' || !Array.isArray(response.paragraphs) || !response.paragraphs.length)) throw new Error('PDF 뷰어 응답을 확인하지 못했습니다.');
    } else {
      if (!tab.url) throw new Error('탭 주소를 확인할 수 없습니다. 기사 탭에서 확장 프로그램 아이콘을 다시 눌러주세요.');
      let url;
      try { url = new URL(tab.url); } catch { throw new Error('페이지 주소를 확인할 수 없습니다.'); }
      if (url.protocol === 'file:' || /\.pdf$/i.test(url.pathname)) throw new Error('PDF는 「PDF 열기」로 파일을 열어 연결하세요.');
      if (!['http:', 'https:'].includes(url.protocol) || ['chrome.google.com', 'chromewebstore.google.com'].includes(url.hostname)) {
        throw new Error('이 페이지에는 접근할 수 없습니다. 일반 웹 기사에서 다시 시도하세요.');
      }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      response = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_ARTICLE' });
    }
    const current = await chrome.tabs.get(tab.id);
    if (current.url !== tab.url) throw new Error('페이지가 변경되었습니다. 기사에서 다시 분석하세요.');
    if (!response || response.status !== 'success') throw new Error(response?.message || '본문을 확인하지 못했습니다. 다시 시도하세요.');
    document.getElementById('retell-input').value = '';
    document.getElementById('review-view').hidden = true;
    document.getElementById('retell-view').hidden = true;
    rechecked = false;
    articleSession = { kind: viewer ? 'pdf' : 'web', tabId: tab.id, windowId: tab.windowId, url: tab.url, text: response.text, token: response.token, fallback: response.fallback };
    const titleInput = document.getElementById('submission-article-title');
    // PDF는 파일명을 자동으로 채우지 않는다(TASK-019). 쪽 범위만 후보로 둔다.
    if (titleInput) titleInput.value = tabTitleForRecord(viewer ? response.title : current.title);
    if (viewer) {
      pdfWorksheet = PdfWorksheet.create(response.paragraphs);
      renderPdfNav();
    }
    document.getElementById('fallback').textContent = response.fallback ? '본문 영역을 찾지 못해 페이지 전체를 가져왔습니다.' : '';
    setHidden('step-feedback', viewer);
    resultElement.hidden = false;
    // @development-start
    document.getElementById('mock-recommend').disabled = false;
    // @development-end
    if (typeof pilotAiEnable === 'function') pilotAiEnable();
    showStatus('', false, document.getElementById('connect-status'));
    showStatus(viewer ? `PDF 단위 ${response.paragraphs.length}개를 연결했습니다. 준비되면 「읽기·구조화 시작」을 누르세요.` : '글을 연결했습니다. 준비되면 「읽기·구조화 시작」을 누르세요.');
  } catch (error) {
    articleSession = null; resetPdfMode();
    showStatus(error?.message?.startsWith('Cannot access') || error?.message?.includes('Extensions gallery') || error?.message?.includes('No tab with id') || error?.message?.includes('Receiving end')
      ? '이 페이지에 접근할 수 없거나 탭이 변경되었습니다. 일반 기사 페이지에서 다시 시도하세요.'
      : (error?.message || '본문을 확인하지 못했습니다. 일반 기사 페이지에서 다시 시도하세요.'), true, document.getElementById('connect-status'));
  } finally {
    analyzeButton.disabled = false;
  }
}

function updateStructureLabels() {
  const labels = { claim: ['주장', '근거'], cause: ['원인', '결과'], problem: ['문제', '해결'] };
  const [primary, support] = labels[document.getElementById('structure').value] || labels.claim;
  document.getElementById('primary-label').textContent = '핵심 정보 · '+primary;
  document.getElementById('support-label').textContent = '보조 정보 · '+support;
  const hint = document.getElementById('relation-type-help');
  if (hint) hint.textContent = ({claim:'이 근거의 어떤 부분이 주장을 뒷받침하나요?',cause:'원문에서는 원인이 결과로 이어지는 과정을 어떻게 설명하나요?',problem:'이 해결책은 문제의 어떤 부분에 대응하나요?'})[document.getElementById('structure').value] || '';

}

// @development-start
document.getElementById('mock-recommend').addEventListener('click', async () => {
  const button = document.getElementById('mock-recommend');
  const tokenField = document.getElementById('mock-token');
  const token = tokenField.value;
  tokenField.value = '';
  if (!token) { document.getElementById('mock-status').textContent = '로컬 테스트 토큰을 입력하세요.';globalThis.PanelUI?.tone(document.getElementById('mock-status'),'error'); return; }
  button.disabled = true;
  document.getElementById('mock-status').textContent = '로컬 모의 서버에 요청하고 있습니다.';
  globalThis.PanelUI?.tone(document.getElementById('mock-status'),'warning');
  try {
    const data = await recommendationGate.request(() => AIContract.requestMock(token));
    if (!data) return;
    const result = document.getElementById('mock-result');
    result.textContent = `테스트 예시 (실제 AI 결과 아님)\n${data.terms.map(item => `${item.term}: ${item.definition}`).join('\n')}\n${data.background.join('\n')}\n구조도: 추천 없음 (직접 선택)`;
    result.hidden = false;
    document.getElementById('mock-status').textContent = '이 예시는 읽은 글과 무관합니다.';
    globalThis.PanelUI?.tone(document.getElementById('mock-status'),'success');
  } catch (error) {
    const safe = ['로컬 테스트 인증에 실패했습니다.','로컬 테스트 서버 응답 시간이 초과되었습니다.','모의 응답 형식이 올바르지 않습니다.'];
    document.getElementById('mock-status').textContent = `${safe.includes(error?.message) ? error.message : '로컬 테스트 서버에 연결하지 못했습니다.'} 자료 없이 계속할 수 있습니다.`;
    globalThis.PanelUI?.tone(document.getElementById('mock-status'),'error');
  }
});

// @development-end
document.getElementById('structure').addEventListener('change', updateStructureLabels);
document.getElementById('worksheet').addEventListener('reset', () => {
  const details = document.getElementById('relation-details');
  if (details) details.open = false;
});
document.getElementById('back').addEventListener('click', () => {
  document.getElementById('reading').hidden = true;
  document.getElementById('preparation').hidden = false;
  document.getElementById('start-reading').focus();
});
document.getElementById('start-reading').addEventListener('click', async () => {
  if(operationBusy)return;operationBusy=true;
  try {
    if (!articleSession) throw new Error('먼저 글을 연결하세요.');
    const current = await chrome.tabs.get(articleSession.tabId);
    const [active] = await chrome.tabs.query({ active: true, windowId: articleSession.windowId });
    if (current.url !== articleSession.url || active?.id !== articleSession.tabId) throw new Error('연결한 글이 변경되었거나 다른 탭이 열려 있습니다. 원래 글로 돌아가거나 새 글을 연결하세요.');
    recommendationGate.startReading();
    if (typeof localPreviewStartReading === 'function') localPreviewStartReading();
    if (typeof pilotAiStartReading === 'function') pilotAiStartReading();
    // @development-start
    document.getElementById('mock-token').value = '';
    document.getElementById('mock-recommend').disabled = true;
    document.getElementById('mock-result').hidden = true;
    document.getElementById('mock-result').textContent = '';
    document.getElementById('mock-status').textContent = '읽기 시작 후에는 추천을 요청할 수 없습니다.';
    // @development-end
    document.getElementById('preparation').hidden = true;
    document.getElementById('reading').hidden = false;
    document.getElementById('main-idea').focus();
    showStatus('읽기·구조화 중입니다. 직접 작성한 뒤 다시 말하기로 이동하세요.');
    const status=document.getElementById('reading-start-status');if(status)status.textContent='';
  } catch (error) { showStatus(error.message || '연결한 글을 다시 확인하세요.', true, document.getElementById('reading-start-status')); }
  finally{operationBusy=false;}
});
document.getElementById('worksheet').addEventListener('submit', enterRetell);
updateStructureLabels();

async function validateBoundTab() {
  if (!articleSession?.token) throw new Error('연결한 글을 다시 확인하세요.');
  const context = await chrome.windows.getCurrent();
  if (!Number.isInteger(context?.id) || context.id !== articleSession.windowId) throw new Error('패널 창을 확인할 수 없습니다.');
  const current = await chrome.tabs.get(articleSession.tabId);
  const [active] = await chrome.tabs.query({active:true, windowId:articleSession.windowId});
  if (current.url !== articleSession.url || active?.id !== articleSession.tabId) throw new Error('연결한 글이 변경되었거나 다른 탭이 열려 있습니다.');
}
async function restoreBlind(target) {
  if(!target){
    const stage=!document.getElementById('retell-view').hidden?'retell-status':!document.getElementById('reading').hidden?'form-error':!document.getElementById('review-view').hidden?'submission-status':'connect-status';
    target=document.getElementById(stage);
  }
  if (!articleSession) return false;
  try {
    const response = await articleMessage(articleSession, {action:'TOGGLE_BLUR',enabled:false,token:articleSession.token});
    if (response?.status !== 'success' || response.enabled !== false) throw new Error();
    return true;
  } catch { showStatus(articleSession?.kind === 'pdf' ? '원문 복원 여부를 확인할 수 없습니다. PDF 뷰어 탭을 확인하세요.' : '원문 복원 여부를 확인할 수 없습니다. 기사 탭을 새로고침하세요.',true,target); return false; }
  finally { if (blindPort) { const port = blindPort; blindPort = null; port.disconnect(); } }
}
function valuesForWorksheet() {
  if (pdfWorksheet) { let main = ''; try { main = pdfWorksheet.mainIdea(); } catch { main = ''; } return {main, primary:document.getElementById('primary').value, support:document.getElementById('support').value, relation:document.getElementById('relation').value}; }
  return {main:document.getElementById('main-idea').value, primary:document.getElementById('primary').value, support:document.getElementById('support').value, relation:document.getElementById('relation').value};
}
async function enterRetell(event) {
  event?.preventDefault?.();
  if (operationBusy) return;
  clearWorksheetErrors();
  if (pdfWorksheet) {
    savePdfCurrent();
    if (pdfWorksheet.phase() !== 'structure') { showStatus('모든 단위의 중심 생각을 작성하고 문서 구조도 단계로 넘어가세요.', true, document.getElementById('pdf-nav-status')); return; }
    try { pdfWorksheet.serialize(pdfStructureValues()); }
    catch (error) { showStatus(error.message, true, document.getElementById('form-error')); return; }
  }
  const validation=Worksheet.validate(valuesForWorksheet());
  if (!validation.valid) {
    const ids={main:'main-idea',primary:'primary',support:'support',relation:'relation'};
    const messages={main:'중심 생각을 작성하세요.',primary:'핵심 정보를 작성하세요.',support:'보조 정보를 작성하세요.',relation:'관계 설명을 작성하세요.'};
    for(const key of validation.missing){
      document.getElementById(ids[key]).setAttribute?.('aria-invalid','true');
      const error=document.getElementById(ids[key]+'-error');if(error)error.textContent=messages[key];
    }
    showStatus('중심 생각, 핵심 정보·보조 정보와 관계 설명을 모두 작성하세요.',true,document.getElementById('form-error'));
    document.getElementById(ids[validation.missing[0]]).focus();return;
  }
  operationBusy = true;
  try {
    await validateBoundTab();
    blindPort = articlePort(articleSession);
    const connectedPort = blindPort;
    connectedPort.onDisconnect.addListener(() => {
      if (blindPort !== connectedPort) return;
      blindPort = null;
      document.getElementById('retell-view').hidden = true;
      document.getElementById('reading').hidden = false;
      showStatus('글 연결이 끊어졌습니다. 원문을 확인하고 다시 연결하세요.',true,document.getElementById('form-error'));
    });
    const result = await articleMessage(articleSession,{action:'TOGGLE_BLUR',enabled:true,token:articleSession.token});
    if (result?.status !== 'success' || result.enabled !== true) throw new Error(result?.message || '원문을 가리지 못했습니다.');
    await validateBoundTab();
    document.getElementById('reading').hidden = true;
    document.getElementById('retell-view').hidden = false;
    document.getElementById('revisit-note').textContent = rechecked ? '이전에 원문을 다시 확인했습니다.' : '';
    document.getElementById('retell-input').focus();
    showStatus('원문을 가렸습니다. 기억나는 내용을 자신의 말로 작성하세요.');
  } catch (error) { const restored=await restoreBlind(document.getElementById('form-error')); if(restored)showStatus(error.message || '원문 가림을 확인하지 못했습니다.',true,document.getElementById('form-error')); }
  finally { operationBusy = false; }
}
// Prevent the submit button's default event from starting a second transition.
document.getElementById('to-retell').addEventListener('click',enterRetell);
document.getElementById('back-to-reading').addEventListener('click',async () => {
  if(operationBusy)return;operationBusy=true;
  try{if (!await restoreBlind()) return;}finally{operationBusy=false;}
  rechecked = true; document.getElementById('retell-view').hidden = true; document.getElementById('reading').hidden = false;
  document.getElementById('main-idea').focus();
  showStatus('원문을 다시 확인했습니다. 이후 다시 말하기는 재확인 수행으로 기록됩니다.');
});
document.getElementById('to-review').addEventListener('click',async () => {
  if(operationBusy)return;
  const retell = document.getElementById('retell-input').value;
  const retellError=document.getElementById('retell-error');if(retellError)retellError.textContent='';
  document.getElementById('retell-input').removeAttribute?.('aria-invalid');
  if (!retell.trim()) { showStatus('다시 말하기를 작성하세요.',true,retellError);document.getElementById('retell-input').setAttribute?.('aria-invalid','true'); document.getElementById('retell-input').focus(); return; }
  operationBusy=true;
  try{if (!await restoreBlind()) return;}finally{operationBusy=false;}
  let values = valuesForWorksheet(), typeText = document.getElementById('structure').selectedOptions[0].textContent;
  if (pdfWorksheet) {
    try { const packed = worksheetSubmissionValues(); values = {main:packed.mainIdea, primary:packed.primary, support:packed.support, relation:packed.relation}; typeText = '문서 전체 · ' + typeText; }
    catch (error) { showStatus(error.message, true, retellError); return; }
  }
  for (const [id,value] of Object.entries({'summary-main':values.main,'summary-primary':values.primary,'summary-support':values.support,'summary-relation':values.relation.trim() ? values.relation : '작성하지 않음 (선택)','summary-retell':retell,'summary-type':typeText})) document.getElementById(id).textContent = value;
  document.getElementById('retell-view').hidden = true; document.getElementById('review-view').hidden = false; document.getElementById('step4')?.focus();
  showStatus('원문을 다시 표시했습니다. 답안을 확인하고 저장하세요.');
});
document.getElementById('end-training').addEventListener('click',async () => {
  if(operationBusy || !confirm('훈련을 종료하고 미저장 내용을 삭제할까요?'))return;operationBusy=true;
  try{if (!await restoreBlind()) return;}finally{operationBusy=false;}
  articleSession=null;rechecked=false;recommendationGate.reset();resetPdfMode();
  if(typeof resetPanelSubmission==='function')resetPanelSubmission();
  if(typeof resetPilotAi==='function')resetPilotAi();
  if(typeof localPreviewReset==='function')localPreviewReset();
  document.getElementById('worksheet').reset();clearWorksheetErrors();
  for(const id of ['prior','main-idea','primary','support','relation','retell-input','reflection','new-words','interests','submission-article-title','submission-source-url','mock-token']){const el=document.getElementById(id);if(el)el.value='';}
  for(const id of ['submission-consent','submission-article-consent']){const el=document.getElementById(id);if(el)el.checked=false;}
  for(const id of ['retell-error','retell-status','revisit-note','connect-status','reading-start-status','fallback','mock-status','mock-result','summary-main','summary-type','summary-primary','summary-support','summary-relation','summary-retell']){const el=document.getElementById(id);if(el)el.textContent='';}
  for(const id of ['retell-view','review-view','reading','article-result','mock-result']){const el=document.getElementById(id);if(el)el.hidden=true;}
  document.getElementById('preparation').hidden=false;
  // @development-start
  document.getElementById('mock-recommend').disabled=true;
  // @development-end
  updateStructureLabels();showStatus('훈련을 종료했습니다. 미저장 내용을 지웠습니다. 새 글을 연결하세요.');analyzeButton.focus();
});
async function interruptRetell(message) {
  if(operationBusy)return;
  operationBusy=true;
  try {
    if(!await restoreBlind())return;
    document.getElementById('retell-view').hidden=true;document.getElementById('reading').hidden=false;rechecked=true;
    showStatus(message,true,document.getElementById('form-error'));document.getElementById('main-idea').focus();
  } finally {operationBusy=false;}
}
chrome.tabs.onActivated?.addListener(info => {
  if (blindPort && articleSession && info.windowId === articleSession.windowId && info.tabId !== articleSession.tabId) {
    return interruptRetell('탭이 변경되어 원문을 복원했습니다. 원래 글로 돌아가세요.');
  }
});
chrome.tabs.onUpdated?.addListener((id,change) => {
  if (blindPort && articleSession && id === articleSession.tabId && (change.url || change.status === 'loading')) {
    return interruptRetell('페이지가 변경되었습니다. 글을 다시 연결하세요.');
  }
});
