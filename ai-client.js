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
  return {validate, createGate, requestMock};
})();
if (typeof module !== 'undefined') module.exports = AIContract;
