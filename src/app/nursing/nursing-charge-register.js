  // v2.14.48: view-only Charge Register for the Nursing Manager (and Admin).
  // Shows every charge raised by Nursing with Accounts' decision and the
  // approved rate, with filters. No raise / approve / reject actions live
  // here — that stays on the existing Charge Approvals page. Read-only, so
  // it needs no new RLS: bill_charge_requests already grants SELECT to the
  // 'Manager' role (see 41_bills_charges_workflow.sql).
  function NursingChargeRegister({profile}){
    const canView=profile?.role==='Admin'||isNursingManagerProfile(profile);
    const [patients]=usePatients();
    const [rows,setRows]=React.useState([]);
    const [filter,setFilter]=React.useState({status:'All',category:'All',patient_id:'',raised_by:'All',from:'',to:''});

    const load=React.useCallback(async()=>{
      const r=await client.from('bill_charge_requests').select('*').order('charge_date',{ascending:false}).order('created_at',{ascending:false}).limit(2000);
      if(!r.error)setRows(r.data||[]);else console.warn(r.error);
    },[]);

    React.useEffect(()=>{
      if(!canView)return;
      load();
      const ch=client.channel('nursing-charge-register-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'bill_charge_requests'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[load,canView]);

    if(!canView)return h(Section,{title:'Charge Register'},h('p',null,'Admin / Nursing Manager access only.'));

    const pFor=id=>patients.find(p=>p.id===id)||{};
    const pLabel=id=>{const p=pFor(id);return p.id?`${formalName(p)} · ${p.patient_id||'—'} · Room ${p.room_no||'—'}-${p.bed_no||'—'}`:'—'};
    const money=v=>v!==null&&v!==undefined&&v!==''?`₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—';
    const statusOf=r=>r.approval_status||'Pending';
    const statusLabel=s=>s==='Rejected'?'Returned':s;
    const today=todayISOIndia();

    const categories=React.useMemo(()=>[...new Set(rows.map(r=>r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[rows]);
    const raisers=React.useMemo(()=>[...new Set(rows.map(r=>r.raised_by_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[rows]);
    const patientsWithCharges=React.useMemo(()=>{
      const ids=new Set(rows.map(r=>r.patient_id).filter(Boolean));
      return patients.filter(p=>ids.has(p.id)).sort((a,b)=>String(formalName(a)||'').localeCompare(String(formalName(b)||'')));
    },[rows,patients]);

    const setPeriod=(from,to)=>setFilter(current=>({...current,from,to}));
    const clearFilters=()=>setFilter({status:'All',category:'All',patient_id:'',raised_by:'All',from:'',to:''});

    const filtered=rows.filter(r=>
      (filter.status==='All'||statusOf(r)===filter.status)&&
      (filter.category==='All'||r.category===filter.category)&&
      (!filter.patient_id||r.patient_id===filter.patient_id)&&
      (filter.raised_by==='All'||r.raised_by_name===filter.raised_by)&&
      (!filter.from||r.charge_date>=filter.from)&&
      (!filter.to||r.charge_date<=filter.to)
    );

    const pending=rows.filter(r=>statusOf(r)==='Pending').length;
    const approvedCount=rows.filter(r=>['Approved','Partially Approved'].includes(statusOf(r))).length;
    const returnedCount=rows.filter(r=>statusOf(r)==='Rejected').length;
    const approvedValue=rows.filter(r=>['Approved','Partially Approved'].includes(statusOf(r)))
      .reduce((sum,r)=>sum+(Number(r.approved_amount??r.final_amount)||0),0);

    const statCard=(label,value,active,onClick)=>h('button',{type:'button',className:'card stat',onClick,style:{
      textAlign:'left',cursor:'pointer',width:'100%',border:'1px solid #e8c3d2',
      background:active?'linear-gradient(135deg,#f9dce8,#fff7fa)':'linear-gradient(145deg,#fffafd,#fdf1f6)',
      boxShadow:active?'0 8px 20px rgba(166,16,78,.12)':'0 4px 12px rgba(109,24,61,.05)'
    }},h('span',null,label),h('strong',null,value));

    const heads=['Date','Patient','Category','Service','Qty','Status','Requested Amount','Approved Amount','Raised By','Decision By','Decision Time','Remarks'];
    const tableRows=filtered.map(r=>[
      formatDateIN(r.charge_date),pLabel(r.patient_id),r.category||'—',
      `${r.charge_item_code?`${r.charge_item_code} · `:''}${r.service_name||r.description||'—'}`,
      `${r.quantity||1} ${r.unit||''}`,
      h('span',{className:'badge'},statusLabel(statusOf(r))),
      money(r.requested_amount??r.unit_cost),
      money(r.approved_amount??r.final_amount),
      r.raised_by_name||'—',
      r.decision_by_name||'—',
      r.decision_at?fmt(r.decision_at):'—',
      r.decision_remarks||r.approval_remarks||r.remarks||'—'
    ]);

    return h(React.Fragment,null,
      h(Section,{title:'Charge Register',subtitle:"View only — every charge Nursing has raised, with Accounts' decision and the approved rate. Charges cannot be raised, edited or decided from this page."},
        h('div',{className:'grid stats',style:{marginBottom:'14px'}},
          statCard('All Charges',rows.length,filter.status==='All',()=>setFilter(f=>({...f,status:'All'}))),
          statCard('Pending',pending,filter.status==='Pending',()=>setFilter(f=>({...f,status:'Pending'}))),
          statCard('Approved',approvedCount,filter.status==='Approved',()=>setFilter(f=>({...f,status:'Approved'}))),
          statCard('Returned',returnedCount,filter.status==='Rejected',()=>setFilter(f=>({...f,status:'Rejected'}))),
          statCard('Approved Value',money(approvedValue),false,()=>{})
        ),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'10px',marginBottom:'12px'}},
          h('div',{className:'field',style:{margin:0}},h('label',null,'Status'),h('select',{value:filter.status,onChange:e=>setFilter({...filter,status:e.target.value})},
            ['All','Pending','Approved','Partially Approved','Rejected'].map(s=>h('option',{key:s,value:s},statusLabel(s))))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Category'),h('select',{value:filter.category,onChange:e=>setFilter({...filter,category:e.target.value})},
            h('option',{value:'All'},'All'),categories.map(c=>h('option',{key:c,value:c},c)))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Patient'),h('select',{value:filter.patient_id,onChange:e=>setFilter({...filter,patient_id:e.target.value})},
            h('option',{value:''},'All'),patientsWithCharges.map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)} · ${p.patient_id||'—'}`)))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Raised By'),h('select',{value:filter.raised_by,onChange:e=>setFilter({...filter,raised_by:e.target.value})},
            h('option',{value:'All'},'All'),raisers.map(n=>h('option',{key:n,value:n},n)))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'From'),h('input',{type:'date',value:filter.from,max:filter.to||today,onChange:e=>setFilter({...filter,from:e.target.value})})),
          h('div',{className:'field',style:{margin:0}},h('label',null,'To'),h('input',{type:'date',value:filter.to,min:filter.from||undefined,max:today,onChange:e=>setFilter({...filter,to:e.target.value})}))
        ),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPeriod(today,today)},'Today'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPeriod(mondayOfWeek(today),today)},'This Week'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPeriod(`${today.slice(0,7)}-01`,today)},'This Month'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:clearFilters},'Clear Filters')
        )
      ),
      h(LogTable,{title:`Charges (${filtered.length})`,heads,rows:tableRows})
    );
  }
