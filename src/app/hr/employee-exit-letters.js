  // ===== 2.20.9: Employee probation / confirmation, Exit (separation) and HR Letters — Admin / Directors only =====
  // Policy (Admin, 11-11-2026): probation 3 months; notice 1 month on probation, 2 months after confirmation
  // (both sides; per-employee override for staff on an older letter). Letters get ref SAM/HR/<FY>/<nnn>, are made
  // as PDF by the hr-letters Edge Function and sent to the employee on WhatsApp automatically.
  // Database: SQL 370 (hr_exit_rpc, employee_hr_terms, employee_separations, hr_letters).
  async function hrRpc(action,p={}){
    const {data,error}=await client.rpc('hr_exit_rpc',{p_action:action,p});
    if(error)throw new Error(/function .*hr_exit_rpc/i.test(error.message||'')?'HR Exit & Letters needs SQL 370 to be run in Supabase first.':(error.message||'HR update failed.'));
    return data;
  }
  async function hrLettersCall(action,letterId){
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Your session has expired. Please sign in again.');
    const r=await fetch(`${cfg.supabaseUrl}/functions/v1/hr-letters`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action,letter_id:letterId})});
    if(action==='pdf'){const ct=r.headers.get('content-type')||'';if(ct.includes('pdf'))return await r.blob();const j=await r.json().catch(()=>({}));throw new Error(j.error||'The letter PDF could not be made.');}
    const j=await r.json().catch(()=>({}));if(!j.success)throw new Error(j.error||(r.status===404?'The hr-letters function is not deployed yet.':'The letter could not be sent.'));return j;
  }
  const hrISO=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
  const hrAddDays=(iso,n)=>{if(!iso)return '';const d=new Date(`${iso}T00:00:00`);d.setDate(d.getDate()+n);return hrISO(d);};
  const hrAddMonthsLessDay=(iso,n)=>{if(!iso)return '';const d=new Date(`${iso}T00:00:00`);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+Number(n||0));const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));if(Number(n||0)>0)d.setDate(d.getDate()-1);return hrISO(d);};
  const hrDaysBetween=(a,b)=>{if(!a||!b)return 0;return Math.round((new Date(`${b}T00:00:00`)-new Date(`${a}T00:00:00`))/86400000);};
  const hrPayBy=lwd=>{let d=lwd||todayISOIndia(),n=0;while(n<2){d=hrAddDays(d,1);if(new Date(`${d}T00:00:00`).getDay()!==0)n++;}return d;};
  const hrMoney=v=>`₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
  function hrEmployeeAddress(emp){
    if(emp?.current_address)return String(emp.current_address);
    return [emp?.current_flat_no,emp?.current_apartment_name,emp?.current_house_no,emp?.current_street_name,emp?.current_locality_area,emp?.current_village_town,emp?.current_taluk,emp?.current_district,emp?.current_pincode].filter(Boolean).join(', ');
  }
  function hrLetterBase(emp,terms){
    const doj=emp?.date_of_joining?String(emp.date_of_joining).slice(0,10):'';
    return {name:formalName(emp)||emp?.full_name||'',designation:emp?.designation||'',department:employeeDepartment(emp)||'',employee_id:emp?.employee_id||'',
      address:hrEmployeeAddress(emp),date_of_joining:doj,salary:emp?.current_salary!=null?Number(emp.current_salary):0,
      probation_months:Number(terms?.probation_months??3),probation_end:terms?.probation_end_date||hrAddMonthsLessDay(doj,Number(terms?.probation_months??3)),
      notice_probation_months:Number(terms?.notice_probation_months??1),notice_confirmed_months:Number(terms?.notice_confirmed_months??2)};
  }
  // Create the letter (reserves the reference no.) and send it on WhatsApp straight away.
  async function hrIssueLetter(emp,letterType,data,{separationId=null,letterDate='',send=true}={}){
    const made=await hrRpc('new_letter',{employee_id:emp.id,letter_type:letterType,data,separation_id:separationId,letter_date:letterDate||todayISOIndia()});
    if(!send)return {...made,sent:false};
    try{const s=await hrLettersCall('send',made.id);return {...made,sent:true,route:s.route};}
    catch(err){return {...made,sent:false,error:err.message};}
  }
  async function hrOpenLetterPdf(letterId){
    const w=window.open('','_blank');
    try{const blob=await hrLettersCall('pdf',letterId);const url=URL.createObjectURL(blob);if(w)w.location.href=url;else window.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),120000);}
    catch(err){if(w)w.close();alert(err.message||'The letter PDF could not be opened.');}
  }
  // For the Employees list / Register: exit status + probation for every employee (Admin).
  async function hrLoadStatusAll(){try{return await hrRpc('status_all');}catch(_){return null;}}
  function hrExitBadgeText(sep){
    if(!sep)return '';
    if(sep.status==='Completed')return sep.exit_type==='Resignation'?'Resigned':sep.exit_type==='Termination'?'Terminated':'Left without notice';
    if(sep.exit_type==='Resignation')return sep.status==='Notice Period'?`Notice period · last day ${formatDateIN(sep.last_working_day)}`:'Resignation received';
    if(sep.exit_type==='Termination')return 'Show cause issued';
    return 'Absent without intimation';
  }

  function EmployeeExitPanel({employee,employmentActions=[],onChanged,setLogin,toast}){
    const [info,setInfo]=React.useState(null),[err,setErr]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [step,setStep]=React.useState(null);   // inline form: {kind, ...fields}
    const emp=employee;
    async function reload(){try{setErr('');setInfo(await hrRpc('load',{employee_id:emp.id}));}catch(e){setErr(e.message);}}
    React.useEffect(()=>{setInfo(null);setStep(null);if(emp?.id)reload();},[emp?.id]);
    const say=(type,text)=>{try{toast?toast(type,text):alert(text);}catch(_){}};
    const sentText=r=>r.sent?`${r.ref_no} sent on WhatsApp.`:`${r.ref_no} saved, but WhatsApp failed: ${r.error||'unknown error'} — use Resend below.`;
    async function run(fn){if(busy)return;setBusy(true);try{await fn();await reload();onChanged&&onChanged();}catch(e){say('error',e.message||'Could not save.');}finally{setBusy(false);}}

    if(err)return h('section',{className:'employee-info-section hr-exit-section'},h('h4',null,'Probation, Exit & HR Letters'),h('div',{className:'message error'},err));
    if(!info)return h('section',{className:'employee-info-section hr-exit-section'},h('h4',null,'Probation, Exit & HR Letters'),h('div',{className:'muted'},'Loading…'));

    const terms=info.terms||{},seps=info.separations||[],letters=info.letters||[];
    const open=seps.find(s=>!['Completed','Withdrawn','Cancelled'].includes(s.status));
    const last=seps.find(s=>s.status==='Completed');
    const today=todayISOIndia();
    const doj=emp.date_of_joining?String(emp.date_of_joining).slice(0,10):'';
    const probEnd=terms.probation_end_date||hrAddMonthsLessDay(doj,terms.probation_months||3);
    const confirmed=!!terms.confirmed_on;
    const onProb=!confirmed&&(!probEnd||today<=probEnd);
    const noticeNow=terms.notice_override_months!=null?Number(terms.notice_override_months):(confirmed||!onProb?Number(terms.notice_confirmed_months??2):Number(terms.notice_probation_months??1));
    const base=()=>hrLetterBase(emp,terms);
    const suspended=(()=>{const rel=employmentActions.filter(x=>['Suspension','Reinstatement'].includes(x.action_type)&&(!x.effective_date||x.effective_date<=today)).sort((a,b)=>String(b.effective_date||'').localeCompare(String(a.effective_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));return rel[0]?.action_type==='Suspension';})();
    const active=Boolean(emp.is_active??emp.active);

    const field=(label,input,wide)=>h('label',{className:wide?'hr-exit-wide':''},label,input);
    const txt=(k,props={})=>h('input',{value:step?.[k]??'',onChange:e=>setStep(s=>({...s,[k]:e.target.value})),...props});
    const area=(k,rows=3)=>h('textarea',{rows,value:step?.[k]??'',onChange:e=>setStep(s=>({...s,[k]:e.target.value}))});
    const date=(k,req=true)=>h(StrictDateInput,{required:req,value:step?.[k]||'',onChange:e=>setStep(s=>({...s,[k]:e.target.value}))});
    const num=(k)=>h('input',{type:'number',min:'0',step:'0.01',value:step?.[k]??'',onChange:e=>setStep(s=>({...s,[k]:e.target.value}))});
    const btn=(label,onClick,cls='btn btn-secondary',extra={})=>h('button',{type:'button',className:cls,disabled:busy,onClick,...extra},label);
    const stepForm=(title,note,fields,submitLabel,onSubmit)=>h('div',{className:'hr-exit-step'},
      h('strong',null,title),note?h('div',{className:'small-note',style:{margin:'4px 0 8px'}},note):null,
      h('div',{className:'hr-exit-grid'},...fields),
      h('div',{className:'employee-actions',style:{marginTop:10}},btn('Cancel',()=>setStep(null)),btn(busy?'Working…':submitLabel,onSubmit,'btn btn-primary')));

    // ---------- actions ----------
    const appointment=()=>run(async()=>{
      if(!doj)throw new Error('Enter the Date of Joining in Edit Employee first.');
      if(!(Number(emp.current_salary)>0))throw new Error('Enter the Current Salary in Edit Employee first.');
      if(!window.confirm(`Send the Appointment Letter to ${formalName(emp)} on WhatsApp?`))return;
      const r=await hrIssueLetter(emp,'Appointment Letter',base(),{letterDate:doj<=today?today:doj});say(r.sent?'success':'error',sentText(r));
    });
    const saveTerms=()=>run(async()=>{
      await hrRpc('save_terms',{employee_id:emp.id,probation_months:step.probation_months,notice_override_months:step.notice_override_months,override_reason:step.override_reason});
      setStep(null);say('success','Probation / notice terms saved.');
    });
    const confirmEmp=()=>run(async()=>{
      if(!step.confirmed_on)throw new Error('Choose the confirmation date.');
      await hrRpc('confirm',{employee_id:emp.id,confirmed_on:step.confirmed_on});
      const r=await hrIssueLetter(emp,'Confirmation Letter',{...base(),confirmed_on:step.confirmed_on,revised_salary:Number(step.revised_salary)||0});
      setStep(null);say(r.sent?'success':'error',`Confirmed as permanent. ${sentText(r)}`);
    });
    const startResignation=()=>run(async()=>{
      if(!step.resignation_received_on)throw new Error('Enter the date the resignation was received.');
      const res=await hrRpc('start',{employee_id:emp.id,exit_type:'Resignation',resignation_received_on:step.resignation_received_on,resignation_reason:step.reason,remarks:step.remarks});
      setStep(null);say('success',`Resignation recorded. Notice ${res.separation.notice_months} month(s) → last working day ${formatDateIN(res.separation.last_working_day)}. Accept it to send the acceptance letter.`);
    });
    const acceptResignation=()=>run(async()=>{
      if(!step.last_working_day)throw new Error('Choose the last working day.');
      const sep=(await hrRpc('update',{id:open.id,status:'Notice Period',accepted_on:today,last_working_day:step.last_working_day,notice_waived:!!step.notice_waived,remarks:step.remarks})).separation;
      const r=await hrIssueLetter(emp,'Resignation Acceptance Letter',{...base(),resignation_received_on:sep.resignation_received_on,last_working_day:sep.last_working_day,notice_months:sep.notice_months,on_probation:sep.on_probation,notice_waived:sep.notice_waived},{separationId:sep.id});
      setStep(null);say(r.sent?'success':'error',`Resignation accepted. ERP login closes automatically after ${formatDateIN(sep.last_working_day)}. ${sentText(r)}`);
    });
    const changeLastDay=()=>run(async()=>{
      if(!step.last_working_day)throw new Error('Choose the last working day.');
      await hrRpc('update',{id:open.id,last_working_day:step.last_working_day,notice_waived:!!step.notice_waived,remarks:step.remarks});
      setStep(null);say('success','Last working day updated.');
    });
    const cancelCase=(status,msg)=>run(async()=>{
      if(!window.confirm(msg))return;
      await hrRpc('update',{id:open.id,status,remarks:`${status} on ${formatDateIN(today)}`});
      if(!active&&window.confirm(`${formalName(emp)}'s login is switched off. Enable it again now?`))await setLogin(emp,true);
      say('success',`Exit case marked ${status}.`);
    });
    const startShowCause=()=>run(async()=>{
      if(!String(step.allegation||'').trim())throw new Error('Write what happened (the allegation).');
      if(!step.reply_by)throw new Error('Choose the reply-by date.');
      const res=await hrRpc('start',{employee_id:emp.id,exit_type:'Termination',show_cause_issued_on:today,show_cause_reply_by:step.reply_by,show_cause_allegation:step.allegation});
      const r=await hrIssueLetter(emp,'Show Cause Notice',{...base(),allegation:step.allegation,reply_by:step.reply_by},{separationId:res.separation.id});
      setStep(null);say(r.sent?'success':'error',`Show cause notice issued. ${sentText(r)}`);
    });
    const recordReply=()=>run(async()=>{
      if(!step.reply_received_on)throw new Error('Enter the date the reply was received.');
      await hrRpc('update',{id:open.id,status:'Reply Received',reply_received_on:step.reply_received_on,reply_summary:step.reply_summary});
      setStep(null);say('success','Reply recorded. Now decide: Terminate, or Close (no action).');
    });
    const terminate=()=>run(async()=>{
      if(!String(step.termination_reason||'').trim())throw new Error('Write the reason for termination.');
      if(!step.last_working_day)throw new Error('Choose the effective date.');
      if(open.status==='Show Cause Issued'&&open.show_cause_reply_by&&today<=open.show_cause_reply_by&&!window.confirm(`The reply time (till ${formatDateIN(open.show_cause_reply_by)}) is not over yet. Terminate anyway?`))return;
      const immediate=step.last_working_day<=today;
      const sep=(await hrRpc('update',{id:open.id,status:immediate?'Completed':'Notice Period',termination_reason:step.termination_reason,last_working_day:step.last_working_day})).separation;
      const r=await hrIssueLetter(emp,'Termination Letter',{...base(),allegation:sep.show_cause_allegation,show_cause_issued_on:sep.show_cause_issued_on,reply_received_on:sep.reply_received_on,termination_reason:sep.termination_reason,last_working_day:sep.last_working_day},{separationId:sep.id});
      if(immediate&&active){await setLogin(emp,false);await hrRpc('login_closed',{id:sep.id,auth:'yes'});}
      setStep(null);say(r.sent?'success':'error',`Termination recorded${immediate?' and ERP login closed':` — login closes after ${formatDateIN(sep.last_working_day)}`}. ${sentText(r)}`);
    });
    const startAbsent=()=>run(async()=>{
      if(!step.absent_from||!step.report_by)throw new Error('Enter "absent from" and "report by" dates.');
      const res=await hrRpc('start',{employee_id:emp.id,exit_type:'Left without notice',absent_from:step.absent_from,report_by:step.report_by,remarks:step.remarks});
      const r=await hrIssueLetter(emp,'Report to Duty Notice',{...base(),absent_from:step.absent_from,report_by:step.report_by},{separationId:res.separation.id});
      if(step.block_login!==false&&active){await setLogin(emp,false);await hrRpc('login_closed',{id:res.separation.id,auth:'yes'});}
      setStep(null);say(r.sent?'success':'error',`Report-to-duty notice issued${step.block_login!==false?' and ERP login blocked':''}. ${sentText(r)}`);
    });
    const markAbandoned=()=>run(async()=>{
      if(open.report_by&&today<=open.report_by&&!window.confirm(`The report-by date (${formatDateIN(open.report_by)}) is not over yet. Mark as abandoned anyway?`))return;
      const lwd=hrAddDays(open.absent_from,-1);
      const notice=letters.find(l=>l.separation_id===open.id&&l.letter_type==='Report to Duty Notice'&&!l.voided_at);
      const sep=(await hrRpc('update',{id:open.id,status:'Completed',last_working_day:lwd})).separation;
      const r=await hrIssueLetter(emp,'Abandonment of Service Letter',{...base(),absent_from:sep.absent_from,report_by:sep.report_by,report_notice_date:notice?.letter_date||sep.created_at?.slice(0,10),last_working_day:lwd},{separationId:sep.id});
      if(active){await setLogin(emp,false);}await hrRpc('login_closed',{id:sep.id,auth:'yes'});
      say(r.sent?'success':'error',`Marked as abandonment of service. ${sentText(r)}`);
    });
    const returned=()=>cancelCase('Cancelled',`${formalName(emp)} has reported back for duty — close this case (no exit)?`);
    const completeExit=()=>run(async()=>{
      const sep=open;
      const early=sep.last_working_day&&sep.last_working_day>today;
      if(!window.confirm(`Complete the exit of ${formalName(emp)} now and switch off the ERP login?${early?`\n\nThe planned last working day was ${formatDateIN(sep.last_working_day)} — it will be changed to today (${formatDateIN(today)}).`:''}`))return;
      await hrRpc('update',{id:sep.id,status:'Completed',...(early||!sep.last_working_day?{last_working_day:today}:{})});
      if(active)await setLogin(emp,false);await hrRpc('login_closed',{id:sep.id,auth:'yes'});
      say('success','Exit completed and ERP login closed. Send the Full & Final statement and Relieving letter below.');
    });
    const fnfSep=open||last;
    const openFnf=()=>{
      const sep=fnfSep;const per=Math.round((Number(emp.current_salary)||0)/30*100)/100;
      const reqDays=Number(sep.notice_months||0)*30;
      const served=sep.exit_type==='Resignation'&&sep.resignation_received_on&&sep.last_working_day?hrDaysBetween(sep.resignation_received_on,sep.last_working_day)+1:0;
      const shortfall=sep.exit_type==='Resignation'&&!sep.notice_waived?Math.max(0,reqDays-served):(sep.exit_type==='Left without notice'?reqDays:0);
      const f=sep.fnf||{};
      setStep({kind:'fnf',days:f.days??'',per_day:f.per_day??per,leave_encashment:f.leave_encashment??'',other_earnings:f.other_earnings??'',other_earnings_note:f.other_earnings_note||'',
        shortfall_days:f.shortfall_days??shortfall,recover:f.recover||'Waive',advance_recovery:f.advance_recovery??'',other_deductions:f.other_deductions??'',other_deductions_note:f.other_deductions_note||'',
        pay_by:f.pay_by||hrPayBy(sep.last_working_day),paid_on:sep.fnf_paid_on||'',paid_mode:f.paid_mode||'',notes:f.notes||''});
    };
    const fnfCalc=s=>{const per=Number(s.per_day)||0,earned=Math.round((Number(s.days)||0)*per*100)/100,rec=s.recover==='Recover'?Math.round((Number(s.shortfall_days)||0)*per*100)/100:0;
      const net=earned+(Number(s.leave_encashment)||0)+(Number(s.other_earnings)||0)-rec-(Number(s.advance_recovery)||0)-(Number(s.other_deductions)||0);return {earned,rec,net:Math.round(net*100)/100};};
    const saveFnf=()=>run(async()=>{
      const sep=fnfSep;const c=fnfCalc(step);
      if(step.days===''||Number(step.days)<0)throw new Error('Enter the paid days in the final period.');
      const fnf={days:Number(step.days),per_day:Number(step.per_day)||0,earned_wages:c.earned,leave_encashment:Number(step.leave_encashment)||0,other_earnings:Number(step.other_earnings)||0,other_earnings_note:step.other_earnings_note,
        shortfall_days:Number(step.shortfall_days)||0,recover:step.recover,notice_recovery:c.rec,advance_recovery:Number(step.advance_recovery)||0,other_deductions:Number(step.other_deductions)||0,other_deductions_note:step.other_deductions_note,
        net:c.net,pay_by:step.pay_by,paid_mode:step.paid_mode,paid_on:step.paid_on||null,notes:step.notes};
      await hrRpc('update',{id:sep.id,fnf,fnf_paid_on:step.paid_on||'',allow_closed:'yes'});
      const r=await hrIssueLetter(emp,'Full & Final Settlement Statement',{...base(),last_working_day:sep.last_working_day,exit_type:sep.exit_type,fnf},{separationId:sep.id});
      setStep(null);say(r.sent?'success':'error',`Full & Final saved (net ${hrMoney(c.net)}). ${sentText(r)}`);
    });
    const relieving=()=>run(async()=>{
      const sep=fnfSep;
      const reason=sep.exit_type==='Resignation'?'consequent to the acceptance of resignation':'';
      const r=await hrIssueLetter(emp,'Relieving & Experience Letter',{...base(),last_working_day:sep.last_working_day,exit_reason:reason,conduct_line:step?.conduct_line||''},{separationId:sep.id});
      setStep(null);say(r.sent?'success':'error',sentText(r));
    });
    const suspend=()=>run(async()=>{
      if(!String(step.allegation||'').trim()||!step.effective_date)throw new Error('Write the reason and choose the date.');
      const {error}=await client.rpc('record_employee_employment_action',{p_employee_id:emp.id,p_action:{action_type:'Suspension',effective_date:step.effective_date,new_department:emp.department||null,new_designation:emp.designation||null,new_reporting_superior:null,new_erp_role:emp.role||null,new_salary:null,salary_frequency:emp.salary_frequency||'Monthly',increment_amount:null,increment_percent:null,order_reference:null,remarks:step.allegation}});
      if(error)throw new Error(error.message);
      const r=await hrIssueLetter(emp,'Suspension Order',{...base(),allegation:step.allegation,effective_date:step.effective_date});
      if(step.effective_date<=today&&active)await setLogin(emp,false);
      setStep(null);say(r.sent?'success':'error',`Suspension recorded${step.effective_date<=today?' and ERP login blocked':''}. ${sentText(r)}`);
    });
    const reinstate=()=>run(async()=>{
      if(!window.confirm(`Reinstate ${formalName(emp)} from today and switch the ERP login back on?`))return;
      const {error}=await client.rpc('record_employee_employment_action',{p_employee_id:emp.id,p_action:{action_type:'Reinstatement',effective_date:today,new_department:emp.department||null,new_designation:emp.designation||null,new_reporting_superior:null,new_erp_role:emp.role||null,new_salary:null,salary_frequency:emp.salary_frequency||'Monthly',increment_amount:null,increment_percent:null,order_reference:null,remarks:'Reinstated after suspension'}});
      if(error)throw new Error(error.message);
      if(!active)await setLogin(emp,true);
      say('success','Reinstated and ERP login switched on.');
    });
    const setupTemplate=()=>run(async()=>{
      if(!window.confirm('Submit the WhatsApp template "samara_hr_letter" to Meta for approval? (One time only — needed so letters reach every employee.)'))return;
      const r=await hrLettersCall('create_template','');say('success',`Template submitted to Meta (status: ${r.status||'PENDING'}). Letters still go as direct documents until it is approved.`);
    });
    const resend=l=>run(async()=>{const s=await hrLettersCall('send',l.id);say('success',`${l.ref_no} sent on WhatsApp (${s.route}).`);});
    const voidLetter=l=>run(async()=>{const why=window.prompt(`Void ${l.letter_type} ${l.ref_no}? Reason:`);if(why==null)return;await hrRpc('void_letter',{id:l.id,reason:why});say('success','Letter voided.');});

    // ---------- view ----------
    const statusChip=open?hrExitBadgeText(open):last?hrExitBadgeText(last):suspended?'Under suspension':confirmed?`Confirmed (permanent) since ${formatDateIN(terms.confirmed_on)}`:onProb?`On probation till ${formatDateIN(probEnd)}`:`Probation over on ${formatDateIN(probEnd)} — confirmation pending`;
    const chipCls=open||last||suspended?'warn':(!confirmed&&!onProb?'warn':'');
    let stepView=null;
    if(step?.kind==='terms')stepView=stepForm('Probation & notice terms','Notice is 1 month on probation and 2 months after confirmation. Use an override only for staff on an older letter (e.g. 3 months).',
      [field('Probation (months)',txt('probation_months',{type:'number',min:0,max:12})),field('Notice override (months, blank = policy)',txt('notice_override_months',{type:'number',min:0,max:6})),field('Override reason',txt('override_reason'),true)],'Save',saveTerms);
    if(step?.kind==='confirm')stepView=stepForm('Confirm as permanent employee','A Confirmation (Permanent) Letter is sent on WhatsApp. Notice period becomes 2 months.',
      [field('Confirmed with effect from *',date('confirmed_on')),field('Revised monthly salary (optional)',num('revised_salary'))],'Confirm & Send Letter',confirmEmp);
    if(step?.kind==='resign')stepView=stepForm('Resignation received',`Notice now: ${noticeNow} month(s) (${confirmed||!onProb?'confirmed':'on probation'}).`,
      [field('Resignation received on *',date('resignation_received_on')),field('Reason given (optional)',txt('reason')),field('Remarks',area('remarks',2),true)],'Record Resignation',startResignation);
    if(step?.kind==='accept'||step?.kind==='lastday'){
      const required=hrAddMonthsLessDay(open?.resignation_received_on,open?.notice_months);
      const short=step.last_working_day&&required&&step.last_working_day<required?hrDaysBetween(step.last_working_day,required):0;
      stepView=stepForm(step.kind==='accept'?'Accept resignation':'Change last working day',`As per notice (${open?.notice_months} month(s)) the last working day is ${formatDateIN(required)}.${short?` The chosen date is ${short} day(s) early.`:''}`,
        [field('Last working day *',date('last_working_day')),h('label',{className:'hr-exit-check'},h('input',{type:'checkbox',checked:!!step.notice_waived,onChange:e=>setStep(s=>({...s,notice_waived:e.target.checked}))}),' Samara waives the remaining notice'),field('Remarks',area('remarks',2),true)],
        step.kind==='accept'?'Accept & Send Letter':'Save',step.kind==='accept'?acceptResignation:changeLastDay);
    }
    if(step?.kind==='showcause')stepView=stepForm('Show cause notice (needed before any termination)','Write the facts plainly — date, shift, what happened. The employee gets the notice on WhatsApp and must reply by the date.',
      [field('What happened (allegation) *',area('allegation',4),true),field('Reply by *',date('reply_by'))],'Issue Show Cause Notice',startShowCause);
    if(step?.kind==='reply')stepView=stepForm('Record the employee\'s reply',null,[field('Reply received on *',date('reply_received_on')),field('Reply summary',area('reply_summary',3),true)],'Save Reply',recordReply);
    if(step?.kind==='terminate')stepView=stepForm('Terminate employment','A Termination Letter is sent on WhatsApp. If the date is today or earlier, the ERP login is closed now.',
      [field('Reason for termination *',area('termination_reason',3),true),field('Effective date (last working day) *',date('last_working_day'))],'Terminate & Send Letter',terminate);
    if(step?.kind==='absent')stepView=stepForm('Left without notice — notice to report for duty','A Report-to-Duty notice is sent on WhatsApp. If she does not report by the date, mark "Abandonment of service".',
      [field('Absent from *',date('absent_from')),field('Report for duty by *',date('report_by')),h('label',{className:'hr-exit-check'},h('input',{type:'checkbox',checked:step.block_login!==false,onChange:e=>setStep(s=>({...s,block_login:e.target.checked}))}),' Block ERP login now'),field('Remarks',area('remarks',2),true)],'Send Notice',startAbsent);
    if(step?.kind==='suspend')stepView=stepForm('Suspension pending enquiry','Records a Suspension in Employment History, sends the Suspension Order on WhatsApp, and blocks the ERP login from the date. Pay subsistence allowance as per law in Payroll.',
      [field('Reason / allegation *',area('allegation',3),true),field('Suspended from *',date('effective_date'))],'Suspend & Send Order',suspend);
    if(step?.kind==='relieve')stepView=stepForm('Relieving & Experience Letter',null,
      [field('Conduct line (optional)',h('select',{value:step.conduct_line||'',onChange:e=>setStep(s=>({...s,conduct_line:e.target.value}))},['','satisfactory','good','very good'].map(v=>h('option',{key:v,value:v},v||'— leave out —'))))],'Send Letter',relieving);
    if(step?.kind==='fnf'){
      const c=fnfCalc(step);
      stepView=stepForm('Full & Final settlement',`Per-day rate = monthly salary ÷ 30. Final wages must be paid within 2 working days of the last working day (Code on Wages, s.17(2)). Recovering a notice shortfall from wages is legally debatable — "Waive" is the safe default; recover only if the appointment letter allows it and you are sure.`,
        [field('Paid days in final period *',num('days')),field('Per-day rate (₹)',num('per_day')),field('Leave encashment (₹)',num('leave_encashment')),field('Other earnings (₹)',num('other_earnings')),field('Other earnings note',txt('other_earnings_note')),
         field('Notice shortfall (days)',num('shortfall_days')),field('Notice shortfall',h('select',{value:step.recover,onChange:e=>setStep(s=>({...s,recover:e.target.value}))},['Waive','Recover'].map(v=>h('option',{key:v},v)))),
         field('Salary advance to recover (₹)',num('advance_recovery')),field('Other deductions (₹)',num('other_deductions')),field('Other deductions note',txt('other_deductions_note')),
         field('Pay by',date('pay_by',false)),field('Paid on (if already paid)',date('paid_on',false)),field('Paid by',h('select',{value:step.paid_mode||'',onChange:e=>setStep(s=>({...s,paid_mode:e.target.value}))},['','Cash','Bank Transfer','UPI / GPay','Cheque'].map(v=>h('option',{key:v,value:v},v||'—')))),field('Notes',area('notes',2),true),
         h('div',{className:'hr-exit-wide hr-exit-total'},`Wages ${hrMoney(c.earned)}${c.rec?` − notice recovery ${hrMoney(c.rec)}`:''} → Net ${c.net>=0?'payable':'recoverable'}: `,h('strong',null,hrMoney(Math.abs(c.net))))],'Save & Send Statement',saveFnf);
    }

    const exitButtons=open?(
      open.exit_type==='Resignation'?[
        open.status==='Open'?btn('Accept Resignation',()=>setStep({kind:'accept',last_working_day:open.last_working_day}),'btn btn-primary'):btn('Change Last Working Day',()=>setStep({kind:'lastday',last_working_day:open.last_working_day,notice_waived:open.notice_waived})),
        btn('Resignation Withdrawn',()=>cancelCase('Withdrawn',`Mark ${formalName(emp)}'s resignation as withdrawn (she continues in service)?`)),
        btn('Full & Final',openFnf),btn('Complete Exit Now',completeExit,'btn btn-danger')]
      :open.exit_type==='Termination'?[
        open.status==='Show Cause Issued'?btn('Record Reply',()=>setStep({kind:'reply',reply_received_on:today})):null,
        open.last_working_day?null:btn('Terminate',()=>setStep({kind:'terminate',last_working_day:today}),'btn btn-danger'),
        open.last_working_day?btn('Full & Final',openFnf):null,
        open.last_working_day?btn('Complete Exit Now',completeExit,'btn btn-danger'):btn('Close — No Action',()=>cancelCase('Cancelled','Close this show-cause case with no further action?'))]
      :[btn('Employee Reported Back',returned),btn('Mark Abandonment of Service',markAbandoned,'btn btn-danger')]
    ).filter(Boolean):[
      btn('Resignation Received',()=>setStep({kind:'resign',resignation_received_on:today}),'btn btn-secondary'),
      btn('Show Cause / Termination',()=>setStep({kind:'showcause',reply_by:hrAddDays(today,3)})),
      btn('Left Without Notice',()=>setStep({kind:'absent',absent_from:today,report_by:hrAddDays(today,3),block_login:true})),
      suspended?btn('Reinstate',reinstate,'btn btn-primary'):btn('Suspend',()=>setStep({kind:'suspend',effective_date:today})),
      last&&last.last_working_day?btn('Full & Final',openFnf):null,
      last&&last.last_working_day?btn('Relieving & Experience Letter',()=>setStep({kind:'relieve',conduct_line:last.exit_type==='Resignation'?'satisfactory':''})):null
    ].filter(Boolean);
    if(open&&open.last_working_day&&open.exit_type!=='Left without notice')exitButtons.push(btn('Relieving & Experience Letter',()=>setStep({kind:'relieve',conduct_line:open.exit_type==='Resignation'?'satisfactory':''})));

    return h('section',{className:'employee-info-section hr-exit-section'},
      h('div',{style:{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}},
        h('div',null,h('h4',{style:{marginBottom:4,color:'#7c1745'}},'Probation, Exit & HR Letters'),h('div',{className:'muted'},'Letters are sent to the employee on WhatsApp automatically.')),
        h('span',{className:`badge ${chipCls}`},statusChip)),
      h('div',{className:'employee-info-grid',style:{marginTop:12}},
        h('div',{className:'employee-info-item'},h('span',null,'Probation'),h('strong',null,`${terms.probation_months??3} months · ends ${formatDateIN(probEnd)||'—'}`)),
        h('div',{className:'employee-info-item'},h('span',null,'Confirmed (permanent)'),h('strong',null,confirmed?formatDateIN(terms.confirmed_on):'Not yet')),
        h('div',{className:'employee-info-item'},h('span',null,'Notice period now'),h('strong',null,`${noticeNow} month${noticeNow===1?'':'s'}${terms.notice_override_months!=null?' (override)':''}`))),
      h('div',{className:'employee-actions hr-exit-actions',style:{marginTop:12}},
        btn('Appointment Letter',appointment),
        confirmed?null:btn('Confirm as Permanent',()=>setStep({kind:'confirm',confirmed_on:probEnd&&probEnd<today?hrAddDays(probEnd,1):today}),'btn btn-primary'),
        btn('Probation / Notice Terms',()=>setStep({kind:'terms',probation_months:terms.probation_months??3,notice_override_months:terms.notice_override_months??'',override_reason:terms.override_reason||''})),
        letters.some(l=>/template/i.test(l.send_route||''))?null:btn('Set up WhatsApp template (one time)',setupTemplate,'btn btn-secondary hr-template-setup')),
      h('div',{className:'hr-exit-exitbox'},
        h('strong',null,open?`Exit in progress — ${open.exit_type}`:'Exit / Discipline'),
        open?h('div',{className:'small-note'},[
          open.resignation_received_on?`Resignation received ${formatDateIN(open.resignation_received_on)}`:'',
          open.accepted_on?`accepted ${formatDateIN(open.accepted_on)}`:'',
          open.show_cause_issued_on?`Show cause ${formatDateIN(open.show_cause_issued_on)}, reply by ${formatDateIN(open.show_cause_reply_by)}`:'',
          open.reply_received_on?`reply received ${formatDateIN(open.reply_received_on)}`:'',
          open.absent_from?`Absent from ${formatDateIN(open.absent_from)}, report by ${formatDateIN(open.report_by)}`:'',
          open.last_working_day?`Last working day ${formatDateIN(open.last_working_day)}`:'',
          open.notice_months!=null&&open.exit_type==='Resignation'?`notice ${open.notice_months} month(s)${open.notice_waived?' (waived)':''}`:''
        ].filter(Boolean).join(' · ')):(last?h('div',{className:'small-note'},`${hrExitBadgeText(last)} — last working day ${formatDateIN(last.last_working_day)||'—'}${last.fnf_paid_on?` · F&F paid ${formatDateIN(last.fnf_paid_on)}`:''}`):null),
        h('div',{className:'employee-actions',style:{marginTop:8}},...exitButtons)),
      stepView,
      h('div',{className:'hr-letters-list'},
        h('strong',null,`HR Letters issued (${letters.filter(l=>!l.voided_at).length})`),
        letters.length?h('div',{className:'table-wrap'},h('table',{className:'table hr-letters-table'},
          h('thead',null,h('tr',null,['Date','Letter','Ref No.','WhatsApp','Actions'].map(c=>h('th',{key:c},c)))),
          h('tbody',null,letters.map(l=>h('tr',{key:l.id,className:l.voided_at?'employee-disabled':''},
            h('td',{'data-label':'Date'},formatDateIN(l.letter_date)),
            h('td',{'data-label':'Letter'},l.letter_type,l.voided_at?h('span',{className:'badge off',style:{marginLeft:6}},'Voided'):null),
            h('td',{'data-label':'Ref No.'},l.ref_no),
            h('td',{'data-label':'WhatsApp'},l.sent_at?h('span',{className:'badge'},`Sent ${formatDateIN(l.sent_at)}`):h('span',{className:'badge warn',title:l.send_error||''},l.send_error?'Failed':'Not sent')),
            h('td',{'data-label':'Actions'},l.voided_at?null:h('div',{className:'employee-actions'},
              btn('View PDF',()=>hrOpenLetterPdf(l.id)),
              btn(l.sent_at?'Resend':'Send',()=>resend(l),'btn btn-whatsapp'),
              btn('Void',()=>voidLetter(l)))))))))
        :h('div',{className:'muted'},'No letters issued yet.'))
    );
  }
