  // 2.17.5: Outside Bills — bills Samara pays outside for a Guest (SQL 247).
  // outsideSaveFamilyLinks / outsideFillMissingFamilyLinks keep a long-lived link to each bill photo / PDF so the
  // Family Portal can show the original bill (the family RPC returns links only for that family's own Guest).
  // OutsideBillsRegister (Accounts / Admin, inside Bills & Charges): who paid, handling fee, payable to vendor → Mark Paid.
  const OUTSIDE_LINK_SECONDS=365*24*3600;
  async function outsideSaveFamilyLinks(requestId,files){
    try{
      const links=[];
      for(const f of files||[]){
        const r=await client.storage.from('patient-documents').createSignedUrl(f.path,OUTSIDE_LINK_SECONDS);
        if(!r.error&&r.data?.signedUrl)links.push({path:f.path,name:f.name||'Bill',url:r.data.signedUrl,expires_at:new Date(Date.now()+OUTSIDE_LINK_SECONDS*1000-86400000).toISOString()});
      }
      if(links.length)await client.rpc('outside_bill_save_family_links',{p_request_id:requestId,p_links:links});
    }catch(e){console.warn('Outside bill family link not saved yet (will retry automatically)',e)}
  }
  let outsideLinkSweepAt=0;
  async function outsideFillMissingFamilyLinks(){
    if(Date.now()-outsideLinkSweepAt<60000)return;outsideLinkSweepAt=Date.now();
    try{
      const {data,error}=await client.rpc('outside_bill_files_needing_links');
      if(error||!Array.isArray(data)||!data.length)return;
      const byReq=new Map();data.forEach(x=>{const k=String(x.request_id);if(!byReq.has(k))byReq.set(k,[]);byReq.get(k).push({path:x.storage_path,name:x.document_name})});
      for(const [id,files] of byReq)await outsideSaveFamilyLinks(id,files);
    }catch(e){console.warn('Outside bill link check skipped',e)}
  }
  async function outsideViewBill(requestId){
    const {data,error}=await client.from('patient_documents').select('storage_path,document_name').eq('remarks',`Clinical charge ${requestId}`);
    if(error||!data?.length){showSamaraActionToast('error','Bill not found',error?.message||'No bill photo / PDF is attached to this entry.');return}
    for(const d of data){
      const r=await client.storage.from('patient-documents').createSignedUrl(d.storage_path,180);
      if(r.error){showSamaraActionToast('error','Bill could not be opened',r.error.message);return}
      window.open(r.data.signedUrl,'_blank','noopener,noreferrer');
    }
  }
  function OutsideBillsRegister({profile,patients,pLabel,refreshKey}){
    const [rows,setRows]=React.useState(null),[error,setError]=React.useState(''),[detail,setDetail]=React.useState(null),[pay,setPay]=React.useState(null),[busy,setBusy]=React.useState(false);
    const today=todayISOIndia();
    const [period,setPeriod]=React.useState('month'),[month,setMonth]=React.useState(today.slice(0,7)),[from,setFrom]=React.useState(today),[to,setTo]=React.useState(today);
    const [status,setStatus]=React.useState('All'),[patient,setPatient]=React.useState(''),[search,setSearch]=React.useState('');
    const filters=useAppliedFilters({period,month,from,to,status,patient,search});const F=filters.applied;
    const money=v=>`₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    async function load(){
      const all=[];
      for(let offset=0;;offset+=500){
        const r=await client.from('bill_charge_requests').select('*').not('outside_paid_by','is',null).order('charge_date',{ascending:false}).order('created_at',{ascending:false}).range(offset,offset+499);
        if(r.error){setError(/outside_paid_by/i.test(r.error.message||'')?'Database update pending: run SQL 247_outside_services_paid_by_samara.sql in Supabase.':r.error.message);setRows([]);return}
        all.push(...(r.data||[]));if((r.data||[]).length<500)break;
      }
      setError('');setRows(all);
    }
    React.useEffect(()=>{load()},[refreshKey]);
    const stage=r=>{
      const a=r.approval_status||'Pending';
      if(a==='Rejected')return 'Rejected';
      if(a==='Pending')return 'Awaiting Accounts';
      if(r.outside_paid_by==='Family paid directly')return 'Family paid (record)';
      return r.outside_payable_status==='Payable'?'Payable to vendor':'Paid by Samara';
    };
    let pFrom='',pTo='';
    if(F.period==='today')pFrom=pTo=today;
    else if(F.period==='week'){pFrom=mondayOfWeek(today);pTo=today;}
    else if(F.period==='month'&&/^\d{4}-\d{2}$/.test(F.month)){pFrom=F.month+'-01';const [y,m]=F.month.split('-').map(Number);pTo=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
    else if(F.period==='custom'){pFrom=F.from;pTo=F.to;}
    const badPeriod=F.period==='custom'&&(!pFrom||!pTo||pFrom>pTo);
    const q=String(F.search||'').trim().toLowerCase();
    const patientOptions=(patients||[]).filter(p=>search.trim().length<3||`${p.patient_id||''} ${formalName(p)||p.full_name||''}`.toLowerCase().includes(search.trim().toLowerCase()));
    const list=(rows||[]).filter(r=>{
      const day=String(r.bill_date||r.charge_date||'').slice(0,10);
      if(badPeriod)return false;
      // payables still owed are always shown whatever the period, so nothing owed to a vendor is hidden
      const owed=stage(r)==='Payable to vendor';
      if(pFrom&&!(owed&&F.status==='Payable to vendor')&&(day<pFrom||day>pTo))return false;
      if(F.status!=='All'&&stage(r)!==F.status)return false;
      if(F.patient&&String(r.patient_id)!==String(F.patient))return false;
      if(q.length>=3&&!pLabel(r.patient_id).toLowerCase().includes(q)&&!String(r.service_provider||'').toLowerCase().includes(q))return false;
      return true;
    });
    const verified=list.filter(r=>['Approved','Partially Approved'].includes(r.approval_status));
    const samaraPaid=verified.filter(r=>r.outside_paid_by!=='Family paid directly');
    const sum=(a,k)=>a.reduce((n,r)=>n+Number(r[k]||0),0);
    const owedAll=(rows||[]).filter(r=>stage(r)==='Payable to vendor');
    async function markPaid(e){
      e.preventDefault();if(busy)return;
      setBusy(true);
      const r=await client.rpc('outside_bill_settle',{p_request_id:pay.row.id,p_date:pay.date,p_mode:pay.mode,p_ref:pay.ref||null});
      setBusy(false);
      if(r.error){showSamaraActionToast('error','Not saved',r.error.message);return}
      showSamaraActionToast('success','Saved successfully',`Paid to ${pay.row.service_provider||'vendor'} on ${formatDateIN(pay.date)} (${pay.mode}).`);
      setPay(null);setDetail(null);load();
    }
    function fields(r){
      return [['Guest',pLabel(r.patient_id)],['Item',[r.charge_item_code,r.service_name].filter(Boolean).join(' · ')],['Shop / Lab / Hospital / Vehicle',r.service_provider],
        ['From → To',r.outside_route],['Bill',[r.bill_number,r.bill_date&&formatDateIN(r.bill_date)].filter(Boolean).join(' · ')],
        ['Bill amount',r.outside_bill_amount!=null?money(r.outside_bill_amount):money(r.requested_amount)],['Handling fee',r.outside_handling_fee!=null?money(r.outside_handling_fee):''],
        ['Charged to Guest',['Approved','Partially Approved'].includes(r.approval_status)?money(r.approved_amount):''],
        ['Who paid',r.outside_paid_by],['Status',stage(r)],
        ['Paid to vendor',r.outside_settle_date?[formatDateIN(r.outside_settle_date),r.outside_settle_mode,r.outside_settle_ref,r.outside_settled_by_name].filter(Boolean).join(' · '):''],
        ['Petty cash',r.outside_petty_entry_id?'Written into Nursing Manager Petty Cash':''],
        ['Raised by',[r.raised_by_name,r.raised_at&&formatDateTimeIN(r.raised_at)].filter(Boolean).join(' · ')],
        ['Verified by (Accounts)',[r.decision_by_name,(r.decision_date||r.approved_at)&&formatDateTimeIN(r.decision_date||r.approved_at)].filter(Boolean).join(' · ')],
        ['Remarks',[r.remarks,r.approval_remarks].filter(Boolean).join(' · ')]];
    }
    const canSettle=['Accounts','Admin'].includes(profile?.role);
    const card=r=>h('article',{key:r.id,className:'stores-ledger-card row-clickable',style:{cursor:'pointer'},onClick:()=>setDetail(r)},
      h('div',{className:'stores-ledger-card-head'},h('strong',null,`${r.service_name||'Outside bill'} · ${r.service_provider||''}`),h('span',null,formatDateIN(r.bill_date||r.charge_date))),
      h('div',{className:'stores-ledger-card-fields'},
        h('div',null,h('small',null,'Guest'),h('strong',null,pLabel(r.patient_id))),
        h('div',null,h('small',null,'Bill amount'),h('strong',null,money(r.outside_bill_amount??r.requested_amount))),
        h('div',null,h('small',null,'Who paid'),h('strong',null,r.outside_paid_by)),
        h('div',null,h('small',null,'Status'),h('strong',{style:{color:stage(r)==='Payable to vendor'?'#b42318':stage(r)==='Awaiting Accounts'?'#9a6700':'inherit'}},stage(r)))));
    return h(Section,{title:'Outside Bills Paid by Samara',subtitle:'Outside pharmacy, lab, scan, ambulance, taxi and hospital bills paid for Guests. Charged to the Guest at actual bill amount plus the Charge Master handling fee. Bills on credit stay here until marked paid.'},
      error&&h('p',{role:'alert',style:{color:'#a00050',fontWeight:700}},error),
      h('div',{className:'grid stats'},
        h('div',{className:'card stat'},h('span',null,'Paid / owed by Samara (period)'),h('strong',null,money(sum(samaraPaid,'outside_bill_amount')))),
        h('div',{className:'card stat'},h('span',null,'Handling fees (period)'),h('strong',null,money(sum(samaraPaid,'outside_handling_fee')))),
        h('div',{className:'card stat'},h('span',null,'Charged to Guests (period)'),h('strong',null,money(sum(samaraPaid,'approved_amount')))),
        h('button',{type:'button',className:'card stat',style:{textAlign:'left',cursor:'pointer',border:owedAll.length?'1px solid #e9a1a1':'1px solid #e8c3d2'},onClick:()=>{setStatus('Payable to vendor');filters.setNow({status:'Payable to vendor'})}},h('span',null,'Still payable to vendors (all dates)'),h('strong',{style:{color:owedAll.length?'#b42318':'inherit'}},money(sum(owedAll,'outside_bill_amount'))),h('small',{style:{display:'block'}},`${owedAll.length} bill(s) · tap to list`))
      ),
      h('div',{className:'clinical-charge-filters'},
        h('div',{className:'field'},h('label',null,'Search Guest / ID / vendor'),h('input',{type:'search',value:search,placeholder:'At least 3 letters',onChange:e=>setSearch(e.target.value)})),
        h('div',{className:'field'},h('label',null,'Guest'),h('select',{value:patient,onChange:e=>setPatient(e.target.value)},h('option',{value:''},'All Guests'),patientOptions.map(p=>h('option',{key:p.id,value:p.id},`${p.patient_id||'—'} · ${formalName(p)||p.full_name||''}`)))),
        h('div',{className:'field'},h('label',null,'Status'),h('select',{value:status,onChange:e=>setStatus(e.target.value)},['All','Awaiting Accounts','Paid by Samara','Payable to vendor','Family paid (record)','Rejected'].map(x=>h('option',{key:x,value:x},x)))),
        h('div',{className:'field'},h('label',null,'Period (bill date)'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},[['today','Today'],['week','This Week'],['month','Month'],['custom','Period (From – To)'],['all','All dates']].map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='month'&&h('div',{className:'field'},h('label',null,'Month'),h('input',{type:'month',value:month,onChange:e=>setMonth(e.target.value)})),
        period==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:from,onChange:e=>setFrom(e.target.value)})),
        period==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:to,onChange:e=>setTo(e.target.value)})),
        h(ApplyFilterButton,{dirty:filters.dirty,onApply:filters.apply})
      ),
      badPeriod&&h('p',{role:'alert',style:{color:'#a00050'}},'Select a valid period. From date must be on or before To date.'),
      !badPeriod&&pFrom&&h('p',null,`Bill dates: ${formatDateIN(pFrom)} to ${formatDateIN(pTo)}${F.status==='Payable to vendor'?' (payables owed from earlier dates are also shown)':''}`),
      rows===null?h('p',{role:'status'},'Loading outside bills…'):list.length?h('div',{className:'stores-expiry-list'},list.map(card)):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No outside bills in this view.'),
      detail&&h(RowDetailModal,{title:`${detail.service_name||'Outside bill'} · ${stage(detail)}`,subtitle:pLabel(detail.patient_id),fields:fields(detail),onClose:()=>setDetail(null)},
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'10px 0'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>outsideViewBill(detail.id)},'View Bill'),
          canSettle&&stage(detail)==='Payable to vendor'&&h('button',{type:'button',className:'btn btn-primary',onClick:()=>setPay({row:detail,date:today,mode:'UPI',ref:''})},'Mark Paid to Vendor'))),
      pay&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:markPaid,style:{maxWidth:'460px'}},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,'Mark Paid to Vendor'),h('small',null,`${pay.row.service_provider||'Vendor'} · Bill ${pay.row.bill_number||'—'} · ${money(pay.row.outside_bill_amount)}`)),h('button',{type:'button',className:'close',onClick:()=>setPay(null)},'×')),
        h('div',{className:'field'},h('label',null,'Paid on *'),h(StrictDateInput,{value:pay.date,max:today,onChange:e=>setPay({...pay,date:e.target.value})})),
        h('div',{className:'field'},h('label',null,'Paid by *'),h('select',{value:pay.mode,onChange:e=>setPay({...pay,mode:e.target.value})},['Cash','UPI','Bank transfer','Cheque'].map(x=>h('option',{key:x,value:x},x)))),
        h('div',{className:'field'},h('label',null,'Reference (UTR / cheque no.)'),h('input',{value:pay.ref,onChange:e=>setPay({...pay,ref:e.target.value})})),
        h('button',{className:'btn btn-primary full',disabled:busy||!pay.date},busy?'Saving…':'Save Payment')))
    );
  }
