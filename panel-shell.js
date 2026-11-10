'use strict';
// 패널 공통 화면 상태: 개발자 도구 노출(TASK-014 D-1)과 단계 표시.
// 화면 표시만 담당하며 AI 요청 차단은 각 패널의 게이트가 계속 담당한다.
const PanelShell = (() => {
  const STEPS = ['preparation', 'reading', 'retell-view', 'review-view', 'feedback-section'];
  function devToolsEnabled(config, contract) {
    return !!(config && contract && typeof contract.isLoopbackEndpoint === 'function' && contract.isLoopbackEndpoint(config.aiEndpoint));
  }
  function applyDevTools(doc, enabled) {
    for (const element of doc.querySelectorAll('.dev-only')) {
      element.hidden = !enabled;
      if (enabled) element.removeAttribute('inert'); else element.setAttribute('inert', '');
    }
  }
  // 피드백 영역은 정리·제출 화면과 함께 보이므로, 보이는 단계 중 가장 뒤의 단계를 현재 단계로 본다.
  function currentStep(isVisible) {
    let current = STEPS[0];
    for (const step of STEPS) if (isVisible(step)) current = step;
    return current;
  }
  function renderStepper(doc) {
    const current = currentStep(id => { const el = doc.getElementById(id); return !!el && !el.hidden; });
    const index = STEPS.indexOf(current);
    for (const item of doc.querySelectorAll('#stepper [data-step]')) {
      const position = STEPS.indexOf(item.dataset.step);
      if (position === index) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      item.classList.toggle('done', position < index);
    }
    return current;
  }
  function start(doc) {
    applyDevTools(doc, devToolsEnabled(typeof SubmissionConfig === 'undefined' ? null : SubmissionConfig, typeof AIContract === 'undefined' ? null : AIContract));
    renderStepper(doc);
    const observer = new MutationObserver(() => renderStepper(doc));
    for (const id of STEPS) { const el = doc.getElementById(id); if (el) observer.observe(el, {attributes: true, attributeFilter: ['hidden']}); }
  }
  return {STEPS, devToolsEnabled, applyDevTools, currentStep, renderStepper, start};
})();
if (typeof module !== 'undefined') module.exports = PanelShell;
else PanelShell.start(document);
