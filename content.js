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
  // 2026-11-19: 뉴스 사이트에서는 광고가 주소의 #만 바꾸고(#google_vignette 등), 본문 안 오디오 플레이어 시간처럼
  // 짧은 줄이 계속 바뀐다. 주소는 # 앞부분만, 본문은 연결 때 글자 수의 75% 이상이 같은 줄로 남아 있으면 같은 글로 본다
  // (패널의 TrainingDraft.SIMILARITY_THRESHOLD와 같은 기준).
  const SIMILARITY_THRESHOLD = 0.75;
  function withoutHash(value) { try { const url = new URL(value); url.hash = ''; return url.href; } catch { return value; } }
  function lines(text) { return String(text || '').split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean); }
  function similar(before, after) {
    if (before === after) return true;
    const old = lines(before), total = old.reduce((sum, line) => sum + line.length, 0);
    if (!total) return false;
    const available = new Map();
    for (const line of lines(after)) available.set(line, (available.get(line) || 0) + 1);
    let matched = 0;
    for (const line of old) { const count = available.get(line) || 0; if (count) { available.set(line, count - 1); matched += line.length; } }
    return matched / total >= SIMILARITY_THRESHOLD;
  }
  function usable(token) {
    return !!session && !!token && token === session.token && withoutHash(session.url) === withoutHash(location.href)
      && session.target.isConnected && similar(session.text, (session.target.innerText || '').trim());
  }
  function toggle(enabled, token) {
    if (enabled && !usable(token)) {
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
    let hints = {noise: [], captions: []};
    try { hints = collectHints(session.target, text.length); } catch { /* 힌트는 선택 정보다. 실패해도 본문 추출은 그대로 */ }
    return { status: 'success', text, wordCount: text.split(/\s+/).filter(Boolean).length, charCount: text.length, fallback, token: session.token, hints };
  }
  // 2026-11-19 초급 문장 목록 정리용 힌트. 본문(text)은 바꾸지 않고, 본문 영역 안에서 본문이 아닌 요소의 줄만 따로 모은다.
  // noise: 버튼·화면낭독기 전용 글자·광고/배너 영역·오디오/영상·시간·nav/aside, captions: 사진 설명(figcaption).
  const NOISE_SELECTOR = 'button,[role="button"],nav,aside,audio,video,time,.sr-only,.blind,.screen_out,.visually-hidden,.a11y-hidden,[class*="sr-only"]';
  // 대소문자 구분: BaseAd_·adWrapper·ad-box·banner 등은 잡고 loading·header·shadow·address는 잡지 않는다.
  const AD_CLASS = /[a-z]Ad(?=[A-Z_\-\s]|$)|(?:^|[\s_-])(?:[Aa]ds?|[Aa]dvert\w*|[Bb]anner\w*|[Ss]ponsor\w*)(?=[A-Z_\-\s]|$)/;
  function collectHints(root, totalLength) {
    const noise = [], captions = [], MAX = 400;
    const push = (list, element) => {
      const value = (element.innerText || '').trim();
      // 본문 대부분을 감싸는 요소는 제외 요소로 보지 않는다(잘못된 광고 클래스 등).
      if (!value || value.length > totalLength / 2) return;
      for (const line of value.split('\n')) { const item = line.replace(/\s+/g, ' ').trim(); if (item && list.length < MAX) list.push(item.slice(0, 2000)); }
    };
    for (const element of root.querySelectorAll(NOISE_SELECTOR)) push(noise, element);
    for (const element of root.querySelectorAll('[class]')) {
      const name = typeof element.className === 'string' ? element.className : element.getAttribute?.('class') || '';
      if (AD_CLASS.test(name)) push(noise, element);
    }
    for (const element of root.querySelectorAll('figcaption')) push(captions, element);
    return {noise, captions};
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
    // 패널이 연결한 세션이 이 페이지에서 아직 가릴 수 있는 상태인지만 알려 준다(본문은 보내지 않음).
    // 아니면(사이트가 본문 영역을 다시 그린 경우 등) 패널이 다시 추출해 같은 글인지 확인한다.
    if (message?.action === 'PING_SESSION') {
      sendResponse({status:'success', alive: usable(message.token)});
      return;
    }
    if (message?.action !== 'EXTRACT_ARTICLE') return;
    try { restore(); sendResponse(extractArticle()); }
    catch { sendResponse({ status: 'error', code: 'EXTRACTION_FAILED', message: '본문을 추출하지 못했습니다. 다시 시도하세요.' }); }
  });
})();
