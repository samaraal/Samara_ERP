  // 2.18.164: dashboard of boxes first (Pending / Returned / Approved / All), list with filters on tap, row → full details.
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
    const [filter,setFilter]=React.useState({status:'All',category:'All',item:'All',patient_id:'',raised_by:'All',from:'',to:''});
    // 2.14.96: From / To boxes are a draft; the list changes on "Apply" (period buttons stay instant)
    const [dateDraft,setDateDraft]=React.useState({from:'',to:''});
    React.useEffect(()=>{setDateDraft({from:filter.from,to:filter.to})},[filter.from,filter.to]);
    const dateDirty=dateDraft.from!==filter.from||dateDraft.to!==filter.to;
    const [view,setView]=React.useState('dashboard'),[listTitle,setListTitle]=React.useState(''),[detail,setDetail]=React.useState(null);
    const [period,setPeriod2]=React.useState('month');
    const [avgCost,setAvgCost]=React.useState({});
    const isAdmin=profile?.role==='Admin';
    const [periodDraft,setPeriodDraft]=React.useState({from:'',to:''}),[periodApplied,setPeriodApplied]=React.useState({from:'',to:''});

    const load=React.useCallback(async()=>{
      const r=await client.from('bill_charge_requests').select('*').order('charge_date',{ascending:false}).order('created_at',{ascending:false}).limit(2000);
      if(!r.error)setRows(r.data||[]);else console.warn(r.error);
      // 2.18.164: Admin only — purchase cost per store item = weighted average of stock receipts with a unit cost.
      if(profile?.role==='Admin'){
        const rc=await client.from('consumable_store_receipts').select('item_id,unit_cost,quantity,voided_at').limit(10000);
        if(rc.error){console.warn('Purchase cost:',rc.error);return;}
        const acc={};(rc.data||[]).forEach(x=>{const c=Number(x.unit_cost),q=Number(x.quantity)||0;if(x.voided_at||!(c>0)||!(q>0))return;const k=String(x.item_id);acc[k]=acc[k]||{q:0,v:0};acc[k].q+=q;acc[k].v+=q*c;});
        setAvgCost(Object.fromEntries(Object.entries(acc).map(([k,a])=>[k,a.v/a.q])));
      }
    },[]);

    React.useEffect(()=>{
      if(!canView)return;
      load();
      const ch=client.channel('nursing-charge-register-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'bill_charge_requests'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[load,canView]);

    // 2.15.14: discharged Guests' names also show (they are not in the active list)
    const {pFor,pLabel}=usePatientLookup(patients,rows.map(r=>r.patient_id));

    if(!canView)return h(Section,{title:'Charge Register'},h('p',null,'Admin / Nursing Manager access only.'));

    const money=v=>v!==null&&v!==undefined&&v!==''?`₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—';
    const statusOf=r=>r.approval_status||'Pending';
    const statusLabel=s=>s==='Rejected'?'Returned':s;
    const today=todayISOIndia();

    const categories=React.useMemo(()=>[...new Set(rows.map(r=>r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[rows]);
    // 2.18.152: Item filter — items of the chosen category (all items when Category = All), A–Z
    const itemOf=r=>`${r.charge_item_code?`${r.charge_item_code} · `:''}${r.service_name||r.description||'—'}`;
    const items=React.useMemo(()=>[...new Set(rows.filter(r=>filter.category==='All'||r.category===filter.category).map(itemOf))].sort((a,b)=>a.replace(/^[A-Z]+-\d+ · /,'').localeCompare(b.replace(/^[A-Z]+-\d+ · /,''))),[rows,filter.category]);
    const raisers=React.useMemo(()=>[...new Set(rows.map(r=>r.raised_by_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[rows]);
    const patientsWithCharges=React.useMemo(()=>{
      const ids=new Set(rows.map(r=>r.patient_id).filter(Boolean));
      return patients.filter(p=>ids.has(p.id)).sort((a,b)=>String(formalName(a)||'').localeCompare(String(formalName(b)||'')));
    },[rows,patients]);

    const setPeriod=(from,to)=>setFilter(current=>({...current,from,to}));
    const clearFilters=()=>setFilter({status:'All',category:'All',item:'All',patient_id:'',raised_by:'All',from:'',to:''});

    const filtered=rows.filter(r=>
      (filter.status==='All'||(filter.status==='ReturnedOpen'?(statusOf(r)==='Rejected'&&!r.resubmitted_as):statusOf(r)===filter.status))&&
      (filter.category==='All'||r.category===filter.category)&&
      (filter.item==='All'||itemOf(r)===filter.item)&&
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

    // 2.18.163: Guest ID not needed here — Patient shows name · room; Date shows the time the charge was raised.
    const guestLabel=id=>{const p=pFor(id);if(!p.id)return '—';const trial=p.is_trial?' · 🧪 TRIAL':'';
      return p.is_active===false?`${formalName(p)} · Discharged${trial}`:`${formalName(p)} · Room ${p.room_no||'—'}-${p.bed_no||'—'}${trial}`;};
    const raisedTime=r=>{const d=new Date(r.created_at||'');return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).toUpperCase();};
    const heads=['Date & Time','Patient','Category','Service','Qty','Status','Requested Amount','Approved Amount','Raised By','Decision By','Decision Time','Remarks'];
    // 2.18.164: opens on a dashboard of boxes; a box (or "Search with filters") opens the list with all
    // filters; a row opens full details. Pending / Returned boxes count every open item (any date) so
    // nothing waiting disappears when the period changes; the other boxes follow the chosen period.
    const isReturnedOpen=r=>statusOf(r)==='Rejected'&&!r.resubmitted_as;
    const periodRange=(()=>{
      if(period==='today')return [today,today];
      if(period==='week')return [mondayOfWeek(today),today];
      if(period==='month')return [`${today.slice(0,7)}-01`,today];
      return [periodApplied.from,periodApplied.to];
    })();
    const inPeriod=r=>(!periodRange[0]||r.charge_date>=periodRange[0])&&(!periodRange[1]||r.charge_date<=periodRange[1]);
    const periodRows=rows.filter(inPeriod);
    const pendingRows=rows.filter(r=>statusOf(r)==='Pending');
    const returnedRows=rows.filter(isReturnedOpen);
    const approvedRows=periodRows.filter(r=>['Approved','Partially Approved'].includes(statusOf(r)));
    const sumReq=list=>list.reduce((s,r)=>s+(Number(r.requested_amount??r.unit_cost)||0),0);
    const sumAppr=list=>list.reduce((s,r)=>s+(Number(r.approved_amount??r.final_amount)||0),0);
    // Profit (Admin): bought = qty × average purchase cost (store items) or the outside bill (outside services);
    // charged = approved amount (requested while pending); services without a purchase price are not in the profit total.
    const chargedOf=r=>Number(r.approved_amount??r.final_amount??r.requested_amount??r.unit_cost)||0;
    const boughtOf=r=>{const k=r.store_item_id&&String(r.store_item_id);if(k&&avgCost[k]!=null)return (Number(r.quantity)||1)*avgCost[k];
      if(r.outside_bill_amount!=null&&r.outside_bill_amount!=='')return Number(r.outside_bill_amount)||0;return null;};
    const isService=r=>!r.store_item_id&&(r.outside_bill_amount==null||r.outside_bill_amount==='');
    // 2.18.165: a stock receipt priced per box / pack while quantity is per piece gives a cost far above the charge —
    // when the cost per piece is more than double the charge per piece, flag it and keep it out of the profit total.
    const costSuspect=r=>{const k=r.store_item_id&&String(r.store_item_id);if(!k||avgCost[k]==null)return false;const q=Number(r.quantity)||1;const perPiece=chargedOf(r)/q;return perPiece>0&&avgCost[k]>2*perPiece;};
    const profitOf=r=>{const b=boughtOf(r);return b==null||costSuspect(r)?null:chargedOf(r)-b;};
    const profitSummary=list=>{const known=list.filter(r=>boughtOf(r)!=null&&!costSuspect(r));const b=known.reduce((s,r)=>s+boughtOf(r),0),c=known.reduce((s,r)=>s+chargedOf(r),0);
      return {b,c,p:c-b,known:known.length,suspect:list.filter(costSuspect).length,services:list.filter(isService).length,unknown:list.filter(r=>!isService(r)&&boughtOf(r)==null).length};};
    const periodName={today:'Today',week:'This Week',month:'This Month',custom:periodApplied.from||periodApplied.to?`${periodApplied.from?formatDateIN(periodApplied.from):'…'} – ${periodApplied.to?formatDateIN(periodApplied.to):'…'}`:'All dates'}[period];

    function openList(status,title,allDates){
      setFilter({status,category:'All',item:'All',patient_id:'',raised_by:'All',from:allDates?'':periodRange[0]||'',to:allDates?'':periodRange[1]||''});
      setListTitle(title);setView('list');
      window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,behavior:'smooth'})}catch(_){}});
    }

    const box=(label,count,line,tone,onClick,note)=>h('button',{type:'button',className:'card stat samara-pink-stat',onClick,style:{
        textAlign:'left',cursor:'pointer',width:'100%',display:'grid',gap:'4px',padding:'16px 18px',
        background:tone==='alert'?'linear-gradient(135deg,#f9c2d6 0%,#fde0ea 55%,#fff4f8 100%)':'linear-gradient(135deg,#fcdde9 0%,#feecf3 55%,#fff8fb 100%)',
        border:tone==='alert'?'1.5px solid #d14f84':'1px solid #efc3d6',boxShadow:'0 4px 12px rgba(109,24,61,.07)'}},
      h('span',{style:{fontWeight:800,color:'#7d1748'}},label),
      h('strong',{style:{fontSize:'30px',lineHeight:1.05,color:'#3b0f25'}},count),
      line?h('span',{style:{fontWeight:700,color:'#5d1039'}},line):null,
      h('small',{style:{color:'#8a6a78',fontWeight:600}},note||'Tap to open the list ›'));

    const chip=(key,label)=>h('button',{type:'button','aria-pressed':period===key,className:`btn ${period===key?'btn-primary':'btn-secondary'}`,onClick:()=>setPeriod2(key)},label);

    if(view==='dashboard'){
      return h(Section,{title:'Charge Register',subtitle:'Tap a box to open that list. View only — charges are raised and decided on their own pages.'},
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',marginBottom:'12px'}},
          chip('today','Today'),chip('week','This Week'),chip('month','This Month'),chip('custom','Period'),
          period==='custom'?h(React.Fragment,null,
            h(StrictDateInput,{value:periodDraft.from,max:periodDraft.to||today,onChange:e=>setPeriodDraft(d=>({...d,from:e.target.value}))}),
            h(StrictDateInput,{value:periodDraft.to,min:periodDraft.from||undefined,max:today,onChange:e=>setPeriodDraft(d=>({...d,to:e.target.value}))}),
            h(ApplyFilterButton,{dirty:periodDraft.from!==periodApplied.from||periodDraft.to!==periodApplied.to,onApply:()=>setPeriodApplied(periodDraft)})):null,
          h('span',{style:{marginLeft:'auto'}}),
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>openList('All',`All Charges · ${periodName}`,false)},'🔍 Search with filters')),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'12px'}},
          box('Pending with Accounts',pendingRows.length,money(pendingRows.reduce((t,r)=>t+chargedOf(r),0)),pendingRows.length?'alert':'',()=>openList('Pending','Pending with Accounts',true),'All dates · tap to open ›'),
          box('Returned to Nurse',returnedRows.length,returnedRows.length?'Awaiting correction':'',returnedRows.length?'alert':'',()=>openList('ReturnedOpen','Returned to Nurse — awaiting correction',true),'All dates · tap to open ›'),
          box(`Approved · ${periodName}`,approvedRows.length,money(sumAppr(approvedRows)),'',()=>openList('Approved',`Approved · ${periodName}`,false)),
          box(`All Charges · ${periodName}`,periodRows.length,money(periodRows.reduce((t,r)=>t+chargedOf(r),0))+' value','',()=>openList('All',`All Charges · ${periodName}`,false)),
          isAdmin?(()=>{const ps=profitSummary(approvedRows);return box(`Net Profit · ${periodName}`,money(ps.p),`Bought ${money(ps.b)} · Charged ${money(ps.c)}`,'',()=>openList('Approved',`Approved · ${periodName} — Profit`,false),
            `${ps.known} items counted${ps.suspect?` · ⚠ ${ps.suspect} to check (cost per box?)`:''}${ps.services?` · ${ps.services} services not counted`:''}${ps.unknown?` · ${ps.unknown} without cost`:''} · Admin only`);})():null
        ));
    }

    // ---- list view ----
    const listHeads=isAdmin?[...heads,'Bought (cost)','Charged','Net Profit']:heads;
    const tableRows=filtered.map(r=>[
      h('span',{style:{whiteSpace:'nowrap'}},formatDateIN(r.charge_date),raisedTime(r)?h('small',{style:{display:'block',color:'#7b6871',fontWeight:600}},raisedTime(r)):null),guestLabel(r.patient_id),r.category||'—',
      itemOf(r),
      `${r.quantity||1} ${r.unit||''}`,
      h('span',{className:'badge'},statusLabel(statusOf(r))),
      money(r.requested_amount??r.unit_cost),
      money(r.approved_amount??r.final_amount),
      r.raised_by_name||'—',
      r.decision_by_name||'—',
      r.decision_at?fmt(r.decision_at):'—',
      r.decision_remarks||r.approval_remarks||r.remarks||'—',
      ...(isAdmin?[boughtOf(r)!=null?(costSuspect(r)?h('span',{title:'Purchase cost per piece is more than double the charge — the stock receipt was probably priced per box / pack. Not counted in profit.',style:{color:'#b26a00',fontWeight:700}},`${money(boughtOf(r))} ⚠ check purchase unit`):money(boughtOf(r))):(isService(r)?'Service':'No cost'),money(chargedOf(r)),
        profitOf(r)!=null?h('strong',{style:{color:profitOf(r)<0?'#b42336':'#087f5b'}},money(profitOf(r))):'—']:[])
    ]);
    const plainRows=()=>filtered.map(r=>[formatDateIN(r.charge_date)+(raisedTime(r)?` ${raisedTime(r)}`:''),guestLabel(r.patient_id),r.category||'',itemOf(r),`${r.quantity||1} ${r.unit||''}`.trim(),statusLabel(statusOf(r)),
      Number(r.requested_amount??r.unit_cost)||0,(r.approved_amount??r.final_amount)!=null?Number(r.approved_amount??r.final_amount):'',r.raised_by_name||'',r.decision_by_name||'',r.decision_at?fmt(r.decision_at):'',r.decision_remarks||r.approval_remarks||r.remarks||'',
      ...(isAdmin?[boughtOf(r)!=null?(costSuspect(r)?`${Math.round(boughtOf(r)*100)/100} (check purchase unit)`:Math.round(boughtOf(r)*100)/100):(isService(r)?'Service':'No cost'),chargedOf(r),profitOf(r)!=null?Math.round(profitOf(r)*100)/100:'']:[])]);
    function printList(){
      const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const w=samaraPrintBar(window.open('','_blank'));if(!w){alert('Please allow pop-ups to print.');return;}
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Charge Register</title><style>body{font-family:Arial,sans-serif;font-size:10.5px;margin:16px}h2{margin:0 0 2px;color:#8f1d5a}p{margin:0 0 8px;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9b3c6;padding:4px 5px;text-align:left;vertical-align:top}th{background:#fbe3ee}@page{size:A4 landscape;margin:10mm}</style></head><body><h2>Samara — Charge Register</h2><p>${esc(listTitle)} · ${filtered.length} charge${filtered.length===1?'':'s'} · Printed ${esc(formatDateIN(new Date()))}</p><table><thead><tr>${listHeads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${plainRows().map(r=>`<tr>${r.map((v,i)=>`<td>${esc([6,7,13,14].includes(i)?(v===''?'—':money(v)):(i===12&&typeof v==='number'?money(v):(v===0?'0':v||'—')))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
      w.document.close();w.focus();setTimeout(()=>w.print(),300);
    }
    async function downloadExcel(){
      try{
        if(!window.XLSX)await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';sc.async=true;sc.onload=resolve;sc.onerror=()=>reject(new Error('Excel library could not be loaded — check the internet connection.'));document.head.appendChild(sc);});
        const ws=window.XLSX.utils.aoa_to_sheet([listHeads,...plainRows()]);ws['!cols']=[18,30,20,36,10,12,14,14,18,18,20,30].map(wch=>({wch}));
        const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,'Charge Register');
        window.XLSX.writeFile(wb,`Samara_Charge_Register_${formatDateIN(new Date())}.xlsx`);
      }catch(error){alert(error.message||'Unable to download the Excel file.');}
    }
    const detailFields=r=>[
      ['Guest',guestLabel(r.patient_id)],['Charge Date',formatDateIN(r.charge_date)],['Raised At',r.created_at?fmt(r.created_at):''],['Raised By',r.raised_by_name],
      ['Category',r.category],['Service / Item',itemOf(r)],['Quantity',`${r.quantity||1} ${r.unit||''}`.trim()],['Status',statusLabel(statusOf(r))],
      ['Requested Amount',money(r.requested_amount??r.unit_cost)],['Approved Amount',(r.approved_amount??r.final_amount)!=null?money(r.approved_amount??r.final_amount):''],
      ['Decision By',r.decision_by_name],['Decision Time',r.decision_at?fmt(r.decision_at):''],['Decision Remarks',r.decision_remarks||r.approval_remarks],['Nurse Remarks',r.remarks],
      ['Resubmitted By',r.resubmitted_by_name],['Resubmitted At',r.resubmitted_at?fmt(r.resubmitted_at):''],
      ...(isAdmin?[['Purchase Cost / Unit (avg)',r.store_item_id&&avgCost[String(r.store_item_id)]!=null?money(avgCost[String(r.store_item_id)]):''],
        ['Bought (cost)',boughtOf(r)!=null?money(boughtOf(r)):(isService(r)?'Service — no purchase cost':'No purchase cost on stock receipts')],
        ['Charged',money(chargedOf(r))],['Net Profit',profitOf(r)!=null?money(profitOf(r)):(costSuspect(r)?'Not counted — purchase cost looks per box / pack; check the stock receipt':'')]]:[])
    ];
    const linked=r=>{const chain=[];const from=r.resubmitted_from&&rows.find(x=>String(x.id)===String(r.resubmitted_from));const to=r.resubmitted_as&&rows.find(x=>String(x.id)===String(r.resubmitted_as));
      if(from)chain.push(['Corrected from (returned)',from]);if(to)chain.push(['Resubmitted as',to]);return chain;};

    return h(React.Fragment,null,
      h(Section,{title:listTitle||'Charge Register',subtitle:'Tap a row for full details. View only.',actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setView('dashboard')},'‹ Back to Dashboard'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!filtered.length,onClick:printList},'Print / PDF'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!filtered.length,onClick:downloadExcel},'Excel'))},
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'10px',marginBottom:'12px'}},
          h('div',{className:'field',style:{margin:0}},h('label',null,'Status'),h('select',{value:filter.status,onChange:e=>setFilter({...filter,status:e.target.value})},
            [['All','All'],['Pending','Pending'],['Approved','Approved'],['Partially Approved','Partially Approved'],['Rejected','Returned (all)'],['ReturnedOpen','Returned — awaiting correction']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Category'),h('select',{value:filter.category,onChange:e=>setFilter({...filter,category:e.target.value,item:'All'})},
            h('option',{value:'All'},'All'),categories.map(c=>h('option',{key:c,value:c},c)))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Item'),h('select',{value:filter.item,onChange:e=>setFilter({...filter,item:e.target.value})},
            h('option',{value:'All'},`All (${items.length})`),items.map(n=>h('option',{key:n,value:n},n)))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Patient'),h('select',{value:filter.patient_id,onChange:e=>setFilter({...filter,patient_id:e.target.value})},
            h('option',{value:''},'All'),patientsWithCharges.map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)} · ${p.patient_id||'—'}`)))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Raised By'),h('select',{value:filter.raised_by,onChange:e=>setFilter({...filter,raised_by:e.target.value})},
            h('option',{value:'All'},'All'),raisers.map(n=>h('option',{key:n,value:n},n)))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'From'),h(StrictDateInput,{value:dateDraft.from,max:dateDraft.to||today,onChange:e=>setDateDraft(d=>({...d,from:e.target.value}))})),
          h('div',{className:'field',style:{margin:0}},h('label',null,'To'),h(StrictDateInput,{value:dateDraft.to,min:dateDraft.from||undefined,max:today,onChange:e=>setDateDraft(d=>({...d,to:e.target.value}))})),
          h(ApplyFilterButton,{dirty:dateDirty,onApply:()=>setFilter(f=>({...f,from:dateDraft.from,to:dateDraft.to}))})
        ),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPeriod(today,today)},'Today'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPeriod(mondayOfWeek(today),today)},'This Week'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPeriod(`${today.slice(0,7)}-01`,today)},'This Month'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPeriod('','')},'All Dates'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:clearFilters},'Clear Filters')
        )
      ),
      isAdmin&&filtered.length?(()=>{const ps=profitSummary(filtered);return h('div',{className:'card',style:{display:'flex',gap:'18px',flexWrap:'wrap',alignItems:'center',padding:'12px 16px',margin:'0 0 12px',background:'linear-gradient(135deg,#fcdde9 0%,#fff8fb 100%)',border:'1px solid #efc3d6'}},
        h('strong',{style:{color:'#7d1748'}},'Admin · Profit for this list'),h('span',null,`Bought ${money(ps.b)}`),h('span',null,`Charged ${money(ps.c)}`),
        h('strong',{style:{color:ps.p<0?'#b42336':'#087f5b'}},`Net Profit ${money(ps.p)}`),
        h('small',{style:{color:'#8a6a78'}},`${ps.known} counted${ps.suspect?` · ⚠ ${ps.suspect} to check — purchase cost looks per box / pack`:''}${ps.services?` · ${ps.services} services not counted`:''}${ps.unknown?` · ${ps.unknown} items without purchase cost`:''}`));})():null,
      h(LogTable,{title:`Charges (${filtered.length})`,heads:listHeads,rows:tableRows,onRowClick:i=>setDetail(filtered[i])}),
      detail?h(RowDetailModal,{title:'Charge Details',subtitle:`${guestLabel(detail.patient_id)} · ${itemOf(detail)}`,fields:detailFields(detail),onClose:()=>setDetail(null)},
        linked(detail).length?h('div',{style:{marginTop:'12px',display:'grid',gap:'8px'}},h('strong',{style:{color:'#7d1748'}},'Return / Resubmit history'),
          linked(detail).map(([label,x])=>h('button',{key:x.id,type:'button',className:'btn btn-secondary',style:{textAlign:'left',justifyContent:'flex-start'},onClick:()=>setDetail(x)},
            `${label}: ${formatDateIN(x.charge_date)} ${raisedTime(x)} · ${itemOf(x)} · ${statusLabel(statusOf(x))}${x.decision_remarks?` · ${x.decision_remarks}`:''}`))):null):null
    );
  }
