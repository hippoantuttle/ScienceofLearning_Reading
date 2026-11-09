'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target='https://mxhlxenfboiaywyhgyqs.supabase.co';
async function provision(env,fetchImpl,persist){
 if(env.SUPABASE_URL!==target||!env.SUPABASE_SERVICE_ROLE_KEY||['A','B','C'].some(x=>env['SUPABASE_TEST_EMAIL_'+x]||env['SUPABASE_TEST_PASSWORD_'+x]||env['SUPABASE_TEST_ID_'+x]))throw new Error('설정 확인 또는 기존 테스트 계정 충돌');
 const nonce=crypto.randomBytes(12).toString('hex');const accounts=['A','B','C'].map(label=>({label,email:`reading-synthetic-${nonce}-${label.toLowerCase()}@example.com`,password:crypto.randomBytes(24).toString('base64url')}));
 const data={};for(const a of accounts){data['SUPABASE_TEST_EMAIL_'+a.label]=a.email;data['SUPABASE_TEST_PASSWORD_'+a.label]=a.password;}persist(data);
 const key=env.SUPABASE_SERVICE_ROLE_KEY,headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 for(const a of accounts){
  const created=await fetchImpl(target+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email:a.email,password:a.password,email_confirm:true}),redirect:'error'});
  if(!created.ok)throw new Error('합성 계정 생성 실패');const obj=await created.json();if(typeof obj?.id!=='string'||obj.email!==a.email)throw new Error('생성 계정 확인 실패');
  persist({['SUPABASE_TEST_ID_'+a.label]:obj.id});
  const read=await fetchImpl(target+'/auth/v1/admin/users/'+encodeURIComponent(obj.id),{method:'GET',headers,redirect:'error'});if(!read.ok||(await read.json()).id!==obj.id)throw new Error('계정 재조회 실패');
  const member={user_id:obj.id,role:'participant',enabled:a.label!=='C'};
  const inserted=await fetchImpl(target+'/rest/v1/pilot_members',{method:'POST',headers,body:JSON.stringify(member),redirect:'error'});if(!inserted.ok)throw new Error('멤버십 등록 실패');
  const q=new URLSearchParams({user_id:'eq.'+obj.id,select:'user_id,role,enabled'});const check=await fetchImpl(target+'/rest/v1/pilot_members?'+q,{method:'GET',headers,redirect:'error'});if(!check.ok)throw new Error('멤버십 재조회 실패');const values=await check.json();if(!Array.isArray(values)||values.length!==1||Object.entries(member).some(([k,v])=>values[0][k]!==v))throw new Error('멤버십 불일치');
 }
 return {accounts:3,members:3};
}
function readConfig(text){return Object.fromEntries(text.split(/\r?\n/).filter(x=>/^[A-Z0-9_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim()]}));}
if(require.main===module){
 const file=path.join(__dirname,'..','.env.supabase-test');let previous=fs.readFileSync(file,'utf8');
 const persist=updates=>{
  if(fs.readFileSync(file,'utf8')!==previous)throw new Error('로컬 파일 동시 변경 감지');
  let next=previous;for(const [key,value] of Object.entries(updates)){const re=new RegExp('^'+key+'=.*$','m');if(re.test(next))next=next.replace(re,key+'='+value);else next+='\n'+key+'='+value+'\n';}
  const temp=file+'.provision.tmp';fs.writeFileSync(temp,next,{flag:'wx',mode:0o600});fs.renameSync(temp,file);previous=next;
 };
 provision(readConfig(previous),fetch,persist).then(x=>console.log('합성 테스트 계정 및 멤버십 확인:',JSON.stringify(x))).catch(()=>{console.error('준비 실패: 반복 실행하지 말고 PM과 부분 생성 상태를 확인하세요.');process.exitCode=1;});
}
module.exports={provision};
