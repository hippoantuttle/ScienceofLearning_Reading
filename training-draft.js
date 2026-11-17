'use strict';
// TASK-027 C: 저장 전 훈련의 임시저장 형식과 저장소 어댑터.
// - chrome.storage.session에만 둔다(브라우저를 닫으면 사라짐). 서버로 보내지 않는다.
// - 글 본문은 저장하지 않고 SHA-256 해시만 둔다. 이어갈 때 같은 탭에서 본문을 다시 읽어 해시를 비교한다.
// - 계정은 식별자 원문 대신 해시로 묶는다. 로그인 토큰·AI 응답 원문은 저장하지 않는다.
var TrainingDraft = (() => {
  const KEY = 'readingTrainingDraft';
  const VERSION = 1;
  const STEPS = ['preparation', 'reading', 'retell-view', 'review-view'];
  const FIELDS = ['prior', 'reading-mode', 'main-idea', 'structure', 'primary', 'support', 'relation', 'retell-input', 'reflection', 'new-words', 'interests', 'submission-article-title', 'submission-source-url'];
  const CHECKS = ['submission-article-consent'];
  const MAX_BYTES = 400000;
  const isText = (value, max = 20000) => typeof value === 'string' && value.length <= max;
  const hex = /^[0-9a-f]{64}$/;

  async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function ownerKey(owner) { return owner ? sha256('owner:' + owner) : null; }

  function validate(draft) {
    if (!draft || typeof draft !== 'object' || draft.version !== VERSION) return null;
    if (!STEPS.includes(draft.step) || typeof draft.rechecked !== 'boolean' || !Number.isFinite(draft.savedAt)) return null;
    if (draft.owner !== null && !(typeof draft.owner === 'string' && hex.test(draft.owner))) return null;
    const a = draft.article;
    if (!a || !['web', 'pdf'].includes(a.kind) || !Number.isInteger(a.tabId) || !Number.isInteger(a.windowId) || !isText(a.url, 4096) || !hex.test(a.textHash || '')) return null;
    if (!draft.fields || typeof draft.fields !== 'object' || Object.keys(draft.fields).some(k => !FIELDS.includes(k) || !isText(draft.fields[k]))) return null;
    if (!draft.checks || typeof draft.checks !== 'object' || Object.keys(draft.checks).some(k => !CHECKS.includes(k) || typeof draft.checks[k] !== 'boolean')) return null;
    if (draft.pdf !== null && (a.kind !== 'pdf' || !Array.isArray(draft.pdf?.mains) || draft.pdf.mains.some(m => !isText(m)))) return null;
    if (draft.guided !== null && (typeof draft.guided !== 'object' || !['guided', 'independent'].includes(draft.guided.mode))) return null;
    try { if (JSON.stringify(draft).length > MAX_BYTES) return null; } catch { return null; }
    return draft;
  }

  function createStore(area) {
    return {
      async load() {
        if (!area) return null;
        try { const got = await area.get(KEY); return validate(got?.[KEY]) ; } catch { return null; }
      },
      async save(draft) {
        if (!area || !validate(draft)) return false;
        try { await area.set({[KEY]: draft}); return true; } catch { return false; }
      },
      async clear() {
        if (!area) return;
        try { await area.remove(KEY); } catch { /* 저장소를 쓸 수 없으면 지울 것도 없다 */ }
      }
    };
  }

  // 화면에 보일 짧은 설명(단계·시각). 답안 내용은 넣지 않는다.
  function describe(draft, now = Date.now()) {
    const names = {preparation: '읽기 준비', reading: '읽기·구조화', 'retell-view': '다시 말하기', 'review-view': '정리·저장'};
    const minutes = Math.max(0, Math.round((now - draft.savedAt) / 60000));
    const when = minutes < 1 ? '방금' : minutes < 60 ? `${minutes}분 전` : `${Math.round(minutes / 60)}시간 전`;
    return `${names[draft.step]} 단계 · ${when} 임시저장`;
  }

  return {KEY, VERSION, STEPS, FIELDS, CHECKS, sha256, ownerKey, validate, createStore, describe};
})();
if (typeof module !== 'undefined') module.exports = TrainingDraft;
