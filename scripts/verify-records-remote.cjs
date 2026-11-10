'use strict';
// Explicit opt-in only. No secrets, identities, answers or raw errors are printed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateConfig}=require('./verify-supabase-test.cjs');
const {create,createSaver}=require('../record-client.js');
const target='https://mxhlxenfboiaywyhgyqs.supabase.co';
const endpoint='https://reading-submissions-pilot.patrick020308.workers.dev/submissions';
const origin='chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb';
const answers={mainIdea:'합성 중심 생각',primary:'합성 핵심 정보',support:'합성 보조 정보',relation:'합성 관계 설명',retell:'합성 다시 말하기'};
function check(ok,label){if(!ok)throw Object.assign(Error(label),{verificationCode:label});}
async function run(env,fetchImpl=fetch,progress=()=>{}){
  validateConfig(env);
  const modern=!!env.SUPABASE_PUBLISHABLE_KEY,publicKey=env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  const adminKey=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const admin=modern?{apikey:adminKey}:{apikey:adminKey,Authorization:'Bearer '+adminKey};
  const call=(url,options={})=>fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  const headers=account=>({apikey:publicKey,...(account?{Authorization:'Bearer '+account.access_token}:{}),'Content-Type':'application/json'});
  const accounts={};
  for(const name of ['A','B','C']){
    const response=await call(target+'/auth/v1/token?grant_type=password',{method:'POST',headers:headers(),body:JSON.stringify({email:env['SUPABASE_TEST_EMAIL_'+name],password:env['SUPABASE_TEST_PASSWORD_'+name]})});
    check(response.ok,'test_login_failed');accounts[name]=await response.json();
    check(accounts[name].access_token&&accounts[name].user?.id,'test_login_invalid');
  }
  check(new Set(Object.values(accounts).map(a=>a.user.id)).size===3,'test_accounts_not_distinct');
  for(const name of ['A','B','C']){
    const response=await call(target+'/rest/v1/rpc/is_active_pilot_member',{method:'POST',headers:headers(accounts[name]),body:'{}'});
    check(response.ok&&(await response.json())===(name!=='C'),'test_membership_invalid');
  }
  const {A,B,C}=accounts,attempts=[];let mainId=null,requestId=null,success=false;
  const result={};
  const worker=(suffix='',{method='GET',body,account=A,key,requestOrigin=method==='POST'?origin:null}={})=>call(endpoint+suffix,{method,headers:{...(account?{Authorization:'Bearer '+account.access_token}:{}),...(requestOrigin?{Origin:requestOrigin}:{}),...(body?{'Content-Type':'application/json','Idempotency-Key':key||body.requestId||body.sessionId}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const db=(table,query,account,options={})=>call(target+'/rest/v1/'+table+'?'+new URLSearchParams(query),{...options,headers:{...headers(account),...(options.headers||{})}});
  const io=account=>create({endpoint,getToken:()=>account.access_token,fetchImpl:(url,opt)=>call(url,{...opt,headers:{...opt.headers,...(opt.method==='POST'?{Origin:origin}:{})}})});
  const original=n=>({schemaVersion:1,sessionId:crypto.randomUUID(),structureType:'claim',...answers,mainIdea:'합成 중심 생각 '+n,reflection:'',newWords:'',interests:'',rechecked:false});
  async function insert(account,payload){
    // Register BEFORE sending: a lost response may still have inserted the row.
    attempts.push({owner:account.user.id,session:payload.sessionId});
    const response=await worker('',{method:'POST',body:payload,account});check(response.status===200,'original_save_failed');
    const receipt=await response.json();check(receipt.status==='saved'&&typeof receipt.submissionId==='string','original_receipt_invalid');return receipt;
  }
  try{
    const ready=await io(A).list();check(Array.isArray(ready.items),'readiness_failed');result.ready=true;progress('ready');
    const payload={...original(0),articleTitle:'합성 공개 글',sourceUrl:'https://example.com'};
    const receipt=await insert(A,payload);mainId=receipt.submissionId;
    const repeated=await worker('',{method:'POST',body:payload});check(repeated.status===200&&(await repeated.json()).submissionId===mainId,'original_retry_failed');
    check((await worker('',{method:'POST',body:{...payload,mainIdea:'다른 합성 내용'}})).status===409,'original_conflict_failed');
    const own=io(A),detail=await own.detail(mainId);check(JSON.stringify(detail.payload)===JSON.stringify(payload),'original_read_mismatch');
    result.originalSaved=true;result.originalRetry=true;result.metadataRead=true;
    const revision={requestId:crypto.randomUUID(),answers:{...answers,mainIdea:'수정한 합성 중심 생각'}};requestId=revision.requestId;
    const pair=await Promise.all([own.save(mainId,revision),own.save(mainId,revision)]);
    check(pair[0].revision.id===pair[1].revision.id,'revision_duplicate_failed');
    const reread=await own.readRevision(mainId,requestId);check(JSON.stringify(reread.revision.answers)===JSON.stringify(revision.answers),'revision_read_mismatch');
    let conflict=false;try{await own.save(mainId,{...revision,answers});}catch(error){conflict=error.status===409;}check(conflict,'revision_conflict_failed');
    result.revisionSaved=true;result.concurrentRetry=true;result.conflictDenied=true;
    let lose=true;const saver=createSaver({recordId:mainId,newId:()=>crypto.randomUUID(),io:{...own,save:async(...args)=>{const saved=await own.save(...args);if(lose){lose=false;throw Error('synthetic_response_lost');}return saved;}}});
    let failed=false;try{await saver.save(answers);}catch{failed=true;}check(failed&&saver.hasPending(),'lost_response_not_retained');
    check((await saver.save({...answers,mainIdea:'실패 뒤 편집'})).answers.mainIdea===answers.mainIdea,'lost_response_retry_failed');result.lostResponseRetry=true;
    for(let n=0;n<10;n++)await own.save(mainId,{requestId:crypto.randomUUID(),answers:{...answers,mainIdea:'합성 수정 '+n}});
    const versions=await own.revisions(mainId),older=await own.revisions(mainId,versions.nextCursor);
    check(versions.items.length===10&&versions.nextCursor&&older.items.length===2&&new Set([...versions.items,...older.items].map(v=>v.id)).size===12,'revision_pagination_failed');
    const reopened=io(A);check((await reopened.readRevision(mainId,requestId)).revision.id===reread.revision.id,'fresh_client_read_failed');
    check(JSON.stringify((await reopened.detail(mainId)).payload)===JSON.stringify(payload),'original_changed');
    result.revisionPagination=true;result.freshClientRead=true;result.originalUnchanged=true;progress('saved_and_retried');
    const expected=new Set([mainId]);for(let n=1;n<=10;n++)expected.add((await insert(A,original(n))).submissionId);
    const otherReceipt=await insert(B,original(99));
    const first=await own.list(),second=await own.list(first.nextCursor),listed=[...first.items,...second.items];
    check(first.items.length===10&&first.nextCursor&&listed.every(x=>!('payload'in x)&&!('mainIdea'in x))&&[...expected].every(id=>listed.some(x=>x.submissionId===id))&&!listed.some(x=>x.submissionId===otherReceipt.submissionId),'original_pagination_failed');
    check(listed.find(x=>x.submissionId===mainId)?.hasRevisions===true,'revision_flag_missing');result.recordPagination=true;
    const route='/records/'+mainId,revisionRoute=route+'/revisions';
    for(const [suffix,options,status] of [[route,{account:B},404],[revisionRoute,{account:B,method:'POST',body:{requestId:crypto.randomUUID(),answers}},404],['/records',{account:C},403],['/records',{account:null},401],['/records',{requestOrigin:'https://evil.example'},403],[revisionRoute,{method:'POST',requestOrigin:null,body:{requestId:crypto.randomUUID(),answers}},403]])check((await worker(suffix,options)).status===status,'worker_access_control_failed');
    result.workerIsolation=true;result.inactiveDenied=true;result.originDenied=true;
    for(const account of [B,C]){
      for(const table of ['pilot_submissions','pilot_revisions']){
        const response=await db(table,table==='pilot_submissions'?{id:'eq.'+mainId,select:'id'}:{submission_id:'eq.'+mainId,select:'id'},account);
        check(response.ok&&(await response.json()).length===0,'direct_other_read_failed');
      }
    }
    const anonymous=await db('pilot_revisions',{submission_id:'eq.'+mainId,select:'id'},null);check([401,403].includes(anonymous.status),'direct_anonymous_read_failed');
    const row={owner_id:A.user.id,submission_id:mainId,request_id:crypto.randomUUID(),main_idea:'합성',primary_text:'합성',support_text:'합성',relation_text:'합성',retell:'합성'};
    const deniedWrite=async(table,query,account,body,method='POST')=>{const response=await db(table,query,account,{method,headers:{Prefer:'return=minimal'},...(body?{body:JSON.stringify(body)}:{})});check(response.status===403&&(await response.json()).code==='42501','direct_write_not_denied');};
    await deniedWrite('pilot_revisions',{},B,row);
    await deniedWrite('pilot_revisions',{},B,{...row,owner_id:B.user.id,request_id:crypto.randomUUID()});
    await deniedWrite('pilot_revisions',{},C,{...row,owner_id:C.user.id,request_id:crypto.randomUUID()});
    await deniedWrite('pilot_revisions',{},A,{...row,id:crypto.randomUUID()});
    await deniedWrite('pilot_revisions',{},A,{...row,saved_at:'2026-01-01T00:00:00Z'});
    await deniedWrite('pilot_submissions',{owner_id:'eq.'+A.user.id,id:'eq.'+mainId},A,{main_idea:'합성 위조'},'PATCH');
    await deniedWrite('pilot_revisions',{owner_id:'eq.'+A.user.id,submission_id:'eq.'+mainId},A,{main_idea:'합성 위조'},'PATCH');
    await deniedWrite('pilot_revisions',{owner_id:'eq.'+A.user.id,submission_id:'eq.'+mainId},A,null,'DELETE');
    result.directDbIsolation=true;result.serverFieldsProtected=true;result.updateDeleteDenied=true;success=true;progress('access_controls');
  }finally{
    let failed=false;
    for(const attempt of attempts){
      try{
        const query={owner_id:'eq.'+attempt.owner,session_id:'eq.'+attempt.session,select:'id'};
        const response=await call(target+'/rest/v1/pilot_submissions?'+new URLSearchParams(query),{method:'DELETE',headers:admin});check(response.ok,'cleanup_delete_failed');
        const remaining=await call(target+'/rest/v1/pilot_submissions?'+new URLSearchParams(query),{headers:admin});check(remaining.ok&&(await remaining.json()).length===0,'cleanup_read_failed');
      }catch{failed=true;}
    }
    if(mainId){
      try{
        const remaining=await call(target+'/rest/v1/pilot_revisions?'+new URLSearchParams({owner_id:'eq.'+A.user.id,submission_id:'eq.'+mainId,select:'id'}),{headers:admin});check(remaining.ok&&(await remaining.json()).length===0,'cascade_failed');
        for(const suffix of ['/records/'+mainId,'/records/'+mainId+'/revisions','/records/'+mainId+'/revisions/'+requestId])check((await worker(suffix)).status===404,'deleted_read_not_denied');
        check((await worker('/records/'+mainId+'/revisions',{method:'POST',body:{requestId:crypto.randomUUID(),answers}})).status===404,'deleted_resave_not_denied');
      }catch{failed=true;}
    }
    check(!failed,'cleanup_unconfirmed');result.deleted=true;result.cascadeVerified=!!mainId;progress('cleaned');
  }
  check(success,'verification_incomplete');return result;
}
function readConfig(file){
  check(path.basename(file)==='.env.supabase-test','test_config_filename_invalid');
  return Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(x=>/^[A-Z0-9_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim()];}));
}
if(require.main===module&&!process.env.NODE_TEST_CONTEXT){
  const file=process.argv[2]||path.join(__dirname,'..','.env.supabase-test');
  Promise.resolve().then(()=>run(readConfig(file),fetch,stage=>console.log('합성 검증 단계:',stage))).then(result=>console.log('원격 기록 검증:',JSON.stringify(result))).catch(error=>{console.error('원격 기록 검증 실패:',error.verificationCode||'verification_failed');process.exitCode=1;});
}
module.exports={run};
