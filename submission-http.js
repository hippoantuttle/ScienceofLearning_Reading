'use strict';
const SubmissionHttp=(()=>{
 function createHttpAdapter({endpoint,getToken,fetchImpl=fetch}){
  let url;try{url=new URL(endpoint)}catch{throw new Error('중계 주소 오류')}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw new Error('HTTPS 중계 주소가 필요합니다.');
  if(typeof getToken!=='function'||typeof fetchImpl!=='function')throw new Error('인증·전송 함수 필요');
  return {async save(payload,key){
   const token=await getToken();if(typeof token!=='string'||!token.trim())throw new Error('로그인이 필요합니다.');
   if(typeof key!=='string'||!key.trim())throw new Error('요청 식별자 오류');
   const response=await fetchImpl(url.href,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'Idempotency-Key':key},body:JSON.stringify(payload),redirect:'error',cache:'no-store',credentials:'omit'});
   if(!response.ok)throw new Error(`저장 요청 실패 (${response.status})`);
   return response.json();
  },async checkMember(){
   const token=await getToken();if(typeof token!=='string'||!token.trim())throw new Error('로그인이 필요합니다.');
   const target=new URL(url.href);target.searchParams.set('membership','1');const response=await fetchImpl(target.href,{method:'GET',headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',credentials:'omit'});
   if(response.status===403)return false;if(!response.ok)throw new Error('회원 확인에 실패했습니다.');const result=await response.json();return result?.active===true;
  },async read(key){
   const token=await getToken();if(typeof token!=='string'||!token.trim())throw new Error('로그인이 필요합니다.');
   if(typeof key!=='string'||!key.trim())throw new Error('요청 식별자 오류');
   const target=new URL(url.href);target.searchParams.set('sessionId',key);
   const response=await fetchImpl(target.href,{method:'GET',headers:{'Authorization':`Bearer ${token}`},redirect:'error',cache:'no-store',credentials:'omit'});
   if(!response.ok)throw new Error(`재조회 실패 (${response.status})`);return response.json();
  }};
 }
 return {createHttpAdapter};
})();
if(typeof module!=='undefined')module.exports=SubmissionHttp;
