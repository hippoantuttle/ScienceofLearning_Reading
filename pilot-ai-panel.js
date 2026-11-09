'use strict';
// 파일럿 AI 읽기 전 추천 패널. sidepanel.js의 recommendationGate·articleSession과
// submission-panel.js의 panelFlow를 공유한다(같은 로그인 세션 사용).
// 읽기 중 AI 개입 배제: 게이트가 읽기 시작 후·재요청·지연 응답을 막는다.
const PILOT_AI_TYPE_LABEL = { 'claim-evidence': '주장–근거', 'cause-effect': '원인–결과', 'problem-solution': '문제–해결', unspecified: '추천 없음 (직접 선택)' };
const PILOT_AI_SAFE_ERRORS = [...(AIContract.pilotMessages || []), 'AI 추천 서버 응답 시간이 초과되었습니다.', 'AI 응답 형식이 올바르지 않습니다.', 'AI 서버 주소가 올바르지 않습니다.', 'AI 추천 서버 요청이 실패했습니다.'];
function pilotAiEl(id) { return document.getElementById(id); }
function pilotAiClear() {
  pilotAiEl('ai-result').textContent = '';
  pilotAiEl('ai-result').hidden = true;
}
function pilotAiEnable() { pilotAiEl('ai-recommend').disabled = false; }
function resetPilotAi() {
  pilotAiClear();
  pilotAiEl('ai-recommend').disabled = true;
  pilotAiEl('ai-password').value = '';
  pilotAiEl('ai-status').textContent = '';
}
function pilotAiStartReading() {
  pilotAiClear();
  pilotAiEl('ai-password').value = '';
  pilotAiEl('ai-recommend').disabled = true;
  pilotAiEl('ai-status').textContent = '읽기 시작 후에는 AI 추천을 요청할 수 없습니다.';
}
pilotAiEl('ai-login').addEventListener('click', async () => {
  const password = pilotAiEl('ai-password');
  const status = pilotAiEl('ai-status');
  try {
    const flow = panelFlow();
    await flow.signIn(pilotAiEl('ai-email').value, password.value);
    status.textContent = '로그인했습니다.';
  } catch (error) { status.textContent = error?.message || '로그인하지 못했습니다.'; }
  finally { password.value = ''; }
});
pilotAiEl('ai-recommend').addEventListener('click', async () => {
  const button = pilotAiEl('ai-recommend');
  const status = pilotAiEl('ai-status');
  if (button.disabled) return;
  try {
    if (!articleSession) throw new Error('먼저 글을 연결하세요.');
    if (!SubmissionConfig.aiEndpoint) throw new Error('AI 추천 서버가 아직 설정되지 않았습니다.');
    const token = panelFlow().getToken();
    if (!token) throw new Error('먼저 로그인하세요.');
    button.disabled = true;
    status.textContent = 'AI 추천을 요청하고 있습니다.';
    const data = await recommendationGate.request(() => AIContract.requestPilot(token, SubmissionConfig.aiEndpoint));
    if (!data) return; // 읽기 시작 또는 새 시도로 폐기된 응답
    const result = pilotAiEl('ai-result');
    result.textContent = `AI 추천 시험 결과 (읽은 글과 무관한 가상 예문 기반)\n${data.terms.map(item => `${item.term}: ${item.definition}`).join('\n')}\n${data.background.join('\n')}\n구조도 유형: ${PILOT_AI_TYPE_LABEL[data.structureType]} (참고용, 직접 선택)`;
    result.hidden = false;
    status.textContent = '결과는 참고용이며 자동으로 입력되지 않습니다.';
  } catch (error) {
    const message = error?.message || '';
    const known = PILOT_AI_SAFE_ERRORS.includes(message) || ['먼저 글을 연결하세요.', 'AI 추천 서버가 아직 설정되지 않았습니다.', '먼저 로그인하세요.', '추천은 읽기 전 한 번만 요청할 수 있습니다.'].includes(message);
    status.textContent = `${known ? message : 'AI 추천 서버에 연결하지 못했습니다.'} 자료 없이 계속할 수 있습니다.`;
  }
});
