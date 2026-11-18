'use strict';
// TASK-027 C: 저장 전 훈련의 임시저장 형식과 저장소 어댑터.
// - chrome.storage.session에만 둔다(브라우저를 닫으면 사라짐). 서버로 보내지 않는다.
// - 글 본문은 SHA-256 해시로 비교한다. 웹 기사는 처음 불러온 본문과 탭 제목도 둔다(2026-11-18 결정: 새로고침으로 본문 일부가 바뀌어도
//   같은 글이면 처음 불러온 내용으로 이어가기 위함. 공개 기사 본문이며 학습자 응답·개인정보가 아니다). PDF 본문은 저장하지 않는다.
// - 계정은 식별자 원문 대신 해시로 묶는다. 로그인 토큰·AI 응답 원문은 저장하지 않는다.
var TrainingDraft = (() => {
  const KEY = 'readingTrainingDraft';
  const VERSION = 1;
  const STEPS = ['preparation', 'reading', 'retell-view', 'review-view'];
  const FIELDS = ['prior', 'reading-mode', 'main-idea', 'structure', 'primary', 'support', 'relation', 'retell-input', 'reflection', 'new-words', 'interests', 'submission-article-title', 'submission-source-url',
    // TASK-028: 중급 관계 카드 2~5
    ...[2, 3, 4, 5].flatMap(k => [`pair${k}-primary`, `pair${k}-support`, `pair${k}-relation`])];
  const CHECKS = ['submission-article-consent'];
  const MAX_BYTES = 1500000;
  const MAX_ARTICLE_TEXT = 1000000;
  const isText = (value, max = 20000) => typeof value === 'string' && value.length <= max;
  const hex = /^[0-9a-f]{64}$/;

  async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function ownerKey(owner) { return owner ? sha256('owner:' + owner) : null; }

  // 같은 글 판단(웹 기사, 2026-11-18): 같은 주소(호출부에서 확인) + 같은 제목 + 본문 유사도.
  // 새로고침 뒤 시각·조회수·광고 문구처럼 일부 줄만 바뀐 경우는 같은 글로 보고,
  // 페이월·배너·덜 그려진 페이지처럼 연결 때 본문 대부분이 없는 경우는 거른다.
  // 줄 비교는 줄별 해시 앞부분과 길이로 한다.
  const SIMILARITY_THRESHOLD = 0.75; // 2026-11-18 사용자 결정(85% → 75%)
  const MAX_LINES = 3000;
  function normalizeTitle(value) {
    return typeof value === 'string' ? value.replace(/^\s*\(\d+\+?\)\s*/, '').replace(/\s+/g, ' ').trim() : '';
  }
  async function lineFingerprint(text) {
    const lines = String(text || '').split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, MAX_LINES);
    return Promise.all(lines.map(async line => [(await sha256('line:' + line)).slice(0, 16), line.length]));
  }
  // 연결 때 본문 글자 수 가운데 새 본문에도 그대로 있는 줄의 비율(0~1).
  function overlap(oldPrint, newPrint) {
    const total = oldPrint.reduce((sum, [, length]) => sum + length, 0);
    if (!total) return 0;
    const available = new Map();
    for (const [hash] of newPrint) available.set(hash, (available.get(hash) || 0) + 1);
    let matched = 0;
    for (const [hash, length] of oldPrint) {
      const count = available.get(hash) || 0;
      if (count) { available.set(hash, count - 1); matched += length; }
    }
    return matched / total;
  }
  // before·after: {title, text}. 주소 비교는 호출부 책임.
  async function sameArticle(before, after) {
    if (!before || !after || normalizeTitle(before.title) !== normalizeTitle(after.title)) return false;
    if (typeof before.text !== 'string' || typeof after.text !== 'string') return false;
    const oldPrint = await lineFingerprint(before.text);
    if (!oldPrint.length) return false;
    return overlap(oldPrint, await lineFingerprint(after.text)) >= SIMILARITY_THRESHOLD;
  }

  function validate(draft) {
    if (!draft || typeof draft !== 'object' || draft.version !== VERSION) return null;
    if (!STEPS.includes(draft.step) || typeof draft.rechecked !== 'boolean' || !Number.isFinite(draft.savedAt)) return null;
    if (draft.owner !== null && !(typeof draft.owner === 'string' && hex.test(draft.owner))) return null;
    const a = draft.article;
    if (!a || !['web', 'pdf'].includes(a.kind) || !Number.isInteger(a.tabId) || !Number.isInteger(a.windowId) || !isText(a.url, 4096) || !hex.test(a.textHash || '')) return null;
    if (a.title !== undefined && !isText(a.title, 1000)) return null;
    if (a.text !== undefined && (a.kind !== 'web' || !isText(a.text, MAX_ARTICLE_TEXT))) return null;
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

  return {KEY, VERSION, STEPS, FIELDS, CHECKS, SIMILARITY_THRESHOLD, MAX_ARTICLE_TEXT, sha256, ownerKey, normalizeTitle, lineFingerprint, overlap, sameArticle, validate, createStore, describe};
})();
if (typeof module !== 'undefined') module.exports = TrainingDraft;
