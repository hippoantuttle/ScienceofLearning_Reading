'use strict';
const SubmissionFlow=(()=>{
 const contract=typeof module!=='undefined'?require('./submission-contract.js'):SubmissionContract;
 function createFlow({login,adapter,newId}){
  let token=null,pending=null,busy=false,completed=false,identity=null,accountId=null,authKind='password';
  async function signIn(email,password){if(typeof email!=='string'||!email.trim()||typeof password!=='string'||!password)throw Error('이메일과 비밀번호를 입력하세요.');const name=email.trim().toLowerCase();if(pending&&(identity!==name||authKind!=='password'))throw Error('기존 제출은 같은 계정으로만 재시도할 수 있습니다.');token=null;const value=await login(email.trim(),password);if(typeof value!=='string'||!value.trim())throw Error('로그인 실패');if(await adapter(value).checkMember()!==true)throw Error('초대된 활성 회원만 사용할 수 있습니다.');token=value;identity=name;accountId=null;authKind='password';}
  async function signInGoogle(session,claim){
   const {accessToken,userId,email}=session||{};
   if(typeof accessToken!=='string'||!accessToken||typeof email!=='string'||!email.trim()||!/^[0-9a-f-]{36}$/i.test(userId||'')||typeof claim!=='function')throw Error('Google 로그인 정보를 확인하세요.');
   const name=email.trim().toLowerCase();
   if(pending&&(authKind!=='google'||accountId!==userId||identity!==name))throw Error('기존 제출은 같은 Google 계정으로만 재시도할 수 있습니다.');
   token=null;
   if(await claim(accessToken)!==true||await adapter(accessToken).checkMember()!==true)throw Error('사전 등록된 Google 계정과 참여 기간을 확인하세요.');
   token=accessToken;identity=name;accountId=userId;authKind='google';
  }
  async function send(){if(!token)throw Error('로그인이 필요합니다.');if(!pending)throw Error('제출할 내용이 없습니다.');if(busy)throw Error('제출 진행 중입니다.');if(completed)throw Error('이미 제출했습니다.');busy=true;try{const io=adapter(token);const receipt=await io.save(structuredClone(pending),pending.sessionId);if(receipt?.status!=='saved'||typeof receipt.submissionId!=='string'||!receipt.submissionId||Number.isNaN(Date.parse(receipt.savedAt)))throw Error('저장 확인 실패');const read=await io.read(pending.sessionId);if(read?.status!=='saved'||read.submissionId!==receipt.submissionId||!read.payload||Object.keys(read.payload).length!==Object.keys(pending).length||Object.keys(pending).some(k=>read.payload[k]!==pending[k]))throw Error('저장 후 재조회 불일치');completed=true;return receipt;}finally{busy=false;}}
  async function submit(input){if(!token)throw Error('로그인이 필요합니다.');if(pending)throw Error('기존 제출을 재시도하세요.');pending=contract.buildPayload(input,newId());return send();}
  // 새 시도(새 flow)에서 같은 패널 로그인을 이어 쓴다. 회원 확인은 최초 signIn에서 이미 통과한 토큰만 넘겨받는다.
  function adopt(value,name,id=null,kind='password'){if(pending)throw Error('기존 제출이 있는 시도에는 로그인을 옮길 수 없습니다.');if(typeof value!=='string'||!value.trim()||typeof name!=='string'||!name||!['password','google'].includes(kind)||(kind==='google'&&!/^[0-9a-f-]{36}$/i.test(id||'')))throw Error('로그인 정보가 올바르지 않습니다.');token=value;identity=name;accountId=id;authKind=kind;}
  return {signIn,signInGoogle,adopt,expire:()=>{token=null;},submit,retry:send,hasPending:()=>!!pending,getToken:()=>token,getIdentity:()=>token?identity:null,getAccountId:()=>accountId,getAuthKind:()=>authKind,verifiedSnapshot:()=>completed?structuredClone(pending):null};
 }
 return {createFlow};
})();
if(typeof module!=='undefined')module.exports=SubmissionFlow;
