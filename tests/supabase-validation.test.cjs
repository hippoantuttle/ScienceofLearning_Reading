const {test}=require('node:test');const assert=require('node:assert/strict');const {validateConfig,runVerification}=require('../scripts/verify-supabase-test.cjs');
const config={SUPABASE_URL:'https://mxhlxenfboiaywyhgyqs.supabase.co',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'b',SUPABASE_TEST_EMAIL_A:'a@example.invalid',SUPABASE_TEST_PASSWORD_A:'a',SUPABASE_TEST_EMAIL_B:'b@example.invalid',SUPABASE_TEST_PASSWORD_B:'b',SUPABASE_TEST_EMAIL_C:'c@example.invalid',SUPABASE_TEST_PASSWORD_C:'c'};
test('허용된 프로젝트와 서로 다른 세 테스트 계정이 필요하다',()=>{
 assert.throws(()=>validateConfig({...config,SUPABASE_URL:'https://other.invalid'}));assert.throws(()=>validateConfig({...config,SUPABASE_TEST_EMAIL_C:config.SUPABASE_TEST_EMAIL_A}));
 assert.throws(()=>validateConfig({...config,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'}));
});
test('B가 비활성이면 타인 접근 차단을 통과로 표시하지 않는다',async()=>{
 let inserts=0;const fake=async(url,opt)=>{
  if(url.includes('/auth/v1/token')){const v=JSON.parse(opt.body).email[0];return Response.json({access_token:'token-'+v,user:{id:'owner-'+v}})}
  if(url.includes('/rpc/is_active_pilot_member'))return Response.json(opt.headers.Authorization==='Bearer token-a');
  if(opt.method==='POST')inserts++;throw new Error('unexpected');
 };await assert.rejects(runVerification(config,fake),/활성 상태/);assert.equal(inserts,0);
});
test('신규 키는 apikey 전용이며 로그인 JWT와 혼동하지 않는다',async()=>{
 const fresh={...config,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'};delete fresh.SUPABASE_ANON_KEY;delete fresh.SUPABASE_SERVICE_ROLE_KEY;const sent=[];let record;
 const fake=async(url,opt)=>{sent.push({url,headers:opt.headers});
  if(url.includes('/auth/v1/token')){const v=JSON.parse(opt.body).email[0];return Response.json({access_token:'token-'+v,user:{id:'owner-'+v}})}
  if(url.includes('/rpc/'))return Response.json(opt.headers.Authorization!=='Bearer token-c');
  if(opt.method==='POST'){const row=JSON.parse(opt.body);if(opt.headers.Authorization==='Bearer token-c'||row.owner_id!=='owner-'+opt.headers.Authorization.slice(-1))return new Response('',{status:403});if(record)return new Response('',{status:409});record=row;return new Response(null,{status:201})}
  if(opt.method==='DELETE'){record=null;return new Response(null,{status:204})}
  if(!opt.headers.Authorization)return opt.headers.apikey==='sb_publishable_test'?new Response('',{status:401}):Response.json(record?[record]:[]);
  if(opt.headers.Authorization==='Bearer token-b')return Response.json([]);return Response.json(record?[record]:[]);
 };await runVerification(fresh,fake);
 const admin=sent.filter(x=>x.headers.apikey==='sb_secret_test');assert.ok(admin.length);assert.ok(admin.every(x=>!('Authorization' in x.headers)));
 const anonymous=sent.find(x=>x.headers.apikey==='sb_publishable_test'&&!('Authorization' in x.headers)&&x.url.includes('pilot_submissions'));assert.ok(anonymous);
});
test('활성 A·B, 비활성 C와 위조·중복·격리·삭제 검증',async()=>{
 let record;const fake=async(url,opt)=>{
  if(url.includes('/auth/v1/token')){const v=JSON.parse(opt.body).email[0];return Response.json({access_token:'token-'+v,user:{id:'owner-'+v}})}
  if(url.includes('/rpc/is_active_pilot_member'))return Response.json(opt.headers.Authorization!=='Bearer token-c');
  if(opt.method==='POST'){
   const row=JSON.parse(opt.body);
   if(opt.headers.Authorization==='Bearer token-c'||row.owner_id!=='owner-'+opt.headers.Authorization.slice(-1))return new Response('',{status:403});
   if(record)return new Response('',{status:409});record={...row,id:'fixture-id'};return new Response(null,{status:201});
  }
  if(opt.method==='DELETE'){record=null;return new Response(null,{status:204})}
  if(opt.headers.Authorization==='Bearer a')return new Response('',{status:401});
  if(opt.headers.Authorization==='Bearer token-b')return Response.json([]);
  return Response.json(record?[record]:[]);
 };
 assert.deepEqual(await runVerification(config,fake),{authenticated:true,activeMembers:true,inactiveDenied:true,forgeryDenied:true,saved:true,duplicateDenied:true,ownerRead:true,anonymousDenied:true,otherDenied:true,deleted:true});
});
