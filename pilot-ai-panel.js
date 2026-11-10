'use strict';
// 파일럿 AI 읽기 전 추천 패널. sidepanel.js의 recommendationGate·articleSession과
// submission-panel.js의 panelFlow를 공유한다(상단 계정 바 account-bar.js의 로그인 세션 사용).
// 읽기 중 AI 개입 배제: 게이트가 읽기 시작 후·재요청·지연 응답을 막는다.
const PILOT_AI_TYPE_LABEL = { 'claim-evidence': '주장–근거', 'cause-effect': '원인–결과', 'problem-solution': '문제–해결', unspecified: '추천 없음 (직접 선택)' };
const PILOT_AI_SAFE_ERRORS = [...(AIContract.pilotMessages || []), 'AI 추천 서버 응답 시간이 초과되었습니다.', 'AI 응답 형식이 올바르지 않습니다.', 'AI 서버 주소가 올바르지 않습니다.', 'AI 추천 서버 요청이 실패했습니다.'];
function pilotAiEl(id) { return document.getElementById(id); }
function pilotAiClear() {
  pilotAiEl('ai-result').textContent = '';
  pilotAiEl('ai-result').hidden = true;
}
function pilotAiEnable() {
  // @development-start
  pilotAiEl('ai-recommend').disabled = false;
  // @development-end
  pilotAiEl('article-ai-preview').value = articleSession?.fallback ? '' : (articleSession?.text || '');
  pilotAiEl('article-ai-consent').checked = false;
  pilotAiEl('article-ai-recommend').disabled = !SubmissionConfig.articleTestEnabled || !!articleSession?.fallback;
  pilotAiEl('article-ai-status').textContent = articleSession?.fallback ? '본문 영역을 식별하지 못해 실제 글 전송을 차단했습니다.' : (!SubmissionConfig.articleTestEnabled ? '실제 글 추천은 아직 준비 중입니다.' : '전송할 본문을 확인하세요.');
  globalThis.PanelUI?.tone(pilotAiEl('article-ai-status'),'warning');
}
function resetPilotAi() {
  pilotAiClear();
  // @development-start
  pilotAiEl('ai-recommend').disabled = true;
  // @development-end
  pilotAiEl('ai-password').value = '';
  // @development-start
  pilotAiEl('ai-status').textContent = '';
  // @development-end
  pilotAiEl('article-ai-preview').value = '';
  pilotAiEl('article-ai-consent').checked = false;
  pilotAiEl('article-ai-recommend').disabled = true;
  pilotAiEl('article-ai-status').textContent = '';
}
function pilotAiStartReading() {
  pilotAiClear();
  pilotAiEl('ai-password').value = '';
  // @development-start
  pilotAiEl('ai-recommend').disabled = true;
  // @development-end
  // @development-start
  pilotAiEl('ai-status').textContent = '읽기 시작 후에는 AI 추천을 요청할 수 없습니다.';
  // @development-end
  pilotAiEl('article-ai-preview').value = '';
  pilotAiEl('article-ai-consent').checked = false;
  pilotAiEl('article-ai-recommend').disabled = true;
}
pilotAiEl('article-ai-recommend').addEventListener('click', async () => {
  const button = pilotAiEl('article-ai-recommend');
  const status = pilotAiEl('article-ai-status');
  if (button.disabled) return;
  try {
    if (!SubmissionConfig.articleTestEnabled || !articleSession || articleSession.fallback) throw new Error('실제 글 추천을 사용할 수 없습니다.');
    if (!pilotAiEl('article-ai-consent').checked) throw new Error('전송할 본문 확인과 동의가 필요합니다.');
    const session = articleSession;
    const article = session.text;
    if (pilotAiEl('article-ai-preview').value !== article) throw new Error('전송할 본문을 다시 확인하세요.');
    const token = panelFlow().getToken();
    if (!token) throw new Error('먼저 로그인하세요.');
    await validateBoundTab();
    if (articleSession !== session || !pilotAiEl('article-ai-consent').checked || pilotAiEl('article-ai-preview').value !== article) throw new Error('전송할 본문을 다시 확인하세요.');
    button.disabled = true;
    status.textContent = 'AI 추천을 요청하고 있습니다.';
    globalThis.PanelUI?.tone(status,'warning');
    const data = await recommendationGate.request(() => AIContract.requestPilot(token, SubmissionConfig.aiEndpoint, {article}));
    if (!data) return;
    const result = pilotAiEl('ai-result');
    result.textContent = `실제 글 기반 추천\n${data.terms.map(item => `${item.term}: ${item.definition}`).join('\n')}\n${data.background.join('\n')}\n구조도 유형: ${PILOT_AI_TYPE_LABEL[data.structureType]} (참고용, 직접 선택)`;
    result.hidden = false;
    status.textContent = '추천 결과가 아래에 표시됐습니다. 참고용이며 자동으로 입력되지 않습니다.';
    globalThis.PanelUI?.tone(status,'success');
  } catch (error) {
    const safe = [...PILOT_AI_SAFE_ERRORS, '실제 글 추천을 사용할 수 없습니다.', '전송할 본문 확인과 동의가 필요합니다.', '전송할 본문을 다시 확인하세요.', '먼저 로그인하세요.', '글 본문을 확인하세요.', '추천은 읽기 전 한 번만 요청할 수 있습니다.'];
    status.textContent = safe.includes(error?.message) ? error.message : 'AI 추천 요청을 완료하지 못했습니다.';
    globalThis.PanelUI?.tone(status,'error');
  } finally { if (allowLocalRepeatedRecommendations && recommendationGate.canRequest() && articleSession && !articleSession.fallback) button.disabled = false; }
});
// @development-start
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
    globalThis.PanelUI?.tone(status,'warning');
    const data = await recommendationGate.request(() => AIContract.requestPilot(token, SubmissionConfig.aiEndpoint));
    if (!data) return; // 읽기 시작 또는 새 시도로 폐기된 응답
    const result = pilotAiEl('ai-result');
    result.textContent = `AI 추천 시험 결과 (읽은 글과 무관한 가상 예문 기반)\n${data.terms.map(item => `${item.term}: ${item.definition}`).join('\n')}\n${data.background.join('\n')}\n구조도 유형: ${PILOT_AI_TYPE_LABEL[data.structureType]} (참고용, 직접 선택)`;
    result.hidden = false;
    status.textContent = '추천 결과가 아래에 표시됐습니다. 참고용이며 자동으로 입력되지 않습니다.';
    globalThis.PanelUI?.tone(status,'success');
  } catch (error) {
    const message = error?.message || '';
    const known = PILOT_AI_SAFE_ERRORS.includes(message) || ['먼저 글을 연결하세요.', 'AI 추천 서버가 아직 설정되지 않았습니다.', '먼저 로그인하세요.', '추천은 읽기 전 한 번만 요청할 수 있습니다.'].includes(message);
    status.textContent = `${known ? message : 'AI 추천 서버에 연결하지 못했습니다.'} 자료 없이 계속할 수 있습니다.`;
    globalThis.PanelUI?.tone(status,'error');
  } finally { if (allowLocalRepeatedRecommendations && recommendationGate.canRequest() && articleSession) button.disabled = false; }
});

// @development-end
