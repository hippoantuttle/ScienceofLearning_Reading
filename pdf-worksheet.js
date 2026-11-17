'use strict';
// TASK-019 v3: 단위마다 중심 생각만 작성하고, 모든 단위를 마친 뒤 문서 전체 구조도와 Retell을 한 번 작성한다.
// 서버·DB 계약은 바꾸지 않는다. 단위별 중심 생각은 mainIdea에 [단위 n · p.x] 표기로 묶고,
// 구조도(structureType·primary·support·relation)는 문서 전체 값 하나를 그대로 쓴다. 패널 메모리에만 둔다.
var PdfWorksheet = (() => {
  const TYPES = {claim: '주장–근거', cause: '원인–결과', problem: '문제–해결'};
  const LIMIT = 10000;
  const NAMES = {mainIdea: '단위별 중심 생각', primary: '핵심 정보', support: '보조 정보', relation: '왜 이렇게 연결했나요? (선택)'};

  function pageLabel(pages) {
    const first = pages[0], last = pages[pages.length - 1];
    return first === last ? `p.${first}` : `p.${first}–${last}`;
  }

  function create(units) {
    if (!Array.isArray(units) || !units.length) throw new Error('작성할 단위가 없습니다.');
    const items = units.map((unit, index) => ({number: index + 1, pages: Array.isArray(unit.pages) ? unit.pages.slice() : [], main: ''}));
    let index = 0, phase = 'units';
    const label = item => `단위 ${item.number}` + (item.pages.length ? ` · ${pageLabel(item.pages)}` : '');
    const done = item => !!item.main.trim();
    const sheet = {
      count: () => items.length,
      index: () => index,
      phase: () => phase,
      go(next) { if (!Number.isInteger(next) || next < 0 || next >= items.length) throw new Error('단위 번호 오류'); index = next; return index; },
      getMain: (at = index) => items[at].main,
      setMain(value, at = index) { if (typeof value === 'string') items[at].main = value; },
      label: (at = index) => label(items[at]),
      isComplete: (at = index) => done(items[at]),
      completed: () => items.map(done),
      completedCount: () => items.filter(done).length,
      firstIncomplete() { const at = items.findIndex(item => !done(item)); return at < 0 ? null : at; },
      // 모든 단위의 중심 생각을 써야 문서 구조도 단계로 넘어간다.
      toStructure() { if (sheet.firstIncomplete() !== null) throw new Error('모든 단위의 중심 생각을 작성하세요.'); sheet.mainIdea(); phase = 'structure'; },
      toUnits() { phase = 'units'; },
      // TASK-027 C: 패널 임시저장용. 단위 수가 같을 때만 되살린다.
      snapshot: () => ({mains: items.map(item => item.main), index, phase}),
      restore(saved) {
        if (!saved || !Array.isArray(saved.mains) || saved.mains.length !== items.length || saved.mains.some(m => typeof m !== 'string')) throw new Error('저장된 PDF 단위가 지금 뷰어와 다릅니다.');
        saved.mains.forEach((main, at) => { items[at].main = main; });
        index = Number.isInteger(saved.index) && saved.index >= 0 && saved.index < items.length ? saved.index : 0;
        phase = 'units';
        if (saved.phase === 'structure' && sheet.firstIncomplete() === null) { try { sheet.toStructure(); } catch { phase = 'units'; } }
        return sheet.snapshot();
      },
      mainIdea() {
        const value = items.map(item => `[${label(item)}] ${item.main.trim()}`).join('\n\n');
        if (Array.from(value).length > LIMIT) throw new Error(`${NAMES.mainIdea} 합계가 ${LIMIT.toLocaleString('ko-KR')}자를 넘습니다. 단위를 줄이거나 내용을 줄이세요.`);
        return value;
      },
      // structure: {structure, primary, support, relation} (문서 전체 구조도)
      serialize(structure) {
        if (phase !== 'structure') throw new Error('문서 구조도 단계가 아닙니다.');
        const values = {structureType: TYPES[structure?.structure] ? structure.structure : 'claim', mainIdea: sheet.mainIdea(), primary: String(structure?.primary ?? ''), support: String(structure?.support ?? ''), relation: String(structure?.relation ?? '')};
        const over = ['primary', 'support', 'relation'].filter(key => Array.from(values[key]).length > LIMIT);
        if (over.length) throw new Error(`${over.map(key => NAMES[key]).join('·')}이(가) ${LIMIT.toLocaleString('ko-KR')}자를 넘습니다.`);
        return values;
      }
    };
    return sheet;
  }
  return {create, TYPES, LIMIT, pageLabel};
})();
if (typeof module !== 'undefined') module.exports = PdfWorksheet;
