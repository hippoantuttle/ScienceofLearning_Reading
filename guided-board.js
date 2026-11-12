'use strict';
var GuidedBoard = (() => {
  const contract = typeof module !== 'undefined' ? require('./reading-support-contract.js') : ReadingSupportContract;
  const types = {
    claim:{primary:'주장',support:'근거',relation:'뒷받침',direction:'근거 → 주장'},
    cause:{primary:'원인',support:'결과',relation:'이어짐',direction:'원인 → 결과'},
    problem:{primary:'문제',support:'해결책',relation:'대응함',direction:'해결책 → 문제'}
  };
  const sides = ['top','right','bottom','left'];
  const sideNames = {top:'위쪽',right:'오른쪽',bottom:'아래쪽',left:'왼쪽'};
  const edgeKey = edge => edge.from + '>' + edge.to;
  function create({root,links,tools,deleteButton,eventRoot,read,act,message,document:doc=globalThis.document}) {
    let active=true,disposed=false,pending=null,selectedEdge=null,gesture=null,frame=null,suppressClickUntil=0,suppressedPort=null,lastType=null;
    let ports=new Map(),blocks=new Map(),focusTargets=new Map();
    const attachments=new Map(),cleanups=[],ns='http://www.w3.org/2000/svg';
    const win=doc.defaultView || globalThis;
    const raf=win.requestAnimationFrame?.bind(win) || (fn=>setTimeout(fn,0));
    const caf=win.cancelAnimationFrame?.bind(win) || clearTimeout;
    function listen(target,type,fn) { target.addEventListener(type,fn); cleanups.push(()=>target.removeEventListener?.(type,fn)); }
    function el(tag,text) { const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node; }
    function svgEl(tag) { return doc.createElementNS(ns,tag); }
    function button(text,fn,key) {
      const node=el('button',text);node.type='button';node.addEventListener('click',fn);
      if(key){node.setAttribute('data-board-focus',key);focusTargets.set(key,node);}
      return node;
    }
    const svg=svgEl('svg');svg.setAttribute('class','guided-wires');svg.setAttribute('role','img');
    svg.setAttribute('aria-label','직접 연결한 문장');root.append(svg);
    const zones=new Map();
    for(const role of ['primary','support','unplaced']) {
      const zone=el('section');zone.className='guided-zone';zone.setAttribute('data-board-role',role);
      const heading=el('h4'),place=button('선택한 문장 놓기',()=>placeSelected(role),'place:'+role),list=el('ol');
      const head=el('div');head.className='guided-zone-heading';head.append(heading);
      if(role!=='unplaced')head.append(place);
      list.className='guided-block-list';zone.append(head,list);root.append(zone);
      zones.set(role,{zone,heading,place,list});
      if(role!=='unplaced') {
        listen(zone,'dragover',event=>{if(active){event.preventDefault();}});
        listen(zone,'drop',event=>drop(event,role,null));
      }
    }
    function state() { return !disposed ? read() : null; }
    function graph() { return state()?.graph; }
    function usable() { return active&&!disposed&&!!graph(); }
    function focus(key) {
      const target=focusTargets.get(key);
      if(target&&!target.disabled)target.focus();
      else if(key?.startsWith('up:')||key?.startsWith('down:'))focusTargets.get('port:'+key.split(':')[1]+':top')?.focus();
    }
    function perform(action,key) {
      if(!usable()||act(action)===false)return false;
      render(key);return true;
    }
    function placeSelected(role) {
      const selected=state()?.selectedSentence;
      if(!selected)return;
      perform({type:'place',sentenceId:selected,role},'place:'+role);
    }
    function drop(event,role,beforeId) {
      event.preventDefault();event.stopPropagation();
      if(!usable())return;
      const value=event.dataTransfer?.getData('text/plain') || '';
      const sentence=value.match(/^reading-sentence:(s\d{4})$/),node=value.match(/^reading-node:(n\d{1,4})$/);
      if(!sentence&&!node)return;
      perform({type:'place',...(sentence?{sentenceId:sentence[1]}:{nodeId:node[1]}),role,beforeId});
    }
    function stopGesture() {
      const old=gesture;gesture=null;
      if(old?.capture?.hasPointerCapture?.(old.pointerId))old.capture.releasePointerCapture(old.pointerId);
      for(const port of ports.values())port.removeAttribute('data-target');
    }
    function cancel() {
      pending=null;selectedEdge=null;stopGesture();
      if(active&&!disposed){message('연결 그리기와 선택을 취소했습니다.');render();}
    }
    function validEdge(edge,g) {
      const rule=contract.relations[g.structureType],from=g.nodes.find(n=>n.id===edge.from),to=g.nodes.find(n=>n.id===edge.to);
      return !!rule&&from?.role===rule.from&&to?.role===rule.to&&edge.relationType===rule.type;
    }
    function selectEdge(edge) {
      if(!usable())return;
      stopGesture();pending=null;selectedEdge=edgeKey(edge);
      message('선택한 선은 삭제 버튼이나 Delete 키로 지울 수 있습니다.');render('delete');
    }
    function deleteEdge() {
      if(!usable()||pending||gesture)return;
      const edge=graph().edges.find(e=>edgeKey(e)===selectedEdge);if(!edge)return;
      if(act({type:'disconnect',from:edge.from,to:edge.to})===false)return;
      attachments.delete(selectedEdge);selectedEdge=null;pending=null;
      message('연결선을 삭제했습니다. 문장 블록과 배치는 유지됩니다.');render('place:primary');
    }
    function join(first,second) {
      if(!usable())return;
      const g=graph(),a=g.nodes.find(n=>n.id===first.id),b=g.nodes.find(n=>n.id===second.id),rule=contract.relations[g.structureType];
      if(!a||!b||a.id===b.id||!a.role||!b.role||a.role===b.role) {
        message('서로 다른 역할의 문장 블록을 연결하세요.');return;
      }
      const from=a.role===rule.from?first:second,to=a.role===rule.to?first:second;
      if(act({type:'connect',from:from.id,to:to.id,relationType:rule.type})===false)return;
      const key=edgeKey({from:from.id,to:to.id});
      attachments.set(key,{fromSide:from.side,toSide:to.side});pending=null;selectedEdge=key;
      message(types[g.structureType].direction+'으로 연결했습니다. 선을 선택해 삭제할 수 있습니다.');render('delete');
    }
    function choosePort(port) {
      if(!usable()||(Date.now()<suppressClickUntil&&suppressedPort?.id===port.id&&suppressedPort.side===port.side))return;
      if(!pending) {
        if(act({type:'touch'})===false)return;
        pending=port;selectedEdge=null;message('다른 블록의 연결점을 누르세요. Esc로 취소할 수 있습니다.');render('port:'+port.id+':'+port.side);
      } else if(pending.id===port.id&&pending.side===port.side) {
        pending=null;message('연결점 선택을 취소했습니다.');render('port:'+port.id+':'+port.side);
      } else join(pending,port);
    }
    function nearest(x,y,start) {
      const g=graph(),from=g?.nodes.find(n=>n.id===start.id);let best=null,distance=26;
      if(!from?.role)return null;
      for(const [key,port] of ports) {
        const [id,side]=key.split(':'),node=g.nodes.find(n=>n.id===id);
        if(id===start.id||!node?.role||node.role===from.role)continue;
        const r=port.getBoundingClientRect(),d=Math.hypot(x-r.left-r.width/2,y-r.top-r.height/2);
        if(d<distance){best={id,side};distance=d;}
      }
      return best;
    }
    function makePort(node,side) {
      const point={id:node.id,side},key=node.id+':'+side;
      const port=button('+',()=>choosePort(point),'port:'+key);
      port.className='guided-port';port.setAttribute('data-side',side);port.setAttribute('data-port-node',node.id);
      const attached=graph().edges.some(edge=>{
        const p=attachments.get(edgeKey(edge)) || {fromSide:'top',toSide:'bottom'};
        return (edge.from===node.id&&p.fromSide===side)||(edge.to===node.id&&p.toSide===side);
      });
      const chosen=pending?.id===node.id&&pending.side===side;
      port.setAttribute('aria-label',node.text+' '+sideNames[side]+' 연결점');port.setAttribute('aria-pressed',String(chosen));
      port.setAttribute('data-active',String(attached||chosen));port.textContent=attached||chosen?'•':'+';
      ports.set(key,port);
      port.addEventListener('dragstart',event=>{event.preventDefault();event.stopPropagation();});
      port.addEventListener('pointerdown',event=>{
        if(!usable()||event.button!==0)return;event.stopPropagation();port.focus();
        gesture={start:point,capture:port,pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,target:null};
        port.setPointerCapture(event.pointerId);
      });
      port.addEventListener('pointermove',event=>{
        if(!gesture||gesture.capture!==port||gesture.pointerId!==event.pointerId||!usable())return;
        gesture.x=event.clientX;gesture.y=event.clientY;
        if(!gesture.moved&&Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY)>5) {
          if(act({type:'touch'})===false){stopGesture();return;}
          gesture.moved=true;pending=null;selectedEdge=null;
        }
        if(!gesture.moved)return;
        gesture.target=nearest(gesture.x,gesture.y,gesture.start);
        for(const [p,element] of ports)element.setAttribute('data-target',String(p===gesture.target?.id+':'+gesture.target?.side));
        schedule();
      });
      port.addEventListener('pointerup',event=>{
        if(!gesture||gesture.capture!==port||gesture.pointerId!==event.pointerId)return;
        const finished=gesture,target=finished.moved?nearest(event.clientX,event.clientY,finished.start):null;
        stopGesture();
        if(finished.moved) {
          suppressClickUntil=Date.now()+350;suppressedPort=finished.start;
          if(target)join(finished.start,target);else {message('다른 역할 블록의 연결점에 놓으면 연결됩니다.');render('port:'+key);}
        } else schedule();
      });
      port.addEventListener('pointercancel',()=>{stopGesture();schedule();});
      port.addEventListener('lostpointercapture',()=>{if(gesture?.capture===port){stopGesture();schedule();}});
      return port;
    }
    function shift(node,delta) {
      const g=graph(),peers=g.nodes.filter(n=>n.role===node.role),index=peers.findIndex(n=>n.id===node.id),other=peers[index+delta];
      if(!other)return;
      const ids=g.nodes.map(n=>n.id),at=ids.indexOf(node.id),to=ids.indexOf(other.id);[ids[at],ids[to]]=[ids[to],ids[at]];
      perform({type:'reorder',nodeIds:ids},(delta<0?'up:':'down:')+node.id);
    }
    function render(nextFocus) {
      if(disposed)return;
      stopGesture();
      if(!active){svg.textContent='';return;}
      const current=state(),g=current?.graph;if(!g)return;
      if(lastType!==null&&lastType!==g.structureType){pending=null;selectedEdge=null;}
      lastType=g.structureType;
      const names=types[g.structureType] || types.claim;
      const previous=nextFocus || doc.activeElement?.getAttribute?.('data-board-focus');
      ports=new Map();blocks=new Map();focusTargets=new Map([['delete',deleteButton]]);
      if(!g.edges.some(e=>edgeKey(e)===selectedEdge))selectedEdge=null;
      if(pending&&!g.nodes.some(n=>n.id===pending.id&&n.role))pending=null;
      for(const key of attachments.keys())if(!g.edges.some(e=>edgeKey(e)===key))attachments.delete(key);
      const sorted=g.nodes.slice().sort((a,b)=>a.order-b.order),indices=new Map(sorted.map((n,i)=>[n.id,i+1]));
      for(const [role,zone] of zones) {
        zone.heading.textContent=role==='unplaced'?'배치할 문장':names[role];
        zone.zone.setAttribute('aria-label',zone.heading.textContent+' 문장 영역');
        zone.place.textContent=names[role]+'에 놓기';zone.place.disabled=!current.selectedSentence;
        if(role!=='unplaced')focusTargets.set('place:'+role,zone.place);
        zone.list.textContent='';const items=sorted.filter(n=>(n.role||'unplaced')===role);
        zone.zone.hidden=role==='unplaced'&&!items.length;
        if(!items.length&&role!=='unplaced'){const empty=el('li','선택한 문장을 놓거나 끌어오세요.');empty.className='guided-empty';zone.list.append(empty);}
        items.forEach((node,index)=>{
          const card=el('li');card.className='guided-block';card.setAttribute('data-node',node.id);card.draggable=false;
          card.setAttribute('data-role',role);blocks.set(node.id,card);
          const origin=el('p','문장 '+indices.get(node.id)+' · '+(node.source==='ai_candidate'?'AI 후보에서 선택':'원문에서 직접 추가'));origin.className='guided-block-origin';
          const text=el('p',node.text),actions=el('div');actions.className='guided-block-actions';card.append(origin,text,actions);
          const handle=button('↕ 이동',()=>message('이동 손잡이를 끌거나 위로·아래로 버튼을 사용하세요.'),'drag:'+node.id);
          handle.className='guided-drag-handle';handle.draggable=true;handle.setAttribute('aria-label','문장 '+indices.get(node.id)+' 블록 이동 손잡이');
          handle.addEventListener('dragstart',event=>{if(act({type:'touch'})===false){event.preventDefault();return;}event.dataTransfer.setData('text/plain','reading-node:'+node.id);});actions.append(handle);
          if(role!=='unplaced') {
            const up=button('위로',()=>shift(node,-1),'up:'+node.id),down=button('아래로',()=>shift(node,1),'down:'+node.id);
            up.disabled=index===0;down.disabled=index===items.length-1;actions.append(up,down);
            const other=role==='primary'?'support':'primary';
            actions.append(button(names[other]+' 자리로 이동',()=>perform({type:'place',nodeId:node.id,role:other}),'role:'+node.id));
            for(const side of sides)card.append(makePort(node,side));
          } else for(const other of ['primary','support'])actions.append(button(names[other]+'에 놓기',()=>perform({type:'place',nodeId:node.id,role:other})));
          actions.append(button('빼기',()=>perform({type:'exclude',nodeId:node.id},'place:primary'),'remove:'+node.id));
          if(role!=='unplaced'){card.addEventListener('dragover',event=>event.preventDefault());card.addEventListener('drop',event=>drop(event,role,node.id));}
          zone.list.append(card);
        });
      }
      links.textContent='';
      for(const [index,edge] of g.edges.entries()) {
        const item=el('li'),valid=validEdge(edge,g),a=indices.get(edge.from),b=indices.get(edge.to);
        const relation={supports:'뒷받침',causes:'원인 → 결과',addresses:'문제에 대응'}[edge.relationType] || '관계 확인';
        const pick=button('연결 '+(index+1)+': 문장 '+a+' → 문장 '+b+' · '+relation+(valid?'':' · 역할/유형 확인 필요'),()=>selectEdge(edge),'edge:'+edgeKey(edge));
        pick.setAttribute('aria-pressed',String(selectedEdge===edgeKey(edge)));item.append(pick);links.append(item);
      }
      tools.hidden=!selectedEdge;deleteButton.disabled=!selectedEdge;
      root.hidden=false;links.hidden=false;focus(previous);schedule();
    }
    function schedule() { if(frame===null&&!disposed)frame=raf(()=>{frame=null;paint();}); }
    function paint() {
      svg.textContent='';
      if(!usable()||typeof root.getBoundingClientRect!=='function')return;
      const rect=root.getBoundingClientRect();if(!rect.width||!rect.height)return;
      svg.setAttribute('viewBox','0 0 '+rect.width+' '+rect.height);
      const defs=svgEl('defs'),marker=svgEl('marker'),arrow=svgEl('path');
      marker.setAttribute('id','guided-board-arrow');marker.setAttribute('markerWidth','6');marker.setAttribute('markerHeight','6');marker.setAttribute('refX','5');marker.setAttribute('refY','3');marker.setAttribute('orient','auto');
      arrow.setAttribute('d','M0,0 L6,3 L0,6 Z');arrow.setAttribute('fill','context-stroke');marker.append(arrow);defs.append(marker);svg.append(defs);
      const vectors={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]};
      const point=port=>{const element=ports.get(port.id+':'+port.side);if(!element)return null;const r=element.getBoundingClientRect();return {x:r.left+r.width/2-rect.left,y:r.top+r.height/2-rect.top};};
      function curve(a,b,fromSide,toSide,edge) {
        const v=vectors[fromSide],w=vectors[toSide] || [0,0],start={x:a.x+v[0]*8,y:a.y+v[1]*8},end={x:b.x+w[0]*8,y:b.y+w[1]*8};
        const path=svgEl('path');path.setAttribute('d','M'+start.x+','+start.y+' C'+(start.x+v[0]*18)+','+(start.y+v[1]*18)+' '+(end.x+w[0]*18)+','+(end.y+w[1]*18)+' '+end.x+','+end.y);
        path.setAttribute('fill','none');path.setAttribute('class','guided-wire');
        path.setAttribute('data-selected',String(!!edge&&selectedEdge===edgeKey(edge)));path.setAttribute('data-invalid',String(!!edge&&!validEdge(edge,graph())));
        if(edge)path.setAttribute('marker-end','url(#guided-board-arrow)');else path.setAttribute('stroke-dasharray','5 4');svg.append(path);
        if(edge) {
          const hit=svgEl('path');hit.setAttribute('d',path.getAttribute('d'));hit.setAttribute('fill','none');hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','22');hit.setAttribute('class','guided-wire-hit');hit.setAttribute('aria-hidden','true');
          hit.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();selectEdge(edge);});svg.append(hit);
        }
      }
      for(const edge of graph().edges) {
        const p=attachments.get(edgeKey(edge)) || {fromSide:'top',toSide:'bottom'},a=point({id:edge.from,side:p.fromSide}),b=point({id:edge.to,side:p.toSide});
        if(a&&b)curve(a,b,p.fromSide,p.toSide,edge);
      }
      if(gesture?.moved) {
        const a=point(gesture.start),b=gesture.target?point(gesture.target):{x:gesture.x-rect.left,y:gesture.y-rect.top};
        if(a&&b)curve(a,b,gesture.start.side,gesture.target?.side,null);
      }
      svg.setAttribute('aria-label','직접 연결한 문장 '+graph().edges.length+'개');
    }
    listen(deleteButton,'click',deleteEdge);
    listen(eventRoot,'keydown',event=>{
      if(!usable())return;
      const target=event.target,editing=target?.matches?.('input,textarea,select')||target?.isContentEditable;
      if(event.key==='Escape'&&!editing){event.preventDefault();cancel();return;}
      if(['Delete','Backspace'].includes(event.key)&&!editing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!pending&&!gesture&&selectedEdge){event.preventDefault();deleteEdge();}
    });
    if(win.addEventListener){listen(win,'resize',schedule);listen(win,'blur',()=>{pending=null;stopGesture();schedule();});}
    if(doc.addEventListener)listen(doc,'visibilitychange',()=>{if(doc.hidden){pending=null;stopGesture();schedule();}});
    const Observer=win.ResizeObserver || globalThis.ResizeObserver;
    const observer=Observer?new Observer(schedule):null;observer?.observe(root);
    return {
      render,
      suspend(){active=false;pending=null;selectedEdge=null;stopGesture();svg.textContent='';root.hidden=true;links.hidden=true;tools.hidden=true;},
      resume(){if(!disposed){active=true;render();}},
      dispose(){active=false;disposed=true;stopGesture();if(frame!==null)caf(frame);frame=null;observer?.disconnect();for(const cleanup of cleanups)cleanup();attachments.clear();ports.clear();blocks.clear();focusTargets.clear();root.textContent='';links.textContent='';tools.hidden=true;}
    };
  }
  return {create};
})();
if(typeof module!=='undefined')module.exports=GuidedBoard;
