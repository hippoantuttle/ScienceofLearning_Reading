'use strict';
const SubmissionAuth=(()=>{
 function createLogin({baseUrl,publicKey,fetchImpl=fetch}){
  let u;try{u=new URL(baseUrl)}catch{throw Error('인증 주소 오류')};
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||typeof publicKey!=='string'||!publicKey||publicKey.startsWith('sb_secret_'))throw Error('인증 설정 오류');
  if(publicKey.startsWith('eyJ')){try{const p=JSON.parse(atob(publicKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(p.role!=='anon')throw Error();}catch{throw Error('공개 키가 필요합니다.');}}
  return async(email,password)=>{const r=await fetchImpl(u.origin+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({email,password}),credentials:'omit',cache:'no-store',redirect:'error'});if(!r.ok)throw Error('로그인에 실패했습니다.');const body=await r.json();if(typeof body?.access_token!=='string'||!body.access_token)throw Error('로그인 응답 오류');return body.access_token;};
 }
 return {createLogin};
})();
if(typeof module!=='undefined')module.exports=SubmissionAuth;
