(function(){
 'use strict';
 const R=React,h=R.createElement;
 const time=value=>value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST':'Not recorded';
 const money=value=>'₹'+Number(value||0).toLocaleString('en-IN');
 const allowed=p=>['Admin','Manager','Nurse','Accounts'].includes(p?.role)||(p?.__dutyContext?.roles||[]).some(r=>['Admin','Manager','Nurse','Accounts'].includes(r));
 const changed=()=>window.dispatchEvent(new Event('samara-discharge-workflow-changed'));
 function useWorkspace(client,profile){
  const [data,setData]=R.useState(null),[error,setError]=R.useState('');
  const sequence=R.useRef(0);
  const load=R.useCallback(async()=>{
   const id=++sequence.current;
   if(!allowed(profile)){setData(null);return}
   const result=await client.rpc('discharge_workflow_workspace');
   if(id!==sequence.current)return;
   if(result.error){setError(result.error.message);setData(null)}else{setError('');setData(result.data)}
  },[client,profile?.id,profile?.role,JSON.stringify(profile?.__dutyContext?.roles)]);
  R.useEffect(()=>{load();const timer=setInterval(load,60000);window.addEventListener('focus',load);window.addEventListener('samara-discharge-workflow-changed',load);return()=>{sequence.current++;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('samara-discharge-workflow-changed',load)}},[load]);
  return {data,error,load};
 }
 function Banner({client,profile,onNavigate}){
  const {data}=useWorkspace(client,profile);
  if(!data)return null;
  const waiting=data.cases.filter(c=>c.status!=='Completed'&&c.accounts_status==='Cleared');
  const reviews=data.cases.flatMap(c=>c.reviews).filter(r=>r.status==='Pending');
  const overdue=waiting.filter(c=>c.overdue).length;
  const relevant=data.authority.nurse||data.authority.review||profile?.role==='Manager';
  if(!relevant||(!waiting.length&&!reviews.length))return null;
  return h('aside',{className:'message warning',role:'status',style:{margin:'12px',padding:'14px',overflowWrap:'anywhere'}},
   h('strong',null,waiting.length?`${waiting.length} patient(s): Accounts cleared — Nursing departure pending`:`${reviews.length} late departure report(s) awaiting management review`),
   overdue>0&&h('div',null,`${overdue} waiting over 2 hours — Nursing Manager / Admin attention required.`),
   waiting.length>0&&h('div',null,waiting.map(c=>c.patient_name).join(', ')),
   h('button',{className:'btn btn-secondary',type:'button',onClick:()=>onNavigate(profile?.role==='Accounts'?'Discharge Clearance':'Discharge')},'Open discharge follow-up'));
 }
 function Panel({client,profile,onChanged}){
  const {data,error,load}=useWorkspace(client,profile);
  const [selected,setSelected]=R.useState(null),[actual,setActual]=R.useState(''),[reason,setReason]=R.useState('');
  const [review,setReview]=R.useState(null),[note,setNote]=R.useState(''),[confirmed,setConfirmed]=R.useState(false);
  const [busy,setBusy]=R.useState(false),[message,setMessage]=R.useState('');
  const reviewSequence=R.useRef(0);
  R.useEffect(()=>()=>{reviewSequence.current++},[]);
  async function finish(text){setMessage(text);changed();await load();await onChanged?.()}
  async function report(e){
   e.preventDefault();if(busy||!selected)return;
   // The input is explicitly India time, independent of the operator's browser timezone.
   const date=new Date(actual+':00+05:30');
   if(!Number.isFinite(date.getTime())||date>new Date()){setMessage('Enter a valid actual departure time, not a future time.');return}
   setBusy(true);setMessage('');
   try{const result=await client.rpc('report_late_discharge_departure',{p_discharge_id:selected.id,p_actual_departure_at:date.toISOString(),p_reason:reason.trim()});
    if(result.error)throw result.error;setSelected(null);await finish('Report saved. Admin/Director must verify the departure and any charge corrections. No charge was removed and no bed was released.');
   }catch(e){setMessage(e.message||'Unable to save report. Refresh and check before retrying.')}finally{setBusy(false)}
  }
  async function inspect(r){
   const sequence=++reviewSequence.current;setBusy(true);setReview(null);setMessage('');setNote('');setConfirmed(false);
   try{const result=await client.rpc('discharge_departure_review_snapshot',{p_review_id:r.id});if(sequence!==reviewSequence.current)return;
    if(result.error)throw result.error;setReview(result.data);
   }catch(e){setMessage(e.message||'Unable to load review')}finally{if(sequence===reviewSequence.current)setBusy(false)}
  }
  async function decide(approve){
   if(busy||!review||(approve&&!confirmed))return;setBusy(true);setMessage('');
   try{const result=await client.rpc('review_late_discharge_departure',{p_review_id:review.report.id,p_approve:approve,p_note:note.trim(),p_token:review.token});
    if(result.error)throw result.error;setReview(null);await finish(approve?`Departure reviewed. ${money(result.data.correction_amount)} correction recorded. Accounts must verify the balance; Nursing must complete the final handover.`:'Report rejected with the review note. Nursing can submit a corrected report.');
   }catch(e){setMessage(e.message||'Unable to save decision. Refresh and check before retrying.');setReview(null)}finally{setBusy(false)}
  }
  if(!allowed(profile))return null;
  const field=(label,node)=>h('label',{style:{display:'grid',gap:'6px',margin:'12px 0'}},h('span',null,label),node);
  const button=(text,action,disabled=false)=>h('button',{type:'button',className:'btn btn-secondary',disabled:disabled||busy,onClick:action},text);
  return h('section',{className:'card',style:{padding:'16px',margin:'14px 0',minWidth:0,overflowWrap:'anywhere'}},
   h('h3',null,'Discharge timeline & departure follow-up'),
   h('p',null,'Earlier Accounts clearances remain in the history. A recheck applies to later financial changes.'),
   error&&h('div',{className:'message error',role:'alert'},error),
   message&&h('div',{className:'message info',role:'status'},message),
   button('Refresh timeline',load),
   !data&&!error&&h('p',null,'Loading discharge history…'),
   data?.cases.map(c=>{
    const pending=c.reviews.find(r=>r.status==='Pending'),approved=c.reviews.find(r=>r.status==='Approved');
    return h('details',{key:c.id,style:{padding:'12px 0',borderBottom:'1px solid #9995'}},
     h('summary',{style:{cursor:'pointer',fontWeight:700,padding:'8px 0'}},`${c.patient_name} · ${c.patient_code} — ${c.status==='Completed'?'Completed':c.accounts_status==='Cleared'?'Accounts cleared; Nursing departure pending':c.accounts_recheck_at||c.legacy_reset?'Accounts recheck required':'Awaiting Accounts'}`),
     c.overdue&&h('p',{className:'message warning'},'Waiting over 2 hours. Nursing Manager / Admin attention required.'),
     h('p',null,`Initiated: ${time(c.initiated_at)} · Management approved: ${time(c.management_approved_at)}`),
     c.accounts_cleared_at&&h('p',null,`Last Accounts clearance: ${time(c.accounts_cleared_at)} · ${c.accounts_cleared_by_name||'Name not recorded'}`),
     c.accounts_recheck_reason&&h('p',{className:'message warning'},'Recheck reason: '+c.accounts_recheck_reason),
     c.legacy_reset&&!c.accounts_cleared_at&&h('p',null,'Earlier clearance was reset before history tracking. Its original name/time is unavailable; it has not been reconstructed.'),
     c.actual_departure_at&&h('p',null,`Actual departure: ${time(c.actual_departure_at)} · Entry recorded: ${time(c.departure_recorded_at)}`),
     h('ol',null,c.events.map(e=>h('li',{key:e.id,style:{marginBottom:'10px'}},h('strong',null,e.event_type),` — ${time(e.occurred_at)}${e.actor_name?' · '+e.actor_name:''}`,
      e.details.cleared_at&&h('div',null,'Clearance time: '+time(e.details.cleared_at)),
      (e.details.reason||e.details.note)&&h('div',null,e.details.reason||e.details.note),
      e.details.actual_departure_at&&h('div',null,'Actual departure: '+time(e.details.actual_departure_at)),
      e.details.correction_amount!=null&&h('div',null,'Correction: '+money(e.details.correction_amount))))),
     c.reviews.map(r=>h('div',{key:r.id,className:'message info'},h('strong',null,`Late departure report — ${r.status}`),
      h('div',null,`Actual departure: ${time(r.actual_departure_at)} · Reported: ${time(r.reported_at)} by ${r.reported_name}`),
      h('div',null,r.reason),r.review_note&&h('div',null,`Review: ${r.review_note} · ${r.reviewed_name}`),
      r.status==='Pending'&&data.authority.review&&button('Review departure & charges',()=>inspect(r)))),
     approved&&c.status!=='Completed'&&h('p',null,'Reviewed departure is fixed at '+time(approved.actual_departure_at)+'. Accounts verifies the balance, then Nursing completes Final Discharge Clearance using this time.'),
     data.authority.nurse&&c.management_status==='Approved'&&c.status!=='Completed'&&!pending&&!approved&&button('Patient already left — report late departure',()=>{setSelected(c);setActual('');setReason('');setMessage('')})
    );
   }),
   selected&&h('form',{onSubmit:report,style:{border:'2px solid #b89a66',padding:'16px',marginTop:'16px'}},
    h('h4',null,'Report actual departure — '+selected.patient_name),
    h('p',null,'Use this only if the patient has already physically left. Explain the delay and how you verified departure. Management reviews billing corrections before final completion.'),
    field('Actual departure date & time (IST)',h('input',{type:'datetime-local',required:true,value:actual,onChange:e=>setActual(e.target.value)})),
    field('Late-entry reason and departure evidence',h('textarea',{required:true,minLength:10,rows:3,value:reason,onChange:e=>setReason(e.target.value)})),
    h('div',{style:{display:'flex',flexWrap:'wrap',gap:'8px'}},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Submit for management review'),button('Cancel report',()=>setSelected(null)))),
   review&&h('section',{style:{border:'2px solid #b89a66',padding:'16px',marginTop:'16px'}},
    h('h4',null,'Review late departure and billing correction'),
    h('p',null,`Reported actual departure: ${time(review.report.actual_departure_at)} · Reported by ${review.report.reported_name} at ${time(review.report.reported_at)}`),
    h('p',null,review.report.reason),
    h('strong',null,'Automatic charges after the departure date: '+money(review.amount)),
    h('ul',null,review.charges.map(c=>h('li',{key:c.id},`${c.date} · ${c.category} · ${money(c.amount)}`))),
    h('p',null,'The departure date remains billable under the existing daily-billing rule. Approval records matching reversal entries for the listed later dates and prevents further automatic accommodation charges. Original charges remain visible.'),
    review.activity_after_reported_departure.length>0&&h('div',{className:'message warning'},
     h('strong',null,'Clinical activity was recorded after the reported departure. Verify this discrepancy before approval.'),
     h('ul',null,review.activity_after_reported_departure.map((a,i)=>h('li',{key:i},`${time(a.time)} · ${a.action} · ${a.user||'Staff'}`)))),
    field('Verification / rejection reason',h('textarea',{rows:3,value:note,onChange:e=>setNote(e.target.value)})),
    field('I verified actual departure, the listed charges, and any later clinical entries.',h('input',{type:'checkbox',checked:confirmed,onChange:e=>setConfirmed(e.target.checked)})),
    h('div',{style:{display:'flex',flexWrap:'wrap',gap:'8px'}},button('Approve departure & record correction',()=>decide(true),!confirmed||note.trim().length<10),button('Reject report',()=>decide(false),note.trim().length<10),button('Close review',()=>setReview(null))))
  );
 }
 window.SamaraDischargeWorkflow={Banner,Panel};
})();
