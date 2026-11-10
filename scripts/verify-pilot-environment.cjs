'use strict';
// Unauthenticated probes only: fixed synthetic payloads, no real account/token.
const BASE='https://reading-ai-pilot.patrick020308.workers.dev';
const ORIGIN='chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb';
const SYNTHETIC_ARTICLE='사전점검용으로 직접 만든 가상 문장입니다.';
function probeBody(route){
  if(route==='/recommend-article')return JSON.stringify({article:SYNTHETIC_ARTICLE});
  if(route==='/feedback')return JSON.stringify({article:SYNTHETIC_ARTICLE,sessionId:'11111111-1111-4111-8111-111111111111'});
  return '{}';
}
async function verify({fetchImpl=fetch}={}){
  const cases=[
    ['origin-missing','/recommend','POST',{},403,'forbidden'],
    ['origin-wrong','/recommend','POST',{Origin:'https://example.invalid'},403,'forbidden'],
    ['token-missing','/recommend','POST',{Origin:ORIGIN},401,'unauthorized'],
    ['preflight','/recommend','OPTIONS',{Origin:ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},204,null],
    ...['/recommend','/recommend-article','/feedback'].map(route=>['gate'+route,route,'POST',{Origin:ORIGIN,Authorization:'Bearer synthetic-readiness-only'},null,null])
  ];
  const results=[];
  for(const [name,route,method,headers,status,code] of cases){
    const response=await fetchImpl(BASE+route,{method,headers:{...headers,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:probeBody(route)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
    let body=null;if(response.status!==204)try{body=await response.json();}catch{}
    const gate=status===null;
    const acceptable=gate?((response.status===503&&['disabled','configuration','selftest_expired'].includes(body?.error))||(response.status===401&&body?.error==='unauthorized')):response.status===status&&(!code||body?.error===code);
    const cors=headers.Origin!==ORIGIN||response.headers.get('access-control-allow-origin')===ORIGIN;
    // Only known codes are retained; never copy arbitrary remote response text.
    results.push({name,status:response.status,code:acceptable?body?.error??null:'unexpected',ok:acceptable&&cors});
  }
  return {kind:'unauthenticated-readiness-only',base:BASE,results,passed:results.every(x=>x.ok),actualAiVerified:false,accountVerified:false};
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length!==1||args[0]!=='--remote'){console.error('명시 실행: node scripts/verify-pilot-environment.cjs --remote (실제 AI·계정 검증 아님)');process.exitCode=1;}
  else verify().then(report=>{console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}).catch(()=>{console.error('사전점검 실패: 네트워크 또는 예상하지 못한 응답. 인증값·본문은 수집하지 않습니다.');process.exitCode=1;});
}
module.exports={BASE,ORIGIN,SYNTHETIC_ARTICLE,probeBody,verify};
