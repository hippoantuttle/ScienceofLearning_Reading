'use strict';
// TASK-028: 관계 카드(주장–근거 쌍) 공통 규칙.
// - 중급: 카드 여러 개를 기존 primary·support·relation 문자열로 합치고 다시 나눈다(서버 형식 변경 없음).
//   카드가 1개이면 표시 없이 그대로 보낸다. 2개 이상이면 각 필드를 `[관계 n]` 줄로 구분한다.
//   학습자가 줄 첫머리에 `[관계 n]`을 직접 쓰면 경계가 깨지므로 전각 괄호 `［관계 n］`로 바꿔 저장한다.
// - 초급: 구조도(nodes·edges)를 첫 역할(주장·원인·문제) 기준으로 묶어 쌍 카드로 보여 준다. 저장 형식은 그대로다.
var RelationPairs = (() => {
  const MAX = 5, FIELDS = ['primary', 'support', 'relation'];
  const MARK = /^\[관계 ([1-9])\]$/;
  const escapeLine = line => line.replace(/^\[관계 ([0-9]+)\]/, '［관계 $1］');
  const escapeText = text => String(text ?? '').split('\n').map(escapeLine).join('\n');
  const blank = card => FIELDS.every(k => !String(card?.[k] ?? '').trim());

  // cards: [{primary, support, relation}] → {primary, support, relation}
  function pack(cards) {
    const used = (Array.isArray(cards) ? cards : []).slice(0, MAX).map(c => Object.fromEntries(FIELDS.map(k => [k, escapeText(c?.[k])])));
    const kept = used.filter((c, i) => i === 0 || !blank(c));
    if (kept.length <= 1) { const c = kept[0] || {primary:'', support:'', relation:''}; return {...c}; }
    const out = {};
    for (const k of FIELDS) {
      if (k === 'relation' && kept.every(c => !c.relation.trim())) { out[k] = ''; continue; }
      out[k] = kept.map((c, i) => `[관계 ${i + 1}]\n${c[k]}`).join('\n\n');
    }
    return out;
  }
  function split(text) {
    const lines = String(text ?? '').split('\n');
    if (!MARK.test(lines[0] || '')) return null;
    const parts = []; let current = null;
    for (const line of lines) {
      const m = line.match(MARK);
      if (m && Number(m[1]) === parts.length + 1) { current = []; parts.push(current); continue; }
      current.push(line);
    }
    return parts.map(p => { while (p.length && p[p.length - 1] === '') p.pop(); return p.join('\n'); });
  }
  // {primary, support, relation} → [{primary, support, relation}]. 형식이 맞지 않으면 카드 1개.
  function unpack(values) {
    const single = [{primary:String(values?.primary ?? ''), support:String(values?.support ?? ''), relation:String(values?.relation ?? '')}];
    const p = split(values?.primary), s = split(values?.support);
    if (!p || !s || p.length < 2 || p.length !== s.length) return single;
    const r = String(values?.relation ?? '').trim() ? split(values.relation) : null;
    if (String(values?.relation ?? '').trim() && (!r || r.length !== p.length)) return single;
    return p.map((primary, i) => ({primary, support:s[i], relation:r ? r[i] : ''}));
  }

  // 초급 구조도를 첫 역할 문장 기준 쌍 카드로 묶는다.
  // 반환: {pairs:[{anchor, partners:[{node, edge, repeat}]}], loose:[둘째 역할 중 연결 없는 문장], unplaced:[역할 없는 문장], odd:[역할이 맞지 않는 연결]}
  function group(graph) {
    const nodes = (graph?.nodes || []).slice().sort((a, b) => a.order - b.order), byId = new Map(nodes.map(n => [n.id, n]));
    const seen = new Set(), linked = new Set(), odd = [];
    const pairs = nodes.filter(n => n.role === 'primary').map(anchor => ({anchor, partners:[]}));
    const pairOf = new Map(pairs.map(p => [p.anchor.id, p]));
    for (const edge of graph?.edges || []) {
      const a = byId.get(edge.from), b = byId.get(edge.to);
      const anchor = a?.role === 'primary' && b?.role === 'support' ? a : b?.role === 'primary' && a?.role === 'support' ? b : null;
      if (!anchor) { odd.push(edge); continue; }
      const partner = anchor === a ? b : a;
      pairOf.get(anchor.id).partners.push({node:partner, edge, repeat:seen.has(partner.id)});
      seen.add(partner.id); linked.add(partner.id);
    }
    for (const pair of pairs) pair.partners.sort((x, y) => x.node.order - y.node.order);
    // 정렬 뒤 반복 표시를 다시 매긴다(위 카드에 먼저 나온 문장만 원본).
    const shown = new Set();
    for (const pair of pairs) for (const p of pair.partners) { p.repeat = shown.has(p.node.id); shown.add(p.node.id); }
    return {pairs, loose:nodes.filter(n => n.role === 'support' && !linked.has(n.id)), unplaced:nodes.filter(n => !n.role), odd};
  }
  return {MAX, FIELDS, pack, unpack, group, escapeText};
})();
if (typeof module !== 'undefined') module.exports = RelationPairs;
