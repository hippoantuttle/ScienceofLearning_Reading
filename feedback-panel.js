'use strict';
const feedbackFields = [['mainIdea','feedback-main','중심 생각'],['primary','feedback-primary','핵심 정보'],['support','feedback-support','보조 정보'],['relation','feedback-relation','관계 설명'],['retell','feedback-retell','Retell']];
let feedbackState=null, feedbackGeneration=0;
const feedbackEl=id=>document.getElementById(id);
function resetFeedbackPanel(){
  feedbackGeneration++; feedbackState=null;
  feedbackEl('feedback-section').hidden=true; feedbackEl('feedback-article').value=''; feedbackEl('feedback-consent').checked=false;
  feedbackEl('feedback-request').disabled=true; feedbackEl('feedback-result').textContent=''; feedbackEl('feedback-status').textContent=''; feedbackEl('feedback-comparison').textContent='';
  for(const [,id] of feedbackFields) feedbackEl(id).value='';
}
function feedbackSubmissionReady(snapshot, flow){
  if(!snapshot || !articleSession || articleSession.fallback) return;
  feedbackGeneration++; feedbackState={snapshot,flow,article:articleSession.text,session:articleSession};
  feedbackEl('feedback-section').hidden=false; feedbackEl('feedback-article').value=articleSession.text;
  feedbackEl('feedback-consent').checked=false; feedbackEl('feedback-request').disabled=SubmissionConfig.feedbackTestEnabled!==true;
  feedbackEl('feedback-result').textContent=''; feedbackEl('feedback-comparison').textContent='';
  feedbackEl('feedback-status').textContent=SubmissionConfig.feedbackTestEnabled===true?'글과 제출 항목을 확인하세요.':'AI 피드백은 준비 중입니다.';
  for(const [field,id] of feedbackFields) feedbackEl(id).value=snapshot[field];
}
feedbackEl('feedback-compare').addEventListener('click',()=>{
  if(!feedbackState)return;
  feedbackEl('feedback-comparison').textContent=feedbackFields.map(([field,id,label])=>`${label}\n최초: ${feedbackState.snapshot[field]}\n수정: ${feedbackEl(id).value}`).join('\n\n');
});
feedbackEl('feedback-request').addEventListener('click',async()=>{
  const state=feedbackState, generation=feedbackGeneration, button=feedbackEl('feedback-request'), status=feedbackEl('feedback-status');
  if(button.disabled || !state)return;
  let timer;
  try{
    if(SubmissionConfig.feedbackTestEnabled!==true || !feedbackEl('feedback-consent').checked)throw new Error('글과 제출 답안 전송에 동의해 주세요.');
    if(articleSession!==state.session || feedbackEl('feedback-article').value!==state.article)throw new Error('연결한 글을 다시 확인하세요.');
    const token=state.flow.getToken(); if(!token)throw new Error('다시 로그인하세요.');
    const url=new URL(SubmissionConfig.aiEndpoint);
    if((url.protocol!=='https:' && !(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))||url.username||url.password||url.search||url.hash||url.pathname!=='/recommend')throw new Error('AI 서버 주소가 올바르지 않습니다.');
    url.pathname='/feedback'; const body=JSON.stringify({article:state.article,sessionId:state.snapshot.sessionId});
    if(state.article.length>12000 || new TextEncoder().encode(body).length>50000)throw new Error('글이 너무 깁니다.');
    button.disabled=true; status.textContent='피드백을 요청하고 있습니다.';
    const controller=new AbortController(); timer=setTimeout(()=>controller.abort(),15000);
    const response=await fetch(url.href,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body,credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
    if(!response.ok)throw new Error(response.status===429?'오늘 AI 사용 한도에 도달했습니다.':'AI 피드백 요청에 실패했습니다.');
    const result=await response.json(), suggestions=result?.feedback?.suggestions;
    if(result?.kind!=='feedback'||!Array.isArray(suggestions)||suggestions.length<1||suggestions.length>3||!suggestions.every(x=>typeof x==='string'&&x.trim()&&x.length<=500&&!/[<>]/.test(x)))throw new Error('AI 피드백 형식이 올바르지 않습니다.');
    if(generation!==feedbackGeneration)return;
    feedbackEl('feedback-result').textContent=suggestions.map((x,i)=>`${i+1}. ${x}`).join('\n'); status.textContent='참고용 피드백입니다. 직접 판단하고 수정하세요.';
  }catch(error){
    if(generation!==feedbackGeneration)return;
    const safe=['글과 제출 답안 전송에 동의해 주세요.','연결한 글을 다시 확인하세요.','다시 로그인하세요.','AI 서버 주소가 올바르지 않습니다.','글이 너무 깁니다.','오늘 AI 사용 한도에 도달했습니다.','AI 피드백 요청에 실패했습니다.','AI 피드백 형식이 올바르지 않습니다.'];
    status.textContent=safe.includes(error?.message)?error.message:'AI 피드백 요청을 완료하지 못했습니다.';
  }finally{clearTimeout(timer);if(generation===feedbackGeneration)button.disabled=SubmissionConfig.feedbackTestEnabled!==true;}
});
