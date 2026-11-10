// 파일럿용 AI 읽기 전 추천 Worker.
// - 공용 ACCESS_TOKEN 대신 Supabase 로그인 토큰 + 활성 멤버십으로 사용자를 확인한다.
// - 사용자별 일일 한도와 전체 일일 한도를 Durable Object에서 원자적으로 예약한다.
// - 공급자 키(DEEPSEEK_API_KEY)는 Worker Secret에만 둔다. 클라이언트에는 노출하지 않는다.
// - 기본 비활성. /recommend는 고정 예문만 사용한다. 실제 글 경로는 별도 스위치가
//   켜져야 하며 UI 동의·제공자 조건 검토 전에는 활성화하지 않는다.
import { callProvider } from './worker.mjs';
import { callFeedback } from './feedback.mjs';

const DEFAULT_USER_DAILY_LIMIT = 5;
const DEFAULT_GLOBAL_DAILY_LIMIT = 100;
const MAX_BODY_BYTES = 1024;

function positiveInt(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function limitsFrom(env) {
  const user = positiveInt(env.PILOT_USER_DAILY_LIMIT, DEFAULT_USER_DAILY_LIMIT);
  const global = positiveInt(env.PILOT_GLOBAL_DAILY_LIMIT, DEFAULT_GLOBAL_DAILY_LIMIT);
  return user && global ? { user, global } : null;
}

function supabaseConfig(env) {
  try {
    const url = new URL(env.SUPABASE_URL);
    const apiKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (!apiKey || apiKey.startsWith('sb_secret_')) return null;
    return { base: url.origin, apiKey };
  } catch { return null; }
}

async function readSmallJson(request, maxBytes = MAX_BODY_BYTES) {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { void reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

// 하루(UTC) 단위 사용자별·전체 호출 예약. 하루가 바뀌면 상태를 새로 시작한다.
export class PilotBudget {
  constructor(state, env) { this.state = state; this.env = env ?? {}; }
  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const userId = request.headers.get('X-User-Id');
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return new Response(null, { status: 400 });
    const limits = limitsFrom(this.env);
    if (!limits) return new Response(null, { status: 503 });
    const today = new Date().toISOString().slice(0, 10);
    const accepted = await this.state.storage.transaction(async (txn) => {
      let usage = await txn.get('usage');
      if (!usage || usage.day !== today) usage = { day: today, global: 0, users: {} };
      const mine = usage.users[userId] ?? 0;
      if (!Number.isSafeInteger(usage.global) || !Number.isSafeInteger(mine)) throw new Error('invalid budget state');
      if (mine >= limits.user || usage.global >= limits.global) return false;
      usage.users[userId] = mine + 1;
      usage.global += 1;
      await txn.put('usage', usage);
      return true;
    });
    return new Response(null, { status: accepted ? 200 : 429 });
  }
}

export function createPilotWorker({ fetchImpl = fetch, providerFetch = fetch } = {}) {
  return {
    async fetch(request, env) {
      const origin = request.headers.get('origin');
      const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
      const reply = (status, body) => Response.json(body ?? { error: 'error' }, { status, headers });
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return reply(403, { error: 'forbidden' });
      headers['Access-Control-Allow-Origin'] = origin;
      if (request.method === 'OPTIONS') {
        headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'authorization,content-type';
        return new Response(null, { status: 204, headers });
      }
      const path = new URL(request.url).pathname;
      const articleMode = path === '/recommend-article';
      const feedbackMode = path === '/feedback';
      if (request.method !== 'POST' || (path !== '/recommend' && !articleMode && !feedbackMode)) return reply(404, { error: 'not_found' });
      const auth = request.headers.get('authorization') || '';
      if (!/^Bearer \S+$/.test(auth)) return reply(401, { error: 'unauthorized' });

      if (env.PILOT_AI_ENABLED !== 'true') return reply(503, { error: 'disabled' });
      if (articleMode && env.PILOT_ARTICLE_ENABLED !== 'true') return reply(503, { error: 'disabled' });
      if (feedbackMode && env.PILOT_FEEDBACK_ENABLED !== 'true') return reply(503, { error: 'disabled' });
      const cfg = supabaseConfig(env);
      if (!cfg || typeof env.DEEPSEEK_API_KEY !== 'string' || !env.DEEPSEEK_API_KEY.trim() || !limitsFrom(env)) return reply(503, { error: 'configuration' });

      let body;
      try { body = await readSmallJson(request, articleMode || feedbackMode ? 50000 : MAX_BODY_BYTES); }
      catch { return reply(400, { error: 'invalid' }); }
      if (body === null) return reply(413, { error: 'too_large' });
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'invalid' });
      if (articleMode || feedbackMode) {
        if (Object.keys(body).sort().join('|') !== (feedbackMode ? 'article|sessionId' : 'article') || typeof body.article !== 'string' || !body.article.trim() || !body.article.isWellFormed() || body.article.includes('\0') || body.article.length > 12000 || (feedbackMode && (typeof body.sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.sessionId)))) return reply(400, { error: 'invalid' });
      } else if (Object.keys(body).length !== 0) return reply(400, { error: 'invalid' });

      // 실패 단계를 구분하는 안전한 코드만 응답한다(토큰·키·내부 메시지는 응답에 넣지 않는다).
      const fail = (stage, status, code) => { console.error('[pilot-ai]', stage); return reply(status, { error: code }); };
      // Workers 런타임은 redirect:'error'를 지원하지 않는다. 'manual'이면 3xx는 ok가 아니므로 실패로 처리된다.
      let userId;
      try {
        const upstream = { apikey: cfg.apiKey, Authorization: auth };
        const identity = await fetchImpl(cfg.base + '/auth/v1/user', { method: 'GET', headers: upstream, redirect: 'manual' });
        if (!identity.ok) return reply(401, { error: 'unauthorized' });
        const user = await identity.json();
        if (typeof user?.id !== 'string' || !user.id) return reply(401, { error: 'unauthorized' });
        userId = user.id;
        const member = await fetchImpl(cfg.base + '/rest/v1/rpc/is_active_pilot_member', {
          method: 'POST', headers: { ...upstream, 'Content-Type': 'application/json' }, body: '{}', redirect: 'manual'
        });
        if (!member.ok) return reply(503, { error: 'membership_unavailable' });
        if ((await member.json()) !== true) return reply(403, { error: 'inactive' });
      } catch (error) { return fail('auth', 503, 'auth_unreachable', error); }

      let submission;
      if (feedbackMode) {
        try {
          const fields='structure_type,main_idea,primary_text,support_text,relation_text,retell';
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return reply(401,{error:'unauthorized'});
          const res=await fetchImpl(cfg.base + '/rest/v1/pilot_submissions?owner_id=eq.' + encodeURIComponent(userId) + '&session_id=eq.' + encodeURIComponent(body.sessionId) + '&select=' + fields, {method:'GET',headers:{apikey:cfg.apiKey,Authorization:auth},redirect:'manual'});
          if (!res.ok) return reply(503,{error:'submission_unavailable'});
          const rows=await res.json();
          if (!Array.isArray(rows) || rows.length!==1) return reply(403,{error:'submission_not_found'});
          submission=rows[0];
          if (!submission || Object.keys(submission).sort().join('|')!==fields.split(',').sort().join('|') || !Object.values(submission).every(v=>typeof v==='string'&&v.length<=10000)) return reply(503,{error:'submission_unavailable'});
        } catch { return fail('submission',503,'submission_unavailable'); }
      }

      try {
        const stub = env.PILOT_BUDGET.get(env.PILOT_BUDGET.idFromName('pilot'));
        const reservation = await stub.fetch(new Request('https://budget.internal/', { method: 'POST', headers: { 'X-User-Id': userId } }));
        if (reservation.status === 429) return reply(429, { error: 'limit' });
        if (!reservation.ok) return fail('budget', 503, 'budget_unavailable', new Error('status ' + reservation.status));
      } catch (error) { return fail('budget', 503, 'budget_unavailable', error); }

      // 예약은 공급자 호출 전에 소모된다. 실패·timeout 후 자동 재시도는 하지 않는다.
      try {
        if (feedbackMode) return reply(200,{kind:'feedback',feedback:await callFeedback(env.DEEPSEEK_API_KEY,providerFetch,body.article,submission)});
        const data = await callProvider(env.DEEPSEEK_API_KEY, providerFetch, { withUsage: true, articleText: articleMode ? body.article : undefined });
        return reply(200, { kind: 'pilot', ...data });
      } catch (error) { return fail('provider', 502, 'provider', error); }
    }
  };
}

export default createPilotWorker();
