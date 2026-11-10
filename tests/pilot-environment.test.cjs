'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {candidates,prepare,secretReadiness,SOURCES}=require('../scripts/prepare-pilot-environment.cjs');
const {verify,BASE,ORIGIN,SYNTHETIC_ARTICLE}=require('../scripts/verify-pilot-environment.cjs');
const config={authUrl:'https://synthetic.supabase.co',publicKey:'sb_publishable_synthetic',endpoint:'https://submit.example.org/submissions',aiEndpoint:BASE+'/recommend',articleTestEnabled:false,feedbackTestEnabled:false};
const now=Date.parse('2026-11-10T00:00:00Z'),expiresAt=new Date(now+4*60*60*1000).toISOString();

test('본인 배포 후보는 단일 계정·기한·5/5 한도를 요구하고 기본/검토 활성 설정을 분리한다',()=>{
  const c=candidates(config,{expiresAt,now});
  assert.equal(c.disabled.name,'reading-ai-pilot');assert.equal(c.disabled.vars.PILOT_AI_ENABLED,'false');
  assert.equal(c.active.vars.PILOT_AI_ENABLED,'true');assert.equal(c.active.vars.PILOT_SELFTEST_ONLY,'true');
  assert.equal(c.active.vars.PILOT_USER_DAILY_LIMIT,'5');assert.equal(c.active.vars.PILOT_GLOBAL_DAILY_LIMIT,'5');
  assert.equal(c.active.vars.PILOT_SELFTEST_EXPIRES_AT,expiresAt);
  assert.equal(c.active.vars.PILOT_SELFTEST_USER_ID,undefined);assert.equal(c.active.vars.DEEPSEEK_API_KEY,undefined);
  assert.equal(c.extensionActive.articleTestEnabled,true);assert.equal(c.extensionDisabled.articleTestEnabled,false);
  for(const expiresAt of ['invalid',new Date(now-1).toISOString(),new Date(now+25*60*60*1000).toISOString()])assert.throws(()=>candidates(config,{expiresAt,now}));
  assert.throws(()=>candidates({...config,aiEndpoint:'https://other.example.org/recommend'},{expiresAt,now}));
  assert.deepEqual(secretReadiness([]),['DEEPSEEK_API_KEY','SUPABASE_PUBLISHABLE_KEY','PILOT_SELFTEST_USER_ID']);
  assert.deepEqual(secretReadiness(['DEEPSEEK_API_KEY','SUPABASE_ANON_KEY','PILOT_SELFTEST_USER_ID']),[]);
});

test('준비 명령은 허용 공개 소스만 복사하고 기존 폴더를 덮어쓰거나 원격 실행하지 않는다',()=>{
  const label='test-pilot-'+require('node:crypto').randomUUID();
  const {destination,report}=prepare({config,label,expiresAt,now});
  try{
    assert.equal(report.remoteChanged,false);assert.equal(report.actualAiVerified,false);
    assert.deepEqual(Object.keys(report.sourceHashes),SOURCES);
    assert.equal(fs.existsSync(path.join(destination,'.dev.vars')),false);
    assert.equal(fs.existsSync(path.join(destination,'submission-config.local.js')),false);
    assert.equal(fs.existsSync(path.join(destination,'server/ai/pilot-local-worker.mjs')),false);
    assert.throws(()=>prepare({config,label,expiresAt,now}));assert.throws(()=>prepare({config,label:'../escape',expiresAt,now}));
  }finally{fs.rmSync(destination,{recursive:true,force:true});}
});

test('사전점검은 가짜 인증과 고정 합성 입력만 쓰고 비활성/미인증 응답을 정상 AI 검증으로 표시하지 않는다',async()=>{
  for(const gate of ['disabled','unauthorized']){
    let calls=0;
    const report=await verify({fetchImpl:async(url,init)=>{
      calls++;assert.equal(new URL(url).origin,BASE);assert.equal(init.redirect,'error');
      if(init.method==='POST'){
        const route=new URL(url).pathname;
        const expected=route==='/recommend-article'?{article:SYNTHETIC_ARTICLE}:route==='/feedback'?{article:SYNTHETIC_ARTICLE,sessionId:'11111111-1111-4111-8111-111111111111'}:{};
        assert.deepEqual(JSON.parse(init.body),expected);
      }else assert.equal(init.body,undefined);
      if(init.headers.Authorization)assert.equal(init.headers.Authorization,'Bearer synthetic-readiness-only');
      const headers=init.headers.Origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN}:{};
      if(init.headers.Origin!==ORIGIN)return Response.json({error:'forbidden'},{status:403,headers});
      if(init.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(!init.headers.Authorization)return Response.json({error:'unauthorized'},{status:401,headers});
      return Response.json({error:gate},{status:gate==='disabled'?503:401,headers});
    }});
    assert.equal(calls,7);assert.equal(report.passed,true);assert.equal(report.actualAiVerified,false);assert.equal(report.accountVerified,false);
  }
});

test('사전점검은 예상하지 못한 성공·응답과 잘못된 CORS를 통과 처리하거나 복제하지 않는다',async()=>{
  const report=await verify({fetchImpl:async()=>Response.json({secret:'SYNTHETIC_MUST_NOT_COPY'},{status:200})});
  assert.equal(report.passed,false);assert.doesNotMatch(JSON.stringify(report),/SYNTHETIC_MUST_NOT_COPY/);
});

test('활성 Worker 실제 계약에서도 가상 점검 입력이 형식 검사 후 인증 거절되며 모델을 호출하지 않는다',async()=>{
  const {createPilotWorker}=await import('../server/ai/pilot-worker.mjs');
  let authCalls=0,providerCalls=0;
  const worker=createPilotWorker({fetchImpl:async()=>{authCalls++;return new Response(null,{status:401});},providerFetch:async()=>{providerCalls++;throw Error('must not call provider');}});
  const env={ALLOWED_ORIGIN:ORIGIN,SUPABASE_URL:config.authUrl,SUPABASE_PUBLISHABLE_KEY:config.publicKey,DEEPSEEK_API_KEY:'synthetic-only',
    PILOT_AI_ENABLED:'true',PILOT_ARTICLE_ENABLED:'true',PILOT_FEEDBACK_ENABLED:'true',PILOT_SELFTEST_ONLY:'true',
    PILOT_SELFTEST_USER_ID:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',PILOT_SELFTEST_EXPIRES_AT:new Date(Date.now()+60000).toISOString()};
  const report=await verify({fetchImpl:(url,init)=>worker.fetch(new Request(url,init),env)});
  assert.equal(report.passed,true);
  assert.ok(report.results.filter(x=>x.name.startsWith('gate/')).every(x=>x.status===401&&x.code==='unauthorized'));
  assert.equal(authCalls,3);assert.equal(providerCalls,0);
});
