  // 2.14.77: food vendor WhatsApp reply alerts (Returned / Needs Modification / No reply after 30 min). See SQL 156.
  function foodVendorAlertText(a){
    const day=/^\d{4}-\d{2}-\d{2}$/.test(a?.order_date||'')?a.order_date.split('-').reverse().join('-'):(a?.order_date||'');
    const meal=`${a?.meal||'Meal'} ${day}${a?.delivery?`, delivery ${a.delivery}`:''}`;
    if(a?.alert_type==='Returned')return {title:'Vendor RETURNED the food order',detail:`${a.vendor_name||'The vendor'} returned ${a.order_ref} (${meal}). The food will not come from this vendor. Arrange other food now, then mark it handled.`,tone:'#c63d3d',label:'Returned'};
    if(a?.alert_type==='Modification Requested')return {title:'Vendor asks to change the food order',detail:`${a.vendor_name||'The vendor'} tapped "Needs Modification" for ${a.order_ref} (${meal}). Read their WhatsApp message, then send a revised order or call them.`,tone:'#c77700',label:'Needs Modification'};
    return {title:'No reply from the food vendor',detail:`No reply for ${a?.order_ref} (${meal}) ${a?.minutes||30} minutes after the order was sent. Please call the vendor to confirm.`,tone:'#7a5b00',label:'No reply'};
  }
  function openFoodVendorMessage(a,onNavigate){
    const target={tab:'Messages',message_id:a?.message_id||'',order_date:a?.order_date||'',at:Date.now()};
    try{sessionStorage.setItem('samara_food_view','Food Vendor Management');sessionStorage.setItem('samara_food_vendor_target',JSON.stringify(target));}catch(_error){}
    if(typeof onNavigate==='function')onNavigate('Food & Diet');
    setTimeout(()=>window.dispatchEvent(new CustomEvent('samara-food-vendor-target',{detail:target})),0);
  }
  async function markFoodVendorAlertHandled(a){
    const note=window.prompt('What was done? (for example: called vendor, arranged other food, sent revised order)','');
    if(note===null)return false;
    if(!String(note).trim()){showSamaraActionToast('error','Note required','Enter what was done before marking it handled.');return false;}
    const {error}=await client.rpc('fv_mark_vendor_reply_handled',{p_message_id:a.message_id,p_note:String(note).trim()});
    if(error){showSamaraActionToast('error','Could not mark handled',error.message);return false;}
    showSamaraActionToast('success','Marked handled',`${a.order_ref}: ${String(note).trim()}`);
    return true;
  }

  // 2.15.53: Bills & Charges still Pending with Accounts after 30 minutes -> Admin / Director (SQL 188).
  function openOverdueCharge(a,onNavigate){
    const target={type:'charge-request',request_id:a?.request_id,patient_id:a?.patient_id,at:Date.now()};
    try{sessionStorage.setItem('samara-workflow-target',JSON.stringify(target))}catch(_error){}
    if(typeof onNavigate==='function')onNavigate('Charge Approvals');
    setTimeout(()=>window.dispatchEvent(new CustomEvent('samara-workflow-target',{detail:target})),0);
  }
  function overdueChargeMinutes(m){const n=Number(m||0);return n>=60?`${Math.floor(n/60)} h ${n%60} min`:`${n} min`}
  // 2.15.89: indent handed over but the nurse has not pressed Received within 20 minutes -> that nurse + Nursing Manager (SQL 205).
  function indentReceiptLabel(a){return `${a?.indent_ref||'Indent'} · ${a?.item_name||'Item'}`}
  // 2.15.90: staff back on duty after approved leave (SQL 206) -> opens that leave on the Staff Leave Calendar.
  function staffReturnLabel(a){return `${a?.employee_name||'Staff'} · ${a?.alert==='Not back'?'not back on duty':'back on duty'}`}
  function openStaffReturn(a){openRecord('Staff Leave Calendar',{id:a?.leave_id,date:a?.due_date,label:staffReturnLabel(a)})}
  function staffReturnLine(a){
    if(a?.alert==='Not back')return `${a.employee_name||'Staff'} — leave ended ${formatDateIN(a.leave_to)}, due back ${formatDateIN(a.due_date)}${a.due_shift?` (${a.due_shift})`:''}, not marked back on duty`;
    return `${a?.employee_name||'Staff'} — back on duty ${a?.returned_at?fmt(a.returned_at):formatDateIN(a?.returned_date)}${a?.late_days>0?` (${a.late_days} day${a.late_days===1?'':'s'} late)`:''}${a?.recorded_by_name?` · marked by ${a.recorded_by_name}`:''}`;
  }
  function openIndentReceipt(a){openRecord('Patient Consumables',{id:a?.indent_id,patient_id:a?.patient_id,label:indentReceiptLabel(a)})}

  function ClinicalAlertBell({engine,onOpen}){
    const [preview,setPreview]=React.useState(false);
    const rows=(engine?.alerts||[]).slice().sort((a,b)=>{
      const rank={Critical:3,Urgent:2,Routine:1};
      return (rank[b.priority]||0)-(rank[a.priority]||0)||Number(b.overdue_minutes||0)-Number(a.overdue_minutes||0);
    });
    if(!rows.length)return null;
    const escalationMinutes=Number(engine?.settings?.manager_escalation_minutes||30);
    const escalated=rows.filter(a=>Number(a.overdue_minutes||0)>=escalationMinutes).length;
    const openFull=()=>{
      setPreview(false);
      try{sessionStorage.setItem('samaraClinicalAlertFilter',escalated>0?'Escalated':'All')}catch(_){}
      onOpen('Clinical Alerts');
    };
    return h('div',{className:'topbar-alert-centre',onMouseEnter:()=>setPreview(true),onMouseLeave:()=>setPreview(false)},
      h('button',{type:'button',className:'topbar-clinical-alert-badge',onClick:openFull,'aria-label':`${rows.length} unresolved clinical alerts. Tap to open escalated alerts.`,'aria-expanded':preview?'true':'false'},`🔔 ${rows.length}`),
      preview&&h('div',{className:'topbar-alert-preview',onClick:e=>e.stopPropagation()},
        h('div',{className:'topbar-alert-preview-head'},
          h('div',null,h('strong',null,'Clinical Alerts'),h('small',null,escalated?`${escalated} escalated · ${rows.length} total unresolved`:`${rows.length} unresolved · none escalated yet`)),
          h('button',{type:'button',className:'topbar-alert-open-all',onClick:openFull},'Open all')
        ),
        h('div',{className:'topbar-alert-preview-list'},rows.slice(0,5).map(a=>h('button',{type:'button',className:`topbar-alert-preview-item ${String(a.priority||'Routine').toLowerCase()}`,key:a.key||`${a.alert_type}-${a.source_id}`,onClick:openFull},
          h('span',{className:'alert-preview-priority'},a.priority||'Routine'),
          h('strong',null,a.patient_name||'Patient'),
          h('span',null,[a.room_label,a.title].filter(Boolean).join(' · ')),
          h('small',null,Number(a.overdue_minutes||0)>0?englishOverdueLabel(a.overdue_minutes):'Due now')
        ))),
        rows.length>5&&h('div',{className:'topbar-alert-more'},`+ ${rows.length-5} more alerts — click the bell for the complete list`)
      )
    );
  }

  function Notifications({profile,onNavigate,engine}){
    const [storeRequests,setStoreRequests]=React.useState([]),[patientsById,setPatientsById]=React.useState({}),[loading,setLoading]=React.useState(false),[message,setMessage]=React.useState('');
    const foodAccess=!!profile?.__foodVendor?.read;
    const cutoffAdmin=['admin','administrator','director'].includes(String(profile?.role||'').trim().toLowerCase());
    const [cutoffAttempts,setCutoffAttempts]=React.useState([]);
    async function loadCutoffAttempts(){if(!cutoffAdmin)return;const {data,error}=await client.from('fv_cutoff_attempts').select('id,actor_name,actor_role,operation,supply_date,meal_slot,deadline,attempted_at').order('attempted_at',{ascending:false}).limit(100);if(error)throw error;setCutoffAttempts(data||[])}
    const nursingManager=profile?.role==='Manager'&&(isNursingManagerProfile(profile)||employeeDepartment(profile)==='Nursing');
    const [foodReceiptDue,setFoodReceiptDue]=React.useState([]);
    const [foodReplyAlerts,setFoodReplyAlerts]=React.useState([]);
    const [overdueCharges,setOverdueCharges]=React.useState([]);
    // 2.15.89: indents handed over but not received by the nurse within 20 minutes (SQL 205).
    const roleKey=String(profile?.role||'').trim().toLowerCase();
    const indentReceiptAccess=roleKey==='nurse'||cutoffAdmin||isNursingManagerProfile(profile)||nursingManager;
    const [indentReceiptDue,setIndentReceiptDue]=React.useState([]);
    const staffReturnAccess=cutoffAdmin||roleKey==='manager';
    const [staffReturnAlerts,setStaffReturnAlerts]=React.useState([]);
    async function loadStaffReturnAlerts(){
      if(!staffReturnAccess)return;
      try{const {data,error}=await client.rpc('staff_return_alerts');if(error)throw error;setStaffReturnAlerts(Array.isArray(data)?data:[]);}
      catch(_error){/* Needs SQL 206; until then this section simply stays empty. */}
    }
    async function loadIndentReceiptDue(){
      if(!indentReceiptAccess)return;
      try{const {data,error}=await client.rpc('indent_receipt_overdue_alerts');if(error)throw error;setIndentReceiptDue(Array.isArray(data)?data:[]);}
      catch(_error){/* Needs SQL 205; until then this section simply stays empty. */}
    }
    // 2.15.67: Enquiry Register reminders (SQL 196) — new enquiry / follow-up due for the assigned person; Admin: untouched 24 h.
    const enquiryAccess=['Admin','Manager','STD'].some(r=>hasDutyRole(profile,r));
    const [enquiryAlerts,setEnquiryAlerts]=React.useState([]);
    async function loadEnquiryAlerts(){
      if(!enquiryAccess)return;
      try{const {data,error}=await client.rpc('enquiry_alerts');if(error)throw error;setEnquiryAlerts(Array.isArray(data)?data:[]);}
      catch(_error){/* Needs SQL 196; until then this section simply stays empty. */}
    }
    async function loadOverdueCharges(){
      if(!cutoffAdmin)return;
      try{const {data,error}=await client.rpc('bill_charge_overdue_alerts');if(error)throw error;setOverdueCharges(Array.isArray(data)?data:[]);}
      catch(_error){/* Needs SQL 188; until then this section simply stays empty. */}
    }
    async function loadFoodReplyAlerts(){
      if(!foodAccess)return;
      try{const {data,error}=await client.rpc('fv_vendor_reply_alerts');if(error)throw error;setFoodReplyAlerts(Array.isArray(data)?data:[]);}
      catch(_error){/* Needs SQL 156; until then this section simply stays empty. */}
    }
    async function loadFoodReceiptDue(){
      if(!foodAccess)return;
      try{
        const now=Date.now(),core=window.SamaraFoodCore;
        const from=new Date(now-2*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),to=new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
        const {data,error}=await client.rpc('fv_rpc',{action:'load',p:{from,to}});
        if(error)throw error;
        const due=(data?.orders||[]).filter(o=>['Ordered','Partial'].includes(o.status)).map(o=>({order:o,deadline:core?.receiptDeadline?.(o.data,now)})).filter(x=>x.deadline?.due);
        setFoodReceiptDue(due);
      }catch(_error){/* Secondary nudge only; a failed refresh should not disrupt the rest of Notifications. */}
    }
    async function loadNotifications(){
      setLoading(true);setMessage('');
      try{
        const [indentResult,patientResult]=await Promise.all([
          nursingManager?client.from('patient_consumable_indents').select('*').in('status',['Initiated','Approved','Partially Approved','Handed Over','Receipt Discrepancy']).order('created_at',{ascending:false}).limit(200):Promise.resolve({data:[],error:null}),
          nursingManager?client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no').limit(500):Promise.resolve({data:[],error:null})
        ]);
        if(indentResult.error)throw indentResult.error;
        const map={};(patientResult.data||[]).forEach(p=>{map[p.id]=p});
        setPatientsById(map);setStoreRequests(indentResult.data||[]);
        await loadCutoffAttempts();
        await loadOverdueCharges();
        await loadIndentReceiptDue();
        await loadStaffReturnAlerts();
        await loadEnquiryAlerts();
        if(typeof engine?.refresh==='function')await engine.refresh();
      }catch(error){setMessage(error.message||'Unable to refresh notifications.');}
      finally{setLoading(false);}
    }
    React.useEffect(()=>{
      loadNotifications();
      const channel=nursingManager?client.channel('nursing-notifications-live').on('postgres_changes',{event:'*',schema:'public',table:'patient_consumable_indents'},loadNotifications).subscribe():null;
      return()=>{if(channel)client.removeChannel(channel)};
    },[profile?.id,nursingManager]);
    React.useEffect(()=>{if(!cutoffAdmin)return;const refresh=()=>loadCutoffAttempts().catch(error=>setMessage(error.message||'Unable to load food cutoff attempts.'));const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[profile?.id,cutoffAdmin]);
    React.useEffect(()=>{if(!enquiryAccess)return;loadEnquiryAlerts();const timer=setInterval(loadEnquiryAlerts,60000);window.addEventListener('focus',loadEnquiryAlerts);return()=>{clearInterval(timer);window.removeEventListener('focus',loadEnquiryAlerts)}},[profile?.id,enquiryAccess]);
    React.useEffect(()=>{if(!staffReturnAccess)return;loadStaffReturnAlerts();const timer=setInterval(loadStaffReturnAlerts,60000);window.addEventListener('focus',loadStaffReturnAlerts);return()=>{clearInterval(timer);window.removeEventListener('focus',loadStaffReturnAlerts)}},[profile?.id,staffReturnAccess]);
    React.useEffect(()=>{if(!indentReceiptAccess)return;loadIndentReceiptDue();const timer=setInterval(loadIndentReceiptDue,60000);window.addEventListener('focus',loadIndentReceiptDue);return()=>{clearInterval(timer);window.removeEventListener('focus',loadIndentReceiptDue)}},[profile?.id,indentReceiptAccess]);
    React.useEffect(()=>{if(!cutoffAdmin)return;loadOverdueCharges();const timer=setInterval(loadOverdueCharges,60000);window.addEventListener('focus',loadOverdueCharges);return()=>{clearInterval(timer);window.removeEventListener('focus',loadOverdueCharges)}},[profile?.id,cutoffAdmin]);
    React.useEffect(()=>{if(!foodAccess)return;loadFoodReplyAlerts();const timer=setInterval(loadFoodReplyAlerts,30000);window.addEventListener('focus',loadFoodReplyAlerts);return()=>{clearInterval(timer);window.removeEventListener('focus',loadFoodReplyAlerts)}},[profile?.id,foodAccess]);
    React.useEffect(()=>{if(!foodAccess)return;loadFoodReceiptDue();const timer=setInterval(loadFoodReceiptDue,60000);window.addEventListener('focus',loadFoodReceiptDue);return()=>{clearInterval(timer);window.removeEventListener('focus',loadFoodReceiptDue)}},[profile?.id,foodAccess]);
    const overdueClinical=(engine?.alerts||[]).filter(a=>{
      if(Number(a.overdue_minutes||0)<30)return false;
      return /medic|medicine|care/.test(`${a.alert_type||''} ${a.title||''} ${a.description||''}`.toLowerCase());
    }).sort((a,b)=>Number(b.overdue_minutes||0)-Number(a.overdue_minutes||0));
    const medicineAlerts=overdueClinical.filter(a=>/medic|medicine/.test(`${a.alert_type||''} ${a.title||''}`.toLowerCase()));
    const careAlerts=overdueClinical.filter(a=>!medicineAlerts.includes(a));
    const awaitingApproval=storeRequests.filter(r=>r.status==='Initiated'),awaitingHandover=storeRequests.filter(r=>['Approved','Partially Approved'].includes(r.status)),discrepancies=storeRequests.filter(r=>r.status==='Receipt Discrepancy');
    const navigate=page=>{if(typeof onNavigate==='function')onNavigate(page)};
    const metric=(label,value,page,tone)=>h('button',{type:'button',className:'card',onClick:()=>navigate(page),style:{padding:'17px',textAlign:'left',cursor:'pointer',border:`1px solid ${tone||'#ead0de'}`,background:'#fff'}},h('small',null,label),h('strong',{style:{display:'block',fontSize:'28px',color:'#a40855',marginTop:'6px'}},value),h('span',{style:{fontSize:'12px',color:'#725d68'}},'Tap to open'));
    const patientName=row=>{const p=patientsById[row.patient_id];return p?[p.title,p.full_name].filter(Boolean).join(' '):(row.patient_name||'Patient')};
    return h('div',{className:'card panel'},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,'Notifications'),h('small',null,nursingManager?'Pharmacy & Stores requests and 30-minute nursing escalations.':cutoffAdmin?'Bills & Charges not attended by Accounts, food cutoff attempts and clinical items requiring attention.':'Clinical items requiring attention.')),h('button',{type:'button',className:'btn btn-primary',disabled:loading,onClick:loadNotifications},loading?'Refreshing…':'↻ Refresh')),
      message?h('div',{className:'message error'},message):null,
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:'12px',marginBottom:'18px'}},nursingManager?metric('Store Requests',awaitingApproval.length,'Patient Consumables'):null,nursingManager?metric('Awaiting Handover',awaitingHandover.length,'Patient Consumables'):null,metric('Medication > 30 min',medicineAlerts.length,'Clinical Escalations','#efb6b6'),metric('Care > 30 min',careAlerts.length,'Clinical Escalations','#efcf9c'),nursingManager?metric('Store Discrepancies',discrepancies.length,'Patient Consumables','#efb6b6'):null),
      nursingManager?h('section',{style:{marginBottom:'20px'}},h('h4',null,'Pharmacy & Stores Requests'),h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Patient','Item','Quantity','Status','Requested'].map(x=>h('th',{key:x},x)))),h('tbody',null,storeRequests.map(r=>h('tr',{key:r.id,role:'button',tabIndex:0,onClick:()=>navigate('Patient Consumables'),style:{cursor:'pointer',touchAction:'manipulation'}},h('td',null,patientName(r)),h('td',null,r.item_name||'Consumable'),h('td',null,`${r.requested_qty||'—'} ${r.unit||''}`),h('td',null,h('span',{className:'badge'},r.status)),h('td',null,fmt(r.created_at)))),storeRequests.length===0?h('tr',null,h('td',{colSpan:5,className:'empty'},'No open Pharmacy & Stores requests.')):null)))):null,
      staffReturnAccess?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Staff Back on Duty after Leave'),h('small',null,cutoffAdmin?'Not back = leave has ended but no Manager has marked her back on duty 2 hours after her rostered shift started (10 AM if no roster). Back on duty = marked in the last 24 hours. Tap a row to open that leave.':'Staff of your department whose leave has ended but who are not marked back on duty. Tap a row, then Mark Back on Duty once she reports.'),
        h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Status','Staff','Leave','Due back','Back on duty','Marked by'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,staffReturnAlerts.map(a=>h('tr',{key:`${a.alert}-${a.leave_id}`,role:'button',tabIndex:0,onClick:()=>openStaffReturn(a),onKeyDown:e=>{if(e.key==='Enter')openStaffReturn(a)},style:{cursor:'pointer',touchAction:'manipulation'}},
            h('td',null,h('span',{className:'badge',style:a.alert==='Not back'?{background:'#ffe5e7',color:'#b2192d'}:{background:'#e7f6ef',color:'#17603a'}},a.alert==='Not back'?'Not back':'Back on duty')),
            h('td',null,a.employee_name||'Staff'),h('td',null,`${formatDateIN(a.leave_from)} – ${formatDateIN(a.leave_to)}`),h('td',null,`${formatDateIN(a.due_date)}${a.due_shift?` · ${a.due_shift}`:''}`),
            h('td',null,a.alert==='Not back'?'—':`${a.returned_at?fmt(a.returned_at):formatDateIN(a.returned_date)}${a.late_days>0?` · ${a.late_days} day${a.late_days===1?'':'s'} late`:''}`),h('td',null,a.recorded_by_name||'—'))),
            staffReturnAlerts.length===0?h('tr',null,h('td',{colSpan:6,className:'empty'},'No staff returns to report.')):null)))):null,
      indentReceiptAccess?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Indents Handed Over — Not Received by Nurse (over 20 minutes)'),h('small',null,roleKey==='nurse'?'Items the store handed over to you, but you have not pressed Received yet. Tap a row, check the items and press Received.':'Store handed these over, but the nurse who raised the indent has not pressed Received within 20 minutes. India time. Tap a row to open that indent.'),
        h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Indent','Guest','Room','Item','Qty','Nurse','Handed over','Waiting'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,indentReceiptDue.map(a=>h('tr',{key:a.indent_id,role:'button',tabIndex:0,onClick:()=>openIndentReceipt(a),onKeyDown:e=>{if(e.key==='Enter')openIndentReceipt(a)},style:{cursor:'pointer',touchAction:'manipulation'}},
            h('td',null,a.indent_ref||'—'),h('td',null,a.guest_name||'Guest'),h('td',null,a.room_label||'—'),h('td',null,a.item_name||'—'),h('td',null,`${a.quantity??'—'} ${a.unit||''}`),h('td',null,a.nurse_name||'—'),h('td',null,`${fmt(a.handed_over_at)}${a.handed_over_by_name?` · ${a.handed_over_by_name}`:''}`),h('td',null,h('span',{className:'badge',style:{background:'#ffe5e7',color:'#b2192d'}},overdueChargeMinutes(a.minutes))))),
            indentReceiptDue.length===0?h('tr',null,h('td',{colSpan:8,className:'empty'},'Every handed-over indent has been received within 20 minutes.')):null)))):null,
      enquiryAccess?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Enquiries — Follow-up Needed'),h('small',null,'New enquiries and follow-ups due for you; Admin also sees New enquiries untouched for 24 hours. Tap a row to open that enquiry.'),
        h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Alert','Enquiry','Guest','Contact','Source','When'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,enquiryAlerts.map((a,i)=>h('tr',{key:a.alert+a.id+i,role:'button',tabIndex:0,style:{cursor:'pointer',touchAction:'manipulation'},onClick:()=>{try{sessionStorage.setItem('samara-open-enquiry-id',a.id)}catch(_){}navigate('Enquiry Register');setTimeout(()=>window.dispatchEvent(new CustomEvent('samara-open-enquiry',{detail:{id:a.id}})),0)}},
            h('td',null,h('span',{className:'badge',style:/Untouched|Not assigned/.test(a.alert)?{background:'#ffe5e7',color:'#b2192d'}:/Follow-up/.test(a.alert)?{background:'#fff4d6',color:'#7a5600'}:{background:'#fde7f1',color:'#a40855'}},a.alert)),
            h('td',null,a.enquiry_no||'—'),h('td',null,a.guest||'—'),h('td',null,`${a.contact||'—'} · ${a.phone||''}`),h('td',null,a.source||'Website'),
            h('td',null,a.due?`Due ${formatDateIN(a.due)}`:`${fmt(a.at)}${a.assigned_name?` · ${a.assigned_name}`:''}`))),
            enquiryAlerts.length===0?h('tr',null,h('td',{colSpan:6,className:'empty'},'No enquiry follow-ups pending.')):null)))):null,
      cutoffAdmin?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Bills & Charges — Not Attended by Accounts (over 30 minutes)'),h('small',null,'Charge requests still Pending in Charge Approvals 30 minutes after they were raised. India time. Tap a row to open that charge.'),
        h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Guest','Room','Charge','Qty','Raised by','Raised at','Pending for'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,overdueCharges.map(a=>h('tr',{key:a.request_id,role:'button',tabIndex:0,onClick:()=>openOverdueCharge(a,onNavigate),onKeyDown:e=>{if(e.key==='Enter')openOverdueCharge(a,onNavigate)},style:{cursor:'pointer',touchAction:'manipulation'}},
            h('td',null,a.guest_name||'Guest'),h('td',null,a.room_label||'—'),h('td',null,[a.category,a.item].filter(Boolean).filter((v,i,arr)=>arr.indexOf(v)===i).join(' · ')),h('td',null,a.quantity??1),h('td',null,a.raised_by_name||'—'),h('td',null,fmt(a.raised_at)),h('td',null,h('span',{className:'badge',style:{background:'#ffe5e7',color:'#b2192d'}},overdueChargeMinutes(a.minutes))))),
            overdueCharges.length===0?h('tr',null,h('td',{colSpan:7,className:'empty'},'Every charge request has been attended by Accounts within 30 minutes.')):null)))):null,
      cutoffAdmin?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Food Order Cutoff Attempts'),h('small',null,'Latest 100 blocked attempts. India time. Viewing an expired form alone does not create an alert.'),cutoffAttempts.length?cutoffAttempts.map(a=>h('article',{key:a.id,style:{border:'1px solid #efd3d3',borderRadius:'12px',padding:'12px',marginTop:'10px',background:'#fff8f8'}},h('strong',null,`${a.meal_slot} · ${formatDateIN(a.supply_date)} · Blocked`),h('p',null,`${a.actor_name} (${a.actor_role}) attempted ${a.operation==='modify'?'a modification':a.operation==='save'?'to save a draft':'a new order'}.`),h('p',null,`Attempt: ${fmt(a.attempted_at)} · Cutoff: ${fmt(a.deadline)}`))):h('p',{className:'empty'},'No blocked food order attempts.')):null,
      foodAccess?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Food Vendor Replies — Action Needed'),h('small',null,'From the vendor\'s WhatsApp buttons. Returned = the vendor will not supply this order. No reply = nothing tapped 30 minutes after sending.'),
        foodReplyAlerts.length?foodReplyAlerts.map(a=>{const t=foodVendorAlertText(a);return h('article',{key:a.alert_key,style:{border:`1px solid ${t.tone}`,borderLeft:`6px solid ${t.tone}`,borderRadius:'12px',padding:'12px',marginTop:'10px',background:'#fff'}},
          h('strong',{style:{color:t.tone}},t.label+' · '+(a.order_ref||'')),
          h('p',{style:{margin:'6px 0'}},t.detail),
          h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
            h('button',{type:'button',className:'btn btn-primary',onClick:()=>openFoodVendorMessage(a,onNavigate)},'Open order message'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:async()=>{if(await markFoodVendorAlertHandled(a))loadFoodReplyAlerts()}},'Mark handled')))}):h('p',{className:'small-note'},'No food vendor replies need action.')):null,
      foodAccess?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Food Receipts Overdue'),h('small',null,'Delivered orders past their 2-hour receipt entry window. Record what actually arrived now — an order left open past the 1-hour grace period auto-closes as not received and is not billed.'),foodReceiptDue.length?foodReceiptDue.map(({order:o,deadline:d})=>h('article',{key:o.id,style:{border:'1px solid #efd3d3',borderRadius:'12px',padding:'12px',marginTop:'10px',background:'#fff8f8'}},h('strong',null,`${o.data.slot==='Tiffin'?'Breakfast':o.data.slot} · ${formatDateIN(o.data.date)} · ${o.status}`),h('p',null,`Delivery time: ${o.data.delivery} IST · Overdue by ${Math.floor(d.overdueMinutes/60)}h ${d.overdueMinutes%60}m · Auto-closes as not received at ${new Date(d.closeAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true})} IST if not recorded.`),h('button',{type:'button',className:'btn btn-primary',onClick:()=>{try{sessionStorage.setItem('samara_food_view','Food Vendor Management')}catch(_error){}navigate('Food & Diet')}},'Record receipt now'))):h('p',{className:'empty'},'No food orders are currently overdue for receipt entry.')):null,
      h('section',null,h('h4',null,'Medication & Care Escalations — Over 30 Minutes'),h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Patient','Room','Type','Details','Overdue'].map(x=>h('th',{key:x},x)))),h('tbody',null,overdueClinical.map(a=>h('tr',{key:a.key||`${a.alert_type}-${a.source_id}`,role:'button',tabIndex:0,onClick:()=>navigate('Clinical Escalations'),style:{cursor:'pointer',touchAction:'manipulation'}},h('td',null,a.patient_name||'Patient'),h('td',null,a.room_label||'—'),h('td',null,/medic|medicine/.test(`${a.alert_type||''} ${a.title||''}`.toLowerCase())?'Medication':'Care'),h('td',null,a.description||a.title||'Pending clinical action'),h('td',null,englishOverdueLabel(a.overdue_minutes)))),overdueClinical.length===0?h('tr',null,h('td',{colSpan:5,className:'empty'},'No medication or care escalation is currently overdue by 30 minutes.')):null))))
    );
  }

  function WorkflowActionPopups({profile,onNavigate}){
    const [item,setItem]=React.useState(null);
    const closed=React.useRef(new Set());
    const role=String(profile?.role||'').trim().toLowerCase();
    const isManagement=['admin','administrator','director'].includes(role)||(role==='manager'&&!isNursingManagerProfile(profile));
    const isAccounts=role==='accounts';
    const isNursing=role==='nurse'||(role==='manager'&&isNursingManagerProfile(profile));
    const foodAdmin=['admin','administrator','director'].includes(role);
    const foodManager=!!profile?.__foodVendor?.read;
    const canReceive=isManagement||isAccounts||isNursing||foodManager;
    const dismiss=current=>{if(current?.key)closed.current.add(current.key);setItem(null)};
    const load=React.useCallback(async()=>{
      if(!canReceive){setItem(null);return}
      try{
        const jobs=[];
        if(isManagement||isAccounts||isNursing)jobs.push(client.from('patient_discharges').select('id,patient_id,status,management_status,accounts_status,discount_request_status,discount_request_reason,discount_suggested_amount,discount_requested_at,discount_decision,discount_approved_amount,discount_decided_at,created_at').order('created_at',{ascending:false}).limit(100));
        else jobs.push(Promise.resolve({data:[],error:null}));
        if(isAccounts)jobs.push(client.from('bill_charge_requests').select('id,patient_id,service_name,description,approval_status,created_at').eq('approval_status','Pending').order('created_at',{ascending:false}).limit(100));
        else jobs.push(Promise.resolve({data:[],error:null}));
        // Vendor alerts follow the named assignment and Admin/Director authority.
        if(foodManager)jobs.push(client.rpc('fv_vendor_reply_alerts'));
        else jobs.push(Promise.resolve({data:[],error:null}));
        // 2.15.11: withheld doses awaiting the doctor's instruction -> Nurses, Nursing Manager, Managers, Admin/Directors
        if(isManagement||isNursing||foodAdmin){
          const since=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
          jobs.push(client.from('medication_administrations').select('id,patient_id,order_id,scheduled_date,scheduled_time,withhold_reason,withhold_reading,doctor_informed_name,administered_at').eq('status','Withheld').is('doctor_instruction',null).gte('scheduled_date',since).limit(50));
        }else jobs.push(Promise.resolve({data:[],error:null}));
        // 2.15.53/54: charges not attended by Accounts within 30 minutes -> Admin / Director (pop-up re-appears every 30 min while pending)
        if(foodAdmin)jobs.push(client.rpc('bill_charge_overdue_alerts'));
        else jobs.push(Promise.resolve({data:[],error:null}));
        // 2.15.89: indent handed over, not received within 20 min -> the nurse who raised it + Nursing Manager (pop-up re-appears every 20 min)
        if(isNursing)jobs.push(client.rpc('indent_receipt_overdue_alerts'));
        else jobs.push(Promise.resolve({data:[],error:null}));
        // 2.15.90: staff back on duty / not back after leave -> Admin / Director (both) and Managers (not back, own staff)
        if(foodAdmin||role==='manager')jobs.push(client.rpc('staff_return_alerts'));
        else jobs.push(Promise.resolve({data:[],error:null}));
        const [dis,charges,food,withheld,overdue,indentDue,staffReturn]=await Promise.all(jobs);
        const candidates=[];
        (dis.data||[]).forEach(row=>{
          const status=String(row.status||'').trim().toLowerCase(),management=String(row.management_status||'Pending').trim().toLowerCase(),accounts=String(row.accounts_status||'Pending').trim().toLowerCase();
          if(['completed','closed','cancelled','canceled'].includes(status))return;
          const discountStatus=String(row.discount_request_status||'').trim().toLowerCase();
          if(isManagement&&['','pending'].includes(management))candidates.push({key:`discharge-management-${row.id}-${management}`,kind:'Discharge',title:'Discharge approval required',detail:'A discharge has been initiated by Nursing and is waiting for Admin / Director review.',page:'Discharge',target:{type:'management-review',discharge_id:row.id,patient_id:row.patient_id},at:row.created_at});
          if(isManagement&&management==='approved'&&discountStatus==='pending')candidates.push({key:`discharge-discount-${row.id}-${row.discount_requested_at||'pending'}`,kind:'Discount Request',title:'Discharge discount approval required',detail:`Accounts has requested discount consideration${row.discount_suggested_amount?` (suggested ₹${Number(row.discount_suggested_amount).toLocaleString('en-IN')})`:''}. Open Discharge to review and decide.`,page:'Discharge',target:{type:'discount-review',discharge_id:row.id,patient_id:row.patient_id},at:row.discount_requested_at||row.created_at});
          if(isAccounts&&management==='approved'&&accounts!=='cleared'&&discountStatus!=='pending')candidates.push({key:`discharge-accounts-${row.id}-${accounts}-${discountStatus||'none'}`,kind:'Discharge',title:discountStatus==='approved'||discountStatus==='declined'?'Discount decision received — Accounts action required':'Discharge sent to Accounts',detail:discountStatus==='approved'?`Management approved a discharge discount of ₹${Number(row.discount_approved_amount||0).toLocaleString('en-IN')}. Complete Accounts settlement.`:discountStatus==='declined'?'Management declined the discount request. Complete Accounts settlement with the payable amount.':'Management has approved the discharge. Accounts clearance is now required.',page:'Discharge Clearance',target:{type:'accounts-discharge',discharge_id:row.id,patient_id:row.patient_id},at:row.discount_decided_at||row.created_at});
          if(isNursing&&accounts==='cleared')candidates.push({key:`discharge-nursing-${row.id}-${status}`,kind:'Discharge',title:'Accounts cleared — Nursing action required',detail:'Accounts clearance is complete. Please complete Final Discharge Clearance and patient handover.',page:'Discharge',target:{type:'nursing-discharge',discharge_id:row.id,patient_id:row.patient_id},at:row.created_at});
        });
        if(isAccounts)(charges.data||[]).forEach(row=>candidates.push({key:`charge-${row.id}-${row.approval_status}`,kind:'Charge Request',title:'New charge request',detail:row.service_name||row.description||'A charge has been raised and is waiting for Accounts review.',page:'Charge Approvals',target:{type:'charge-request',request_id:row.id,patient_id:row.patient_id},at:row.created_at}));
        if(!food?.error&&Array.isArray(food?.data))food.data.forEach(a=>{
          if(a.alert_type!=='Returned'&&!foodManager)return;
          const t=foodVendorAlertText(a);
          candidates.push({key:`food-${a.alert_key}`,kind:'Food Vendor',title:t.title,detail:t.detail,page:'Food & Diet',food:a,urgent:a.alert_type==='Returned',at:a.event_at});
        });
        if(!withheld?.error&&Array.isArray(withheld?.data)&&withheld.data.length){
          const ids=[...new Set(withheld.data.map(x=>x.patient_id))],orderIds=[...new Set(withheld.data.map(x=>x.order_id))];
          const [pts,ords]=await Promise.all([
            client.from('patients').select('id,title,full_name,room_no,bed_no,is_active').in('id',ids),
            client.from('medication_orders').select('id,medicine_name,strength').in('id',orderIds)
          ]);
          withheld.data.forEach(w=>{
            const pt=(pts.data||[]).find(x=>x.id===w.patient_id);if(pt&&pt.is_active===false)return;
            const od=(ords.data||[]).find(x=>x.id===w.order_id)||{};
            const who=pt?`${formalName(pt)||pt.full_name}${pt.room_no?` (Room ${pt.room_no}${pt.bed_no?'-'+pt.bed_no:''})`:''}`:'A resident';
            candidates.push({key:`withheld-${w.id}`,kind:'Medication',title:'Dose withheld — doctor\'s instruction needed',detail:`${who}: ${[od.medicine_name,od.strength].filter(Boolean).join(' ')||'medicine'} (${String(w.scheduled_time||'').slice(0,5)}) was withheld — ${[w.withhold_reason,w.withhold_reading].filter(Boolean).join(', ')}. Doctor informed: ${w.doctor_informed_name||'—'}. Record the doctor's instruction in Medicines.`,page:'Medicines',urgent:true,at:w.administered_at});
          });
        }
        if(!overdue?.error&&Array.isArray(overdue?.data)&&overdue.data.length){
          const list=overdue.data.slice().sort((a,b)=>new Date(a.raised_at)-new Date(b.raised_at));
          const oldest=list[0],newest=list[list.length-1];
          const lines=list.slice(0,4).map(a=>`${a.guest_name||'Guest'}${a.room_label?` (${a.room_label})`:''}: ${a.item||a.category||'Charge'} — pending ${overdueChargeMinutes(a.minutes)}`).join('; ');
          candidates.push({key:`charge-overdue-${newest.request_id}-${list.length}-${Math.floor(Date.now()/1800000)}`,kind:'Bills & Charges',title:`${list.length} charge request${list.length===1?'':'s'} not attended by Accounts`,detail:`Not approved / rejected by Accounts within 30 minutes of being raised. ${lines}${list.length>4?`; + ${list.length-4} more (see Notifications)`:''}. Follow up with Accounts.`,page:'Charge Approvals',target:{type:'charge-request',request_id:oldest.request_id,patient_id:oldest.patient_id},urgent:true,at:oldest.raised_at});
        }
        const indentRows=(!indentDue?.error&&Array.isArray(indentDue?.data))?indentDue.data.filter(a=>a.audience==='nurse'||a.audience==='manager'):[];
        if(indentRows.length){
          const list=indentRows.slice().sort((a,b)=>new Date(a.handed_over_at)-new Date(b.handed_over_at));
          const oldest=list[0],mine=list.every(a=>a.audience==='nurse');
          const round=Math.max(...list.map(a=>Number(a.round_no||0)));
          const lines=list.slice(0,4).map(a=>`${a.indent_ref}: ${a.item_name} × ${a.quantity} ${a.unit||''} for ${a.guest_name||'Guest'}${a.room_label?` (${a.room_label})`:''}${mine?'':` — ${a.nurse_name||'nurse'}`}, waiting ${overdueChargeMinutes(a.minutes)}`).join('; ');
          candidates.push({key:`indent-receipt-${list.map(a=>a.indent_id).join('-')}-${round}`,kind:'Nursing Indent',
            title:mine?`Press Received for ${list.length===1?'your indent':`${list.length} indents`}`:`${list.length} indent${list.length===1?'':'s'} not received by the nurse`,
            detail:mine?`The store handed these over more than 20 minutes ago, but Received is not entered yet. ${lines}${list.length>4?`; + ${list.length-4} more`:''}. Check the items and press Received.`:`Handed over by the store, but the nurse has not pressed Received within 20 minutes. ${lines}${list.length>4?`; + ${list.length-4} more (see Alerts)`:''}. Please follow up with the nurse.`,
            page:'Patient Consumables',record:list.length===1?{id:oldest.indent_id,patient_id:oldest.patient_id,label:indentReceiptLabel(oldest)}:null,urgent:true,at:oldest.handed_over_at});
        }
        const staffRows=(!staffReturn?.error&&Array.isArray(staffReturn?.data))?staffReturn.data:[];
        const notBack=staffRows.filter(a=>a.alert==='Not back'),backRows=staffRows.filter(a=>a.alert!=='Not back');
        if(notBack.length){
          const first=notBack[0];
          candidates.push({key:`staff-notback-${notBack.map(a=>a.leave_id).join('-')}-${Math.floor(Date.now()/3600000)}`,kind:'Staff Leave',
            title:`${notBack.length} staff not back on duty after leave`,
            detail:`${notBack.slice(0,4).map(staffReturnLine).join('; ')}${notBack.length>4?`; + ${notBack.length-4} more (see Alerts)`:''}. ${foodAdmin?'Check with the Manager.':'If she has reported, open the leave and tap Mark Back on Duty.'}`,
            page:'Staff Leave Calendar',record:{id:first.leave_id,date:first.due_date,label:staffReturnLabel(first)},urgent:true,at:first.alert_at});
        }
        backRows.forEach(a=>candidates.push({key:`staff-back-${a.leave_id}`,kind:'Staff Leave',title:`${a.employee_name||'Staff'} is back on duty`,detail:staffReturnLine(a)+'.',page:'Staff Leave Calendar',record:{id:a.leave_id,date:a.due_date,label:staffReturnLabel(a)},at:a.recorded_at}));
        candidates.sort((a,b)=>Number(!!b.urgent)-Number(!!a.urgent)||new Date(b.at||0)-new Date(a.at||0));
        const next=candidates.find(x=>!closed.current.has(x.key));
        setItem(current=>current&&candidates.some(x=>x.key===current.key)?current:(next||null));
      }catch(error){console.warn('Workflow action pop-up unavailable:',error)}
    },[profile?.id,role,isManagement,isAccounts,isNursing,foodManager]);
    React.useEffect(()=>{load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('samara-discharge-workflow-changed',load);return()=>{clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('samara-discharge-workflow-changed',load)}},[load]);
    if(!item||(item.food&&!foodManager))return null;
    // v2.14.39: compact alert card with its own classes, so phone "full-screen form" rules
    // do not stretch it to the whole screen or add a second floating Close button.
    return h('div',{className:'samara-workflow-popup',role:'presentation'},h('div',{className:'samara-workflow-popup-card',role:'alertdialog','aria-modal':'true','aria-label':item.title},
      h('div',{className:'samara-workflow-popup-head'},
        h('div',null,h('h3',null,item.title),h('small',null,item.kind+' workflow')),
        h('button',{type:'button',className:'samara-workflow-popup-x','aria-label':'Close',onClick:()=>dismiss(item)},'×')),
      h('div',{className:'samara-workflow-popup-detail'},item.detail),
      h('div',{className:'samara-workflow-popup-actions'},
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>dismiss(item)},'Close'),
        item.food?h('button',{type:'button',className:'btn btn-secondary',onClick:async()=>{if(await markFoodVendorAlertHandled(item.food)){dismiss(item);load();}}},'Mark handled'):null,
        item.food?h('button',{type:'button',className:'btn btn-primary',onClick:()=>{dismiss(item);openFoodVendorMessage(item.food,onNavigate)}},'Open order message'):
        item.record?h('button',{type:'button',className:'btn btn-primary',onClick:()=>{dismiss(item);openRecord(item.page,item.record)}},'Open & Take Action'):
        h('button',{type:'button',className:'btn btn-primary',onClick:()=>{const target=item.target?{...item.target,at:Date.now()}:null;try{if(target)sessionStorage.setItem('samara-workflow-target',JSON.stringify(target));}catch(_error){} dismiss(item);onNavigate(item.page);/* v2.14.45: tell an already-open page to show this exact item now */if(target)setTimeout(()=>window.dispatchEvent(new CustomEvent('samara-workflow-target',{detail:target})),0)}},'Open & Take Action'))
    ));
  }

  function StoreIndentAlerts({profile,onNavigate}){
    const [pending,setPending]=React.useState([]),[latest,setLatest]=React.useState(null);
    const initialised=React.useRef(false);
    const enabled=profile?.role==='Manager'&&(isNursingManagerProfile(profile)||employeeDepartment(profile)==='Nursing');
    async function load(){
      if(!enabled)return;
      const {data,error}=await client.from('patient_consumable_indents').select('*').eq('status','Initiated').order('created_at',{ascending:false}).limit(100);
      if(!error)setPending(data||[]);
    }
    React.useEffect(()=>{
      if(!enabled)return;
      load().finally(()=>{initialised.current=true});
      const channel=client.channel(`store-indent-alert-${profile?.id||'manager'}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'patient_consumable_indents'},payload=>{
        const row=payload.new||{};if(row.status!=='Initiated')return;
        setLatest(row);load();
        try{playClinicalTone('Urgent',false)}catch(_error){}
        try{
          if(window.Notification&&Notification.permission==='granted'){
            const notice=new Notification('New Pharmacy & Stores Indent',{body:`${row.item_name||'Consumable'} · Quantity ${row.requested_qty||'—'} ${row.unit||''}`,tag:`store-indent-${row.id||Date.now()}`});
            notice.onclick=()=>{window.focus();onNavigate('Patient Consumables');notice.close()};
          }
        }catch(_error){}
      }).on('postgres_changes',{event:'UPDATE',schema:'public',table:'patient_consumable_indents'},load).subscribe();
      return()=>client.removeChannel(channel);
    },[enabled,profile?.id]);
    React.useEffect(()=>{
      if(document.getElementById('store-indent-alert-style'))return;
      const style=document.createElement('style');style.id='store-indent-alert-style';style.textContent=`
        .store-indent-alert-badge{border:0;border-radius:999px;background:#a80d4f;color:#fff;padding:9px 12px;font-weight:900;cursor:pointer;white-space:nowrap;touch-action:manipulation}
        .store-indent-popup{position:fixed;right:20px;bottom:90px;z-index:10120;width:min(390px,calc(100vw - 28px));padding:16px;border:2px solid #d11b69;border-radius:18px;background:#fff;box-shadow:0 18px 55px rgba(83,16,51,.28)}
        .store-indent-popup h4{margin:0 0 7px;color:#9d0a50}.store-indent-popup p{margin:5px 0;color:#4e3542}.store-indent-popup-actions{display:flex;gap:9px;margin-top:12px}.store-indent-popup-actions .btn{flex:1}
        @media(max-width:760px){.store-indent-alert-badge{position:absolute;right:142px;top:14px;padding:8px 10px;font-size:13px}.store-indent-popup{right:14px;bottom:92px}}
      `;document.head.appendChild(style);
    },[]);
    if(!enabled)return null;
    return h(React.Fragment,null,
      h('button',{type:'button',className:'store-indent-alert-badge','aria-label':`${pending.length} Pharmacy and Stores indents awaiting approval`,onClick:()=>onNavigate('Patient Consumables')},`📦 ${pending.length}`),
      latest?h('div',{className:'store-indent-popup',role:'alert','aria-live':'assertive'},h('h4',null,'New Pharmacy & Stores Indent'),h('p',null,h('strong',null,latest.item_name||'Consumable request')),h('p',null,`Requested quantity: ${latest.requested_qty||'—'} ${latest.unit||''}`),h('div',{className:'store-indent-popup-actions'},h('button',{type:'button',className:'btn btn-primary',onClick:()=>{setLatest(null);onNavigate('Patient Consumables')}},'View Request'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setLatest(null)},'Close'))):null
    );
  }

  function ensureSmartHoverStyles(){
    if(document.getElementById('samara-smart-hover-styles'))return;
    const style=document.createElement('style');style.id='samara-smart-hover-styles';
    style.textContent=`
      .samara-smart-hover{position:fixed;z-index:10080;display:none;width:min(390px,calc(100vw - 28px));box-sizing:border-box;padding:15px 17px;border:2px solid #e5a3c1;border-radius:14px;background:linear-gradient(135deg,#fffafd 0%,#fff1f7 100%);color:#4f1736;font-size:15px;font-weight:700;line-height:1.5;letter-spacing:.01em;white-space:normal;overflow-wrap:anywhere;box-shadow:0 14px 34px rgba(122,18,71,.22);pointer-events:none}.samara-smart-hover.show{display:block}.samara-smart-hover-line{display:grid;grid-template-columns:72px 14px minmax(0,1fr);align-items:start;gap:0;margin:2px 0}.samara-smart-hover-label{font-weight:900;color:#7a1247}.samara-smart-hover-colon{font-weight:900;color:#b01264}.samara-smart-hover-value{min-width:0;color:#4f1736;font-weight:700;overflow-wrap:anywhere}
      .topbar-alert-centre{position:relative;display:flex;align-items:center;z-index:100}
      .topbar-alert-preview{position:absolute;right:0;top:calc(100% + 10px);width:min(420px,calc(100vw - 28px));background:#fff;border:1px solid #ead1de;border-radius:16px;box-shadow:0 18px 48px rgba(74,20,49,.22);overflow:hidden;z-index:10100;text-align:left}
      .topbar-alert-preview-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;background:#fff7fb;border-bottom:1px solid #f0dce6}.topbar-alert-preview-head>div{display:flex;flex-direction:column;gap:2px}.topbar-alert-preview-head strong{color:#6f153f;font-size:15px}.topbar-alert-preview-head small{color:#715b68;font-weight:700}.topbar-alert-open-all{border:0;border-radius:9px;background:#a80d4f;color:#fff;padding:8px 11px;font-weight:900;cursor:pointer}
      .topbar-alert-preview-list{max-height:360px;overflow:auto}.topbar-alert-preview-item{width:100%;display:grid;grid-template-columns:72px 1fr auto;gap:3px 9px;align-items:center;border:0;border-bottom:1px solid #f0e3e9;background:#fff;padding:11px 13px;text-align:left;cursor:pointer}.topbar-alert-preview-item:hover{background:#fff8fb}.topbar-alert-preview-item strong{color:#35222d}.topbar-alert-preview-item>span:not(.alert-preview-priority){grid-column:2/4;color:#66535f;font-size:12px}.topbar-alert-preview-item small{grid-column:3;color:#8a405f;font-weight:800}.alert-preview-priority{font-size:10px;font-weight:900;text-transform:uppercase;border-radius:999px;padding:4px 7px;text-align:center;background:#edf3ff;color:#2860ad}.topbar-alert-preview-item.urgent .alert-preview-priority{background:#fff0d9;color:#a05a00}.topbar-alert-preview-item.critical .alert-preview-priority{background:#ffe5e7;color:#b2192d}.topbar-alert-more{padding:9px 13px;color:#6b5662;background:#fffafd;font-size:12px;font-weight:700}
      @media(max-width:760px){.topbar-alert-centre{position:absolute;right:76px;top:12px}.topbar-alert-centre .topbar-clinical-alert-badge{position:static!important}.topbar-alert-preview{display:none!important}.samara-smart-hover{display:none!important}}
    `;document.head.appendChild(style);
  }


