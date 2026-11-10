'use strict';
const recordsEl = id => document.getElementById(id);
let recordsGeneration = 0, recordsCursor = null, revisionCursor = null, recordSelection = null, recordVersions = [];
function recordsVisible(){return !recordsEl('records-section').hidden;}
function resetRecordsPanel(){
  recordsGeneration++; recordsCursor=null; revisionCursor=null; recordSelection=null; recordVersions=[];
  recordsEl('records-list').textContent=''; recordsEl('records-content').textContent='';
  recordsEl('records-versions').textContent=''; recordsEl('records-detail').hidden=true;
  recordsEl('records-more').hidden=true; recordsEl('records-revisions-more').hidden=true;
}
function recordsIo(){return RecordClient.create({endpoint:SubmissionConfig.endpoint,getToken:()=>panelFlow().getToken()});}
function recordsError(error){
  if(error.status===401 || error.status===403){resetRecordsPanel();if(typeof panelExpireAccount==='function')panelExpireAccount();}
  recordsEl('records-status').textContent=error.message||'기록 조회에 실패했습니다. 다시 시도하세요.';
}
function recordsCurrent(generation){return generation===recordsGeneration && recordsVisible() && !articleSession;}
function recordsText(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
function recordsDate(value){return Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR'):'저장 시각 확인 불가';}
async function recordsLoad(append=false){
  if(!recordsVisible() || articleSession)return;
  const generation=++recordsGeneration;
  const more=recordsEl('records-more'),refresh=recordsEl('records-refresh');
  more.disabled=true;refresh.disabled=true;
  recordsEl('records-status').textContent='최근 기록을 불러오고 있습니다.';
  if(!append){recordsEl('records-list').textContent='';recordsEl('records-detail').hidden=true;recordsEl('records-content').textContent='';recordSelection=null;recordsCursor=null;}
  try{
    const result=await recordsIo().list(append?recordsCursor:null);
    if(!recordsCurrent(generation))return;
    if(!Array.isArray(result.items))throw Error('기록 목록 형식을 확인하지 못했습니다.');
    for(const item of result.items){
      const li=document.createElement('li'),button=recordsText('button',(item.articleTitle||'글 정보 없음')+' · '+recordsDate(item.savedAt)+(item.hasRevisions?' · 수정본 있음':' · 최초본만'));
      button.type='button';button.addEventListener('click',()=>recordsSelect(item.submissionId));li.append(button);
      if(item.sourceUrl)li.append(recordsText('p',item.sourceUrl));recordsEl('records-list').append(li);
    }
    recordsCursor=result.nextCursor;more.hidden=!recordsCursor;
    recordsEl('records-status').textContent=result.items.length?'저장된 기록을 선택하세요.':(append?'추가 기록이 없습니다.':'저장된 기록이 없습니다.');
  }catch(error){if(recordsCurrent(generation))recordsError(error);}
  finally{more.disabled=false;refresh.disabled=false;}
}
function recordsCompare(){
  const section=recordsEl('records-content');section.textContent='';
  if(!recordSelection)return;
  const selected=recordVersions.find(v=>v.id===recordsEl('records-versions').value);
  const original=recordSelection.payload;
  section.append(recordsText('h3',original.articleTitle||'글 정보 없음'));
  if(original.sourceUrl)section.append(recordsText('p',original.sourceUrl));
  section.append(recordsText('p','최초 저장: '+recordsDate(recordSelection.savedAt)));
  if(selected)section.append(recordsText('p','선택 수정본 저장: '+recordsDate(selected.savedAt)));
  const dl=document.createElement('dl');
  for(const [field,label] of [['mainIdea','중심 생각'],['primary','핵심 정보'],['support','보조 정보'],['relation','관계 설명'],['retell','Retell']]){
    dl.append(recordsText('dt',label+' · 최초본'),recordsText('dd',original[field]));
    if(selected)dl.append(recordsText('dt',label+' · 저장 수정본'),recordsText('dd',selected.answers[field]));
  }
  const unchanged={structureType:({'claim':'주장–근거','cause':'원인–결과','problem':'문제–해결'})[original.structureType]||'유형 정보 없음',reflection:original.reflection||'입력 없음',newWords:original.newWords||'입력 없음',interests:original.interests||'입력 없음',rechecked:original.rechecked?'원문을 다시 확인함':'다시 확인하지 않음'};
  for(const [field,label] of [['structureType','구조도 유형'],['reflection','감상'],['newWords','새 어휘'],['interests','관심 분야'],['rechecked','원문 재확인 여부']])dl.append(recordsText('dt',label+' · 최초 제출 유지'),recordsText('dd',unchanged[field]));
  section.append(dl);
}
function recordsAddVersions(result){
  if(!Array.isArray(result.items))throw Error('수정 이력 형식을 확인하지 못했습니다.');
  for(const version of result.items){
    if(recordVersions.some(v=>v.id===version.id))continue;
    recordVersions.push(version);
    const option=recordsText('option','저장 수정본 · '+recordsDate(version.savedAt)+' · '+version.id.slice(0,8));option.value=version.id;recordsEl('records-versions').append(option);
  }
  revisionCursor=result.nextCursor;recordsEl('records-revisions-more').hidden=!revisionCursor;
}
async function recordsSelect(id){
  if(!recordsVisible() || articleSession)return;
  const generation=++recordsGeneration;
  recordsEl('records-detail').hidden=true;recordsEl('records-content').textContent='';recordSelection=null;recordVersions=[];revisionCursor=null;
  recordsEl('records-versions').textContent='';const option=recordsText('option','최초본만 보기');option.value='';recordsEl('records-versions').append(option);
  recordsEl('records-status').textContent='저장본과 수정 이력을 불러오고 있습니다.';
  try{
    const io=recordsIo(),[detail,versions]=await Promise.all([io.detail(id),io.revisions(id)]);
    if(!recordsCurrent(generation))return;
    if(detail?.status!=='saved'||detail.submissionId!==id||!detail.payload)throw Error('저장본을 확인하지 못했습니다.');
    recordSelection=detail;recordsAddVersions(versions);recordsCompare();recordsEl('records-detail').hidden=false;
    recordsEl('records-status').textContent=recordVersions.length?'최초본과 저장 수정본을 선택해 확인하세요.':'수정본이 없는 기록입니다.';
    recordsEl('records-versions').focus();
  }catch(error){if(recordsCurrent(generation))recordsError(error);}
}
recordsEl('records-open').addEventListener('click',async()=>{
  if(operationBusy || analyzeButton.disabled)return;
  if(articleSession || (typeof feedbackDirty==='function'&&feedbackDirty())){
    if(!confirm('내 기록으로 이동하면 현재 훈련을 종료하고 미저장 입력과 수정을 지웁니다. 필요하면 취소한 뒤 먼저 저장하세요. 이동할까요?'))return;
    operationBusy=true;
    try{if(articleSession && !await restoreBlind())return;}finally{operationBusy=false;}
  }
  recommendationGate.reset();
  if(typeof resetPilotAi==='function')resetPilotAi();
  if(typeof localPreviewReset==='function')localPreviewReset();
  resetPanelSubmission();articleSession=null;
  document.getElementById('worksheet').reset();
  for(const id of ['prior','retell-input','reflection','new-words','interests','submission-article-title','submission-source-url'])recordsEl(id).value='';
  recordsEl('submission-article-consent').checked=false;
  for(const id of ['preparation','reading','retell-view','review-view','feedback-section'])recordsEl(id).hidden=true;
  recordsEl('training-context').hidden=true;
  recordsEl('records-section').hidden=false;resetRecordsPanel();recordsEl('records-heading').focus();await recordsLoad();
});
recordsEl('records-close').addEventListener('click',()=>{
  resetRecordsPanel();recordsEl('records-section').hidden=true;recordsEl('preparation').hidden=false;recordsEl('article-result').hidden=true;recordsEl('training-context').hidden=false;
  recordsEl('records-status').textContent='';recordsEl('analyze').focus();
});
recordsEl('records-refresh').addEventListener('click',()=>recordsLoad());
recordsEl('records-more').addEventListener('click',()=>recordsLoad(true));
recordsEl('records-versions').addEventListener('change',recordsCompare);
recordsEl('records-revisions-more').addEventListener('click',async()=>{
  if(!recordSelection || !recordsVisible() || articleSession)return;
  const generation=recordsGeneration,button=recordsEl('records-revisions-more'),id=recordSelection.submissionId;
  if(button.disabled)return;button.disabled=true;
  try{const result=await recordsIo().revisions(id,revisionCursor);if(recordsCurrent(generation))recordsAddVersions(result);}
  catch(error){if(recordsCurrent(generation))recordsError(error);}finally{button.disabled=false;}
});
