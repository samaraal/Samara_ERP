  // v2.14.61: "Approval Requests" (formerly Nursing Procedures).
  // Covers every Charge Master category that Admin has marked
  // "Needs Nursing Manager approval" (Nursing Procedures by default).
  // Nurse requests -> Admin / Nursing Manager approves or declines ->
  // Nurse confirms & starts -> the charge is raised for Accounts.
  // Nurses see code and name only, never the tariff amount.
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
    const emptyForm={patient_id:'',category:'',tariff_id:'',scheduled_at:'',remarks:''};
    const [form,setForm]=React.useState(emptyForm);

    const load=React.useCallback(async()=>{
      const [c,r]=await Promise.all([
        client.rpc('get_approval_catalog'),
        client.from('nursing_procedure_requests').select('*').order('requested_at',{ascending:false}).limit(300)
      ]);
      if(!c.error){setCatalog(c.data||[]);setCatalogError('')}
      else{console.warn(c.error);setCatalogError(/get_approval_catalog/i.test(c.error.message||'')?'Database update pending: run 152_charge_category_approval_routing.sql in Supabase.':c.error.message)}
      if(!r.error)setRequests(r.data||[]);else console.warn(r.error);
    },[]);

    React.useEffect(()=>{
      load();
      const ch=client.channel('approval-requests-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'nursing_procedure_requests'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[load]);

    const alpha=(a,b)=>{const x=String(a||'').trim(),y=String(b||'').trim();const xo=x.toLowerCase()==='others',yo=y.toLowerCase()==='others';if(xo!==yo)return xo?1:-1;return x.localeCompare(y,'en',{sensitivity:'base',numeric:true})};
    const categories=React.useMemo(()=>[...new Set(catalog.map(x=>x.category).filter(Boolean))].sort(alpha),[catalog]);
    React.useEffect(()=>{
      if(categories.length===1&&!form.category)setForm(f=>({...f,category:categories[0]}));
    },[categories]);
    const itemsForCategory=catalog.filter(x=>x.category===form.category).sort((a,b)=>alpha(a.service_name,b.service_name));
    const codeLabel=p=>`${p.charge_code?`${p.charge_code} · `:''}${p.service_name}`;
    const selectedItem=catalog.find(x=>String(x.id)===String(form.tariff_id));
    const selectedIsOther=String(selectedItem?.service_name||'').trim().toLowerCase()==='others';
    const patientName=id=>{const p=patients.find(x=>x.id===id);return p?(formalName(p)||p.full_name||p.patient_id||'Patient'):'—'};
    const itemLabel=r=>`${r.procedure_code?`${r.procedure_code} · `:''}${r.procedure_name}`;
    const categoryOf=r=>r.category||'Nursing Procedures';

    async function submitRequest(e){
      e.preventDefault();
      if(!canRequest||busy)return;
      if(!form.patient_id||!form.tariff_id)return showSamaraActionToast('error','Approval Request','Select the patient, category and item.');
      if(selectedIsOther&&!form.remarks.trim())return showSamaraActionToast('error','Approval Request','For "Others", write the item name in Remarks.');
      setBusy(true);
      const res=await client.rpc('request_approval_item',{
        p_patient_id:form.patient_id,p_tariff_id:form.tariff_id,
        p_scheduled_at:form.scheduled_at?new Date(form.scheduled_at).toISOString():null,
        p_remarks:form.remarks.trim()||null
      });
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Approval Request',res.error.message);
      await writeAuditEvent('Request Approval Item','NursingProcedureRequest',res.data,{patient_id:form.patient_id,category:selectedItem?.category||null,charge_code:selectedItem?.charge_code||null});
      showSamaraActionToast('success','Request sent','Sent to the Nursing Manager for approval.');
      setForm({...emptyForm,category:categories.length===1?categories[0]:''});
      load();
    }

    async function decide(row,decision){
      if(!canDecide||busy)return;
      let remarks=null;
      if(decision==='Declined'){remarks=prompt('Reason for declining (optional):','');if(remarks===null)return;}
      setBusy(true);
      const res=await client.rpc('decide_nursing_procedure_request',{p_request_id:row.id,p_decision:decision,p_remarks:remarks||null});
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Approval Request',res.error.message);
      await writeAuditEvent(decision==='Approved'?'Approve Approval Request':'Decline Approval Request','NursingProcedureRequest',row.id,{patient_id:row.patient_id,category:categoryOf(row)});
      showSamaraActionToast('success','Approval Request',`Request ${decision.toLowerCase()}.`);
      load();
    }

    async function startItem(row){
      if(!canStart||busy)return;
      if(!confirm(`Confirm and start "${itemLabel(row)}" (${categoryOf(row)}) for ${patientName(row.patient_id)}? This raises the matching charge for Accounts to verify.`))return;
      setBusy(true);
      const res=await client.rpc('start_nursing_procedure',{p_request_id:row.id});
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Approval Request',res.error.message);
      await writeAuditEvent('Start Approved Item','NursingProcedureRequest',row.id,{patient_id:row.patient_id,category:categoryOf(row),charge_request_id:res.data?.charge_request_id});
      showSamaraActionToast('success','Started',`${row.procedure_name} started. The charge has been raised for Accounts verification.`);
      load();
    }

    const pending=requests.filter(x=>x.status==='Requested');
    const readyToStart=requests.filter(x=>x.status==='Approved');
    const statusPill=status=>h('span',{style:{fontWeight:800,fontSize:'12px',padding:'4px 8px',borderRadius:'999px',display:'inline-block',
      background:status==='Requested'?'#fff4dc':status==='Approved'?'#e3f2ff':status==='Started'?'#e7f6ef':status==='Declined'?'#fdebec':'#f1f1f1',
      color:'#5d3146'}},status);
    const cardHead=r=>h('div',{className:'stores-ledger-card-head'},h('strong',null,`${categoryOf(r)} · ${itemLabel(r)}`),statusPill(r.status));

    return h('div',null,
      canRequest&&h(Section,{title:'Request Approval',subtitle:'For items that need Nursing Manager approval before they are done and charged. Everything else is raised from Bills & Charges.'},
        h('form',{onSubmit:submitRequest},
          h('div',{className:'grid two'},
            patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v})),
            h('div',{className:'field'},h('label',null,'Category'),h('select',{value:form.category,onChange:e=>setForm({...form,category:e.target.value,tariff_id:''}),required:true,disabled:!categories.length},
              h('option',{value:''},categories.length?'Select category':'No approval categories'),
              categories.map(c=>h('option',{key:c,value:c},`${c} (${catalog.filter(x=>x.category===c).length})`))),
              catalogError?h('small',{style:{color:'#b42318'}},catalogError)
                :!categories.length&&h('small',{style:{color:'#b42318'}},'No category currently needs approval, or it has no active items in Charge Master.')),
            h('div',{className:'field'},h('label',null,'Item'),h('select',{value:form.tariff_id,onChange:e=>setForm({...form,tariff_id:e.target.value}),required:true,disabled:!form.category},
              h('option',{value:''},form.category?`Select item (${itemsForCategory.length})`:'Select a category first'),
              itemsForCategory.map(p=>h('option',{key:p.id,value:p.id},codeLabel(p))))),
            h('div',{className:'field'},h('label',null,'Scheduled Date / Time'),h('input',{type:'datetime-local',value:form.scheduled_at,onChange:e=>setForm({...form,scheduled_at:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Remarks'),h('textarea',{rows:2,value:form.remarks,onChange:e=>setForm({...form,remarks:e.target.value}),placeholder:selectedIsOther?'Required for "Others": write the item name':'Any additional notes for the Nursing Manager'}))
          ),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Sending…':'Send Request')
        )
      ),
      canDecide&&h(Section,{title:`Pending Approval (${pending.length})`,subtitle:'Approve or decline each request. Once approved, the nurse confirms and starts it.'},
        pending.length?h('div',{className:'stores-ledger-mobile'},pending.map(r=>h('article',{className:'stores-ledger-card',key:r.id},
          cardHead(r),
          h('p',null,`${patientName(r.patient_id)} · Requested by ${r.requested_by_name||'—'} at ${formatDateTimeIN(r.requested_at)}`),
          r.scheduled_at&&h('p',null,`Scheduled: ${formatDateTimeIN(r.scheduled_at)}`),
          r.remarks&&h('p',null,`Remarks: ${r.remarks}`),
          h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'8px'}},
            h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>decide(r,'Approved')},'Approve'),
            h('button',{className:'btn btn-danger',disabled:busy,onClick:()=>decide(r,'Declined')},'Decline')
          )
        ))):h('p',null,'No pending requests.')
      ),
      canStart&&h(Section,{title:`Approved — Ready to Start (${readyToStart.length})`,subtitle:'Confirm you are about to do it. This raises the matching charge for Accounts.'},
        readyToStart.length?h('div',{className:'stores-ledger-mobile'},readyToStart.map(r=>h('article',{className:'stores-ledger-card',key:r.id},
          cardHead(r),
          h('p',null,`${patientName(r.patient_id)} · Approved by ${r.decision_by_name||'—'} at ${formatDateTimeIN(r.decision_at)}`),
          r.scheduled_at&&h('p',null,`Scheduled: ${formatDateTimeIN(r.scheduled_at)}`),
          h('div',{style:{marginTop:'8px'}},h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>startItem(r)},'Confirm & Start'))
        ))):h('p',null,'No approved requests waiting to start.')
      ),
      h(LogTable,{title:'All Approval Requests',subtitle:'Complete history: request, approval and start.',
        heads:['Patient','Category','Item','Requested By / At','Scheduled','Status','Decision By / At','Started By / At'],
        rows:requests.map(r=>[
          patientName(r.patient_id),
          categoryOf(r),
          itemLabel(r),
          `${r.requested_by_name||'—'} · ${formatDateTimeIN(r.requested_at)}`,
          r.scheduled_at?formatDateTimeIN(r.scheduled_at):'—',
          statusPill(r.status),
          r.decision_by_name?`${r.decision_by_name} · ${formatDateTimeIN(r.decision_at)}${r.decision_remarks?` · ${r.decision_remarks}`:''}`:'—',
          r.started_by_name?`${r.started_by_name} · ${formatDateTimeIN(r.started_at)}`:'—'
        ])
      }),
      canSeeList&&h(Section,{title:`Items Needing Approval (${catalog.length})`,subtitle:'Comes from Charge Master: every active item in a category Admin has marked "Needs Nursing Manager approval". Admin changes items and categories in Charge Master.'},
        catalogError?h('p',{style:{color:'#b42318'}},catalogError)
          :h(LogTable,{heads:['Category','Code','Item'],rows:[...catalog].sort((a,b)=>alpha(a.category,b.category)||alpha(a.service_name,b.service_name)).map(p=>[p.category,p.charge_code||'— (no code yet)',p.service_name])})
      )
    );
  }
