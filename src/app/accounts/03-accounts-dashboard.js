  function collectionBreakup(rows,month,through){
    const cents=v=>Math.round(Number(v||0)*100);
    const day=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
    const category=r=>{
      if(r.source==='Outside Nursing'||String(r.patient_id||'').startsWith('outside:'))return 'Samara Outside Nursing Procedures';
      const c=String(r.category||'').toLowerCase();
      for(const [pattern,name] of [[/room|rent|accommodation/,'Room Rent'],[/consumable/,'Consumables'],[/medicine|pharmacy|drug/,'Pharmacy'],[/physio/,'Physiotherapy'],[/food|diet/,'Food & Diet'],[/nurs/,'Nursing & Procedures'],[/doctor/,'Doctor Visits'],[/lab/,'Laboratory'],[/ambulance|transport/,'Ambulance / Transport']])if(pattern.test(c))return name;
      return 'Other Services';
    };
    const patients=new Map(),details=[];let advances=0;
    for(const r of rows||[]){const d=day(r.transaction_date);if(!d||d>through)continue;const key=r.patient_id||'unassigned:'+r.id;if(!patients.has(key))patients.set(key,[]);patients.get(key).push({...r,_day:d})}
    patients.forEach(list=>{
      const charges=list.filter(r=>r.transaction_type==='Charge'&&cents(r.amount)>0).sort((a,b)=>new Date(a.transaction_date)-new Date(b.transaction_date)||String(a.id).localeCompare(String(b.id)));
      const reductions=new Map(),byMonth=new Map();
      charges.forEach(r=>{const m=r._day.slice(0,7);if(!byMonth.has(m))byMonth.set(m,[]);byMonth.get(m).push(r)});
      const discountMonths=new Map();list.filter(r=>r.transaction_type==='Discount').forEach(r=>{const m=r._day.slice(0,7);discountMonths.set(m,(discountMonths.get(m)||0)+cents(r.amount))});
      let excess=0;
      [...discountMonths.entries()].sort().forEach(([m,amount])=>{
        const group=byMonth.get(m)||[],total=group.reduce((n,r)=>n+cents(r.amount),0),discount=Math.min(total,Math.max(0,amount));let gross=0,used=0;
        group.forEach(r=>{gross+=cents(r.amount);const cumulative=total?Math.round(discount*gross/total):0;reductions.set(r.id,cumulative-used);used=cumulative});excess+=Math.max(0,amount-discount);
      });
      // Surplus discounts settle remaining charges oldest first, never below zero.
      charges.forEach(r=>{const reduction=reductions.get(r.id)||0,extra=Math.min(excess,cents(r.amount)-reduction);reductions.set(r.id,reduction+extra);excess-=extra});
      let cash=Math.max(0,list.reduce((n,r)=>n+(['Payment','Advance'].includes(r.transaction_type)?cents(r.amount):r.transaction_type==='Refund'?-cents(r.amount):0),0));
      charges.forEach(r=>{const net=cents(r.amount)-(reductions.get(r.id)||0),realised=Math.min(net,cash);cash-=realised;if(r._day.slice(0,7)===month)details.push({...r,group:category(r),total:net/100,realised:realised/100,pending:(net-realised)/100})});advances+=cash/100;
    });
    const categories=['Room Rent','Consumables','Pharmacy','Samara Outside Nursing Procedures','Nursing & Procedures','Physiotherapy','Food & Diet','Doctor Visits','Laboratory','Ambulance / Transport','Other Services'].map(name=>({name,...details.filter(r=>r.group===name).reduce((a,r)=>({total:a.total+r.total,realised:a.realised+r.realised,pending:a.pending+r.pending}),{total:0,realised:0,pending:0})}));
    const totals=categories.reduce((a,r)=>({total:a.total+r.total,realised:a.realised+r.realised,pending:a.pending+r.pending}),{total:0,realised:0,pending:0});return {categories,details,totals,advances};
  }
  async function loadAccountsBillingHistory(){
    const data=[];for(let offset=0;;offset+=1000){const result=await client.from('billing_transactions').select('id,patient_id,transaction_type,category,amount,payment_mode,transaction_date,description').order('transaction_date',{ascending:true}).order('id',{ascending:true}).range(offset,offset+999);if(result.error)return {data:[],error:result.error};data.push(...(result.data||[]));if((result.data||[]).length<1000)return {data,error:null}}
  }
  function AccountsDashboard({profile,onNavigate}){
    React.useEffect(()=>{ensureAccountsWorkspaceStyle()},[]);
    const [state,setState]=React.useState({
      loading:true,transactions:[],requests:[],discharges:[],patients:[],outside:null
    });

    const [breakupOpen,setBreakupOpen]=React.useState(false);
    const [breakupMonth,setBreakupMonth]=React.useState(todayISOIndia().slice(0,7));
    const [breakupCategory,setBreakupCategory]=React.useState(null);
    // 2.18.103: Outstanding / Unadjusted Advance boxes open a Guest-wise list on this page.
    const [balanceList,setBalanceList]=React.useState(null); // 'outstanding' | 'advances' | null
    const [balanceGuest,setBalanceGuest]=React.useState(null);
    const money=value=>`₹${Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    const dateKey=value=>String(value||'').slice(0,10);
    const monthKey=value=>dateKey(value).slice(0,7);

    async function load(){
      const [transactions,requests,discharges,patients,outside]=await Promise.all([
        loadAccountsBillingHistory(),
        client.from('bill_charge_requests')
          .select('id,patient_id,approval_status,requested_amount,approved_amount,final_amount,created_at'),
        client.from('patient_discharges')
          .select('id,status,management_status,accounts_status,created_at'),
        client.from('patients')
          .select('id,full_name,title,patient_id,is_active,admission_date,room_no,bed_no,package_id,package_end_date'),
        loadOutsideNursingFinance()
      ]);
      setState({
        loading:false,error:transactions.error?.message||null,
        transactions:[...(transactions.data||[]),...outside.rows],outside,
        requests:requests.data||[],
        discharges:discharges.data||[],
        patients:patients.data||[]
      });
    }

    React.useEffect(()=>{
      load();
      const channel=client.channel('accounts-dashboard-live-v230')
        .on('postgres_changes',{event:'*',schema:'public',table:'billing_transactions'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'outside_nursing_visits'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'outside_nursing_payments'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'bill_charge_requests'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'patient_discharges'},load)
        .subscribe();
      return()=>client.removeChannel(channel);
    },[]);

    const today=todayISOIndia();
    const month=today.slice(0,7);
    const rows=state.transactions;
    const breakup=collectionBreakup(rows,breakupMonth,today);
    const sum=(list,types)=>list
      .filter(row=>types.includes(row.transaction_type))
      .reduce((total,row)=>total+Number(row.amount||0),0);

    const charges=sum(rows,['Charge']);
    const collections=sum(rows,['Payment','Advance']);
    const discounts=sum(rows,['Discount']);
    const refunds=sum(rows,['Refund']);
    // Cash-realisation view for the dashboard: charges/discounts define the earned ceiling;
    // receipts realise revenue only up to that ceiling. Any excess receipt remains an advance.
    // Recompute after every transaction so a later charge can materialise an earlier advance,
    // while a later discount can reduce previously realised revenue.
    function buildRealisation(rowsToProcess){
      const byPatient=new Map();
      (rowsToProcess||[]).forEach((row,index)=>{
        const key=row.patient_id||'__unassigned__';
        if(!byPatient.has(key))byPatient.set(key,[]);
        byPatient.get(key).push({...row,_sourceIndex:index});
      });
      let realised=0,outstanding=0,unadjustedAdvance=0;
      const realisedByDate=new Map(),perPatient=[];
      byPatient.forEach((patientRows,patientKey)=>{
        patientRows.sort((a,b)=>{
          const ad=new Date(a.transaction_date||0).getTime();
          const bd=new Date(b.transaction_date||0).getTime();
          return ad-bd||a._sourceIndex-b._sourceIndex;
        });
        let gross=0,discount=0,receipts=0,refund=0,previousRealised=0;
        patientRows.forEach(row=>{
          const amount=Number(row.amount||0);
          if(row.transaction_type==='Charge')gross+=amount;
          else if(row.transaction_type==='Discount')discount+=amount;
          else if(row.transaction_type==='Payment'||row.transaction_type==='Advance')receipts+=amount;
          else if(row.transaction_type==='Refund')refund+=amount;
          const netCharges=Math.max(0,gross-discount);
          const netReceipts=Math.max(0,receipts-refund);
          const currentRealised=Math.min(netCharges,netReceipts);
          const delta=currentRealised-previousRealised;
          const key=dateKey(row.transaction_date);
          if(key)realisedByDate.set(key,(realisedByDate.get(key)||0)+delta);
          previousRealised=currentRealised;
        });
        const netCharges=Math.max(0,gross-discount);
        const netReceipts=Math.max(0,receipts-refund);
        realised+=Math.min(netCharges,netReceipts);
        outstanding+=Math.max(0,netCharges-netReceipts);
        unadjustedAdvance+=Math.max(0,netReceipts-netCharges);
        perPatient.push({key:patientKey,gross,discount,receipts,refund,netCharges,netReceipts,
          outstanding:Math.max(0,netCharges-netReceipts),advance:Math.max(0,netReceipts-netCharges)});
      });
      return {realised,outstanding,unadjustedAdvance,realisedByDate,perPatient};
    }
    const realisation=buildRealisation(rows);
    const outstanding=realisation.outstanding;
    const unadjustedAdvance=realisation.unadjustedAdvance;
    const todayCollections=sum(rows.filter(row=>dateKey(row.transaction_date)===today),['Payment','Advance']);
    const monthCollections=sum(rows.filter(row=>monthKey(row.transaction_date)===month),['Payment','Advance']);
    const monthRows=rows.filter(row=>monthKey(row.transaction_date)===month);
    const monthGrossCharges=sum(monthRows,['Charge']);
    const monthDiscounts=sum(monthRows,['Discount']);
    const monthNetCharges=Math.max(0,monthGrossCharges-monthDiscounts);
    const monthRealisedRevenue=[...realisation.realisedByDate.entries()]
      .filter(([key])=>String(key).slice(0,7)===month)
      .reduce((total,[,value])=>total+Number(value||0),0);
    const pendingApprovals=state.requests.filter(row=>(row.approval_status||'Pending')==='Pending').length;
    const finalBills=state.patients.filter(row=>row.is_active!==false).filter(patient=>{
      const patientRows=rows.filter(row=>row.patient_id===patient.id);
      return sum(patientRows,['Charge'])-sum(patientRows,['Payment','Advance','Discount'])+sum(patientRows,['Refund'])>0.009;
    }).length;
    const dischargeClearance=state.discharges.filter(row=>
      String(row.management_status||'').toLowerCase()==='approved' &&
      String(row.accounts_status||'').toLowerCase()!=='cleared' &&
      String(row.status||'').toLowerCase()!=='completed'
    ).length;
    const packageExpiry=state.patients.filter(row=>{
      if(row.is_active===false||!row.package_id||!row.package_end_date)return false;
      const end=new Date(`${String(row.package_end_date).slice(0,10)}T00:00:00`);
      const limit=new Date(`${today}T00:00:00`);limit.setDate(limit.getDate()+3);
      return end<=limit;
    }).length;
    const refundValue=refunds;
    const netCharges=Math.max(0,charges-discounts);
    const realisedRevenue=realisation.realised;
    const averageDailyRevenue=(()=>{
      const realisedDays=[...realisation.realisedByDate.entries()].filter(([,value])=>Math.abs(Number(value||0))>0.009);
      return realisedDays.length?realisedRevenue/realisedDays.length:0;
    })();

    const modeTotals=['Cash','UPI','RTGS','Card Payment','Razorpay'].map(mode=>[
      mode,
      sum(rows.filter(row=>String(row.payment_mode||'').toLowerCase()===mode.toLowerCase()),['Payment','Advance'])
    ]);
    const maxMode=Math.max(1,...modeTotals.map(([,value])=>value));

    const kpis=[
      ['Collections Today',todayCollections,'Accounts Reports','green','Received today'],
      ['Collections This Month',monthCollections,'Accounts Reports','blue','Payment and advance receipts'],
      ['Gross Charges This Month',monthGrossCharges,'Accounts Reports','teal','Approved charges raised this month'],
      ['Discounts This Month',monthDiscounts,'Accounts Reports','purple','Approved discounts granted this month'],
      ['Net Charges This Month',monthNetCharges,'Accounts Reports','blue','Gross charges less approved discounts'],
      ['Realised Revenue This Month',monthRealisedRevenue,'Accounts Reports','green','Revenue materialised against charges'],
      ['Outstanding Receivables',outstanding,'list:outstanding','red','Approved net charges still unpaid · tap for Guest list'],
      ['Unadjusted Advances',unadjustedAdvance,'list:advances','blue','Receipts not yet materialised against charges · tap for Guest list'],
      ['Pending Approvals',pendingApprovals,'Charge Approvals','orange','Clinical charges awaiting decision',true],
      ['Pending Final Bills',finalBills,'Final Billing','purple','Active patients with balance',true],
      ['Discharge Clearance',dischargeClearance,'Discharge Clearance','orange','Management-approved cases',true],
      ['Package Expiry',packageExpiry,'Package Expiry Dashboard','orange','Expired / expiring within 3 days',true],
      ['Average Daily Realised Revenue',averageDailyRevenue,'Accounts Reports','blue','Materialised revenue across realised-revenue days']
    ];

    // ---- Guest-wise Outstanding / Advance list (2.18.103) ----
    const allPatients=[...state.patients,...(state.outside?.patients||[])];
    const guestOf=key=>allPatients.find(p=>p.id===key)||null;
    const guestName=key=>{
      if(key==='__unassigned__')return 'Unassigned entries';
      const p=guestOf(key);return p?(formalName(p)||p.full_name||p.patient_id||'Guest'):'Guest';
    };
    const guestRoom=key=>{
      if(String(key).startsWith('outside:'))return 'Outside visit';
      const p=guestOf(key);if(!p||!p.room_no)return '—';
      return `${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`;
    };
    function openBalanceList(kind){
      setBalanceGuest(null);
      setBalanceList(current=>current===kind?null:kind);
      setTimeout(()=>{const el=document.getElementById('accounts-balance-list');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},80);
    }
    const balanceField=balanceList==='advances'?'advance':'outstanding';
    const balanceRows=balanceList?realisation.perPatient
      .filter(r=>r[balanceField]>0.009)
      .map(r=>({...r,name:guestName(r.key),room:guestRoom(r.key)}))
      .sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})):[];
    const balanceTotal=balanceRows.reduce((t,r)=>t+r[balanceField],0);
    function guestDetails(r){
      const p=guestOf(r.key)||{};
      const isOutside=String(r.key).startsWith('outside:');
      const txns=rows.filter(t=>(t.patient_id||'__unassigned__')===r.key)
        .slice().sort((a,b)=>new Date(a.transaction_date||0)-new Date(b.transaction_date||0));
      const info=[
        [isOutside?'Invoice No.':'Guest ID',p.patient_id||'—'],
        ['Room / Bed',r.room],
        ...(isOutside?[]:[['Admission Date',p.admission_date?formatDateIN(p.admission_date):'—'],['Status',p.is_active===false?'Discharged / Inactive':'Active']]),
        ['Total Charges',money(r.gross)],
        ['Discounts',money(r.discount)],
        ['Net Charges',money(r.netCharges)],
        ['Received (Payments + Advances)',money(r.receipts)],
        ['Refunds',money(r.refund)],
        [r.outstanding>0.009?'Outstanding Amount':'Unadjusted Advance',money(r.outstanding>0.009?r.outstanding:r.advance)]
      ];
      return h('div',{className:'accounts-balance-detail',style:{padding:'14px 12px',background:'#fff7fb',borderRadius:12}},
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:'8px 18px',marginBottom:12}},
          info.map(([k,v])=>h('div',{key:k},h('small',{style:{display:'block',color:'#8a5a73'}},k),h('strong',null,v)))
        ),
        h('h4',{style:{margin:'6px 0'}},`All entries (${txns.length})`),
        h('div',{style:{overflowX:'auto'}},h('table',{className:'table',style:{width:'100%'}},
          h('thead',null,h('tr',null,['Date','Type','Category','Description','Mode','Amount'].map(t=>h('th',{key:t},t)))),
          h('tbody',null,
            txns.map(t=>h('tr',{key:t.id},
              h('td',null,formatDateIN(t.transaction_date)),
              h('td',null,t.transaction_type||'—'),
              h('td',null,t.category||'—'),
              h('td',null,t.description||'—'),
              h('td',null,t.payment_mode||'—'),
              h('td',{style:{textAlign:'right'}},money(t.amount))
            )),
            !txns.length&&h('tr',null,h('td',{colSpan:6,className:'empty'},'No entries.'))
          )
        )),
        h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}},
          !isOutside&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Payments','New Payment',{source:'Accounts Dashboard',patient_id:r.key})},'＋ Receive Payment'),
          !isOutside&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Final Billing','Final Billing',{source:'Accounts Dashboard',patient_id:r.key})},'📑 Final Billing'),
          isOutside&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate('Outside Samara Nursing Procedures')},'Open Outside Nursing invoices'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setBalanceGuest(null)},'Close details')
        )
      );
    }
    const balancePanel=balanceList&&h('section',{id:'accounts-balance-list',className:'accounts-panel',style:{marginBottom:20}},
      h('div',{className:'accounts-panel-head'},
        h('div',null,
          h('h3',null,balanceList==='advances'?'Unadjusted Advances — Guest-wise':'Outstanding Receivables — Guest-wise'),
          h('small',null,balanceList==='advances'
            ?'Guests whose receipts are more than their approved net charges. Tap a row for full details.'
            :'Guests with approved net charges still unpaid (includes Outside Nursing invoices). Tap a row for full details.')
        ),
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setBalanceList(null);setBalanceGuest(null)}},'Close')
      ),
      state.loading?h('p',null,'Loading…'):state.error?h('p',{role:'alert'},state.error):
      !balanceRows.length?h('p',{className:'empty'},balanceList==='advances'?'No unadjusted advances.':'No outstanding amounts. All Guests are fully paid.'):
      h('div',{style:{overflowX:'auto'}},h('table',{className:'table accounts-balance-table',style:{width:'100%'}},
        h('thead',null,h('tr',null,
          h('th',{style:{width:70}},'S.No'),h('th',null,'Guest Name'),h('th',null,'Room No.'),
          h('th',{style:{textAlign:'right'}},balanceList==='advances'?'Advance Amount':'Outstanding Amount'))),
        h('tbody',null,
          balanceRows.map((r,i)=>{
            const open=balanceGuest===r.key;
            const toggle=()=>setBalanceGuest(open?null:r.key);
            return h(React.Fragment,{key:r.key},
              h('tr',{tabIndex:0,role:'button','aria-expanded':open,onClick:toggle,
                onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}},
                style:{cursor:'pointer',background:open?'#fde7f1':undefined}},
                h('td',null,i+1),
                h('td',null,h('strong',null,r.name),' ',h('span',{style:{color:'#a91653'}},open?'▾':'▸')),
                h('td',null,r.room),
                h('td',{style:{textAlign:'right',fontWeight:700,color:balanceList==='advances'?'#1d4ed8':'#b42318'}},money(r[balanceField]))
              ),
              open&&h('tr',null,h('td',{colSpan:4,style:{padding:0}},guestDetails(r)))
            );
          }),
          h('tr',null,h('th',{colSpan:3},`Total (${balanceRows.length} Guest${balanceRows.length===1?'':'s'})`),h('th',{style:{textAlign:'right'}},money(balanceTotal)))
        )
      ))
    );

    return h('div',{className:'accounts-dashboard'},
      h('button',{type:'button',className:'accounts-panel outside-bills-shortcut',onClick:()=>dashboardNavigate(onNavigate,'Outside Bills Paid by Samara','Outside Bills Paid by Samara',{source:'Accounts Dashboard'})},
        h('span',null,h('strong',null,'Outside Bills Paid by Samara'),h('small',null,'View bills, handling fees, Guest charges and payments due to vendors.')),
        h('span',{'aria-hidden':'true'},'Open full details →')
      ),
      h('div',{className:'accounts-hero'},
        h('div',null,
          h('small',null,'FINANCE · BILLING · COLLECTIONS'),
          h('h3',null,'Accounts Command Centre'),
          h('p',null,profile?.role==='Admin'
            ?'Administrator and Accounts operations in one live financial workspace.'
            :'Live billing, collection, settlement and discharge-clearance workspace.'
          )
        ),
        h('div',{className:'accounts-actions'},
          h('button',{className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Payments','New Payment',{source:'Accounts Dashboard'})},'＋ New Payment'),
          h('button',{className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Accounts Reports','Accounts Reports',{source:'Accounts Dashboard'})},'▥ Reports'),
          h('button',{className:'btn btn-secondary',onClick:load},state.loading?'Loading…':'↻ Refresh')
        )
      ),

      h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate('Physiotherapy Dashboard')},'Open Physiotherapy Dashboard'),
      state.outside?.error&&h('p',{role:'alert'},state.outside.error),
      h('button',{className:'btn btn-secondary',onClick:()=>onNavigate('Outside Samara Nursing Procedures')},'Outside nursing invoices & receipts'),
      h('p',null,'Totals include resident billing and approved outside nursing invoices. Outside nursing: '+money(state.outside?.charges)+' invoiced · '+money(state.outside?.received)+' received · '+money(state.outside?.outstanding)+' outstanding.'),
      h('div',{className:'accounts-kpi-grid'},
        h('button',{type:'button',className:'accounts-kpi teal',onClick:()=>setBreakupOpen(v=>!v),'aria-expanded':breakupOpen,'aria-controls':'collection-breakup'},h('span',null,'Collection Breakup'),h('strong',null,'View breakup →'),h('small',null,'Total Charges · Realised · Pending by category')),
        kpis.map(([label,value,page,tone,note,isCount])=>h('button',{
          type:'button',className:`accounts-kpi ${tone}`,key:label,
          'aria-expanded':page.startsWith('list:')?balanceList===page.slice(5):undefined,
          onClick:()=>page.startsWith('list:')?openBalanceList(page.slice(5)):dashboardNavigate(onNavigate,page,label,{source:'Accounts Dashboard'})
        },
          h('span',null,label),
          h('strong',null,isCount?Number(value||0):money(value)),
          h('small',null,note)
        ))
      ),

      balancePanel,
      breakupOpen&&h('section',{id:'collection-breakup',className:'accounts-panel',style:{marginBottom:20}},
        h('div',{className:'accounts-panel-head'},h('h3',null,'Collection Breakup'),h('label',null,'Charge month ',h('input',{type:'month',value:breakupMonth,max:month,onChange:e=>{if(e.target.value){setBreakupMonth(e.target.value);setBreakupCategory(null)}}})),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setBreakupOpen(false)},'Close')),
        h('p',null,'Charges posted in the selected month, after discounts; settled through '+today+'. Payments and advances cover each patient’s oldest charges first (FIFO). Discounts are spread proportionately across that patient’s charges in the discount’s posting month; any excess reduces other charges oldest first. Refunds reduce available receipts. Outside nursing stays within its own invoice.'),
        h('p',null,'Realised here is the settlement of the selected month’s charges, and can differ from revenue realised during that month. Select a category for details.'),
        state.loading?h('p',null,'Loading complete billing history…'):state.error||state.outside?.error?h('p',{role:'alert'},'Collection Breakup unavailable: '+(state.error||state.outside.error)):
        h(React.Fragment,null,
          h('div',{style:{overflowX:'auto'}},h('table',{className:'table',style:{width:'100%'}},
            h('thead',null,h('tr',null,['Category','Total Charges','Realised','Pending'].map(t=>h('th',{key:t},t)))),
            h('tbody',null,breakup.categories.map(r=>h('tr',{key:r.name},h('td',null,h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setBreakupCategory(r.name)},r.name+' →')),...['total','realised','pending'].map(k=>h('td',{key:k},money(r[k]))))),h('tr',null,h('th',null,'Total'),...['total','realised','pending'].map(k=>h('th',{key:k},money(breakup.totals[k]))))))),
          h('p',null,'Unadjusted advances across all dates: '+money(breakup.advances)+'. These remain outside category totals until charges are raised.'),
          breakupCategory&&h('div',null,h('h4',null,breakupCategory+' — charge details'),
            breakup.details.filter(r=>r.group===breakupCategory).length===0?h('p',null,'No charges in this category for the selected month.'):
            h('div',{style:{overflowX:'auto'}},h('table',{className:'table',style:{width:'100%'}},h('thead',null,h('tr',null,['Date','Patient / Invoice','Description','Total Charges','Realised','Pending'].map(t=>h('th',{key:t},t)))),h('tbody',null,breakup.details.filter(r=>r.group===breakupCategory).map(r=>{const patient=state.patients.find(p=>p.id===r.patient_id);return h('tr',{key:r.id},h('td',null,r._day),h('td',null,patient?.full_name||r.invoice_number||'Unassigned'),h('td',null,r.description||r.category),...['total','realised','pending'].map(k=>h('td',{key:k},money(r[k]))))}))))
          )
        )
      ),

      h('div',{className:'accounts-dashboard-grid'},
        h('div',{className:'accounts-panel'},
          h('div',{className:'accounts-panel-head'},
            h('div',null,h('h3',null,'Collection by Payment Mode'),h('small',null,'All recorded payments and advances')),
            h('strong',null,money(collections))
          ),
          h('div',{className:'accounts-bars'},
            modeTotals.map(([mode,value])=>h('div',{className:'accounts-bar-row',key:mode},
              h('span',null,mode),
              h('div',{className:'accounts-bar-track'},
                h('div',{className:'accounts-bar-fill',style:{width:`${Math.max(0,value/maxMode*100)}%`}})
              ),
              h('strong',null,money(value))
            ))
          )
        ),

        h('div',{className:'accounts-panel'},
          h('div',{className:'accounts-panel-head'},
            h('div',null,h('h3',null,'Financial Position'),h('small',null,'Live consolidated totals'))
          ),
          h('div',{className:'accounts-status-list'},
            [
              ['Gross Charges',money(charges)],
              ['Discounts',money(discounts)],
              ['Net Charges',money(netCharges)],
              ['Realised Revenue',money(realisedRevenue)],
              ['Collections / Receipts',money(collections)],
              ['Unadjusted Advances',money(unadjustedAdvance)],
              ['Refunds',money(refundValue)],
              ['Net Outstanding',money(outstanding)]
            ].map(([label,value])=>h('button',{type:'button',className:'accounts-status-item',key:label,onClick:()=>label==='Net Outstanding'?openBalanceList('outstanding'):label==='Unadjusted Advances'?openBalanceList('advances'):dashboardNavigate(onNavigate,'Accounts Reports',label,{source:'Accounts Dashboard'}),style:{width:'100%',textAlign:'left',font:'inherit',cursor:'pointer'}},h('span',null,label),h('strong',null,value)))
          )
        )
      ),

      h(Section,{title:'Pending Charges by Patient',subtitle:'Select a patient to review only their pending charge requests'},
        state.requests.some(row=>(row.approval_status||'Pending')==='Pending')
          ?h('div',{className:'accounts-workflow-grid'},
            [...new Set(state.requests.filter(row=>(row.approval_status||'Pending')==='Pending').map(row=>row.patient_id).filter(Boolean))].map(patientId=>{
              const patient=state.patients.find(row=>row.id===patientId)||{};
              const count=state.requests.filter(row=>row.patient_id===patientId&&(row.approval_status||'Pending')==='Pending').length;
              return h('button',{key:patientId,type:'button',className:'btn btn-secondary',onClick:()=>openPatientChargeApprovals(patientId),style:{textAlign:'left',whiteSpace:'normal'}},
                `${formalName(patient)||patient.full_name||'Patient'} · ${patient.patient_id||''} · Room ${patient.room_no||'—'}-${patient.bed_no||'—'} · ${count} pending`);
            }))
          :h('p',null,state.loading?'Loading pending charges…':'No pending charge requests.')
      ),

      h(Section,{title:'Accounts Workflow',subtitle:'Open the required financial stage directly'},
        h('div',{className:'accounts-workflow-grid'},
          [
            ['🧾','Charge Approvals','Approve, partially approve or reject Nurse-raised charges.',pendingApprovals,'approvals'],
            ['💳','Payments','Receive Cash, UPI, RTGS or Card payments.',todayCollections?money(todayCollections):'Open','payments'],
            ['📑','Final Billing','Resident-wise ledger, discounts and net payable.',finalBills,'final-billing'],
            ['🚪','Discharge Clearance','Financially clear Management-approved discharges.',dischargeClearance,'clearance'],
            ['↩','Refunds','View and record payment or advance refunds.',money(refundValue),'refunds'],
            ['📊','Accounts Reports','Revenue, collection, ageing and patient-ledger reports.','Open','reports']
          ].map(([icon,title,text,value,tone])=>h('button',{
            type:'button',
            className:`accounts-workflow-card ${tone}`,
            key:title,
            onClick:()=>dashboardNavigate(onNavigate,title,title,{source:'Accounts Dashboard'})
          },
            h('div',{className:'accounts-workflow-top'},
              h('span',{className:'accounts-workflow-icon'},icon),
              h('span',{className:'accounts-workflow-value'},value)
            ),
            h('div',{className:'accounts-workflow-body'},
              h('strong',null,title),
              h('small',null,text)
            ),
            h('span',{className:'accounts-workflow-open'},h('span',null,'Open Module'),h('span',null,'→'))
          ))
        )
      )
    );
  }


