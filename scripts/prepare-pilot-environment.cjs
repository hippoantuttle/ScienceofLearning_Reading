'use strict';
// Creates reviewable local candidates only. No deploy, Secret reads, or network.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateConfig,extensionId}=require('./build-extension.cjs');
const ROOT=path.resolve(__dirname,'..');
const SOURCES=['server/ai/pilot-worker.mjs','server/ai/worker.mjs','server/ai/feedback.mjs','server/ai/prompts/pre-reading-v2.mjs','server/pilot-access.mjs'];
const AI='https://reading-ai-pilot.patrick020308.workers.dev/recommend';
const REQUIRED_SECRETS=['DEEPSEEK_API_KEY','SUPABASE_PUBLISHABLE_KEY','PILOT_SELFTEST_USER_ID'];
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');

function candidates(config,{expiresAt,now=Date.now(),root=ROOT}={}){
  const settings=validateConfig(config),deadline=Date.parse(expiresAt);
  if(settings.aiEndpoint!==AI)throw Error('본인 시험 대상은 reading-ai-pilot입니다.');
  if(!Number.isFinite(deadline)||new Date(deadline).toISOString()!==expiresAt||deadline<=now||deadline-now>24*60*60*1000)
    throw Error('시험 기한은 현재부터 24시간 이내의 UTC ISO 시각이어야 합니다.');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  const id=extensionId(manifest.key);
  const base={name:'reading-ai-pilot',main:'server/ai/pilot-worker.mjs',compatibility_date:'2026-01-01',workers_dev:true,
    vars:{SUPABASE_URL:settings.authUrl,ALLOWED_ORIGIN:'chrome-extension://'+id,
      PILOT_AI_ENABLED:'false',PILOT_ARTICLE_ENABLED:'false',PILOT_FEEDBACK_ENABLED:'false',
      PILOT_SELFTEST_ONLY:'true',PILOT_SELFTEST_EXPIRES_AT:expiresAt,
      PILOT_USER_DAILY_LIMIT:'5',PILOT_GLOBAL_DAILY_LIMIT:'5'},
    durable_objects:{bindings:[{name:'PILOT_BUDGET',class_name:'PilotBudget'}]},
    migrations:[{tag:'v1',new_sqlite_classes:['PilotBudget']}]};
  const active=structuredClone(base);
  for(const key of ['PILOT_AI_ENABLED','PILOT_ARTICLE_ENABLED','PILOT_FEEDBACK_ENABLED'])active.vars[key]='true';
  return {disabled:base,active,extensionDisabled:{...settings,articleTestEnabled:false,feedbackTestEnabled:false},
    extensionActive:{...settings,articleTestEnabled:true,feedbackTestEnabled:true},extensionId:id};
}

function secretReadiness(names){
  if(!Array.isArray(names)||!names.every(x=>typeof x==='string'))throw Error('Secret 이름 목록 형식 오류');
  const present=new Set(names);
  return REQUIRED_SECRETS.filter(name=>name==='SUPABASE_PUBLISHABLE_KEY'?!present.has(name)&&!present.has('SUPABASE_ANON_KEY'):!present.has(name));
}

function prepare({config,label,expiresAt,now,root=ROOT}={}){
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(label||''))throw Error('안전한 label이 필요합니다.');
  const data=candidates(config,{expiresAt,now,root});
  const inputs={};
  for(const name of SOURCES){
    const file=path.join(root,name);
    if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('일반 소스 파일만 허용합니다.');
    inputs[name]=fs.readFileSync(file);
  }
  const parent=path.join(root,'build');if(!fs.existsSync(parent))fs.mkdirSync(parent);
  if(fs.lstatSync(parent).isSymbolicLink()||fs.realpathSync(parent)!==path.resolve(parent))throw Error('build 경로 오류');
  const destination=path.join(parent,label);fs.mkdirSync(destination);
  for(const [name,buffer] of Object.entries(inputs)){
    const file=path.join(destination,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,buffer,{flag:'wx'});
  }
  for(const [name,value] of [['wrangler.disabled.json',data.disabled],['wrangler.selftest-review.json',data.active],['extension.disabled.public.json',data.extensionDisabled],['extension.selftest-review.public.json',data.extensionActive]])
    fs.writeFileSync(path.join(destination,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const report={task:'TASK-017',phase:'single-person-review-not-deployed',worker:'reading-ai-pilot',expiresAt,extensionId:data.extensionId,
    dailyUserLimit:5,dailyGlobalLimit:5,requiredSecretNames:REQUIRED_SECRETS,
    sourceHashes:Object.fromEntries(Object.entries(inputs).map(([name,value])=>[name,sha(value)])),
    preparerSha256:sha(fs.readFileSync(__filename)),remoteChanged:false,actualAiVerified:false};
  fs.writeFileSync(path.join(destination,'preparation-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return {destination,report};
}

if(require.main===module){
  try{
    const args=process.argv.slice(2),options={};let configPath;
    while(args.length){const flag=args.shift();if(flag==='--label')options.label=args.shift();else if(flag==='--expires-at')options.expiresAt=args.shift();else if(flag==='--config')configPath=args.shift();else throw Error();}
    if(!configPath?.endsWith('.public.json')||fs.lstatSync(configPath).isSymbolicLink())throw Error();
    options.config=JSON.parse(fs.readFileSync(configPath,'utf8'));
    const {destination,report}=prepare(options);
    console.log(JSON.stringify({output:destination,phase:report.phase,expiresAt:report.expiresAt,requiredSecretNames:report.requiredSecretNames}));
  }catch{console.error('준비 실패: 공개 설정·label·24시간 이내 UTC 시험 기한·출력 경로를 확인하세요. 비밀값은 읽거나 출력하지 않습니다.');process.exitCode=1;}
}
module.exports={SOURCES,AI,REQUIRED_SECRETS,candidates,secretReadiness,prepare};
