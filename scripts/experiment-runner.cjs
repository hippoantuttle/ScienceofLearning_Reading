'use strict';
// Local orchestration core. It has no Cloudflare adapter or CLI and cannot run an experiment by itself.
async function runOnce({enable, request, disable, isDisabled, timeoutMs=15000}) {
  const controller=new AbortController(); let timer; let value; let failure;
  try {
    await enable();
    value=await Promise.race([
      request(controller.signal),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('request timeout'));},timeoutMs);})
    ]);
  } catch(error) { failure=error; }
  finally {
    clearTimeout(timer);
    try { await disable(); if (!(await isDisabled())) throw new Error('disable unconfirmed'); }
    catch { throw new Error('disable unconfirmed'); }
  }
  if(failure) throw failure;
  return value;
}
module.exports={runOnce};
