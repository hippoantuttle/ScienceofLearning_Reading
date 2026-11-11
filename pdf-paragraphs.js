'use strict';
// TASK-019: PDF.js 텍스트 항목 → 줄 → 문단. 화면·네트워크·저장과 무관한 순수 함수만 둔다.
// 자동 분할은 추정이며, 사용자가 뷰어의 추출 확인 단계에서 합치기·제외로 바로잡는다.
var PdfParagraphs = (() => {
  const TERMINAL = /[.!?。…:;"”’)\]]$/;
  const PAGE_NUMBER = /^(?:[-–—]\s*)?(?:page\s*)?\d{1,4}(?:\s*(?:\/|of)\s*\d{1,4})?(?:\s*[-–—])?$/i;

  function clean(text) { return String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim(); }
  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  // items: PDF.js getTextContent().items (str, transform[4]=x, transform[5]=y, width, height, hasEOL).
  function linesFromItems(items) {
    const lines = [];
    let current = null;
    const finish = () => {
      if (current) { current.text = clean(current.text); if (current.text) lines.push(current); }
      current = null;
    };
    for (const item of items || []) {
      if (!item || typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
      const x = Number(item.transform[4]), y = Number(item.transform[5]);
      const height = Number(item.height) || Math.hypot(Number(item.transform[2]) || 0, Number(item.transform[3]) || 0) || 0;
      const width = Number(item.width) || 0;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (!item.str.trim()) {
        if (current && item.str) current.text += ' ';
        if (item.hasEOL) finish();
        continue;
      }
      if (current && Math.abs(y - current.y) > Math.max(current.height, height, 1) * 0.5) finish();
      if (!current) current = {text: '', x, y, height, xEnd: x + width};
      else if (x - current.xEnd > Math.max(height, 1) * 0.15 && !/\s$/.test(current.text) && !/^\s/.test(item.str)) current.text += ' ';
      current.text += item.str;
      current.x = Math.min(current.x, x);
      current.xEnd = Math.max(current.xEnd, x + width);
      current.height = Math.max(current.height, height);
      if (item.hasEOL) finish();
    }
    finish();
    return lines;
  }

  // 여러 쪽의 맨 위·아래 두 줄에서 숫자만 다른 같은 문구가 반복되면 머리말·꼬리말로 본다.
  function stripRepeated(pages) {
    const edgeKey = line => clean(line.text).replace(/\d+/g, '#').toLowerCase();
    const counts = new Map();
    const edges = pages.map(page => {
      const lines = page.lines || [];
      const set = new Set([...lines.slice(0, 2), ...lines.slice(-2)]);
      for (const key of new Set([...set].map(edgeKey))) counts.set(key, (counts.get(key) || 0) + 1);
      return set;
    });
    return pages.map((page, index) => ({...page, lines: (page.lines || []).filter(line => {
      if (!edges[index].has(line)) return true;
      if (PAGE_NUMBER.test(clean(line.text))) return false;
      return !(pages.length >= 2 && counts.get(edgeKey(line)) >= 2);
    })}));
  }

  function joinLines(lines) {
    let text = '';
    for (const line of lines) {
      const next = clean(line.text);
      if (!text) { text = next; continue; }
      if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(next)) text = text.slice(0, -1) + next;
      else text += ' ' + next;
    }
    return text;
  }

  function splitPage(lines) {
    const gaps = [];
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y;
      if (gap > 0 && Math.abs(lines[i].x - lines[i - 1].x) < Math.max(lines[i].height, 1) * 8) gaps.push(gap);
    }
    const typical = median(gaps);
    const blocks = [];
    let block = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], prev = lines[i - 1];
      let breakHere = i === 0;
      if (prev) {
        const size = Math.max(line.height, prev.height, 1);
        const gap = prev.y - line.y;
        const sameColumn = gap > 0 && Math.abs(line.x - prev.x) < size * 8;
        const columnRight = Math.max(...lines.filter(other => Math.abs(other.x - prev.x) < size * 8).map(other => other.xEnd));
        const prevShort = prev.xEnd < columnRight - Math.max(size * 2, (columnRight - prev.x) * 0.12);
        const prevTerminal = TERMINAL.test(prev.text);
        if (Math.abs(line.height - prev.height) > Math.min(line.height, prev.height) * 0.2) breakHere = true; // 글자 크기 변화(제목 등)
        else if (sameColumn && Number.isFinite(typical) && gap > typical * 1.45) breakHere = true;
        else if (sameColumn && line.x - prev.x > size * 0.8 && line.x - prev.x < size * 6 && prevTerminal) breakHere = true;
        else if (prevShort && prevTerminal) breakHere = true;
        else if (!sameColumn && prevTerminal && prevShort) breakHere = true;
      }
      if (breakHere && block.length) { blocks.push(block); block = []; }
      block.push(line);
    }
    if (block.length) blocks.push(block);
    return blocks;
  }

  // 블록이 차지하는 PDF 좌표 사각형(아래가 0). 기준선 아래 글자 꼬리와 위쪽 높이를 대략 포함한다.
  function blockRect(pageNumber, lines) {
    return {
      page: pageNumber,
      x1: Math.min(...lines.map(line => line.x)),
      y1: Math.min(...lines.map(line => line.y - Math.max(line.height, 1) * 0.25)),
      x2: Math.max(...lines.map(line => line.xEnd)),
      y2: Math.max(...lines.map(line => line.y + Math.max(line.height, 1) * 0.85))
    };
  }

  // pages: [{pageNumber, lines}] (lines는 linesFromItems 결과). 반환: [{text, pages, rects, heading, included}]
  function paragraphsFromPages(pages) {
    const stripped = stripRepeated(pages || []);
    const paragraphs = [];
    for (const page of stripped) {
      const blocks = splitPage(page.lines || []);
      blocks.forEach((lines, blockIndex) => {
        const text = joinLines(lines);
        if (!text) return;
        const last = paragraphs[paragraphs.length - 1];
        // 쪽이 바뀌어도 문장이 끝나지 않았으면 앞 문단에 이어 붙인다.
        if (blockIndex === 0 && last && !last.heading && !TERMINAL.test(last.text) && last.pages[last.pages.length - 1] === page.pageNumber - 1) {
          last.text = joinLines([{text: last.text}, {text}]);
          last.pages.push(page.pageNumber);
          last.rects.push(blockRect(page.pageNumber, lines));
          return;
        }
        const heading = lines.length === 1 && Array.from(text).length <= 60 && !TERMINAL.test(text);
        paragraphs.push({text, pages: [page.pageNumber], rects: [blockRect(page.pageNumber, lines)], heading, included: !heading});
      });
    }
    return paragraphs;
  }

  function mergeWithNext(paragraphs, index) {
    if (!Number.isInteger(index) || index < 0 || index >= paragraphs.length - 1) return paragraphs.slice();
    const a = paragraphs[index], b = paragraphs[index + 1];
    const merged = {text: joinLines([{text: a.text}, {text: b.text}]), pages: [...new Set([...a.pages, ...b.pages])], rects: [...(a.rects || []), ...(b.rects || [])], heading: false, included: a.included || b.included};
    return [...paragraphs.slice(0, index), merged, ...paragraphs.slice(index + 2)];
  }

  function pageLabel(pages) {
    const first = pages[0], last = pages[pages.length - 1];
    return first === last ? `p.${first}` : `p.${first}–${last}`;
  }

  return {linesFromItems, stripRepeated, paragraphsFromPages, mergeWithNext, pageLabel, clean, joinLines};
})();
if (typeof module !== 'undefined') module.exports = PdfParagraphs;
