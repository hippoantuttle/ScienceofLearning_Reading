'use strict';
let guidedSession=null, guidedInvalidated=false;
const guidedEl=id=>document.getElementById(id);
function guidedIdentity(){try{const f=panelFlow();return f.getToken()&&(f.getAccountId?.()||f.getIdentity?.());}catch{return null;}}
function resetGuided(){
  if(!guidedSession&&SubmissionConfig.guidedReadingEnabled!==true)return;
  guidedSession?.board?.dispose();guidedSession?.gate?.dispose();guidedSession=null;guidedInvalidated=false;
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
  if(guidedEl('guided-back-structure'))guidedEl('guided-back-structure').hidden=true;
}
function guidedInvalidate(){
  if(guidedSession?.mode!=='guided')return;
  guidedSession.board?.dispose();guidedSession.board=null;guidedSession.gate?.dispose();guidedSession.editor=null;guidedSession.snapshot=null;guidedSession.returnState=null;guidedSession.manualDraft=null;guidedInvalidated=true;
  if(guidedEl('guided-back-structure'))guidedEl('guided-back-structure').hidden=true;
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
  if(guidedEl('guided-back-structure'))guidedEl('guided-back-structure').hidden=true;
  return s;
}
function guidedAction(fn){try{const result=fn();return result===undefined?true:result;}catch(e){guidedEl('guided-status').textContent=['글을 다시 연결하세요.'].includes(e.message)?e.message:'유형·양쪽 역할·연결 방향을 확인하세요. 사용 문장은 2~8개이며 각 문장에 연결이 필요합니다.';return false;}}
function guidedSentenceButton(s,sentence,candidate=false){
  const row=document.createElement('li'),text=document.createElement('p');text.textContent=sentence.text;row.append(text);
  const add=document.createElement('button');add.type='button';add.textContent='문장 선택';add.className='guided-sentence-pick';add.setAttribute('aria-label',sentence.text+' 문장 선택');add.setAttribute('aria-pressed',String(s.selectedSentence===sentence.id));add.draggable=true;
  (s.pickButtons||(s.pickButtons=[])).push({id:sentence.id,button:add});
  add.addEventListener('click',()=>guidedAction(()=>{guidedBegin();s.selectedSentence=sentence.id;guidedEl('guided-board-hint').textContent='선택한 문장을 놓을 역할 자리를 고르세요.';guidedRender();}));
  add.addEventListener('dragstart',event=>{if(!guidedCurrent(s)||!guidedAction(()=>guidedBegin())){event.preventDefault();return;}event.dataTransfer.setData('text/plain','reading-sentence:'+sentence.id);});row.append(add);
  if(candidate){const exclude=document.createElement('button');exclude.type='button';exclude.textContent='후보 제외';exclude.addEventListener('click',()=>guidedAction(()=>{guidedBegin();s.excluded.add(sentence.id);if(s.selectedSentence===sentence.id)s.selectedSentence=null;row.remove();guidedRender();}));row.append(exclude);}
  return row;
}
function guidedUpdateSelection(s){
  for(const item of s.pickButtons||[]){item.button.setAttribute('aria-pressed',String(s.selectedSentence===item.id));item.button.textContent=s.selectedSentence===item.id?'선택됨':'문장 선택';}
}
function guidedBoardAction(s,action){
  return guidedAction(()=>{
    if(guidedBegin()!==s||!s.editor)throw Error('글을 다시 연결하세요.');
    const editor=s.editor;
    if(action.type==='place'){
      if(!['primary','support'].includes(action.role))throw Error('role');
      let graph=editor.read(),node=action.nodeId?graph.nodes.find(n=>n.id===action.nodeId):graph.nodes.find(n=>n.sentenceId===action.sentenceId);
      if(action.nodeId&&!node)throw Error('node');
      if(action.beforeId&&action.beforeId!==node?.id&&!graph.nodes.some(n=>n.id===action.beforeId&&n.role===action.role))throw Error('target');
      if(!node){if(!s.snapshot.sentences.some(n=>n.id===action.sentenceId))throw Error('sentence');editor.add(action.sentenceId);node=editor.read().nodes.find(n=>n.sentenceId===action.sentenceId);}
      editor.place(node.id,action.role);graph=editor.read();
      const remaining=graph.nodes.filter(n=>n.id!==node.id);let at=remaining.length;
      if(action.beforeId&&action.beforeId!==node.id)at=remaining.findIndex(n=>n.id===action.beforeId);
      else{const last=remaining.map((n,i)=>n.role===action.role?i:-1).filter(i=>i>=0);if(last.length)at=last[last.length-1]+1;}
      remaining.splice(at,0,node);editor.reorder(remaining.map(n=>n.id));s.selectedSentence=null;
    }else if(action.type==='reorder')editor.reorder(action.nodeIds);
    else if(action.type==='exclude')editor.exclude(action.nodeId);
    else if(action.type==='disconnect')editor.disconnect(action.from,action.to);
    else if(action.type==='connect'){
      const existing=editor.read().edges.find(e=>e.from===action.from&&e.to===action.to);
      if(existing&&existing.relationType!==action.relationType)throw Error('connection');
      if(!existing)editor.connect(action.from,action.to,action.relationType);
    }else if(action.type!=='touch')throw Error('action');
    guidedUpdateSelection(s);return true;
  });
}
function guidedRender(){
  const s=guidedSession;if(!s?.editor||guidedInvalidated)return;
  if(!s.board)s.board=GuidedBoard.create({root:guidedEl('guided-nodes'),links:guidedEl('guided-edges'),tools:guidedEl('guided-edge-tools'),deleteButton:guidedEl('guided-delete-edge'),eventRoot:guidedEl('guided-work'),
    read:()=>guidedCurrent(s)&&s.editor?{graph:s.editor.read(),selectedSentence:s.selectedSentence||null}:null,
    act:action=>guidedBoardAction(s,action),message:text=>{if(guidedCurrent(s))guidedEl('guided-board-hint').textContent=text;}});
  guidedUpdateSelection(s);s.board.render();
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
    s.stage='mainIdea';guidedEl('main-idea-block').hidden=false;guidedEl('main-idea').disabled=false;guidedEl('to-retell').hidden=false;guidedEl('to-retell').disabled=false;if(guidedEl('guided-back-structure'))guidedEl('guided-back-structure').hidden=false;guidedEl('main-idea').focus();
    guidedEl('guided-status').textContent='구조도를 바탕으로 중심 생각을 자기 말로 작성하세요.';
  }catch{guidedEl('guided-status').textContent='구조 유형과 양쪽 역할을 채우고 문장들을 연결하세요. 추가 설명은 비워도 됩니다.';}
}
function guidedBeforeRetell(){const s=guidedSession;if(guidedInvalidated)throw Error('글을 다시 연결하세요.');if(s?.mode==='guided'){if(s.stage!=='mainIdea')throw Error('먼저 구조도를 완성하고 중심 생각 작성으로 이동하세요.');guidedSupportValues({structureType:guidedEl('structure').value,primary:guidedEl('primary').value,support:guidedEl('support').value});if(s.gate.state().phase!=='retell')s.gate.beginRetell();s.board?.suspend();}}
function guidedRevisit(){if(guidedSession?.mode==='guided'){guidedSession.gate.revisit();if(!guidedSession.manual)guidedSession.board?.resume();}}
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
  if(!s.manual&&s.snapshot){const ids=s.gate.state().candidateIds;for(const sentence of s.snapshot.sentences.filter(x=>ids.includes(x.id)&&!s.excluded.has(x.id)))list.append(guidedSentenceButton(s,sentence,true));s.board?.resume();guidedRender();}
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
  const s=guidedBegin();guidedRememberView(s);s.gate.continueManually();s.board?.suspend();s.manual=true;s.editor=null;guidedEl('manual-map').hidden=false;
  for(const id of ['guided-candidates','guided-source-list','summary-graph'])guidedEl(id).textContent='';
  guidedEl('guided-graph-controls').hidden=true;guidedEl('guided-manual').hidden=true;guidedEl('guided-no-candidates').hidden=true;
  guidedEl('primary').value=s.manualDraft?.primary||'';guidedEl('support').value=s.manualDraft?.support||'';
  guidedEl('guided-status').textContent='구조도를 직접 작성한 뒤 중심 생각으로 이동하세요. 이전 구성 화면으로 돌아갈 수 있습니다.';
}));
guidedEl('guided-to-main').addEventListener('click',()=>guidedAdvance());
// TASK-027: 중심 생각 단계에서 구조화 단계로 명시적으로 돌아간다. 작성한 중심 생각은 보존하고 AI 후보 요청은 다시 열지 않는다.
guidedEl('guided-back-structure')?.addEventListener('click',()=>guidedAction(()=>{guidedBegin();guidedEl('guided-status').textContent='구조화 단계로 돌아왔습니다. 배치·연결을 고친 뒤 「구조도 확인 · 중심 생각 작성」을 다시 누르세요. 작성한 중심 생각은 유지됩니다.';guidedEl('structure').focus();}));
guidedEl('structure').addEventListener('change',()=>{if(guidedSession?.mode==='guided')guidedAction(()=>{const s=guidedBegin();if(!s.manual){s.editor.selectType(guidedEl('structure').value);guidedRender();}});});
guidedEl('guided-source-picker').addEventListener('toggle',()=>{if(!guidedEl('guided-source-picker').open)return;guidedAction(()=>{const s=guidedBegin();const list=guidedEl('guided-source-list');list.textContent='';for(const sentence of s.snapshot?.sentences||[])list.append(guidedSentenceButton(s,sentence));});});
for(const id of ['primary','support'])guidedEl(id).addEventListener('input',()=>{if(guidedSession?.mode==='guided'&&guidedSession.manual)guidedAction(()=>guidedBegin());});
if(SubmissionConfig.guidedReadingEnabled===true)chrome.tabs.onActivated?.addListener(info=>{if(guidedSession?.mode==='guided'&&info.windowId===guidedSession.session.windowId&&info.tabId!==guidedSession.session.tabId)guidedSession.gate.continueManually();});
// 2026-11-18: 같은 주소로 새로고침되는 것은 글 변경으로 보지 않는다(2026-11-19: #만 바뀌는 것도 같은 주소). 초급 후보·배치는 패널이 처음 불러온 본문(articleSession.text)에
// 묶여 있으므로 그대로 유지하고, 다시 말하기 진입 때 같은 글(제목 + 본문 유사도)인지 확인한다. 주소가 바뀌면 기존대로 무효화한다.
if(SubmissionConfig.guidedReadingEnabled===true)chrome.tabs.onUpdated?.addListener((id,change)=>{if(guidedSession?.mode==='guided'&&id===guidedSession.session.tabId&&typeof change.url==='string'&&!sameArticleUrl(change.url,guidedSession.session.url))guidedInvalidate();});
// TASK-027 C: 임시저장용 초급 상태. 화면에 보인 후보 ID·노출 이력·사용자가 만든 배치·연결만 담는다(AI 응답 원문·토큰 제외).
function guidedDraft(){
  const s=guidedSession;if(!s||guidedInvalidated)return null;
  if(s.mode!=='guided')return {mode:'independent'};
  const g=s.gate.state();
  return {mode:'guided',stage:s.stage==='mainIdea'?'mainIdea':'structuring',manual:!!s.manual,unsupported:!!s.unsupported,excluded:[...s.excluded],
    gate:{phase:g.phase,status:g.status,attempts:g.attempts,candidateExposure:g.candidateExposure,candidateIds:g.candidateIds},
    metadata:g.candidateExposure&&s.metadata?{promptVersion:s.metadata.promptVersion,modelId:s.metadata.modelId,documentHash:s.metadata.documentHash}:null,
    graph:!s.manual&&s.editor?s.editor.read():null};
}
// 임시저장에서 이어가기. 읽기 시작 직후의 guidedStarted 대신 호출하며, AI 후보 요청을 절대 보내지 않는다.
// 같은 글(본문 해시 일치, 또는 웹 기사의 같은 제목 + 본문 유사도)이 확인되고 articleSession.text가 처음 불러온 본문으로 맞춰진 뒤에만 호출된다. 유형 변경으로 규칙에 맞지 않게 된 연결은 되살리지 못한다.
async function guidedResume(d){
  if(SubmissionConfig.guidedReadingEnabled!==true||articleSession?.kind==='pdf'||!d)return false;
  if(d.mode!=='guided'){guidedSession={mode:'independent',session:articleSession};guidedPrepare();return true;}
  const state={mode:'guided',session:articleSession,owner:guidedIdentity(),stage:'structuring',manual:!!d.manual,unsupported:!!d.unsupported,excluded:new Set(Array.isArray(d.excluded)?d.excluded.filter(x=>typeof x==='string'):[]),metadata:d.metadata||null};
  try{state.snapshot=SentenceSource.segment(articleSession.text);}catch{}
  state.gate=ReadingSupport.create({article:articleSession.text,accountId:state.owner,mode:'guided',enabled:SubmissionConfig.guidedReadingEnabled===true,kind:articleSession.fallback?'unsupported':'web'});
  const g=state.gate.restore(d.gate||{});
  if(g.candidateExposure&&!(state.metadata?.promptVersion&&state.metadata?.modelId&&state.metadata?.documentHash))throw Error('invalid_restore');
  guidedSession=state;guidedInvalidated=false;
  if(!state.manual&&state.snapshot){
    state.editor=ReadingSupport.createEditor({article:state.snapshot.article,candidateIds:g.candidateIds});
    const saved=d.graph||{},type=['claim','cause','problem'].includes(saved.structureType)?saved.structureType:(guidedEl('structure').value||'claim');
    state.editor.selectType(type);guidedEl('structure').value=type;
    const map=new Map();
    for(const node of (Array.isArray(saved.nodes)?saved.nodes:[]).slice().sort((a,b)=>a.order-b.order)){
      try{const added=state.editor.add(node.sentenceId).nodes.at(-1);map.set(node.id,added.id);if(['primary','support'].includes(node.role))state.editor.place(added.id,node.role);}catch{}
    }
    for(const edge of Array.isArray(saved.edges)?saved.edges:[]){try{state.editor.connect(map.get(edge.from),map.get(edge.to),edge.relationType);}catch{}}
  }
  if(typeof updateStructureLabels==='function')updateStructureLabels();
  guidedEl('guided-work').hidden=false;guidedEl('manual-map').hidden=!state.manual;
  guidedEl('guided-graph-controls').hidden=state.manual||!state.snapshot;
  guidedEl('worksheet').insertBefore(guidedEl('main-idea-block'),guidedEl('form-error'));
  guidedEl('main-idea-block').hidden=false;guidedEl('reading-mode').disabled=true;guidedEl('guided-retry').hidden=true;guidedEl('guided-return').hidden=true;
  guidedEl('guided-manual').hidden=state.manual;guidedEl('guided-no-candidates').hidden=state.manual;
  const list=guidedEl('guided-candidates');list.textContent='';
  if(!state.manual&&state.snapshot){
    if(g.candidateExposure)for(const sentence of state.snapshot.sentences.filter(x=>g.candidateIds.includes(x.id)&&!state.excluded.has(x.id)))list.append(guidedSentenceButton(state,sentence,true));
    else{guidedEl('guided-source-picker').open=true;const source=guidedEl('guided-source-list');source.textContent='';for(const sentence of state.snapshot.sentences)source.append(guidedSentenceButton(state,sentence));}
    guidedRender();
  }
  let stage='structuring';
  if(d.stage==='mainIdea'&&(g.phase==='mainIdea'||(state.manual&&g.phase==='structuring'))){
    try{
      if(state.manual){if(!guidedEl('primary').value.trim()||!guidedEl('support').value.trim())throw Error('incomplete');}
      else{const fields=state.editor.textFields();state.editor.validate();guidedEl('primary').value=fields.primary;guidedEl('support').value=fields.support;}
      stage='mainIdea';
    }catch{stage='structuring';}
  }
  if(stage==='structuring'&&state.gate.state().phase==='mainIdea')state.gate.resumeStructuring();
  if(state.snapshot)state.hash=await SentenceSource.hash(state.snapshot.article);
  state.stage=stage;
  const main=stage==='mainIdea';
  guidedEl('main-idea').disabled=!main;guidedEl('to-retell').hidden=false;guidedEl('to-retell').disabled=!main;
  if(guidedEl('guided-back-structure'))guidedEl('guided-back-structure').hidden=!main;
  guidedEl('guided-status').textContent='임시저장에서 이어서 합니다. 작성한 배치·연결과 이미 본 문장 후보를 되살렸고, 문장 후보는 다시 요청하지 않습니다.';
  return true;
}
