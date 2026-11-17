'use strict';
// TASK-026 후속: AI 결과(읽기 전 추천·제출 후 피드백)를 구조 그대로 화면 요소로 그린다.
// 마크다운을 해석하지 않고 모든 문자열은 textContent로만 넣는다. 강조 위치는
// 고정된 자리(소제목·용어 이름·항목명)뿐이며 AI가 강조를 정하지 않는다.
const AIResultView = (() => {
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  const kinds = {
    text: s => node('p', 'ai-view-text', s.text),
    list: s => { const ul = node('ul', 'ai-view-list'); for (const item of s.items) ul.append(node('li', '', item)); return ul; },
    // terms: 이름 굵게 + 뜻 보조. pairs: 항목명 | 이유 두 열.
    terms: s => { const dl = node('dl', 'ai-view-terms'); for (const [k, v] of s.items) dl.append(node('dt', '', k), node('dd', '', v)); return dl; },
    pairs: s => { const dl = node('dl', 'ai-view-pairs'); for (const [k, v] of s.items) dl.append(node('dt', '', k), node('dd', '', v)); return dl; },
    // quotes: 학습자 자신의 문장(왼쪽 선) + 설명. 고쳐 쓴 예시가 아님.
    quotes: s => { const ol = node('ol', 'ai-view-quotes'); for (const [q, note] of s.items) { const li = node('li'); li.append(node('blockquote', 'ai-view-quote', q), node('p', 'ai-view-note', note)); ol.append(li); } return ol; },
    badge: s => { const p = node('p', 'ai-view-text'), badge = node('span', 'badge', s.text); badge.setAttribute('data-tone', 'accent'); p.append(badge); if (s.note) p.append(node('span', 'ai-view-aside', ' ' + s.note)); return p; },
  };
  function render(target, {caption, sections, level = 4}) {
    target.textContent = '';
    target.classList?.add('ai-view');
    if (caption) target.append(node('p', 'ai-view-caption', caption));
    for (const section of sections) {
      const block = node('section', 'ai-view-section');
      block.append(node('h' + level, 'ai-view-heading', section.title), kinds[section.kind](section));
      target.append(block);
    }
  }
  return {render};
})();
