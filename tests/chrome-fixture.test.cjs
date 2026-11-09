const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fixture=path.join(__dirname,'chrome-local-fixture.cjs');
test('Chrome fixture 각 모드의 루프백 HTTP를 검증한다',async()=>{
 for(const mode of ['normal','invalid','late-success','late-failure','timeout']){
  const child=spawn(process.execPath,[fixture,mode],{stdio:['ignore','pipe','pipe']});
  try{
   await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.stderr.once('data',b=>reject(new Error(String(b))));child.once('exit',c=>reject(new Error(`fixture exit ${c}`)));});
   assert.equal((await fetch('http://127.0.0.1:8788/')).status,200);
   const start=Date.now();const response=await fetch('http://127.0.0.1:8787/recommend',{method:'POST',headers:{Authorization:'Bearer local-fixture-only'},body:'{}'});
   const elapsed=Date.now()-start;const payload=await response.json();
   assert.equal(response.status,mode==='late-failure'?500:200,mode);
   if(mode==='normal')assert.equal(payload.kind,'mock');
   if(mode==='invalid')assert.deepEqual(payload.recommendation,{});
   if(mode.startsWith('late-'))assert.ok(elapsed>=2500,`${mode} ${elapsed}`);
   if(mode==='timeout')assert.ok(elapsed>=6500,`${mode} ${elapsed}`);
  }finally{child.kill();await new Promise(r=>child.once('exit',r));}
 }
});
