'use strict';
const SubmissionContract=(()=>{
 const fields=['structureType','mainIdea','primary','support','relation','retell','reflection','newWords','interests','rechecked'];
 function buildPayload(input,sessionId){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join('|')!==[...fields].sort().join('|'))throw new Error('제출 항목 오류');
  if(typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>100)throw new Error('세션 식별자 오류');
  if(!['claim','cause','problem'].includes(input.structureType)||typeof input.rechecked!=='boolean')throw new Error('유형 오류');
  for(const k of ['mainIdea','primary','support','relation','retell','reflection','newWords','interests']){
   if(typeof input[k]!=='string'||!input[k].isWellFormed()||input[k].includes('\0')||Array.from(input[k]).length>10000||(['mainIdea','primary','support','relation','retell'].includes(k)&&!input[k].replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g,'')))throw new Error('제출 내용 오류');
  }
  return {schemaVersion:1,sessionId,structureType:input.structureType,mainIdea:input.mainIdea,primary:input.primary,support:input.support,relation:input.relation,retell:input.retell,reflection:input.reflection,newWords:input.newWords,interests:input.interests,rechecked:input.rechecked};
 }
 function createSubmission(adapter,newId){
  if(!adapter||typeof adapter.save!=='function'||typeof newId!=='function')throw new Error('저장 어댑터 필요');
  let pending=null,busy=false,completed=false;
  async function send(){
   if(!pending)throw new Error('제출할 내용 없음');if(busy)throw new Error('제출 진행 중');if(completed)throw new Error('이미 제출됨');
   busy=true;try{
    const response=await adapter.save(structuredClone(pending),pending.sessionId);
    if(!response||response.status!=='saved'||typeof response.submissionId!=='string'||!response.submissionId.trim()||typeof response.savedAt!=='string'||Number.isNaN(Date.parse(response.savedAt)))throw new Error('저장 응답 오류');
    completed=true;return {status:'saved',submissionId:response.submissionId,savedAt:response.savedAt};
   }finally{busy=false;}
  }
  return {submit(input){if(pending)throw new Error('기존 제출을 재시도하거나 새 세션을 시작하세요');pending=buildPayload(input,newId());return send();},retry:send,snapshot(){return pending?structuredClone(pending):null;}};
 }
 return {buildPayload,createSubmission};
})();
if(typeof module!=='undefined')module.exports=SubmissionContract;
