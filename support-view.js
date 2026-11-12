'use strict';
function appendSupportView(container, support) {
  if(!container)return;const p=document.createElement('p');p.textContent=LearningSupport.label(support);container.append(p);
  if(!support?.graph)return;
  const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
  summary.textContent='최초 제출 구조도 (수정본과 별도)';
  const nodes=support.graph.nodes.slice().sort((a,b)=>a.order-b.order);
  const labels=Object.fromEntries(nodes.map((n,i)=>[n.id,i+1]));
  pre.textContent=nodes.map(n=>`${labels[n.id]}. [${n.role==='primary'?'첫 역할':'둘째 역할'} · ${n.source==='ai_candidate'?'AI 후보':'원문에서 직접 추가'}] ${n.text}`).join('\n')+'\n'+support.graph.edges.map(e=>`${labels[e.from]} → ${labels[e.to]} (${({supports:'뒷받침',causes:'원인 → 결과',addresses:'문제에 대응'})[e.relationType]})`).join('\n');
  details.append(summary,pre);container.append(details);
}
