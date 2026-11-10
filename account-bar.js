'use strict';
// 상단 계정 바: AI 추천·제출·피드백이 공유하는 단일 로그인(panelFlow, submission-panel.js).
// 비밀번호는 시도 직후 비우고, 토큰·이메일은 패널 메모리에만 둔다.
const accountEl = id => document.getElementById(id);
function accountRender() {
  let identity = null;
  try { identity = typeof panelSubmissionFlow !== 'undefined' && panelSubmissionFlow?.getIdentity?.() || (typeof panelAccount !== 'undefined' && panelAccount?.identity) || null; }
  catch { identity = null; }
  accountEl('account-signed-in').hidden = !identity;
  accountEl('account-form').hidden = !!identity;
  accountEl('account-identity').textContent = identity ? `로그인됨 · ${identity}` : '';
  return identity;
}
accountEl('account-form').addEventListener('submit', async (event) => {
  event?.preventDefault?.();
  const button = accountEl('ai-login');
  const password = accountEl('ai-password');
  const status = accountEl('account-status');
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = '로그인하고 있습니다.';
  try {
    await panelFlow().signIn(accountEl('ai-email').value, password.value);
    status.textContent = '';
    accountRender();
    if(typeof recordsVisible==='function'&&recordsVisible()){resetRecordsPanel();await recordsLoad();}
  } catch (error) { status.textContent = error?.message || '로그인하지 못했습니다.'; }
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
  accountRender();
  accountEl('ai-email').focus?.();
});
accountRender();
