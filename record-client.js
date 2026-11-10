'use strict';
const RecordClient = (() => {
  const contract = typeof module !== 'undefined' ? require('./record-contract.js') : RecordContract;
  const messages = {400: '기록 서버가 요청 형식을 거절했습니다. 입력을 바꾸기 전에 서버 버전과 요청 형식을 확인해야 합니다.', 401: '로그인이 만료되었습니다. 상단에서 같은 계정으로 다시 로그인하세요.', 403: '활성 회원의 본인 기록만 이용할 수 있습니다.', 404: '기록이 없거나 삭제되어 조회할 수 없습니다.', 409: '같은 요청 식별자에 다른 내용이 저장되어 있습니다.', 413: '저장 요청이 너무 큽니다. 입력 길이를 확인하세요.'};
  const readinessMessages={records_api_unavailable:'현재 연결된 서버에 수정본 저장 API가 준비되지 않았습니다. 서버 업데이트가 필요합니다.',records_schema_missing:'기록 DB의 수정본 저장 구조가 준비되지 않았습니다. DB 업데이트가 필요합니다.'};
  function create({endpoint, getToken, fetchImpl = fetch}) {
    const base = new URL(endpoint);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw Error('기록 서버 주소가 올바르지 않습니다.');
    const root = base.href.replace(/\/$/, '') + '/records';
    let readiness=null;
    async function call(path = '', {method = 'GET', body} = {}) {
      const token = await getToken(); if (!token) throw Error('로그인이 필요합니다.');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetchImpl(root + path, {method, headers: {Authorization: `Bearer ${token}`, ...(body ? {'Content-Type': 'application/json', 'Idempotency-Key': body.requestId} : {})}, ...(body ? {body: JSON.stringify(body)} : {}), redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal});
        if (!response.ok) {
          let body=null;try{body=await response.json();}catch{}
          const code=body?.error==='records_schema_missing'?'records_schema_missing':null;
          const error=Error(readinessMessages[code]||messages[response.status]||'기록 서버의 요청 처리에 실패했습니다. 잠시 후 다시 시도하세요.');
          error.status=response.status;if(code)error.code=code;throw error;
        }
        return await response.json();
      } catch (error) { if (error.status) throw error; throw Error('기록 서버 응답을 확인하지 못했습니다. 입력은 유지됩니다. 같은 요청으로 다시 시도하세요.'); }
      finally { clearTimeout(timer); }
    }
    function id(value) { if (!contract.uuid.test(value)) throw Error('기록 식별자 오류'); return encodeURIComponent(value); }
    function page(cursor) { return cursor ? '?cursor=' + encodeURIComponent(cursor) : ''; }
    async function ready(){
      if(!readiness)readiness=(async()=>{
        let result;
        try{result=await call('?capabilities=1');}
        catch(error){
          if(![400,404,405].includes(error.status))throw error;
          const unavailable=Error(readinessMessages.records_api_unavailable);unavailable.status=503;unavailable.code='records_api_unavailable';throw unavailable;
        }
        if(result?.recordsApiVersion!==1||result.ready!==true){const error=Error(readinessMessages.records_api_unavailable);error.status=503;error.code='records_api_unavailable';throw error;}
      })();
      try{await readiness;}catch(error){readiness=null;throw error;}
    }
    async function prepared(path,options){await ready();return call(path,options);}
    return {
      list: cursor => prepared(page(cursor)),
      detail: recordId => prepared('/' + id(recordId)),
      revisions: (recordId, cursor) => prepared('/' + id(recordId) + '/revisions' + page(cursor)),
      save: (recordId, value) => prepared('/' + id(recordId) + '/revisions', {method: 'POST', body: contract.revision(value)}),
      readRevision: (recordId, requestId) => prepared('/' + id(recordId) + '/revisions/' + id(requestId))
    };
  }
  // 응답 유실 후에도 같은 requestId와 내용으로 재시도한다. 이후 편집은 다음 명시 저장에서 전송한다.
  function createSaver({io, recordId, newId}) {
    let pending = null, busy = false;
    return {
      hasPending: () => !!pending,
      async save(value) {
        if (busy) throw Error('수정본을 저장하고 있습니다.');
        if (!pending) pending = contract.revision({requestId: newId(), answers: value});
        busy = true;
        try {
          const receipt = await io.save(recordId, structuredClone(pending));
          const read = await io.readRevision(recordId, pending.requestId);
          if (receipt?.status !== 'saved' || read?.status !== 'saved' || typeof receipt.revision?.id !== 'string' || !receipt.revision.id.trim() || receipt.revision?.requestId !== pending.requestId || read.revision?.requestId !== pending.requestId || read.revision?.id !== receipt.revision?.id || read.revision?.savedAt !== receipt.revision?.savedAt || !Number.isFinite(Date.parse(read.revision?.savedAt)) || !contract.same(read.revision?.answers, pending.answers)) throw Error('수정본 저장 후 재조회가 일치하지 않습니다. 같은 요청으로 다시 시도하세요.');
          const result = structuredClone(read.revision); pending = null; return result;
        } finally { busy = false; }
      }
    };
  }
  return {create, createSaver};
})();
if (typeof module !== 'undefined') module.exports = RecordClient;
