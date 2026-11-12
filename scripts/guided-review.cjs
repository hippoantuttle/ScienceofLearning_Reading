'use strict';
// A synthetic article only. No AI, credentials, account data, or outbound requests.
const http=require('node:http');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>합성 검토 글 · 마을 도서관</title><style>body{max-width:42rem;margin:3rem auto;padding:1rem;font:20px/1.9 sans-serif;color:#172333;background:#faf8f2}h1{line-height:1.3}</style><main><article><h1>마을 도서관의 주말 운영</h1>
<p>가상의 마을 도서관은 주말에도 문을 열기로 했다. 평일에 일하는 주민들이 도서관 이용 시간을 늘려 달라고 요청했기 때문이다. 운영 시간을 늘리는 데 필요한 인력은 지역 자원봉사자들이 일부 맡기로 했다.</p>
<p>도서관은 처음 두 달 동안 토요일 오후에만 시범 운영한다. 운영자는 방문 인원과 자원봉사자의 부담을 살펴본 뒤 시간을 조정할 계획이다. 주민들은 책을 빌리는 것뿐 아니라 이웃과 만나는 공간으로도 도서관을 이용하고 싶다고 말했다.</p>
</article></main><footer>직접 작성한 합성 검토 자료입니다. 실제 기사·학습자 자료가 아닙니다.</footer></html>`;
if(require.main===module){
 const server=http.createServer((req,res)=>{
  if(req.method!=='GET'||req.url!=='/'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
 });
 server.on('error',()=>{console.error('합성 검토 서버를 시작하지 못했습니다. 8798 포트 사용 여부를 확인하세요.');process.exitCode=1;});
 server.listen(8798,'127.0.0.1',()=>console.log('합성 검토 글: http://127.0.0.1:8798/ (종료: Ctrl+C)'));
}
module.exports={html};
