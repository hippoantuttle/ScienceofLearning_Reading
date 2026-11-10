import contract from '../../record-contract.js';
import {handleRecords, original} from './records.mjs';
const map={schemaVersion:'schema_version',sessionId:'session_id',structureType:'structure_type',mainIdea:'main_idea',primary:'primary_text',support:'support_text',relation:'relation_text',retell:'retell',reflection:'reflection',newWords:'new_words',interests:'interests',rechecked:'rechecked'};
const textFields=['mainIdea','primary','support','relation','retell','reflection','newWords','interests'];
const required=['mainIdea','primary','support','relation','retell'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function valid(p){return p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).sort().join('|')===Object.keys(map).sort().join('|')&&p.schemaVersion===1&&uuid.test(p.sessionId)&&['claim','cause','problem'].includes(p.structureType)&&typeof p.rechecked==='boolean'&&textFields.every(k=>typeof p[k]==='string'&&p[k].isWellFormed()&&!p[k].includes('\0')&&Array.from(p[k]).length<=10000&&(!required.includes(k)||p[k].replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g,'').length>0));}
export function createHandler(fetchImpl=fetch){return async(req,env)=>{
 const origin=req.headers.get('origin');const headers={'Cache-Control':'no-store','Vary':'Origin'};
 const reply=(status,body)=>Response.json(body,{status,headers});
 // Chrome은 확장 페이지의 GET에 Origin을 붙이지 않는다. Origin이 있으면 반드시 허용 origin이어야 하고,
 // GET에 한해 Origin이 없는 요청도 받는다(접근 통제는 Origin이 아니라 로그인 토큰·활성 멤버십이 한다).
 if(!env.ALLOWED_ORIGIN||!(origin===env.ALLOWED_ORIGIN||(origin===null&&req.method==='GET')))return reply(403,{error:'forbidden'});
 if(origin)headers['Access-Control-Allow-Origin']=origin;
 if(req.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS';headers['Access-Control-Allow-Headers']='authorization,content-type,idempotency-key';return new Response(null,{status:204,headers});}
 if(!['POST','GET'].includes(req.method))return reply(405,{error:'method'});
 const auth=req.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(auth))return reply(401,{error:'unauthorized'});
 let base;const apiKey=env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;try{const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error();base=url.origin;if(!apiKey||apiKey.startsWith('sb_secret_'))throw Error();}catch{return reply(503,{error:'configuration'});}
 try{
  const upstreamHeaders={apikey:apiKey,Authorization:auth};
  const identity=await fetchImpl(base+'/auth/v1/user',{method:'GET',headers:upstreamHeaders,redirect:'manual'});
  if(!identity.ok)return reply(401,{error:'unauthorized'});const user=await identity.json();if(typeof user?.id!=='string'||!user.id)return reply(401,{error:'unauthorized'});
  const member=await fetchImpl(base+'/rest/v1/rpc/is_active_pilot_member',{method:'POST',headers:{...upstreamHeaders,'Content-Type':'application/json'},body:'{}',redirect:'manual'});
  if(!member.ok)return reply(503,{error:'membership_unavailable'});if(await member.json()!==true)return reply(403,{error:'inactive'});
  if(req.method==='GET'){const query=new URL(req.url).searchParams;if(query.size===1&&query.get('membership')==='1')return reply(200,{active:true});}
  const recordResponse=await handleRecords(req,{base,upstreamHeaders,user,fetchImpl,reply});if(recordResponse)return recordResponse;
  if(new URL(req.url).pathname!=='/submissions')return reply(404,{error:'not_found'});
  let payload,session;
  if(req.method==='POST'){
   const raw=await req.text();if(new TextEncoder().encode(raw).length>256000)return reply(413,{error:'too_large'});
   try{payload=JSON.parse(raw);}catch{return reply(400,{error:'invalid'});}
   const {articleTitle,sourceUrl,...legacy}=payload||{};
   if(articleTitle!==undefined || sourceUrl!==undefined){try{contract.article(articleTitle,sourceUrl);}catch{return reply(400,{error:'invalid'});}}
   if(!valid(legacy)||req.headers.get('idempotency-key')!==legacy.sessionId)return reply(400,{error:'invalid'});session=legacy.sessionId;
  }else{const url=new URL(req.url);session=url.searchParams.get('sessionId');if(!uuid.test(session||'')||[...url.searchParams.keys()].some(k=>k!=='sessionId'))return reply(400,{error:'invalid'});}
  const params=new URLSearchParams({owner_id:'eq.'+user.id,session_id:'eq.'+session,select:'*',limit:'1'});const db=base+'/rest/v1/pilot_submissions';
  const read=async()=>{const r=await fetchImpl(db+'?'+params,{method:'GET',headers:upstreamHeaders,redirect:'manual'});if(!r.ok)throw Error('db');const rows=await r.json();if(!Array.isArray(rows))throw Error('db');return rows[0]||null;};
  if(req.method==='POST'){
   const row=Object.fromEntries(Object.entries(map).map(([key,column])=>[column,payload[key]]));row.owner_id=user.id;
   if(payload.articleTitle!==undefined){row.article_title=payload.articleTitle;row.source_url=payload.sourceUrl;}
   const r=await fetchImpl(db,{method:'POST',headers:{...upstreamHeaders,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row),redirect:'manual'});
   if(!r.ok&&r.status!==409)return reply(r.status===401||r.status===403?403:503,{error:'save_failed'});
   const saved=await read();if(!saved)return reply(503,{error:'not_verified'});
   if(saved.owner_id!==user.id||Object.entries(row).some(([key,value])=>saved[key]!==value)||(payload.articleTitle===undefined&&saved.article_title!=null))return reply(409,{error:'conflict'});
   return reply(200,{status:'saved',submissionId:saved.id,savedAt:saved.saved_at});
  }
  const saved=await read();if(!saved||saved.owner_id!==user.id)return reply(404,{error:'not_found'});
  return reply(200,original(saved));
 }catch(error){
  if(error?.code==='records_schema_missing')return reply(503,{error:'records_schema_missing'});
  if(error?.status===401)return reply(401,{error:'unauthorized'});
  if(error?.status===403)return reply(403,{error:'forbidden'});
  return reply(503,{error:'unavailable'});
 }
};}
export default {fetch:createHandler()};
