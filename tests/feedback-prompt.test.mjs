import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFeedback, callFeedback, feedbackDiagnostic} from '../server/ai/feedback.mjs';
const summary='이 글은 도시 숲이 열섬을 줄인다고 주장한다. 그 이유로 그늘과 증산 작용을 든다.';
const base={analysis:{topic:'도시 숲의 효과',keyIdeas:['a','b','c','d','e'],coverage:['포함','포함','누락','부분 포함','포함']},overall:'주장을 자기 말로 잡았습니다.',criteria:[{name:'핵심 내용 포함',reason:'r'},{name:'변형/자기 언어화',reason:'r'},{name:'정확성',reason:'r'},{name:'구조/응집성',reason:'r'}],strengths:[{quote:'도시 숲이 열섬을 줄인다고 주장한다',comment:'c'}],improvements:[{quote:'“그 이유로 그늘과  증산 작용을 든다.”',direction:'d'}],missingIdea:'관리 비용'};
const clone=()=>structuredClone(base);
test('정상 응답은 analysis를 빼고 표시용 필드만 반환한다',()=>{
  const out=parseFeedback(clone(),summary);
  assert.deepEqual(Object.keys(out).sort(),['criteria','improvements','missingIdea','overall','strengths']);
  assert.equal(out.missingIdea,'관리 비용');
});
test('요약에 없는 문장을 인용하면(고쳐 쓴 예시 의심) 거절한다',()=>{
  const r=clone();r.improvements[0].quote='도시 숲은 그늘과 증산 작용으로 열섬을 완화한다.';
  assert.throws(()=>parseFeedback(r,summary));
});
test('점수 필드·항목 중복·개수 초과·꺾쇠는 거절한다',()=>{
  const cases=[r=>{r.score=3},r=>{r.criteria[0].name=r.criteria[1].name},r=>{r.strengths.push(...r.strengths,...r.strengths)},r=>{r.overall='<b>x</b>'},r=>{r.analysis.keyIdeas.pop()},r=>{r.analysis.coverage[0]='있음'},r=>{r.criteria[0].score=2},r=>{r.nextStep='다음 글에서는'}];
  for(const mutate of cases){const r=clone();mutate(r);assert.throws(()=>parseFeedback(r,summary));}
});
test('누락 아이디어 빈 문자열은 허용한다',()=>{const r=clone();r.missingIdea='';assert.equal(parseFeedback(r,summary).missingIdea,'');});
test('공급자에는 요약·참고 자료를 분리해 보내고 응답 길이 제한 안에서 파싱한다',async()=>{
  let sent;const fetchImpl=async(_u,init)=>{sent=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(base)}}]});};
  const out=await callFeedback('k',fetchImpl,'원문',{structure_type:'claim',main_idea:'m',primary_text:'p',support_text:'s',relation_text:'r',retell:summary});
  assert.equal(out.criteria[1].name,'변형/자기 언어화');
  assert.match(sent.messages[0].content,/중급 루브릭/);assert.match(sent.messages[0].content,/예시 문장·완성 답안은 절대 쓰지 마세요/);
  assert.doesNotMatch(sent.messages[0].content,/초급 루브릭|다음 단계 제안 1개/);
  assert.equal(JSON.parse(sent.messages[1].content).summary,summary);
  const example=sent.messages[0].content.split('다음 JSON 객체만 출력하세요:\n')[1];
  const json=JSON.parse(example);assert.equal(json.analysis.coverage.length,5);assert.equal(json.criteria.length,4);
  assert.match(sent.messages[0].content,/overall 400/);
});

test('기준 순서만 다르면 이름으로 정렬하며, 따옴표만 있는 인용은 거절한다',()=>{
 const r=clone();r.criteria.reverse();assert.deepEqual(parseFeedback(r,summary).criteria,base.criteria);
 r.strengths[0].quote='“”';assert.throws(()=>parseFeedback(r,summary),e=>e.code==='feedback_strength_quote');
});

test('공급자·JSON·빈 출력·종료 사유·세부 검증 오류를 안전한 코드로 분리한다',async()=>{
 const envelope=content=>Response.json({choices:[{finish_reason:'stop',message:{content}}]});
 const cases=[
  ['provider_http',async()=>new Response('SYNTHETIC_PRIVATE_PAYLOAD',{status:429}),{upstreamStatus:429}],
  ['provider_network',async()=>{throw Error('SYNTHETIC_PRIVATE_PAYLOAD')},{}],
  ['provider_json',async()=>new Response('SYNTHETIC_PRIVATE_PAYLOAD'),{}],
  ['provider_empty',async()=>envelope('   '),{}],
  ['provider_shape',async()=>Response.json({choices:[null]}),{}],
  ['provider_finish',async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{'}}]}),{finishReason:'length'}],
  ['feedback_json',async()=>envelope('{'),{}],
  ['feedback_analysis',async()=>{const r=clone();r.analysis.coverage=[];return envelope(JSON.stringify(r));},{}],
  ['feedback_improvement_quote',async()=>{const r=clone();r.improvements[0].quote='SYNTHETIC_PRIVATE_PAYLOAD';return envelope(JSON.stringify(r));},{}]
 ];
 for(const [code,transport,details] of cases){let calls=0;await assert.rejects(callFeedback('synthetic-key',(...args)=>{calls++;return transport(...args)},'합성 원문',{retell:summary}),e=>{assert.deepEqual(feedbackDiagnostic(e),{code,...details});assert.doesNotMatch(JSON.stringify(feedbackDiagnostic(e)),/SYNTHETIC_PRIVATE/);return true;});assert.equal(calls,1);}
 assert.deepEqual(feedbackDiagnostic(Object.assign(Error('private'),{code:'forged',details:{upstreamStatus:403}})),{code:'provider_unknown'});
});

test('timeout은 별도 코드이며 모델 재전송 없이 종료한다',async()=>{
 const original=setTimeout;globalThis.setTimeout=(fn,ms)=>original(fn,ms===50000?1:ms);
 try{await assert.rejects(callFeedback('synthetic',(_u,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('private')))),'합성',{retell:summary}),e=>e.code==='provider_timeout');}finally{globalThis.setTimeout=original;}
});
test('잘린 응답(finish_reason length)은 거절한다',async()=>{
  const fetchImpl=async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{'}}]});
  await assert.rejects(callFeedback('k',fetchImpl,'원문',{retell:summary}));
});

test('선택 설명 미작성도 동일한 Retell 루브릭·응답 형식으로 요청하며 누락/감점하지 않도록 지시한다',async()=>{
  let sent; const fake=async(_url,init)=>{sent=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(base)}}]});};
  const out=await callFeedback('synthetic-key',fake,'합성 원문',{structure_type:'claim',main_idea:'합성',primary_text:'합성',support_text:'합성',relation_text:'',retell:summary});
  assert.equal(JSON.parse(sent.messages[1].content).reference.relation,'');
  assert.match(sent.messages[0].content,/빈 문자열은 정상적인 미작성/);
  assert.match(sent.messages[0].content,/이해 부족·누락·감점 근거로 삼거나 설명 작성을 의무적으로 요구하지 마세요/);
  assert.deepEqual(Object.keys(out).sort(),['criteria','improvements','missingIdea','overall','strengths']);
});

test('지원받은 Retell의 모델 입력에는 최소 지원 맥락만 추가하고 그래프·ID·미사용 후보는 제외한다',async()=>{
 let sent;const fake=async(_url,init)=>{sent=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(base)}}]});};
 await callFeedback('synthetic',fake,'합성 원문',{structure_type:'claim',main_idea:'합성',primary_text:'합성 발췌',support_text:'합성 발췌',relation_text:'',retell:summary,learning_support:{mode:'guided',candidateExposure:true,graph:{nodes:[{id:'n1',sentenceId:'s0001',source:'ai_candidate',text:'합성 발췌'}],edges:[]},candidateIds:['s0001','s0002']}});
 const reference=JSON.parse(sent.messages[1].content).reference;
 assert.deepEqual(reference.learningSupport,{mode:'guided',candidateExposure:true,sources:['ai_candidate']});
 assert.doesNotMatch(sent.messages[1].content,/candidateIds|sentenceId|n1|s0001|edges/);
 assert.match(sent.messages[0].content,/발췌는 학습자가 창작한 문장으로 칭찬하거나 감점하지 마세요/);
});
