import Source from '../../sentence-source.js';
import Contract from '../../reading-support-contract.js';
import {CANDIDATE_SYSTEM} from './prompts/reading-candidates-v1.mjs';
export async function callCandidates(key,fetchImpl,body) {
  const snapshot=Contract.request(body), controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),50000);
  try {
    const res=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},signal:controller.signal,
      body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:128,response_format:{type:'json_object'},messages:[{role:'system',content:CANDIDATE_SYSTEM},{role:'user',content:JSON.stringify({sentences:snapshot.sentences.map(({id,text})=>({id,text}))})}]})});
    if(!res.ok||!res.body)throw Error('provider');
    const reader=res.body.getReader(), chunks=[];let size=0;
    for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>8192){void reader.cancel();throw Error('provider');}chunks.push(p.value);}
    const bytes=new Uint8Array(size);let at=0;for(const x of chunks){bytes.set(x,at);at+=x.byteLength;}
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(data.choices?.length!==1||data.choices[0].finish_reason!=='stop'||typeof data.choices[0].message?.content!=='string')throw Error('provider');
    const candidateIds=Contract.candidateIds(JSON.parse(data.choices[0].message.content),snapshot.sentences);
    return {kind:'reading-candidates',schemaVersion:1,requestId:body.requestId,documentHash:await Source.hash(body.article),segmentationVersion:Source.VERSION,promptVersion:'reading-candidates-v1',modelId:'deepseek-flash',candidateIds};
  } finally {clearTimeout(timer);}
}
