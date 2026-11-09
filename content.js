(() => {
  if (globalThis.__readingTrainingContentInstalled) return;
  globalThis.__readingTrainingContentInstalled = true;
  let session = null;
  let mask = null;
  let originalFilter = null;

  function positionMask() {
    if (!mask || !session?.target?.isConnected) return;
    const rect = session.target.getBoundingClientRect();
    Object.assign(mask.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }
  function restore() {
    if (!mask) return;
    const style = session?.target?.style;
    if (style && originalFilter) {
      if (originalFilter.value) style.setProperty('filter', originalFilter.value, originalFilter.priority);
      else style.removeProperty('filter');
    }
    mask.remove(); mask = null; originalFilter = null;
    window.removeEventListener('scroll', positionMask, true);
    window.removeEventListener('resize', positionMask);
  }
  function toggle(enabled, token) {
    if (enabled && (!session || !token || token !== session.token || session.url !== location.href || !session.target.isConnected || (session.target.innerText || '').trim() !== session.text)) {
      restore(); return {status:'error', code:'STALE_TARGET', message:'연결한 본문이 변경되었습니다. 다시 연결하세요.'};
    }
    if (!enabled) { restore(); return {status:'success', enabled:false}; }
    if (mask) return {status:'success', enabled:true};
    const target = session.target;
    originalFilter = {value:target.style.getPropertyValue('filter'),priority:target.style.getPropertyPriority('filter')};
    try {
      mask = document.createElement('div');
      mask.setAttribute('role','note');
      mask.textContent = '기사 원문이 가려졌습니다. 기억나는 내용을 작성하세요.';
      Object.assign(mask.style, {position:'fixed',zIndex:'2147483647',background:'rgba(30,30,30,.9)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',padding:'1rem',boxSizing:'border-box',pointerEvents:'auto',userSelect:'none'});
      document.documentElement.append(mask);
      target.style.setProperty('filter','blur(10px)','important');
      positionMask();
      window.addEventListener('scroll',positionMask,true);
      window.addEventListener('resize',positionMask);
      return {status:'success',enabled:true};
    } catch { restore(); return {status:'error',code:'BLIND_FAILED',message:'원문을 가리지 못했습니다.'}; }
  }

  function extractArticle() {
    // Prefer semantic regions; otherwise use a container with substantial paragraphs.
    let target = null;
    for (const selector of ['article', 'main']) {
      const candidates = Array.from(document.querySelectorAll(selector)).filter((node) => (node.innerText || '').trim());
      if (candidates.length) {
        target = candidates.reduce((best, node) => node.innerText.length > best.innerText.length ? node : best);
        break;
      }
    }
    if (!target) {
      const candidates = Array.from(document.querySelectorAll('div, section'))
        .filter((node) => Array.from(node.querySelectorAll('p')).filter((p) => (p.innerText || '').trim().length >= 80).length >= 2);
      if (candidates.length) target = candidates.reduce((best, node) => (node.innerText || '').length < (best.innerText || '').length ? node : best);
    }
    const fallback = !target;
    const text = ((target || document.body)?.innerText || '').trim();
    if (!text) { session = null; return { status: 'error', code: 'EMPTY_ARTICLE', message: '읽을 수 있는 본문이 없습니다. 다른 페이지에서 다시 시도하세요.' }; }
    session = { target: target || document.body, token: crypto.randomUUID(), url: location.href, text };
    return { status: 'success', text, wordCount: text.split(/\s+/).filter(Boolean).length, charCount: text.length, fallback, token: session.token };
  }

  chrome.runtime.onConnect?.addListener((port) => {
    if (port.name === 'reading-retell') port.onDisconnect.addListener(restore);
  });
  window.addEventListener('pagehide', restore);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === 'TOGGLE_BLUR') {
      sendResponse(toggle(message.enabled === true, message.token));
      return;
    }
    if (message?.action !== 'EXTRACT_ARTICLE') return;
    try { restore(); sendResponse(extractArticle()); }
    catch { sendResponse({ status: 'error', code: 'EXTRACTION_FAILED', message: '본문을 추출하지 못했습니다. 다시 시도하세요.' }); }
  });
})();
