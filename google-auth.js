'use strict';
// Supabase provider OAuth + PKCE. No provider tokens, refresh tokens or verifier
// are persisted. Google consent runs in Chrome's own authentication window.
const GoogleAuth=(()=>{
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  function create({baseUrl,publicKey,identity=globalThis.chrome?.identity,extensionId=globalThis.chrome?.runtime?.id,fetchImpl=fetch,cryptoImpl=globalThis.crypto,now=Date.now}){
    const base=new URL(baseUrl);
    if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!publicKey||publicKey.startsWith('sb_secret_'))throw Error('Google 로그인 설정을 확인하세요.');
    if(!/^[a-p]{32}$/.test(extensionId||'')||!identity?.getRedirectURL||!identity?.launchWebAuthFlow)throw Error('Google 로그인을 지원하는 확장 설치본을 사용하세요.');
    const callback=identity.getRedirectURL('google-callback');
    if(callback!==`https://${extensionId}.chromiumapp.org/google-callback`)throw Error('Google 로그인 복귀 주소를 확인하세요.');
    let busy=false,generation=0;
    async function json(path,{method='GET',token,body}={}){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetchImpl(base.origin+path,{method,headers:{apikey:publicKey,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
        if(!response.ok)throw Error();return await response.json();
      }catch{throw Error('Google 로그인 확인에 실패했습니다. 설정과 연결을 확인하고 다시 시도하세요.');}
      finally{clearTimeout(timer);}
    }
    const login=async()=>{
      if(busy)throw Error('Google 로그인이 진행 중입니다.');
      busy=true;const attempt=++generation,deadline=now()+5*60*1000;
      let verifier=encode(cryptoImpl.getRandomValues(new Uint8Array(32)));
      const flow=encode(cryptoImpl.getRandomValues(new Uint8Array(24)));
      const valid=()=>{if(attempt!==generation||now()>=deadline)throw Error('Google 로그인 시도가 종료되었습니다. 다시 로그인하세요.');};
      try{
        const challenge=encode(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
        valid();
        const redirect=new URL(callback);redirect.searchParams.set('flow',flow);
        const authorize=new URL(base.origin+'/auth/v1/authorize');
        authorize.search=new URLSearchParams({provider:'google',redirect_to:redirect.href,code_challenge:challenge,code_challenge_method:'s256',scopes:'openid email profile',prompt:'select_account'}).toString();
        let result;
        try{result=await identity.launchWebAuthFlow({url:authorize.href,interactive:true});}
        catch{throw Error('Google 로그인을 완료하지 않았습니다. 다시 시도할 수 있습니다.');}
        valid();
        let returned;try{returned=new URL(result);}catch{throw Error('Google 로그인 응답을 확인하지 못했습니다.');}
        if(returned.origin!==redirect.origin||returned.pathname!==redirect.pathname||returned.username||returned.password||returned.hash||returned.searchParams.getAll('flow').length!==1||returned.searchParams.get('flow')!==flow)throw Error('Google 로그인 복귀 정보가 일치하지 않습니다.');
        if(returned.searchParams.has('error'))throw Error('Google 로그인을 완료하지 않았습니다. 다시 시도할 수 있습니다.');
        const code=returned.searchParams.get('code');
        if(returned.searchParams.getAll('code').length!==1||!code||code.length>2048||/[\s\x00-\x1f]/.test(code))throw Error('Google 로그인 응답을 확인하지 못했습니다.');
        const session=await json('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:code,code_verifier:verifier}});
        verifier='';valid();
        const token=session?.access_token;
        if(typeof token!=='string'||!token||token.length>8192||/\s/.test(token)||!uuid.test(session?.user?.id||''))throw Error('Google 로그인 응답을 확인하지 못했습니다.');
        const user=await json('/auth/v1/user',{token});valid();
        const email=typeof user?.email==='string'?user.email.trim().toLowerCase():'';
        const verified=Array.isArray(user?.identities)&&user.identities.some(i=>i.provider==='google'&&i.identity_data?.email_verified===true&&i.identity_data?.email?.toLowerCase()===email);
        if(user?.id!==session.user.id||!email||!user.email_confirmed_at||!verified)throw Error('확인된 Google 계정으로 다시 로그인하세요.');
        return {accessToken:token,userId:user.id,email};
      }finally{verifier='';busy=false;}
    };
    login.cancel=()=>{generation++;};
    return login;
  }
  return {create};
})();
if(typeof module!=='undefined')module.exports=GoogleAuth;
