'use strict';
// 패널 공통 화면 상태: 개발자 도구 노출(TASK-014 D-1)과 단계 표시.
// 화면 표시만 담당하며 AI 요청 차단은 각 패널의 게이트가 계속 담당한다.
const PanelShell = (() => {
  const STEPS = ['preparation', 'reading', 'retell-view', 'review-view', 'feedback-section'];
  const UNSAVED_STEPS = ['reading', 'retell-view', 'review-view'];
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
    // TASK-021: 미저장 경고는 작성 중(읽기~정리) 단계에서 저장 확인 전까지만 보인다.
    const note = doc.getElementById('unsaved-note');
    if (note) note.hidden = !UNSAVED_STEPS.includes(current) || doc.getElementById('training-context')?.dataset?.saved === 'true';
    return current;
  }
  // TASK-027: 단계가 바뀌면 전환 방향(앞/뒤)을 표시하고, 새 단계 시작이 화면 위로 벗어나 있으면 그 위치로 옮긴다.
  // 화면 표시만 바꾸며 포커스 이동·학습 게이트는 각 패널이 계속 담당한다.
  function stepDirection(from, to) {
    const a = STEPS.indexOf(from), b = STEPS.indexOf(to);
    return a >= 0 && b >= 0 && b < a ? 'back' : 'forward';
  }
  function announceStepChange(doc, from, to) {
    if (!from || from === to) return;
    if (doc.body?.dataset) doc.body.dataset.stepDir = stepDirection(from, to);
    const section = doc.getElementById(to);
    if (!section?.getBoundingClientRect || !section.scrollIntoView) return;
    if (section.getBoundingClientRect().top >= 0) return;
    // 즉시 이동: 움직임은 섹션 등장 전환이 담당하고, 부드러운 스크롤은 포커스 이동과 겹쳐 끊길 수 있다.
    section.scrollIntoView({block: 'start', behavior: 'auto'});
  }
  function start(doc) {
    applyDevTools(doc, devToolsEnabled(typeof SubmissionConfig === 'undefined' ? null : SubmissionConfig, typeof AIContract === 'undefined' ? null : AIContract));
    let last = renderStepper(doc);
    const observer = new MutationObserver(() => { const current = renderStepper(doc); announceStepChange(doc, last, current); last = current; });
    for (const id of STEPS) { const el = doc.getElementById(id); if (el) observer.observe(el, {attributes: true, attributeFilter: ['hidden']}); }
  }
  return {STEPS, devToolsEnabled, applyDevTools, currentStep, renderStepper, stepDirection, announceStepChange, start};
})();
if (typeof module !== 'undefined') module.exports = PanelShell;
else PanelShell.start(document);
