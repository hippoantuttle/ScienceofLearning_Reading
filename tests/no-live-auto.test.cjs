'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');const path=require('node:path');
test('일반 Node 테스트는 실환경 비밀 파일을 읽거나 네트워크 검증을 실행하지 않는다',()=>{
 const cwd=path.join(__dirname,'..');const preload=path.join(__dirname,'deny-live-preload.cjs');
 const result=spawnSync(process.execPath,['--require',preload,'--test','scripts/verify-supabase-test.cjs'],{cwd,encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);assert.doesNotMatch(result.stdout+result.stderr,/합성 테스트 결과|LIVE_SECRET_READ_BLOCKED|NETWORK_BLOCKED/);
});
