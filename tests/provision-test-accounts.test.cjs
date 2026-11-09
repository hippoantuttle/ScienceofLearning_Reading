const {test}=require('node:test');const assert=require('node:assert/strict');const {provision}=require('../scripts/provision-test-accounts.cjs');
test('가상 계정 세 개 생성·멤버십 A/B 활성 C 비활성을 재조회한다',async()=>{
 const records=[];const fetchImpl=async(url,opt)=>{
  if(url.endsWith('/auth/v1/admin/users')&&opt.method==='POST'){const b=JSON.parse(opt.body);return Response.json({id:'id-'+(records.length+1),email:b.email})}
  if(url.includes('/auth/v1/admin/users/')&&opt.method==='GET')return Response.json({id:url.split('/').pop()});
  if(url.endsWith('/rest/v1/pilot_members')&&opt.method==='POST'){records.push(JSON.parse(opt.body));return new Response(null,{status:201})}
  if(url.includes('/rest/v1/pilot_members?')&&opt.method==='GET'){const id=new URL(url).searchParams.get('user_id').slice(3);return Response.json(records.filter(x=>x.user_id===id))}
  throw new Error('unexpected');
 };
 const config={SUPABASE_URL:'https://mxhlxenfboiaywyhgyqs.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic'};let writes=0;
 const result=await provision(config,fetchImpl,()=>{writes++});assert.deepEqual(result,{accounts:3,members:3});assert.equal(writes,4);assert.deepEqual(records.map(x=>x.enabled),[true,true,false]);
});
test('기존 테스트 자격이 있으면 생성하지 않는다',async()=>{let calls=0;await assert.rejects(provision({SUPABASE_URL:'https://mxhlxenfboiaywyhgyqs.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'a',SUPABASE_TEST_EMAIL_A:'occupied'},async()=>{calls++},()=>{}));assert.equal(calls,0)});
