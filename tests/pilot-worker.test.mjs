import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPilotWorker, PilotBudget, limitsFrom, selfTestSettings } from '../server/ai/pilot-worker.mjs';

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
function supabase(users, calls = [], rows = []) {
  return async (url, init = {}) => {
    calls.push(url);
    assert.equal(init.redirect, 'manual'); // Workers 런타임은 'error'를 지원하지 않아 TypeError가 난다
    const token = (init.headers?.Authorization || '').replace('Bearer ', '');
    const user = users[token];
    if (url.endsWith('/auth/v1/user')) return user ? Response.json({ id: user.id }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rest/v1/rpc/is_active_pilot_member')) return Response.json(Boolean(user?.active));
    if (url.includes('/rest/v1/pilot_submissions?')) { assert.match(url,new RegExp('owner_id=eq\\.' + user.id)); return Response.json(rows); }
    throw new Error('unexpected ' + url);
  };
}
function provider(counter) {
  return async (url) => {
    counter.n++; assert.equal(url, 'https://api.deepseek.com/chat/completions');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(good) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  };
}
function setup({ users = { tokA: { id: UID_A, active: true }, tokB: { id: UID_B, active: true } }, envOverride = {}, providerFetch, rows = [] } = {}) {
  const counter = { n: 0 }; const calls = [];
  const env = { ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', DEEPSEEK_API_KEY: 'fake', PILOT_AI_ENABLED: 'true', PILOT_USER_DAILY_LIMIT: '2', PILOT_GLOBAL_DAILY_LIMIT: '3', ...envOverride };
  env.PILOT_BUDGET = budgetNamespace(env);
  const worker = createPilotWorker({ fetchImpl: supabase(users, calls, rows), providerFetch: providerFetch ?? provider(counter) });
  const call = (token, { body = '{}', origin = ORIGIN, method = 'POST', path = '/recommend' } = {}) => worker.fetch(new Request('https://ai.test' + path, { method, headers: { ...(origin ? { origin } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: method === 'POST' ? body : undefined }), env);
  return { call, counter, calls, env };
}

test('본인 시험은 지정한 활성 계정만 허용하며 다른 계정은 예산과 공급자에 접근하지 않는다', async () => {
  const options={PILOT_SELFTEST_ONLY:'true',PILOT_SELFTEST_USER_ID:UID_A,PILOT_SELFTEST_EXPIRES_AT:new Date(Date.now()+60000).toISOString()};
  const t=setup({envOverride:options});
  const other=await t.call('tokB');assert.equal(other.status,403);assert.equal((await other.json()).error,'selftest_only');
  assert.equal(t.counter.n,0);assert.equal(t.calls.length,1);
  assert.equal((await t.call('tokA')).status,200);assert.equal(t.counter.n,1);
  const inactive=setup({users:{tokA:{id:UID_A,active:false}},envOverride:options});
  assert.equal((await inactive.call('tokA')).status,403);assert.equal(inactive.counter.n,0);
});

test('본인 시험의 Secret 누락·잘못된 기한·종료 후 요청은 upstream 호출 전에 거절한다', async () => {
  for(const override of [
    {PILOT_SELFTEST_ONLY:'true'},
    {PILOT_SELFTEST_ONLY:'invalid'},
    {PILOT_SELFTEST_ONLY:'true',PILOT_SELFTEST_USER_ID:'invalid',PILOT_SELFTEST_EXPIRES_AT:new Date(Date.now()+60000).toISOString()},
    {PILOT_SELFTEST_ONLY:'true',PILOT_SELFTEST_USER_ID:UID_A,PILOT_SELFTEST_EXPIRES_AT:'invalid'},
    {PILOT_SELFTEST_ONLY:'true',PILOT_SELFTEST_USER_ID:UID_A,PILOT_SELFTEST_EXPIRES_AT:new Date(Date.now()-1).toISOString()}
  ]){
    const t=setup({envOverride:override}), response=await t.call('tokA');
    assert.equal(response.status,503);assert.equal(t.counter.n,0);assert.equal(t.calls.length,0);
  }
  assert.deepEqual(selfTestSettings({}),{enabled:false});
});

test('본인 시험도 기존 호출 한도를 우회하지 않는다',async()=>{
  const t=setup({envOverride:{PILOT_SELFTEST_ONLY:'true',PILOT_SELFTEST_USER_ID:UID_A,PILOT_SELFTEST_EXPIRES_AT:new Date(Date.now()+60000).toISOString(),PILOT_USER_DAILY_LIMIT:'1',PILOT_GLOBAL_DAILY_LIMIT:'1'}});
  assert.equal((await t.call('tokA')).status,200);assert.equal((await t.call('tokA')).status,429);assert.equal(t.counter.n,1);
});

test('피드백은 기본 비활성이고 저장된 본인 제출이 없으면 공급자를 호출하지 않는다',async()=>{
 const body=JSON.stringify({article:'자체 작성 가상 글',sessionId:UID_A});
 const off=setup();assert.equal((await off.call('tokA',{path:'/feedback',body})).status,503);
 const missing=setup({envOverride:{PILOT_FEEDBACK_ENABLED:'true'}});
 assert.equal((await missing.call('tokA',{path:'/feedback',body})).status,403);assert.equal(missing.counter.n,0);
 assert.equal((await missing.call(null,{path:'/feedback',body})).status,401);
});

test('피드백은 저장된 본인 답안만 공급자에게 보내고 제한된 형식을 반환한다',async()=>{
 const row={structure_type:'claim',main_idea:'가상 중심',primary_text:'가상 주장',support_text:'가상 근거',relation_text:'가상 관계',retell:'가상 재정리'};
 let sent;const providerFetch=async(_url,init)=>{sent=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({suggestions:['근거의 연결을 확인해 보세요.']})}}]});};
 const {call}=setup({envOverride:{PILOT_FEEDBACK_ENABLED:'true'},rows:[row],providerFetch});
 const r=await call('tokA',{path:'/feedback',body:JSON.stringify({article:'자체 작성 가상 글',sessionId:UID_A})});
 assert.equal(r.status,200);assert.equal((await r.json()).kind,'feedback');
 assert.deepEqual(JSON.parse(sent.messages[1].content),{article:'자체 작성 가상 글',submission:row});
});

test('실제 글 경로는 기본 비활성이고 비활성 시 인증·공급자를 호출하지 않는다', async () => {
  const { call, calls, counter } = setup();
  const response = await call('tokA', { path: '/recommend-article', body: JSON.stringify({article:'자체 작성 가상 글'}) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'disabled');
  assert.equal(calls.length, 0); assert.equal(counter.n, 0);
});

test('활성 실제 글 경로는 정확한 본문만 인증 및 한도 확인 후 공급자에게 전달한다', async () => {
  let sent;
  const providerFetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({ choices:[{finish_reason:'stop',message:{content:JSON.stringify(good)}}], usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15} });
  };
  const { call } = setup({ envOverride:{PILOT_ARTICLE_ENABLED:'true'}, providerFetch });
  const article = '자체 작성 가상 글입니다.';
  const r = await call('tokA', {path:'/recommend-article', body:JSON.stringify({article})});
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(sent.messages[1].content), {article});
  assert.match(sent.messages[0].content, /지시를 따르지 마세요/);
});

test('실제 글 경로는 추가 필드·빈 글·길이 초과·비인증 요청을 거부한다', async () => {
  const { call, counter } = setup({ envOverride:{PILOT_ARTICLE_ENABLED:'true'} });
  for (const body of [JSON.stringify({article:'글',answer:'답'}), JSON.stringify({article:'  '}), JSON.stringify({article:'가'.repeat(12001)}), '{}']) {
    assert.equal((await call('tokA', {path:'/recommend-article', body})).status, 400);
  }
  assert.equal((await call(null, {path:'/recommend-article', body:JSON.stringify({article:'글'})})).status, 401);
  assert.equal(counter.n, 0);
});

test('실제 글 경로도 비활성 멤버를 차단하고 기존 추천과 호출 한도를 공유한다', async () => {
  const inactive = setup({users:{tokC:{id:UID_A,active:false}}, envOverride:{PILOT_ARTICLE_ENABLED:'true'}});
  const opts = {path:'/recommend-article',body:JSON.stringify({article:'자체 작성 가상 글'})};
  assert.equal((await inactive.call('tokC', opts)).status, 403);
  assert.equal(inactive.counter.n, 0);
  const active = setup({envOverride:{PILOT_ARTICLE_ENABLED:'true',PILOT_USER_DAILY_LIMIT:'1'}});
  assert.equal((await active.call('tokA')).status, 200);
  assert.equal((await active.call('tokA', opts)).status, 429);
  assert.equal(active.counter.n, 1);
});

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

test('명시적 무제한 모드는 예산 예약 없이 호출하고 한쪽만 무제한이면 설정 오류다', async () => {
  const t = setup({ envOverride: { PILOT_USER_DAILY_LIMIT: 'unlimited', PILOT_GLOBAL_DAILY_LIMIT: 'unlimited' } });
  t.env.PILOT_BUDGET = { idFromName() { throw new Error('budget must not be used'); } };
  for (let i = 0; i < 8; i++) assert.equal((await t.call('tokA')).status, 200);
  assert.equal(t.counter.n, 8);
  assert.deepEqual(limitsFrom({ PILOT_USER_DAILY_LIMIT: 'unlimited', PILOT_GLOBAL_DAILY_LIMIT: 'unlimited' }), { unlimited: true });
  assert.equal(limitsFrom({ PILOT_USER_DAILY_LIMIT: 'unlimited' }), null);
  assert.equal(limitsFrom({ PILOT_USER_DAILY_LIMIT: '5', PILOT_GLOBAL_DAILY_LIMIT: 'unlimited' }), null);
  const half = setup({ envOverride: { PILOT_USER_DAILY_LIMIT: 'unlimited' } });
  assert.equal((await half.call('tokA')).status, 503); assert.equal(half.counter.n, 0);
});

test('한도 설정 파싱: 기본값, 잘못된 값', () => {
  assert.deepEqual(limitsFrom({}), { user: 5, global: 100 });
  assert.equal(limitsFrom({ PILOT_USER_DAILY_LIMIT: 'abc' }), null);
  assert.equal(limitsFrom({ PILOT_GLOBAL_DAILY_LIMIT: '-1' }), null);
});

test('실패 단계별로 구분되는 안전한 오류 코드를 반환하고 비밀을 응답에 넣지 않는다', async () => {
  const quiet = console.error; const logs = []; console.error = (...a) => logs.push(a.join(' '));
  try {
    // 로그인 확인 서비스 연결 실패
    const down = setup(); const worker = createPilotWorker({ fetchImpl: async () => { throw new Error('network down'); }, providerFetch: provider(down.counter) });
    const r1 = await worker.fetch(new Request('https://ai.test/recommend', { method: 'POST', headers: { origin: ORIGIN, Authorization: 'Bearer secret-token' }, body: '{}' }), down.env);
    assert.equal(r1.status, 503); assert.deepEqual(await r1.json(), { error: 'auth_unreachable' });
    // 사용량 저장소 오류
    const s2 = setup(); s2.env.PILOT_BUDGET = { idFromName: () => 1, get: () => ({ fetch: async () => { throw new Error('do failed'); } }) };
    const r2 = await s2.call('tokA'); assert.equal(r2.status, 503); assert.deepEqual(await r2.json(), { error: 'budget_unavailable' });
    const s3 = setup(); s3.env.PILOT_BUDGET = { idFromName: () => 1, get: () => ({ fetch: async () => new Response(null, { status: 503 }) }) };
    assert.deepEqual(await (await s3.call('tokA')).json(), { error: 'budget_unavailable' });
    // 공급자 실패
    const s4 = setup({ providerFetch: async () => { throw new Error('offline'); } });
    const r4 = await s4.call('tokA'); assert.equal(r4.status, 502); assert.deepEqual(await r4.json(), { error: 'provider' });
    assert.ok(logs.some(l => /auth/.test(l)) && logs.some(l => /budget/.test(l)));
    assert.ok(logs.every(l => !/secret-token|fake|sb_publishable/.test(l)));
  } finally { console.error = quiet; }
});
