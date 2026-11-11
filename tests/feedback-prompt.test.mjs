import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFeedback, callFeedback} from '../server/ai/feedback.mjs';
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
test('점수 필드·항목 순서 오류·개수 초과·꺾쇠는 거절한다',()=>{
  const cases=[r=>{r.score=3},r=>{r.criteria.reverse()},r=>{r.strengths.push(...r.strengths,...r.strengths)},r=>{r.overall='<b>x</b>'},r=>{r.analysis.keyIdeas.pop()},r=>{r.analysis.coverage[0]='있음'},r=>{r.criteria[0].score=2},r=>{r.nextStep='다음 글에서는'}];
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
});
test('잘린 응답(finish_reason length)은 거절한다',async()=>{
  const fetchImpl=async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{'}}]});
  await assert.rejects(callFeedback('k',fetchImpl,'원문',{retell:summary}));
});
