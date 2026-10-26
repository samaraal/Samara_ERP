import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../supabase/functions/daily-patient-report/clinical-core.mjs';

const T=(iso,hm)=>C.at(iso,hm);
const sum=r=>r.given+r.refused+r.withheld+r.missed+r.unresolved;

test('Daily period: exact 24 h ending at the cutoff, India time',()=>{
  let p=C.dailyPeriod({cutoff:'20:00',now:T('2026-10-25','20:05')});
  assert.equal(C.fmtDT(p.from),'24-10-2026, 08:00 PM');assert.equal(C.fmtDT(p.to),'25-10-2026, 08:00 PM');assert.equal(p.sinceAdmission,false);
  p=C.dailyPeriod({cutoff:'20:00',now:T('2026-10-25','19:59')});
  assert.equal(C.fmtDT(p.to),'24-10-2026, 08:00 PM');
});
test('Daily period: newly admitted Guest starts at the admission time',()=>{
  const p=C.dailyPeriod({cutoff:'20:00',now:T('2026-10-25','20:10'),admission:T('2026-10-25','10:30')});
  assert.equal(C.fmtDT(p.from),'25-10-2026, 10:30 AM');assert.equal(p.sinceAdmission,true);
});
test('Admission time is taken from the record, never guessed from the report date',()=>{
  assert.equal(C.fmtDT(C.admissionAt({admission_date:'2026-10-22',admission_time:'10:15'})),'22-10-2026, 10:15 AM');
  assert.equal(C.fmtDT(C.admissionAt({admission_date:'2026-10-22'})),'22-10-2026, 12:00 AM');
});
test('Weekly windows are consecutive 7-day periods from admission with no overlap',()=>{
  const w=C.weeklyWindows(T('2026-10-22','10:00'),T('2026-11-06','09:00'));
  assert.equal(w.length,3);
  assert.equal(C.fmtDT(w[0].from),'22-10-2026, 10:00 AM');assert.equal(C.fmtDT(w[0].to),'29-10-2026, 12:00 AM');
  assert.equal(w[1].from.getTime(),w[0].to.getTime());assert.equal(w[2].complete,false);
});
test('Weekly report is due after the run time on the day after the week ends; not twice',()=>{
  const adm=T('2026-10-22','10:00');
  assert.equal(C.dueWeeklyPeriods({admission:adm,now:T('2026-10-29','07:00')}).length,0);
  const due=C.dueWeeklyPeriods({admission:adm,now:T('2026-10-29','07:31')});
  assert.equal(due.length,1);assert.equal(due[0].week,1);assert.equal(due[0].final,false);
  const again=C.dueWeeklyPeriods({admission:adm,now:T('2026-10-29','08:00'),existing:[{period_from:due[0].from.toISOString(),period_to:due[0].to.toISOString()}]});
  assert.equal(again.length,0);
});
test('Discharge before 7 days: one final report from admission to the recorded discharge time',()=>{
  const adm=T('2026-10-22','10:00'),dis={at:T('2026-10-25','15:00')};
  const d=C.dueWeeklyPeriods({admission:adm,now:T('2026-10-25','16:00'),discharge:dis});
  assert.equal(d.length,1);assert.equal(d[0].final,true);assert.equal(C.fmtDT(d[0].from),'22-10-2026, 10:00 AM');assert.equal(C.fmtDT(d[0].to),'25-10-2026, 03:00 PM');
});
test('Discharge in a later week: final report covers only the unreported part',()=>{
  const adm=T('2026-10-01','09:00'),dis={at:T('2026-10-18','12:00')};
  const existing=[{period_from:T('2026-10-01','09:00').toISOString(),period_to:T('2026-10-08','00:00').toISOString()},{period_from:T('2026-10-08','00:00').toISOString(),period_to:T('2026-10-15','00:00').toISOString()}];
  const d=C.dueWeeklyPeriods({admission:adm,now:T('2026-10-18','13:00'),discharge:dis,existing});
  assert.equal(d.length,1);assert.equal(C.fmtDT(d[0].from),'15-10-2026, 12:00 AM');assert.equal(C.fmtDT(d[0].to),'18-10-2026, 12:00 PM');
});
test('No discharge report without a Completed discharge AND a recorded departure time',()=>{
  assert.equal(C.confirmedDischarge([{status:'Initiated',completed_at:'2026-10-25T10:00:00Z'}]),null);
  assert.equal(C.confirmedDischarge([{status:'Completed'}]),null);
  assert.ok(C.confirmedDischarge([{status:'Completed',actual_departure_at:'2026-10-25T10:00:00Z'}]));
});

function abx(){
  const o={id:'o1',medicine_name:'Inj. Piptaz',strength:'4.5 g',route:'IV',scheduled_times:'00:00,12:00',start_date:'2026-10-22',is_active:true};
  const m=(id,date,time,status,extra={})=>({id,order_id:'o1',scheduled_date:date,scheduled_time:time,status,...extra});
  const mar=[
    m('a','2026-10-22','12:00','Refused',{remarks:'Family requested start next day'}),
    m('b','2026-10-23','00:00','Delayed',{rescheduled_time:'01:00',reschedule_reason:'Patient sleeping'}),
    m('b2','2026-10-23','01:00','Given',{administered_at:T('2026-10-23','01:05').toISOString()}),
    m('c','2026-10-23','12:00','Delayed',{remarks:'Frequency changed'}),
    m('d','2026-10-24','00:00','Given',{administered_at:T('2026-10-24','00:10').toISOString()}),
    m('e','2026-10-24','12:00','Given',{administered_at:T('2026-10-24','13:00').toISOString()}),
    m('f','2026-10-25','00:00','Withheld',{withhold_reason:'Low blood pressure',withhold_reading:'BP 88/50'}),
    m('g','2026-10-25','12:00','Unavailable')];
  return {o,mar};
}
test('Medication reconciliation: every scheduled slot ends in exactly one outcome',()=>{
  const {o,mar}=abx();
  const r=C.reconcileMedications({orders:[o],mar,from:T('2026-10-22','10:00'),to:T('2026-10-25','20:05'),admission:T('2026-10-22','10:00')});
  const x=r.rows[0];
  assert.equal(x.scheduled,7);assert.equal(x.given,3);assert.equal(x.refused,1);assert.equal(x.withheld,1);assert.equal(x.missed,1);assert.equal(x.unresolved,1);
  assert.equal(sum(x),x.scheduled);assert.equal(r.balanced,true);
  assert.equal(x.late,2,'rescheduled dose given later and 60 min late dose are late; both still counted as given');
  assert.ok(x.exceptions.some(e=>/doctor's instruction not recorded/.test(e)));
  assert.ok(x.highRisk);
});
test('Missing documentation is unresolved, never "missed"',()=>{
  const o={id:'o2',medicine_name:'T. Pan',strength:'40 mg',scheduled_times:'07:00',start_date:'2026-10-24'};
  const r=C.reconcileMedications({orders:[o],mar:[],from:T('2026-10-24','00:00'),to:T('2026-10-25','20:00')});
  assert.equal(r.rows[0].missed,0);assert.equal(r.rows[0].unresolved,2);
});
test('Order stopped by a nurse entry (not a doctor review): no dose scheduled after the stop, stop flagged for verification',()=>{
  const o={id:'cx',medicine_name:'Inj. Clexane',strength:'60 mg',route:'SC',scheduled_times:'20:00',start_date:'2026-10-22',is_active:false,stopped_at:T('2026-10-25','18:00').toISOString(),stopped_by_review_id:'rv'};
  const mar=[{id:1,order_id:'cx',scheduled_date:'2026-10-23',scheduled_time:'20:00',status:'Given',administered_at:T('2026-10-23','20:05').toISOString()},{id:2,order_id:'cx',scheduled_date:'2026-10-24',scheduled_time:'20:00',status:'Given',administered_at:T('2026-10-24','20:02').toISOString()}];
  const reviews=[{id:'rv',not_doctor_review:true,non_doctor_note:'Inj. Clexane 60 mg not given from 25-10: not supplied by family; family reported the doctor advised 3 days only'}];
  const r=C.reconcileMedications({orders:[o],mar,reviews,from:T('2026-10-23','00:00'),to:T('2026-10-25','20:30')});
  assert.equal(r.rows[0].scheduled,2);assert.equal(r.rows[0].given,2);
  assert.equal(r.rows[0].stops[0].notDoctor,true);
  const hold=C.validateForSend({vitals:[{}],meds:r,period:{to:T('2026-10-25','20:30')}});
  assert.ok(hold.some(h=>/without a doctor's order/.test(h)));
});
test('Order versions after a doctor change are merged; doses follow each version\'s own times',()=>{
  const v1={id:'v1',medicine_name:'T. Metformin',strength:'500 mg',scheduled_times:'09:00,21:00',start_date:'2026-10-20',stopped_at:T('2026-10-22','12:00').toISOString(),is_active:false};
  const v2={id:'v2',medicine_name:'T. Metformin',strength:'500 mg',scheduled_times:'08:00,20:00',effective_from:T('2026-10-22','12:00').toISOString(),start_date:'2026-10-22'};
  const r=C.reconcileMedications({orders:[v1,v2],mar:[],from:T('2026-10-22','00:00'),to:T('2026-10-23','00:00')});
  assert.equal(r.rows.length,1);assert.equal(r.rows[0].scheduled,2,'09:00 (v1) + 20:00 (v2)');
});
test('SOS / PRN medicines are counted separately and never as scheduled doses',()=>{
  const o={id:'p',medicine_name:'T. Paracetamol',strength:'650 mg',frequency:'SOS',is_prn:true,scheduled_times:''};
  const r=C.reconcileMedications({orders:[o],mar:[{id:1,order_id:'p',status:'Given',administered_at:T('2026-10-23','14:30').toISOString()}],from:T('2026-10-23','00:00'),to:T('2026-10-24','00:00')});
  assert.equal(r.rows.length,0);assert.equal(r.sos[0].given,1);assert.equal(r.totals.scheduled,0);
});
test('Weekly / alternate-day medicines follow the ERP due-day rules',()=>{
  const w={id:'w',medicine_name:'Inj. Anfoe',scheduled_times:'09:00',frequency:'Weekly',dose_weekday:5,start_date:'2026-10-01'};
  const r=C.reconcileMedications({orders:[w],mar:[],from:T('2026-10-19','00:00'),to:T('2026-10-26','00:00')});
  assert.equal(r.rows[0].scheduled,1);
});
test('Vitals: missed scheduled checks use the alert-engine window (-90 min to +4 h)',()=>{
  const v=C.vitalsIn([{recorded_at:T('2026-10-21','05:00').toISOString(),systolic:120},{recorded_at:T('2026-10-21','15:30').toISOString(),systolic:118}],T('2026-10-21','00:00'),T('2026-10-22','12:00'));
  const miss=C.missedVitalChecks({schedule:['06:00','14:00','22:00'],vitals:v,from:T('2026-10-21','00:00'),to:T('2026-10-22','12:00')});
  assert.deepEqual(miss.map(m=>`${m.date} ${m.time}`),['2026-10-21 22:00','2026-10-22 06:00']);
});
test('Vitals: abnormal values against configurable thresholds; glucose fasting vs post-meal targets',()=>{
  const v=C.vitalsIn([{recorded_at:'2026-10-20T00:30:00Z',systolic:96,diastolic:60,pulse:64},{recorded_at:'2026-10-20T03:00:00Z',blood_sugar:136,blood_sugar_type:'FBS'},{recorded_at:'2026-10-20T06:00:00Z',blood_sugar:178,blood_sugar_type:'PPBS'}],T('2026-10-20','00:00'),T('2026-10-21','00:00'));
  const s=C.vitalStats(v);
  assert.ok(s.abnormal.some(a=>a.k==='sys'&&a.v===96));
  assert.ok(s.abnormal.some(a=>a.k==='fasting'&&a.v===136));
  assert.ok(!s.abnormal.some(a=>a.k==='post'),'178 post-meal is within the 180 limit');
  const T2=C.thresholdsFrom({}, {glucose_post_max:160});assert.ok(C.vitalBad('post',178,T2));
});
test('I/O: uncharted day is "not charted" (never zero); partial days identified; cumulative from recorded days only',()=>{
  const rows=[{io_date:'2026-10-22',direction:'Intake',ml:350},{io_date:'2026-10-22',direction:'Output',ml:845},{io_date:'2026-10-24',direction:'Intake',ml:1050},{io_date:'2026-10-24',direction:'Output',ml:1200},{io_date:'2026-10-25',direction:'Intake',ml:200},{io_date:'2026-10-25',direction:'Output',ml:994}];
  const io=C.ioDays({rows,setting:{enabled:true,started_at:T('2026-10-22','10:00').toISOString()},from:T('2026-10-22','10:00'),to:T('2026-10-25','20:05'),admission:T('2026-10-22','10:00'),now:T('2026-10-25','20:05')});
  assert.deepEqual(io.days.map(d=>d.status),['partial','missing','full','partial']);
  assert.equal(io.days[1].net,null);assert.equal(io.days[1].cumulative,null);
  assert.equal(io.totalNet,-495-150-794);
});
test('I/O: Guest not on the chart produces no I/O section',()=>{assert.equal(C.ioDays({rows:[],setting:null,from:new Date(),to:new Date()}).onChart,false)});
test('Recipient must be present and verified before automatic sending',()=>{
  const meds={rows:[],balanced:true};
  assert.ok(C.validateForSend({vitals:[{}],meds,recipient:null,period:{to:new Date()}}).some(x=>/missing/.test(x)));
  assert.ok(C.validateForSend({vitals:[{}],meds,recipient:{mobile:'9876543210',verified:false},period:{to:new Date()}}).some(x=>/not verified/.test(x)));
  assert.equal(C.validateForSend({vitals:[{}],meds,recipient:{mobile:'9876543210',verified:true},period:{to:new Date()}}).length,0);
  assert.ok(C.validateForSend({vitals:[],meds,recipient:{mobile:'9876543210',verified:true},period:{to:new Date()}}).some(x=>/No vital signs/.test(x)));
});
test('AI text is accepted only when grounded: no advice words, no numbers absent from the facts',()=>{
  const facts=JSON.stringify({bp:'132/72',date:'25-10'});
  assert.equal(C.groundedText('BP 132/72 recorded on 25-10.',facts),true);
  assert.equal(C.groundedText('BP 150/90 recorded.',facts),false);
  assert.equal(C.groundedText('The dose should be increased.',facts),false);
  assert.equal(C.groundedText('Likely sepsis.',facts),false);
});
// 2.18.146 — Inj. Piptaz pattern seen for MOG-2026-10-0012 (22–26 Oct 2026): several quick time changes,
// a parallel version, a nurse "Stop" (re-marked admission correction) and a re-entry the same morning.
test('Replaced versions do not leave phantom slots; stop followed by re-entry is "continued"; double entries flagged',()=>{
  const iso=(d,t)=>T(d,t).toISOString(), P={medicine_name:'Inj. Piptaz',strength:'4.5 g',route:'IV',frequency:'Twice Daily (BD)'};
  const v1={...P,id:'v1',scheduled_times:'21:00,09:00',created_at:iso('2026-10-22','18:19'),start_date:'2026-10-22',stopped_at:iso('2026-10-22','21:05'),is_active:false,stopped_by_review_id:'r2'};
  const v2={...P,id:'v2',scheduled_times:'22:00,10:00',effective_from:iso('2026-10-22','21:05'),stopped_at:iso('2026-10-23','10:03'),is_active:false,stopped_by_review_id:'r3'};
  const v3={...P,id:'v3',scheduled_times:'11:00,23:00',effective_from:iso('2026-10-23','10:03'),stopped_at:iso('2026-10-24','11:13'),is_active:false,stopped_by_review_id:'r5'};
  const vx={...P,id:'vx',scheduled_times:'00:00,12:00',effective_from:iso('2026-10-23','21:00'),stopped_at:iso('2026-10-24','00:01'),is_active:false,stopped_by_review_id:'r4'};
  const v4={...P,id:'v4',scheduled_times:'00:00,12:00',effective_from:iso('2026-10-24','11:13'),is_active:true};
  const reviews=['r2','r3','r4','r5'].map(id=>({id,is_admission_correction:true}));
  const g=(id,o,d,t,at,extra={})=>({id,order_id:o,scheduled_date:d,scheduled_time:t,status:'Given',administered_at:at,created_at:at,...extra});
  const mar=[
    {id:'a',order_id:'v2',scheduled_date:'2026-10-22',scheduled_time:'22:00',status:'Refused',created_at:iso('2026-10-22','22:01'),remarks:'Family Request Start on Tomorrow'},
    g('b','v2','2026-10-23','10:00',iso('2026-10-23','12:50')),
    g('c','v3','2026-10-23','11:00',iso('2026-10-23','12:58')),
    g('d','vx','2026-10-24','00:00',iso('2026-10-23','23:51')),
    g('e','v3','2026-10-24','00:00',iso('2026-10-23','23:51')),
    g('f','v4','2026-10-24','12:00',iso('2026-10-24','12:26')),
    g('h','v3','2026-10-24','11:00',iso('2026-10-24','12:28')),
    g('i','v4','2026-10-25','00:00',iso('2026-10-25','00:17')),g('j','v4','2026-10-25','12:00',iso('2026-10-25','11:59')),g('k','v4','2026-10-26','00:00',iso('2026-10-25','23:54'))];
  const r=C.reconcileMedications({orders:[v1,v2,v3,vx,v4],mar,reviews,from:T('2026-10-22','16:50'),to:T('2026-10-26','11:48'),admission:T('2026-10-22','16:50')});
  const x=r.rows[0];
  assert.equal(r.rows.length,1);
  assert.equal(x.scheduled,7,'22-10 10 PM, 23-10 11 AM, 24-10 12 AM, 24-10 12 PM, 25-10 ×2, 26-10 12 AM');
  assert.equal(x.given,6);assert.equal(x.refused,1);assert.equal(x.unresolved,0,'no phantom "22-10 9 PM unresolved"');
  assert.equal(sum(x),x.scheduled);
  assert.equal(x.stops.length,0,'not reported as stopped');
  assert.equal(x.changes.length,1);assert.match(x.changes[0].note,/continued/);assert.match(x.changes[0].note,/admission-entry correction/);
  assert.ok(x.active);assert.equal(x.times,'12:00 AM, 12:00 PM');
  assert.equal(x.duplicates.length,3,'12:50/12:58, 11:51/11:51, 12:26/12:28');
  const hold=C.validateForSend({kind:'weekly',vitals:[{}],meds:r,period:{to:T('2026-10-26','11:48')}});
  assert.ok(hold.some(h=>/double "Given"/.test(h)));assert.ok(!hold.some(h=>/stopped without/.test(h)));
});
test('A real stop with no re-entry is still reported as stopped (admission-correction source named)',()=>{
  const o={id:'s1',medicine_name:'T. X',strength:'5 mg',scheduled_times:'09:00',start_date:'2026-10-22',is_active:false,stopped_at:T('2026-10-24','10:00').toISOString(),stopped_by_review_id:'rc'};
  const r=C.reconcileMedications({orders:[o],mar:[],reviews:[{id:'rc',is_admission_correction:true}],from:T('2026-10-23','00:00'),to:T('2026-10-25','00:00')});
  assert.equal(r.rows[0].stops.length,1);assert.equal(r.rows[0].stops[0].notDoctor,true);assert.match(r.rows[0].stops[0].note,/admission-entry correction/);
});
