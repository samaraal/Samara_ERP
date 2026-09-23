  function FinalBillingView({profile,onNavigate}){
    React.useEffect(()=>{ensureAccountsWorkspaceStyle()},[]);
    const [patients]=usePatients();
    const [patientId,setPatientId]=React.useState('');
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [loading,setLoading]=React.useState(false);
    const [message,setMessage]=React.useState('');

    const patient=patients.find(row=>row.id===patientId)||null;
    const money=value=>`₹${Number(value||0).toLocaleString('en-IN',{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    })}`;

    async function loadBill(nextPatientId=patientId){
      if(!nextPatientId){
        setRows([]);
        return;
      }
      setLoading(true);
      setMessage('');
      const {data,error}=await client.from('billing_transactions')
        .select('*')
        .eq('patient_id',nextPatientId)
        .order('transaction_date',{ascending:true});
      if(error){
        setRows([]);
        setMessage(error.message||'Complete bill could not be loaded.');
      }else{
        setRows(data||[]);
      }
      setLoading(false);
    }

    React.useEffect(()=>{if(patientId)loadBill(patientId)},[patientId]);

    const groupedCharges=rows.filter(row=>row.transaction_type==='Charge').reduce((groups,row)=>{
      const key=row.category||'Other Charges';
      if(!groups[key])groups[key]={category:key,amount:0,items:[]};
      groups[key].amount+=Number(row.amount||0);
      groups[key].items.push(row);
      return groups;
    },{});

    const totals=rows.reduce((sum,row)=>{
      const type=row.transaction_type||'Charge';
      sum[type]=(sum[type]||0)+Number(row.amount||0);
      return sum;
    },{Charge:0,Payment:0,Advance:0,Discount:0,Refund:0});

    const receipts=totals.Payment+totals.Advance;
    const netPayable=Math.max(0,totals.Charge-receipts-totals.Discount+totals.Refund);
    const advanceBalance=Math.max(0,receipts+totals.Discount-totals.Charge-totals.Refund);
    const billStatus=netPayable<=0.009?'PAID / SETTLED':receipts>0?'PARTIALLY PAID':'PAYMENT PENDING';
    const invoiceNo=patient
      ?`SC-${patient.patient_id||String(patient.id).slice(0,8)}-${todayISOIndia().replaceAll('-','')}`
      :'—';

    function printCompleteBill(){
      if(!patient){
        setMessage('Select a patient before printing the complete bill.');
        return;
      }
      const win=window.open('','_blank','width=1100,height=900');
      if(!win){
        setMessage('Pop-up was blocked. Please allow pop-ups and try again.');
        return;
      }

      const chargeRows=Object.values(groupedCharges);
      const transactionRows=rows.filter(row=>['Payment','Advance','Discount','Refund'].includes(row.transaction_type));

      const billDateOnly=value=>{
        const raw=String(value||'').slice(0,10);
        if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
          const [y,m,d]=raw.split('-');
          return `${d}-${m}-${y}`;
        }
        return raw||'—';
      };
      const simplifyChargeDescription=(category,items)=>{
        if(!['Room Charges','Nursing Charges'].includes(category))return null;
        const dated=(items||[]).map(item=>({
          date:String(item.source_date||item.transaction_date||'').slice(0,10),
          amount:Number(item.amount||0)
        })).filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.date))
          .sort((a,b)=>a.date.localeCompare(b.date));
        if(!dated.length)return null;
        const total=dated.reduce((sum,item)=>sum+item.amount,0);
        return {
          text:`${dated.length} day${dated.length===1?'':'s'} (from ${billDateOnly(dated[0].date)} to ${billDateOnly(dated[dated.length-1].date)})`,
          total
        };
      };

      const itemHtml=chargeRows.length
        ?chargeRows.map((group,index)=>{
          const simple=simplifyChargeDescription(group.category,group.items);
          const rawDetail=group.items.map(item=>item.description||'').filter(Boolean).join(' | ')||'—';
          const detail=simple
            ?simple.text
            :rawDetail.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1');
          return `
          <tr>
            <td>${index+1}</td>
            <td>
              <strong>${escapeHtml(group.category)}</strong>
              <div class="detail">${escapeHtml(detail)}</div>
            </td>
            <td>${escapeHtml(String(group.items.length))}</td>
            <td class="amount">${escapeHtml(money(group.amount))}</td>
          </tr>
        `}).join('')
        :`<tr><td colspan="4" class="empty">No charges recorded.</td></tr>`;

      const paymentHtml=transactionRows.length
        ?transactionRows.map((row,index)=>`
          <tr>
            <td>${index+1}</td>
            <td>${escapeHtml(formatDateTimeIN(row.transaction_date))}</td>
            <td>${escapeHtml(row.transaction_type||'—')}</td>
            <td>${escapeHtml(row.payment_mode||'—')}</td>
            <td>${escapeHtml(row.description||'—')}</td>
            <td class="amount">${escapeHtml(money(row.amount))}</td>
          </tr>
        `).join('')
        :`<tr><td colspan="6" class="empty">No payments, advances, discounts or refunds recorded.</td></tr>`;

      const roomBed=patient.room_no
        ?`${patient.room_no}${patient.bed_no?` / Bed ${patient.bed_no}`:''}`
        :'—';

      // Bill header branding: use the standard Samara logo already shipped with the ERP.
      // Absolute URL is used so the image also loads reliably inside the print pop-up window.
      const billLogoUrl=new URL('assets/samara-logo.png',window.location.href).href;
      win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Complete Bill - ${escapeHtml(formalName(patient)||patient.full_name||'Patient')}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#fff5fa;font-family:Arial,sans-serif;color:#382333}
  .sheet{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:14mm;box-shadow:0 10px 32px #0002}
  .head{display:flex;justify-content:space-between;gap:20px;padding-bottom:14px;border-bottom:3px solid #b01264}
  .brand{display:flex;align-items:center;min-width:0}
  .brand-logo{display:block;width:225px;max-width:100%;height:100px;object-fit:contain;object-position:left center}
  .brand-fallback{display:none}
  .brand-fallback h1{margin:0;color:#7a1247;font-size:26px}
  .brand-fallback p{margin:4px 0;color:#735d69}
  .invoice{text-align:right}
  .invoice strong{display:block;font-size:19px;color:#b01264}
  .invoice span{display:block;margin-top:5px;font-size:12px}
  .title{text-align:center;margin:18px 0 12px}
  .title h2{margin:0;font-size:22px}
  .title p{margin:5px 0;color:#735d69;font-size:12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;padding:12px;border:1px solid #ead0de;border-radius:10px;background:#fffafd}
  .field{display:grid;grid-template-columns:130px 1fr;gap:8px;font-size:12px;padding:3px 0}
  .field b{color:#624858}
  h3{margin:19px 0 8px;font-size:15px;color:#7a1247}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c);color:#fff;text-align:left;padding:8px;border:1px solid #b01264}
  td{padding:8px;border:1px solid #ecd5e1;vertical-align:top}
  .amount{text-align:right;white-space:nowrap;font-weight:bold}
  .detail{margin-top:4px;color:#7b6571;font-size:10px;line-height:1.35}
  .empty{text-align:center;color:#7b6571;padding:18px}
  .summary{width:44%;margin:16px 0 0 auto;border:1px solid #ead0de;border-radius:10px;overflow:hidden}
  .summary-row{display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #f0dce7;font-size:12px}
  .summary-row:last-child{border-bottom:0}
  .summary-row.total{background:#7a1247;color:#fff;font-size:15px;font-weight:bold}
  .status{margin-top:14px;padding:10px;text-align:center;border-radius:9px;font-weight:bold;background:${netPayable<=0.009?'#fae7f0':'#fff2e2'};color:${netPayable<=0.009?'#7a1247':'#a65300'}}
  .notes{margin-top:18px;padding:10px;border:1px solid #ecd5e1;border-radius:9px;font-size:11px;color:#735d69}
  .signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:38px;text-align:center;font-size:11px}
  .signatures div{padding-top:28px;border-top:1px solid #735d69}
  .footer{margin-top:30px;padding-top:10px;border-top:1px solid #ecd5e1;text-align:center;font-size:10px;color:#7b6571}
  .print{display:block;margin:16px auto;padding:11px 22px;border:0;border-radius:8px;background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c);color:#fff;font-weight:bold;cursor:pointer}
  @media print{
    body{background:#fff}
    .sheet{width:auto;min-height:auto;margin:0;box-shadow:none;padding:8mm}
    .brand-logo{width:215px;height:96px}
    .print{display:none}
    @page{size:A4;margin:8mm}
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <div class="brand">
      <img
        class="brand-logo"
        src="${escapeHtml(billLogoUrl)}"
        alt="Samara Assisted Living"
        onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
      >
      <div class="brand-fallback">
        <h1>SAMARA HEALTH CARE LLP</h1>
        <p>Samara Care Assisted Living</p>
        <p>Complete Patient Bill & Account Statement</p>
      </div>
    </div>
    <div class="invoice">
      <strong>${escapeHtml(invoiceNo)}</strong>
      <span>Bill Date: ${escapeHtml(formatDateIN(new Date()))}</span>
      <span>Prepared By: ${escapeHtml(formalName(profile)||profile?.login_id||'Authorised User')}</span>
    </div>
  </div>

  <div class="title">
    <h2>FINAL / COMPLETE BILL</h2>
    <p>System-generated patient financial statement</p>
  </div>

  <div class="grid">
    <div class="field"><b>Patient Name</b><span>${escapeHtml(formalName(patient)||patient.full_name||'—')}</span></div>
    <div class="field"><b>Resident ID</b><span>${escapeHtml(patient.patient_id||'—')}</span></div>
    <div class="field"><b>Room / Bed</b><span>${escapeHtml(roomBed)}</span></div>
    <div class="field"><b>Admission Date</b><span>${escapeHtml(formatDateIN(patient.admission_date))}</span></div>
    <div class="field"><b>Mobile</b><span>${escapeHtml(patient.mobile||patient.attendant_phone||'—')}</span></div>
    <div class="field"><b>Diagnosis</b><span>${escapeHtml(patient.diagnosis||'—')}</span></div>
    <div class="field"><b>Referred / Treating Doctor</b><span>${escapeHtml(patient.treating_doctor||patient.referring_doctor||'—')}</span></div>
    <div class="field"><b>Bill Status</b><span>${escapeHtml(billStatus)}</span></div>
  </div>

  <h3>1. Charges Summary</h3>
  <table>
    <thead><tr><th style="width:42px">Sl.</th><th>Charge Category / Particulars</th><th style="width:70px">Entries</th><th style="width:120px;text-align:right">Amount</th></tr></thead>
    <tbody>${itemHtml}</tbody>
  </table>

  <h3>2. Payments, Advances, Discounts and Refunds</h3>
  <table>
    <thead><tr><th style="width:38px">Sl.</th><th style="width:125px">Date</th><th style="width:80px">Type</th><th style="width:90px">Mode</th><th>Reference / Description</th><th style="width:110px;text-align:right">Amount</th></tr></thead>
    <tbody>${paymentHtml}</tbody>
  </table>

  <div class="summary">
    <div class="summary-row"><span>Gross Charges</span><strong>${escapeHtml(money(totals.Charge))}</strong></div>
    <div class="summary-row"><span>Payments Received</span><strong>${escapeHtml(money(totals.Payment))}</strong></div>
    <div class="summary-row"><span>Advance Received</span><strong>${escapeHtml(money(totals.Advance))}</strong></div>
    <div class="summary-row"><span>Admin-approved Discount</span><strong>${escapeHtml(money(totals.Discount))}</strong></div>
    <div class="summary-row"><span>Refunds</span><strong>${escapeHtml(money(totals.Refund))}</strong></div>
    <div class="summary-row total"><span>NET PAYABLE</span><strong>${escapeHtml(money(netPayable))}</strong></div>
    ${advanceBalance>0?`<div class="summary-row"><span>Advance Balance / Refundable</span><strong>${escapeHtml(money(advanceBalance))}</strong></div>`:''}
  </div>

  <div class="status">${escapeHtml(billStatus)}</div>

  <div class="notes">
    <strong>Important:</strong> This statement reflects transactions recorded in Samara Care ERP as on ${escapeHtml(formatDateTimeIN(new Date()))}.
    Room rent, nursing charges and other recurring charges are included only where posted in the system.
  </div>

  <div class="signatures">
    <div>Prepared By</div>
    <div>Accounts / Administrator</div>
    <div>Patient / Attendant</div>
  </div>

  <div class="footer">Samara Health Care LLP · Computer-generated bill · No manual alteration permitted</div>
</div>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
</body>
</html>`);
      win.document.close();
      setTimeout(()=>win.focus(),250);
    }

    const chargeGroups=Object.values(groupedCharges);
    const compactChargeDescription=group=>{
      if(!['Room Charges','Nursing Charges'].includes(group.category)){
        return (group.items.map(item=>item.description).filter(Boolean).join(' | ')||'—')
          .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1');
      }
      const dated=group.items.map(item=>String(item.source_date||item.transaction_date||'').slice(0,10))
        .filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
      if(!dated.length)return `${group.items.length} day${group.items.length===1?'':'s'}`;
      const display=value=>{const [y,m,d]=value.split('-');return `${d}-${m}-${y}`};
      return `${dated.length} day${dated.length===1?'':'s'} (from ${display(dated[0])} to ${display(dated[dated.length-1])})`;
    };

    return h(React.Fragment,null,
      patientId&&h(PatientChargeReadiness,{patientId}),
      h('div',{className:'accounts-hero'},
        h('div',null,
          h('small',null,'PATIENT LEDGER · FINAL SETTLEMENT'),
          h('h3',null,'Complete Patient Bill'),
          h('p',null,'Generate an A4 printable statement with charges, payments, advances, discounts, refunds and net payable.')
        ),
        h('div',{className:'accounts-actions'},
          h('button',{className:'btn btn-secondary',disabled:!patient||loading,onClick:printCompleteBill},'🖨 Print Complete Bill'),
          h('button',{className:'btn btn-secondary',onClick:()=>onNavigate?.('Payments')},'💳 Open Payments')
        )
      ),

      h(Section,{title:'Select Patient',subtitle:'Choose one patient to prepare the complete bill'},
        h('div',{className:'payment-filter-grid'},
          h('div',{className:'field'},
            h('label',null,'Patient'),
            h('select',{value:patientId,onChange:e=>setPatientId(e.target.value)},
              h('option',{value:''},'Select patient'),
              patients.map(row=>h('option',{key:row.id,value:row.id},
                `${formalName(row)||row.full_name} · ${row.patient_id||'No ID'} · Room ${row.room_no||'—'}${row.bed_no?`-${row.bed_no}`:''}`
              ))
            )
          ),
          h('div',{className:'field'},
            h('label',null,'Bill / Invoice Number'),
            h('input',{value:invoiceNo,readOnly:true})
          )
        ),
        message&&h('div',{className:'message error'},message)
      ),

      patient&&h(React.Fragment,null,
        h('div',{className:'payment-summary-grid'},
          [
            ['Gross Charges',totals.Charge,'summary-blue'],
            ['Payments / Advance',receipts,'summary-green'],
            ['Discounts',totals.Discount,'summary-pink'],
            ['Refunds',totals.Refund,'summary-blue'],
            ['Net Payable',netPayable,netPayable>0?'summary-red':'summary-green'],
            ['Advance Balance',advanceBalance,'summary-blue']
          ].map(([label,value,klass])=>h('div',{className:`payment-summary-card ${klass}`,key:label},
            h('span',null,label),h('strong',null,money(value))
          ))
        ),

        h(LogTable,{
          title:loading?'Loading complete bill…':`Charge Summary (${chargeGroups.length})`,
          subtitle:`${formalName(patient)||patient.full_name} · ${patient.patient_id||'No ID'}`,
          heads:['Sl. No.','Category','Entries','Description','Amount'],
          rows:chargeGroups.map((group,index)=>[
            index+1,
            group.category,
            group.items.length,
            compactChargeDescription(group),
            money(group.amount)
          ])
        }),

        h(LogTable,{
          title:'Payment & Adjustment History',
          subtitle:'Payments, advances, discounts and refunds',
          heads:['Date','Type','Category','Mode','Reference / Description','Amount'],
          rows:rows.filter(row=>['Payment','Advance','Discount','Refund'].includes(row.transaction_type)).map(row=>[
            formatDateTimeIN(row.transaction_date),
            row.transaction_type,
            row.category||'—',
            row.payment_mode||'—',
            row.description||'—',
            money(row.amount)
          ])
        }),

        h(Section,{title:'Final Account Position',subtitle:'Printable settlement summary'},
          h('div',{className:'accounts-status-list'},
            [
              ['Gross Charges',money(totals.Charge)],
              ['Payments Received',money(totals.Payment)],
              ['Advance Received',money(totals.Advance)],
              ['Admin-approved Discount',money(totals.Discount)],
              ['Refunds',money(totals.Refund)],
              ['Net Payable',money(netPayable)],
              ['Account Status',billStatus]
            ].map(([label,value])=>h('div',{className:'accounts-status-item',key:label},
              h('span',null,label),h('strong',null,value)
            ))
          )
        )
      )
    );
  }

  function RefundsView({profile,onNavigate}){
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [loading,setLoading]=React.useState(true);

    async function load(){
      setLoading(true);
      const {data}=await client.from('billing_transactions')
        .select('*,patients(full_name,title,patient_id)')
        .eq('transaction_type','Refund')
        .order('transaction_date',{ascending:false})
        .limit(300);
      setRows(data||[]);
      setLoading(false);
    }

    React.useEffect(()=>{load()},[]);

    return h(React.Fragment,null,
      h(Section,{title:'Refunds',subtitle:'Advance and payment refund register'},
        h('div',{className:'panel-head'},
          h('p',{className:'small-note'},'Refund entries are recorded through Payments and remain permanently available in this register.'),
          h('button',{className:'btn btn-primary',onClick:()=>onNavigate?.('Payments')},'Record Refund')
        )
      ),
      h(LogTable,{
        title:loading?'Loading refunds…':`Refund History (${rows.length})`,
        heads:['Date','Patient','Resident ID','Amount','Mode','Description'],
        rows:rows.map(row=>[
          fmt(row.transaction_date),
          formalName(row.patients||{})||row.patients?.full_name||'—',
          row.patients?.patient_id||'—',
          `₹${Number(row.amount||0).toLocaleString('en-IN')}`,
          row.payment_mode||'—',
          row.description||'—'
        ])
      })
    );
  }

