'use strict';
// 상단 계정 바: AI 추천·제출·피드백이 공유하는 단일 로그인(panelFlow, submission-panel.js).
// 비밀번호는 시도 직후 비우고, 토큰·이메일은 패널 메모리에만 둔다.
const accountEl = id => document.getElementById(id);
function accountRender() {
  let identity = null;
  try { identity = typeof panelSubmissionFlow !== 'undefined' && panelSubmissionFlow?.getIdentity?.() || (typeof panelAccount !== 'undefined' && panelAccount?.identity) || null; }
  catch { identity = null; }
  accountEl('account-signed-in').hidden = !identity;
  accountEl('account-form').hidden = !!identity || SubmissionConfig.googleLoginEnabled===true;
  accountEl('account-google').hidden = !!identity || SubmissionConfig.googleLoginEnabled!==true;
  accountEl('account-identity').textContent = identity ? `로그인됨 · ${identity}` : '';
  return identity;
}
accountEl('account-form').addEventListener('submit', async (event) => {
  event?.preventDefault?.();
  const button = accountEl('ai-login');
  const password = accountEl('ai-password');
  const status = accountEl('account-status');
  if (button.disabled) return;
  if(SubmissionConfig.googleLoginEnabled===true)return;
  button.disabled = true;
  status.textContent = '로그인하고 있습니다.';
  globalThis.PanelUI?.tone(status,'warning');
  try {
    await panelFlow().signIn(accountEl('ai-email').value, password.value);
    status.textContent = '';
    accountRender();
    if(typeof recordsVisible==='function'&&recordsVisible()){resetRecordsPanel();await recordsLoad();}
  } catch (error) { status.textContent = error?.message || '로그인하지 못했습니다.';globalThis.PanelUI?.tone(status,'error'); }
  finally { password.value = ''; button.disabled = false; }
});
accountEl('account-logout').addEventListener('click', () => {
  const flow = typeof panelSubmissionFlow !== 'undefined' ? panelSubmissionFlow : null;
  if (flow?.hasPending?.()) {
    const message = flow.verifiedSnapshot?.()
      ? '로그아웃하면 제출 후 피드백과 직접 수정 화면이 초기화됩니다. 계속할까요?'
      : '저장 확인되지 않은 제출이 있습니다. 로그아웃하면 이 제출을 재시도할 수 없습니다. 계속할까요?';
    if (!confirm(message)) return;
  }
  panelSignOut();
  accountEl('account-status').textContent = '로그아웃했습니다.';
  globalThis.PanelUI?.tone(accountEl('account-status'),'success');
  accountRender();
  accountEl('ai-email').focus?.();
});
accountRender();

let currentGoogleLogin=null;
function cancelGoogleLogin(){currentGoogleLogin?.cancel();}
accountEl('account-google-login').addEventListener('click',async()=>{
  const button=accountEl('account-google-login'),status=accountEl('account-status');
  if(button.disabled||SubmissionConfig.googleLoginEnabled!==true)return;
  button.disabled=true;let flow;
  status.textContent='Google 계정 확인 창에서 로그인을 진행하세요.';
  try{
    flow=panelFlow();
    currentGoogleLogin??=GoogleAuth.create({baseUrl:SubmissionConfig.authUrl,publicKey:SubmissionConfig.publicKey});
    const session=await currentGoogleLogin();
    if(panelSubmissionFlow!==flow)return;
    const claim=async token=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(new URL('/rest/v1/rpc/claim_google_pilot_access',SubmissionConfig.authUrl).href,{method:'POST',headers:{apikey:SubmissionConfig.publicKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
        if(!response.ok)throw Error('Google 참여 승인 서버를 확인하지 못했습니다. 운영자에게 문의하세요.');
        return await response.json()===true;
      }finally{clearTimeout(timer);}
    };
    await flow.signInGoogle(session,claim);
    if(panelSubmissionFlow!==flow)return;
    panelAccount=null;resetRecordsPanel();
    status.textContent='';accountRender();
    if(typeof recordsVisible==='function'&&recordsVisible())await recordsLoad();
  }catch(error){
    if(flow&&panelSubmissionFlow!==flow)return;
    // Do not display arbitrary browser/network error text or callback URLs.
    const safe=['Google 로그인','확인된 Google','기존 제출은 같은 Google','사전 등록된 Google','Google 참여 승인'];
    status.textContent=safe.some(prefix=>error?.message?.startsWith(prefix))?error.message:'Google 로그인을 확인하지 못했습니다. 다시 시도하세요.';
    accountRender();globalThis.PanelUI?.tone(status,'error');
  }finally{button.disabled=false;}
});
