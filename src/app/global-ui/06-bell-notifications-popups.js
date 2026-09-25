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
    const cutoffAdmin=['admin','administrator','director'].includes(String(profile?.role||'').trim().toLowerCase());
    const [cutoffAttempts,setCutoffAttempts]=React.useState([]);
    async function loadCutoffAttempts(){if(!cutoffAdmin)return;const {data,error}=await client.from('fv_cutoff_attempts').select('id,actor_name,actor_role,operation,supply_date,meal_slot,deadline,attempted_at').order('attempted_at',{ascending:false}).limit(100);if(error)throw error;setCutoffAttempts(data||[])}
    const nursingManager=profile?.role==='Manager'&&(isNursingManagerProfile(profile)||employeeDepartment(profile)==='Nursing');
    const [foodReceiptDue,setFoodReceiptDue]=React.useState([]);
    async function loadFoodReceiptDue(){
      if(!(nursingManager||cutoffAdmin))return;
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
    React.useEffect(()=>{if(!(nursingManager||cutoffAdmin))return;loadFoodReceiptDue();const timer=setInterval(loadFoodReceiptDue,60000);window.addEventListener('focus',loadFoodReceiptDue);return()=>{clearInterval(timer);window.removeEventListener('focus',loadFoodReceiptDue)}},[profile?.id,nursingManager,cutoffAdmin]);
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
      h('div',{className:'panel-head'},h('div',null,h('h3',null,'Notifications'),h('small',null,nursingManager?'Pharmacy & Stores requests and 30-minute nursing escalations.':cutoffAdmin?'Food cutoff attempts and clinical items requiring attention.':'Clinical items requiring attention.')),h('button',{type:'button',className:'btn btn-primary',disabled:loading,onClick:loadNotifications},loading?'Refreshing…':'↻ Refresh')),
      message?h('div',{className:'message error'},message):null,
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:'12px',marginBottom:'18px'}},nursingManager?metric('Store Requests',awaitingApproval.length,'Patient Consumables'):null,nursingManager?metric('Awaiting Handover',awaitingHandover.length,'Patient Consumables'):null,metric('Medication > 30 min',medicineAlerts.length,'Clinical Escalations','#efb6b6'),metric('Care > 30 min',careAlerts.length,'Clinical Escalations','#efcf9c'),nursingManager?metric('Store Discrepancies',discrepancies.length,'Patient Consumables','#efb6b6'):null),
      nursingManager?h('section',{style:{marginBottom:'20px'}},h('h4',null,'Pharmacy & Stores Requests'),h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Patient','Item','Quantity','Status','Requested'].map(x=>h('th',{key:x},x)))),h('tbody',null,storeRequests.map(r=>h('tr',{key:r.id,role:'button',tabIndex:0,onClick:()=>navigate('Patient Consumables'),style:{cursor:'pointer',touchAction:'manipulation'}},h('td',null,patientName(r)),h('td',null,r.item_name||'Consumable'),h('td',null,`${r.requested_qty||'—'} ${r.unit||''}`),h('td',null,h('span',{className:'badge'},r.status)),h('td',null,fmt(r.created_at)))),storeRequests.length===0?h('tr',null,h('td',{colSpan:5,className:'empty'},'No open Pharmacy & Stores requests.')):null)))):null,
      cutoffAdmin?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Food Order Cutoff Attempts'),h('small',null,'Latest 100 blocked attempts. India time. Viewing an expired form alone does not create an alert.'),cutoffAttempts.length?cutoffAttempts.map(a=>h('article',{key:a.id,style:{border:'1px solid #efd3d3',borderRadius:'12px',padding:'12px',marginTop:'10px',background:'#fff8f8'}},h('strong',null,`${a.meal_slot} · ${formatDateIN(a.supply_date)} · Blocked`),h('p',null,`${a.actor_name} (${a.actor_role}) attempted ${a.operation==='modify'?'a modification':a.operation==='save'?'to save a draft':'a new order'}.`),h('p',null,`Attempt: ${fmt(a.attempted_at)} · Cutoff: ${fmt(a.deadline)}`))):h('p',{className:'empty'},'No blocked food order attempts.')):null,
      (nursingManager||cutoffAdmin)?h('section',{style:{marginBottom:'22px'}},h('h4',null,'Food Receipts Overdue'),h('small',null,'Delivered orders past their 2-hour receipt entry window. Record what actually arrived now — an order left open past the 1-hour grace period auto-closes as not received and is not billed.'),foodReceiptDue.length?foodReceiptDue.map(({order:o,deadline:d})=>h('article',{key:o.id,style:{border:'1px solid #efd3d3',borderRadius:'12px',padding:'12px',marginTop:'10px',background:'#fff8f8'}},h('strong',null,`${o.data.slot==='Tiffin'?'Breakfast':o.data.slot} · ${formatDateIN(o.data.date)} · ${o.status}`),h('p',null,`Delivery time: ${o.data.delivery} IST · Overdue by ${Math.floor(d.overdueMinutes/60)}h ${d.overdueMinutes%60}m · Auto-closes as not received at ${new Date(d.closeAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true})} IST if not recorded.`),h('button',{type:'button',className:'btn btn-primary',onClick:()=>{try{sessionStorage.setItem('samara_food_view','Food Vendor Management')}catch(_error){}navigate('Food & Diet')}},'Record receipt now'))):h('p',{className:'empty'},'No food orders are currently overdue for receipt entry.')):null,
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
    const canReceive=isManagement||isAccounts||isNursing;
    const dismiss=current=>{if(current?.key)closed.current.add(current.key);setItem(null)};
    const load=React.useCallback(async()=>{
      if(!canReceive){setItem(null);return}
      try{
        const jobs=[];
        if(isManagement||isAccounts||isNursing)jobs.push(client.from('patient_discharges').select('id,patient_id,status,management_status,accounts_status,discount_request_status,discount_request_reason,discount_suggested_amount,discount_requested_at,discount_decision,discount_approved_amount,discount_decided_at,created_at').order('created_at',{ascending:false}).limit(100));
        else jobs.push(Promise.resolve({data:[],error:null}));
        if(isAccounts)jobs.push(client.from('bill_charge_requests').select('id,patient_id,service_name,description,approval_status,created_at').eq('approval_status','Pending').order('created_at',{ascending:false}).limit(100));
        else jobs.push(Promise.resolve({data:[],error:null}));
        const [dis,charges]=await Promise.all(jobs);
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
        candidates.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));
        const next=candidates.find(x=>!closed.current.has(x.key));
        setItem(current=>current&&candidates.some(x=>x.key===current.key)?current:(next||null));
      }catch(error){console.warn('Workflow action pop-up unavailable:',error)}
    },[profile?.id,role,isManagement,isAccounts,isNursing]);
    React.useEffect(()=>{load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('samara-discharge-workflow-changed',load);return()=>{clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('samara-discharge-workflow-changed',load)}},[load]);
    if(!item)return null;
    // v2.14.39: compact alert card with its own classes, so phone "full-screen form" rules
    // do not stretch it to the whole screen or add a second floating Close button.
    return h('div',{className:'samara-workflow-popup',role:'presentation'},h('div',{className:'samara-workflow-popup-card',role:'alertdialog','aria-modal':'true','aria-label':item.title},
      h('div',{className:'samara-workflow-popup-head'},
        h('div',null,h('h3',null,item.title),h('small',null,item.kind+' workflow')),
        h('button',{type:'button',className:'samara-workflow-popup-x','aria-label':'Close',onClick:()=>dismiss(item)},'×')),
      h('div',{className:'samara-workflow-popup-detail'},item.detail),
      h('div',{className:'samara-workflow-popup-actions'},
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>dismiss(item)},'Close'),
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


