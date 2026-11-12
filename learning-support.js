'use strict';
var LearningSupport = (() => {
  const c = typeof module !== 'undefined' ? require('./reading-support-contract.js') : ReadingSupportContract;
  const keys=['version','mode','activity','candidateExposure','requestStatus','attempts','segmentationVersion','promptVersion','modelId','documentHash','candidateIds','graph'];
  const empty=mode=>({version:1,mode,activity:'manual',candidateExposure:false,requestStatus:'idle',attempts:0,segmentationVersion:null,promptVersion:null,modelId:null,documentHash:null,candidateIds:[],graph:null});
  function validate(v, answers) {
    if (!c.exact(v,keys)||v.version!==1||!['guided','independent'].includes(v.mode)||!['graph','manual'].includes(v.activity)||typeof v.candidateExposure!=='boolean'||!['idle','ready','failed','cancelled','unsupported'].includes(v.requestStatus)||!Number.isInteger(v.attempts)||v.attempts<0||v.attempts>2||!Array.isArray(v.candidateIds)||v.candidateIds.length>5||new Set(v.candidateIds).size!==v.candidateIds.length||v.candidateIds.some(id=>typeof id!=='string'||(!/^s\d{4}$/.test(id)||Number(id.slice(1))<1))||JSON.stringify(v).length>100000) throw Error('invalid_learning_support');
    if(v.candidateIds.join('|')!==v.candidateIds.slice().sort().join('|'))throw Error('invalid_learning_support');
    if (v.segmentationVersion!==null&&v.segmentationVersion!=='sentence-v1'||v.promptVersion!==null&&v.promptVersion!=='reading-candidates-v1'||v.documentHash!==null&&(typeof v.documentHash!=='string'||!/^sha256:[a-f0-9]{64}$/.test(v.documentHash))||v.modelId!==null&&(typeof v.modelId!=='string'||!/^[a-zA-Z0-9._:/-]{1,100}$/.test(v.modelId))) throw Error('invalid_learning_support');
    if(v.candidateExposure){if(v.attempts<1||v.candidateIds.length<2||!v.documentHash||!v.modelId||!v.promptVersion||!v.segmentationVersion||v.requestStatus!=='ready')throw Error('invalid_learning_support');}
    else if(v.candidateIds.length||v.modelId!==null||v.promptVersion!==null)throw Error('invalid_learning_support');
    if(v.attempts===0&&['ready','failed'].includes(v.requestStatus)||v.attempts>0&&['idle','unsupported'].includes(v.requestStatus))throw Error('invalid_learning_support');
    if(v.mode==='independent'&&JSON.stringify(v)!==JSON.stringify(empty('independent'))) {
      // Object key order is not part of the wire contract.
      const expected=empty('independent');if(keys.some(k=>JSON.stringify(v[k])!==JSON.stringify(expected[k])))throw Error('invalid_learning_support');
    }
    if(v.activity==='manual'){if(v.graph!==null)throw Error('invalid_learning_support');}
    else {
      if(v.mode!=='guided'||!v.documentHash||v.segmentationVersion!=='sentence-v1'||!Array.isArray(v.graph?.nodes))throw Error('invalid_learning_support');
      const sentences=v.graph.nodes.map(n=>({id:n.sentenceId,text:n.text}));
      if(sentences.some(s=>typeof s.id!=='string'||!/^s\d{4}$/.test(s.id)||typeof s.text!=='string'||!s.text.trim()||!s.text.isWellFormed()||s.text.includes('\0')||s.text.length>12000))throw Error('invalid_learning_support');
      const fields=c.textFields(v.graph,{structureType:answers.structureType,sentences,candidateIds:v.candidateIds});
      if(fields.primary!==answers.primary||fields.support!==answers.support)throw Error('invalid_learning_support');
    }
    return structuredClone(v);
  }
  function label(v){return !v?'지원 정보 없음 (이전 기록)':(v.mode==='guided'?'초급':'중급')+' · '+(v.candidateExposure?'AI 문장 후보를 본 수행':'AI 문장 후보를 보지 않은 수행');}
  function same(a,b){
    if(a===b)return true;if(Array.isArray(a)!==Array.isArray(b))return false;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();return ka.join('|')===kb.join('|')&&ka.every(k=>same(a[k],b[k]));
  }
  return {empty,validate,label,same};
})();
if(typeof module!=='undefined')module.exports=LearningSupport;
