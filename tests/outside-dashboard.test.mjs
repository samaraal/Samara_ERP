import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/app/nursing/outside-nursing.js',import.meta.url),'utf8');
const context={isNursingManagerProfile:p=>p.designation==='Nursing Manager'};
vm.runInNewContext(source.slice(0,source.indexOf('  function OutsideNursingDashboard')),context);
const data={visits:[
 {id:'a',patient_id:'p',service_date:'2026-10-10',review_status:'Approved',billed_at:'2026-10-10',total:1252,materials_total:252},
 {id:'b',patient_id:'p',service_date:'2026-10-15',review_status:'Approved',billed_at:'2026-10-15',total:1758,materials_total:758},
 {id:'old',patient_id:'p',service_date:'2026-09-20',review_status:'Approved',billed_at:'2026-09-20',total:100},
 {id:'void',patient_id:'p',service_date:'2026-10-10',review_status:'Voided',billed_at:'2026-10-10',total:9000},
 {id:'pending',patient_id:'q',service_date:'2026-10-15',review_status:'Submitted',items_expected:true},
 {id:'ready',patient_id:'p',service_date:'2026-10-15',review_status:'Submitted'},
 {id:'mine',patient_id:'p',service_date:'2026-10-15',review_status:'Returned',recorded_by:'nurse'},
 {id:'other',patient_id:'p',service_date:'2026-10-15',review_status:'Returned',recorded_by:'other'}
],payments:[
 {id:'p1',visit_id:'a',payment_date:'2026-10-11',amount:1000},
 {id:'p2',visit_id:'a',payment_date:'2026-10-17',amount:252},
 {id:'p3',visit_id:'old',payment_date:'2026-10-11',amount:100},
 {id:'p4',visit_id:'void',payment_date:'2026-10-11',amount:9000},
 {id:'p1',visit_id:'a',payment_date:'2026-10-11',amount:1000}
],indents:[{id:'i',outside_visit_id:'void',invoice_visit_id:'a',status:'Received'},{id:'waiting',outside_visit_id:'pending',status:'Pending'}]};
const args={from:'2026-10-01',to:'2026-10-16',profile:{role:'Admin'}};
test('finance uses canonical approved invoices, receipt dates and balances as of To',()=>{
 const s=context.outsideDashboardSummary(data,args);
 assert.equal(s.invoiced,3010);assert.equal(s.collections,1100);assert.equal(s.outstanding,2010);assert.equal(s.materials,1010);
 assert.equal(s.approved.length,2);assert.equal(s.ready.length,1);assert.equal(s.waiting.length,1);assert.equal(s.indents.length,2);
});
test('patient filter applies to receipts, procedures and consolidated indents',()=>{
 const s=context.outsideDashboardSummary(data,{...args,patientId:'p'});
 assert.equal(s.collections,1100);assert.equal(s.pendingIndents.length,0);assert.equal(s.indents.length,1);
});
test('nonfinancial roles receive no monetary summary and nurses see their own correction queue',()=>{
 for(const role of ['Nurse','Manager']){
  const s=context.outsideDashboardSummary(data,{...args,profile:{id:'nurse',role}});
  for(const key of ['invoiced','collections','outstanding','materials','paid','unpaid'])assert.equal(key in s,false);
  assert.equal(s.returned.length,role==='Nurse'?1:2);
 }
 assert.equal(context.outsideDashboardAccess({role:'Accounts'}).finance,true);
 for(const role of ['STD','Caregiver','Kitchen'])assert.equal(context.outsideDashboardAccess({role}).read,false);
});
test('missing finance data produces an explicit error rather than a false zero',()=>{
 assert.throws(()=>context.outsideDashboardSummary({visits:[{...data.visits[0],total:undefined}]},args),/unavailable/);
});
test('empty period is zero and voided records cannot contribute to queues or finance',()=>{
 const s=context.outsideDashboardSummary(data,{...args,from:'2026-08-01',to:'2026-08-31'});
 assert.equal(s.visits.length,0);assert.equal(s.invoiced,0);assert.equal(s.collections,0);assert.equal(s.outstanding,0);
});
test('each authorized role gets one dedicated menu, with no new access for unrelated roles',()=>{
 const nav=fs.readFileSync(new URL('../src/app/core/04-supabase-roles-navigation.js',import.meta.url),'utf8');
 const ctx={employeeDepartment:p=>p.department,CM_PAGE_PREFIX:'Charge Master',CHARGE_MASTER_PAGES:[],STORE_SECTIONS:[]};
 vm.runInNewContext(nav.slice(nav.indexOf('  const ACCOUNTS_NAV_GROUPS='))+';this.allowed=allowedPagesForProfile;this.sections=sectionsFor;',ctx);
 for(const profile of [{role:'Admin'},{role:'Nurse'},{role:'Accounts'},{role:'Manager'},{role:'Manager',designation:'Nursing Manager'}]){
  const allowed=ctx.allowed(profile),sections=ctx.sections(allowed,profile.role);
  assert.equal(allowed.includes('Outside Nursing Dashboard'),true);
  assert.equal(sections.filter(s=>s.title==='OUTSIDE NURSING').length,1);
  assert.equal(sections.flatMap(s=>s.items).filter(x=>x==='Outside Nursing Dashboard').length,1);
  assert.equal(sections.flatMap(s=>s.items).filter(x=>x==='Outside Samara Nursing Procedures').length,1);
 }
 for(const role of ['STD','Kitchen','Caregiver'])assert.equal(ctx.allowed({role}).includes('Outside Nursing Dashboard'),false);
});
test('rendered nurse and manager dashboards contain no financial cards; drilldowns preserve filters',()=>{
 for(const role of ['Admin','Accounts','Nurse','Manager','Caregiver']){
  let state=0,target='',stored='';
  const states=[{...data,patients:[{id:'p',full_name:'Demo patient'}]},'',false,'2026-10-01','2026-10-16','p',{rows:[],missing:true},false]; // 2.18.63: + started procedures, start form
  const ctx={isNursingManagerProfile:p=>p.role==='Manager',todayISOIndia:()=> '2026-10-16',allowedPagesForProfile:()=>[],sessionStorage:{setItem:(key,value)=>stored=value},
   React:{Fragment:'fragment',useState:()=>[states[state++],()=>{}],useRef:()=>({current:0}),useEffect:()=>{}},
   h:(type,props,...children)=>({type,props:props||{},children})};
  vm.runInNewContext(source.slice(0,source.indexOf('  // Read-only accounting projection:')),ctx);
  const view=ctx.OutsideNursingDashboard({profile:{id:'nurse',role},onNavigate:page=>target=page});
  const text=node=>node==null||node===false?'':Array.isArray(node)?node.map(text).join(' '):typeof node==='object'?text(node.children):String(node);
  const content=text(view);
  if(role==='Caregiver'){assert.match(content,/not assigned/);continue;}
  const finance=['Admin','Accounts'].includes(role);
  assert.equal(content.includes('Net invoiced'),finance);assert.equal(content.includes('₹'),finance);
  const find=node=>Array.isArray(node)?node.flatMap(find):node&&typeof node==='object'?[node,...find(node.children)]:[];
  find(view).find(n=>n.type==='button'&&text(n)==='Open procedure register').props.onClick();
  assert.equal(target,'Outside Samara Nursing Procedures');assert.equal(JSON.parse(stored).patientId,'p');
 }
});
