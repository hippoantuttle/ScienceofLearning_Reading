'use strict';
// TASK-028: 관계 카드 합치기·나누기와 초급 구조도 쌍 묶음. 합성 자료만 사용한다.
const {test} = require('node:test'), assert = require('node:assert/strict');
const RelationPairs = require('../relation-pairs.js');
const Contract = require('../submission-contract.js');

test('카드 1개는 표시 없이 기존 문자열 그대로, 빈 추가 카드는 빠진다', () => {
  assert.deepEqual(RelationPairs.pack([{primary:'합성 주장', support:'합성 근거', relation:''}]), {primary:'합성 주장', support:'합성 근거', relation:''});
  assert.deepEqual(RelationPairs.pack([{primary:'가', support:'나', relation:'다'}, {primary:' ', support:'', relation:''}]), {primary:'가', support:'나', relation:'다'});
  assert.deepEqual(RelationPairs.unpack({primary:'가', support:'나', relation:''}), [{primary:'가', support:'나', relation:''}]);
});

test('카드 여러 개를 합치고 다시 나누면 같은 카드가 된다', () => {
  const cards = [{primary:'주장 하나', support:'근거 하나\n둘째 줄', relation:''}, {primary:'주장 둘', support:'근거 둘', relation:'이유 둘'}, {primary:'주장 셋', support:'근거 셋', relation:''}];
  const packed = RelationPairs.pack(cards);
  assert.equal(packed.primary, '[관계 1]\n주장 하나\n\n[관계 2]\n주장 둘\n\n[관계 3]\n주장 셋');
  assert.match(packed.relation, /^\[관계 1\]\n\n\n\[관계 2\]\n이유 둘/);
  assert.deepEqual(RelationPairs.unpack(packed), cards);
  const noRelation = RelationPairs.pack(cards.map(c => ({...c, relation:''})));
  assert.equal(noRelation.relation, '', '연결 이유를 하나도 쓰지 않으면 선택 칸은 비운다');
  assert.equal(RelationPairs.unpack(noRelation).length, 3);
});

test('학습자가 구분 표시를 직접 써도 경계가 깨지지 않는다', () => {
  const cards = [{primary:'[관계 2]\n가짜 표시', support:'근거', relation:''}, {primary:'둘', support:'[관계 1] 문장 안', relation:''}];
  const packed = RelationPairs.pack(cards), back = RelationPairs.unpack(packed);
  assert.equal(back.length, 2);
  assert.equal(back[0].primary, '［관계 2］\n가짜 표시'); assert.equal(back[1].support, '［관계 1］ 문장 안');
  // 카드 1개여도 같은 처리로, 나중에 여러 관계로 오인하지 않는다.
  assert.equal(RelationPairs.unpack(RelationPairs.pack([{primary:'[관계 1]\n가', support:'[관계 1]\n나', relation:''}])).length, 1);
});

test('형식이 맞지 않는 기존 기록은 카드 1개로 보여 준다', () => {
  assert.equal(RelationPairs.unpack({primary:'[관계 1]\n가\n\n[관계 2]\n나', support:'다', relation:''}).length, 1);
  assert.equal(RelationPairs.unpack({primary:'[관계 1]\n가\n\n[관계 2]\n나', support:'[관계 1]\n다\n\n[관계 2]\n라', relation:'[관계 1]\n하나뿐'}).length, 1);
});

test('합친 값은 기존 제출 계약을 그대로 통과한다(서버 형식 변경 없음)', () => {
  const packed = RelationPairs.pack([{primary:'가상 주장 하나', support:'가상 근거 하나', relation:''}, {primary:'가상 주장 둘', support:'가상 근거 둘', relation:''}]);
  const input = {structureType:'claim', mainIdea:'가상 중심', ...packed, retell:'가상 재구성', reflection:'', newWords:'', interests:'', rechecked:false};
  const payload = Contract.buildPayload(input, '11111111-1111-4111-8111-111111111111');
  assert.equal(payload.schemaVersion, 1); assert.equal(payload.primary, packed.primary); assert.equal(payload.relation, '');
});

test('초급 구조도를 첫 역할 기준 쌍으로 묶고, 여러 관계에 쓰인 문장은 반복으로 표시한다', () => {
  const node = (id, role, order) => ({id, sentenceId:'s000' + order, text:'문장 ' + id, role, source:'learner_added', order});
  const graph = {structureType:'claim', nodes:[node('n1','primary',0), node('n2','primary',1), node('n3','support',2), node('n4','support',3), node('n5','support',4), node('n6',null,5)],
    edges:[{from:'n4', to:'n2', relationType:'supports'}, {from:'n3', to:'n1', relationType:'supports'}, {from:'n4', to:'n1', relationType:'supports'}]};
  const g = RelationPairs.group(graph);
  assert.deepEqual(g.pairs.map(p => [p.anchor.id, p.partners.map(x => x.node.id + (x.repeat ? '*' : ''))]), [['n1', ['n3', 'n4']], ['n2', ['n4*']]]);
  assert.deepEqual(g.loose.map(n => n.id), ['n5']); assert.deepEqual(g.unplaced.map(n => n.id), ['n6']); assert.deepEqual(g.odd, []);
  const cause = RelationPairs.group({...graph, structureType:'cause', edges:[{from:'n1', to:'n3', relationType:'causes'}]});
  assert.deepEqual(cause.pairs[0].partners.map(x => x.node.id), ['n3'], '방향과 관계없이 첫 역할 문장 기준으로 묶는다');
});
