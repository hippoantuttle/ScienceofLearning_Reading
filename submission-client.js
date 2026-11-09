'use strict';
// 합성 데이터 전용 프로세스 메모리 실험: 운영 저장소나 인증이 아님.
const EXAMPLE=Object.freeze({schemaVersion:1,sessionId:'synthetic-session',structureType:'claim',mainIdea:'가상 중심 생각',primary:'가상 정보',support:'가상 보조',relation:'가상 관계',retell:'가상 재구성'});
function createMockStore(){
 const records=new Map();let next=0;
 return {
  async save(owner,payload){
   if(!owner)throw new Error('가상 인증 필요');
   if(!payload || JSON.stringify(payload)!==JSON.stringify(EXAMPLE))throw new Error('합성 예시만 허용');
   const key=owner+'|'+payload.sessionId;
   if(records.has(key))return {...records.get(key).receipt};
   const receipt={submissionId:`mock-${++next}`,status:'mock-saved',savedAt:new Date().toISOString()};
   records.set(key,{owner,payload:structuredClone(payload),receipt});return {...receipt};
  },
  async read(owner,id){if(!owner)throw new Error('가상 인증 필요');for(const entry of records.values())if(entry.receipt.submissionId===id && entry.owner===owner)return structuredClone(entry.payload);throw new Error('없거나 접근 불가');},
  count(){return records.size;}
 };
}
function createClient(store,owner){return {submit:payload=>store.save(owner,payload),read:id=>store.read(owner,id)};}
if(typeof module!=='undefined')module.exports={EXAMPLE,createMockStore,createClient};
