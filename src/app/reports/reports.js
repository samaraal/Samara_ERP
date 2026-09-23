function Reports(){
  React.useEffect(()=>{ensureAccountsWorkspaceStyle()},[]);
  const [state,setState]=React.useState({loading:true,patients:[],billing:[],incidents:[],discharges:[],profiles:[]});
  const [filters,setFilters]=React.useState({
    from:(()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10)})(),
    to:todayISOIndia(),
    patient_id:'',
    payment_mode:'All',
    transaction_type:'All'
  });

  const money=value=>`₹${Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
  const dateOnly=value=>String(value||'').slice(0,10);

  async function load(){
    setState(current=>({...current,loading:true}));
    const [patients,billing,incidents,discharges,profiles]=await Promise.all([
      client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active,admission_date'),
      client.from('billing_transactions')
        .select('id,patient_id,transaction_type,category,amount,payment_mode,payment_reference,description,transaction_date,entered_by,patients(title,full_name,patient_id,room_no,bed_no)')
        .order('transaction_date',{ascending:false}).limit(5000),
      client.from('incidents').select('id,status'),
      client.from('patient_discharges').select('id,status,management_status,accounts_status,created_at'),
      client.from('profiles').select('id,auth_user_id,title,full_name,login_id,role')
    ]);
    setState({
      loading:false,
      patients:patients.data||[],
      billing:billing.data||[],
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

  const sum=types=>filtered.filter(row=>types.includes(row.transaction_type))
    .reduce((total,row)=>total+Number(row.amount||0),0);
  const charges=sum(['Charge']);
  const collections=sum(['Payment','Advance']);
  const discounts=sum(['Discount']);
  const refunds=sum(['Refund']);
  const outstanding=Math.max(0,charges-collections-discounts+refunds);

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

  const modeTotals=['Cash','UPI','RTGS','Card Payment'].map(mode=>[
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
      'Date & Time','Voucher / Reference No.','Resident ID','Patient Name',
      'Transaction Type','Payment Mode','Amount','Received / Entered By','Description'
    ];
    const lines=paymentRows.map(row=>[
      formatDateTimeIN(row.transaction_date),
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
    const header=['Date','Patient','Resident ID','Type','Category','Payment Mode','Voucher / Reference','Amount','Description'];
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

    h(Section,{title:'Payment Report Filters',subtitle:'Choose period, patient, transaction type and payment mode'},
      h('div',{className:'accounts-report-filters'},
        miniInput('From Date',filters.from,v=>setFilters({...filters,from:v}),false,'date'),
        miniInput('To Date',filters.to,v=>setFilters({...filters,to:v}),false,'date'),
        h('div',{className:'field'},h('label',null,'Patient'),h('select',{
          value:filters.patient_id,onChange:e=>setFilters({...filters,patient_id:e.target.value})
        },h('option',{value:''},'All patients'),state.patients.map(patient=>h('option',{key:patient.id,value:patient.id},
          `${formalName(patient)||patient.full_name} · ${patient.patient_id||'No ID'}`
        )))),
        miniSelect('Transaction Type',filters.transaction_type,['All','Payment','Advance','Refund'],v=>setFilters({...filters,transaction_type:v})),
        miniSelect('Payment Mode',filters.payment_mode,['All','Cash','UPI','RTGS','Card Payment'],v=>setFilters({...filters,payment_mode:v})),
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

    h(LogTable,{
      title:`Payment Report (${paymentRows.length})`,
      subtitle:'Date-wise receipt, voucher/reference number and payment mode register',
      heads:['Date & Time','Voucher / Reference No.','Resident ID','Patient Name','Type','Mode','Amount','Received / Entered By'],
      rows:paymentRows.map(row=>[
        formatDateTimeIN(row.transaction_date),
        row.payment_reference||'—',
        row.patients?.patient_id||'—',
        formalName(row.patients||{})||row.patients?.full_name||'—',
        row.transaction_type||'—',
        row.payment_mode||'—',
        money(row.amount),
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
              h('td',null,formatDateTimeIN(row.transaction_date)),
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
              h('td',null,formatDateTimeIN(row.transaction_date)),
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

    h(LogTable,{
      title:`Resident-wise Financial Ledger (${patientLedger.length})`,
      subtitle:'Charges, receipts, concessions, refunds and balance',
      heads:['Patient','Resident ID','Room / Bed','Charges','Paid / Advance','Discount','Refund','Balance','Status'],
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

    h(LogTable,{
      title:`Detailed Transaction Register (${filtered.length})`,
      subtitle:'Filtered billing, payment, discount and refund history',
      heads:['Date','Patient','Resident ID','Type','Category','Mode','Voucher / Reference','Amount','Description'],
      rows:filtered.map(row=>[
        formatDateTimeIN(row.transaction_date),
        formalName(row.patients||{})||row.patients?.full_name||'—',
        row.patients?.patient_id||'—',
        row.transaction_type||'—',
        row.category||'—',
        row.payment_mode||'—',
        row.payment_reference||'—',
        money(row.amount),
        row.description||'—'
      ])
    })
  );
}

