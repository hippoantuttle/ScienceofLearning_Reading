'use strict';
let panelSubmissionFlow=null;
let panelAccount=null; // {token, identity}: 새 시도로 flow를 다시 만들 때 로그인을 이어 쓰기 위한 패널 메모리 값.
function rememberPanelAccount(){const flow=panelSubmissionFlow;if(flow&&typeof flow.getToken==='function'&&flow.getToken()&&typeof flow.getIdentity==='function')panelAccount={token:flow.getToken(),identity:flow.getIdentity(),accountId:flow.getAccountId?.()??null,authKind:flow.getAuthKind?.()??'password'};}
function resetPanelSubmission(){rememberPanelAccount();panelSubmissionFlow=null;if(typeof resetFeedbackPanel==='function')resetFeedbackPanel();const status=document.getElementById('submission-status');if(status)status.textContent='';const context=document.getElementById('training-context');if(context?.dataset)delete context.dataset.saved;}
function panelSignOut(){if(typeof guidedInvalidate==='function')guidedInvalidate();if(typeof draftDiscard==='function')draftDiscard();if(typeof cancelGoogleLogin==='function')cancelGoogleLogin();panelAccount=null;panelSubmissionFlow=null;if(typeof resetFeedbackPanel==='function')resetFeedbackPanel();if(typeof resetRecordsPanel==='function')resetRecordsPanel();const status=document.getElementById('submission-status');if(status)status.textContent='';}
function panelSubmissionPending(){return !!panelSubmissionFlow?.hasPending?.();}
function panelExpireAccount(){if(typeof guidedInvalidate==='function')guidedInvalidate();panelAccount=null;panelSubmissionFlow?.expire?.();if(typeof accountRender==='function')accountRender();}
function panelFlow(){if(!SubmissionConfig.authUrl||!SubmissionConfig.publicKey||!SubmissionConfig.endpoint)throw Error('제출 서버가 아직 설정되지 않았습니다.');if(!panelSubmissionFlow){const login=SubmissionAuth.createLogin({baseUrl:SubmissionConfig.authUrl,publicKey:SubmissionConfig.publicKey});const membership=SubmissionHttp.createMembershipCheck({baseUrl:SubmissionConfig.authUrl,publicKey:SubmissionConfig.publicKey});const flow=SubmissionFlow.createFlow({login,adapter:token=>({...SubmissionHttp.createHttpAdapter({endpoint:SubmissionConfig.endpoint,getToken:options=>SubmissionConfig.googleLoginEnabled===true?panelFreshToken(flow,options):Promise.resolve(token)}),checkMember:()=>membership(token)}),newId:()=>crypto.randomUUID()});panelSubmissionFlow=flow;if(panelAccount&&typeof flow.adopt==='function')flow.adopt(panelAccount.token,panelAccount.identity,panelAccount.accountId,panelAccount.authKind);}return panelSubmissionFlow;}
document.getElementById('submission-send').addEventListener('click',async()=>{
 const button=document.getElementById('submission-send'),status=document.getElementById('submission-status');
 if(button.disabled)return;button.disabled=true;
 let flow;
 try{
  flow=panelFlow();const submittedSession=typeof articleSession==='undefined'?null:articleSession;
  // TASK-021: 「동의하고 저장」 버튼 클릭이 저장 동의다(별도 체크박스 없음).
  let receipt;
  if(flow.hasPending())receipt=await flow.retry();
  else{const v=id=>document.getElementById(id).value;const includeArticle=document.getElementById('submission-article-consent')?.checked===true;const answers=typeof worksheetSubmissionValues==='function'?worksheetSubmissionValues():{structureType:v('structure'),mainIdea:v('main-idea'),primary:v('primary'),support:v('support'),relation:v('relation')};receipt=await flow.submit({...answers,retell:v('retell-input'),reflection:v('reflection'),newWords:v('new-words'),interests:v('interests'),rechecked,...(includeArticle?{articleTitle:v('submission-article-title'),sourceUrl:v('submission-source-url')}:{})});}
  if(panelSubmissionFlow!==flow || (typeof articleSession!=='undefined' && articleSession!==submittedSession))return;
  const savedTime=Number.isFinite(Date.parse(receipt.savedAt))?new Date(receipt.savedAt).toLocaleString('ko-KR'):receipt.savedAt;
  status.textContent=`저장했습니다. (${savedTime})`;
  globalThis.PanelUI?.tone(status,'success');
  const context=document.getElementById('training-context');if(context?.dataset){context.dataset.saved='true';if(typeof PanelShell!=='undefined')PanelShell.renderStepper(document);}
  // TASK-019 v2: PDF 읽기는 피드백·수정 화면 없이 저장·재조회 확인까지만 진행한다.
  if(submittedSession?.kind==='pdf'){status.textContent+=' 「내 기록」에서 확인할 수 있습니다.';return;}
  if(typeof feedbackSubmissionReady==='function'&&typeof flow.verifiedSnapshot==='function')feedbackSubmissionReady(flow.verifiedSnapshot(),flow,receipt);
 }catch(e){if(e.status===401 && panelSubmissionFlow===flow)panelExpireAccount();const needLogin=e.message==='로그인이 필요합니다.';if((needLogin||e.status===401)&&typeof accountOpenLogin==='function')accountOpenLogin(needLogin?'저장하려면 로그인하세요.':'');status.textContent=(needLogin?'로그인한 뒤 「동의하고 저장」을 다시 누르세요.':(e.message||'저장하지 못했습니다.'))+' 작성 내용은 그대로 유지됩니다.'+(flow?.hasPending?.()?' 다시 누르면 처음 보낸 내용으로 재시도합니다.':'');globalThis.PanelUI?.tone(status,'error');}
 finally{button.disabled=false;}
});
