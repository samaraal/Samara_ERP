  function NursingProcedures({profile}){
    const canRequest=profile?.role==='Nurse';
    const canDecide=['Admin','Manager'].includes(profile?.role);
    const canManageMaster=['Admin','Manager'].includes(profile?.role);
    const canStart=profile?.role==='Nurse';
    const [patients]=usePatients();
    const [master,setMaster]=React.useState([]);
    const [requests,setRequests]=React.useState([]);
    const [storeItems,setStoreItems]=React.useState([]);
    const [busy,setBusy]=React.useState(false);
    const [form,setForm]=React.useState({patient_id:'',procedure_id:'',scheduled_at:'',remarks:''});
    const [showMasterForm,setShowMasterForm]=React.useState(false);
    const [masterForm,setMasterForm]=React.useState({code:'',procedure_name:''});
    const [editingMaster,setEditingMaster]=React.useState(null);

    const load=React.useCallback(async()=>{
      const [m,r,s]=await Promise.all([
        client.from('nursing_procedure_master').select('*').order('display_order').order('procedure_name'),
        client.from('nursing_procedure_requests').select('*').order('requested_at',{ascending:false}).limit(300),
        client.from('consumable_store_items').select('id,item_name,item_category').eq('active',true)
      ]);
      if(!m.error)setMaster(m.data||[]);else console.warn(m.error);
      if(!r.error)setRequests(r.data||[]);else console.warn(r.error);
      if(!s.error)setStoreItems(s.data||[]);
    },[]);

    // Checks a new/edited procedure name against other active procedure codes AND
    // against Consumables/Pharmacy item names, so the same real thing (e.g. "Blood
    // Glucose Monitoring" vs "Glucose Strips") is not billed twice from two catalogs.
    const normalizeName=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
    const nameTokens=value=>new Set(normalizeName(value).split(' ').filter(Boolean).map(x=>x.length>3&&x.endsWith('s')?x.slice(0,-1):x));
    const findCatalogDuplicate=(name,excludeId='')=>{
      const n=normalizeName(name);if(!n)return null;const a=nameTokens(name);
      let best=null,bestScore=0;
      for(const p of master){
        if(String(p.id)===String(excludeId))continue;
        const pn=normalizeName(p.procedure_name);if(!pn)continue;
        if(pn===n)return {label:p.procedure_name,source:'Nursing Procedure Code',code:p.code,match:'exact'};
        const b=nameTokens(p.procedure_name),intersection=[...a].filter(x=>b.has(x)).length,union=new Set([...a,...b]).size,score=union?intersection/union:0;
        if(score>bestScore){bestScore=score;best={label:p.procedure_name,source:'Nursing Procedure Code',code:p.code}}
      }
      for(const s of storeItems){
        const sn=normalizeName(s.item_name);if(!sn)continue;
        if(sn===n)return {label:s.item_name,source:s.item_category||'Consumables/Pharmacy',match:'exact'};
        const b=nameTokens(s.item_name),intersection=[...a].filter(x=>b.has(x)).length,union=new Set([...a,...b]).size,score=union?intersection/union:0;
        if(score>bestScore){bestScore=score;best={label:s.item_name,source:s.item_category||'Consumables/Pharmacy'}}
      }
      return bestScore>=0.72?{...best,match:best.match||'similar'}:null;
    };
    React.useEffect(()=>{
      load();
      const ch=client.channel('nursing-procedures-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'nursing_procedure_requests'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'nursing_procedure_master'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[load]);

    const activeMaster=master.filter(x=>x.is_active!==false);
    const patientName=id=>{const p=patients.find(x=>x.id===id);return p?(formalName(p)||p.full_name||p.patient_id||'Patient'):'—'};

    async function submitRequest(e){
      e.preventDefault();
      if(!canRequest||busy)return;
      if(!form.patient_id||!form.procedure_id)return showSamaraActionToast('error','Nursing Procedure','Select a patient and a procedure.');
      setBusy(true);
      const res=await client.rpc('request_nursing_procedure',{
        p_patient_id:form.patient_id,p_procedure_id:form.procedure_id,
        p_scheduled_at:form.scheduled_at?new Date(form.scheduled_at).toISOString():null,
        p_remarks:form.remarks.trim()||null
      });
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Nursing Procedure',res.error.message);
      await writeAuditEvent('Request Nursing Procedure','NursingProcedureRequest',res.data,{patient_id:form.patient_id});
      showSamaraActionToast('success','Request sent','Sent to the Nursing Manager for approval.');
      setForm({patient_id:'',procedure_id:'',scheduled_at:'',remarks:''});
      load();
    }

    async function decide(row,decision){
      if(!canDecide||busy)return;
      let remarks=null;
      if(decision==='Declined'){remarks=prompt('Reason for declining (optional):','');if(remarks===null)return;}
      setBusy(true);
      const res=await client.rpc('decide_nursing_procedure_request',{p_request_id:row.id,p_decision:decision,p_remarks:remarks||null});
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Nursing Procedure',res.error.message);
      await writeAuditEvent(decision==='Approved'?'Approve Nursing Procedure':'Decline Nursing Procedure','NursingProcedureRequest',row.id,{patient_id:row.patient_id});
      showSamaraActionToast('success','Nursing Procedure',`Request ${decision.toLowerCase()}.`);
      load();
    }

    async function startProcedure(row){
      if(!canStart||busy)return;
      if(!confirm(`Confirm and start "${row.procedure_name}" for ${patientName(row.patient_id)}? This raises the matching Nursing Procedures charge for Accounts to verify.`))return;
      setBusy(true);
      const res=await client.rpc('start_nursing_procedure',{p_request_id:row.id});
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Nursing Procedure',res.error.message);
      await writeAuditEvent('Start Nursing Procedure','NursingProcedureRequest',row.id,{patient_id:row.patient_id,charge_request_id:res.data?.charge_request_id});
      showSamaraActionToast('success','Procedure started',`${row.procedure_name} started. The charge has been raised for Accounts verification.`);
      load();
    }

    async function saveMasterItem(e){
      e.preventDefault();
      if(!canManageMaster||busy)return;
      if(!masterForm.code.trim()||!masterForm.procedure_name.trim())return showSamaraActionToast('error','Nursing Procedure Code','Code and procedure name are required.');
      const duplicate=findCatalogDuplicate(masterForm.procedure_name,editingMaster?.id);
      if(duplicate)return showSamaraActionToast('error','Possible duplicate',`"${masterForm.procedure_name}" looks similar to the existing ${duplicate.source}${duplicate.code?` (${duplicate.code})`:''}: "${duplicate.label}". Use/edit that entry instead, or include a distinguishing detail in the procedure name.`);
      setBusy(true);
      const res=editingMaster
        ?await client.from('nursing_procedure_master').update({code:masterForm.code.trim(),procedure_name:masterForm.procedure_name.trim(),updated_at:new Date().toISOString()}).eq('id',editingMaster.id)
        :await client.from('nursing_procedure_master').insert({code:masterForm.code.trim(),procedure_name:masterForm.procedure_name.trim(),created_by:profile.id});
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Nursing Procedure Code',res.error.message);
      showSamaraActionToast('success','Nursing Procedure Code',editingMaster?'Updated.':'Added.');
      setShowMasterForm(false);setEditingMaster(null);setMasterForm({code:'',procedure_name:''});
      load();
    }

    async function toggleMasterActive(row){
      if(!canManageMaster||busy)return;
      if(!confirm(row.is_active===false?`Reactivate ${row.procedure_name}?`:`Deactivate ${row.procedure_name}? Existing requests keep their history.`))return;
      setBusy(true);
      const res=await client.from('nursing_procedure_master').update({is_active:row.is_active===false,updated_at:new Date().toISOString()}).eq('id',row.id);
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Nursing Procedure Code',res.error.message);
      load();
    }

    const pending=requests.filter(x=>x.status==='Requested');
    const readyToStart=requests.filter(x=>x.status==='Approved');
    const statusPill=status=>h('span',{style:{fontWeight:800,fontSize:'12px',padding:'4px 8px',borderRadius:'999px',display:'inline-block',
      background:status==='Requested'?'#fff4dc':status==='Approved'?'#e3f2ff':status==='Started'?'#e7f6ef':status==='Declined'?'#fdebec':'#f1f1f1',
      color:'#5d3146'}},status);

    return h('div',null,
      canRequest&&h(Section,{title:'Request a Nursing Procedure',subtitle:'Sent to the Nursing Manager for approval before it can be started.'},
        h('form',{onSubmit:submitRequest},
          h('div',{className:'grid two'},
            patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v})),
            h('div',{className:'field'},h('label',null,'Procedure *'),h('select',{value:form.procedure_id,onChange:e=>setForm({...form,procedure_id:e.target.value}),required:true},
              h('option',{value:''},'Select procedure'),
              activeMaster.map(p=>h('option',{key:p.id,value:p.id},`${p.code} · ${p.procedure_name}`)))),
            h('div',{className:'field'},h('label',null,'Scheduled Date / Time'),h('input',{type:'datetime-local',value:form.scheduled_at,onChange:e=>setForm({...form,scheduled_at:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Remarks'),h('textarea',{rows:2,value:form.remarks,onChange:e=>setForm({...form,remarks:e.target.value}),placeholder:'Any additional notes for the Nursing Manager'}))
          ),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Sending…':'Send Request')
        )
      ),
      canDecide&&h(Section,{title:`Pending Approval (${pending.length})`,subtitle:'Approve or decline each request. Once approved, the requesting nurse confirms and starts it.'},
        pending.length?h('div',{className:'stores-ledger-mobile'},pending.map(r=>h('article',{className:'stores-ledger-card',key:r.id},
          h('div',{className:'stores-ledger-card-head'},h('strong',null,`${r.procedure_code||''} · ${r.procedure_name}`),statusPill(r.status)),
          h('p',null,`${patientName(r.patient_id)} · Requested by ${r.requested_by_name||'—'} at ${formatDateTimeIN(r.requested_at)}`),
          r.scheduled_at&&h('p',null,`Scheduled: ${formatDateTimeIN(r.scheduled_at)}`),
          r.remarks&&h('p',null,`Remarks: ${r.remarks}`),
          h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'8px'}},
            h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>decide(r,'Approved')},'Approve'),
            h('button',{className:'btn btn-danger',disabled:busy,onClick:()=>decide(r,'Declined')},'Decline')
          )
        ))):h('p',null,'No pending requests.')
      ),
      canStart&&h(Section,{title:`Approved — Ready to Start (${readyToStart.length})`,subtitle:'Confirm you are about to perform the procedure. This raises the matching charge for Accounts.'},
        readyToStart.length?h('div',{className:'stores-ledger-mobile'},readyToStart.map(r=>h('article',{className:'stores-ledger-card',key:r.id},
          h('div',{className:'stores-ledger-card-head'},h('strong',null,`${r.procedure_code||''} · ${r.procedure_name}`),statusPill(r.status)),
          h('p',null,`${patientName(r.patient_id)} · Approved by ${r.decision_by_name||'—'} at ${formatDateTimeIN(r.decision_at)}`),
          r.scheduled_at&&h('p',null,`Scheduled: ${formatDateTimeIN(r.scheduled_at)}`),
          h('div',{style:{marginTop:'8px'}},h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>startProcedure(r)},'Confirm & Start'))
        ))):h('p',null,'No approved requests waiting to start.')
      ),
      h(LogTable,{title:'All Nursing Procedure Requests',subtitle:'Complete history: request, approval and start.',
        heads:['Patient','Procedure','Requested By / At','Scheduled','Status','Decision By / At','Started By / At'],
        rows:requests.map(r=>[
          patientName(r.patient_id),
          `${r.procedure_code||''} · ${r.procedure_name}`,
          `${r.requested_by_name||'—'} · ${formatDateTimeIN(r.requested_at)}`,
          r.scheduled_at?formatDateTimeIN(r.scheduled_at):'—',
          statusPill(r.status),
          r.decision_by_name?`${r.decision_by_name} · ${formatDateTimeIN(r.decision_at)}${r.decision_remarks?` · ${r.decision_remarks}`:''}`:'—',
          r.started_by_name?`${r.started_by_name} · ${formatDateTimeIN(r.started_at)}`:'—'
        ])
      }),
      canManageMaster&&h(Section,{title:'Nursing Procedure Codes',subtitle:'Maintain the list nurses choose from when raising a request.',
        actions:h('button',{className:'btn btn-primary',onClick:()=>{setEditingMaster(null);setMasterForm({code:'',procedure_name:''});setShowMasterForm(true)}},'+ Add Procedure Code')},
        h(LogTable,{heads:['Code','Procedure','Status','Action'],rows:master.map(r=>[r.code,r.procedure_name,r.is_active===false?'Inactive':'Active',
          h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},
            h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>{setEditingMaster(r);setMasterForm({code:r.code,procedure_name:r.procedure_name});setShowMasterForm(true)}},'Edit'),
            h('button',{className:r.is_active===false?'btn btn-primary':'btn btn-danger',disabled:busy,onClick:()=>toggleMasterActive(r)},r.is_active===false?'Reactivate':'Deactivate')
          )
        ])})
      ),
      showMasterForm&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:saveMasterItem},
        h('h3',null,editingMaster?'Edit Procedure Code':'Add Procedure Code'),
        h('div',{className:'field'},h('label',null,'Code *'),h('input',{value:masterForm.code,onChange:e=>setMasterForm({...masterForm,code:e.target.value}),required:true,placeholder:'Example: NP-016'})),
        h('div',{className:'field'},h('label',null,'Procedure Name *'),h('input',{value:masterForm.procedure_name,onChange:e=>setMasterForm({...masterForm,procedure_name:e.target.value}),required:true})),
        h('small',null,'For the automatic charge to work smoothly, use the same procedure name already listed under Nursing Procedures in Charge Master, or ask Admin to add a matching tariff there.'),
        h('div',{className:'modal-actions'},
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{setShowMasterForm(false);setEditingMaster(null)}},'Cancel'),
          h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save')
        )
      ))
    );
  }
