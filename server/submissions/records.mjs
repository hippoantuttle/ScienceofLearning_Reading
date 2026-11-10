import contract from '../../record-contract.js';

const columns = {mainIdea: 'main_idea', primary: 'primary_text', support: 'support_text', relation: 'relation_text', retell: 'retell'};
const originalColumns = {schemaVersion:'schema_version',sessionId:'session_id',structureType:'structure_type',...columns,reflection:'reflection',newWords:'new_words',interests:'interests',rechecked:'rechecked'};
const pageSize = 10;
function cursor(row) { return row ? row.saved_at + '~' + row.id : null; }
function pageQuery(search) {
  if ([...search.keys()].some(k => k !== 'cursor') || search.getAll('cursor').length > 1) throw Error('invalid');
  const value = search.get('cursor');
  if (!value) return null;
  const [time, id, extra] = value.split('~');
  if (extra || !contract.uuid.test(id) || !/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(time) || !Number.isFinite(Date.parse(time))) throw Error('invalid');
  return {time, id};
}
function revision(row) {
  return {id: row.id, requestId: row.request_id, savedAt: row.saved_at, answers: Object.fromEntries(Object.entries(columns).map(([k,c]) => [k,row[c]]))};
}
export function original(row) {
  const payload = Object.fromEntries(Object.entries(originalColumns).map(([k,c]) => [k,row[c]]));
  if (row.article_title !== null && row.article_title !== undefined) Object.assign(payload, {articleTitle:row.article_title, sourceUrl:row.source_url});
  return {status:'saved', submissionId:row.id, savedAt:row.saved_at, payload};
}
// 호출 전 기존 Worker에서 Origin·토큰·활성 회원을 확인한다. DB에도 동일 JWT를 전달해 RLS를 유지한다.
export async function handleRecords(req, {base, upstreamHeaders, user, fetchImpl, reply}) {
  const url = new URL(req.url), parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (parts[1] !== 'records') return null;
  const recordId = parts[2], sub = parts[3], requestId = parts[4];
  if (parts[0] !== 'submissions' || parts.length > 5 || (recordId && !contract.uuid.test(recordId)) || (sub && sub !== 'revisions') || (requestId && !contract.uuid.test(requestId))) return reply(400,{error:'invalid'});
  const db = base + '/rest/v1/';
  async function rows(table, params) {
    const response = await fetchImpl(db + table + '?' + new URLSearchParams(params), {method:'GET',headers:upstreamHeaders,redirect:'manual'});
    if (!response.ok) {
      const error=Error('db');error.status=response.status;
      const body=await response.json().catch(()=>null);
      if(['42P01','42703','PGRST200','PGRST204','PGRST205'].includes(body?.code))error.code='records_schema_missing';
      throw error;
    }
    const result = await response.json(); if (!Array.isArray(result)) throw Error('db'); return result;
  }
  async function parent() {
    return (await rows('pilot_submissions',{owner_id:'eq.'+user.id,id:'eq.'+recordId,select:'*',limit:'1'})).find(r => r.id === recordId && r.owner_id === user.id);
  }
  async function page(table, select, extra = {}) {
    let before; try { before = pageQuery(url.searchParams); } catch { return null; }
    const params = {owner_id:'eq.'+user.id,select,order:'saved_at.desc,id.desc',limit:String(pageSize+1),...extra};
    if (before) params.or = '(saved_at.lt.'+before.time+',and(saved_at.eq.'+before.time+',id.lt.'+before.id+'))';
    const found = await rows(table,params), more = found.length > pageSize, items = found.slice(0,pageSize);
    return {items,nextCursor:more ? cursor(items.at(-1)) : null};
  }
  if (req.method === 'GET') {
    if (!recordId) {
      if(url.searchParams.size===1 && url.searchParams.get('capabilities')==='1'){
        // 저장 전 스키마·관계의 존재만 검사한다. limit=0이므로 답안/개인정보는 조회하지 않는다.
        await rows('pilot_submissions',{select:'id,article_title,source_url,pilot_revisions(id)',limit:'0'});
        await rows('pilot_revisions',{select:'id,owner_id,submission_id,request_id,main_idea,primary_text,support_text,relation_text,retell,saved_at',limit:'0'});
        return reply(200,{recordsApiVersion:1,ready:true});
      }
      const result = await page('pilot_submissions','id,saved_at,article_title,source_url,pilot_revisions(id)',{'pilot_revisions.limit':'1'});
      if (!result) return reply(400,{error:'invalid'});
      return reply(200,{items:result.items.map(r=>({submissionId:r.id,savedAt:r.saved_at,articleTitle:r.article_title||'',sourceUrl:r.source_url||'',hasRevisions:!!r.pilot_revisions?.length})),nextCursor:result.nextCursor});
    }
    const saved = await parent(); if (!saved) return reply(404,{error:'not_found'});
    if (!sub) {
      if (url.search) return reply(400,{error:'invalid'});
      return reply(200, original(saved));
    }
    if (!requestId) {
      const result = await page('pilot_revisions','*',{submission_id:'eq.'+recordId});
      return result ? reply(200,{items:result.items.map(revision),nextCursor:result.nextCursor}) : reply(400,{error:'invalid'});
    }
    if (url.search) return reply(400,{error:'invalid'});
    const found = (await rows('pilot_revisions',{owner_id:'eq.'+user.id,submission_id:'eq.'+recordId,request_id:'eq.'+requestId,select:'*',limit:'1'}))[0];
    return found && found.owner_id === user.id && found.submission_id === recordId ? reply(200,{status:'saved',revision:revision(found)}) : reply(404,{error:'not_found'});
  }
  if (req.method !== 'POST' || !recordId || sub !== 'revisions' || requestId || url.search) return reply(405,{error:'method'});
  const raw = await req.text(); if (new TextEncoder().encode(raw).length > 256000) return reply(413,{error:'too_large'});
  let payload; try { payload = contract.revision(JSON.parse(raw)); } catch { return reply(400,{error:'invalid'}); }
  if (req.headers.get('idempotency-key') !== payload.requestId) return reply(400,{error:'invalid'});
  if (!await parent()) return reply(404,{error:'not_found'});
  const row = {owner_id:user.id,submission_id:recordId,request_id:payload.requestId,...Object.fromEntries(Object.entries(columns).map(([k,c])=>[c,payload.answers[k]]))};
  const response = await fetchImpl(db+'pilot_revisions',{method:'POST',headers:{...upstreamHeaders,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row),redirect:'manual'});
  if (!response.ok && response.status !== 409) return reply(response.status === 401 || response.status === 403 ? 403 : 503,{error:'save_failed'});
  const found = (await rows('pilot_revisions',{owner_id:'eq.'+user.id,submission_id:'eq.'+recordId,request_id:'eq.'+payload.requestId,select:'*',limit:'1'}))[0];
  if (!found) return reply(503,{error:'not_verified'});
  if (Object.entries(row).some(([k,v])=>found[k]!==v)) return reply(409,{error:'conflict'});
  return reply(200,{status:'saved',revision:revision(found)});
}
