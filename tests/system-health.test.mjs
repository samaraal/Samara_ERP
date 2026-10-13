// 2.16.43 System Health: request watcher (bootstrap-error.js) and fault scrubbing (core/09-error-safety.js).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const boot=fs.readFileSync(new URL('../bootstrap-error.js',import.meta.url),'utf8');
function loadWatcher(answer){
  const calls=[];const window={addEventListener(){},location:{href:'https://app.samaraassistedliving.com/'},fetch:async(input,init)=>{calls.push(input);return answer(input,init);}};
  vm.runInNewContext(boot,{window,document:{},navigator:{onLine:true},URL,setTimeout,Date});
  return {window,calls,queue:()=>window.__samaraFaultQueue};
}
const R=(status)=>({status});
test('Successful requests pass through unchanged and record nothing',async()=>{const w=loadWatcher(()=>R(200));const r=await w.window.fetch('https://x.supabase.co/rest/v1/patients?select=*',{method:'GET'});assert.equal(r.status,200);assert.equal(w.queue().length,0);});
test('Server error, refused save, network error are recorded with table/function name only',async()=>{
 let w=loadWatcher(()=>R(503));await w.window.fetch('https://x.supabase.co/functions/v1/talk-to-guest',{method:'POST',body:'secret guest text'});
 assert.equal(w.queue()[0].kind,'server-error');assert.equal(w.queue()[0].detail.name,'talk-to-guest');assert.ok(!JSON.stringify(w.queue()).includes('secret'));
 w=loadWatcher(()=>R(403));await w.window.fetch('https://x.supabase.co/rest/v1/vital_signs?patient_id=eq.123',{method:'POST'});
 assert.equal(w.queue()[0].kind,'save-failed');assert.equal(w.queue()[0].detail.name,'vital_signs');assert.ok(!JSON.stringify(w.queue()).includes('patient_id'));
 w=loadWatcher(()=>{throw new TypeError('Failed to fetch')});await assert.rejects(w.window.fetch('https://x.supabase.co/rest/v1/rooms',{method:'GET'}));assert.equal(w.queue()[0].kind,'network-error');});
test('Not recorded: reads that return 4xx, conflicts (409), the fault log itself, login calls, other websites',async()=>{
 for(const [url,method,status] of [['https://x.supabase.co/rest/v1/patients','GET',404],['https://x.supabase.co/rest/v1/patients','POST',409],['https://x.supabase.co/rest/v1/client_errors','POST',500],['https://x.supabase.co/auth/v1/token','POST',400],['https://cdn.jsdelivr.net/npm/react','GET',500]]){
  const w=loadWatcher(()=>R(status));await w.window.fetch(url,{method});assert.equal((w.queue()||[]).length,0,url);}});
test('Slow request (> 8 s) recorded',async()=>{const realNow=Date.now;let t=1000;Date.now=()=>t;try{const w=loadWatcher(async()=>{t+=9000;return R(200);});await w.window.fetch('https://x.supabase.co/rest/v1/indents',{method:'GET'});assert.equal(w.queue()[0].kind,'slow-request');assert.equal(w.queue()[0].detail.ms,9000);}finally{Date.now=realNow;}});
test('Fault messages mask phone numbers and e-mails; detail too',()=>{
 const src=fs.readFileSync(new URL('../src/app/core/09-error-safety.js',import.meta.url),'utf8');
 const rows=[];const client={from:()=>({insert:async r=>{rows.push(r);return {};}})};
 const window={};const ctx={window,client,APP_VERSION:'t',React:{Component:class{}},h:()=>null,navigator:{userAgent:'x'},console,Promise,JSON,Map,Date,String,setTimeout};ctx.window.location={pathname:'/',search:''};ctx.location=ctx.window.location;
 vm.runInNewContext(src+';window.__r=reportClientError;',ctx);
 window.SamaraFault('ttg-error','Call +91 9840380878 or mail a.b@x.com',{phone:'9176735577',ok:'fine'});
 assert.equal(rows.length,1);assert.ok(!rows[0].message.includes('9840380878'));assert.ok(!rows[0].message.includes('a.b@x.com'));assert.equal(rows[0].detail.phone,'[number]');assert.equal(rows[0].detail.ok,'fine');});
