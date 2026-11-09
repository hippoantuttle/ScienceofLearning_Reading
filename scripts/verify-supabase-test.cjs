'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const target='https://mxhlxenfboiaywyhgyqs.supabase.co';
const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_TEST_EMAIL_A','SUPABASE_TEST_PASSWORD_A','SUPABASE_TEST_EMAIL_B','SUPABASE_TEST_PASSWORD_B','SUPABASE_TEST_EMAIL_C','SUPABASE_TEST_PASSWORD_C'];
const required=['SUPABASE_URL','SUPABASE_TEST_EMAIL_A','SUPABASE_TEST_PASSWORD_A','SUPABASE_TEST_EMAIL_B','SUPABASE_TEST_PASSWORD_B','SUPABASE_TEST_EMAIL_C','SUPABASE_TEST_PASSWORD_C'];
function selectKeys(env){
 const pub=env.SUPABASE_PUBLISHABLE_KEY?.trim(),secret=env.SUPABASE_SECRET_KEY?.trim();
 if(pub||secret){if(env.SUPABASE_ANON_KEY?.trim()||env.SUPABASE_SERVICE_ROLE_KEY?.trim())throw new Error('키 쌍 혼용 금지');if(!pub?.startsWith('sb_publishable_')||!secret?.startsWith('sb_secret_'))throw new Error('신규 키 설정 오류');return {publicKey:pub,adminKey:secret,modern:true};}
 if(!env.SUPABASE_ANON_KEY?.trim()||!env.SUPABASE_SERVICE_ROLE_KEY?.trim()||env.SUPABASE_ANON_KEY.startsWith('sb_')||env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_'))throw new Error('레거시 키 설정 오류');
 return {publicKey:env.SUPABASE_ANON_KEY,adminKey:env.SUPABASE_SERVICE_ROLE_KEY,modern:false};
}
function validateConfig(env){
 if(!env||required.some(k=>typeof env[k]!=='string'||!env[k].trim())||env.SUPABASE_URL!==target||new Set(['A','B','C'].map(x=>env['SUPABASE_TEST_EMAIL_'+x].trim().toLowerCase())).size!==3)throw new Error('테스트 설정 오류: 대상·필수값·계정 구분 확인');
 selectKeys(env);
}
async function runVerification(env,fetchImpl=fetch){
 validateConfig(env);const base=target;const {publicKey,adminKey,modern}=selectKeys(env);
 const call=async(url,options)=>fetchImpl(url,{...options,redirect:'error'});
 async function login(email,password){const r=await call(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});if(!r.ok)throw new Error('테스트 로그인 실패');const v=await r.json();if(!v.access_token||!v.user?.id)throw new Error('테스트 로그인 응답 오류');return v;}
 const a=await login(env.SUPABASE_TEST_EMAIL_A,env.SUPABASE_TEST_PASSWORD_A),b=await login(env.SUPABASE_TEST_EMAIL_B,env.SUPABASE_TEST_PASSWORD_B),c=await login(env.SUPABASE_TEST_EMAIL_C,env.SUPABASE_TEST_PASSWORD_C);if(new Set([a.user.id,b.user.id,c.user.id]).size!==3)throw new Error('동일 테스트 계정');
 const member=async(token)=>{const r=await call(base+'/rest/v1/rpc/is_active_pilot_member',{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error('멤버십 확인 실패');return r.json();};
 if(await member(a.access_token)!==true||await member(b.access_token)!==true||await member(c.access_token)!==false)throw new Error('테스트 계정 활성 상태 오류');
 const session=crypto.randomUUID();const row={owner_id:a.user.id,session_id:session,schema_version:1,structure_type:'claim',main_idea:'가상 중심',primary_text:'가상 정보',support_text:'가상 정보',relation_text:'가상 관계',retell:'가상 재구성',reflection:'',new_words:'',interests:'',rechecked:false};
 const query=new URLSearchParams({owner_id:'eq.'+a.user.id,session_id:'eq.'+session,select:'*'});const url=base+'/rest/v1/pilot_submissions?'+query;
 const userHeaders=t=>({apikey:publicKey,Authorization:'Bearer '+t,'Content-Type':'application/json'});
 let attempted=false,verified=false;
 try{
  attempted=true;
  const forged=await call(base+'/rest/v1/pilot_submissions',{method:'POST',headers:{...userHeaders(b.access_token),Prefer:'return=minimal'},body:JSON.stringify(row)});if(![401,403].includes(forged.status))throw new Error('타인 소유자 위조 차단 실패');
  const inactive=await call(base+'/rest/v1/pilot_submissions',{method:'POST',headers:{...userHeaders(c.access_token),Prefer:'return=minimal'},body:JSON.stringify({...row,owner_id:c.user.id})});if(![401,403].includes(inactive.status))throw new Error('비활성 계정 차단 실패');
  const insert=await call(base+'/rest/v1/pilot_submissions',{method:'POST',headers:{...userHeaders(a.access_token),Prefer:'return=minimal'},body:JSON.stringify(row)});if(!insert.ok)throw new Error('합성 저장 실패');
  const duplicate=await call(base+'/rest/v1/pilot_submissions',{method:'POST',headers:{...userHeaders(a.access_token),Prefer:'return=minimal'},body:JSON.stringify(row)});if(duplicate.status!==409)throw new Error('중복 제한 실패');
  const own=await call(url,{method:'GET',headers:userHeaders(a.access_token)});if(!own.ok)throw new Error('소유자 조회 실패');const rows=await own.json();if(!Array.isArray(rows)||rows.length!==1||Object.entries(row).some(([k,v])=>rows[0][k]!==v))throw new Error('저장 재조회 불일치');
  const anon=await call(url,{method:'GET',headers:modern?{apikey:publicKey}:userHeaders(publicKey)});if(anon.ok){const values=await anon.json();if(!Array.isArray(values)||values.length!==0)throw new Error('익명 접근 차단 실패');}else if(![401,403].includes(anon.status))throw new Error('익명 조회 오류');
  const other=await call(url,{method:'GET',headers:userHeaders(b.access_token)});if(!other.ok)throw new Error('타 계정 조회 오류');const denied=await other.json();if(!Array.isArray(denied)||denied.length!==0)throw new Error('타인 접근 차단 실패');verified=true;
 }finally{
  if(attempted){const admin=modern?{apikey:adminKey}:{apikey:adminKey,Authorization:'Bearer '+adminKey};let cleanupFailed=false;for(const owner of [a.user.id,c.user.id]){try{const query=new URLSearchParams({owner_id:'eq.'+owner,session_id:'eq.'+session,select:'*'});const targetUrl=base+'/rest/v1/pilot_submissions?'+query;const del=await call(targetUrl,{method:'DELETE',headers:admin});if(!del.ok)throw new Error();const verify=await call(targetUrl,{method:'GET',headers:admin});if(!verify.ok)throw new Error();const remaining=await verify.json();if(!Array.isArray(remaining)||remaining.length!==0)throw new Error();}catch{cleanupFailed=true;}}if(cleanupFailed)throw new Error('합성 행 삭제 확인 실패: 수동 점검 필요');}
 }
 if(!verified)throw new Error('검증 미완료');return {authenticated:true,activeMembers:true,inactiveDenied:true,forgeryDenied:true,saved:true,duplicateDenied:true,ownerRead:true,anonymousDenied:true,otherDenied:true,deleted:true};
}
function readLocalConfig(){const file=path.join(__dirname,'..','.env.supabase-test');const parsed={};for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&keys.includes(match[1]))parsed[match[1]]=match[2].trim();}return parsed;}
if(require.main===module&&!process.env.NODE_TEST_CONTEXT){runVerification(readLocalConfig()).then(result=>console.log('합성 테스트 결과:',JSON.stringify(result))).catch(()=>{console.error('합성 테스트 실패. 비밀·응답을 출력하지 않습니다. PM과 상태를 확인하세요.');process.exitCode=1;});}
module.exports={validateConfig,runVerification};
