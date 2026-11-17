'use strict';
// TASK-027 C: 저장 전 훈련을 chrome.storage.session에 임시저장하고, 패널을 다시 열면 이어갈지 묻는다.
// - 저장: 글을 연결한 뒤 입력·단계 변화가 있을 때(잠시 모아서) 저장한다. 저장(제출) 완료·훈련 종료·내 기록 이동·로그아웃 때 지운다.
// - 이어가기: 같은 탭·같은 주소·같은 본문(해시)·같은 계정일 때만. 초급 AI 후보는 다시 요청하지 않는다.
// - 다시 말하기·정리 단계에서 패널을 닫으면 원문 가림이 풀리므로, 이어갈 때는 원문 재확인으로 기록한다.
const draftStore = TrainingDraft.createStore(globalThis.chrome?.storage?.session);
let draftTimer = null, draftBusy = false, draftOffer = null, draftHashCache = {text: null, hash: null};
const draftEl = id => document.getElementById(id);

function draftOwnerRaw() {
  try { const flow = panelFlow(); return flow.getToken() ? (flow.getAccountId?.() || flow.getIdentity?.() || null) : null; }
  catch { return null; }
}
async function draftTextHash(text) {
  if (draftHashCache.text !== text) draftHashCache = {text, hash: await TrainingDraft.sha256(text)};
  return draftHashCache.hash;
}
function draftStep() {
  for (const id of ['review-view', 'retell-view', 'reading']) if (!draftEl(id).hidden) return id;
  return 'preparation';
}
function draftSaved() { return draftEl('training-context')?.dataset?.saved === 'true'; }

async function draftCollect() {
  const session = articleSession;
  if (!session || typeof session.text !== 'string') return null;
  if (typeof savePdfCurrent === 'function') savePdfCurrent();
  const fields = {}, checks = {};
  for (const id of TrainingDraft.FIELDS) { const el = draftEl(id); if (el && typeof el.value === 'string') fields[id] = el.value; }
  for (const id of TrainingDraft.CHECKS) { const el = draftEl(id); if (el) checks[id] = el.checked === true; }
  const guided = typeof guidedDraft === 'function' ? guidedDraft() : null;
  const draft = {
    version: TrainingDraft.VERSION, savedAt: Date.now(), owner: await TrainingDraft.ownerKey(draftOwnerRaw()),
    step: draftStep(), rechecked: rechecked === true,
    article: {kind: session.kind, tabId: session.tabId, windowId: session.windowId, url: session.url, textHash: await draftTextHash(session.text)},
    fields, checks, pdf: session.kind === 'pdf' && pdfWorksheet ? pdfWorksheet.snapshot() : null, guided
  };
  return articleSession === session ? draft : null;
}
async function draftFlush() {
  clearTimeout(draftTimer); draftTimer = null;
  if (draftBusy || draftOffer) return; // 이어갈지 묻는 동안·복원 중에는 기존 임시저장을 덮어쓰지 않는다.
  if (draftSaved()) { await draftStore.clear(); return; }
  const draft = await draftCollect();
  if (draft) await draftStore.save(draft);
}
function draftSchedule() {
  if (draftBusy || draftOffer || !articleSession) return;
  clearTimeout(draftTimer); draftTimer = setTimeout(() => { void draftFlush(); }, 400);
}
// 새 글 연결 전: 이어갈 수 있는 임시저장이 있으면 삭제를 확인한다. 취소하면 false.
function draftBeforeNewTraining() {
  if (draftOffer && !confirm('임시저장한 훈련이 있습니다. 새 글을 연결하면 임시저장이 삭제됩니다. 계속할까요?')) return false;
  draftDiscard(); return true;
}
// 훈련 종료·내 기록 이동·로그아웃·새 시도: 임시저장을 지운다.
function draftDiscard() {
  clearTimeout(draftTimer); draftTimer = null; draftOffer = null;
  const box = draftEl('draft-resume'); if (box) box.hidden = true;
  void draftStore.clear();
}

function draftShowOffer(draft) {
  draftOffer = draft;
  draftEl('draft-resume-summary').textContent = TrainingDraft.describe(draft) + (draft.fields['submission-article-title'] ? ` · ${draft.fields['submission-article-title']}` : '');
  draftEl('draft-resume-status').textContent = '';
  draftEl('draft-resume').hidden = false;
}
function draftMessage(text, error = true) { showStatus(text, error, draftEl('draft-resume-status')); }

async function draftResume() {
  const draft = draftOffer;
  if (!draft || draftBusy || operationBusy) return;
  draftBusy = true;
  const button = draftEl('draft-resume-continue'); button.disabled = true;
  try {
    const owner = await TrainingDraft.ownerKey(draftOwnerRaw());
    if (draft.owner && !owner) { draftMessage('임시저장한 계정으로 로그인한 뒤 다시 누르세요. 로그인 확인 중이면 잠시 후 다시 누르세요.'); return; }
    if (draft.owner && owner !== draft.owner) { draftDiscard(); showStatus('다른 계정의 임시저장이라 삭제했습니다. 새 글을 연결하세요.', true, draftEl('connect-status')); return; }
    const panelWindow = await chrome.windows.getCurrent();
    let tab = null;
    try { tab = await chrome.tabs.get(draft.article.tabId); } catch { tab = null; }
    if (!tab || tab.url !== draft.article.url) { draftMessage('원래 글 탭을 찾을 수 없습니다. 글 탭이 닫혔거나 주소가 바뀌었으면 이어갈 수 없습니다. 같은 글을 다시 열어도 이어지지 않으니, 필요하면 「삭제하고 새로 시작」을 누르세요.'); return; }
    if (tab.windowId !== panelWindow?.id) { draftMessage('원래 글 탭이 다른 창에 있습니다. 그 창에서 사이드 패널을 열어 이어가세요.'); return; }
    if (tab.active === false) await chrome.tabs.update(tab.id, {active: true});
    draftOffer = null; draftEl('draft-resume').hidden = true;
    await connectCurrentTab({skipConfirm: true, resume: true});
    if (!articleSession || articleSession.tabId !== tab.id || articleSession.kind !== draft.article.kind || await draftTextHash(articleSession.text) !== draft.article.textHash) {
      draftShowOffer(draft);
      draftMessage('글 내용이 임시저장할 때와 달라 이어갈 수 없습니다. 원래 글을 다시 확인하거나 「삭제하고 새로 시작」을 누르세요.');
      return;
    }
    await draftApply(draft);
  } catch (error) {
    if (!draftOffer) draftShowOffer(draft);
    draftMessage(error?.message || '임시저장을 불러오지 못했습니다.');
  } finally { button.disabled = false; draftBusy = false; draftSchedule(); }
}

async function draftApply(draft) {
  const f = draft.fields;
  const set = id => { const el = draftEl(id); if (el && typeof f[id] === 'string') el.value = f[id]; };
  for (const id of ['prior', 'submission-article-title', 'submission-source-url']) set(id);
  for (const [id, value] of Object.entries(draft.checks)) { const el = draftEl(id); if (el) el.checked = value; }
  if (typeof f['reading-mode'] === 'string' && draftEl('reading-mode') && [...(draftEl('reading-mode').options || [])].some(o => o.value === f['reading-mode'])) {
    draftEl('reading-mode').value = f['reading-mode'];
    if (typeof guidedPrepare === 'function') guidedPrepare();
  }
  if (draft.step === 'preparation') { showStatus('임시저장한 읽기 준비 내용을 불러왔습니다. 준비되면 「읽기·구조화 시작」을 누르세요.'); return; }
  for (const id of ['structure', 'primary', 'support', 'relation', 'retell-input', 'reflection', 'new-words', 'interests']) set(id);
  if (typeof updateStructureLabels === 'function') updateStructureLabels();
  if (f.relation?.trim() && draftEl('relation-details')) draftEl('relation-details').open = true;
  if (pdfWorksheet && draft.pdf) {
    pdfWorksheet.restore(draft.pdf);
    draftEl('main-idea').value = pdfWorksheet.phase() === 'units' ? pdfWorksheet.getMain() : '';
    renderPdfNav(); sendPdfUnitStatus();
  } else set('main-idea');
  await enterReadingView({guidedDraft: draft.guided && SubmissionConfig.guidedReadingEnabled === true && articleSession?.kind !== 'pdf' ? draft.guided : null});
  if (pdfWorksheet?.phase() === 'structure') { applyPdfPhase(); updateStructureLabels(); }
  // 패널을 닫은 사이 원문 가림이 풀렸으므로 다시 말하기·정리 단계는 재확인 수행으로 기록한다.
  rechecked = draft.rechecked || draft.step !== 'reading';
  if (draft.step === 'reading') { showStatus('임시저장에서 이어서 합니다. 작성한 내용을 그대로 불러왔습니다.'); return; }
  if (draft.step === 'retell-view') {
    await enterRetell(null, {fromReview: true});
    if (!draftEl('retell-view').hidden) {
      draftEl('revisit-note').textContent = '패널을 닫은 사이 원문 가림이 풀렸습니다. 이어서 쓰는 다시 말하기는 재확인으로 기록됩니다.';
      showStatus('임시저장에서 이어서 합니다. 원문을 다시 가렸습니다.');
    } else showStatus('원문을 다시 가리지 못해 읽기·구조화 단계로 불러왔습니다. 「작성 확인 후 다시 말하기로」를 다시 누르세요.', true, draftEl('form-error'));
    return;
  }
  try { if (typeof guidedBeforeRetell === 'function') guidedBeforeRetell(); } catch { /* 초급 구조도가 미완성이면 읽기 단계에 남긴다 */ }
  if (!showReview()) { showStatus('정리 화면을 다시 만들지 못해 읽기·구조화 단계로 불러왔습니다.', true, draftEl('form-error')); return; }
  showStatus('임시저장에서 이어서 합니다. 답안을 확인하고 저장하세요. 패널을 닫은 사이 원문이 보였으므로 재확인으로 기록됩니다.');
}

draftEl('draft-resume-continue')?.addEventListener('click', () => { void draftResume(); });
draftEl('draft-resume-discard')?.addEventListener('click', () => {
  if (!confirm('임시저장한 훈련을 삭제할까요? 되돌릴 수 없습니다.')) return;
  draftDiscard(); showStatus('임시저장을 삭제했습니다. 새 글을 연결하세요.', false, draftEl('connect-status')); analyzeButton.focus();
});
for (const type of ['input', 'change']) document.addEventListener?.(type, event => { if (event.target?.closest?.('#records-section, #account-bar, #feedback-section')) return; draftSchedule(); }, true);
document.addEventListener?.('click', () => draftSchedule(), true);
for (const id of ['reading', 'retell-view', 'review-view']) { const el = draftEl(id); if (el && globalThis.MutationObserver) new MutationObserver(draftSchedule).observe(el, {attributes: true, attributeFilter: ['hidden']}); }
globalThis.addEventListener?.('pagehide', () => { if (draftTimer) void draftFlush(); });
document.addEventListener?.('visibilitychange', () => { if (document.hidden && draftTimer) void draftFlush(); });
(async () => {
  const draft = await draftStore.load();
  if (draft && !articleSession) draftShowOffer(draft);
})();
