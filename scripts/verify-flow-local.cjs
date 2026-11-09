'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const {createLogin}=require('../submission-auth.js'),{createFlow}=require('../submission-flow.js'),{createHttpAdapter}=require('../submission-http.js');
async function main(){
 const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'..','.env.supabase-test'),'utf8').split(/\r?\n/).filter(x=>/^[A-Z0-9_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim()]}));
 const base='https://mxhlxenfboiaywyhgyqs.supabase.co';if(env.SUPABASE_URL!==base||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY||!env.SUPABASE_TEST_EMAIL_A||!env.SUPABASE_TEST_PASSWORD_A)throw Error('설정 오류');
 const deployed=process.argv.includes('--deployed');const origin=deployed?'chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb':'chrome-extension://abcdefghijklmnopabcdefghijklmnop',session=crypto.randomUUID(),config={SUPABASE_URL:base,SUPABASE_ANON_KEY:env.SUPABASE_ANON_KEY,ALLOWED_ORIGIN:origin};const worker=(await import('../server/submissions/worker.mjs')).createHandler();let owner=null,attempted=false;
 const loginImpl=createLogin({baseUrl:base,publicKey:env.SUPABASE_ANON_KEY});
 const login=async(email,password)=>{const token=await loginImpl(email,password);const r=await fetch(base+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token},redirect:'error'});if(!r.ok)throw Error('신원 확인 실패');owner=(await r.json()).id;if(!owner)throw Error('신원 확인 실패');return token;};
 const deployed=process.argv.includes('--deployed');const endpoint=deployed?'https://reading-submissions-pilot.patrick020308.workers.dev/submissions':'https://local-worker.invalid/submissions';
 const localFetch=async(url,options)=>{const parsed=new URL(url);if(parsed.href.split('?')[0]!==endpoint)throw Error('중계 대상 오류');const headers=new Headers(options.headers);headers.set('origin',origin);if(deployed)return fetch(url,{...options,headers});return worker(new Request(url,{...options,headers}),config)};
 const flow=createFlow({login,newId:()=>session,adapter:token=>createHttpAdapter({endpoint,getToken:async()=>token,fetchImpl:localFetch})});
 await flow.signIn(env.SUPABASE_TEST_EMAIL_A,env.SUPABASE_TEST_PASSWORD_A);
 try{attempted=true;const result=await flow.submit({structureType:'claim',mainIdea:'가상 중심',primary:'가상 정보',support:'가상 보조',relation:'가상 관계',retell:'가상 다시쓰기',reflection:'',newWords:'',interests:'',rechecked:false});if(result.status!=='saved')throw Error('저장 확인 실패');}
 finally{if(attempted&&owner){const query=new URLSearchParams({owner_id:'eq.'+owner,session_id:'eq.'+session,select:'id'});const url=base+'/rest/v1/pilot_submissions?'+query;const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};const del=await fetch(url,{method:'DELETE',headers,redirect:'error'});if(!del.ok)throw Error('합성 삭제 실패');const r=await fetch(url,{headers,redirect:'error'});if(!r.ok)throw Error('합성 삭제 확인 실패');const rows=await r.json();if(!Array.isArray(rows)||rows.length)throw Error('합성 삭제 확인 실패');}}
 console.log('로컬 제출 경로: 실제 인증·합성 작성값 저장·Worker 재조회·삭제 확인 성공');
}
if(require.main===module)main().catch(()=>{console.error('로컬 제출 경로 실패: 자격·응답은 출력하지 않습니다. 합성 행 정리를 확인하세요.');process.exitCode=1});
