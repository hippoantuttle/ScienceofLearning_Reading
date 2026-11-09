import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPilotWorker, PilotBudget, limitsFrom } from '../server/ai/pilot-worker.mjs';

const ORIGIN = 'chrome-extension://testextensionid';
const UID_A = '11111111-1111-4111-8111-111111111111';
const UID_B = '22222222-2222-4222-8222-222222222222';
const good = { terms: [], background: [], structureType: 'unspecified' };

function fakeState() {
  const store = new Map(); let tail = Promise.resolve();
  // 실제 Durable Object는 저장소 트랜잭션을 직렬화한다. 이를 모사하되 실환경 동작의 증명은 아니다.
  return { storage: { transaction: (fn) => { const run = tail.then(() => fn({ get: async (k) => store.get(k), put: async (k, v) => { await Promise.resolve(); store.set(k, structuredClone(v)); } })); tail = run.catch(() => {}); return run; } } };
}
function budgetNamespace(env = {}) {
  const budget = new PilotBudget(fakeState(), env);
  return { idFromName: () => 1, get: () => ({ fetch: (req) => budget.fetch(req) }) };
}
// token -> { id, active }
function supabase(users, calls = []) {
  return async (url, init = {}) => {
    calls.push(url);
    const token = (init.headers?.Authorization || '').replace('Bearer ', '');
    const user = users[token];
    if (url.endsWith('/auth/v1/user')) return user ? Response.json({ id: user.id }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rest/v1/rpc/is_active_pilot_member')) return Response.json(Boolean(user?.active));
    throw new Error('unexpected ' + url);
  };
}
function provider(counter) {
  return async (url) => {
    counter.n++; assert.equal(url, 'https://api.deepseek.com/chat/completions');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(good) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  };
}
function setup({ users = { tokA: { id: UID_A, active: true }, tokB: { id: UID_B, active: true } }, envOverride = {}, providerFetch } = {}) {
  const counter = { n: 0 }; const calls = [];
  const env = { ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', DEEPSEEK_API_KEY: 'fake', PILOT_AI_ENABLED: 'true', PILOT_USER_DAILY_LIMIT: '2', PILOT_GLOBAL_DAILY_LIMIT: '3', ...envOverride };
  env.PILOT_BUDGET = budgetNamespace(env);
  const worker = createPilotWorker({ fetchImpl: supabase(users, calls), providerFetch: providerFetch ?? provider(counter) });
  const call = (token, { body = '{}', origin = ORIGIN, method = 'POST', path = '/recommend' } = {}) => worker.fetch(new Request('https://ai.test' + path, { method, headers: { ...(origin ? { origin } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: method === 'POST' ? body : undefined }), env);
  return { call, counter, calls, env };
}

test('로그인한 활성 멤버만 추천을 받고 응답에 사용량이 포함된다', async () => {
  const { call, counter } = setup();
  const r = await call('tokA');
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.kind, 'pilot'); assert.deepEqual(data.recommendation, good); assert.equal(data.usage.total_tokens, 15);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(counter.n, 1);
});

test('토큰 없음·잘못된 토큰·비활성 멤버·허용되지 않은 origin은 공급자를 호출하지 않는다', async () => {
  const { call, counter } = setup({ users: { tokC: { id: UID_A, active: false } } });
  assert.equal((await call(null)).status, 401);
  assert.equal((await call('nope')).status, 401);
  assert.equal((await call('tokC')).status, 403);
  assert.equal((await call('tokC', { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('tokC', { origin: null })).status, 403);
  assert.equal(counter.n, 0);
});

test('기본값·미설정 상태에서는 비활성이며 Supabase나 공급자를 호출하지 않는다', async () => {
  for (const envOverride of [{ PILOT_AI_ENABLED: 'false' }, { PILOT_AI_ENABLED: undefined }]) {
    const { call, counter, calls } = setup({ envOverride });
    assert.equal((await call('tokA')).status, 503);
    assert.equal(counter.n, 0); assert.equal(calls.length, 0);
  }
  const noKey = setup({ envOverride: { DEEPSEEK_API_KEY: '' } });
  assert.equal((await noKey.call('tokA')).status, 503);
  const badUrl = setup({ envOverride: { SUPABASE_URL: 'http://insecure.test' } });
  assert.equal((await badUrl.call('tokA')).status, 503);
  const secretKey = setup({ envOverride: { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_x' } });
  assert.equal((await secretKey.call('tokA')).status, 503);
  const badLimit = setup({ envOverride: { PILOT_USER_DAILY_LIMIT: '0' } });
  assert.equal((await badLimit.call('tokA')).status, 503);
});

test('사용자별 한도 초과는 429이며 다른 사용자에게 영향이 없다', async () => {
  const { call, counter } = setup({ envOverride: { PILOT_USER_DAILY_LIMIT: '2', PILOT_GLOBAL_DAILY_LIMIT: '10' } });
  assert.equal((await call('tokA')).status, 200);
  assert.equal((await call('tokA')).status, 200);
  assert.equal((await call('tokA')).status, 429);
  assert.equal((await call('tokB')).status, 200);
  assert.equal(counter.n, 3);
});

test('전체 한도 초과는 사용자별 한도가 남아 있어도 429이다', async () => {
  const { call, counter } = setup({ envOverride: { PILOT_USER_DAILY_LIMIT: '5', PILOT_GLOBAL_DAILY_LIMIT: '2' } });
  assert.equal((await call('tokA')).status, 200);
  assert.equal((await call('tokB')).status, 200);
  assert.equal((await call('tokA')).status, 429);
  assert.equal(counter.n, 2);
});

test('동시 요청에도 한도를 넘지 않는다', async () => {
  const { call, counter } = setup({ envOverride: { PILOT_USER_DAILY_LIMIT: '2', PILOT_GLOBAL_DAILY_LIMIT: '10' } });
  const results = await Promise.all(Array.from({ length: 8 }, () => call('tokA')));
  assert.equal(results.filter(r => r.status === 200).length, 2);
  assert.equal(results.filter(r => r.status === 429).length, 6);
  assert.equal(counter.n, 2);
});

test('공급자 실패·형식 오류도 예약을 소모하고 자동 재시도하지 않는다', async () => {
  const { call, counter } = setup({ providerFetch: async () => { counter2.n++; throw new Error('offline'); }, envOverride: { PILOT_USER_DAILY_LIMIT: '1', PILOT_GLOBAL_DAILY_LIMIT: '10' } });
  assert.equal((await call('tokA')).status, 502);
  assert.equal((await call('tokA')).status, 429);
  assert.equal(counter2.n, 1); assert.equal(counter.n, 0);
});
const counter2 = { n: 0 };

test('본문이 있거나 너무 크거나 JSON이 아니면 거절하고 예약하지 않는다', async () => {
  const { call, counter } = setup({ envOverride: { PILOT_USER_DAILY_LIMIT: '1' } });
  assert.equal((await call('tokA', { body: JSON.stringify({ article: '실제 기사 본문' }) })).status, 400);
  assert.equal((await call('tokA', { body: '[]' })).status, 400);
  assert.equal((await call('tokA', { body: 'not-json' })).status, 400);
  assert.equal((await call('tokA', { body: ' '.repeat(1025) })).status, 413);
  assert.equal(counter.n, 0);
  assert.equal((await call('tokA')).status, 200);
});

test('경로·메서드가 다르면 거절하고 OPTIONS는 허용 origin에만 응답한다', async () => {
  const { call } = setup();
  assert.equal((await call('tokA', { path: '/other' })).status, 404);
  const pre = await call(null, { method: 'OPTIONS' });
  assert.equal(pre.status, 204); assert.match(pre.headers.get('Access-Control-Allow-Headers'), /authorization/);
  assert.equal((await call(null, { method: 'OPTIONS', origin: 'https://evil.test' })).status, 403);
});

test('하루가 바뀌면 사용량이 초기화된다', async () => {
  const budget = new PilotBudget(fakeState(), { PILOT_USER_DAILY_LIMIT: '1', PILOT_GLOBAL_DAILY_LIMIT: '5' });
  const req = () => budget.fetch(new Request('https://b.internal/', { method: 'POST', headers: { 'X-User-Id': UID_A } }));
  const RealDate = Date; let now = RealDate.parse('2026-11-10T10:00:00Z');
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  try {
    assert.equal((await req()).status, 200); assert.equal((await req()).status, 429);
    now = RealDate.parse('2026-11-11T00:00:01Z');
    assert.equal((await req()).status, 200);
  } finally { globalThis.Date = RealDate; }
});

test('한도 설정 파싱: 기본값, 잘못된 값', () => {
  assert.deepEqual(limitsFrom({}), { user: 5, global: 100 });
  assert.equal(limitsFrom({ PILOT_USER_DAILY_LIMIT: 'abc' }), null);
  assert.equal(limitsFrom({ PILOT_GLOBAL_DAILY_LIMIT: '-1' }), null);
});
