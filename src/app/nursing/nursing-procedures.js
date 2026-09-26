  function NursingProcedures({profile}){
    const canRequest=profile?.role==='Nurse';
    const canDecide=['Admin','Manager'].includes(profile?.role);
    const canSeeList=['Admin','Manager'].includes(profile?.role);
    const canStart=profile?.role==='Nurse';
    const [patients]=usePatients();
    const [catalog,setCatalog]=React.useState([]);
    const [catalogError,setCatalogError]=React.useState('');
    const [requests,setRequests]=React.useState([]);
    const [busy,setBusy]=React.useState(false);
    const [form,setForm]=React.useState({patient_id:'',tariff_id:'',scheduled_at:'',remarks:''});

    // v2.14.60: the procedure list comes straight from Charge Master
    // (category "Nursing Procedures", active items, with their NUR- codes).
    // Code and name only — the tariff amount is never sent to Nursing.
    const load=React.useCallback(async()=>{
      const [c,r]=await Promise.all([
        client.rpc('get_nursing_procedure_catalog'),
        client.from('nursing_procedure_requests').select('*').order('requested_at',{ascending:false}).limit(300)
      ]);
      if(!c.error){setCatalog(c.data||[]);setCatalogError('')}
      else{console.warn(c.error);setCatalogError(/get_nursing_procedure_catalog/i.test(c.error.message||'')?'Database update pending: run 151_nursing_procedures_from_charge_master.sql in Supabase.':c.error.message)}
      if(!r.error)setRequests(r.data||[]);else console.warn(r.error);
    },[]);

    React.useEffect(()=>{
      load();
      const ch=client.channel('nursing-procedures-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'nursing_procedure_requests'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[load]);

    const codeLabel=p=>`${p.charge_code?`${p.charge_code} · `:''}${p.service_name}`;
    const selectedItem=catalog.find(x=>String(x.id)===String(form.tariff_id));
    const selectedIsOther=String(selectedItem?.service_name||'').trim().toLowerCase()==='others';
    const patientName=id=>{const p=patients.find(x=>x.id===id);return p?(formalName(p)||p.full_name||p.patient_id||'Patient'):'—'};
    const procLabel=r=>`${r.procedure_code?`${r.procedure_code} · `:''}${r.procedure_name}`;

    async function submitRequest(e){
      e.preventDefault();
      if(!canRequest||busy)return;
      if(!form.patient_id||!form.tariff_id)return showSamaraActionToast('error','Nursing Procedure','Select a patient and a procedure.');
      if(selectedIsOther&&!form.remarks.trim())return showSamaraActionToast('error','Nursing Procedure','For "Others", write the procedure name in Remarks.');
      setBusy(true);
      const res=await client.rpc('request_nursing_procedure_v2',{
        p_patient_id:form.patient_id,p_tariff_id:form.tariff_id,
        p_scheduled_at:form.scheduled_at?new Date(form.scheduled_at).toISOString():null,
        p_remarks:form.remarks.trim()||null
      });
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Nursing Procedure',res.error.message);
      await writeAuditEvent('Request Nursing Procedure','NursingProcedureRequest',res.data,{patient_id:form.patient_id,charge_code:selectedItem?.charge_code||null});
      showSamaraActionToast('success','Request sent','Sent to the Nursing Manager for approval.');
      setForm({patient_id:'',tariff_id:'',scheduled_at:'',remarks:''});
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
      if(!confirm(`Confirm and start "${procLabel(row)}" for ${patientName(row.patient_id)}? This raises the matching Nursing Procedures charge for Accounts to verify.`))return;
      setBusy(true);
      const res=await client.rpc('start_nursing_procedure',{p_request_id:row.id});
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Nursing Procedure',res.error.message);
      await writeAuditEvent('Start Nursing Procedure','NursingProcedureRequest',row.id,{patient_id:row.patient_id,charge_request_id:res.data?.charge_request_id});
      showSamaraActionToast('success','Procedure started',`${row.procedure_name} started. The charge has been raised for Accounts verification.`);
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
            h('div',{className:'field'},h('label',null,'Procedure'),h('select',{value:form.tariff_id,onChange:e=>setForm({...form,tariff_id:e.target.value}),required:true,disabled:!catalog.length},
              h('option',{value:''},catalog.length?`Select procedure (${catalog.length})`:'No procedures available'),
              catalog.map(p=>h('option',{key:p.id,value:p.id},codeLabel(p)))),
              catalogError?h('small',{style:{color:'#b42318'}},catalogError)
                :!catalog.length&&h('small',{style:{color:'#b42318'}},'No active Nursing Procedures in Charge Master. Ask Admin to add them in Charge Master.')),
            h('div',{className:'field'},h('label',null,'Scheduled Date / Time'),h('input',{type:'datetime-local',value:form.scheduled_at,onChange:e=>setForm({...form,scheduled_at:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Remarks'),h('textarea',{rows:2,value:form.remarks,onChange:e=>setForm({...form,remarks:e.target.value}),placeholder:selectedIsOther?'Required for "Others": write the procedure name':'Any additional notes for the Nursing Manager'}))
          ),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Sending…':'Send Request')
        )
      ),
      canDecide&&h(Section,{title:`Pending Approval (${pending.length})`,subtitle:'Approve or decline each request. Once approved, the requesting nurse confirms and starts it.'},
        pending.length?h('div',{className:'stores-ledger-mobile'},pending.map(r=>h('article',{className:'stores-ledger-card',key:r.id},
          h('div',{className:'stores-ledger-card-head'},h('strong',null,procLabel(r)),statusPill(r.status)),
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
          h('div',{className:'stores-ledger-card-head'},h('strong',null,procLabel(r)),statusPill(r.status)),
          h('p',null,`${patientName(r.patient_id)} · Approved by ${r.decision_by_name||'—'} at ${formatDateTimeIN(r.decision_at)}`),
          r.scheduled_at&&h('p',null,`Scheduled: ${formatDateTimeIN(r.scheduled_at)}`),
          h('div',{style:{marginTop:'8px'}},h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>startProcedure(r)},'Confirm & Start'))
        ))):h('p',null,'No approved requests waiting to start.')
      ),
      h(LogTable,{title:'All Nursing Procedure Requests',subtitle:'Complete history: request, approval and start.',
        heads:['Patient','Procedure','Requested By / At','Scheduled','Status','Decision By / At','Started By / At'],
        rows:requests.map(r=>[
          patientName(r.patient_id),
          procLabel(r),
          `${r.requested_by_name||'—'} · ${formatDateTimeIN(r.requested_at)}`,
          r.scheduled_at?formatDateTimeIN(r.scheduled_at):'—',
          statusPill(r.status),
          r.decision_by_name?`${r.decision_by_name} · ${formatDateTimeIN(r.decision_at)}${r.decision_remarks?` · ${r.decision_remarks}`:''}`:'—',
          r.started_by_name?`${r.started_by_name} · ${formatDateTimeIN(r.started_at)}`:'—'
        ])
      }),
      canSeeList&&h(Section,{title:`Nursing Procedure List (${catalog.length})`,subtitle:'This is the list nurses choose from. It comes from Charge Master (category "Nursing Procedures", active items). To add, rename, deactivate or set the rate of a procedure, Admin edits it in Charge Master.'},
        catalogError?h('p',{style:{color:'#b42318'}},catalogError)
          :h(LogTable,{heads:['Code','Procedure'],rows:catalog.map(p=>[p.charge_code||'— (no code yet)',p.service_name])})
      )
    );
  }
