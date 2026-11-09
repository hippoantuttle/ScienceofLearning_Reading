// Local development only: endpoint remains disabled until cost controls are verified.
import { SYSTEM_PROMPT } from './prompts/pre-reading-v2.mjs';
const validText = (x,n) => typeof x === 'string' && x.trim().length > 0 && x.length <= n && !/[<>]/.test(x);
const keys = (x,k) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).sort().join('|') === [...k].sort().join('|');
function validRecommendation(x) {
  return keys(x,['terms','background','structureType']) && Array.isArray(x.terms) && x.terms.length <= 3 && x.terms.every(t=>keys(t,['term','definition']) && validText(t.term,40) && validText(t.definition,180)) && Array.isArray(x.background) && x.background.length <= 3 && x.background.every(t=>validText(t,180)) && ['claim-evidence','cause-effect','problem-solution','unspecified'].includes(x.structureType);
}
export async function callProvider(key, fetchImpl = fetch, {withUsage=false} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),10000);
  try {
    const response = await fetchImpl('https://api.deepseek.com/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`}, signal:controller.signal,
      body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:512,response_format:{type:'json_object'},messages:[
        {role:'system',content:SYSTEM_PROMPT},
        {role:'user',content:'자체 작성 예문: 마을 도서관은 주민을 위해 주말에 문을 연다. 자원봉사자는 도서 정리를 돕는다.'}
      ]})
    });
    if (!response.ok) throw new Error('provider failed');
    if (!response.body) throw new Error('invalid response');
    const reader=response.body.getReader(); let size=0; const chunks=[];
    while(true) { const part=await reader.read(); if(part.done) break; size+=part.value.byteLength; if(size>65536) { void reader.cancel(); throw new Error('response too large'); } chunks.push(part.value); }
    const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks) { bytes.set(chunk,offset);offset+=chunk.length; }
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if (body?.choices?.length !== 1 || body.choices[0].finish_reason !== 'stop' || typeof body.choices[0]?.message?.content !== 'string' || body.choices[0].message.content.length > 5000) throw new Error('invalid response');
    const parsed=JSON.parse(body.choices[0].message.content);
    if (!validRecommendation(parsed)) throw new Error('invalid recommendation');
    if (withUsage) {
      const u=body.usage;
      if (!u || !['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k]) && u[k]>=0) || u.total_tokens !== u.prompt_tokens+u.completion_tokens || u.completion_tokens>512) throw new Error('invalid usage');
      return {recommendation:parsed,usage:{prompt_tokens:u.prompt_tokens,completion_tokens:u.completion_tokens,total_tokens:u.total_tokens}};
    }
    return parsed;
  } finally { clearTimeout(timer); }
}
export class Budget {
  constructor(state) { this.state = state; }
  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const raw=request.headers.get('X-Expires-At');
    if (!raw || !/^\d{13}$/.test(raw)) return new Response(null,{status:503});
    const expiry=Number(raw);
    if (expiry<=Date.now() || expiry>Date.now()+900000) return new Response(null,{status:503});
    const accepted = await this.state.storage.transaction(async txn => {
      if (expiry<=Date.now()) return false;
      const usage = (await txn.get('calls')) ?? {calls: 0, reservedMicrodollars: 0};
      if (!Number.isSafeInteger(usage.calls) || !Number.isSafeInteger(usage.reservedMicrodollars)) throw new Error('invalid budget state');
      if (usage.calls >= 3 || usage.reservedMicrodollars + 100000 > 1000000) return false;
      await txn.put('calls', {calls:usage.calls + 1, reservedMicrodollars:usage.reservedMicrodollars + 100000});
      return true;
    });
    return new Response(null, { status: accepted ? 200 : 429 });
  }
}

function createWorker(provider, experiment=false) {
  return {
  async fetch(request, env) {
    if (!env.ACCESS_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ACCESS_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/recommend') return new Response(null, { status: 404 });
    if (!request.body) return new Response(null,{status:400});
    const reader=request.body.getReader(); const chunks=[]; let size=0;
    try {
      while (true) {
        const {done,value}=await reader.read(); if(done) break;
        size+=value.byteLength; if(size>1024) { void reader.cancel(); return new Response(null,{status:413}); }
        chunks.push(value);
      }
      const bytes=new Uint8Array(size); let offset=0;
      for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 0) return new Response(null,{status:400});
    } catch { return new Response(null,{status:400}); }
    if (!provider || (experiment && (env.EXPERIMENT_ENABLED !== 'true' || typeof env.DEEPSEEK_API_KEY !== 'string' || !env.DEEPSEEK_API_KEY.trim()))) return new Response('Unavailable', { status: 503 });
    const rawExpiry=experiment ? env.EXPERIMENT_EXPIRES_AT : String(Date.now()+30000);
    if (typeof rawExpiry !== 'string' || !/^\d{13}$/.test(rawExpiry) || Number(rawExpiry)<=Date.now() || Number(rawExpiry)>Date.now()+900000) return new Response('Unavailable',{status:503});
    try {
      const budget = env.BUDGET.get(env.BUDGET.idFromName('experiment'));
      const reservation = await budget.fetch(new Request('https://budget.internal/', { method: 'POST',headers:{'X-Expires-At':rawExpiry} }));
      if (!reservation.ok) return new Response(null, { status: reservation.status === 429 ? 429 : 503 });
    } catch { return new Response(null, { status: 503 }); }
    try { const data=await provider(env.DEEPSEEK_API_KEY); return Response.json(experiment ? {kind:'experiment',...data} : {kind:'test',recommendation:data}, {headers:{'Cache-Control':'no-store'}}); }
    catch { return new Response('Provider unavailable', {status:502}); }
  }
};
}
// OFF by default. Deployment and enabling require prior review and user approval.
export default createWorker(key => callProvider(key, fetch, {withUsage:true}), true);
export function createExperimentWorker(fakeFetch) {
  if (typeof fakeFetch !== 'function') throw new Error('test transport required');
  return createWorker(key => callProvider(key, fakeFetch, {withUsage:true}), true);
}
export function createTestWorker(fakeFetch) {
  if (typeof fakeFetch !== 'function') throw new Error('test transport required');
  return createWorker(key => callProvider(key, fakeFetch));
}
