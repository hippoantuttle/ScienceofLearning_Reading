'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const Source = require('../sentence-source.js'), Contract = require('../reading-support-contract.js'), Support = require('../reading-support.js');
// All passages and responses in this file are synthetic.
const article = '마을 도서관은 주말에도 문을 연다. 주민들이 주말 운영을 요청했다. 자원봉사자들이 운영을 돕는다.';
const snapshot = Source.segment(article), requestId = '11111111-1111-4111-8111-111111111111';
const documentHash = 'sha256:' + createHash('sha256').update(article).digest('hex');
const envelope = (extra = {}) => ({kind:'reading-candidates',schemaVersion:1,requestId,documentHash,segmentationVersion:'sentence-v1',promptVersion:'reading-candidates-v1',modelId:'fixture-model',candidateIds:['s0003','s0001','s0002'],...extra});
const context = {requestId, documentHash, sentences:snapshot.sentences};
const nodes = () => snapshot.sentences.slice(0,2).map((s,i) => ({id:'n'+i,sentenceId:s.id,text:s.text,role:i?'support':'primary',source:'ai_candidate',order:i}));
const graph = () => ({nodes:nodes(),edges:[{from:'n1',to:'n0',relationType:'supports'}]});
const graphContext = {structureType:'claim',sentences:snapshot.sentences,candidateIds:['s0001','s0002','s0003']};
const gate = extra => Support.create({article,accountId:'synthetic-account',mode:'guided',enabled:true,...extra});
const options = {consent:true,requestId};

test('분할은 원문 UTF-16 인덱스·인용부호·보조문자·중복 문장·줄바꿈을 보존한다', async () => {
  const text = '  “😀 도서관이 열린다!”\r\n같은 문장. 같은 문장.\n마지막 문장';
  const out = Source.segment(text);
  assert.deepEqual(out.sentences.map(s => s.text), ['“😀 도서관이 열린다!”','같은 문장.','같은 문장.','마지막 문장']);
  assert.equal(new Set(out.sentences.map(s => s.id)).size,4);
  for (const s of out.sentences) assert.equal(s.text,text.slice(s.start,s.end));
  assert.equal(out.article,text);
  assert.equal(await Source.hash(article),documentHash);
  assert.notEqual(await Source.hash(article+' '),documentHash);
});

test('소수·영문 약어·목록 번호는 단독 문장으로 잘리지 않고 긴 원문은 절단하지 않는다', () => {
  const out = Source.segment('Dr. Kim met a U.S. reader.\n1. 비용은 3.5원이다.\n2. 다음 항목이다.');
  assert.deepEqual(out.sentences.map(s => s.text), ['Dr. Kim met a U.S. reader.','1. 비용은 3.5원이다.','2. 다음 항목이다.']);
  for (const text of ['a'.repeat(12001),'\ud800','abc\0def','  ']) assert.throws(() => Source.segment(text));
});

test('후보는 ID만 수용하고 원문 순서로 정렬한다. 설명·정답·알 수 없는 ID는 전체 거절한다', () => {
  assert.deepEqual(Contract.response(envelope(),context),['s0001','s0002','s0003']);
  for (const extra of [{reason:'추천 이유'},{structureType:'claim'},{summary:'정답'},{candidateIds:['s0001','s0001','s0002']},{candidateIds:['s0001','s0002','s9999']},{candidateIds:['s0001']},{requestId:'other'},{documentHash:'sha256:'+'0'.repeat(64)},{segmentationVersion:'next'}]) assert.throws(() => Contract.response(envelope(extra),context));
  assert.deepEqual(Contract.candidateIds({candidateIds:['s0002','s0001']},snapshot.sentences.slice(0,2)),['s0001','s0002']);
});

test('요청은 글·고정 버전·요청 ID만 허용하며 답안·URL·제목·한 문장 입력은 거절한다', () => {
  const req = {schemaVersion:1,requestId,segmentationVersion:Source.VERSION,article};
  assert.deepEqual(Contract.request(req),snapshot);
  for (const extra of [{retell:'합성 답안'},{title:'제목'},{url:'https://example.invalid'},{article:'한 문장.'}]) assert.throws(() => Contract.request({...req,...extra}));
});

test('그래프는 양쪽 역할·직접 연결·원문 발췌·출처·배치 순서를 검증한다', () => {
  const value = graph();
  assert.deepEqual(Contract.textFields(value,graphContext),{primary:snapshot.sentences[0].text,support:snapshot.sentences[1].text});
  const mutations = [g=>g.edges=[],g=>g.edges.push({...g.edges[0]}),g=>g.edges[0].to='n1',g=>g.edges[0].to='n99',g=>g.edges[0].relationType='causes',g=>g.nodes[0].text='AI가 새로 쓴 문장',g=>g.nodes[0].source='learner_added',g=>g.nodes[0].role='support',g=>g.nodes[1].order=0,g=>g.nodes.push({...nodes()[0],id:'n2',order:2}),g=>g.nodes.push({...snapshot.sentences[2],id:'n2',sentenceId:'s0003',role:'support',source:'ai_candidate',order:2})];
  for (const mutate of mutations) { const g = graph(); mutate(g); assert.throws(() => Contract.graph(g,graphContext)); }
  assert.deepEqual(graph(),value,'검증·직렬화가 입력 그래프를 변경하지 않는다');
});

test('원인·문제 유형은 학습자가 지정한 방향을 검사하며 연결을 자동 생성하지 않는다', () => {
  for (const [structureType,type,from,to] of [['cause','causes','n0','n1'],['problem','addresses','n1','n0']]) {
    const g = {nodes:nodes(),edges:[{from,to,relationType:type}]};
    assert.doesNotThrow(() => Contract.graph(g,{...graphContext,structureType}));
    g.edges[0] = {from:to,to:from,relationType:type};
    assert.throws(() => Contract.graph(g,{...graphContext,structureType}));
  }
  const local = graph(); local.nodes.forEach(n => n.source='learner_added');
  assert.doesNotThrow(() => Contract.graph(local,{...graphContext,candidateIds:[]}));
});

test('초급 편집은 빈 유형·역할·연결에서 시작하고 배치와 명시 연결을 모두 해야 직렬화한다', () => {
  const editor=Support.createEditor({article,candidateIds:['s0001','s0002']});
  assert.deepEqual(editor.read(),{structureType:null,nodes:[],edges:[]});
  editor.add('s0001');editor.add('s0002');editor.add('s0003');
  assert.equal(editor.read().nodes[0].role,null);assert.equal(editor.read().nodes[2].source,'learner_added');
  assert.throws(()=>editor.place('n1','primary'));editor.selectType('claim');
  editor.place('n1','primary');editor.place('n2','support');editor.place('n3','support');
  assert.deepEqual(editor.read().edges,[]);assert.throws(()=>editor.validate());
  assert.throws(()=>editor.connect('n2','n1'));editor.connect('n2','n1','supports');
  assert.throws(()=>editor.validate(),'연결되지 않은 사용 카드는 미완성');
  editor.exclude('n3');assert.deepEqual(editor.textFields(),{primary:snapshot.sentences[0].text,support:snapshot.sentences[1].text});
  const previous=editor.read();editor.selectType('cause');
  assert.deepEqual(editor.read().nodes,previous.nodes);assert.deepEqual(editor.read().edges,previous.edges);
  assert.throws(()=>editor.validate());editor.disconnect('n2','n1');editor.connect('n1','n2','causes');assert.doesNotThrow(()=>editor.validate());
  const detached=editor.read();detached.nodes[0].text='외부 변경';assert.equal(editor.read().nodes[0].text,snapshot.sentences[0].text);
});

test('후보 제외와 원문 추가는 재생성하지 않으며 카드 상한·중복·자기 연결을 지킨다', () => {
  const editor=Support.createEditor({article:Array.from({length:9},(_,i)=>'합성 문장 '+i+'.').join(' ')});
  editor.selectType('claim');for(let i=1;i<=8;i++)editor.add('s'+String(i).padStart(4,'0'));
  assert.throws(()=>editor.add('s0009'));assert.throws(()=>editor.add('s0001'));
  editor.place('n1','primary');editor.place('n2','support');assert.throws(()=>editor.connect('n1','n1','supports'));
  editor.connect('n2','n1','supports');assert.throws(()=>editor.connect('n2','n1','supports'));
  editor.exclude('n1');assert.deepEqual(editor.read().edges,[]);editor.add('s0009');
  assert.deepEqual(editor.read().nodes.map(n=>n.order),[0,1,2,3,4,5,6,7]);
});

test('블록 재배열은 출처·역할·연결 ID를 보존하고 유효하지 않은 순서는 작업을 바꾸지 않는다',()=>{
  const editor=Support.createEditor({article,candidateIds:['s0001','s0002']});editor.selectType('claim');
  for(const id of ['s0001','s0002','s0003'])editor.add(id);
  editor.place('n1','primary');editor.place('n2','support');editor.place('n3','support');editor.connect('n2','n1','supports');editor.connect('n3','n1','supports');
  const before=editor.read();editor.reorder(['n3','n1','n2']);const moved=editor.validate();
  assert.deepEqual(moved.edges,before.edges);assert.deepEqual(moved.nodes.map(n=>[n.id,n.role,n.source,n.order]),[['n3','support','learner_added',0],['n1','primary','ai_candidate',1],['n2','support','ai_candidate',2]]);
  const saved=editor.read();for(const ids of [['n1','n2'],['n1','n1','n2'],['n1','n2','n9'],null]){assert.throws(()=>editor.reorder(ids));assert.deepEqual(editor.read(),saved);}
});

test('모드 선택·시작만으로 호출하지 않으며 동의·웹·초급·스위치·계정 검사를 함수에서도 한다', async () => {
  let calls = 0; const adapter = async () => { calls++; return envelope(); };
  for (const extra of [{mode:'independent'},{enabled:false},{accountId:null},{kind:'pdf'},{article:'한 문장.'}]) {
    const session = gate(extra); session.start(); await assert.rejects(session.request(adapter,options),/not_allowed/);
  }
  const session = gate(); await assert.rejects(session.request(adapter,options)); session.start();
  await assert.rejects(session.request(adapter,{...options,consent:false})); assert.equal(calls,0);
  const shown = await session.request(adapter,options); assert.equal(calls,1);
  assert.equal(session.state().candidateExposure,false); assert.deepEqual(session.visibleCandidates(),[]);
  assert.equal(session.markExposed(shown.generation),true); assert.equal(session.visibleCandidates().length,3);
  await assert.rejects(session.request(adapter,options));
  session.continueManually(); assert.equal(session.state().candidateExposure,true); assert.deepEqual(session.visibleCandidates(),[]);
});

test('구조화 시작·직접 작성·세션 폐기 뒤의 늦은 성공/실패는 표시·재시도되지 않는다', async () => {
  for (const action of ['beginStructuring','continueManually','dispose']) for (const failure of [false,true]) {
    const session = gate(); session.start(); let finish, signal;
    const pending = session.request((_body,init) => { signal=init.signal; return new Promise((resolve,reject) => {finish = failure ? () => reject(Error('remote details')) : () => resolve(envelope());}); },options);
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    session[action](); assert.equal(signal.aborted,true); finish(); assert.equal(await pending,null);
    assert.deepEqual(session.visibleCandidates(),[]); assert.equal(session.state().candidateExposure,false);
    await assert.rejects(session.request(async()=>envelope(),options));
  }
});

test('실패만 명시 재시도 1회, 권한·한도 거절에는 재전송하지 않고 병렬 요청을 막는다', async () => {
  const session = gate(); session.start(); const fail=async()=>{throw Error('offline');};
  await assert.rejects(session.request(fail,options)); await assert.rejects(session.request(fail,options));
  assert.equal(session.state().attempts,2); await assert.rejects(session.request(fail,options),/not_allowed/);
  for (const status of [401,403,429]) { const s=gate();s.start();await assert.rejects(s.request(async()=>{throw Object.assign(Error('denied'),{status});},options));await assert.rejects(s.request(fail,options),/not_allowed/); }
  const s = gate();s.start();let done;
  const pending=s.request(()=>new Promise(r=>done=r),options); await assert.rejects(s.request(fail,options),/not_allowed/);
  while (!done) await new Promise(resolve=>setImmediate(resolve)); done(envelope()); await pending;
});

test('표시 전 취소는 노출 아님, 표시 후 Retell에서 후보를 숨기고 지원 이력은 유지한다', async () => {
  const early=gate();early.start();const response=await early.request(async()=>envelope(),options);early.beginStructuring();assert.equal(early.markExposed(response.generation),false);
  const session=gate();session.start();const shown=await session.request(async()=>envelope(),options);session.markExposed(shown.generation);
  session.beginStructuring();assert.throws(()=>session.beginMainIdea({nodes:[],edges:[]},'claim'));
  session.beginMainIdea(graph(),'claim');session.beginRetell();
  assert.deepEqual(session.visibleCandidates(),[]);assert.equal(session.state().candidateExposure,true);assert.equal(session.state().phase,'retell');
  await assert.rejects(session.request(async()=>envelope(),options));session.dispose();assert.deepEqual(session.state().candidateIds,[]);
});
