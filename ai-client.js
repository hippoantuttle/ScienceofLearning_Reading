const AIContract = (() => {
  const keysMatch = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).sort().join('|') === [...keys].sort().join('|');
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[<>]/.test(value);
  function validate(data) {
    return Boolean(keysMatch(data, ['terms','background','structureType']) && Array.isArray(data.terms) && data.terms.length <= 3 && data.terms.every(item => keysMatch(item,['term','definition']) && text(item.term,40) && text(item.definition,180)) && Array.isArray(data.background) && data.background.length <= 3 && data.background.every(item => text(item,180)) && ['claim-evidence','cause-effect','problem-solution','unspecified'].includes(data.structureType));
  }
  function createGate() {
    let reading = false, used = false, generation = 0;
    return {
      async request(fetcher) {
        if (reading || used) throw new Error('추천은 읽기 전 한 번만 요청할 수 있습니다.');
        used = true;
        const id = generation;
        let data;
        try { data = await fetcher(); }
        catch (error) { if (reading || id !== generation) return null; throw error; }
        if (reading || id !== generation) return null;
        if (!validate(data)) throw new Error('추천 응답 형식이 올바르지 않습니다.');
        return data;
      },
      startReading() { reading = true; generation++; },
      reset() { reading = false; used = false; generation++; }
    };
  }
  async function requestMock(token, {fetchImpl = fetch, timeoutMs = 5000} = {}) {
    if (typeof token !== 'string' || !token) throw new Error('테스트 토큰을 입력하세요.');
    const controller = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl('http://127.0.0.1:8787/recommend', {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:'{}', signal:controller.signal});
      if (!response.ok) throw new Error(response.status === 401 ? '로컬 테스트 인증에 실패했습니다.' : '로컬 테스트 서버 요청이 실패했습니다.');
      const result = await response.json();
      if (result?.kind !== 'mock' || !validate(result.recommendation)) throw new Error('모의 응답 형식이 올바르지 않습니다.');
      return result.recommendation;
    } catch (error) { if (timedOut) throw new Error('로컬 테스트 서버 응답 시간이 초과되었습니다.'); throw error; }
    finally { clearTimeout(timer); }
  }
  // 서버가 돌려주는 안전한 오류 코드만 사용자 문구로 바꾼다. 알 수 없는 코드는 상태 코드 기준 일반 문구를 쓴다.
  const PILOT_MESSAGES = {
    inactive: 'AI 추천을 사용할 수 없는 계정입니다.',
    unauthorized: '로그인 정보가 유효하지 않습니다. 다시 로그인하세요.',
    forbidden: 'AI 추천 서버가 이 앱의 요청을 허용하지 않습니다.',
    limit: '오늘 AI 추천 사용 한도에 도달했습니다.',
    disabled: 'AI 추천이 현재 꺼져 있습니다.',
    configuration: 'AI 추천 서버 설정이 완료되지 않았습니다.',
    auth_unreachable: 'AI 추천 서버가 로그인 확인 서비스에 연결하지 못했습니다.',
    membership_unavailable: '회원 확인 서비스를 사용할 수 없습니다.',
    budget_unavailable: 'AI 추천 사용량 확인에 실패했습니다.',
    provider: 'AI 공급자 응답에 실패했습니다.'
  };
  // 파일럿 Worker용: 로그인 액세스 토큰과 빈 요청만 전송한다. endpoint는 https 또는 loopback만 허용한다.
  async function requestPilot(accessToken, endpoint, {fetchImpl = fetch, timeoutMs = 15000} = {}) {
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('로그인이 필요합니다.');
    let url; try { url = new URL(endpoint); } catch { throw new Error('AI 서버 주소가 올바르지 않습니다.'); }
    const loopback = url.protocol === 'http:' && ['127.0.0.1','[::1]','localhost'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !loopback) || url.username || url.password || url.search || url.hash || url.pathname !== '/recommend') throw new Error('AI 서버 주소가 올바르지 않습니다.');
    const controller = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(url.href, {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`}, body:'{}', credentials:'omit', cache:'no-store', redirect:'error', signal:controller.signal});
      if (!response.ok) {
        let code; try { code = (await response.json())?.error; } catch { code = undefined; }
        if (PILOT_MESSAGES[code]) throw new Error(PILOT_MESSAGES[code]);
        if (response.status === 401 || response.status === 403) throw new Error(PILOT_MESSAGES.inactive);
        if (response.status === 429) throw new Error(PILOT_MESSAGES.limit);
        throw new Error('AI 추천 서버 요청이 실패했습니다.');
      }
      const result = await response.json();
      if (result?.kind !== 'pilot' || !validate(result.recommendation)) throw new Error('AI 응답 형식이 올바르지 않습니다.');
      return result.recommendation;
    } catch (error) { if (timedOut) throw new Error('AI 추천 서버 응답 시간이 초과되었습니다.'); throw error; }
    finally { clearTimeout(timer); }
  }
  return {validate, createGate, requestMock, requestPilot, pilotMessages: Object.values(PILOT_MESSAGES)};
})();
if (typeof module !== 'undefined') module.exports = AIContract;
