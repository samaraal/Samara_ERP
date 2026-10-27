function Reports(){
  React.useEffect(()=>{ensureAccountsWorkspaceStyle()},[]);
  const [state,setState]=React.useState({loading:true,patients:[],billing:[],incidents:[],discharges:[],profiles:[]});
  const [filters,setFilters]=React.useState({
    from:(()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10)})(),
    to:todayISOIndia(),
    patient_id:'',
    payment_mode:'All',
    transaction_type:'All',source:'All',register_type:'All'
  });
  // 2.18.103: open the matching period + section when a box on the Accounts Dashboard is tapped.
  const REPORT_START='2026-08-27'; // Samara inauguration — no earlier dates needed
  const [dashFocus]=React.useState(()=>{
    const intent=readDashboardIntent('Accounts Reports');
    const label=String(intent?.focus||'');
    const today=todayISOIndia(),monthStart=today.slice(0,8)+'01';
    const map={
      'Collections Today':{from:today,to:today,section:'report-payments'},
      'Collections This Month':{from:monthStart,to:today,section:'report-payments'},
      'Gross Charges This Month':{from:monthStart,to:today,register_type:'Charge',section:'report-register'},
      'Discounts This Month':{from:monthStart,to:today,register_type:'Discount',section:'report-register'},
      'Net Charges This Month':{from:monthStart,to:today,register_type:'Charges & Discounts',section:'report-register'},
      'Realised Revenue This Month':{from:monthStart,to:today,section:'report-ledger'},
      'Average Daily Realised Revenue':{from:REPORT_START,to:today,section:'report-ledger'},
      'Gross Charges':{from:REPORT_START,to:today,register_type:'Charge',section:'report-register'},
      'Discounts':{from:REPORT_START,to:today,register_type:'Discount',section:'report-register'},
      'Net Charges':{from:REPORT_START,to:today,register_type:'Charges & Discounts',section:'report-register'},
      'Realised Revenue':{from:REPORT_START,to:today,section:'report-ledger'},
      'Collections / Receipts':{from:REPORT_START,to:today,section:'report-payments'},
      'Refunds':{from:REPORT_START,to:today,transaction_type:'Refund',section:'report-payments'}
    };
    return map[label]?{label,...map[label]}:null;
  });
  // 2.18.174: the long "every transaction" register is folded; opened by tapping its bar or from a Dashboard box.
  const [registerOpen,setRegisterOpen]=React.useState(()=>dashFocus?.section==='report-register');
  React.useEffect(()=>{
    if(!dashFocus)return;
    const {label,section,...preset}=dashFocus;
    setFilters(current=>({...current,...preset}));
  },[]);
  React.useEffect(()=>{
    if(!dashFocus||state.loading)return;
    const t=setTimeout(()=>{const el=document.getElementById(dashFocus.section);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},150);
    return()=>clearTimeout(t);
  },[state.loading]);

  const money=value=>`₹${Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
  const dateOnly=value=>String(value||'').slice(0,10);
  const transactionDate=row=>row.source==='Outside Nursing'?formatDateIN(row.transaction_date):formatDateTimeIN(row.transaction_date);

  async function load(){
    setState(current=>({...current,loading:true}));
    const [patients,billing,incidents,discharges,profiles,outside]=await Promise.all([
      client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active,admission_date'),
      client.from('billing_transactions')
        .select('id,patient_id,transaction_type,category,amount,payment_mode,payment_reference,description,transaction_date,entered_by,patients(title,full_name,patient_id,room_no,bed_no)')
        .order('transaction_date',{ascending:false}).limit(5000),
      client.from('incidents').select('id,status'),
      client.from('patient_discharges').select('id,status,management_status,accounts_status,created_at'),
      client.from('profiles').select('id,auth_user_id,title,full_name,login_id,role'),
      loadOutsideNursingFinance()
    ]);
    setState({
      loading:false,
      patients:[...(patients.data||[]),...outside.patients],
      billing:[...(billing.data||[]),...outside.rows],outside,
      incidents:incidents.data||[],
      discharges:discharges.data||[],
      profiles:profiles.data||[]
    });
  }
  React.useEffect(()=>{load()},[]);

  const profileName=id=>{
    const profile=state.profiles.find(row=>row.id===id||row.auth_user_id===id);
    return profile?(formalName(profile)||profile.full_name||profile.login_id||'Staff'):'—';
  };

  const filtered=state.billing.filter(row=>{
    if(filters.source==='Outside Nursing'&&row.source!=='Outside Nursing')return false;
    if(filters.source==='Resident Billing'&&row.source==='Outside Nursing')return false;
    const date=dateOnly(row.transaction_date);
    if(filters.from&&date<filters.from)return false;
    if(filters.to&&date>filters.to)return false;
    if(filters.patient_id&&row.patient_id!==filters.patient_id)return false;
    if(filters.payment_mode!=='All'&&String(row.payment_mode||'')!==filters.payment_mode)return false;
    return true;
  });

  const paymentRows=filtered.filter(row=>{
    if(!['Payment','Advance','Refund'].includes(row.transaction_type))return false;
    if(filters.transaction_type!=='All'&&row.transaction_type!==filters.transaction_type)return false;
    return true;
  });

  const receivedRows=paymentRows.filter(row=>['Payment','Advance'].includes(row.transaction_type));
  const refundRows=paymentRows.filter(row=>row.transaction_type==='Refund');
  const totalReceived=receivedRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const totalRefunds=refundRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const netCollection=totalReceived-totalRefunds;
  const paymentModeTotal=mode=>receivedRows
    .filter(row=>String(row.payment_mode||'')===mode)
    .reduce((sum,row)=>sum+Number(row.amount||0),0);

  const registerRows=filtered.filter(row=>{
    const t=filters.register_type;
    if(t==='All')return true;
    if(t==='Charges & Discounts')return ['Charge','Discount'].includes(row.transaction_type);
    return row.transaction_type===t;
  });

  const sum=types=>filtered.filter(row=>types.includes(row.transaction_type))
    .reduce((total,row)=>total+Number(row.amount||0),0);
  const charges=sum(['Charge']);
  const collections=sum(['Payment','Advance']);
  const discounts=sum(['Discount']);
  const refunds=sum(['Refund']);
  const accountBalances=new Map();
  filtered.forEach(row=>{const sign=row.transaction_type==='Charge'||row.transaction_type==='Refund'?1:-1;accountBalances.set(row.patient_id,(accountBalances.get(row.patient_id)||0)+sign*Number(row.amount||0));});
  const outstanding=[...accountBalances.values()].reduce((sum,value)=>sum+Math.max(0,value),0);

  const patientLedger=state.patients.map(patient=>{
    const rows=filtered.filter(row=>row.patient_id===patient.id);
    const byType=type=>rows.filter(row=>row.transaction_type===type).reduce((a,row)=>a+Number(row.amount||0),0);
    const patientCharges=byType('Charge');
    const paid=byType('Payment')+byType('Advance');
    const discount=byType('Discount');
    const refund=byType('Refund');
    const balance=patientCharges-paid-discount+refund;
    return {patient,charges:patientCharges,paid,discount,refund,balance};
  }).filter(row=>row.charges||row.paid||row.discount||row.refund);

  const ageing={current:0,d8_15:0,d16_30:0,over30:0};
  const now=new Date();
  filtered.filter(row=>row.transaction_type==='Charge').forEach(row=>{
    const age=Math.max(0,Math.floor((now-new Date(row.transaction_date))/(86400000)));
    const value=Number(row.amount||0);
    if(age<=7)ageing.current+=value;
    else if(age<=15)ageing.d8_15+=value;
    else if(age<=30)ageing.d16_30+=value;
    else ageing.over30+=value;
  });

  const modeTotals=['Cash','UPI','RTGS','Card Payment','Razorpay'].map(mode=>[
    mode,
    filtered.filter(row=>['Payment','Advance'].includes(row.transaction_type)&&String(row.payment_mode||'')===mode)
      .reduce((sum,row)=>sum+Number(row.amount||0),0)
  ]);

  const cashVoucherRows=paymentRows.filter(row=>
    row.payment_mode==='Cash'&&String(row.payment_reference||'').startsWith('CV-')
  );
  const cardVoucherRows=paymentRows.filter(row=>
    row.payment_mode==='Card Payment'&&String(row.payment_reference||'').startsWith('CARDV-')
  );

  function setToday(){
    const today=todayISOIndia();
    setFilters(current=>({...current,from:today,to:today}));
  }

  function exportPaymentsCSV(){
    const header=[
      'Date & Time','Voucher / Reference No.','Patient / Invoice ID','Patient Name',
      'Transaction Type','Payment Mode','Amount','Received / Entered By','Description'
    ];
    const lines=paymentRows.map(row=>[
      transactionDate(row),
      row.payment_reference||'',
      row.patients?.patient_id||'',
      formalName(row.patients||{})||row.patients?.full_name||'',
      row.transaction_type||'',
      row.payment_mode||'',
      Number(row.amount||0),
      profileName(row.entered_by),
      String(row.description||'').replace(/\r?\n/g,' ')
    ]);
    const csv=[header,...lines].map(cols=>cols.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob=new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`Samara_Payment_Report_${filters.from}_to_${filters.to}.csv`;
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }

  function exportCSV(){
    const header=['Date','Patient','Patient / Invoice ID','Type','Category','Payment Mode','Voucher / Reference','Amount','Description'];
    const lines=filtered.map(row=>[
      formatDateIN(row.transaction_date),
      formalName(row.patients||{})||row.patients?.full_name||'',
      row.patients?.patient_id||'',
      row.transaction_type||'',
      row.category||'',
      row.payment_mode||'',
      row.payment_reference||'',
      Number(row.amount||0),
      String(row.description||'').replace(/\r?\n/g,' ')
    ]);
    const csv=[header,...lines].map(cols=>cols.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob=new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`Samara_Accounts_Report_${filters.from}_to_${filters.to}.csv`;
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }

  return h(React.Fragment,null,
    h('div',{className:'accounts-hero'},
      h('div',null,
        h('small',null,'MANAGEMENT INFORMATION SYSTEM'),
        h('h3',null,'Accounts Reports & Analytics'),
        h('p',null,'Payment reports, daily collections, voucher registers, patient ledgers and outstanding analysis.')
      ),
      h('div',{className:'accounts-report-actions'},
        h('button',{className:'btn btn-secondary',onClick:load},state.loading?'Loading…':'↻ Refresh'),
        h('button',{className:'btn btn-secondary',onClick:()=>setTimeout(()=>window.print(),80)},'🖨 Print / PDF'),
        h('button',{className:'btn btn-secondary',onClick:exportPaymentsCSV},'⇩ Payment CSV'),
        h('button',{className:'btn btn-secondary',onClick:exportCSV},'⇩ Full Accounts CSV')
      )
    ),

    state.outside?.error&&h('p',{role:'alert'},state.outside.error),
    dashFocus&&h('div',{className:'record-focus-banner',role:'status',style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',padding:'10px 14px',background:'#fde7f1',borderRadius:12,margin:'8px 0'}},
      h('span',null,'Opened from Accounts Dashboard: ',h('strong',null,dashFocus.label),` · ${formatDateIN(filters.from)} to ${formatDateIN(filters.to)}`),
      h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{const el=document.getElementById(dashFocus.section);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}},'Go to section ↓')
    ),
    h('p',null,'Includes approved Outside Nursing invoices and saved receipts, identified by SN invoice number. Pending and voided procedures are excluded.'),
    h(Section,{title:'Payment Report Filters',subtitle:'Choose period, patient, transaction type and payment mode'},
      h('div',{className:'accounts-report-filters'},
        miniInput('From Date',filters.from,v=>setFilters({...filters,from:v}),false,'date'),
        miniInput('To Date',filters.to,v=>setFilters({...filters,to:v}),false,'date'),
        h('div',{className:'field'},h('label',null,'Patient'),h('select',{
          value:filters.patient_id,onChange:e=>setFilters({...filters,patient_id:e.target.value})
        },h('option',{value:''},'All patients'),state.patients.map(patient=>h('option',{key:patient.id,value:patient.id},
          `${formalName(patient)||patient.full_name} · ${patient.patient_id||'No ID'}`
        )))),
        miniSelect('Service',filters.source,['All','Resident Billing','Outside Nursing'],v=>setFilters({...filters,source:v})),
        miniSelect('Transaction Type',filters.transaction_type,['All','Payment','Advance','Refund'],v=>setFilters({...filters,transaction_type:v})),
        miniSelect('Payment Mode',filters.payment_mode,['All','Cash','UPI','RTGS','Card Payment','Razorpay'],v=>setFilters({...filters,payment_mode:v})),
        miniSelect('Register Type',filters.register_type,['All','Charge','Discount','Charges & Discounts','Payment','Advance','Refund'],v=>setFilters({...filters,register_type:v})),
        h('div',{className:'field'},h('label',null,'Quick Report'),h('button',{type:'button',className:'btn btn-secondary',onClick:setToday},'Today / Daily Collection'))
      )
    ),

    h('div',{className:'accounts-kpi-grid payment-report-kpis'},
      [
        ['Total Received',totalReceived,'green'],
        ['Cash',paymentModeTotal('Cash'),'green'],
        ['UPI',paymentModeTotal('UPI'),'teal'],
        ['RTGS',paymentModeTotal('RTGS'),'blue'],
        ['Card Payment',paymentModeTotal('Card Payment'),'purple'],
        ['Refunds',totalRefunds,'red'],
        ['Net Collection',netCollection,'orange']
      ].map(([label,value,tone])=>h('div',{className:`accounts-kpi ${tone}`,key:label},
        h('span',null,label),h('strong',null,money(value)),h('small',null,`${formatDateIN(filters.from)} to ${formatDateIN(filters.to)}`)
      ))
    ),

    h('div',{id:'report-payments'}),
    h(LogTable,{
      title:`Payment Report (${paymentRows.length})`,
      subtitle:'Date-wise receipt, voucher/reference number and payment mode register',
      // 2.18.174: "Send Receipt" first, so staff never scroll sideways to act
      heads:['Receipt','Date & Time','Patient','Type','Mode','Amount','Voucher / Reference No.','Received / Entered By'],
      rows:paymentRows.map(row=>[
        ['Payment','Advance'].includes(row.transaction_type)&&row.source!=='Outside Nursing'&&row.id
          ?h(SendReceiptButton,{transactionId:row.id,amountText:money(row.amount)}):'—',
        transactionDate(row),
        h('span',null,formalName(row.patients||{})||row.patients?.full_name||'—',row.patients?.patient_id?h('small',{style:{display:'block',color:'#8a5a70'}},row.patients.patient_id):null),
        row.transaction_type||'—',
        row.payment_mode||'—',
        money(row.amount),
        row.payment_reference||'—',
        profileName(row.entered_by)
      ])
    }),

    h('div',{className:'accounts-dashboard-grid'},
      h('div',{className:'accounts-panel'},
        h('div',{className:'accounts-panel-head'},
          h('div',null,h('h3',null,`Cash Voucher Register (${cashVoucherRows.length})`),h('small',null,'System-generated cash vouchers'))
        ),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Voucher No.','Date','Patient','Type','Amount'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,
            cashVoucherRows.map(row=>h('tr',{key:row.id},
              h('td',null,row.payment_reference||'—'),
              h('td',null,transactionDate(row)),
              h('td',null,formalName(row.patients||{})||row.patients?.full_name||'—'),
              h('td',null,row.transaction_type||'—'),
              h('td',null,money(row.amount))
            )),
            !cashVoucherRows.length&&h('tr',null,h('td',{colSpan:5,className:'empty'},'No cash vouchers for the selected period.'))
          )
        ))
      ),
      h('div',{className:'accounts-panel'},
        h('div',{className:'accounts-panel-head'},
          h('div',null,h('h3',null,`Card Voucher Register (${cardVoucherRows.length})`),h('small',null,'System-generated card payment vouchers'))
        ),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Voucher No.','Date','Patient','Type','Amount'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,
            cardVoucherRows.map(row=>h('tr',{key:row.id},
              h('td',null,row.payment_reference||'—'),
              h('td',null,transactionDate(row)),
              h('td',null,formalName(row.patients||{})||row.patients?.full_name||'—'),
              h('td',null,row.transaction_type||'—'),
              h('td',null,money(row.amount))
            )),
            !cardVoucherRows.length&&h('tr',null,h('td',{colSpan:5,className:'empty'},'No card vouchers for the selected period.'))
          )
        ))
      )
    ),

    h('div',{className:'accounts-dashboard-grid'},
      h('div',{className:'accounts-panel'},
        h('div',{className:'accounts-panel-head'},h('div',null,h('h3',null,'Outstanding Ageing Analysis'),h('small',null,'Gross charge ageing for the selected period'))),
        h('div',{className:'accounts-mode-grid'},
          [
            ['0–7 Days',ageing.current],
            ['8–15 Days',ageing.d8_15],
            ['16–30 Days',ageing.d16_30],
            ['Above 30 Days',ageing.over30]
          ].map(([label,value])=>h('div',{className:'accounts-mode-card',key:label},h('span',null,label),h('strong',null,money(value))))
        )
      ),
      h('div',{className:'accounts-panel'},
        h('div',{className:'accounts-panel-head'},h('div',null,h('h3',null,'Collections by Mode'),h('small',null,'Payments and advances'))),
        h('div',{className:'accounts-status-list'},
          modeTotals.map(([label,value])=>h('div',{className:'accounts-status-item',key:label},h('span',null,label),h('strong',null,money(value))))
        )
      )
    ),

    h('div',{id:'report-ledger'}),
    h(LogTable,{
      title:`Patient / Outside Invoice Financial Ledger (${patientLedger.length})`,
      subtitle:'Charges, receipts, concessions, refunds and balance',
      heads:['Patient','Patient / Invoice ID','Room / Bed','Charges','Paid / Advance','Discount','Refund','Balance','Status'],
      rows:patientLedger.map(row=>[
        formalName(row.patient)||row.patient.full_name,
        row.patient.patient_id||'—',
        row.patient.room_no?`${row.patient.room_no}${row.patient.bed_no?`-${row.patient.bed_no}`:''}`:'—',
        money(row.charges),money(row.paid),money(row.discount),money(row.refund),
        money(Math.max(0,row.balance)),
        h('span',{className:'badge',style:row.balance<=0.009?{background:'#fae7f0',color:'#7a1247'}:row.paid>0?{background:'#fff4df',color:'#9a6700'}:{background:'#ffeded',color:'#b42318'}},
          row.balance<=0.009?'Paid':row.paid>0?'Partially Paid':'Outstanding'
        )
      ])
    }),

    h('div',{id:'report-register'}),
    h('details',{open:registerOpen,onToggle:e=>setRegisterOpen(e.currentTarget.open),style:{margin:'12px 0'}},
    h('summary',{style:{cursor:'pointer',padding:'12px 16px',borderRadius:'14px',background:'linear-gradient(90deg,#fde7f1,#fff5fa)',color:'#7a1247',fontWeight:700,listStyle:'revert'}},
      `${registerOpen?'Hide':'Show'} all transactions (${registerRows.length}) — every charge, payment, discount and refund`),
    h(LogTable,{
      title:`Detailed Transaction Register (${registerRows.length})`,
      subtitle:filters.register_type==='All'?'Filtered billing, payment, discount and refund history':`Showing ${filters.register_type} entries only`,
      heads:['Date','Patient','Patient / Invoice ID','Type','Category','Mode','Voucher / Reference','Amount','Description'],
      rows:registerRows.map(row=>[
        transactionDate(row),
        formalName(row.patients||{})||row.patients?.full_name||'—',
        row.patients?.patient_id||'—',
        row.transaction_type||'—',
        row.category||'—',
        row.payment_mode||'—',
        row.payment_reference||'—',
        money(row.amount),
        row.description||'—'
      ])
    }))
  );
}

