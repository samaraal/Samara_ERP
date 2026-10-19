// 2.18.7 Nurse idle screensaver: task builder (read only). Run with TZ=Asia/Kolkata node --test tests/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=f=>fs.readFileSync(new URL(`../src/app/${f}`,import.meta.url),'utf8');
const NOW=new Date('2026-10-19T10:15:00');

function load(tables){
  const RealDate=Date;
  class FakeDate extends RealDate{constructor(...a){super(...(a.length?a:[NOW.getTime()]))}static now(){return NOW.getTime()}}
  const q=name=>{
    const rows=tables[name]||[];
    const chain={select:()=>chain,or:()=>chain,eq:()=>chain,in:()=>chain,gte:()=>chain,limit:()=>chain,
      then:(res,rej)=>Promise.resolve({data:rows,error:null}).then(res,rej)};
    return chain;
  };
  const ctx={client:{from:q},h:()=>null,React:{useState:()=>[null,()=>{}]},document:{},window:{},console,Date:FakeDate,Promise,Map,Set,Math,String,Number,Array,JSON,Object,RegExp};
  vm.runInNewContext(read('patients/medication-helpers.js')+read('nursing/nurse-screensaver.js')+';this.__load=loadNurseSaverTasks;this.__boxes=nssBuildBoxes;',ctx);
  return ctx.__load().then(d=>({...d,boxes:ctx.__boxes([...d.overdue,...d.next])}));
}
const guest=(id,name,room,extra={})=>({id,title:'Mr.',full_name:name,room_no:room,bed_no:null,is_active:true,admission_status:'Admitted',vitals_schedule:null,diet_plan:'',...extra});
const G1=guest('g1','Kumar Lakshman','106'),G2=guest('g2','Selvam Raja','102'),G3=guest('g3','Anand Mohan','104');

test('Medicines grouped per Guest and time; given doses drop out; overdue strip',async()=>{
  const d=await load({
    patients:[G1,G2,G3],
    medication_orders:[
      {id:'m1',patient_id:'g2',patients:G2,medicine_name:'Metformin',strength:'500 mg',scheduled_times:['09:00','14:00'],is_active:true},
      {id:'m2',patient_id:'g2',patients:G2,medicine_name:'Amlodipine',strength:'5 mg',scheduled_times:['14:00'],is_active:true},
      {id:'m3',patient_id:'g3',patients:G3,medicine_name:'Insulin Actrapid',strength:'',scheduled_times:['12:45'],is_active:true},
      {id:'m4',patient_id:'g1',patients:G1,medicine_name:'Pantoprazole',strength:'40 mg',scheduled_times:['07:00'],is_active:true}
    ],
    medication_administrations:[{order_id:'m4',scheduled_date:'2026-10-19',scheduled_time:'07:00',status:'Given'}],
    vital_signs:[{patient_id:'g1',recorded_at:'2026-10-19T06:05:00+05:30'},{patient_id:'g2',recorded_at:'2026-10-19T06:10:00+05:30'},{patient_id:'g3',recorded_at:'2026-10-19T06:20:00+05:30'}],
    meal_records:[{patient_id:'g1',meal_date:'2026-10-19',meal_type:'Breakfast'},{patient_id:'g2',meal_date:'2026-10-19',meal_type:'Tiffin'},{patient_id:'g3',meal_date:'2026-10-19',meal_type:'Breakfast'}]
  });
  assert.equal(d.win.name,'Day Shift (7 AM–7 PM)');
  assert.equal(d.overdue.length,1);
  assert.equal(d.overdue[0].who,'Room 102 · Mr. Selvam Raja');
  const titles=d.next.map(x=>x.title);
  assert.ok(titles.some(t=>/Insulin Actrapid \(sliding scale\) — check sugar first/.test(t)));
  assert.ok(titles.includes('Medicines due (2)'));
  assert.ok(!titles.some(t=>/Pantoprazole|Metformin|Amlodipine/.test(t)),'medicine names stay hidden');
  assert.ok(titles.includes('Lunch — record food intake'));
  assert.ok(titles.includes('Vital signs'));
  assert.ok(d.next.every(x=>x.anyTime||x.at.getTime()<=NOW.getTime()+4*3600000));
});

test('Care windows, any-time care, approved procedures; discharged Guests skipped',async()=>{
  const OUT=guest('g9','Gone Guest','109',{admission_status:'Discharged'});
  const d=await load({
    patients:[G1,G2],
    care_orders:[
      {id:'c1',patient_id:'g1',patients:G1,care_type:'Sponge bath',shift:'Day Shift (7 AM–7 PM)',preferred_from:'10:00',preferred_to:'12:00',is_active:true},
      {id:'c2',patient_id:'g2',patients:G2,care_type:'Position change',shift:'Both shifts',is_active:true},
      {id:'c3',patient_id:'g2',patients:G2,care_type:'Night check',shift:'Night Shift (7 PM–7 AM)',is_active:true},
      {id:'c4',patient_id:'g9',patients:OUT,care_type:'Bath',shift:'Both shifts',is_active:true}
    ],
    care_logs:[],
    nursing_procedure_requests:[{id:'p1',patient_id:'g1',procedure_name:'Wound dressing',category:'Nursing Procedures',status:'Approved',scheduled_at:'2026-10-19T10:30:00+05:30'}],
    vital_signs:[{patient_id:'g1',recorded_at:'2026-10-19T06:05:00+05:30'},{patient_id:'g2',recorded_at:'2026-10-19T06:10:00+05:30'}]
  });
  const titles=d.next.map(x=>x.title);
  assert.ok(titles.includes('Sponge bath'));
  assert.ok(titles.includes('Position change'));
  assert.ok(!titles.includes('Night check'));
  assert.ok(!titles.includes('Bath'));
  const proc=d.next.find(x=>x.kind==='proc');
  assert.equal(proc.title,'Wound dressing');
  assert.equal(d.next[d.next.length-1].anyTime,true,'any-time care is listed last');
  const bath=d.next.find(x=>x.title==='Sponge bath');
  assert.equal(bath.state,'due');assert.equal(bath.windowText,'10:00–12:00');
});

test('Task-wise boxes: one box per type, late first, meal box lists each pending Guest',async()=>{
  const g=[G1,G2,G3];
  const d=await load({patients:g,
    medication_orders:[{id:'m1',patient_id:'g2',patients:G2,medicine_name:'X',strength:'5 mg',scheduled_times:['09:00','14:00'],is_active:true}],
    vital_signs:[],meal_records:[{patient_id:'g1',meal_date:'2026-10-19',meal_type:'Breakfast'},{patient_id:'g2',meal_date:'2026-10-19',meal_type:'Breakfast'},{patient_id:'g3',meal_date:'2026-10-19',meal_type:'Breakfast'}]});
  assert.equal(d.boxes.length,5,'all five task types always shown');
  assert.deepEqual(new Set(d.boxes.filter(b=>!b.empty).map(b=>b.group)),new Set(['med','vitals','meal']));
  assert.equal(d.boxes.slice(-2).map(b=>b.group).join(','),'proc,care','empty boxes last');
  const med=d.boxes.find(b=>b.group==='med');
  assert.equal(med.entries[0].late,true);
  assert.equal(med.entries[0].room,'Room 102');assert.equal(med.entries[0].name,'Mr. Selvam Raja');
  const meal=d.boxes.find(b=>b.group==='meal');
  assert.equal(meal.entries.length,3);
  assert.match(meal.meta,/3 Guests/);
  const vit=d.boxes.find(b=>b.group==='vitals');
  assert.ok(vit.entries.every(e=>e.detail===''));
});
