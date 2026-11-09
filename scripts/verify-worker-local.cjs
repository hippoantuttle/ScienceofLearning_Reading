'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target='https://mxhlxenfboiaywyhgyqs.supabase.co';
async function run(env,handler,fetchImpl=fetch){
 const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_TEST_EMAIL_A','SUPABASE_TEST_PASSWORD_A'];if(names.some(k=>!env[k])||env.SUPABASE_URL!==target)throw new Error('설정 오류');
 const key=env.SUPABASE_ANON_KEY,adminKey=env.SUPABASE_SERVICE_ROLE_KEY;
 const login=await fetchImpl(target+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:env.SUPABASE_TEST_EMAIL_A,password:env.SUPABASE_TEST_PASSWORD_A}),redirect:'error'});
 if(!login.ok)throw new Error('로그인 실패');const auth=await login.json();if(!auth.access_token||!auth.user?.id)throw new Error('인증 응답 오류');
 const session=crypto.randomUUID(),origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop';
 const payload={schemaVersion:1,sessionId:session,structureType:'claim',mainIdea:'가상 중심',primary:'가상 정보',support:'가상 보조',relation:'가상 관계',retell:'가상 재구성',reflection:'',newWords:'',interests:'',rechecked:false};
 const config={SUPABASE_URL:target,SUPABASE_ANON_KEY:key,ALLOWED_ORIGIN:origin};
 const request=(method,body=payload)=>new Request('https://local-worker.invalid/submissions'+(method==='GET'?'?sessionId='+session:''),{method,headers:{authorization:'Bearer '+auth.access_token,'content-type':'application/json',origin,'idempotency-key':session},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 let attempted=false,success=false;
 try{
  attempted=true;const first=await handler(request('POST'),config);if(first.status!==200)throw new Error('Worker 저장 실패');const receipt=await first.json();
  const again=await handler(request('POST'),config);if(again.status!==200)throw new Error('Worker 중복 재전송 실패');const repeat=await again.json();if(receipt.submissionId!==repeat.submissionId||receipt.savedAt!==repeat.savedAt)throw new Error('Worker 재전송 결과 불일치');
  const conflict=await handler(request('POST',{...payload,mainIdea:'다른 가상'}),config);if(conflict.status!==409)throw new Error('Worker 상이 내용 충돌 미차단');
  const result=await handler(request('GET'),config);if(result.status!==200)throw new Error('Worker 조회 실패');const saved=await result.json();if(saved.submissionId!==receipt.submissionId||JSON.stringify(saved.payload)!==JSON.stringify(payload))throw new Error('Worker 재조회 불일치');success=true;
 }finally{
  if(attempted){const query=new URLSearchParams({owner_id:'eq.'+auth.user.id,session_id:'eq.'+session,select:'id'});const url=target+'/rest/v1/pilot_submissions?'+query;const headers={apikey:adminKey,Authorization:'Bearer '+adminKey};const del=await fetchImpl(url,{method:'DELETE',headers,redirect:'error'});if(!del.ok)throw new Error('합성 행 삭제 실패');const check=await fetchImpl(url,{method:'GET',headers,redirect:'error'});if(!check.ok||!Array.isArray(await check.clone().json())||(await check.json()).length)throw new Error('합성 행 삭제 확인 실패');}
 }
 if(!success)throw new Error('검증 실패');return {workerSaved:true,retrySameReceipt:true,changedConflict:true,workerReadMatch:true,cleanupVerified:true};
}
function readConfig(){const text=fs.readFileSync(path.join(__dirname,'..','.env.supabase-test'),'utf8');return Object.fromEntries(text.split(/\r?\n/).filter(x=>/^[A-Z0-9_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim()]}));}
if(require.main===module){(async()=>{const mod=await import('../server/submissions/worker.mjs');return run(readConfig(),mod.createHandler());})().then(result=>console.log('로컬 Worker·실제 합성 DB 검증:',JSON.stringify(result))).catch(()=>{console.error('검증 실패: 비밀과 응답은 출력하지 않습니다. 합성 행 정리를 확인하세요.');process.exitCode=1;});}
module.exports={run};
