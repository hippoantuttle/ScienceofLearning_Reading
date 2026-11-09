'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const MOCK = Object.freeze({terms:[{term:'가상 용어',definition:'실제 글과 무관한 예시 설명'}],background:['이 문장은 테스트 전용 예시입니다.'],structureType:'unspecified'});
function createServer({token}) {
  if (typeof token !== 'string' || !token) throw new Error('Local token required');
  const secret = Buffer.from(token); let requests = 0; let start = Date.now();
  return http.createServer((req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    const reply = (code,data) => { if (!res.headersSent) res.writeHead(code); res.end(JSON.stringify(data)); };
    if (req.method !== 'POST' || req.url !== '/recommend') return reply(404,{error:'not_found'});
    const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer /,''));
    if (supplied.length !== secret.length || !crypto.timingSafeEqual(supplied,secret)) return reply(401,{error:'unauthorized'});
    if (Date.now()-start >= 60000) { start=Date.now(); requests=0; }
    if (++requests > 10) return reply(429,{error:'rate_limited'});
    let bytes=0, body='', tooLarge=false;
    req.setTimeout(5000,()=>req.destroy());
    req.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024) tooLarge=true;else body+=chunk.toString('utf8');});
    req.on('end',()=>{
      if (tooLarge) return reply(413,{error:'too_large'});
      try { const data=JSON.parse(body); if (!data || Array.isArray(data) || typeof data!=='object' || Object.keys(data).length) return reply(400,{error:'mock_accepts_no_content'}); }
      catch { return reply(400,{error:'invalid_json'}); }
      return reply(200,{kind:'mock',recommendation:MOCK});
    });
  });
}
if (require.main===module) {
  const token=process.env.READING_LOCAL_TOKEN;
  if (!token) { console.error('READING_LOCAL_TOKEN is required'); process.exitCode=1; }
  else createServer({token}).listen(8787,'127.0.0.1',()=>console.log('Mock relay listening on loopback'));
}
module.exports={createServer};
