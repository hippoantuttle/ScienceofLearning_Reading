'use strict';
let panelSubmissionFlow=null;
let panelAccount=null; // {token, identity}: 새 시도로 flow를 다시 만들 때 로그인을 이어 쓰기 위한 패널 메모리 값.
function rememberPanelAccount(){const flow=panelSubmissionFlow;if(flow&&typeof flow.getToken==='function'&&flow.getToken()&&typeof flow.getIdentity==='function')panelAccount={token:flow.getToken(),identity:flow.getIdentity(),accountId:flow.getAccountId?.()??null,authKind:flow.getAuthKind?.()??'password'};}
function resetPanelSubmission(){rememberPanelAccount();panelSubmissionFlow=null;if(typeof resetFeedbackPanel==='function')resetFeedbackPanel();const status=document.getElementById('submission-status');if(status)status.textContent='';const consent=document.getElementById('submission-consent');if(consent)consent.checked=false;}
function panelSignOut(){if(typeof cancelGoogleLogin==='function')cancelGoogleLogin();panelAccount=null;panelSubmissionFlow=null;if(typeof resetFeedbackPanel==='function')resetFeedbackPanel();if(typeof resetRecordsPanel==='function')resetRecordsPanel();const status=document.getElementById('submission-status');if(status)status.textContent='';}
function panelExpireAccount(){panelAccount=null;panelSubmissionFlow?.expire?.();if(typeof accountRender==='function')accountRender();}
function panelFlow(){if(!SubmissionConfig.authUrl||!SubmissionConfig.publicKey||!SubmissionConfig.endpoint)throw Error('제출 서버가 아직 설정되지 않았습니다.');if(!panelSubmissionFlow){const login=SubmissionAuth.createLogin({baseUrl:SubmissionConfig.authUrl,publicKey:SubmissionConfig.publicKey});const membership=SubmissionHttp.createMembershipCheck({baseUrl:SubmissionConfig.authUrl,publicKey:SubmissionConfig.publicKey});panelSubmissionFlow=SubmissionFlow.createFlow({login,adapter:token=>({...SubmissionHttp.createHttpAdapter({endpoint:SubmissionConfig.endpoint,getToken:async()=>token}),checkMember:()=>membership(token)}),newId:()=>crypto.randomUUID()});if(panelAccount&&typeof panelSubmissionFlow.adopt==='function')panelSubmissionFlow.adopt(panelAccount.token,panelAccount.identity,panelAccount.accountId,panelAccount.authKind);}return panelSubmissionFlow;}
document.getElementById('submission-send').addEventListener('click',async()=>{
 const button=document.getElementById('submission-send'),status=document.getElementById('submission-status');
 if(button.disabled)return;button.disabled=true;
 let flow;
 try{
  flow=panelFlow();const submittedSession=typeof articleSession==='undefined'?null:articleSession;
  if(!document.getElementById('submission-consent').checked)throw Error('제출 항목을 확인하고 동의해 주세요.');
  let receipt;
  if(flow.hasPending())receipt=await flow.retry();
  else{const v=id=>document.getElementById(id).value;const includeArticle=document.getElementById('submission-article-consent')?.checked===true;receipt=await flow.submit({structureType:v('structure'),mainIdea:v('main-idea'),primary:v('primary'),support:v('support'),relation:v('relation'),retell:v('retell-input'),reflection:v('reflection'),newWords:v('new-words'),interests:v('interests'),rechecked,...(includeArticle?{articleTitle:v('submission-article-title'),sourceUrl:v('submission-source-url')}:{})});}
  if(panelSubmissionFlow!==flow || (typeof articleSession!=='undefined' && articleSession!==submittedSession))return;
  const savedTime=Number.isFinite(Date.parse(receipt.savedAt))?new Date(receipt.savedAt).toLocaleString('ko-KR'):receipt.savedAt;
  status.textContent=`제출한 답안의 저장 및 재조회 확인이 완료되었습니다. 저장 시각: ${savedTime}`;
  globalThis.PanelUI?.tone(status,'success');
  if(typeof feedbackSubmissionReady==='function'&&typeof flow.verifiedSnapshot==='function')feedbackSubmissionReady(flow.verifiedSnapshot(),flow,receipt);
 }catch(e){if(e.status===401 && panelSubmissionFlow===flow)panelExpireAccount();status.textContent=(e.message==='로그인이 필요합니다.'?'상단에서 로그인한 뒤 다시 제출하세요.':(e.message||'제출 실패'))+' 작성 내용은 유지됩니다. 이미 전송을 시작했다면 재시도는 최초 제출 내용으로 진행됩니다.';globalThis.PanelUI?.tone(status,'error');}
 finally{button.disabled=false;}
});
