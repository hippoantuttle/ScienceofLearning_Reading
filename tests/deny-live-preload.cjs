'use strict';
const fs=require('node:fs');const original=fs.readFileSync;
fs.readFileSync=function(file,...args){if(String(file).endsWith('.env.supabase-test'))throw new Error('LIVE_SECRET_READ_BLOCKED');return original.call(this,file,...args)};
globalThis.fetch=async()=>{throw new Error('NETWORK_BLOCKED')};
