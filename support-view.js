'use strict';
function appendSupportView(container, support) {
  if(!container)return;const p=document.createElement('p');p.textContent=LearningSupport.label(support);container.append(p);
  if(!support?.graph)return;
  const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
  summary.textContent='최초 제출 구조도 (수정본과 별도)';
  const nodes=support.graph.nodes.slice().sort((a,b)=>a.order-b.order);
  const labels=Object.fromEntries(nodes.map((n,i)=>[n.id,i+1]));
  pre.textContent=nodes.map(n=>`${labels[n.id]}. [${n.role==='primary'?'첫 역할':'둘째 역할'} · ${n.source==='ai_candidate'?'AI 후보':'원문에서 직접 추가'}] ${n.text}`).join('\n')+'\n'+support.graph.edges.map(e=>`${labels[e.from]} → ${labels[e.to]} (${({supports:'뒷받침',causes:'원인 → 결과',addresses:'문제에 대응'})[e.relationType]})`).join('\n');
  details.append(summary,pre);
  // TASK-028: 첫 역할 문장 기준으로 연결된 문장을 묶어 관계쌍으로 보여 준다.
  if(typeof RelationPairs!=='undefined'){
    const grouped=RelationPairs.group(support.graph),list=document.createElement('ol');list.className='pair-view';list.setAttribute('aria-label','관계쌍으로 묶은 구조도');
    grouped.pairs.forEach((pair,i)=>{const item=document.createElement('li'),head=document.createElement('h4');head.textContent='관계 '+(i+1);item.append(head);
      const a=document.createElement('p');a.textContent=`${labels[pair.anchor.id]}. ${pair.anchor.text}`;item.append(a);
      for(const p of pair.partners){const b=document.createElement('p');b.textContent=`  ↳ ${labels[p.node.id]}. ${p.node.text}${p.repeat?' (같은 문장)':''}`;item.append(b);}
      list.append(item);});
    details.insertBefore(list,pre);
  }
  container.append(details);
}
