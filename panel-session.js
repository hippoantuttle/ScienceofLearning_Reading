'use strict';
// No refresh tokens in the panel. Only the authentication worker talks to Auth.
const PanelSession = (() => {
  async function call(action, options = {}) {
    let response;
    try { response = await chrome.runtime.sendMessage({type:'reading-auth', action, ...options}); }
    catch { throw Error('로그인 확인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'); }
    if (!response?.ok) throw Object.assign(Error(response?.message || '로그인 확인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'), {status:response?.status, code:response?.code});
    return response.value;
  }
  return {call};
})();
async function panelFreshToken(flow, options = {}) {
  if (SubmissionConfig.googleLoginEnabled !== true) return flow.getToken();
  const expectedUserId = flow.getAccountId?.();
  try {
    const session = await PanelSession.call('get', {expectedUserId, ...options});
    if (!session) { panelExpireAccount(); return null; }
    if (flow !== panelSubmissionFlow) throw Error('Google 로그인 시도가 종료되었습니다. 다시 로그인하세요.');
    flow.resumeGoogle(session);
    accountRender();
    return session.accessToken;
  } catch (error) {
    if ([401,403,409].includes(error.status) && flow === panelSubmissionFlow) panelExpireAccount();
    throw error;
  }
}
let panelAuthEpoch = 0;
async function panelRestoreSession() {
  if (SubmissionConfig.googleLoginEnabled !== true) return;
  const epoch = panelAuthEpoch, flow = panelFlow();
  try {
    const session = await PanelSession.call('get', {expectedUserId:flow.getAccountId?.()});
    if (epoch !== panelAuthEpoch || flow !== panelSubmissionFlow) return;
    if (session) { flow.resumeGoogle(session); panelAccount = null; }
    else panelExpireAccount();
    accountRender();
  } catch (error) {
    if (epoch !== panelAuthEpoch || flow !== panelSubmissionFlow) return;
    if ([401,403,409].includes(error.status)) panelExpireAccount();
    document.getElementById('account-status').textContent = error.message;
  }
}
if (globalThis.chrome?.runtime?.onMessage) chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'reading-auth-changed' || sender?.id !== chrome.runtime.id || sender.tab ||
      (sender.url && sender.url !== chrome.runtime.getURL('background.js'))) return;
  panelAuthEpoch++;
  panelExpireAccount();
  resetRecordsPanel();
  if (message.event === 'signed-in') void panelRestoreSession();
});
