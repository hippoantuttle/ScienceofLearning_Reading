'use strict';
const RecordContract = (() => {
  const fields = ['mainIdea', 'primary', 'support', 'relation', 'retell'];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
  function answers(value) {
    if (!exact(value, fields) || fields.some(k => typeof value[k] !== 'string' || !value[k].isWellFormed() || value[k].includes('\0') || !value[k].replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g,'') || Array.from(value[k]).length > 10000)) throw Error('수정 항목을 모두 작성하세요. 각 항목은 10,000자 이내여야 합니다.');
    return Object.fromEntries(fields.map(k => [k, value[k]]));
  }
  function revision(value) {
    if (!exact(value, ['requestId', 'answers']) || !uuid.test(value.requestId)) throw Error('수정본 요청 식별자가 올바르지 않습니다.');
    return {requestId: value.requestId, answers: answers(value.answers)};
  }
  function article(title, sourceUrl) {
    if (typeof title !== 'string' || !title.isWellFormed() || /[\x00-\x1f\x7f]/.test(title) || Array.from(title).length > 200 || typeof sourceUrl !== 'string') throw Error('글 정보 형식이 올바르지 않습니다.');
    if (sourceUrl) {
      let url; try { url = new URL(sourceUrl); } catch { throw Error('출처 사이트 주소를 확인하세요.'); }
      // 출처는 공개 사이트 origin만. 경로·검색어·fragment·자격정보를 저장하지 않는다.
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname) || sourceUrl !== url.origin) throw Error('출처는 공개 사이트 주소만 입력하세요. 경로·검색어·로그인 정보는 저장하지 않습니다.');
    }
    return {articleTitle: title, sourceUrl};
  }
  function same(a, b) { return !!a && !!b && fields.every(k => a[k] === b[k]); }
  return {fields, uuid, exact, answers, revision, article, same};
})();
if (typeof module !== 'undefined') module.exports = RecordContract;
