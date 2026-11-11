'use strict';
// TASK-019 v3: 원본 위 블록을 클릭해 읽기 단위를 지정한다. 단위는 서로 겹치지 않는 연속 블록 범위 [start, end]다.
// 클릭: 블록 하나를 단위로 추가하거나, 이미 속한 단위를 해제한다. Shift+클릭: 기준 블록부터 해당 블록까지 한 단위로 묶는다.
var PdfUnits = (() => {
  function create(blocks) {
    const total = Array.isArray(blocks) ? blocks.length : 0;
    let units = [], anchor = null;
    const valid = index => Number.isInteger(index) && index >= 0 && index < total;
    const sort = () => units.sort((a, b) => a[0] - b[0]);
    const unitOf = index => units.findIndex(([start, end]) => index >= start && index <= end);
    return {
      // 기본값: 제목처럼 보이지 않는 블록을 하나씩 단위로 지정한다.
      autoSelect() { units = blocks.map((block, index) => block.heading ? null : [index, index]).filter(Boolean); anchor = null; return this.list(); },
      clear() { units = []; anchor = null; return this.list(); },
      click(index, {extend = false} = {}) {
        if (!valid(index)) throw new Error('블록 번호 오류');
        if (extend && anchor !== null && anchor !== index) {
          const start = Math.min(anchor, index), end = Math.max(anchor, index);
          units = units.filter(([a, b]) => b < start || a > end);
          units.push([start, end]); sort();
          return this.list();
        }
        const at = unitOf(index);
        if (at >= 0) { units.splice(at, 1); anchor = null; }
        else { units.push([index, index]); sort(); anchor = index; }
        return this.list();
      },
      unitOf,
      anchor: () => anchor,
      list: () => units.map(([start, end]) => [start, end]),
      count: () => units.length,
      // 패널에 넘길 단위: 블록 텍스트를 이어 붙이고 쪽·사각형을 합친다.
      materialize(join = texts => texts.join(' ')) {
        return units.map(([start, end]) => {
          const parts = blocks.slice(start, end + 1);
          return {text: join(parts.map(part => part.text)), pages: [...new Set(parts.flatMap(part => part.pages))], rects: parts.flatMap(part => part.rects || []), blocks: [start, end]};
        });
      }
    };
  }
  return {create};
})();
if (typeof module !== 'undefined') module.exports = PdfUnits;
