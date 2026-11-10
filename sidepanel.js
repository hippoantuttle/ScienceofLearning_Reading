// Contract: EXTRACT_ARTICLE -> {status, text, wordCount, charCount, fallback};
// TOGGLE_BLUR -> {status, enabled}; failures -> {status:'error', code, message}.
// wordCount is whitespace-separated tokens, charCount is JS string length.
const statusElement = document.getElementById('status');
const analyzeButton = document.getElementById('analyze');
const resultElement = document.getElementById('article-result');
let articleSession = null; // In-memory only; bind future actions to this tab and URL.
let blindPort = null;
let rechecked = false;
let operationBusy = false;
const allowLocalRepeatedRecommendations = (() => {
  try { return SubmissionConfig.allowRepeatedRecommendations === true && AIContract.isLoopbackEndpoint(SubmissionConfig.aiEndpoint); }
  catch { return false; }
})();
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

analyzeButton.addEventListener('click', async () => {
  if (operationBusy || analyzeButton.disabled) return;
  if (articleSession && !confirm('훈련 종료 후 작성 내용을 지우고 새 시도를 시작할까요? 같은 글도 새 시도이며 이전 인출 수행과 구분됩니다.')) return;
  analyzeButton.disabled=true;
  if (articleSession && !await restoreBlind(document.getElementById('connect-status'))) {analyzeButton.disabled=false;return;}
  if (typeof resetRecordsPanel === 'function') resetRecordsPanel();
  const recordsSection=document.getElementById('records-section');if(recordsSection)recordsSection.hidden=true;
  const trainingContext=document.getElementById('training-context');if(trainingContext)trainingContext.hidden=false;
  recommendationGate.reset();
  if (typeof resetPanelSubmission === 'function') resetPanelSubmission();
  if (typeof resetPilotAi === 'function') resetPilotAi();
  if (typeof localPreviewReset === 'function') localPreviewReset();
  document.getElementById('mock-result').textContent = '';
  document.getElementById('mock-result').hidden = true;
  document.getElementById('mock-status').textContent = '';
  document.getElementById('mock-token').value = '';
  document.getElementById('mock-recommend').disabled = true;
  if (articleSession) document.getElementById('prior').value = '';
  const articleConsent=document.getElementById('submission-article-consent');if(articleConsent)articleConsent.checked=false;
  for(const id of ['submission-article-title','submission-source-url']){const el=document.getElementById(id);if(el)el.value='';}
  document.getElementById('worksheet').reset();
  clearWorksheetErrors();
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
    if (!tab.url) throw new Error('탭 주소를 확인할 수 없습니다. 기사 탭에서 확장 프로그램 아이콘을 다시 눌러주세요.');
    let url;
    try { url = new URL(tab.url); } catch { throw new Error('페이지 주소를 확인할 수 없습니다.'); }
    if (!['http:', 'https:'].includes(url.protocol) || ['chrome.google.com', 'chromewebstore.google.com'].includes(url.hostname)) {
      throw new Error('이 페이지에는 접근할 수 없습니다. 일반 웹 기사에서 다시 시도하세요.');
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_ARTICLE' });
    const current = await chrome.tabs.get(tab.id);
    if (current.url !== tab.url) throw new Error('페이지가 변경되었습니다. 기사에서 다시 분석하세요.');
    if (!response || response.status !== 'success') throw new Error(response?.message || '본문을 확인하지 못했습니다. 다시 시도하세요.');
    document.getElementById('retell-input').value = '';
    document.getElementById('review-view').hidden = true;
    document.getElementById('retell-view').hidden = true;
    rechecked = false;
    articleSession = { tabId: tab.id, windowId: tab.windowId, url: tab.url, text: response.text, token: response.token, fallback: response.fallback };
    const titleInput = document.getElementById('submission-article-title');
    if (titleInput) titleInput.value = tabTitleForRecord(current.title);
    document.getElementById('counts').textContent = `문자 수: ${response.charCount} · 단어 수(공백 기준): ${response.wordCount}`;
    document.getElementById('fallback').textContent = response.fallback ? '주의: 기사 영역을 찾지 못해 페이지 전체 텍스트를 사용했습니다.' : '';
    resultElement.hidden = false;
    document.getElementById('mock-recommend').disabled = false;
    if (typeof pilotAiEnable === 'function') pilotAiEnable();
    showStatus('', false, document.getElementById('connect-status'));
    showStatus('본문을 연결했습니다. 원문을 직접 읽고 정리하세요.');
  } catch (error) {
    articleSession = null;
    showStatus(error?.message?.startsWith('Cannot access') || error?.message?.includes('Extensions gallery') || error?.message?.includes('No tab with id') || error?.message?.includes('Receiving end')
      ? '이 페이지에 접근할 수 없거나 탭이 변경되었습니다. 일반 기사 페이지에서 다시 시도하세요.'
      : (error?.message || '본문을 확인하지 못했습니다. 일반 기사 페이지에서 다시 시도하세요.'), true, document.getElementById('connect-status'));
  } finally {
    analyzeButton.disabled = false;
  }
});

function updateStructureLabels() {
  const labels = { claim: ['주장', '근거'], cause: ['원인', '결과'], problem: ['문제', '해결'] };
  const [primary, support] = labels[document.getElementById('structure').value] || labels.claim;
  document.getElementById('primary-label').textContent = '핵심 정보 · '+primary;
  document.getElementById('support-label').textContent = '보조 정보 · '+support;
}

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

document.getElementById('structure').addEventListener('change', updateStructureLabels);
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
    document.getElementById('mock-token').value = '';
    document.getElementById('mock-recommend').disabled = true;
    document.getElementById('mock-result').hidden = true;
    document.getElementById('mock-result').textContent = '';
    document.getElementById('mock-status').textContent = '읽기 시작 후에는 추천을 요청할 수 없습니다.';
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
    const response = await chrome.tabs.sendMessage(articleSession.tabId, {action:'TOGGLE_BLUR',enabled:false,token:articleSession.token});
    if (response?.status !== 'success' || response.enabled !== false) throw new Error();
    return true;
  } catch { showStatus('원문 복원 여부를 확인할 수 없습니다. 기사 탭을 새로고침하세요.',true,target); return false; }
  finally { if (blindPort) { const port = blindPort; blindPort = null; port.disconnect(); } }
}
function valuesForWorksheet() {
  return {main:document.getElementById('main-idea').value, primary:document.getElementById('primary').value, support:document.getElementById('support').value, relation:document.getElementById('relation').value};
}
async function enterRetell(event) {
  event?.preventDefault?.();
  if (operationBusy) return;
  clearWorksheetErrors();
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
    blindPort = chrome.tabs.connect(articleSession.tabId,{name:'reading-retell'});
    const connectedPort = blindPort;
    connectedPort.onDisconnect.addListener(() => {
      if (blindPort !== connectedPort) return;
      blindPort = null;
      document.getElementById('retell-view').hidden = true;
      document.getElementById('reading').hidden = false;
      showStatus('글 연결이 끊어졌습니다. 원문을 확인하고 다시 연결하세요.',true,document.getElementById('form-error'));
    });
    const result = await chrome.tabs.sendMessage(articleSession.tabId,{action:'TOGGLE_BLUR',enabled:true,token:articleSession.token});
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
  const values = valuesForWorksheet();
  for (const [id,value] of Object.entries({'summary-main':values.main,'summary-primary':values.primary,'summary-support':values.support,'summary-relation':values.relation,'summary-retell':retell,'summary-type':document.getElementById('structure').selectedOptions[0].textContent})) document.getElementById(id).textContent = value;
  document.getElementById('retell-view').hidden = true; document.getElementById('review-view').hidden = false; document.getElementById('step4')?.focus();
  showStatus('원문을 복원했습니다. 답안을 확인하고 동의 후 제출하세요.');
});
document.getElementById('end-training').addEventListener('click',async () => {
  if(operationBusy || !confirm('훈련을 종료하고 미저장 내용을 삭제할까요?'))return;operationBusy=true;
  try{if (!await restoreBlind()) return;}finally{operationBusy=false;}
  articleSession=null;rechecked=false;recommendationGate.reset();
  if(typeof resetPanelSubmission==='function')resetPanelSubmission();
  if(typeof resetPilotAi==='function')resetPilotAi();
  if(typeof localPreviewReset==='function')localPreviewReset();
  document.getElementById('worksheet').reset();clearWorksheetErrors();
  for(const id of ['prior','main-idea','primary','support','relation','retell-input','reflection','new-words','interests','submission-article-title','submission-source-url','mock-token']){const el=document.getElementById(id);if(el)el.value='';}
  for(const id of ['submission-consent','submission-article-consent']){const el=document.getElementById(id);if(el)el.checked=false;}
  for(const id of ['retell-error','retell-status','revisit-note','connect-status','reading-start-status','counts','fallback','mock-status','mock-result','summary-main','summary-type','summary-primary','summary-support','summary-relation','summary-retell']){const el=document.getElementById(id);if(el)el.textContent='';}
  for(const id of ['retell-view','review-view','reading','article-result','mock-result'])document.getElementById(id).hidden=true;
  document.getElementById('preparation').hidden=false;document.getElementById('mock-recommend').disabled=true;
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
