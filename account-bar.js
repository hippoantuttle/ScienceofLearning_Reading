'use strict';
// 상단 계정 바: AI 추천·제출·피드백이 공유하는 단일 로그인(panelFlow, submission-panel.js).
// 비밀번호는 시도 직후 비운다. Google 세션은 워커가 브라우저 종료 전까지만 보관한다.
const accountEl = id => document.getElementById(id);
// TASK-021: 로그인 폼은 기본으로 접어 두고, 헤더 「로그인」이나 저장·기록·AI처럼 로그인이 필요한 순간에만 펼친다.
let accountLoginOpen = false;
function accountIdentity() {
  try { return typeof panelSubmissionFlow !== 'undefined' && panelSubmissionFlow?.getIdentity?.() || (typeof panelAccount !== 'undefined' && panelAccount?.identity) || null; }
  catch { return null; }
}
function accountSignedIn() { return !!accountIdentity(); }
function accountRender() {
  const identity = accountIdentity();
  if (identity) accountLoginOpen = false;
  const login = accountEl('account-login'), toggle = accountEl('account-toggle');
  if (login) login.hidden = !!identity || !accountLoginOpen;
  if (toggle) { toggle.hidden = !!identity; toggle.textContent = accountLoginOpen ? '로그인 닫기' : '로그인'; toggle.setAttribute?.('aria-expanded', String(accountLoginOpen)); }
  accountEl('account-bar')?.classList?.toggle?.('idle', !identity && !accountLoginOpen);
  const hint = accountEl('submission-login-hint'); if (hint) hint.hidden = !!identity;
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
accountEl('account-logout').addEventListener('click', async () => {
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
  accountEl('account-toggle')?.focus?.();
  if (SubmissionConfig.googleLoginEnabled === true) {
    try {
      const result = await PanelSession.call('signOut');
      if (!result.revoked) accountEl('account-status').textContent = '이 브라우저에서 로그아웃했습니다. 서버 연결 문제로 원격 세션 종료는 확인하지 못했습니다.';
    } catch { accountEl('account-status').textContent = '로그아웃 처리를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.'; }
  }
});
// 로그인이 필요한 순간에 헤더 로그인 영역을 펼치고 첫 입력으로 포커스를 옮긴다.
function accountOpenLogin(message) {
  if (accountSignedIn()) return false;
  accountLoginOpen = true;
  accountRender();
  const status = accountEl('account-status');
  if (message && status) { status.textContent = message; globalThis.PanelUI?.tone(status,'warning'); }
  (SubmissionConfig.googleLoginEnabled === true ? accountEl('account-google-login') : accountEl('ai-email'))?.focus?.();
  return true;
}
accountEl('account-toggle')?.addEventListener('click', () => {
  if (accountLoginOpen) { accountLoginOpen = false; accountRender(); return; }
  accountOpenLogin();
});
accountEl('submission-login-open')?.addEventListener('click', () => accountOpenLogin('저장하려면 로그인하세요. 로그인 후 「동의하고 저장」을 다시 누르세요.'));
accountRender();

function cancelGoogleLogin(){if(typeof panelAuthEpoch!=='undefined')panelAuthEpoch++;}
accountEl('account-google-login').addEventListener('click',async()=>{
  const button=accountEl('account-google-login'),status=accountEl('account-status');
  if(button.disabled||SubmissionConfig.googleLoginEnabled!==true)return;
  button.disabled=true;let flow;
  status.textContent='Google 계정 확인 창에서 로그인을 진행하세요.';
  try{
    flow=panelFlow();
    const session=await PanelSession.call('signIn',{expectedUserId:flow.hasPending()?flow.getAccountId():undefined});
    if(panelSubmissionFlow!==flow)return;
    flow.resumeGoogle(session);
    if(panelSubmissionFlow!==flow)return;
    panelAccount=null;resetRecordsPanel();
    status.textContent='';accountRender();
    if(typeof recordsVisible==='function'&&recordsVisible())await recordsLoad();
  }catch(error){
    if(flow&&panelSubmissionFlow!==flow)return;
    // Do not display arbitrary browser/network error text or callback URLs.
    const safe=['Google 로그인','확인된 Google','기존 제출은 같은 Google','사전 등록된 Google','Google 참여 승인','로그인 확인 서비스','로그인이 만료'];
    status.textContent=safe.some(prefix=>error?.message?.startsWith(prefix))?error.message:'Google 로그인을 확인하지 못했습니다. 다시 시도하세요.';
    accountRender();globalThis.PanelUI?.tone(status,'error');
  }finally{button.disabled=false;}
});
if (typeof panelRestoreSession === 'function') void panelRestoreSession();
