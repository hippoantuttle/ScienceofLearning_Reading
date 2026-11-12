'use strict';
const feedbackFields = [['mainIdea','feedback-main','중심 생각'],['primary','feedback-primary','핵심 정보'],['support','feedback-support','보조 정보'],['relation','feedback-relation','왜 이렇게 연결했나요? (선택)'],['retell','feedback-retell','다시 말하기(Retell)']];
let feedbackState=null, feedbackGeneration=0;
const feedbackEl=id=>document.getElementById(id);
function resetFeedbackPanel(){
  feedbackGeneration++; feedbackState=null;
  feedbackEl('feedback-section').hidden=true; feedbackEl('feedback-article').value=''; feedbackSetCard(false);
  feedbackEl('feedback-request').disabled=true; feedbackEl('feedback-result').textContent=''; feedbackEl('feedback-status').textContent=''; feedbackEl('feedback-comparison').textContent='';
  for(const [,id] of feedbackFields) feedbackEl(id).value='';
  feedbackEl('revision-status').textContent=''; feedbackEl('revision-save').disabled=true;
}
function feedbackSetCard(visible){const card=feedbackEl('feedback-ai-card');if(!card)return;card.hidden=!visible;if(!visible)card.open=false;}
function feedbackSubmissionReady(snapshot, flow, receipt){
  if(!snapshot || !articleSession) return;
  feedbackGeneration++; feedbackState={snapshot,flow,article:articleSession.text,session:articleSession,savedAnswers:RecordAnswers(snapshot)};
  if(receipt?.submissionId && typeof RecordClient!=='undefined')feedbackState.saver=RecordClient.createSaver({io:RecordClient.create({endpoint:SubmissionConfig.endpoint,getToken:options=>typeof panelFreshToken==='function'?panelFreshToken(flow,options):flow.getToken()}),recordId:receipt.submissionId,newId:()=>crypto.randomUUID()});
  feedbackEl('revision-save').disabled=!feedbackState.saver;
  feedbackEl('revision-status').textContent='';
  feedbackEl('feedback-section').hidden=false; feedbackEl('feedback-article').value=articleSession.fallback?'':articleSession.text;
  // TASK-021: AI 피드백을 쓸 수 없으면 카드 자체를 숨긴다. 카드 안 버튼 클릭이 전송 동의다.
  const available=SubmissionConfig.feedbackTestEnabled===true&&!articleSession.fallback;
  feedbackEl('feedback-request').disabled=!available; feedbackSetCard(available);
  feedbackEl('feedback-result').textContent=''; feedbackEl('feedback-comparison').textContent='';
  feedbackEl('feedback-status').textContent='';
  for(const [field,id] of feedbackFields) feedbackEl(id).value=snapshot[field];
}
feedbackEl('feedback-compare').addEventListener('click',()=>{
  if(!feedbackState)return;
  const display=(field,value)=>field==='relation'&&!value.trim()?'작성하지 않음 (선택)':value;
  feedbackEl('feedback-comparison').textContent=feedbackFields.map(([field,id,label])=>`${label}\n최초: ${display(field,feedbackState.snapshot[field])}\n수정: ${display(field,feedbackEl(id).value)}`).join('\n\n');
});
// 중급 루브릭 피드백(server/ai/feedback.mjs parseFeedback와 같은 형식). 점수는 받지도 표시하지도 않는다.
const FEEDBACK_CRITERIA=['핵심 내용 포함','변형/자기 언어화','정확성','구조/응집성'];
function feedbackValid(f){
  const keys=(o,k)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===[...k].sort().join('|');
  const text=(v,max,empty=false)=>typeof v==='string'&&(empty||v.trim().length>0)&&v.length<=max&&!/[<>]/.test(v);
  const list=(v,min,max,ok)=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(ok);
  return keys(f,['overall','criteria','strengths','improvements','missingIdea'])&&text(f.overall,400)
    &&list(f.criteria,4,4,(c,i)=>keys(c,['name','reason'])&&c.name===FEEDBACK_CRITERIA[i]&&text(c.reason,300))
    &&list(f.strengths,1,2,s=>keys(s,['quote','comment'])&&text(s.quote,300)&&text(s.comment,400))
    &&list(f.improvements,1,2,s=>keys(s,['quote','direction'])&&text(s.quote,300)&&text(s.direction,500))
    &&text(f.missingIdea,300,true);
}
function feedbackFormat(f){
  const parts=['총평\n'+f.overall,'항목별 근거\n'+f.criteria.map(c=>`· ${c.name}: ${c.reason}`).join('\n'),
    '잘한 점\n'+f.strengths.map((s,i)=>`${i+1}. "${s.quote}"\n   ${s.comment}`).join('\n'),
    '개선 제안\n'+f.improvements.map((s,i)=>`${i+1}. "${s.quote}"\n   ${s.direction}`).join('\n')];
  if(f.missingIdea)parts.push('다시 살펴볼 핵심 아이디어\n'+f.missingIdea);
  return parts.join('\n\n');
}
function RecordAnswers(snapshot){return Object.fromEntries(feedbackFields.map(([field])=>[field,snapshot[field]]));}
function feedbackDirty(){return !!feedbackState && feedbackFields.some(([field,id])=>{
  const value=feedbackEl(id).value;
  return (field==='relation'&&!value.trim()?'':value)!==feedbackState.savedAnswers[field];
});}
for(const [,id] of feedbackFields)feedbackEl(id).addEventListener('input',()=>{feedbackEl('revision-status').textContent=feedbackDirty()?'미저장 수정이 있습니다.':'';globalThis.PanelUI?.tone(feedbackEl('revision-status'),'warning');});
feedbackEl('revision-save').addEventListener('click',async()=>{
  const state=feedbackState,generation=feedbackGeneration,button=feedbackEl('revision-save');
  if(!state?.saver || button.disabled)return;
  button.disabled=true;
  feedbackEl('revision-status').textContent=state.saver.hasPending()?'이전 저장 요청을 재확인하고 있습니다.':'수정본을 저장하고 있습니다.';
  globalThis.PanelUI?.tone(feedbackEl('revision-status'),'warning');
  try{
    const answers=Object.fromEntries(feedbackFields.map(([field,id])=>[field,feedbackEl(id).value]));
    const saved=await state.saver.save(answers);
    if(generation!==feedbackGeneration)return;
    state.savedAnswers=saved.answers;
    feedbackEl('revision-status').textContent='저장 및 재조회 확인: '+saved.savedAt+(feedbackDirty()?' · 이후 편집한 내용은 아직 저장되지 않았습니다.':'');
    globalThis.PanelUI?.tone(feedbackEl('revision-status'),feedbackDirty()?'warning':'success');
  }catch(error){
    if(generation!==feedbackGeneration)return;
    if(error.status===401 && typeof panelExpireAccount==='function')panelExpireAccount();
    const setupError=['records_api_unavailable','records_schema_missing'].includes(error.code);
    feedbackEl('revision-status').textContent=(error.message||'수정본 저장 확인 실패')+(setupError?' 입력은 유지됩니다. 서버 준비 후 같은 요청으로 다시 저장하세요.':' 입력은 유지됩니다. 재시도는 이전 요청 내용으로 진행합니다.');
    globalThis.PanelUI?.tone(feedbackEl('revision-status'),'error');
  }finally{if(generation===feedbackGeneration)button.disabled=false;}
});
feedbackEl('feedback-request').addEventListener('click',async()=>{
  const state=feedbackState, generation=feedbackGeneration, button=feedbackEl('feedback-request'), status=feedbackEl('feedback-status');
  if(button.disabled || !state)return;
  let timer;
  try{
    if(SubmissionConfig.feedbackTestEnabled!==true || state.session.fallback)throw new Error('AI 피드백을 사용할 수 없습니다.');
    if(articleSession!==state.session || feedbackEl('feedback-article').value!==state.article)throw new Error('연결한 글을 다시 확인하세요.');
    const token=typeof panelFreshToken==='function'?await panelFreshToken(state.flow):state.flow.getToken(); if(!token){if(typeof accountOpenLogin==='function')accountOpenLogin('AI 피드백을 받으려면 다시 로그인하세요.');throw new Error('다시 로그인하세요.');}
    if(generation!==feedbackGeneration||articleSession!==state.session)return;
    const url=new URL(SubmissionConfig.aiEndpoint);
    if((url.protocol!=='https:' && !(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))||url.username||url.password||url.search||url.hash||url.pathname!=='/recommend')throw new Error('AI 서버 주소가 올바르지 않습니다.');
    url.pathname='/feedback'; const body=JSON.stringify({article:state.article,sessionId:state.snapshot.sessionId});
    if(state.article.length>12000 || new TextEncoder().encode(body).length>50000)throw new Error('글이 너무 깁니다.');
    button.disabled=true; status.textContent='피드백을 요청하고 있습니다. 최대 1분쯤 걸릴 수 있습니다.';
    globalThis.PanelUI?.tone(status,'warning');
    const controller=new AbortController(); timer=setTimeout(()=>controller.abort(),60000);
    const response=await fetch(url.href,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body,credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
    if(!response.ok)throw new Error(response.status===429?'오늘 AI 사용 한도에 도달했습니다.':'AI 피드백 요청에 실패했습니다.');
    const result=await response.json();
    if(result?.kind!=='feedback'||!feedbackValid(result.feedback))throw new Error('AI 피드백 형식이 올바르지 않습니다.');
    if(generation!==feedbackGeneration||state.flow.getToken()!==token)return;
    feedbackEl('feedback-result').textContent=feedbackFormat(result.feedback); status.textContent='참고용 피드백입니다. 직접 판단하고 수정하세요.';
    globalThis.PanelUI?.tone(status,'success');
  }catch(error){
    if(generation!==feedbackGeneration)return;
    const safe=['AI 피드백을 사용할 수 없습니다.','연결한 글을 다시 확인하세요.','다시 로그인하세요.','AI 서버 주소가 올바르지 않습니다.','글이 너무 깁니다.','오늘 AI 사용 한도에 도달했습니다.','AI 피드백 요청에 실패했습니다.','AI 피드백 형식이 올바르지 않습니다.'];
    status.textContent=safe.includes(error?.message)?error.message:'AI 피드백 요청을 완료하지 못했습니다.';
    globalThis.PanelUI?.tone(status,'error');
  }finally{clearTimeout(timer);if(generation===feedbackGeneration)button.disabled=SubmissionConfig.feedbackTestEnabled!==true||state.session.fallback;}
});
