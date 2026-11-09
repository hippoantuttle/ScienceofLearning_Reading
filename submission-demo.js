'use strict';
const syntheticClient=createClient(createMockStore(),'synthetic-owner');
document.getElementById('synthetic-submit').addEventListener('click',async()=>{
 const button=document.getElementById('synthetic-submit');const status=document.getElementById('synthetic-submit-status');
 button.disabled=true;status.textContent='합성 예시 모의 저장을 확인하고 있습니다.';
 try{
  const receipt=await syntheticClient.submit(EXAMPLE);
  const saved=await syntheticClient.read(receipt.submissionId);
  if(receipt.status!=='mock-saved'||JSON.stringify(saved)!==JSON.stringify(EXAMPLE))throw new Error('재조회 실패');
  status.textContent='합성 예시 모의 저장·재조회 확인. 실제 작성 내용은 제출하거나 저장하지 않았습니다.';
 }catch{status.textContent='모의 저장 확인 실패. 실제 작성 내용은 그대로 유지됩니다.';}
 finally{button.disabled=false;}
});
