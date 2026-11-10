'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {prepare,SOURCES}=require('../scripts/prepare-cohort-environment.cjs');
const config={authUrl:'https://mxhlxenfboiaywyhgyqs.supabase.co',publicKey:'sb_publishable_synthetic',endpoint:'https://reading-submissions-pilot.patrick020308.workers.dev/submissions',aiEndpoint:'https://reading-ai-pilot.patrick020308.workers.dev/recommend',articleTestEnabled:false,feedbackTestEnabled:false};
test('회차 준비는 명단/비밀 없는 5/14 후보만 만들고 기본 AI 비활성·정확한 회차/기한/콜백·독립 소스를 보존한다',()=>{
 const now=Date.now(),expiresAt=new Date(now+3600000).toISOString();
 for(const capacity of [5,14]){
  const args={config,label:'test-cohort-'+crypto.randomUUID(),cohortId:'team-test',capacity,now,expiresAt};
  const {destination,report}=prepare(args);
  try{
   const read=name=>JSON.parse(fs.readFileSync(path.join(destination,name),'utf8'));
   assert.equal(read('wrangler.ai.disabled.json').vars.PILOT_AI_ENABLED,'false');
   const active=read('wrangler.ai.review.json');assert.equal(active.vars.PILOT_COHORT_ID,'team-test');assert.equal(active.vars.PILOT_SELFTEST_ONLY,'false');
   assert.equal(active.vars.PILOT_GLOBAL_DAILY_LIMIT,String(capacity*4));assert.equal(active.vars.PILOT_SELFTEST_USER_ID,undefined);
   assert.equal(read('wrangler.submissions.review.json').vars.PILOT_COHORT_EXPIRES_AT,expiresAt);
   assert.equal(read('extension.google.public.json').googleLoginEnabled,true);assert.equal(read('extension.google.public.json').articleTestEnabled,false);
   assert.deepEqual(Object.keys(report.sourceHashes),SOURCES);assert.equal(report.rosterIncluded,false);assert.equal(report.remoteChanged,false);
   assert.equal(report.googleCallback,'https://jenapgoakhnmlmjcdnkfakkkgjobbfbb.chromiumapp.org/google-callback');
   assert.ok(!fs.existsSync(path.join(destination,'.env')));assert.ok(!fs.existsSync(path.join(destination,'submission-config.local.js')));
   assert.throws(()=>prepare(args));
  }finally{assert.equal(path.dirname(path.resolve(destination)),path.resolve(__dirname,'../build'));fs.rmSync(destination,{recursive:true,force:true});}
 }
 for(const invalid of [{capacity:6},{cohortId:'../escape'},{expiresAt:new Date(now-1).toISOString()},{expiresAt:new Date(now+32*86400000).toISOString()},{config:{...config,clientSecret:'synthetic'}}])assert.throws(()=>prepare({config,label:'test-invalid',cohortId:'team-test',now,expiresAt,...invalid}));
});
test('회차 준비는 31일 이내 기한과 명시적 무제한 한도를 지원한다',()=>{
 const now=Date.now(),expiresAt=new Date(now+15*86400000).toISOString();
 const {destination,report}=prepare({config,label:'test-cohort-'+crypto.randomUUID(),cohortId:'team-test',capacity:5,now,expiresAt,unlimited:true});
 try{
  const active=JSON.parse(fs.readFileSync(path.join(destination,'wrangler.ai.review.json'),'utf8'));
  assert.equal(active.vars.PILOT_USER_DAILY_LIMIT,'unlimited');assert.equal(active.vars.PILOT_GLOBAL_DAILY_LIMIT,'unlimited');
  assert.equal(active.vars.PILOT_COHORT_EXPIRES_AT,expiresAt);assert.equal(report.dailyUserLimit,'unlimited');
 }finally{fs.rmSync(destination,{recursive:true,force:true});}
});
