'use strict';
const SubmissionFlow=(()=>{
 const contract=typeof module!=='undefined'?require('./submission-contract.js'):SubmissionContract;
 function createFlow({login,adapter,newId}){
  let token=null,pending=null,busy=false,completed=false,identity=null;
  async function signIn(email,password){if(typeof email!=='string'||!email.trim()||typeof password!=='string'||!password)throw Error('이메일과 비밀번호를 입력하세요.');const name=email.trim().toLowerCase();if(pending&&identity!==name)throw Error('기존 제출은 같은 계정으로만 재시도할 수 있습니다.');token=null;const value=await login(email.trim(),password);if(typeof value!=='string'||!value.trim())throw Error('로그인 실패');if(await adapter(value).checkMember()!==true)throw Error('초대된 활성 회원만 사용할 수 있습니다.');token=value;identity=name;}
  async function send(){if(!token)throw Error('로그인이 필요합니다.');if(!pending)throw Error('제출할 내용이 없습니다.');if(busy)throw Error('제출 진행 중입니다.');if(completed)throw Error('이미 제출했습니다.');busy=true;try{const io=adapter(token);const receipt=await io.save(structuredClone(pending),pending.sessionId);if(receipt?.status!=='saved'||typeof receipt.submissionId!=='string'||!receipt.submissionId||Number.isNaN(Date.parse(receipt.savedAt)))throw Error('저장 확인 실패');const read=await io.read(pending.sessionId);if(read?.status!=='saved'||read.submissionId!==receipt.submissionId||!read.payload||Object.keys(read.payload).length!==Object.keys(pending).length||Object.keys(pending).some(k=>read.payload[k]!==pending[k]))throw Error('저장 후 재조회 불일치');completed=true;return receipt;}finally{busy=false;}}
  async function submit(input){if(!token)throw Error('로그인이 필요합니다.');if(pending)throw Error('기존 제출을 재시도하세요.');pending=contract.buildPayload(input,newId());return send();}
  return {signIn,submit,retry:send,hasPending:()=>!!pending};
 }
 return {createFlow};
})();
if(typeof module!=='undefined')module.exports=SubmissionFlow;
