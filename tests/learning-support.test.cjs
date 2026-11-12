'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Support=require('../learning-support.js'),{buildPayload}=require('../submission-contract.js');
const answers={structureType:'claim',mainIdea:'합성 중심',primary:'합성 주장.',support:'합성 근거.',relation:'',retell:'합성 Retell',reflection:'',newWords:'',interests:'',rechecked:false};
const graph={nodes:[{id:'n1',sentenceId:'s0001',text:answers.primary,role:'primary',source:'ai_candidate',order:0},{id:'n2',sentenceId:'s0002',text:answers.support,role:'support',source:'ai_candidate',order:1}],edges:[{from:'n2',to:'n1',relationType:'supports'}]};
const support=()=>({...Support.empty('guided'),activity:'graph',candidateExposure:true,requestStatus:'ready',attempts:1,segmentationVersion:'sentence-v1',promptVersion:'reading-candidates-v1',modelId:'synthetic',documentHash:'sha256:'+'1'.repeat(64),candidateIds:['s0001','s0002','s0003'],graph:structuredClone(graph)});
test('v2 허용 조합: 중급 직접 작성·초급 노출 전후 수동·초급 그래프, v1은 unknown 유지',()=>{
 assert.equal(buildPayload(answers,'synthetic').schemaVersion,1);
 for(const v of [Support.empty('independent'),Support.empty('guided'),{...support(),activity:'manual',graph:null},support()]){
  const payload=buildPayload({...answers,learningSupport:v},'synthetic');assert.equal(payload.schemaVersion,2);assert.deepEqual(payload.learningSupport,v);
 }
 const v=support();v.graph=null;v.activity='manual';assert.equal(Support.validate(v,answers).candidateExposure,true);
});
test('v2는 원문 전문·미사용 후보 텍스트·모순된 모드/출처·그래프/문자열 불일치를 거절한다',()=>{
 const mutations=[v=>v.article='원문 전문',v=>v.candidateTexts=['미사용 본문'],v=>v.mode='independent',v=>v.candidateExposure=false,v=>v.attempts=0,v=>v.graph.nodes[0].source='learner_added',v=>v.graph.edges=[],v=>v.graph.nodes[0].text='바뀐 발췌',v=>v.modelId=null];
 for(const mutate of mutations){const v=support();mutate(v);assert.throws(()=>buildPayload({...answers,learningSupport:v},'synthetic'));}
 assert.throws(()=>Support.validate({...Support.empty('independent'),documentHash:'sha256:'+'0'.repeat(64)},answers));
 assert.equal(Support.same({a:{y:1,x:2}},{a:{x:2,y:1}}),true);assert.equal(Support.same({a:1},{a:2}),false);
});
module.exports={support,answers};
