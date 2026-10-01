  // v2.14.80: cards use 'approval-request-cards' (visible on every screen size).
  // They used 'stores-ledger-mobile', which is hidden above 760px, so on
  // Windows / desktop the Nurse's 'Confirm & Start' and the Nursing Manager's
  // Approve / Decline buttons were not shown.
  // v2.14.61: "Approval Requests" (formerly Nursing Procedures).
  // Covers every Charge Master category that Admin has marked
  // "Needs Nursing Manager approval" (Nursing Procedures by default).
  // Nurse requests -> Admin / Nursing Manager approves or declines ->
  // Nurse confirms & starts -> the charge is raised for Accounts.
  // Nurses see code and name only, never the tariff amount.
  function NursingProcedures({profile,initialCategory="",initialRequest=false,initialEquipment=""}){
    const canRequest=profile?.role==='Nurse';
    const canDecide=['Admin','Manager'].includes(profile?.role);
    const canSeeList=['Admin','Manager'].includes(profile?.role);
    const canStart=profile?.role==='Nurse';
    const [patients]=usePatients();
    const [catalog,setCatalog]=React.useState([]);
    const [catalogError,setCatalogError]=React.useState('');
    const [requests,setRequests]=React.useState([]);
    const [busy,setBusy]=React.useState(false);
    const [requestError,setRequestError]=React.useState('');
    const [box,setBox]=React.useState('open');
    const [search,setSearch]=React.useState('');
    const [filterCategory,setFilterCategory]=React.useState('');
    const [period,setPeriod]=React.useState('all');
    const [detailId,setDetailId]=React.useState(null);
    const filters=useAppliedFilters({search,category:filterCategory,period});
    const emptyForm={patient_id:'',category:'',tariff_id:'',scheduled_at:'',remarks:''};
    const [form,setForm]=React.useState({...emptyForm,category:initialCategory,tariff_id:initialEquipment});
    const [showRequest,setShowRequest]=React.useState(initialRequest);
    const [equipment,setEquipment]=React.useState([]);
    const [equipmentError,setEquipmentError]=React.useState('');
    const requestToken=React.useRef(null);
    const submitLock=React.useRef(false);
    const isEquipment=form.category==='Biomedical Equipment';
    React.useEffect(()=>{if(!canRequest)return;client.rpc('bme_clinical_equipment').then(r=>{if(r.error)setEquipmentError(r.error.message);else{setEquipment(r.data||[]);setEquipmentError('')}})},[canRequest,showRequest]);

    const load=React.useCallback(async()=>{
      const [c,r]=await Promise.all([
        client.rpc('get_approval_catalog'),
        client.from('nursing_procedure_requests').select('*').order('requested_at',{ascending:false}).limit(300)
      ]);
      if(!c.error){setCatalog(c.data||[]);setCatalogError('')}
      else{console.warn(c.error);setCatalogError(/get_approval_catalog/i.test(c.error.message||'')?'Database update pending: run 152_charge_category_approval_routing.sql in Supabase.':c.error.message)}
      if(!r.error){setRequests(r.data||[]);setRequestError('')}else{console.warn(r.error);setRequestError(r.error.message||'Unable to load approval requests. Please refresh.')}
    },[]);

    React.useEffect(()=>{
      load();
      const ch=client.channel('approval-requests-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'nursing_procedure_requests'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[load]);

    const alpha=(a,b)=>{const x=String(a||'').trim(),y=String(b||'').trim();const xo=x.toLowerCase()==='others',yo=y.toLowerCase()==='others';if(xo!==yo)return xo?1:-1;return x.localeCompare(y,'en',{sensitivity:'base',numeric:true})};
    const categories=React.useMemo(()=>[...new Set(['Biomedical Equipment',...catalog.map(x=>x.category).filter(Boolean)])].sort(alpha),[catalog]);
    React.useEffect(()=>{
      if(categories.length===1&&!form.category)setForm(f=>({...f,category:categories[0]}));
    },[categories]);
    const equipmentItems=equipment.filter(x=>x.status==='Available'&&!x.fault_reported).map(x=>({id:x.id,charge_code:x.asset_no,service_name:x.equipment_name}));
    const itemsForCategory=isEquipment?equipmentItems:catalog.filter(x=>x.category===form.category).sort((a,b)=>alpha(a.service_name,b.service_name));
    const codeLabel=p=>`${p.charge_code?`${p.charge_code} · `:''}${p.service_name}`;
    const selectedItem=catalog.find(x=>String(x.id)===String(form.tariff_id));
    const selectedIsOther=String(selectedItem?.service_name||'').trim().toLowerCase()==='others';
    const patientName=id=>{const p=patients.find(x=>x.id===id);return p?(formalName(p)||p.full_name||p.patient_id||'Patient'):'—'};
    const itemLabel=r=>`${r.procedure_code?`${r.procedure_code} · `:''}${r.procedure_name}`;
    const categoryOf=r=>r.category||'Nursing Procedures';

    async function submitRequest(e){
      e.preventDefault();
      if(!canRequest||busy||submitLock.current)return;
      if(!form.patient_id||!form.tariff_id)return showSamaraActionToast('error','Approval Request','Select the patient, category and item.');
      if(selectedIsOther&&!form.remarks.trim())return showSamaraActionToast('error','Approval Request','For "Others", write the item name in Remarks.');
      submitLock.current=true;setBusy(true);
      try{
        const signature=JSON.stringify(form);
        if(requestToken.current?.signature!==signature)requestToken.current={signature,id:crypto.randomUUID()};
        const res=isEquipment?await client.rpc('bme_request_start',{
          p_id:requestToken.current.id,p_equipment_id:form.tariff_id,p_patient_id:form.patient_id,
          p_scheduled_at:form.scheduled_at?new Date(form.scheduled_at).toISOString():null,p_remarks:form.remarks.trim()||null
        }):await client.rpc('request_approval_item',{
          p_patient_id:form.patient_id,p_tariff_id:form.tariff_id,
          p_scheduled_at:form.scheduled_at?new Date(form.scheduled_at).toISOString():null,p_remarks:form.remarks.trim()||null
        });
        if(res.error)throw res.error;
        requestToken.current=null;
        await writeAuditEvent('Request Approval Item','NursingProcedureRequest',res.data,{patient_id:form.patient_id,category:form.category});
        showSamaraActionToast('success','Request sent','Sent to the Nursing Manager for approval.');
        setForm({...emptyForm});setShowRequest(false);setBox('Requested');await load();
      }catch(error){showSamaraActionToast('error','Approval Request',/bme_request_start/.test(error.message||'')?'Install SQL 185 to enable Biomedical Equipment approval requests.':error.message)}
      finally{submitLock.current=false;setBusy(false)}
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
      if(!confirm(`Confirm and start "${itemLabel(row)}" (${categoryOf(row)}) for ${patientName(row.patient_id)}? ${row.category==='Biomedical Equipment'?'This issues the approved equipment to the resident. Charges remain in the equipment billing workflow.':'This raises the matching charge for Accounts to verify.'}`))return;
      setBusy(true);
      const res=await client.rpc('start_nursing_procedure',{p_request_id:row.id});
      setBusy(false);
      if(res.error)return showSamaraActionToast('error','Approval Request',res.error.message);
      await writeAuditEvent('Start Approved Item','NursingProcedureRequest',row.id,{patient_id:row.patient_id,category:categoryOf(row),charge_request_id:res.data?.charge_request_id});
      showSamaraActionToast('success','Started',row.category==='Biomedical Equipment'?`${row.procedure_name} started and recorded in the equipment register.`:`${row.procedure_name} started. The charge has been raised for Accounts verification.`);
      load();
    }

    const stages=[['open','Open Requests','📂','#a91360'],['Requested','Pending Approval','⏳','#bd5500'],['Approved','Ready to Start','▶','#2453d6'],['Started','Started','✅','#16733b'],['Declined','Declined','↩','#c42140'],['all','All Requests','📋','#5b4a55']];
    const matchesBox=(r,k)=>k==='all'||(k==='open'?['Requested','Approved'].includes(r.status):r.status===k);
    const dayIST=value=>{const d=new Date(value);return value&&!isNaN(d)?new Date(d.getTime()+19800000).toISOString().slice(0,10):''};
    const today=dayIST(new Date());
    const weekStart=new Date(Date.parse(today+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
    const filtered=requests.filter(r=>{
      const p=patients.find(p=>p.id===r.patient_id)||{};
      const q=filters.applied.search.trim().toLowerCase();
      const date=dayIST(r.requested_at),period=filters.applied.period;
      return (!q||[patientName(r.patient_id),p.patient_id,p.room_number,itemLabel(r),categoryOf(r),r.requested_by_name].join(' ').toLowerCase().includes(q))
        &&(!filters.applied.category||categoryOf(r)===filters.applied.category)
        &&(period==='all'||(period==='today'?date===today:period==='week'?date>=weekStart&&date<=today:date.slice(0,7)===today.slice(0,7)&&date<=today));
    });
    const visible=filtered.filter(r=>matchesBox(r,box));
    const detail=requests.find(r=>r.id===detailId);
    const filterCategories=[...new Set([...categories,...requests.map(categoryOf)])].sort(alpha);
    const statusPill=status=>h('span',{className:'dr-stage-pill',style:{color:stages.find(s=>s[0]===status)?.[3]||'#5b4a55'}},status==='Requested'?'Pending Approval':status==='Approved'?'Ready to Start':status);
    const actionButtons=r=>h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}},
      canDecide&&r.status==='Requested'&&h(React.Fragment,null,
        h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>decide(r,'Approved')},busy?'Saving…':'Approve'),
        h('button',{className:'btn btn-danger',disabled:busy,onClick:()=>decide(r,'Declined')},'Decline')),
      canStart&&r.status==='Approved'&&h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>startItem(r)},busy?'Starting…':'Confirm & Start'));
    return h('div',{className:'approval-workspace'},
      h('div',{className:'card panel dr-head'},h('div',{className:'dr-head-text'},
        h('h2',null,'Approval Requests'),h('small',null,'Nursing request → Management approval → Nurse confirms & starts'),
        h('p',{className:'small-note'},canDecide?'Open a request to approve or decline. Once approved, the nurse confirms and starts it.':'Request approval before starting care or equipment. Equipment use is recorded in its register; procedure starts raise charges for Accounts.')),
        canRequest&&h('button',{className:'btn btn-primary',type:'button',onClick:()=>setShowRequest(v=>!v)},showRequest?'Close Request':'＋ Make a Request')),
      h('div',{className:'dr-boxes'},stages.map(([key,label,icon,color])=>h('button',{key,type:'button',className:'dr-box '+(box===key?'selected':''),'aria-pressed':box===key,style:{'--dr-c':color},onClick:()=>setBox(key)},
        h('span',{className:'dr-box-icon','aria-hidden':true},icon),h('span',{className:'dr-box-label'},label),h('b',{className:'dr-box-count'},filtered.filter(r=>matchesBox(r,key)).length)))),
      requestError&&h('div',{className:'message error',role:'alert'},requestError),
      canRequest&&showRequest&&h(Section,{title:'Make a Request',subtitle:'Select a resident and item. Biomedical Equipment needs Nursing Manager approval before the nurse can confirm and start it.'},
        h('form',{onSubmit:submitRequest},
          h('div',{className:'grid two'},
            patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v})),
            h('div',{className:'field'},h('label',null,'Category'),h('select',{value:form.category,onChange:e=>setForm({...form,category:e.target.value,tariff_id:''}),required:true,disabled:!categories.length},
              h('option',{value:''},categories.length?'Select category':'No approval categories'),
              categories.map(c=>h('option',{key:c,value:c},c==='Biomedical Equipment'?c:`${c} (${catalog.filter(x=>x.category===c).length})`))),
              catalogError?h('small',{style:{color:'#b42318'}},catalogError)
                :!categories.length&&h('small',{style:{color:'#b42318'}},'No category currently needs approval, or it has no active items in Charge Master.')),
            h('div',{className:'field'},h('label',null,isEquipment?'Equipment piece':'Item'),h('select',{value:form.tariff_id,onChange:e=>setForm({...form,tariff_id:e.target.value}),required:true,disabled:!form.category},
              h('option',{value:''},form.category?`Select item (${itemsForCategory.length})`:'Select a category first'),
              itemsForCategory.map(p=>h('option',{key:p.id,value:p.id},codeLabel(p))))),
            h('div',{className:'field'},h('label',null,'Scheduled Date / Time'),h('input',{type:'datetime-local',value:form.scheduled_at,onChange:e=>setForm({...form,scheduled_at:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Remarks'),h('textarea',{rows:2,value:form.remarks,onChange:e=>setForm({...form,remarks:e.target.value}),placeholder:selectedIsOther?'Required for "Others": write the item name':'Any additional notes for the Nursing Manager'}))
          ),
          isEquipment&&h('p',{className:'small-note'},equipmentError||(!equipmentItems.length?'No available equipment. Ask Stores to register or return a piece.':'Only available equipment without reported faults is listed. Approval does not reserve a piece; availability is checked again on start.')),
          h('button',{className:'btn btn-primary',disabled:busy||(isEquipment&&!equipmentItems.length)},busy?'Sending…':'Send Request')
        )
      ),
      h('div',{className:'card panel dr-register'},
        h('div',{className:'dr-register-head'},h('div',null,h('h3',null,`Approval Register (${visible.length})`),
          h('small',null,`${stages.find(s=>s[0]===box)?.[1]} · ${filters.applied.period==='all'?'All dates':filters.applied.period==='today'?'Today (IST)':filters.applied.period==='week'?'Last 7 days (IST)':'This month (IST)'} · open a row for full details`),
          requests.length===300&&h('small',{style:{display:'block'}},'Showing the latest 300 requests; counts and filters apply to these records.'))),
        h('div',{className:'dr-filters'},
          h('div',{className:'field dr-filter-search'},h('label',{htmlFor:'approval-search'},'Search Guest / Item'),h('input',{id:'approval-search',type:'search',value:search,placeholder:'Name, Resident ID, item or requester',onChange:e=>setSearch(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){filters.apply();setBox('all')}}})),
          h('div',{className:'field'},h('label',{htmlFor:'approval-category'},'Category'),h('select',{id:'approval-category',value:filterCategory,onChange:e=>setFilterCategory(e.target.value)},h('option',{value:''},'All categories'),filterCategories.map(c=>h('option',{key:c,value:c},c)))),
          h('div',{className:'field'},h('label',{htmlFor:'approval-period'},'Request period'),h('select',{id:'approval-period',value:period,onChange:e=>setPeriod(e.target.value)},[['all','All dates'],['today','Today'],['week','Last 7 days'],['month','This month']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          h(ApplyFilterButton,{dirty:filters.dirty,onApply:()=>{filters.apply();setBox('all')}})),
        h('div',{className:'table-wrap'},h('table',{className:'table dr-table approval-table'},
          h('thead',null,h('tr',null,['Guest','Category / Item','Requested','Scheduled','Status','Action'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,visible.map(r=>h('tr',{key:r.id,className:'row-clickable',tabIndex:0,onClick:()=>setDetailId(r.id),onKeyDown:e=>{if(e.target===e.currentTarget&&['Enter',' '].includes(e.key)){e.preventDefault();setDetailId(r.id)}}},
            h('td',{'data-label':'Guest'},h('strong',null,patientName(r.patient_id))),
            h('td',{'data-label':'Category / Item'},itemLabel(r),h('small',{className:'dr-sub'},categoryOf(r))),
            h('td',{'data-label':'Requested'},r.requested_by_name||'—',h('small',{className:'dr-sub'},formatDateTimeIN(r.requested_at))),
            h('td',{'data-label':'Scheduled'},r.scheduled_at?formatDateTimeIN(r.scheduled_at):'—'),
            h('td',{'data-label':'Status'},statusPill(r.status)),
            h('td',{'data-label':'Action'},h('button',{className:'btn btn-secondary',onClick:e=>{e.stopPropagation();setDetailId(r.id)}},canDecide&&r.status==='Requested'?'Review':canStart&&r.status==='Approved'?'Open / Start':'View')))),
            !visible.length&&h('tr',null,h('td',{colSpan:6,className:'empty'},requestError?'Requests could not be loaded. Please refresh.':box==='open'?'No open requests match these filters.':'No requests match these filters.',
              box!=='all'&&filtered.length>0&&h('button',{className:'btn btn-secondary',style:{marginLeft:8},onClick:()=>setBox('all')},`Show all requests (${filtered.length})`))))))),
      canSeeList&&h('details',{className:'card panel dr-collapse'},
        h('summary',null,h('strong',null,`Items Needing Approval (${catalog.length})`),h('small',null,' — categories and items configured in Charge Master')),
        catalogError?h('p',{style:{color:'#b42318'}},catalogError):h(LogTable,{heads:['Category','Code','Item'],rows:[...catalog].sort((a,b)=>alpha(a.category,b.category)||alpha(a.service_name,b.service_name)).map(p=>[p.category,p.charge_code||'—',p.service_name])})),
      detail&&h(RowDetailModal,{title:patientName(detail.patient_id),subtitle:itemLabel(detail),onClose:()=>setDetailId(null),fields:[
        ['Category',categoryOf(detail)],['Equipment asset',detail.equipment_id?detail.procedure_code:null],['Status',statusPill(detail.status)],['Requested by',detail.requested_by_name||'—'],['Requested at',formatDateTimeIN(detail.requested_at)],
        ['Scheduled',detail.scheduled_at?formatDateTimeIN(detail.scheduled_at):'Not scheduled'],['Request remarks',detail.remarks],
        ['Decision by',detail.decision_by_name],['Decision at',detail.decision_at?formatDateTimeIN(detail.decision_at):null],['Decision remarks',detail.decision_remarks],
        ['Started by',detail.started_by_name],['Started at',detail.started_at?formatDateTimeIN(detail.started_at):null]
      ]},actionButtons(detail))
    );
  }

