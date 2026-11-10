// Optional cohort restriction, checked with the caller's own Supabase JWT.
export function cohortSettings(env){
 if(env.PILOT_COHORT_ID===undefined&&env.PILOT_COHORT_EXPIRES_AT===undefined)return {enabled:false};
 if(!/^[a-z][a-z0-9-]{2,63}$/.test(env.PILOT_COHORT_ID||''))return null;
 const deadline=Date.parse(env.PILOT_COHORT_EXPIRES_AT);
 if(!Number.isFinite(deadline)||new Date(deadline).toISOString()!==env.PILOT_COHORT_EXPIRES_AT)return null;
 return {enabled:true,id:env.PILOT_COHORT_ID,deadline};
}
export async function cohortAccess({settings,base,headers,fetchImpl}){
 if(!settings)return {status:503,code:'configuration'};
 if(!settings.enabled)return null;
 if(Date.now()>=settings.deadline)return {status:403,code:'cohort_expired'};
 try{
  const response=await fetchImpl(base+'/rest/v1/rpc/is_active_pilot_cohort_member',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_cohort_id:settings.id}),redirect:'manual'});
  if(!response.ok)return {status:503,code:'cohort_unavailable'};
  return await response.json()===true?null:{status:403,code:'cohort_denied'};
 }catch{return {status:503,code:'cohort_unavailable'};}
}
