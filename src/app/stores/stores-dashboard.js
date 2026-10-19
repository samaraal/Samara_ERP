  // 2.14.91: Pharmacy & Stores dashboard — one per sidebar category (Consumables, Pharmacy).
  // Opens with navigable boxes showing live numbers. Each box opens one section on its own,
  // with a "← Back to Dashboard" bar and Close. The phone / browser back button also returns
  // to the dashboard. The sections themselves are the existing ConsumablesStores and
  // PatientConsumables screens, shown one part at a time (no change to how they work).
  // 2.14.95: shared dashboard shell (used by Stores, Biomedical Equipment and Oxygen Cylinders)
  function useDashboardView(){
    const [view,setView]=React.useState('');
    const viewRef=React.useRef('');
    React.useEffect(()=>{viewRef.current=view},[view]);
    React.useEffect(()=>{
      // Runs before the app's own page-back handler (capture phase) and stops it, so Back
      // closes the open section instead of leaving the page.
      // 2.15.4: the browser may run the app's page-back handler first, so both check this shared registry /
      // the event mark: whichever runs, an open section is closed and the page does NOT go back.
      const reg=(window.__samaraDashViews=window.__samaraDashViews||new Set());reg.add(viewRef);
      const onPop=e=>{
        if(!viewRef.current)return;
        try{e.__samaraDashHandled=true;e.stopImmediatePropagation()}catch(_){}
        viewRef.current='';
        setView('');
        window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}});
      };
      window.addEventListener('popstate',onPop,true);
      return()=>{window.removeEventListener('popstate',onPop,true);reg.delete(viewRef)};
    },[]);
    function openView(key){
      if(viewRef.current){viewRef.current=key;setView(key)}
      else{try{history.pushState({samaraStoresView:key},'')}catch(_){}viewRef.current=key;setView(key)}
      window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}});
    }
    function backToDashboard(){
      let usedHistory=false;
      try{if(history.state&&history.state.samaraStoresView){history.back();usedHistory=true}}catch(_){}
      if(!usedHistory){viewRef.current='';setView('');window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}})}
    }
    return {view,openView,backToDashboard};
  }
  const dashNum=value=>value==null?'…':value;
  // Read-only register: financial quantities never stand in for clinical consumption.
  function storeUsageDay(value){
    if(!value)return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return String(value);
    const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const part=k=>parts.find(p=>p.type===k)?.value;return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function buildStoreUsage(data,itemId,from,to){
    const n=v=>Number(v)||0,inPeriod=v=>{const d=storeUsageDay(v);return !!d&&d>=from&&d<=to;},through=v=>{const d=storeUsageDay(v);return !!d&&d<=to;};
    const item=data.items.find(x=>x.id===itemId)||{};
    const stock=data.stock.find(x=>x.item_id===itemId);
    const movements=data.ledger.filter(x=>x.item_id===itemId&&!x.voided_at);
    const opening=movements.filter(x=>storeUsageDay(x.movement_at)<from).reduce((s,x)=>s+n(x.qty_in)-n(x.qty_out),0);
    const periodMoves=movements.filter(x=>inPeriod(x.movement_at));
    const vendorReceived=movements.filter(x=>x.movement_type==='Vendor Receipt'&&through(x.movement_at)).reduce((s,x)=>s+n(x.qty_in),0);
    const incoming=periodMoves.reduce((s,x)=>s+n(x.qty_in),0),outgoing=periodMoves.reduce((s,x)=>s+n(x.qty_out),0);
    const groups=new Map(),indentGroup=new Map();
    const get=(key,label,kind,patientId,visit)=>{
      if(!groups.has(key))groups.set(key,{key,label,kind,patientId,visit,indents:[],charges:[],returns:[],movements:[],issued:0,received:0,used:0,waste:0,charged:0,returned:0,pending:0,uncharged:0,remaining:0,consumptions:[],hasPeriod:false});
      return groups.get(key);
    };
    const inds=data.indents.filter(x=>x.store_item_id===itemId);
    for(const ind of inds){
      const v=data.visits.find(x=>x.id===ind.outside_visit_id),p=data.patients.find(x=>x.id===ind.patient_id);
      const outside=!!ind.outside_visit_id;
      const label=outside?`${ind.outside_patient_name||v?.snapshot?.full_name||'Outside patient'} · ${v?.procedure_name||'Procedure'} · ${v?.service_date||''}`:`${p?formalName(p)||p.full_name:'Resident'} · ${p?.patient_id||ind.patient_id||'Unknown ID'}${p?.is_active===false?' · Inactive / Discharged':''}`;
      const g=get(outside?'outside:'+ind.outside_visit_id:'patient:'+ind.patient_id,label,outside?'Outside Nursing':'Resident',ind.patient_id,v);
      indentGroup.set(ind.id,g);g.indents.push(ind);
      const issuedAt=ind.handed_over_at,receivedAt=ind.received_at;
      if(inPeriod(issuedAt)){g.issued+=n(ind.handed_over_qty);g.hasPeriod=true;}
      if(!outside&&ind.status==='Received'&&inPeriod(receivedAt)){g.received+=n(ind.received_qty);g.hasPeriod=true;}
      if(!outside&&ind.status==='Received'&&through(receivedAt)){g.uncharged+=n(ind.received_qty);g.remaining+=n(ind.received_qty);}
      if(!outside)for(const e of (data.consumptions||[]).filter(e=>e.indent_id===ind.id)){g.consumptions.push(e);if(e.voided_at)continue;if(inPeriod(e.used_on)){g.used+=n(e.quantity);g.hasPeriod=true;}if(through(e.used_on))g.remaining-=n(e.quantity);}
      if(outside&&(ind.outside_usage_approved_at||ind.status==='Received')){
        const usedAt=v?.service_date||ind.outside_usage_approved_at;
        if(inPeriod(usedAt)){g.used+=n(ind.outside_used_qty);g.waste+=n(ind.outside_wastage_qty);g.hasPeriod=true;}
      }
      if([ind.created_at,ind.initiated_at].some(inPeriod))g.hasPeriod=true;
      const rets=data.returns.filter(r=>r.indent_id===ind.id);
      for(const r of rets){g.returns.push(r);if(r.status==='Confirmed'&&inPeriod(r.confirmed_at)){g.returned+=n(r.quantity);g.hasPeriod=true;}
        if(r.status==='Confirmed'&&through(r.confirmed_at)&&!outside){g.uncharged-=n(r.quantity);g.remaining-=n(r.quantity);}
        if(r.status==='Pending'&&through(r.requested_at)){g.pending+=n(r.quantity);g.hasPeriod=true;}}
    }
    const posted=c=>['Posted','Partially Approved'].includes(c.status)&&['Approved','Partially Approved'].includes(c.approval_status);
    for(const ind of inds.filter(i=>!i.outside_visit_id)){
      const g=indentGroup.get(ind.id),allocs=data.allocations.filter(a=>a.indent_id===ind.id);
      // Allocations are authoritative where present; legacy receipt charges have a direct indent link.
      const linked=allocs.length?allocs.map(a=>({charge:data.charges.find(c=>c.id===a.charge_request_id),qty:n(a.allocated_qty)})):
        data.charges.filter(c=>c.consumable_indent_id===ind.id||c.id===ind.charge_request_id).map(c=>({charge:c,qty:n(c.quantity)}));
      for(const {charge:c,qty} of linked){if(!c||!posted(c))continue;const date=c.charge_date||c.service_datetime||c.raised_at;
        g.charges.push({id:c.id,date,qty,status:c.status,amount:c.final_amount,by:c.decision_by_name||c.approved_by_name,remarks:c.remarks});
        if(inPeriod(date)){g.charged+=qty;g.hasPeriod=true;}if(through(date))g.uncharged-=qty;}
    }
    // Retain posted item charges without an indent link (for example legacy manual charges).
    for(const c of data.charges.filter(c=>c.store_item_id===itemId&&posted(c)&&!data.allocations.some(a=>a.charge_request_id===c.id)&&!inds.some(i=>i.charge_request_id===c.id||i.id===c.consumable_indent_id))){
      const p=data.patients.find(p=>p.id===c.patient_id),g=get('patient:'+c.patient_id,`${p?formalName(p)||p.full_name:'Resident'} · ${p?.patient_id||c.patient_id}`,'Resident',c.patient_id,null);
      const date=c.charge_date||c.service_datetime||c.raised_at,quantity=n(c.quantity);
      g.charges.push({id:c.id,date,qty:quantity,status:c.status,amount:c.final_amount,by:c.decision_by_name,remarks:'No indent allocation · '+(c.remarks||'')});
      if(inPeriod(date)){g.charged+=quantity;g.hasPeriod=true;}if(through(date))g.uncharged-=quantity;
    }
    // Outside invoices may consolidate several source procedures: follow each material line's indent_id.
    for(const v of data.visits.filter(v=>v.billed_at&&v.review_status!=='Voided')){
      for(const line of Array.isArray(v.material_lines)?v.material_lines:[]){
        if(line.item_id!==itemId)continue;const g=indentGroup.get(line.indent_id);if(!g)continue;
        const qty=n(line.quantity),date=v.service_date||v.billed_at;
        g.charges.push({id:v.id+':'+line.indent_id,date,qty,status:'Outside invoice',amount:line.amount,by:v.nurse_name,remarks:line.included?'Included in procedure price':'Outside Nursing invoice material'});
        if(inPeriod(date)){g.charged+=qty;g.hasPeriod=true;}
      }
    }
    for(const ind of (data.housekeepingIndents||[]).filter(i=>i.store_item_id===itemId)){
      const g=get('housekeeping:'+ind.id,'Housekeeping · HK-'+String(ind.indent_no).padStart(5,'0'),'Housekeeping',null,null);g.housekeeping=ind;indentGroup.set(ind.id,g);
      if(inPeriod(ind.handed_over_at)){g.issued+=n(ind.handed_over_qty);g.hasPeriod=true;}
      if(inPeriod(ind.received_at)){g.received+=n(ind.received_qty);g.hasPeriod=true;}
      if(through(ind.received_at))g.remaining+=n(ind.received_qty);
      for(const u of (data.housekeepingUsage||[]).filter(u=>u.indent_id===ind.id)){g.consumptions.push(u);if(u.voided_at)continue;if(inPeriod(u.used_on)){g.used+=n(u.quantity);g.hasPeriod=true;}if(through(u.used_on))g.remaining-=n(u.quantity);}
      if(inPeriod(ind.requested_at))g.hasPeriod=true;
    }
    for(const m of movements){
      const g=indentGroup.get(m.indent_id||m.reference_id);
      if(g){g.movements.push(m);continue;}
      if(m.movement_type==='Department Issue'){
        const d=get('department:'+(m.reference_text||'Department'),m.reference_text||'Department','Department',null,null);d.movements.push(m);
        if(inPeriod(m.movement_at)){d.issued+=n(m.qty_out);d.hasPeriod=true;}
      }
    }
    return {item,stock,vendorReceived,opening,incoming,outgoing,closing:opening+incoming-outgoing,periodMoves,
      groups:[...groups.values()].filter(g=>g.hasPeriod||g.uncharged!==0||g.remaining!==0).sort((a,b)=>a.label.localeCompare(b.label))};
  }
  function StoreItemUsageRegister({profile,categoryFilter='',initialItem=''}){
    const [data,setData]=React.useState(null),[loading,setLoading]=React.useState(true),[error,setError]=React.useState('');
    const [itemId,setItemId]=React.useState(initialItem),[section,setSection]=React.useState(categoryFilter||'all'),[itemQuery,setItemQuery]=React.useState('');
    const [source,setSource]=React.useState('all'),[patientId,setPatientId]=React.useState(''),[patientQuery,setPatientQuery]=React.useState(''),[status,setStatus]=React.useState('all');
    const today=todayISOIndia(),[period,setPeriod]=React.useState('all'),[month,setMonth]=React.useState(today.slice(0,7)),[from,setFrom]=React.useState(today.slice(0,8)+'01'),[to,setTo]=React.useState(today);
    const [detail,setDetail]=React.useState(null),requestNo=React.useRef(0);
    async function load(){const ticket=++requestNo.current;setLoading(true);setError('');setDetail(null);
      async function all(table,columns='*',order='id'){let rows=[];for(let offset=0;;offset+=500){const r=await client.from(table).select(columns).order(order).range(offset,offset+499);if(r.error)throw new Error(`${table}: ${r.error.message}`);rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}}
      try{const names=['consumable_store_items','consumable_store_stock','consumable_store_ledger','patient_consumable_indents','bill_charge_store_allocations','patient_store_returns','bill_charge_requests','patients','patient_item_consumption','housekeeping_indents','housekeeping_item_usage'];
        const [results,outside]=await Promise.all([Promise.all(names.map(t=>all(t,t==='patients'?'id,title,full_name,patient_id,is_active':'*',t==='consumable_store_stock'?'item_id':'id'))),client.rpc('outside_nursing',{p_action:'load',p_data:{}})]);
        if(ticket===requestNo.current)setData({...Object.fromEntries(['items','stock','ledger','indents','allocations','returns','charges','patients','consumptions','housekeepingIndents','housekeepingUsage'].map((k,i)=>[k,results[i]])),visits:outside.error?[]:outside.data?.visits||[],outsideWarning:outside.error||(outside.data?.visits||[]).some(v=>v.billed_at&&!Array.isArray(v.material_lines))?'Outside Nursing invoice details are unavailable for this account. Outside charged quantities cannot be confirmed and are excluded from totals.':''});
      }catch(e){if(ticket===requestNo.current){setError(e.message||'Usage register could not be loaded.');setData(null);}}finally{if(ticket===requestNo.current)setLoading(false);}}
    React.useEffect(()=>{load();return()=>{requestNo.current++}},[]);
    let start=from,end=to;
    if(period==='all'){start='0001-01-01';end=today;}
    if(period==='today'){start=today;end=today;}
    if(period==='week'){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));start=d.toISOString().slice(0,10);end=today;}
    if(period==='month'){start=month+'-01';const d=new Date(start+'T12:00:00Z');if(Number.isFinite(d.getTime())){d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);end=d.toISOString().slice(0,10);}else end='';}
    const valid=/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=end;
    const iq=itemQuery.trim().toLowerCase(),pq=patientQuery.trim().toLowerCase();
    const items=(data?.items||[]).filter(x=>(section==='all'||x.item_category===section)&&(iq.length<3||`${x.item_name} ${x.item_code||''}`.toLowerCase().includes(iq))).sort((a,b)=>a.item_name.localeCompare(b.item_name));
    const reports=data&&valid?items.filter(x=>!itemId||x.id===itemId).map(x=>buildStoreUsage(data,x.id,start,end)):[];
    const report=itemId?reports[0]:null;
    React.useEffect(()=>{setDetail(null)},[itemId,section,period,month,from,to,source,patientId,patientQuery,status]);
    const patientOptions=[...(data?.patients||[]).filter(p=>status==='all'||(status==='inactive'?p.is_active===false:p.is_active!==false)).map(p=>({id:p.id,label:`${formalName(p)||p.full_name} · ${p.patient_id||''}`})),
      ...(status==='all'||status==='outside'?(data?.visits||[]).map(v=>({id:'outside:'+v.id,label:`${v.snapshot?.full_name||(data?.indents||[]).find(i=>i.outside_visit_id===v.id)?.outside_patient_name||'Outside patient'} · ${v.procedure_name} · ${v.service_date}`})):[])].filter(p=>(status!=='outside'||p.id.startsWith('outside:'))&&(pq.length<3||p.label.toLowerCase().includes(pq)));
    const matchGroup=g=>(source==='all'||g.kind===source)&&(!patientId||(g.kind==='Outside Nursing'?'outside:'+g.visit?.id:g.patientId)===patientId)&&
      (status==='all'||(status==='outside'?g.kind==='Outside Nursing':g.kind==='Resident'&&((data.patients.find(p=>p.id===g.patientId)?.is_active===false)===(status==='inactive'))))&&(pq.length<3||g.label.toLowerCase().includes(pq));
    const groups=(report?.groups||[]).filter(matchGroup);
    // 2.18.35: patient-wise view on the item list — a Guest searched (3+ characters) or chosen shows only the items they used.
    const patientMode=!itemId&&(!!patientId||pq.length>=3||status!=='all');
    const patientRows=patientMode?reports.map(r=>({r,gs:r.groups.filter(matchGroup)})).filter(x=>x.gs.length):[];
    const sumOf=(gs,k)=>gs.reduce((n,g)=>n+(Number(g[k])||0),0);
    const field=(label,control)=>h('div',{className:'field'},h('label',null,label),control);
    const select=(label,value,set,options)=>field(label,h('select',{'aria-label':label,value,onChange:e=>set(e.target.value)},options.map(([v,l])=>h('option',{key:v,value:v},l))));
    const qty=(v,u)=>`${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:20})} ${u||''}`;
    const table=(heads,rows)=>h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),h('tbody',null,rows.length?rows:h('tr',null,h('td',{colSpan:heads.length},'No records for these filters.')))));
    const row=(key,cells,onClick)=>h('tr',{key,className:onClick?'row-clickable':'',onClick:onClick||undefined,tabIndex:onClick?0:undefined,onKeyDown:onClick?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onClick()}}:undefined},cells.map((c,i)=>h('td',{key:i},c)));
    function story(ind){return [['Indent',`CI-${String(ind.indent_no).padStart(5,'0')} · ${ind.status}`],['Requested',qty(ind.requested_qty,ind.unit)],['Raised',[ind.initiated_by_name,formatDateTimeIN(ind.initiated_at||ind.created_at)].filter(Boolean).join(' · ')],['Approved',[qty(ind.approved_qty,ind.unit),ind.approved_by_name,ind.approved_at&&formatDateTimeIN(ind.approved_at)].filter(Boolean).join(' · ')],['Issued',[qty(ind.handed_over_qty,ind.unit),ind.handed_over_by_name,ind.handed_over_at&&formatDateTimeIN(ind.handed_over_at)].filter(Boolean).join(' · ')],['Received',[qty(ind.received_qty,ind.unit),ind.received_by_name,ind.received_at&&formatDateTimeIN(ind.received_at)].filter(Boolean).join(' · ')],['Outside recorded use / wastage',ind.outside_visit_id?`${ind.outside_used_qty||0} / ${ind.outside_wastage_qty||0} ${ind.unit}`:'Not separately recorded'],['Remarks',[ind.request_remarks,ind.approval_remarks,ind.handover_remarks,ind.receipt_remarks].filter(Boolean).join(' · ')]];}
    return h(Section,{title:'Item Usage Register',subtitle:'All quantities retain their item unit. Read-only; charged quantity is separate from recorded consumption.'},
      h('button',{type:'button',className:'btn btn-secondary',onClick:load,disabled:loading},loading?'Loading…':'Refresh register'),
      h('div',{className:'payment-filter-grid'},
        select('Store section',section,v=>{setSection(v);setItemId('');setDetail(null)},[['all','All store sections'],...['Consumables','Pharmacy','Housekeeping & General','Kitchen / Food Stores'].map(x=>[x,x])]),
        field('Search item / code',h('input',{'aria-label':'Search item / code',value:itemQuery,onChange:e=>{setItemQuery(e.target.value);setItemId('')},placeholder:'At least 3 characters'})),
        select('Store item',itemId,v=>{setItemId(v);setDetail(null)},[['','All items — tap a row'],...items.map(x=>[x.id,`${x.item_code||''} · ${displayStoreItemName(x.item_name)}${x.active===false?' · Inactive':''}`])]),
        select('Period',period,setPeriod,[['all','All recorded history'],['today','Today'],['week','This Week'],['month','Month'],['custom','Period (From–To)']]),
        period==='month'&&field('Month',h('input',{type:'month','aria-label':'Month',value:month,onChange:e=>setMonth(e.target.value)})),
        period==='custom'&&field('From',h(StrictDateInput,{value:from,onChange:e=>setFrom(e.target.value)})),period==='custom'&&field('To',h(StrictDateInput,{value:to,onChange:e=>setTo(e.target.value)})),
        // 2.18.35: patient-wise search at the top (also applies inside an opened item)
        field('Search patient / ID',h('input',{'aria-label':'Search patient / ID',value:patientQuery,onChange:e=>{setPatientQuery(e.target.value);setPatientId('')},placeholder:'At least 3 characters — Guest name or Resident ID (active and discharged)'})),
        select('Patient status',status,v=>{setStatus(v);setPatientId('')},[['all','All patients / sources'],['active','Active residents'],['inactive','Inactive / Discharged residents'],['outside','Outside Nursing patients']]),
        select('Patient / procedure',patientId,setPatientId,[['','All matching patients / procedures'],...patientOptions.map(p=>[p.id,p.label])])
      ),
      !valid&&h('p',{role:'alert',className:'message error'},'Enter valid From and To dates; From must not be after To.'),
      loading&&h('p',{role:'status'},'Loading complete stock and patient histories…'),error&&h('p',{role:'alert',className:'message error'},error),
      !loading&&!error&&valid&&h(React.Fragment,null,
        data?.outsideWarning&&h('p',{role:'alert',className:'message error'},data.outsideWarning),
        h('p',null,`${period==='all'?'All recorded history':formatDateIN(start)+' to '+formatDateIN(end)} · Store balances cover the whole organisation and are not changed by patient filters.`),
        patientMode&&h(React.Fragment,null,
          h('h3',null,`Patient-wise usage${patientId?` · ${(patientOptions.find(p=>p.id===patientId)||{}).label||''}`:pq.length>=3?` · “${patientQuery.trim()}”`:''}`),
          table(['Item / code — tap for full details','Unit','Patient(s)','Issued in period','Received in period','Actual used quantity','Charged quantity','Confirmed returns','Remaining patient balance at To date'],
            patientRows.map(({r,gs})=>row('p-'+r.item.id,[h('button',{type:'button',className:'btn btn-secondary',onClick:e=>{e.stopPropagation();setItemId(r.item.id)}},`${r.item.item_code||''} · ${displayStoreItemName(r.item.item_name)}`),r.item.unit,
              gs.map(g=>g.label.split(' · ')[0]+(/Inactive \/ Discharged/.test(g.label)?' (Inactive / Discharged)':'')).filter((v,i,a)=>a.indexOf(v)===i).join(', '),sumOf(gs,'issued'),sumOf(gs,'received'),sumOf(gs,'used'),data.outsideWarning&&gs.some(g=>g.kind==='Outside Nursing')?'Unavailable':sumOf(gs,'charged'),sumOf(gs,'returned'),
              gs.some(g=>g.kind==='Resident'||g.kind==='Housekeeping')?sumOf(gs.filter(g=>g.kind==='Resident'||g.kind==='Housekeeping'),'remaining'):'—'],()=>setItemId(r.item.id)))),
          h('p',{className:'small-note'},'Only items this patient used are listed. Clear the patient search to see every item and the store balances.')),
        !itemId&&!patientMode&&table(['Item / code','Unit','Brought forward before period','Stock in','Stock out','Closing stock','Current store balance'],reports.map(r=>row(r.item.id,[h('button',{type:'button',className:'btn btn-secondary',onClick:e=>{e.stopPropagation();setItemId(r.item.id)}},`${r.item.item_code||''} · ${displayStoreItemName(r.item.item_name)}`),r.item.unit,r.opening,r.incoming,r.outgoing,r.closing,r.stock?.balance_qty??'Unavailable'],()=>setItemId(r.item.id)))),
        report&&h(React.Fragment,null,
          h('h3',null,`${displayStoreItemName(report.item.item_name)} · ${report.item.unit}`),
          table(['Filtered actual resident use in period','Filtered actual Outside Nursing use in period','Filtered Housekeeping balance at To date','Filtered charged quantity in period (separate)'],[row('usage-summary',[...['Resident','Outside Nursing'].map(kind=>qty(groups.filter(g=>g.kind===kind).reduce((n,g)=>n+g.used,0),report.item.unit)),qty(groups.filter(g=>g.kind==='Housekeeping').reduce((n,g)=>n+g.remaining,0),report.item.unit),data.outsideWarning?'Outside charges unavailable':qty(groups.reduce((n,g)=>n+g.charged,0),report.item.unit)])]),
          h('p',null,`Total vendor receipts through To date: ${qty(report.vendorReceived,report.item.unit)}. Brought forward is the prior-period balance, not an extra receipt or opening-stock entry.`),
          table(['Brought forward before period','Stock in','Stock out','Closing store stock','Current store balance'],[row('stock',[report.opening,report.incoming,report.outgoing,report.closing,report.stock?.balance_qty??'Unavailable'])]),
          h('details',null,h('summary',null,'Store movements in period — receipts, issues, returns and adjustments'),table(['Date','Movement','In','Out','Reference','By'],report.periodMoves.map(m=>row(m.id,[formatDateTimeIN(m.movement_at),m.movement_type,m.qty_in,m.qty_out,m.reference_text,m.actor_name],()=>setDetail({movement:m}))))),
          h('div',{className:'payment-filter-grid'},select('Usage source',source,setSource,[['all','All sources'],['Resident','Residents'],['Outside Nursing','Outside Nursing procedures'],['Department','Departments'],['Housekeeping','Housekeeping']])),
          (patientId||pq.length>=3||status!=='all')&&h('p',{className:'small-note'},'Patient filter from the top is applied to the rows below.'),
          h('p',{className:'small-note'},'Patient balance = received − recorded use − confirmed returns through the To date; billing does not reduce it. Historical consumption is not inferred from charges. Pending returns reserve current availability. Outside Nursing use and wastage come from approved used-item indents.'),
          table(['Patient / procedure — tap for full details','Source','Issued in period','Received in period','Actual used quantity','Wastage','Charged quantity','Confirmed returns','Pending returns (current, requested by To)','Remaining patient / Housekeeping balance at To date'],groups.map(g=>row(g.key,[g.label,g.kind,g.issued,g.kind==='Resident'||g.kind==='Housekeeping'?g.received:'—',['Outside Nursing','Resident','Housekeeping'].includes(g.kind)?g.used:'—',g.kind==='Outside Nursing'?g.waste:'—',g.kind==='Outside Nursing'&&data.outsideWarning?'Unavailable':g.charged,g.returned,g.pending,g.kind==='Resident'||g.kind==='Housekeeping'?g.remaining:'—'],()=>setDetail({group:g})))),
          table(['Filtered totals','Issued','Received','Actual used quantity','Outside wastage','Charged quantity','Confirmed returns','Pending returns'],[row('totals',[`${groups.length} patient / procedure / department row(s)`,...['issued','received','used','waste','charged','returned','pending'].map(k=>qty(groups.reduce((s,g)=>s+g[k],0),report.item.unit))])])
        )
      ),
      detail&&h(RowDetailModal,{title:detail.group?.label||detail.movement?.movement_type,subtitle:`${report?.item.item_name||''} · ${formatDateIN(start)} to ${formatDateIN(end)}`,onClose:()=>setDetail(null),fields:detail.movement?Object.entries(detail.movement).map(([k,v])=>[k,String(v??'—')]):[['Source',detail.group.kind],['Procedure',detail.group.visit?.procedure_name||'—'],['Procedure date',detail.group.visit?.service_date||'—'],['Nurse',detail.group.visit?.nurse_name||'—'],['Procedure status',detail.group.visit?.review_status||'—'],['Notes',detail.group.visit?.notes||'—']]},
        detail.group&&h('div',null,
          detail.group.housekeeping&&table(['Housekeeping step','Details'],[['Requested',`${detail.group.housekeeping.requested_qty} · ${detail.group.housekeeping.requested_by_name} · ${formatDateTimeIN(detail.group.housekeeping.requested_at)} · ${detail.group.housekeeping.purpose}`],['Nursing Manager approval',`${detail.group.housekeeping.approved_qty??'Pending'} · ${detail.group.housekeeping.approved_by_name||''}`],['Stores handover',`${detail.group.housekeeping.handed_over_qty??'Pending'} · ${detail.group.housekeeping.handed_over_by_name||''}`],['STD receipt',`${detail.group.housekeeping.received_qty??'Pending'} · ${detail.group.housekeeping.received_by_name||''}`]].map(([k,v])=>row(k,[k,v]))),
          h('h4',null,'Complete linked indent history (includes carried-forward supply)'),detail.group.indents.map(ind=>h('details',{key:ind.id},h('summary',null,`CI-${String(ind.indent_no).padStart(5,'0')} · ${ind.requested_qty} ${ind.unit} · ${ind.status}`),table(['Field','Details'],story(ind).map(([k,v])=>row(k,[k,v]))))),
          h('h4',null,'Recorded consumption — full history'),table(['Used on','Quantity','Recorded by / at','Remarks','Status / correction'],detail.group.consumptions.map(e=>row(e.id,[formatDateIN(e.used_on),e.quantity,`${e.recorded_by_name} · ${formatDateTimeIN(e.recorded_at)}`,e.remarks||'—',e.voided_at?`Voided · ${e.voided_by_name} · ${e.void_reason}`:'Recorded']))),
          h('h4',null,'Charges (separate from consumption)'),table(['Date','Quantity','Status','Amount','By / notes'],detail.group.charges.map((c,i)=>row(c.id+':'+i,[formatDateIN(c.date),c.qty,c.status,c.amount??'—',[c.by,c.remarks].filter(Boolean).join(' · ')]))),
          h('h4',null,'Returns'),table(['Requested','Quantity','Status','Confirmed','By / notes'],detail.group.returns.map(r=>row(r.id,[formatDateTimeIN(r.requested_at),r.quantity,r.status,r.confirmed_at?formatDateTimeIN(r.confirmed_at):'—',[r.requested_by_name,r.confirmed_by_name,r.confirmation_remarks].filter(Boolean).join(' · ')]))),
          h('h4',null,'Linked stock movements'),table(['Date','Type','In','Out','By / reference'],detail.group.movements.map(m=>row(m.id,[formatDateTimeIN(m.movement_at),m.movement_type,m.qty_in,m.qty_out,[m.actor_name,m.reference_text,m.remarks].filter(Boolean).join(' · ')])))
        )
      )
    );
  }
  function DashboardHero({kicker='PHARMACY & STORES',title,blurb,onRefresh}){
    return h('div',{className:'stores-dash-hero'},
      h('div',null,h('small',null,kicker),h('h2',null,title),h('p',null,blurb)),
      onRefresh&&h('button',{type:'button',className:'stores-dash-refresh',onClick:onRefresh},'↻ Refresh')
    );
  }
  function DashboardTiles({tiles,onOpen}){
    return h('div',{className:'stores-dash-grid'},tiles.map(t=>h('button',{key:t.key,type:'button',className:`stores-dash-tile${t.alert?' alert':t.warn?' warn':''}`,onClick:()=>onOpen(t.key)},
      h('span',{className:'stores-dash-icon','aria-hidden':'true'},t.icon),
      h('span',{className:'stores-dash-title'},t.title),
      h('span',{className:'stores-dash-value'},h('b',null,t.valueText||dashNum(t.value)),h('small',null,t.unit)),
      h('span',{className:'stores-dash-lines'},(t.lines||[]).map((line,i)=>h('span',{key:i},line))),
      h('span',{className:'stores-dash-open'},'Open →')
    )));
  }
  function DashboardBackBar({title,viewTitle,onBack}){
    return h('div',{className:'stores-dash-backbar'},
      h('button',{type:'button',className:'stores-dash-back',onClick:onBack},'← Back to Dashboard'),
      h('strong',null,h('span',{className:'stores-dash-backbar-cat'},`${title} · `),viewTitle),
      h('button',{type:'button',className:'stores-dash-close','aria-label':'Close and return to dashboard',onClick:onBack},'×')
    );
  }

  function StoresDashboard(props){return props.categoryFilter==='Housekeeping & General'?h(HousekeepingWorkspace,{profile:props.profile}):h(StoreSectionDashboard,props);}
  function StoreSectionDashboard({profile,categoryFilter}){
    const {view,openView,backToDashboard}=useDashboardView();
    const [refreshKey,setRefreshKey]=React.useState(0);
    const [usageItem,setUsageItem]=React.useState('');
    const [stats,setStats]=React.useState(null),[indents,setIndents]=React.useState(null);
    const cat=categoryFilter||'Pharmacy & Stores';
    const isPharmacy=categoryFilter==='Pharmacy';
    const info=storeSectionInfo(categoryFilter||'Consumables');
    const n=dashNum;
    const ready=!!(stats&&indents);
    const s=stats||{},ind=indents||{};
    const indentAction=Number(ind.initiated||0)+Number(ind.handover||0);
    const tiles=[
      {key:'action',icon:'⚑',title:'Indents — Action Needed',value:ready?indentAction:null,unit:'to act on',
        lines:[`${n(ind.initiated)} awaiting approval`,`${n(ind.handover)} awaiting handover`,`${n(ind.receipt)} awaiting nurse receipt`,...(Number(ind.discrepancy||0)>0?[`${ind.discrepancy} receipt discrepancy`]:[])],
        alert:indentAction>0||Number(ind.discrepancy||0)>0},
      {key:'register',icon:'▤',title:`${isPharmacy?'Pharmacy':categoryFilter==='Consumables'||!categoryFilter?'Consumables':'Resident'} Indent Register`,value:ready?ind.total:null,unit:'indents',
        lines:[`${n(ind.today)} raised today`,`${n(ind.week)} this week`,`${n(ind.open)} still open`]},
      {key:'balance',icon:'⇄',title:'Patient Consumption / Balance',value:ready?ind.withBalance:null,unit:'with available patient balance',
        lines:[`${n(ind.returnsPending)} return(s) awaiting confirmation`],alert:Number(ind.returnsPending||0)>0},
      {key:'stock',icon:isPharmacy?'℞':info.departmentIssue?info.icon:'▦',title:'Current Stock',value:ready?s.items:null,unit:'items',
        lines:[`${n(s.inStock)} in stock`,`${n(s.low)} low stock`,`${n(s.out)} out of stock`],alert:Number(s.low||0)+Number(s.out||0)>0},
      {key:'usage',icon:'▤',title:'Item Usage Register',value:ready?s.items:null,unit:'items',lines:['Patient-wise and Outside Nursing usage','Charged quantities, returns and store balances']},
      ...(info.departmentIssue?[{key:'issue',icon:'➜',title:'Issue to Department',value:ready?s.deptMonth:null,unit:'issues this month',lines:[`${n(s.deptToday)} issued today`,'Floor, kitchen / pantry, laundry and other departments']}]:[]),
      ...(s.controller?[{key:'receive',icon:'＋',title:'Receive from Vendor',value:null,valueText:'New',unit:'receipt',lines:['Enter stock received from a vendor, with batch and expiry']}]:[]),
      {key:'receipts',icon:'🧾',title:'Vendor Receipt Register',value:ready?s.receipts:null,unit:'receipts',
        lines:[s.lastReceipt?`Last received ${formatDateIN(s.lastReceipt)}`:'No receipts yet']},
      {key:'movement',icon:'↕',title:'Stock Movement Register',value:ready?s.monthMoves:null,unit:'movements this month',
        lines:[`Today: +${n(s.todayIn)} in · −${n(s.todayOut)} out`,'Summary and every movement']},
      {key:'expiry',icon:'⏳',title:'Expiry Watch',value:ready?Number(s.expired||0)+Number(s.soon||0):null,unit:'expired / expiring',
        lines:[`${n(s.expired)} expired`,`${n(s.soon)} within 90 days`,`${n(s.missing)} expiry not entered`],alert:Number(s.expired||0)>0,warn:Number(s.soon||0)>0}
    ];
    const viewTitle=(tiles.find(t=>t.key===view)||{}).title||'';
    const storeSection=['stock','receive','receipts','movement','expiry','issue'].includes(view)?view:'none';
    const indentSection=view==='action'||view==='register'?'register':view==='balance'?'balance':'none';
    const registerFilter=view==='action'?'Open':view==='register'?'All':'';
    if(stats&&stats.access===false)return h(ConsumablesStores,{profile,categoryFilter});
    return h('div',{className:'stores-dash-wrap'},
      !view&&h('div',{className:'stores-dash'},
        h(DashboardHero,{title:cat,blurb:info.blurb,onRefresh:()=>{setStats(null);setIndents(null);setRefreshKey(k=>k+1)}}),
        h(DashboardTiles,{tiles,onOpen:openView})
      ),
      view&&h(DashboardBackBar,{title:cat,viewTitle,onBack:backToDashboard}),
      view==='usage'&&stats?.access&&h(StoreItemUsageRegister,{profile,categoryFilter,initialItem:usageItem}),
      h(React.Fragment,{key:`stores-dash-data-${refreshKey}`},
        h(ConsumablesStores,{profile,categoryFilter,section:storeSection,onSummary:setStats,onOpenSection:openView,onOpenUsage:id=>{setUsageItem(id);openView('usage')}}),
        h(PatientConsumables,{profile,categoryFilter,section:indentSection,registerFilter,onSummary:setIndents})
      )
    );
  }
