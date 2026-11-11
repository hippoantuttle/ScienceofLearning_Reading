'use strict';
// 직접 만든 비민감 합성 PDF(Helvetica, 영문). 실제 자료를 쓰지 않고 문단 분할·머리말 제거·쪽 넘김을 검증한다.
// pages: [[{x, y, text, size?}], ...] (PDF 좌표, 아래가 0)
// korean: 내장하지 않은 표준 한글 CID 글꼴(Adobe-Korea1, UniKS-UCS2-H)로 패키지의 CMap 사용을 검증한다.
function makePdf(pages, {width = 612, height = 792, korean = false} = {}) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const catalog = add(null), pageTree = add(null);
  let font;
  if (korean) {
    const descriptor = add('<< /Type /FontDescriptor /FontName /HYSMyeongJo-Medium /Flags 6 /FontBBox [0 -148 1001 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 93 >>');
    const cid = add(`<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYSMyeongJo-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 1 >> /FontDescriptor ${descriptor} 0 R /DW 1000 >>`);
    font = add(`<< /Type /Font /Subtype /Type0 /BaseFont /HYSMyeongJo-Medium /Encoding /UniKS-UCS2-H /DescendantFonts [${cid} 0 R] >>`);
  } else font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const escape = text => String(text).replace(/[\\()]/g, match => '\\' + match);
  const encode = text => korean ? '<' + Array.from(String(text)).map(ch => ch.codePointAt(0).toString(16).padStart(4, '0')).join('') + '>' : `(${escape(text)})`;
  const kids = [];
  for (const lines of pages) {
    const stream = lines.map(line => `BT /F1 ${line.size || 11} Tf ${line.x} ${line.y} Td ${encode(line.text)} Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] = `<< /Type /Pages /Kids [${kids.map(id => id + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(out)); out += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// 두 쪽 합성 문서: 반복 머리말·쪽번호, 제목, 들여쓰기 문단, 하이픈 줄바꿈, 쪽을 넘는 문단.
function sampleDocument() {
  const header = n => [{x: 72, y: 760, text: 'Synthetic Reading Journal', size: 9}, {x: 300, y: 40, text: String(n), size: 9}];
  const body = (y, rows, indent) => rows.map((text, i) => ({x: 72 + (i === 0 && indent ? 18 : 0), y: y - i * 14, text}));
  const page1 = [
    ...header(1),
    {x: 72, y: 720, text: 'Gardens in the City', size: 16},
    ...body(690, ['City gardens change how neighbors meet each other on', 'ordinary days and give children a place to learn about', 'food and weather.'], true),
    ...body(630, ['Volunteers report that shared work builds trust, but the', 'effect depends on regular schedules and clear roles for', 'every partici-', 'pant in the group.'], true),
    ...body(560, ['Critics argue that land is scarce and that gardens', 'compete with housing, especially where rents rise and the'], true)
  ];
  const page2 = [
    ...header(2),
    ...body(720, ['public budget for parks is small.', 'Planners therefore combine gardens with new buildings.'], false),
    ...body(680, ['In conclusion, gardens are useful when communities plan', 'them together and protect the time needed to care for them.'], true)
  ];
  return makePdf([page1, page2]);
}
// 한글 두 문단(한 줄 너비는 글자 수 × 글꼴 크기로 계산된다).
function koreanDocument() {
  return makePdf([[
    {x: 72, y: 720, text: '도시 정원', size: 16},
    {x: 90, y: 690, text: '도시 정원은 이웃이 만나는 방식을 바꾸고 아이들에게', size: 11},
    {x: 72, y: 676, text: '먹거리를 배울 자리를 준다.', size: 11},
    {x: 90, y: 650, text: '그러나 땅이 부족한 곳에서는 주택과 경쟁한다.', size: 11}
  ]], {korean: true});
}
module.exports = {makePdf, sampleDocument, koreanDocument};
