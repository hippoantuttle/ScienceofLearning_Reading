'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {RUNTIME, validateConfig, stripDevelopment, makeZip, assemble, build} = require('../scripts/build-extension.cjs');
const config = {authUrl:'https://synthetic.supabase.co', publicKey:'sb_publishable_synthetic', endpoint:'https://submit.example.org/submissions', aiEndpoint:'https://ai.example.org/recommend', articleTestEnabled:false, feedbackTestEnabled:false};

test('공개 설정은 비밀키·사용자 JWT·로컬 주소·실험 설정을 거부한다', () => {
  assert.deepEqual(validateConfig(config), config);
  for (const publicKey of ['', 'sb_secret_synthetic', 'service_role', 'arbitrary']) assert.throws(() => validateConfig({...config, publicKey}));
  const jwt = payload => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.synthetic';
  assert.equal(validateConfig({...config, publicKey:jwt({role:'anon', ref:'synthetic'})}).authUrl, config.authUrl);
  for (const payload of [{role:'service_role', ref:'synthetic'}, {role:'authenticated', sub:'synthetic'}, {role:'anon', ref:'other'}, {role:'anon', ref:'synthetic', sub:'user'}]) assert.throws(() => validateConfig({...config, publicKey:jwt(payload)}));
  for (const endpoint of ['http://127.0.0.1:8793', 'https://127.0.0.1', 'https://localhost', 'https://example.local', 'https://secret@submit.example.org', 'https://submit.example.org/?token=synthetic', 'https://submit.example.org/#key', 'https://submit.example.org:8443']) assert.throws(() => validateConfig({...config, endpoint}));
  assert.throws(() => validateConfig({...config, allowRepeatedRecommendations:true}));
  assert.throws(() => validateConfig({...config, aiEndpoint:'', articleTestEnabled:true}));
  assert.throws(() => validateConfig({...config, aiEndpoint:new URL(config.endpoint).origin + '/recommend'}));
  for (const endpoint of ['https://submit.example.org', 'https://submit.example.org/', 'https://submit.example.org/submissions/', 'https://submit.example.org/records']) assert.throws(() => validateConfig({...config, endpoint}));
  assert.throws(() => validateConfig({...config, aiEndpoint:'https://reading-prereading-experiment.patrick020308.workers.dev/recommend'}));
  assert.throws(() => validateConfig({...config, aiEndpoint:false}));
  assert.throws(() => validateConfig({...config, feedbackTestEnabled:'false'}));
});

test('설치본은 허용 목록만 읽고 개발 UI·주소·로컬 설정·서버 파일을 제외한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-build-source-'));
  try {
    for (const file of [...RUNTIME, 'manifest.json']) fs.copyFileSync(path.join(__dirname, '..', file), path.join(root, file));
    // Synthetic sentinels: any automatic copying of unlisted files is a regression.
    for (const file of ['submission-config.local.js', '.env', '.dev.vars', 'private.pem', 'participant.response.json']) fs.writeFileSync(path.join(root, file), 'SYNTHETIC_EXCLUDED_SENTINEL');
    const result = assemble({root, config});
    assert.deepEqual(Object.keys(result.files).sort(), [...RUNTIME, 'manifest.json', 'submission-config.js'].sort());
    const all = Object.values(result.files).map(b => b.toString()).join('\n');
    assert.doesNotMatch(all, /SYNTHETIC_EXCLUDED_SENTINEL|http:\/\/127\.0\.0\.1|submission-config\.local|requestMock|allowRepeatedRecommendations|@development-/);
    assert.doesNotMatch(result.files['sidepanel.html'].toString(), /dev-only|mock-token|local-preview|synthetic-submit/);
    assert.deepEqual(result.manifest.host_permissions, ['https://synthetic.supabase.co/*', 'https://submit.example.org/*', 'https://ai.example.org/*']);
    assert.equal(result.extensionId, 'jenapgoakhnmlmjcdnkfakkkgjobbfbb');
    assert.match(result.manifest.content_security_policy.extension_pages, /connect-src https:\/\/synthetic.supabase.co https:\/\/submit.example.org https:\/\/ai.example.org;/);
    assert.ok(makeZip(result.files).equals(makeZip(assemble({root, config}).files)));
    fs.appendFileSync(path.join(root, 'background.js'), '\nconst forbidden = "sb_secret_SYNTHETIC_FOR_BUILD_TEST";');
    assert.throws(() => assemble({root, config}), /비밀값/);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});

test('검토 전용 산출물은 네트워크 권한과 연결을 차단하며 개발 영역 경계 오류를 거절한다', () => {
  const result = assemble({reviewOnly:true});
  assert.deepEqual(result.manifest.host_permissions, []);
  assert.match(result.manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.match(result.files['submission-config.js'].toString(), /"authUrl":""/);
  assert.match(result.manifest.name, /검토 전용/);
  assert.throws(() => assemble({reviewOnly:true, config}));
  for (const source of ['// @development-start\nunfinished', '// @development-end']) assert.throws(() => stripDevelopment(source));
});

function panelFixture(files, fetchImpl) {
  const html = files['sidepanel.html'].toString(), elements = {};
  for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const id = tag[1];
    elements[id] = {value:id === 'structure' ? 'claim' : '', hidden:/\shidden\b/.test(tag[0]), disabled:/\sdisabled\b/.test(tag[0]), checked:false, textContent:'', attrs:{}, handlers:{}, selectedOptions:[{textContent:'주장–근거'}], classList:{toggle(){}},
      setAttribute(k,v){this.attrs[k]=v;}, removeAttribute(k){delete this.attrs[k];}, addEventListener(k,v){this.handlers[k]=v;}, focus(){}, reset(){}, append(){}};
  }
  const tab = {id:1, windowId:2, url:'https://article.example.org/synthetic', title:'합성 제목'}, events = {}, calls = {blur:0, restore:0, network:0};
  const chrome = {windows:{getCurrent:async()=>({id:2})}, scripting:{executeScript:async()=>{}}, tabs:{
    query:async()=>[tab], get:async()=>tab,
    onActivated:{addListener(fn){events.activate=fn;}}, onUpdated:{addListener(fn){events.update=fn;}},
    connect:()=>({onDisconnect:{addListener(){}}, disconnect(){}}),
    sendMessage:async(_id, message)=>{if(message.action==='EXTRACT_ARTICLE')return {status:'success', text:'직접 작성한 가상 글입니다.', wordCount:4, charCount:15, token:'synthetic'};
      if(message.enabled)calls.blur++;else calls.restore++;return {status:'success', enabled:!!message.enabled};}
  }};
  const context = vm.createContext({document:{getElementById:id=>elements[id] || null, querySelectorAll:()=>[]}, chrome, URL, URLSearchParams, TextEncoder, AbortController, setTimeout, clearTimeout,
    crypto:globalThis.crypto, structuredClone, atob, btoa,
    confirm:()=>true, MutationObserver:class {observe(){}}, fetch:async(...args)=>{calls.network++;if(fetchImpl)return fetchImpl(...args);throw Error('NETWORK_BLOCKED');}});
  for (const match of html.matchAll(/<script src="([^"]+)"/g)) vm.runInContext(files[match[1]].toString(), context, {filename:match[1]});
  return {elements, context, events, tab, calls};
}

test('실제 패키지 스크립트는 개발 DOM 없이 읽기·Retell·복원·종료를 실행한다', async () => {
  const t = panelFixture(assemble({reviewOnly:true}).files), e=t.elements;
  await e.analyze.handlers.click();
  assert.equal(e['article-result'].hidden, false);
  await e['start-reading'].handlers.click();
  assert.equal(e.reading.hidden, false);
  assert.equal(vm.runInContext('recommendationGate.canRequest()', t.context), false);
  for (const id of ['main-idea','primary','support','relation']) e[id].value='합성 답안';
  await e.worksheet.handlers.submit({preventDefault(){}});
  assert.equal(t.calls.blur, 1); assert.equal(e['retell-view'].hidden, false);
  e['retell-input'].value='합성 다시 말하기';
  await e['to-review'].handlers.click();
  assert.equal(t.calls.restore, 1); assert.equal(e['review-view'].hidden, false);
  assert.equal(e['summary-retell'].textContent, '합성 다시 말하기');
  // No configured service: submission failure is explicit and preserves inputs.
  e['submission-consent'].checked=true;
  await e['submission-send'].handlers.click();
  assert.match(e['submission-status'].textContent, /설정되지|유지/);
  assert.equal(e['main-idea'].value, '합성 답안');
  await e['end-training'].handlers.click();
  assert.equal(e.preparation.hidden, false); assert.equal(e['main-idea'].value, '');
  assert.equal(t.calls.network, 0);
});

test('원격 설정 설치본도 읽기 중 AI와 과거 기록을 차단하고 탭 전환에서 원문을 복원한다', async () => {
  const t=panelFixture(assemble({config:{...config, articleTestEnabled:true}}).files), e=t.elements;
  await e.analyze.handlers.click(); await e['start-reading'].handlers.click();
  assert.equal(e['article-ai-recommend'].disabled, true); assert.equal(e['ai-result'].hidden, true);
  assert.equal(vm.runInContext('recommendationGate.canRequest()',t.context), false);
  assert.equal(vm.runInContext('recordsCurrent(recordsGeneration)',t.context), false);
  for (const id of ['main-idea','primary','support','relation']) e[id].value='합성 답안';
  await e.worksheet.handlers.submit();
  await t.events.activate({windowId:2, tabId:3});
  assert.equal(e['retell-view'].hidden, true); assert.equal(e.reading.hidden, false); assert.equal(t.calls.restore, 1);
  assert.equal(e.primary.value,'합성 답안'); assert.equal(t.calls.network, 0);
});

test('빌드는 기존 경로를 덮어쓰지 않으며 검토본임을 보고서에 명시한다', () => {
  const label='test-' + require('node:crypto').randomUUID();
  const {destination, report}=build({reviewOnly:true, label});
  try {
    assert.match(report.mode, /review-only/); assert.equal(report.chromeVerified,false); assert.equal(report.remoteVerified,false);
    assert.ok(fs.existsSync(path.join(destination, 'extension.zip')));
    assert.equal(report.runtimeFiles.length, RUNTIME.length+2);
    assert.throws(() => build({reviewOnly:true, label}));
    assert.throws(() => build({reviewOnly:true, label:'../escape'}));
  } finally { fs.rmSync(destination, {recursive:true, force:true}); }
});

test('생성된 설치본의 로그인·최초 제출·재조회가 실제 Worker 경로와 일치하고 루트 주소 404를 재현한다', async () => {
  const {createHandler}=await import('../server/submissions/worker.mjs');
  for (const legacyRoot of [true, false]) {
    let row=null, databaseWrites=0;
    const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', recordId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const env={SUPABASE_URL:config.authUrl, SUPABASE_PUBLISHABLE_KEY:config.publicKey, ALLOWED_ORIGIN:'chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb'};
    const worker=createHandler(async(url, options)=>{
      const route=new URL(url).pathname;
      if(route==='/auth/v1/user')return Response.json({id:owner});
      if(route==='/rest/v1/rpc/is_active_pilot_member')return Response.json(true);
      if(route==='/rest/v1/pilot_revisions')return Response.json([]);
      assert.equal(route,'/rest/v1/pilot_submissions');
      if(options.method==='POST'){
        databaseWrites++;row={...JSON.parse(options.body),id:recordId,saved_at:'2026-11-10T00:00:00Z'};
        return new Response(null,{status:201});
      }
      return Response.json(row&&new URL(url).searchParams.get('limit')!=='0'?[row]:[]);
    });
    const paths=[];
    const fetchImpl=async(url, options)=>{
      const route=new URL(url);
      if(route.origin===config.authUrl){
        if(route.pathname==='/auth/v1/token')return Response.json({access_token:'synthetic-account-token'});
        assert.equal(route.pathname,'/rest/v1/rpc/is_active_pilot_member');return Response.json(true);
      }
      assert.equal(route.origin,new URL(config.endpoint).origin);
      paths.push(route.pathname);
      // Browser-added Origin on POST; extension GET may omit it.
      const headers={...options.headers,...(options.method==='POST'?{Origin:env.ALLOWED_ORIGIN}:{})};
      return worker(new Request(url,{...options,headers}),env);
    };
    const files=assemble({config}).files;
    if(legacyRoot)files['submission-config.js']=Buffer.from(files['submission-config.js'].toString().replace(config.endpoint,new URL(config.endpoint).origin));
    const t=panelFixture(files,fetchImpl), e=t.elements;
    e['ai-email'].value='synthetic@example.invalid';e['ai-password'].value='synthetic-only';
    await e['account-form'].handlers.submit({preventDefault(){}});
    assert.equal(e['account-form'].hidden,true);
    await e.analyze.handlers.click();await e['start-reading'].handlers.click();
    for(const id of ['main-idea','primary','support','relation'])e[id].value='합성 답안';
    await e.worksheet.handlers.submit();e['retell-input'].value='합성 다시 말하기';await e['to-review'].handlers.click();
    e['submission-consent'].checked=true;await e['submission-send'].handlers.click();
    if(legacyRoot){
      assert.match(e['submission-status'].textContent,/저장 요청 실패 \(404\)/);
      assert.equal(databaseWrites,0);assert.equal(e['main-idea'].value,'합성 답안');
      assert.equal(vm.runInContext('panelFlow().verifiedSnapshot()',t.context),null);
      assert.deepEqual(paths,['/']);
    } else {
      assert.match(e['submission-status'].textContent,/저장 및 재조회 확인이 완료/);
      assert.equal(databaseWrites,1);assert.equal(row.main_idea,'합성 답안');
      assert.deepEqual(paths,['/submissions','/submissions']);
      assert.equal(vm.runInContext('panelFlow().verifiedSnapshot().mainIdea',t.context),'합성 답안');
      assert.equal(e['feedback-section'].hidden,false);
      const io=vm.runInContext('RecordClient.create({endpoint:SubmissionConfig.endpoint,getToken:()=>panelFlow().getToken()})',t.context);
      const records=await io.list();
      assert.equal(records.items.length,1);assert.equal(records.items[0].submissionId,recordId);
      assert.deepEqual(paths,['/submissions','/submissions','/submissions/records','/submissions/records']);
    }
  }
});

test('설치본의 제출 장애 복구는 실제 Worker와 연결해 원래 답안·동일 요청·단일 저장을 보존한다', async t => {
  const {createHandler}=await import('../server/submissions/worker.mjs');
  for(const mode of ['offline','lost-save-response','expired-save','expired-read']) await t.test(mode,async()=>{
    const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', recordId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const env={SUPABASE_URL:config.authUrl,SUPABASE_PUBLISHABLE_KEY:config.publicKey,ALLOWED_ORIGIN:'chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb'};
    let row=null, writes=0, rejectIdentity=false, faultPending=true, logins=0;
    const attempts=[];
    const worker=createHandler(async(url,options)=>{
      const route=new URL(url);
      if(route.pathname==='/auth/v1/user')return rejectIdentity?Response.json({},{status:401}):Response.json({id:owner});
      if(route.pathname==='/rest/v1/rpc/is_active_pilot_member')return Response.json(true);
      assert.equal(route.pathname,'/rest/v1/pilot_submissions');
      if(options.method==='POST'){
        const next=JSON.parse(options.body);
        if(row){assert.equal(row.session_id,next.session_id);return new Response(null,{status:409});}
        row={...next,id:recordId,saved_at:'2026-11-10T00:00:00Z'};writes++;
        return new Response(null,{status:201});
      }
      return Response.json(row?[row]:[]);
    });
    const fetchImpl=async(url,options)=>{
      const route=new URL(url);
      if(route.origin===config.authUrl){
        if(route.pathname==='/auth/v1/token')return Response.json({access_token:'synthetic-token-'+(++logins)});
        assert.equal(route.pathname,'/rest/v1/rpc/is_active_pilot_member');return Response.json(true);
      }
      assert.equal(route.origin,new URL(config.endpoint).origin);
      if(options.method==='POST') attempts.push({payload:JSON.parse(options.body),key:options.headers['Idempotency-Key']});
      const inject=faultPending && (mode==='expired-read'?options.method==='GET':options.method==='POST');
      if(inject){
        faultPending=false;
        if(mode==='offline')throw new TypeError('synthetic offline');
        rejectIdentity=mode.startsWith('expired-');
      }
      const response=await worker(new Request(url,{...options,headers:{...options.headers,...(options.method==='POST'?{Origin:env.ALLOWED_ORIGIN}:{})}}),env);
      rejectIdentity=false;
      if(inject && mode==='lost-save-response')throw new TypeError('synthetic response lost after write');
      return response;
    };
    const fixture=panelFixture(assemble({config}).files,fetchImpl),e=fixture.elements;
    const signIn=async email=>{
      e['ai-email'].value=email;e['ai-password'].value='synthetic-only';
      await e['account-form'].handlers.submit({preventDefault(){}});
    };
    await signIn('owner@example.invalid');
    await e.analyze.handlers.click();await e['start-reading'].handlers.click();
    for(const id of ['main-idea','primary','support','relation'])e[id].value='최초 합성 답안';
    await e.worksheet.handlers.submit();e['retell-input'].value='합성 인출';await e['to-review'].handlers.click();
    e['submission-consent'].checked=true;await e['submission-send'].handlers.click();
    assert.equal(vm.runInContext('panelFlow().verifiedSnapshot()',fixture.context),null);
    assert.equal(e['main-idea'].value,'최초 합성 답안');
    assert.equal(e['feedback-section'].hidden,true);
    assert.doesNotMatch(e['submission-status'].textContent,/확인이 완료/);
    if(mode.startsWith('expired-')){
      assert.equal(e['account-form'].hidden,false,'401이면 제출을 버리지 않고 같은 계정 재로그인을 제공해야 한다');
      assert.match(e['submission-status'].textContent,/만료.*같은 계정/);
      const previousLogins=logins;
      await signIn('other@example.invalid');
      assert.equal(logins,previousLogins,'다른 계정으로 대기 제출을 옮기는 로그인은 전송 전에 차단');
      assert.match(e['account-status'].textContent,/같은 계정/);
      await signIn('owner@example.invalid');assert.equal(e['account-form'].hidden,true);
    }
    e['main-idea'].value='실패 후 편집한 답안';
    await e['submission-send'].handlers.click();
    assert.match(e['submission-status'].textContent,/저장 및 재조회 확인이 완료/);
    assert.equal(writes,1);assert.equal(row.main_idea,'최초 합성 답안');
    assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);
    assert.equal(e['main-idea'].value,'실패 후 편집한 답안');
    assert.equal(vm.runInContext('panelFlow().verifiedSnapshot().mainIdea',fixture.context),'최초 합성 답안');
    assert.equal(e['feedback-section'].hidden,false);
  });
});

test('설치본은 AI 한도·장애 후에도 직접 제출·수정 저장을 허용하고 읽기 중 AI 재요청을 차단한다',async t=>{
  for(const aiStatus of [429,503])await t.test(String(aiStatus),async()=>{
    const recordId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let snapshot=null,revision=null,aiCalls=0;
    const fetchImpl=async(url,options)=>{
      const route=new URL(url);
      if(route.origin===config.authUrl){
        if(route.pathname==='/auth/v1/token')return Response.json({access_token:'synthetic-only'});
        assert.equal(route.pathname,'/rest/v1/rpc/is_active_pilot_member');return Response.json(true);
      }
      if(route.origin===new URL(config.aiEndpoint).origin){
        aiCalls++;return Response.json({error:aiStatus===429?'limit':'unavailable'},{status:aiStatus});
      }
      assert.equal(route.origin,new URL(config.endpoint).origin);
      if(route.pathname==='/submissions'){
        if(options.method==='POST')snapshot=JSON.parse(options.body);
        return Response.json({status:'saved',submissionId:recordId,savedAt:'2026-11-10T00:00:00Z',...(options.method==='GET'?{payload:snapshot}:{})});
      }
      if(route.searchParams.get('capabilities')==='1')return Response.json({recordsApiVersion:1,ready:true});
      assert.ok(route.pathname.startsWith('/submissions/records/'+recordId+'/revisions'));
      if(options.method==='POST'){
        const body=JSON.parse(options.body);
        revision={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',requestId:body.requestId,savedAt:'2026-11-10T00:01:00Z',answers:body.answers};
      }
      return Response.json({status:'saved',revision});
    };
    const fixture=panelFixture(assemble({config:{...config,articleTestEnabled:true,feedbackTestEnabled:true}}).files,fetchImpl),e=fixture.elements;
    e['ai-email'].value='synthetic@example.invalid';e['ai-password'].value='synthetic-only';
    await e['account-form'].handlers.submit({preventDefault(){}});
    await e.analyze.handlers.click();e['article-ai-consent'].checked=true;
    await e['article-ai-recommend'].handlers.click();
    assert.equal(aiCalls,1);assert.equal(e['ai-result'].hidden,true);
    assert.match(e['article-ai-status'].textContent,aiStatus===429?/한도/:/실패/);
    await e['start-reading'].handlers.click();
    // Even a forced button state cannot bypass the reading-stage request gate.
    e['article-ai-recommend'].disabled=false;e['article-ai-consent'].checked=true;
    e['article-ai-preview'].value='직접 작성한 가상 글입니다.';
    await e['article-ai-recommend'].handlers.click();assert.equal(aiCalls,1);
    for(const id of ['main-idea','primary','support','relation'])e[id].value='직접 쓴 합성 답안';
    await e.worksheet.handlers.submit();e['retell-input'].value='직접 인출';await e['to-review'].handlers.click();
    e['submission-consent'].checked=true;await e['submission-send'].handlers.click();
    assert.match(e['submission-status'].textContent,/저장 및 재조회 확인이 완료/);
    e['feedback-consent'].checked=true;await e['feedback-request'].handlers.click();
    assert.equal(aiCalls,2);assert.equal(e['feedback-result'].textContent,'');
    assert.match(e['feedback-status'].textContent,aiStatus===429?/한도/:/실패/);
    e['feedback-main'].value='AI 없이 직접 고친 합성 답안';
    await e['revision-save'].handlers.click();
    assert.match(e['revision-status'].textContent,/저장 및 재조회 확인/);
    assert.equal(revision.answers.mainIdea,'AI 없이 직접 고친 합성 답안');
    assert.equal(snapshot.mainIdea,'직접 쓴 합성 답안');assert.equal(aiCalls,2);
  });
});

test('Google 설치본은 identity만 선택적으로 추가하고 비밀/임의 OAuth 설정을 거부한다',()=>{
  const result=assemble({config:{...config,googleLoginEnabled:true}});
  assert.deepEqual(result.manifest.permissions,['sidePanel','activeTab','scripting','identity']);
  assert.equal(result.manifest.host_permissions.some(host=>host.includes('google')),false);
  assert.ok(!assemble({config}).manifest.permissions.includes('identity'));
  assert.ok(!assemble({reviewOnly:true}).manifest.permissions.includes('identity'));
  assert.throws(()=>assemble({config:{...config,googleLoginEnabled:'true'}}));
  assert.throws(()=>assemble({config:{...config,googleClientSecret:'synthetic-only'}}));
});

test('Google 설치본은 검증된 계정의 사전 등록 승인 후 로그인하고 만료 시 같은 UID로 원래 제출을 재시도한다',async()=>{
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let eligible=false,currentUser=owner,claims=0,expire=true,payload=null,saves=0;
  const fetchImpl=async(url,options)=>{
    const route=new URL(url);
    if(route.origin===config.authUrl){
      if(route.pathname==='/auth/v1/token'){
        assert.equal(route.searchParams.get('grant_type'),'pkce');return Response.json({access_token:'synthetic-'+currentUser,user:{id:currentUser}});
      }
      if(route.pathname==='/auth/v1/user')return Response.json({id:currentUser,email:currentUser===owner?'owner@example.invalid':'other@example.invalid',email_confirmed_at:'2026-11-10T00:00:00Z',identities:[{provider:'google',identity_data:{email:currentUser===owner?'owner@example.invalid':'other@example.invalid',email_verified:true}}]});
      if(route.pathname.endsWith('/claim_google_pilot_access')){claims++;assert.deepEqual(JSON.parse(options.body),{});return Response.json(eligible);}
      assert.ok(route.pathname.endsWith('/is_active_pilot_member'));return Response.json(true);
    }
    assert.equal(route.pathname,'/submissions');
    if(expire){expire=false;return Response.json({error:'unauthorized'},{status:401});}
    if(options.method==='POST'){payload=JSON.parse(options.body);saves++;}
    return Response.json({status:'saved',submissionId:other,savedAt:'2026-11-10T00:00:00Z',...(options.method==='GET'?{payload}:{})});
  };
  const fixture=panelFixture(assemble({config:{...config,googleLoginEnabled:true}}).files,fetchImpl),e=fixture.elements;
  fixture.context.chrome.runtime={id:'jenapgoakhnmlmjcdnkfakkkgjobbfbb'};
  fixture.context.chrome.identity={getRedirectURL:path=>'https://jenapgoakhnmlmjcdnkfakkkgjobbfbb.chromiumapp.org/'+path,launchWebAuthFlow:async({url})=>{const callback=new URL(new URL(url).searchParams.get('redirect_to'));callback.searchParams.set('code','synthetic-code');return callback.href;}};
  assert.equal(e['account-form'].hidden,true);assert.equal(e['account-google'].hidden,false);
  await e['account-google-login'].handlers.click();assert.match(e['account-status'].textContent,/사전 등록/);
  assert.equal(vm.runInContext('panelFlow().getToken()',fixture.context),null);
  eligible=true;await e['account-google-login'].handlers.click();assert.equal(e['account-google'].hidden,true);
  assert.match(e['account-identity'].textContent,/owner@example.invalid/);
  await e.analyze.handlers.click();await e['start-reading'].handlers.click();
  for(const id of ['main-idea','primary','support','relation'])e[id].value='Google 합성 답안';
  await e.worksheet.handlers.submit();e['retell-input'].value='합성 인출';await e['to-review'].handlers.click();
  e['submission-consent'].checked=true;await e['submission-send'].handlers.click();
  assert.equal(e['account-google'].hidden,false);assert.equal(e['main-idea'].value,'Google 합성 답안');
  const before=claims;currentUser=other;await e['account-google-login'].handlers.click();
  assert.equal(claims,before);assert.match(e['account-status'].textContent,/같은 Google/);
  currentUser=owner;await e['account-google-login'].handlers.click();await e['submission-send'].handlers.click();
  assert.equal(saves,1);assert.match(e['submission-status'].textContent,/저장 및 재조회 확인이 완료/);
});
