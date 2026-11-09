const {test} = require('node:test');
const assert = require('node:assert/strict');
const {runOnce} = require('../scripts/experiment-runner.cjs');

test('successful request runs once and always disables and verifies', async()=>{
 const events=[]; const result=await runOnce({enable:async()=>events.push('on'),request:async()=>{events.push('request');return {usage:5}},disable:async()=>events.push('off'),isDisabled:async()=>{events.push('verify');return true}});
 assert.deepEqual(events,['on','request','off','verify']);assert.equal(result.usage,5);
});

test('failed request still disables and propagates failure', async()=>{
 const events=[];await assert.rejects(runOnce({enable:async()=>events.push('on'),request:async()=>{events.push('request');throw new Error('network');},disable:async()=>events.push('off'),isDisabled:async()=>{events.push('verify');return true}}),/network/);
 assert.deepEqual(events,['on','request','off','verify']);
});

test('timeout aborts request and then confirms disabled state', async()=>{
 const events=[]; let signal;
 await assert.rejects(runOnce({timeoutMs:10,enable:async()=>events.push('on'),request:s=>{signal=s;events.push('request');return new Promise(()=>{});},disable:async()=>events.push('off'),isDisabled:async()=>{events.push('verify');return true}}),/timeout/);
 assert.equal(signal.aborted,true);assert.deepEqual(events,['on','request','off','verify']);
});

test('disabling uncertainty is never reported as success', async()=>{
 await assert.rejects(runOnce({enable:async()=>{},request:async()=>({}),disable:async()=>{},isDisabled:async()=>false}),/disable unconfirmed/);
});
