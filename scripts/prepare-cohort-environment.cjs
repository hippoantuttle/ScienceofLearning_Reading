'use strict';
// Local review candidates only. No account roster, secret files or deployment.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateConfig,extensionId}=require('./build-extension.cjs');
const ROOT=path.resolve(__dirname,'..');
const SOURCES=['server/pilot-access.mjs','server/ai/pilot-worker.mjs','server/ai/worker.mjs','server/ai/feedback.mjs','server/ai/prompts/pre-reading-v2.mjs','server/submissions/worker.mjs','server/submissions/records.mjs','record-contract.js','server/migrations/20261110140000_google_cohort_access.sql'];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_WINDOW_MS=31*86400000;
function prepare({config,label,cohortId,capacity=5,expiresAt,unlimited=false,now=Date.now(),root=ROOT}={}){
 const settings=validateConfig(config),deadline=Date.parse(expiresAt);
 if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(label||'')||!/^[a-z][a-z0-9-]{2,63}$/.test(cohortId||'')||![5,14].includes(capacity))throw Error('후보 식별자·회차·5/14 정원을 확인하세요.');
 if(!Number.isFinite(deadline)||new Date(deadline).toISOString()!==expiresAt||deadline<=now||deadline-now>MAX_WINDOW_MS)throw Error('후보 기한은 현재부터 31일 이내 UTC ISO 시각이어야 합니다.');
 const userLimit=unlimited?'unlimited':'4',globalLimit=unlimited?'unlimited':String(capacity*4);
 if(settings.authUrl!=='https://mxhlxenfboiaywyhgyqs.supabase.co'||settings.endpoint!=='https://reading-submissions-pilot.patrick020308.workers.dev/submissions'||settings.aiEndpoint!=='https://reading-ai-pilot.patrick020308.workers.dev/recommend')throw Error('기존 프로젝트·Worker 주소만 후보로 준비합니다.');
 const id=extensionId(JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).key);
 const vars={SUPABASE_URL:settings.authUrl,ALLOWED_ORIGIN:'chrome-extension://'+id,PILOT_COHORT_ID:cohortId,PILOT_COHORT_EXPIRES_AT:expiresAt};
 const ai={name:'reading-ai-pilot',main:'server/ai/pilot-worker.mjs',compatibility_date:'2026-01-01',workers_dev:true,
  vars:{...vars,PILOT_SELFTEST_ONLY:'false',PILOT_AI_ENABLED:'false',PILOT_ARTICLE_ENABLED:'false',PILOT_FEEDBACK_ENABLED:'false',PILOT_USER_DAILY_LIMIT:userLimit,PILOT_GLOBAL_DAILY_LIMIT:globalLimit},
  durable_objects:{bindings:[{name:'PILOT_BUDGET',class_name:'PilotBudget'}]},migrations:[{tag:'v1',new_sqlite_classes:['PilotBudget']}]};
 const active=structuredClone(ai);for(const name of ['PILOT_AI_ENABLED','PILOT_ARTICLE_ENABLED','PILOT_FEEDBACK_ENABLED'])active.vars[name]='true';
 const submissions={name:'reading-submissions-pilot',main:'server/submissions/worker.mjs',compatibility_date:'2026-01-01',workers_dev:true,vars};
 const outputs={
  'wrangler.ai.disabled.json':ai,'wrangler.ai.review.json':active,'wrangler.submissions.review.json':submissions,
  'extension.google.public.json':{...settings,googleLoginEnabled:true,articleTestEnabled:false,feedbackTestEnabled:false},
  'extension.google-ai-review.public.json':{...settings,googleLoginEnabled:true,articleTestEnabled:true,feedbackTestEnabled:true}
 };
 const source={};for(const name of SOURCES){const file=path.join(root,name);if(fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile())throw Error('일반 소스만 허용합니다.');source[name]=fs.readFileSync(file);}
 const parent=path.join(root,'build');fs.mkdirSync(parent,{recursive:true});
 if(fs.lstatSync(parent).isSymbolicLink()||fs.realpathSync(parent)!==path.resolve(parent))throw Error('build 경로를 확인하세요.');
 const destination=path.join(parent,label);fs.mkdirSync(destination);
 for(const [name,data] of Object.entries(source)){const file=path.join(destination,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data,{flag:'wx'});}
 for(const [name,data] of Object.entries(outputs))fs.writeFileSync(path.join(destination,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 const report={task:'TASK-020',phase:'local-review-not-deployed',cohortId,capacity,expiresAt,extensionId:id,googleCallback:`https://${id}.chromiumapp.org/google-callback`,providerCallback:settings.authUrl+'auth/v1/callback',dailyUserLimit:userLimit,dailyGlobalLimit:globalLimit,requiredServerSecretNames:['DEEPSEEK_API_KEY','SUPABASE_PUBLISHABLE_KEY'],sourceHashes:Object.fromEntries(Object.entries(source).map(([name,data])=>[name,sha(data)])),preparerSha256:sha(fs.readFileSync(__filename)),remoteChanged:false,oauthVerified:false,rosterIncluded:false,humanQaVerified:false};
 fs.writeFileSync(path.join(destination,'preparation-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 return {destination,report};
}
if(require.main===module){
 try{
  const args=process.argv.slice(2),options={};let file;
  while(args.length){const flag=args.shift();if(flag==='--config')file=args.shift();else if(flag==='--label')options.label=args.shift();else if(flag==='--cohort')options.cohortId=args.shift();else if(flag==='--capacity')options.capacity=Number(args.shift());else if(flag==='--expires-at')options.expiresAt=args.shift();else if(flag==='--unlimited')options.unlimited=true;else throw Error();}
  if(!file?.endsWith('.public.json')||fs.lstatSync(file).isSymbolicLink())throw Error();
  options.config=JSON.parse(fs.readFileSync(file,'utf8'));
  const {destination,report}=prepare(options);console.log(JSON.stringify({output:destination,phase:report.phase,capacity:report.capacity,expiresAt:report.expiresAt,remoteChanged:false}));
 }catch{console.error('후보 준비 실패: 공개 설정·안전한 label/회차·5/14 정원·31일 이내 UTC 기한·새 출력 경로를 확인하세요. 비밀/명단은 읽지 않습니다.');process.exitCode=1;}
}
module.exports={prepare,SOURCES};
