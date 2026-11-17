'use strict';
// TASK-028 중급 A안: 관계 카드 여러 개 작성. 관계 1은 기존 #primary·#support·#relation 입력란이고,
// 관계 2~5는 #pair{k}-* 입력란이다. 저장 때 RelationPairs.pack으로 기존 문자열 3개로 합친다(서버 변경 없음).
const pairEl = id => document.getElementById(id);
const PAIR_EXTRA = [2, 3, 4, 5];
const pairIds = k => k === 1 ? {primary:'primary', support:'support', relation:'relation'} : {primary:`pair${k}-primary`, support:`pair${k}-support`, relation:`pair${k}-relation`};
const PAIR_FIELD_IDS = PAIR_EXTRA.flatMap(k => Object.values(pairIds(k)));

// 초급 구조도 모드(직접 작성 영역 숨김)에서는 관계 2~5를 쓰지 않는다.
function pairActive() { return !pairEl('manual-map')?.hidden; }
function pairCount() { if (!pairActive()) return 1; let n = 1; for (const k of PAIR_EXTRA) if (pairEl('pair' + k) && !pairEl('pair' + k).hidden) n = k; return n; }
function pairRead(k) { const ids = pairIds(k); return Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, pairEl(id)?.value ?? ''])); }
function pairWrite(k, card) { const ids = pairIds(k); for (const [key, id] of Object.entries(ids)) if (pairEl(id)) pairEl(id).value = card?.[key] ?? ''; }
function pairCards() { const cards = []; for (let k = 1; k <= pairCount(); k++) cards.push(pairRead(k)); return cards; }
// 저장·정리·PDF 직렬화에 쓰는 합친 값.
function pairPacked() { return RelationPairs.pack(pairCards()); }
function pairStatus(text) { const el = pairEl('pair-status'); if (el) el.textContent = text; }

function pairSync() {
  const n = pairCount(), type = pairEl('structure')?.value;
  const names = {claim:['주장', '근거'], cause:['원인', '결과'], problem:['문제', '해결책']}[type] || ['주장', '근거'];
  for (const k of PAIR_EXTRA) {
    const p = pairEl(`pair${k}-primary-label`), s = pairEl(`pair${k}-support-label`);
    if (p) p.textContent = '핵심 정보 · ' + names[0]; if (s) s.textContent = '보조 정보 · ' + names[1];
  }
  if (pairEl('pair1-title')) pairEl('pair1-title').hidden = n < 2;
  const add = pairEl('pair-add'); if (add) { add.disabled = n >= RelationPairs.MAX; add.textContent = n >= RelationPairs.MAX ? '관계는 최대 5개입니다' : '＋ 관계 추가'; }
}
function pairAdd() {
  const n = pairCount(); if (n >= RelationPairs.MAX) return;
  const k = n + 1; pairEl('pair' + k).hidden = false; pairSync();
  pairStatus(`관계 ${k}를 추가했습니다.`); pairEl(`pair${k}-primary`)?.focus?.();
  if (typeof draftSchedule === 'function') draftSchedule();
}
function pairRemove(k) {
  const n = pairCount(); if (k < 2 || k > n) return;
  for (let i = k; i < n; i++) pairWrite(i, pairRead(i + 1));
  pairWrite(n, null); pairClearErrors(); pairEl('pair' + n).hidden = true; pairSync();
  pairStatus(`관계 ${k}를 삭제했습니다.`);
  (k <= pairCount() ? pairEl(`pair${k}-primary`) : pairEl('pair-add'))?.focus?.();
  if (typeof draftSchedule === 'function') draftSchedule();
}
// 임시저장 복원 뒤: 값이 있는 마지막 카드까지 보인다.
function pairShowFilled() {
  let last = 1;
  for (const k of PAIR_EXTRA) if (Object.values(pairRead(k)).some(v => v.trim())) last = k;
  for (const k of PAIR_EXTRA) if (pairEl('pair' + k)) pairEl('pair' + k).hidden = k > last;
  pairSync();
}
function pairReset() { for (const k of PAIR_EXTRA) { pairWrite(k, null); if (pairEl('pair' + k)) pairEl('pair' + k).hidden = true; } pairClearErrors(); pairStatus(''); pairSync(); }
function pairClearErrors() {
  for (const k of PAIR_EXTRA) for (const f of ['primary', 'support']) {
    pairEl(`pair${k}-${f}`)?.removeAttribute?.('aria-invalid'); const e = pairEl(`pair${k}-${f}-error`); if (e) e.textContent = '';
  }
}
// 관계 2~5: 모두 비면 저장 때 빠지고, 하나라도 쓰면 양쪽 정보가 필요하다. 빠진 칸이 있으면 false.
function pairValidate() {
  pairClearErrors(); let ok = true;
  for (let k = 2; k <= pairCount(); k++) {
    const c = pairRead(k); if (!Object.values(c).some(v => v.trim())) continue;
    for (const f of ['primary', 'support']) if (!c[f].trim()) {
      ok = false; pairEl(`pair${k}-${f}`)?.setAttribute?.('aria-invalid', 'true');
      const e = pairEl(`pair${k}-${f}-error`); if (e) e.textContent = `관계 ${k}의 ${f === 'primary' ? '핵심' : '보조'} 정보를 작성하거나 관계를 삭제하세요.`;
    }
  }
  return ok;
}
// 정리 화면·내 기록: 카드가 2개 이상이면 관계별로 묶어 보여 준다.
function appendPairsView(container, values) {
  if (!container) return;
  const cards = RelationPairs.unpack(values); if (cards.length < 2) return;
  const list = document.createElement('ol'); list.className = 'pair-view'; list.setAttribute('aria-label', '관계별 구조도');
  cards.forEach((card, i) => {
    const item = document.createElement('li'), title = document.createElement('h4'); title.textContent = '관계 ' + (i + 1); item.append(title);
    for (const [key, label] of [['primary', '핵심 정보'], ['support', '보조 정보'], ['relation', '연결 이유']]) {
      if (key === 'relation' && !card.relation.trim()) continue;
      const p = document.createElement('p'), b = document.createElement('b'); b.textContent = label + ': '; const v = document.createElement('span'); v.textContent = card[key]; p.append(b, v); item.append(p);
    }
    list.append(item);
  });
  container.append(list);
}
pairEl('pair-add')?.addEventListener('click', pairAdd);
for (const k of PAIR_EXTRA) pairEl(`pair${k}-remove`)?.addEventListener('click', () => pairRemove(k));
pairEl('structure')?.addEventListener('change', pairSync);
pairSync();
