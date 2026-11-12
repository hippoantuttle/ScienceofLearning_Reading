'use strict';
let guidedSession=null, guidedInvalidated=false;
const guidedEl=id=>document.getElementById(id);
function guidedIdentity(){try{const f=panelFlow();return f.getToken()&&(f.getAccountId?.()||f.getIdentity?.());}catch{return null;}}
function resetGuided(){
  if(!guidedSession&&SubmissionConfig.guidedReadingEnabled!==true)return;
  guidedSession?.gate?.dispose();guidedSession=null;guidedInvalidated=false;
  for(const id of ['guided-work','guided-consent'])if(guidedEl(id))guidedEl(id).hidden=true;
  for(const id of ['guided-candidates','guided-nodes','guided-edges','guided-source-list','summary-graph'])if(guidedEl(id))guidedEl(id).textContent='';
  if(guidedEl('reading-mode')){guidedEl('reading-mode').disabled=false;guidedEl('reading-mode').value='independent';}
  if(guidedEl('manual-map'))guidedEl('manual-map').hidden=false;
  const option=guidedEl('structure')?.querySelector?.('option[value=""]');if(option)option.remove();
  if(guidedEl('structure'))guidedEl('structure').value='claim';
  if(guidedEl('main-idea-block'))guidedEl('worksheet').insertBefore(guidedEl('main-idea-block'),guidedEl('structure-block'));
  if(guidedEl('main-idea-block'))guidedEl('main-idea-block').hidden=false;
  if(guidedEl('to-retell')){guidedEl('to-retell').hidden=false;guidedEl('to-retell').disabled=false;}
  if(guidedEl('main-idea'))guidedEl('main-idea').disabled=false;
  if(guidedEl('guided-return'))guidedEl('guided-return').hidden=true;
}
function guidedInvalidate(){
  if(guidedSession?.mode!=='guided')return;
  guidedSession.gate?.dispose();guidedSession.editor=null;guidedSession.snapshot=null;guidedSession.returnState=null;guidedSession.manualDraft=null;guidedInvalidated=true;
  for(const id of ['guided-candidates','guided-nodes','guided-edges','guided-source-list','summary-graph'])if(guidedEl(id))guidedEl(id).textContent='';
  guidedEl('guided-status').textContent='계정이나 글이 변경되었습니다. 글을 다시 연결해 새 훈련을 시작하세요.';
}
function guidedPrepare(){
  if(SubmissionConfig.guidedReadingEnabled!==true){guidedEl('guided-mode-block').hidden=true;return;}
  const web=articleSession?.kind!=='pdf', available=SubmissionConfig.guidedReadingEnabled===true&&web;
  guidedEl('guided-mode-block').hidden=!available;
  guidedEl('reading-mode').disabled=!!guidedSession;
  const selected=available&&guidedEl('reading-mode').value==='guided';
  guidedEl('guided-consent').hidden=!selected;
  guidedEl('guided-preview').value=selected&&!articleSession?.fallback?articleSession.text:'';
  if(guidedSession){guidedEl('start-reading').textContent='읽기·구조화 계속';return;}
  guidedEl('start-reading').textContent=selected?'읽기 시작 · 본문 보내고 문장 후보 받기':'읽기·구조화 시작';
  if(selected){if(typeof pilotAiSetCard==='function')pilotAiSetCard(false);if(typeof pilotAiClear==='function')pilotAiClear();}
  else if(!guidedSession&&typeof pilotAiEnable==='function')pilotAiEnable();
}
function guidedStarted(){
  if(guidedSession)return;
  if(SubmissionConfig.guidedReadingEnabled!==true||articleSession?.kind==='pdf')return;
  const mode=guidedEl('reading-mode').value;
  if(mode!=='guided'){guidedSession={mode:'independent',session:articleSession};guidedPrepare();return;}
  const state={mode,session:articleSession,owner:guidedIdentity(),stage:'structuring',manual:false,excluded:new Set(),metadata:null};
  guidedSession=state;
  try{state.snapshot=SentenceSource.segment(articleSession.text);}catch{}
  state.gate=ReadingSupport.create({article:articleSession.text,accountId:state.owner,mode,enabled:SubmissionConfig.guidedReadingEnabled===true,kind:articleSession.fallback?'unsupported':'web'});
  state.gate.start();
  if(state.snapshot)state.editor=ReadingSupport.createEditor({article:articleSession.text});
  guidedEl('guided-graph-controls').hidden=false;
  guidedEl('guided-work').hidden=false;guidedEl('manual-map').hidden=true;
  guidedEl('structure').value='claim';if(state.editor)state.editor.selectType('claim');
  guidedEl('guided-return').hidden=true;guidedRender();
  guidedEl('worksheet').insertBefore(guidedEl('main-idea-block'),guidedEl('form-error'));
  guidedEl('main-idea-block').hidden=false;guidedEl('main-idea').disabled=true;guidedEl('to-retell').hidden=false;guidedEl('to-retell').disabled=true;
  guidedEl('reading-mode').disabled=true;
  guidedEl('guided-retry').hidden=true;
  guidedEl('guided-manual').hidden=false;guidedEl('guided-no-candidates').hidden=false;
  if(!state.snapshot||articleSession.fallback){guidedEl('guided-graph-controls').hidden=!state.snapshot;guidedEl('guided-status').textContent='이 글은 AI 문장 후보를 요청할 수 없습니다. 직접 작성으로 계속할 수 있습니다.';state.unsupported=true;return;}
  guidedEl('guided-status').textContent=state.owner?'문장 후보를 요청하고 있습니다. 기다리는 동안 원문을 읽으세요.':'로그인 없이 원문에서 직접 구성할 수 있습니다. AI 후보는 이번 훈련에서 요청하지 않습니다.';
  if(state.owner)void guidedRequest(state);else{state.gate.continueManually();state.unsupported=true;}
}
function guidedCurrent(s){return guidedSession===s&&!guidedInvalidated&&articleSession===s.session&&(!s.owner||guidedIdentity()===s.owner);}
async function guidedRequest(s){
  if(!guidedCurrent(s))return;
  guidedEl('guided-retry').hidden=true;
  try{
    const shown=await s.gate.request(async(body,{signal})=>{
      const flow=panelFlow(),token=await panelFreshToken(flow);
      await validateBoundTab();if(!guidedCurrent(s)||!token||signal.aborted)throw Error('cancelled');
      const endpoint=new URL(SubmissionConfig.aiEndpoint);
      if((endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)))||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/recommend')throw Error('endpoint');
      endpoint.pathname='/reading-candidates';
      const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(abort,60000);
      try{
        const res=await fetch(endpoint.href,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
        if(!res.ok){const failure=await res.json().catch(()=>null);throw Object.assign(Error('request'),{status:res.status,code:['disabled','cohort_expired','selftest_expired'].includes(failure?.error)?failure.error:null});}
        const reader=res.body.getReader(),chunks=[];let size=0;for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>8192){void reader.cancel();throw Error('invalid_response');}chunks.push(p.value);}
        const bytes=new Uint8Array(size);let offset=0;for(const x of chunks){bytes.set(x,offset);offset+=x.byteLength;}
        const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));await validateBoundTab();
        if(!guidedCurrent(s)||flow.getToken()!==token||signal.aborted)throw Error('cancelled');s.metadata=data;return data;
      }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
    },{consent:true,requestId:crypto.randomUUID()});
    if(!shown||!guidedCurrent(s))return;
    // Create text-only DOM before recording exposure; never display provider text.
    const list=guidedEl('guided-candidates');list.textContent='';
    for(const sentence of shown.sentences)list.append(guidedSentenceButton(s,sentence,true));
    if(!s.gate.markExposed(shown.generation)){list.textContent='';return;}
    s.editor=ReadingSupport.createEditor({article:s.snapshot.article,candidateIds:s.gate.state().candidateIds});s.editor.selectType(guidedEl('structure').value);guidedRender();
    guidedEl('guided-status').textContent='원문의 문장 후보입니다. 구조 유형과 역할·연결은 직접 정하세요. 모두 사용할 필요는 없습니다.';
  }catch{
    if(!guidedCurrent(s)||s.gate.state().requestClosed)return;
    const reason=s.gate.state().failureReason;guidedEl('guided-status').textContent=({unauthorized:'로그인이 만료되어 문장 후보를 요청하지 못했습니다.',inactive:'사용 권한을 확인하지 못했습니다.',limit:'AI 요청 한도에 도달했습니다.',disabled:'현재 문장 후보 기능이 비활성화되어 있습니다.',cohort_expired:'참여 기간이 종료되었습니다.',selftest_expired:'시험 기간이 종료되었습니다.',timeout:'문장 후보 응답 시간이 초과되었습니다.',too_large:'본문이 전송 한도를 넘었습니다.',invalid_response:'문장 후보 응답 형식이 올바르지 않습니다.'})[reason]||'오프라인이거나 서버에서 문장 후보를 받지 못했습니다.';guidedEl('guided-status').textContent+=' 원문에서 직접 구성하거나 직접 작성으로 계속할 수 있습니다.';
    guidedEl('guided-retry').hidden=!s.gate.canRetry();
  }
}
function guidedBegin(){
  const s=guidedSession;if(!s||s.mode!=='guided'||guidedInvalidated)throw Error('글을 다시 연결하세요.');
  const phase=s.gate.state().phase;
  if(phase==='reading')s.gate.beginStructuring();else if(phase==='mainIdea')s.gate.resumeStructuring();
  s.revision=(s.revision||0)+1;s.stage='structuring';guidedEl('main-idea-block').hidden=false;guidedEl('main-idea').disabled=true;guidedEl('to-retell').hidden=false;guidedEl('to-retell').disabled=true;guidedEl('guided-retry').hidden=true;
  return s;
}
function guidedAction(fn){try{fn();}catch(e){guidedEl('guided-status').textContent=['글을 다시 연결하세요.'].includes(e.message)?e.message:'유형·양쪽 역할·연결 방향을 확인하세요. 사용 문장은 2~8개이며 각 문장에 연결이 필요합니다.';}}
function guidedSentenceButton(s,sentence,candidate=false){
  const row=document.createElement('li'),text=document.createElement('p');text.textContent=sentence.text;row.append(text);
  const add=document.createElement('button');add.type='button';add.textContent='구조도에 사용';add.setAttribute('aria-label',sentence.text+' 문장을 구조도에 사용');
  add.addEventListener('click',()=>guidedAction(()=>{guidedBegin();s.editor.add(sentence.id);guidedRender();}));row.append(add);
  if(candidate){const exclude=document.createElement('button');exclude.type='button';exclude.textContent='후보 제외';exclude.addEventListener('click',()=>guidedAction(()=>{guidedBegin();s.excluded.add(sentence.id);row.remove();}));row.append(exclude);}
  return row;
}
function guidedSelect(options,value,label){const select=document.createElement('select');select.setAttribute('aria-label',label);for(const [v,t]of options){const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o);}select.value=value;return select;}
function guidedRender(){
  const s=guidedSession;if(!s?.editor||guidedInvalidated)return;
  const g=s.editor.read(),labels=({claim:['주장','근거'],cause:['원인','결과'],problem:['문제','해결책']})[g.structureType]||['첫 역할','둘째 역할'];
  const nodes=guidedEl('guided-nodes'),edges=guidedEl('guided-edges');nodes.textContent='';edges.textContent='';
  for(const n of g.nodes){
    const li=document.createElement('li'),p=document.createElement('p');p.textContent=`문장 ${n.order+1} · ${n.source==='ai_candidate'?'AI 후보에서 선택':'원문에서 직접 추가'}\n${n.text}`;li.append(p);
    const role=guidedSelect([['','역할을 선택하세요'],['primary',labels[0]],['support',labels[1]]],n.role||'',`문장 ${n.order+1}의 역할`);
    role.addEventListener('change',()=>guidedAction(()=>{guidedBegin();s.editor.place(n.id,role.value);guidedRender();}));li.append(role);
    const remove=document.createElement('button');remove.type='button';remove.textContent=`문장 ${n.order+1} 제거`;remove.addEventListener('click',()=>guidedAction(()=>{guidedBegin();s.editor.exclude(n.id);guidedRender();}));li.append(remove);nodes.append(li);
  }
  const opts=[['','문장을 선택하세요'],...g.nodes.map(n=>[n.id,`문장 ${n.order+1} · ${n.text.slice(0,40)}`])];
  for(const [id,label]of[['guided-from','연결 시작 문장'],['guided-to','연결 도착 문장']]){const old=guidedEl(id);const select=guidedSelect(opts,old.value,label);old.textContent='';for(const o of [...select.children])old.append(o);old.value='';}
  const rel=guidedEl('guided-relation');rel.textContent='';const blank=document.createElement('option');blank.value='';blank.textContent='관계를 선택하세요';rel.append(blank);
  if(g.structureType){const o=document.createElement('option');o.value=ReadingSupportContract.relations[g.structureType].type;o.textContent=({claim:'뒷받침함 (근거 → 주장)',cause:'이어짐 (원인 → 결과)',problem:'대응함 (해결책 → 문제)'})[g.structureType];rel.append(o);}
  for(const e of g.edges){const li=document.createElement('li'),button=document.createElement('button');const a=g.nodes.find(n=>n.id===e.from),b=g.nodes.find(n=>n.id===e.to);li.textContent=`문장 ${a.order+1} → 문장 ${b.order+1} (${({supports:'뒷받침',causes:'원인 → 결과',addresses:'문제에 대응'})[e.relationType]}) `;button.type='button';button.textContent='연결 제거';button.addEventListener('click',()=>guidedAction(()=>{guidedBegin();s.editor.disconnect(e.from,e.to);guidedRender();}));li.append(button);edges.append(li);}
}
function guidedSupportValues(base){
  if(guidedInvalidated)throw Error('계정이나 글이 변경되었습니다. 글을 다시 연결하세요.');
  const s=guidedSession;if(!s)return base;
  if(s.mode==='independent')return {...base,learningSupport:LearningSupport.empty('independent')};
  const state=s.gate.state(),v=LearningSupport.empty('guided');
  Object.assign(v,{activity:s.manual?'manual':'graph',candidateExposure:state.candidateExposure,requestStatus:s.unsupported?'unsupported':state.status,attempts:state.attempts,segmentationVersion:s.snapshot?SentenceSource.VERSION:null,documentHash:s.hash||null,candidateIds:state.candidateIds});
  if(state.candidateExposure)Object.assign(v,{promptVersion:s.metadata.promptVersion,modelId:s.metadata.modelId,documentHash:s.metadata.documentHash});
  if(!s.manual){v.graph=s.editor.validate();Object.assign(base,s.editor.textFields());}
  return {...base,learningSupport:LearningSupport.validate(v,base)};
}
async function guidedAdvance(){
  const s=guidedSession;if(!s||s.mode!=='guided')return;
  try{
    guidedBegin();const revision=s.revision;
    if(s.manual){if(!guidedEl('structure').value||!guidedEl('primary').value.trim()||!guidedEl('support').value.trim())throw Error('incomplete');}
    else{const graph=s.editor.validate(),fields=s.editor.textFields();guidedEl('primary').value=fields.primary;guidedEl('support').value=fields.support;s.gate.beginMainIdea(graph,guidedEl('structure').value);}
    if(s.snapshot)s.hash=await SentenceSource.hash(s.snapshot.article);
    if(!guidedCurrent(s)||s.revision!==revision)return;
    s.stage='mainIdea';guidedEl('main-idea-block').hidden=false;guidedEl('main-idea').disabled=false;guidedEl('to-retell').hidden=false;guidedEl('to-retell').disabled=false;guidedEl('main-idea').focus();
    guidedEl('guided-status').textContent='구조도를 바탕으로 중심 생각을 자기 말로 작성하세요.';
  }catch{guidedEl('guided-status').textContent='구조 유형과 양쪽 역할을 채우고 문장들을 연결하세요. 추가 설명은 비워도 됩니다.';}
}
function guidedBeforeRetell(){const s=guidedSession;if(guidedInvalidated)throw Error('글을 다시 연결하세요.');if(s?.mode==='guided'){if(s.stage!=='mainIdea')throw Error('먼저 구조도를 완성하고 중심 생각 작성으로 이동하세요.');guidedSupportValues({structureType:guidedEl('structure').value,primary:guidedEl('primary').value,support:guidedEl('support').value});if(s.gate.state().phase!=='retell')s.gate.beginRetell();}}
function guidedRevisit(){if(guidedSession?.mode==='guided')guidedSession.gate.revisit();}
guidedEl('reading-mode').addEventListener('change',()=>{if(!guidedSession)guidedPrepare();});
guidedEl('guided-retry').addEventListener('click',()=>{const s=guidedSession;if(s?.gate?.canRetry())void guidedRequest(s);});
function guidedRememberView(s){
  if(!s.returnState)s.returnState={manual:s.manual,editor:s.editor,primary:guidedEl('primary').value,support:guidedEl('support').value,structureType:guidedEl('structure').value};
  guidedEl('guided-return').hidden=false;
}
function guidedReturn(){
  const s=guidedBegin(),previous=s.returnState;if(!previous)return;
  if(s.manual)s.manualDraft={primary:guidedEl('primary').value,support:guidedEl('support').value,structureType:guidedEl('structure').value};
  s.manual=previous.manual;s.editor=previous.editor;s.returnState=null;
  guidedEl('structure').value=s.editor?.read().structureType||previous.structureType;if(typeof updateStructureLabels==='function')updateStructureLabels();
  guidedEl('primary').value=previous.primary;guidedEl('support').value=previous.support;
  guidedEl('manual-map').hidden=!s.manual;guidedEl('guided-graph-controls').hidden=s.manual||!s.snapshot;
  guidedEl('guided-manual').hidden=s.manual;guidedEl('guided-no-candidates').hidden=s.manual;guidedEl('guided-return').hidden=true;
  guidedEl('guided-source-picker').open=false;
  const list=guidedEl('guided-candidates');list.textContent='';
  if(!s.manual&&s.snapshot){const ids=s.gate.state().candidateIds;for(const sentence of s.snapshot.sentences.filter(x=>ids.includes(x.id)&&!s.excluded.has(x.id)))list.append(guidedSentenceButton(s,sentence,true));guidedRender();}
  guidedEl('guided-status').textContent='이전 구성 화면으로 돌아왔습니다. 작성한 배치·연결은 유지됩니다. 취소한 AI 요청은 다시 전송하지 않습니다.';
}
guidedEl('guided-return').addEventListener('click',()=>guidedAction(guidedReturn));
guidedEl('guided-no-candidates').addEventListener('click',()=>guidedAction(()=>{
  const s=guidedBegin();guidedRememberView(s);s.gate.continueManually();guidedEl('guided-candidates').textContent='';
  guidedEl('guided-source-picker').open=true;const list=guidedEl('guided-source-list');list.textContent='';
  for(const sentence of s.snapshot?.sentences||[])list.append(guidedSentenceButton(s,sentence));
  guidedEl('guided-status').textContent='아래 원문 문장 목록에서 골라 배치하세요. 이전 구성 화면으로 돌아갈 수도 있습니다.';
}));
guidedEl('guided-manual').addEventListener('click',()=>guidedAction(()=>{
  const s=guidedBegin();guidedRememberView(s);s.gate.continueManually();s.manual=true;s.editor=null;guidedEl('manual-map').hidden=false;
  for(const id of ['guided-candidates','guided-nodes','guided-edges','guided-source-list','summary-graph'])guidedEl(id).textContent='';
  guidedEl('guided-graph-controls').hidden=true;guidedEl('guided-manual').hidden=true;guidedEl('guided-no-candidates').hidden=true;
  guidedEl('primary').value=s.manualDraft?.primary||'';guidedEl('support').value=s.manualDraft?.support||'';
  guidedEl('guided-status').textContent='구조도를 직접 작성한 뒤 중심 생각으로 이동하세요. 이전 구성 화면으로 돌아갈 수 있습니다.';
}));
guidedEl('guided-to-main').addEventListener('click',()=>guidedAdvance());
guidedEl('structure').addEventListener('change',()=>{if(guidedSession?.mode==='guided')guidedAction(()=>{const s=guidedBegin();if(!s.manual){s.editor.selectType(guidedEl('structure').value);guidedRender();}});});
guidedEl('guided-connect').addEventListener('click',()=>guidedAction(()=>{const s=guidedBegin();s.editor.connect(guidedEl('guided-from').value,guidedEl('guided-to').value,guidedEl('guided-relation').value);guidedRender();}));
guidedEl('guided-source-picker').addEventListener('toggle',()=>{if(!guidedEl('guided-source-picker').open)return;guidedAction(()=>{const s=guidedBegin();const list=guidedEl('guided-source-list');list.textContent='';for(const sentence of s.snapshot?.sentences||[])list.append(guidedSentenceButton(s,sentence));});});
for(const id of ['primary','support'])guidedEl(id).addEventListener('input',()=>{if(guidedSession?.mode==='guided'&&guidedSession.manual)guidedAction(()=>guidedBegin());});
if(SubmissionConfig.guidedReadingEnabled===true)chrome.tabs.onActivated?.addListener(info=>{if(guidedSession?.mode==='guided'&&info.windowId===guidedSession.session.windowId&&info.tabId!==guidedSession.session.tabId)guidedSession.gate.continueManually();});
if(SubmissionConfig.guidedReadingEnabled===true)chrome.tabs.onUpdated?.addListener((id,change)=>{if(guidedSession?.mode==='guided'&&id===guidedSession.session.tabId&&(change.url||change.status==='loading'))guidedInvalidate();});
