'use strict';
// Local synthetic-only manual Chrome fixture. Never use real tokens or text.
const http=require('node:http');
const mode=process.argv[2];
if(!['normal','timeout','late-success','late-failure','invalid'].includes(mode)){
 console.error('Usage: node tests/chrome-local-fixture.cjs normal|timeout|late-success|late-failure|invalid');process.exit(1);
}
const token='local-fixture-only';
const article=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>가상 독해 테스트</title><article><h1>가상 테스트 글</h1><p>이 문장은 독해 화면을 확인하기 위한 가상의 예시입니다.</p><p>실제 기사나 학습자 자료를 포함하지 않습니다.</p></article></html>')});
const relay=http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'||req.url!=='/recommend'){res.writeHead(404);return res.end('{}')}
 if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);return res.end('{}')}
 let body='';req.on('data',chunk=>{body+=chunk;if(body.length>1024)req.destroy()});
 req.on('end',()=>{if(body!=='{}'){res.writeHead(400);return res.end('{}')}
  const send=()=>{if(res.destroyed)return;if(mode==='late-failure'){res.writeHead(500);return res.end('{}')}
   res.end(JSON.stringify(mode==='invalid'?{kind:'mock',recommendation:{}}:{kind:'mock',recommendation:{terms:[{term:'가상 용어',definition:'실제 글과 무관한 설명'}],background:[],structureType:'unspecified'}}));};
  if(mode==='timeout')setTimeout(send,7000);else if(mode.startsWith('late-'))setTimeout(send,3000);else send();
 });
});
article.on('error',err=>{console.error('article server:',err.code);process.exitCode=1;relay.close()});
relay.on('error',err=>{console.error('relay server:',err.code);process.exitCode=1;article.close()});
article.listen(8788,'127.0.0.1',()=>relay.listen(8787,'127.0.0.1',()=>console.log(`Local fixture ready: ${mode}; article 127.0.0.1:8788; token local-fixture-only`)));
