  function PatientLedgerView({profile,onNavigate}){
    const patientLedgerSamaraLogo='data:image/png;base64,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';
    const [patients]=usePatients();
    const [query,setQuery]=React.useState('');
    const [selectedId,setSelectedId]=React.useState('');
    const [ledger,setLedger]=React.useState([]);
    const [roomBed,setRoomBed]=React.useState(null);
    const [shifts,setShifts]=React.useState([]);
    const [loading,setLoading]=React.useState(false);
    const [message,setMessage]=React.useState('');

    const money=value=>`₹${Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    const compactLedgerReference=value=>{
      const text=String(value||'').trim();
      if(!text)return '';
      if(text.length<=30)return text;
      return `${text.slice(0,12)}…${text.slice(-10)}`;
    };
    const patientLabel=p=>`${formalName(p)||p.full_name||'Patient'} · ${p.patient_id||'No ID'}${p.room_no?` · Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:''}`;
    const q=String(query||'').trim().toLowerCase();
    const matches=(patients||[]).filter(p=>{
      if(!q)return false;
      const hay=[formalName(p),p.full_name,p.patient_id,p.room_no,p.bed_no,p.mobile,p.attendant_phone]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0,12);
    const selected=(patients||[]).find(p=>p.id===selectedId)||null;

    async function loadPatientLedger(patient){
      if(!patient?.id){setLedger([]);setRoomBed(null);setShifts([]);return}
      setLoading(true);setMessage('');
      try{
        const [ledgerRes,bedByPatientRes,shiftRes]=await Promise.all([
          client.from('billing_transactions').select('*').eq('patient_id',patient.id).order('transaction_date',{ascending:true}),
          client.from('room_beds').select('*').eq('patient_id',patient.id).maybeSingle(),
          client.from('room_transfer_history').select('*').eq('patient_id',patient.id).order('effective_at',{ascending:false}).limit(20)
        ]);
        if(ledgerRes.error)throw ledgerRes.error;
        let bed=bedByPatientRes.data||null;
        if(!bed&&patient.room_no){
          const fallback=await client.from('room_beds').select('*')
            .eq('room_no',patient.room_no)
            .eq('bed_no',patient.bed_no||'')
            .maybeSingle();
          if(!fallback.error)bed=fallback.data||null;
        }
        setLedger(ledgerRes.data||[]);
        setRoomBed(bed);
        if(shiftRes.error){console.warn('Room shift history could not be loaded:',shiftRes.error);setShifts([])}
        else setShifts(shiftRes.data||[]);
      }catch(error){
        console.error('Patient Ledger could not be loaded:',error);
        setMessage(error?.message||'Patient Ledger could not be loaded.');
        setLedger([]);setRoomBed(null);setShifts([]);
      }finally{setLoading(false)}
    }

    React.useEffect(()=>{
      if(!selected)return;
      loadPatientLedger(selected);
      const refresh=()=>loadPatientLedger(selected);
      const timer=setInterval(refresh,15000);
      window.addEventListener('samara-refresh-charges',refresh);
      return()=>{clearInterval(timer);window.removeEventListener('samara-refresh-charges',refresh)};
    },[selectedId]);
    React.useEffect(()=>{
      if(!selectedId)return;
      const channel=client.channel(`patient-ledger-${selectedId}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'billing_transactions',filter:`patient_id=eq.${selectedId}`},()=>loadPatientLedger(selected))
        .on('postgres_changes',{event:'*',schema:'public',table:'room_transfer_history',filter:`patient_id=eq.${selectedId}`},()=>loadPatientLedger(selected))
        .subscribe();
      return()=>client.removeChannel(channel);
    },[selectedId]);

    const totals=ledger.reduce((sum,row)=>{
      const amount=Number(row.amount||0),type=String(row.transaction_type||'Charge');
      if(type==='Charge')sum.charges+=amount;
      else if(type==='Payment'||type==='Advance')sum.receipts+=amount;
      else if(type==='Discount')sum.discounts+=amount;
      else if(type==='Refund')sum.refunds+=amount;
      return sum;
    },{charges:0,receipts:0,discounts:0,refunds:0});
    const balance=totals.charges-totals.receipts-totals.discounts+totals.refunds;

    let running=0;
    const rowsWithBalance=ledger.map(row=>{
      const amount=Number(row.amount||0),type=String(row.transaction_type||'Charge');
      const debit=(type==='Charge'||type==='Refund')?amount:0;
      const credit=(type==='Payment'||type==='Advance'||type==='Discount')?amount:0;
      running+=debit-credit;
      return {...row,_debit:debit,_credit:credit,_balance:running};
    }).reverse();

    const autoRoom=[...ledger].reverse().find(row=>String(row.source_type||'').toLowerCase()==='daily room charge'||(/room/i.test(String(row.category||''))&&row.auto_generated===true));
    const autoNursing=[...ledger].reverse().find(row=>String(row.source_type||'').toLowerCase()==='daily nursing charge'||(/nursing/i.test(String(row.category||''))&&row.auto_generated===true));
    const roomRate=Number(roomBed?.room_daily_rate||roomBed?.daily_rate||0);
    const nursingRate=Number(roomBed?.nursing_daily_rate||0);
    const roomMatches=!roomBed||!autoRoom?null:Math.abs(Number(autoRoom.amount||0)-roomRate)<0.01;
    const nursingMatches=!roomBed||!autoNursing?null:Math.abs(Number(autoNursing.amount||0)-nursingRate)<0.01;
    const isInitialAllotment=s=>String(s?.reason||'').toLowerCase().includes('initial admission') || (!s?.from_room_no && !s?.from_bed_no);
    const actualShifts=shifts.filter(s=>!isInitialAllotment(s));
    const latestShift=actualShifts[0]||null;

    function choosePatient(p){setSelectedId(p.id);setQuery(patientLabel(p))}

    function escapeExcel(value){
      return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function downloadLedgerExcel(){
      if(!selected)return;
      const shiftRows=shifts.map(s=>isInitialAllotment(s)
        ? `<tr><td>${escapeExcel(fmt(s.effective_at))}</td><td>${escapeExcel(`Initial Allotment → ${s.to_room_no||'—'}${s.to_bed_no?`-${s.to_bed_no}`:''}`)}</td><td>${escapeExcel(s.reason||'Initial admission room allotment')}</td><td colspan="5">Historical initial allotment</td></tr>`
        : `<tr><td>${escapeExcel(fmt(s.effective_at))}</td><td>${escapeExcel(`${s.from_room_no||'—'}${s.from_bed_no?`-${s.from_bed_no}`:''} → ${s.to_room_no||'—'}${s.to_bed_no?`-${s.to_bed_no}`:''}`)}</td><td>${escapeExcel(s.reason||'')}</td><td>${escapeExcel(money(s.from_room_daily_rate))}</td><td>${escapeExcel(money(s.to_room_daily_rate))}</td><td>${escapeExcel(money(s.from_nursing_daily_rate))}</td><td>${escapeExcel(money(s.to_nursing_daily_rate))}</td><td>${escapeExcel(s.accounts_synced?'Accounts synchronised':'Accounts sync pending')}</td></tr>`).join('');
      const ledgerRows=rowsWithBalance.map(row=>`<tr><td>${escapeExcel(fmt(row.transaction_date||row.created_at))}</td><td>${escapeExcel(`${row.transaction_type||'Transaction'} · ${row.category||'General'}`)}</td><td>${escapeExcel(row.description||'')}</td><td>${row._debit||''}</td><td>${row._credit||''}</td><td>${row._balance}</td><td>${escapeExcel(row.source_type||row.payment_mode||'')}</td><td>${escapeExcel(row.payment_reference||row.reference_no||row.source_key||'')}</td></tr>`).join('');
      const roomText=roomBed?`${roomBed.room_no||'—'}${roomBed.bed_no?`-${roomBed.bed_no}`:''} · ${roomBed.room_type||roomBed.type||'Room'}`:'Not linked';
      const html=`<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;color:#321523;background:#fff;margin:14px}h1{color:#a20b55;margin:0;font-size:22px;text-align:center;vertical-align:middle}h2{color:#a20b55;margin:18px 0 5px;padding:4px 7px;font-size:16px;line-height:1.2;background:#fff0f6;border-left:3px solid #c21867}table{border-collapse:collapse;width:100%;margin:8px 0 18px}th,td{border:1px solid #d9a8bd;padding:7px;text-align:left}th{background:#fbe7f0;color:#6d123c}.money{mso-number-format:"₹\#\,##0.00"}.brand{width:100%;border-collapse:collapse;margin:0 0 12px}.brand td{border:0!important;padding:3px 8px;vertical-align:middle}.brand-logo{width:150px;height:100px;object-fit:contain}.brand-sub{color:#6c5a63;font-weight:700}.footer{margin-top:18px;border-top:2px solid #e7b4ca;padding-top:10px;color:#6a4154;font-size:11px;line-height:1.45}.footer strong{color:#a20b55}
      </style></head><body>
      <table class="brand"><tr><td style="width:165px;height:105px"><img class="brand-logo" src="samara-logo.png" width="150" height="100" alt="Samara Assisted Living"></td><td style="height:105px;text-align:center;vertical-align:middle"><h1>Samara Care ERP – Patient Ledger</h1><div class="brand-sub" style="text-align:center">Compassion • Comfort • Dignity</div></td></tr></table>
      <table><tr><th>Patient / Resident</th><td>${escapeExcel(formalName(selected)||selected.full_name||'Patient')}</td><th>Patient ID</th><td>${escapeExcel(selected.patient_id||'')}</td></tr><tr><th>Current Room / Bed</th><td>${escapeExcel(roomText)}</td><th>Exported On</th><td>${escapeExcel(fmt(new Date()))}</td></tr></table>
      <h2>Financial Summary</h2><table><tr><th>Total Charges</th><th>Payments / Advances</th><th>Discounts</th><th>Refunds</th><th>Current Payable</th></tr><tr><td>${totals.charges}</td><td>${totals.receipts}</td><td>${totals.discounts}</td><td>${totals.refunds}</td><td>${balance}</td></tr></table>
      <h2>Current Tariff Verification</h2><table><tr><th>Current Room / Bed</th><th>Room Tariff / day</th><th>Nursing Tariff / day</th><th>Latest Room Charge</th><th>Latest Nursing Charge</th><th>Latest Room Shift / Accounts Sync</th></tr><tr><td>${escapeExcel(roomText)}</td><td>${roomRate}</td><td>${nursingRate}</td><td>${autoRoom?Number(autoRoom.amount||0):''}${roomMatches===true?' (Matches)':roomMatches===false?' (Mismatch)':''}</td><td>${autoNursing?Number(autoNursing.amount||0):''}${nursingMatches===true?' (Matches)':nursingMatches===false?' (Mismatch)':''}</td><td>${escapeExcel(latestShift?`${latestShift.from_room_no||'—'}${latestShift.from_bed_no?`-${latestShift.from_bed_no}`:''} → ${latestShift.to_room_no||'—'}${latestShift.to_bed_no?`-${latestShift.to_bed_no}`:''} · ${latestShift.accounts_synced?'Accounts synchronised':'Accounts sync pending'}`:'No room shift recorded')}</td></tr></table>
      <h2>Room Shift / Tariff History</h2><table><tr><th>Effective Date / Time</th><th>Room Shift</th><th>Reason</th><th>Old Room Tariff</th><th>New Room Tariff</th><th>Old Nursing Tariff</th><th>New Nursing Tariff</th><th>Accounts Status</th></tr>${shiftRows||'<tr><td colspan="8">No room shift history</td></tr>'}</table>
      <h2>Complete Patient Ledger</h2><table><tr><th>Date / Time</th><th>Particulars</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Source</th><th>Reference</th></tr>${ledgerRows||'<tr><td colspan="8">No billing transactions</td></tr>'}</table>
      <div class="footer"><strong>Samara Assisted Living</strong> · RBK VILLA, No: 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037.<br>9976735577 · 7395961616 · care@samaraassistedliving.com · www.samaraassistedliving.com<br><em>Professional care. Personal attention. Complete peace of mind.</em></div>
      </body></html>`;
      // Excel's HTML import treats normal image/data-URI references as external links.
      // Package the workbook as MHTML and attach the Samara logo inside the file so it
      // remains visible after download, e-mailing or opening on another computer.
      const logoBase64=String(patientLedgerSamaraLogo||'').replace(/^data:image\/png;base64,/i,'');
      const boundary='----=_SamaraLedger_'+Date.now();
      const mhtml=[
        'MIME-Version: 1.0',
        `Content-Type: multipart/related; boundary=\"${boundary}\"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=\"utf-8\"',
        'Content-Transfer-Encoding: 8bit',
        'Content-Location: patient-ledger.htm',
        '',
        html,
        '',
        `--${boundary}`,
        'Content-Type: image/png',
        'Content-Transfer-Encoding: base64',
        'Content-Location: samara-logo.png',
        '',
        logoBase64.replace(/(.{76})/g,'$1\r\n'),
        '',
        `--${boundary}--`,
        ''
      ].join('\r\n');
      const blob=new Blob([mhtml],{type:'application/vnd.ms-excel;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;
      const safeName=String(formalName(selected)||selected.full_name||selected.patient_id||'Patient').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
      a.download=`${safeName||'Patient'}_Ledger_${todayISOIndia?todayISOIndia():new Date().toISOString().slice(0,10)}.xls`;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }

    function downloadLedgerPDF(){
      if(!selected)return;
      const pdfRows=rowsWithBalance.slice().reverse().map((row,index)=>`<tr>
        <td>${index+1}</td>
        <td>${escapeExcel(fmt(row.transaction_date||row.created_at))}</td>
        <td><b>${escapeExcel(`${row.transaction_type||'Transaction'} · ${row.category||'General'}`)}</b>${row.description?`<div class="desc">${escapeExcel(row.description)}</div>`:''}</td>
        <td class="num">${row._debit?escapeExcel(money(row._debit)):'—'}</td>
        <td class="num">${row._credit?escapeExcel(money(row._credit)):'—'}</td>
        <td class="num balance">${escapeExcel(money(row._balance))}</td>
        <td>${escapeExcel(row.source_type||row.payment_mode||'—')}${(row.payment_reference||row.reference_no||row.source_key)?`<div class="desc">${escapeExcel(row.payment_reference||row.reference_no||row.source_key)}</div>`:''}</td>
      </tr>`).join('');
      const roomText=roomBed?`${roomBed.room_no||'—'}${roomBed.bed_no?`-${roomBed.bed_no}`:''}`:(selected.room_no?`${selected.room_no}${selected.bed_no?`-${selected.bed_no}`:''}`:'—');
      const generatedOn=fmt(new Date());
      const patientName=formalName(selected)||selected.full_name||'Patient';
      const admissionDate=selected.admission_date||selected.admitted_at||selected.created_at||'';
      const doctor=selected.treating_doctor||selected.doctor_name||selected.doctor||'—';
      const mobile=selected.mobile||selected.attendant_phone||selected.emergency_contact_phone||'—';
      const status=balance>0?'AMOUNT PAYABLE':balance<0?'ADVANCE / CREDIT':'ACCOUNT SETTLED';
      const html=`<!doctype html><html><head><meta charset="utf-8"><title>Patient Account Ledger - ${escapeExcel(patientName)}</title><style>
        @page{size:A4 portrait;margin:12mm 10mm 15mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:10.5px;line-height:1.35;background:#fff}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b20b5d;padding:0 2px 9px;margin-bottom:12px}.logo{width:145px;max-height:72px;object-fit:contain}.org{text-align:right}.org strong{display:block;color:#b20b5d;font-size:17px;letter-spacing:.2px}.org span{display:block;color:#6d5963;font-size:9px}.title{text-align:center;margin:5px 0 12px}.title h1{font-size:20px;margin:0;color:#321d28}.title p{margin:3px 0 0;color:#7b6670}.patient{border:1px solid #e9c7d6;border-radius:10px;padding:9px 11px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:5px 20px}.field{display:grid;grid-template-columns:105px 1fr;gap:5px}.label{font-weight:700;color:#654353}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:0 0 13px}.sum{border:1px solid #e8c4d4;border-radius:7px;padding:7px;background:#fffafd}.sum span{display:block;font-size:8.5px;color:#7c6872;text-transform:uppercase}.sum strong{display:block;margin-top:3px;font-size:13px;color:#741041}.sum.payable{border-color:#d99aad;background:#fff5f7}.section-title{color:#a20b55;font-size:13px;font-weight:800;margin:11px 0 6px;border-bottom:1px solid #e7b8cc;padding-bottom:4px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#f7dce8;color:#67123d;border:1px solid #dfb4c6;padding:6px 5px;text-align:left;font-size:9px}td{border:1px solid #ead4dd;padding:5px;vertical-align:top;word-wrap:break-word}th:nth-child(1){width:4%}th:nth-child(2){width:12%}th:nth-child(3){width:34%}th:nth-child(4),th:nth-child(5),th:nth-child(6){width:10%}th:nth-child(7){width:20%}.num{text-align:right;white-space:nowrap}.balance{font-weight:700}.desc{font-size:8.5px;color:#74636b;margin-top:2px}.status{text-align:center;font-size:15px;font-weight:800;color:#a20b55;margin:14px 0 6px}.note{border:1px solid #ead0db;border-radius:8px;padding:8px;margin:8px 0 18px;color:#6b5961}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:30px;text-align:center}.sig{border-top:1px solid #6f5c65;padding-top:8px}.footer{border-top:1px solid #eccbd9;margin-top:22px;padding-top:8px;text-align:center;color:#6f5a64;font-size:8.5px}.footer b{color:#8d174d}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none!important}}
      </style></head><body>
        <div class="top"><img class="logo" src="${patientLedgerSamaraLogo}" alt="Samara Assisted Living"><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Assisted Living Management System</span><span>Compassion • Comfort • Dignity</span></div></div>
        <div class="title"><h1>PATIENT ACCOUNT LEDGER</h1><p>System-generated resident financial statement · Generated on ${escapeExcel(generatedOn)}</p></div>
        <div class="patient">
          <div class="field"><span class="label">Patient Name</span><span>${escapeExcel(patientName)}</span></div><div class="field"><span class="label">Resident ID</span><span>${escapeExcel(selected.patient_id||'—')}</span></div>
          <div class="field"><span class="label">Room / Bed</span><span>${escapeExcel(roomText)}</span></div><div class="field"><span class="label">Admission Date</span><span>${escapeExcel(admissionDate?fmt(admissionDate):'—')}</span></div>
          <div class="field"><span class="label">Mobile</span><span>${escapeExcel(mobile)}</span></div><div class="field"><span class="label">Treating Doctor</span><span>${escapeExcel(doctor)}</span></div>
        </div>
        <div class="section-title">Financial Summary</div><div class="summary">
          <div class="sum"><span>Total Charges</span><strong>${escapeExcel(money(totals.charges))}</strong></div><div class="sum"><span>Payments / Advances</span><strong>${escapeExcel(money(totals.receipts))}</strong></div><div class="sum"><span>Discounts</span><strong>${escapeExcel(money(totals.discounts))}</strong></div><div class="sum"><span>Refunds</span><strong>${escapeExcel(money(totals.refunds))}</strong></div><div class="sum payable"><span>Current Balance</span><strong>${escapeExcel(money(Math.abs(balance)))}</strong></div>
        </div>
        <div class="section-title">Complete Patient Ledger</div><table><thead><tr><th>Sl.</th><th>Date / Time</th><th>Particulars / Description</th><th>Debit (₹)</th><th>Credit (₹)</th><th>Balance (₹)</th><th>Source / Reference</th></tr></thead><tbody>${pdfRows||'<tr><td colspan="7" style="text-align:center">No billing transactions recorded</td></tr>'}</tbody></table>
        <div class="status">${status}${balance!==0?` · ${escapeExcel(money(Math.abs(balance)))}`:''}</div>
        <div class="note"><b>Important:</b> This ledger reflects transactions recorded in Samara Care ERP as on ${escapeExcel(generatedOn)}. Charges, payments, advances, discounts, refunds and authorised adjustments are shown according to the entries posted in the system.</div>
        <div class="signatures"><div class="sig">Prepared By</div><div class="sig">Accounts / Administrator</div><div class="sig">Patient / Attendant</div></div>
        <div class="footer"><b>Samara Health Care LLP</b> · RBK VILLA, No: 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037.<br>9976735577 · 7395961616 · care@samaraassistedliving.com · www.samaraassistedliving.com<br>Computer-generated patient account ledger · No manual alteration permitted</div>
        <script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250));});<\/script>
      </body></html>`;
      const win=window.open('','_blank');
      if(!win){alert('Please allow pop-ups to download / save the Patient Ledger PDF.');return}
      win.document.open();win.document.write(html);win.document.close();
    }

    return h('div',{className:'stack patient-ledger-page'},
      selectedId&&h(PatientChargeReadiness,{patientId:selectedId}),
      h('style',null,`
        .patient-ledger-page .ledger-patient-tools{display:grid;grid-template-columns:minmax(280px,420px) minmax(320px,1fr);gap:14px;align-items:end}
        .patient-ledger-page .ledger-patient-tools .field{margin:0}
        .patient-ledger-page .ledger-search-wrap{position:relative;max-width:none}
        .patient-ledger-page .ledger-search-results{position:absolute;z-index:40;left:0;right:0;top:calc(100% + 6px);background:#fff;border:1px solid #efbed2;border-radius:14px;box-shadow:0 14px 32px rgba(110,14,62,.18);max-height:340px;overflow:auto}
        .patient-ledger-page .ledger-search-result{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #f6dce7;background:#fff;padding:12px 14px;cursor:pointer;color:#3f2635}
        .patient-ledger-page .ledger-search-result:hover{background:#fff1f7}
        .finance-blue{--finance-accent:#123f8c;--finance-bg:#eef5ff;--finance-border:#a9c8f7}
        .finance-green{--finance-accent:#087c39;--finance-bg:#eaf8ef;--finance-border:#a8dfbb}
        .finance-pink{--finance-accent:#c2185b;--finance-bg:#fff0f7;--finance-border:#f3a6c9}
        .finance-red{--finance-accent:#c62828;--finance-bg:#fff0f0;--finance-border:#f3b2b2}
        .patient-ledger-page .ledger-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .patient-ledger-page .ledger-kpi{background:linear-gradient(145deg,#fff,#fff5f9);border:1px solid #f0c7d7;border-radius:18px;padding:14px 16px}
        .patient-ledger-page .ledger-kpi span{display:block;color:#7a6872;font-size:12px;margin-bottom:5px}.patient-ledger-page .ledger-kpi strong{font-size:24px;color:#56102f}
        .patient-ledger-page .ledger-kpi.finance-blue{background:linear-gradient(145deg,#f7fbff,#eaf3ff);border-color:#a9c8f7}.patient-ledger-page .ledger-kpi.finance-blue span,.patient-ledger-page .ledger-kpi.finance-blue strong{color:#123f8c}
        .patient-ledger-page .ledger-kpi.finance-green{background:linear-gradient(145deg,#f7fff9,#e8f8ef);border-color:#a8dfbb}.patient-ledger-page .ledger-kpi.finance-green span,.patient-ledger-page .ledger-kpi.finance-green strong{color:#087c39}
        .patient-ledger-page .ledger-kpi.finance-pink{background:linear-gradient(145deg,#fff8fb,#fff0f7);border-color:#f3a6c9}.patient-ledger-page .ledger-kpi.finance-pink span,.patient-ledger-page .ledger-kpi.finance-pink strong{color:#c2185b}
        .patient-ledger-page .ledger-kpi.finance-red{background:linear-gradient(145deg,#fffafa,#fff0f0);border-color:#f3b2b2}.patient-ledger-page .ledger-kpi.finance-red span,.patient-ledger-page .ledger-kpi.finance-red strong{color:#c62828}
        .patient-ledger-page .tariff-check{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}
        .patient-ledger-page .tariff-cell{background:#fff7fa;border:1px solid #f2cedc;border-radius:12px;padding:11px}
        .patient-ledger-page .tariff-ok{color:#078637;font-weight:800}.patient-ledger-page .tariff-warn{color:#c51f2e;font-weight:800}
        .patient-ledger-page .ledger-table-wrap{overflow:auto}.patient-ledger-page table{min-width:900px;width:100%;border-collapse:collapse}
        .patient-ledger-page th{background:#fff0f6;color:#66103b;text-align:left;padding:10px;border-bottom:1px solid #efc5d5;position:sticky;top:0}.patient-ledger-page td{padding:10px;border-bottom:1px solid #f0e1e7;vertical-align:top}
        .patient-ledger-page .ledger-debit{color:#b91c1c;font-weight:700}.patient-ledger-page .ledger-credit{color:#087c39;font-weight:700}.patient-ledger-page .ledger-balance{font-weight:800;color:#47162f}
        .patient-ledger-page .shift-row{padding:10px 0;border-bottom:1px solid #f0dbe4}.patient-ledger-page .shift-row:last-child{border-bottom:0}
        .patient-ledger-page .ledger-brand-logo{height:58px;width:auto;object-fit:contain;display:block;margin-bottom:8px}.patient-ledger-page .page-hero{background:linear-gradient(110deg,#fff,#fff4f8)!important}.patient-ledger-page .section-card h3{color:#7a0d45}
        @media(max-width:900px){.patient-ledger-page .ledger-kpis,.patient-ledger-page .tariff-check{grid-template-columns:repeat(2,minmax(0,1fr))}.patient-ledger-page .ledger-patient-tools{grid-template-columns:1fr}}
      `),
      h('div',{className:'page-hero'},
        h('div',null,h('img',{className:'ledger-brand-logo',src:patientLedgerSamaraLogo,alt:'Samara Assisted Living'}),h('div',{className:'eyebrow'},'ACCOUNTS / BILLING'),h('h2',null,'Patient Ledger'),h('p',null,'Search any resident and review the complete financial history, running balance, current room tariff and room-shift tariff synchronisation.')),
        h('button',{className:'btn btn-secondary',onClick:()=>onNavigate?.('Payments')},'Open Payments')
      ),
      h('div',{className:'section-card'},
        h('h3',null,'Select Patient / Resident'),
        h('div',{className:'ledger-patient-tools'},
          h('div',{className:'field'},
            h('label',null,'Active Patients'),
            h('select',{className:'input',value:selectedId,onChange:e=>{const id=e.target.value;setSelectedId(id);const p=(patients||[]).find(x=>x.id===id);setQuery(p?patientLabel(p):'')}},
              h('option',{value:''},'Select active patient / resident'),
              [...(patients||[])].sort((a,b)=>String(formalName(a)||a.full_name||'').localeCompare(String(formalName(b)||b.full_name||''))).map(p=>h('option',{key:p.id,value:p.id},patientLabel(p)))
            )
          ),
          h('div',null,
            h('label',{style:{display:'block',marginBottom:'6px',fontWeight:700}},'Search'),
            h('div',{className:'ledger-search-wrap'},
              h('input',{className:'input',value:query,placeholder:'Search by patient name, Patient ID, room / bed or mobile number…',onChange:e=>{setQuery(e.target.value);if(selectedId&&e.target.value!==patientLabel(selected))setSelectedId('')}}),
              q&&!selectedId&&h('div',{className:'ledger-search-results'},
                matches.length?matches.map(p=>h('button',{key:p.id,type:'button',className:'ledger-search-result',onClick:()=>choosePatient(p)},
                  h('strong',null,formalName(p)||p.full_name||'Patient'),
                  h('div',{className:'small-note'},`${p.patient_id||'No Patient ID'}${p.room_no?` · Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:''}${p.mobile?` · ${p.mobile}`:''}`)
                )):h('div',{style:{padding:'14px'},className:'small-note'},'No matching active patient found.')
              )
            )
          )
        ),
        selected&&h('div',{className:'small-note',style:{marginTop:'9px'}},`Selected: ${patientLabel(selected)}`)
      ),
      message&&h('div',{className:'alert error'},message),
      loading&&h('div',{className:'section-card'},'Loading Patient Ledger…'),
      selected&&!loading&&h(React.Fragment,null,
        h('div',{className:'ledger-kpis'},
          [['Total Charges',totals.charges,'finance-blue'],['Payments / Advances',totals.receipts,'finance-green'],['Discounts',totals.discounts,'finance-pink'],['Current Payable',balance,'finance-red']].map(([label,value,tone])=>
            h('div',{className:`ledger-kpi ${tone}`,key:label},h('span',null,label),h('strong',null,money(value)))
          )
        ),
        h('div',{className:'section-card'},
          h('h3',null,'Current Tariff Verification'),
          h('p',{className:'small-note'},'This section lets Accounts immediately confirm whether the latest automatic accommodation charges match the resident’s current room / bed tariff.'),
          h('div',{className:'tariff-check'},
            h('div',{className:'tariff-cell'},h('span',{className:'small-note'},'Current Room / Bed'),h('strong',null,roomBed?`${roomBed.room_no||'—'}${roomBed.bed_no?`-${roomBed.bed_no}`:''} · ${roomBed.room_type||roomBed.type||'Room'}`:'Not linked')),
            h('div',{className:'tariff-cell'},h('span',{className:'small-note'},'Current Room Tariff'),h('strong',null,money(roomRate)),autoRoom&&h('div',{className:roomMatches?'tariff-ok':'tariff-warn'},roomMatches?'✓ Latest ledger charge matches':`⚠ Latest ledger: ${money(autoRoom.amount)}`)),
            h('div',{className:'tariff-cell'},h('span',{className:'small-note'},'Current Nursing Tariff'),h('strong',null,money(nursingRate)),autoNursing&&h('div',{className:nursingMatches?'tariff-ok':'tariff-warn'},nursingMatches?'✓ Latest ledger charge matches':`⚠ Latest ledger: ${money(autoNursing.amount)}`)),
            h('div',{className:'tariff-cell'},h('span',{className:'small-note'},'Latest Room Shift / Accounts Sync'),latestShift?h(React.Fragment,null,h('strong',null,`${latestShift.from_room_no||'—'}${latestShift.from_bed_no?`-${latestShift.from_bed_no}`:''} → ${latestShift.to_room_no||'—'}${latestShift.to_bed_no?`-${latestShift.to_bed_no}`:''}`),h('div',{className:latestShift.accounts_synced?'tariff-ok':'tariff-warn'},latestShift.accounts_synced?'✓ Accounts synchronised':'⚠ Accounts sync pending')):h('strong',null,'No room shift recorded'))
          )
        ),
        shifts.length>0&&h('div',{className:'section-card'},
          h('h3',null,`Room Shift / Tariff History (${shifts.length})`),
          shifts.map(s=>isInitialAllotment(s)
            ? h('div',{className:'shift-row',key:s.id},
                h('strong',null,`Initial Allotment → ${s.to_room_no||'—'}${s.to_bed_no?`-${s.to_bed_no}`:''}`),
                h('div',{className:'small-note'},`${fmt(s.effective_at)} · ${s.reason||'Initial admission room allotment'}`)
              )
            : h('div',{className:'shift-row',key:s.id},
                h('strong',null,`${s.from_room_no||'—'}${s.from_bed_no?`-${s.from_bed_no}`:''} → ${s.to_room_no||'—'}${s.to_bed_no?`-${s.to_bed_no}`:''}`),
                h('div',{className:'small-note'},`${fmt(s.effective_at)} · ${s.reason||'No reason recorded'} · Room ${money(s.from_room_daily_rate)} → ${money(s.to_room_daily_rate)} · Nursing ${money(s.from_nursing_daily_rate)} → ${money(s.to_nursing_daily_rate)}`),
                h('div',{className:s.accounts_synced?'tariff-ok':'tariff-warn'},s.accounts_synced?'Accounts synchronised':'Accounts sync pending')
              ))
        ),
        h('div',{className:'section-card'},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:'12px',alignItems:'center',flexWrap:'wrap'}},
            h('div',null,h('h3',{style:{marginBottom:'2px'}},'Complete Patient Ledger'),h('div',{className:'small-note'},`${ledger.length} transaction${ledger.length===1?'':'s'} · newest first`)),
            h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
              h('button',{className:'btn btn-primary',onClick:downloadLedgerPDF,disabled:!selected},'Download / Save PDF'),
              h('button',{className:'btn btn-secondary',onClick:downloadLedgerExcel,disabled:!selected},'Download Excel'),
              h('button',{className:'btn btn-secondary',onClick:()=>loadPatientLedger(selected)},'Refresh')
            )
          ),
          ledger.length?h('div',{className:'ledger-table-wrap'},h('table',null,
            h('thead',null,h('tr',null,['Date / Time','Particulars','Debit','Credit','Balance','Source / Reference'].map(x=>h('th',{key:x},x)))),
            h('tbody',null,rowsWithBalance.map(row=>h('tr',{key:row.id},
              h('td',null,fmt(row.transaction_date||row.created_at)),
              h('td',null,h('strong',null,`${row.transaction_type||'Transaction'} · ${row.category||'General'}`),row.description&&h('div',{className:'small-note'},row.description)),
              h('td',{className:'ledger-debit'},row._debit?money(row._debit):'—'),
              h('td',{className:'ledger-credit'},row._credit?money(row._credit):'—'),
              h('td',{className:'ledger-balance'},money(row._balance)),
              h('td',{className:'ledger-source-cell'},
                h('div',{className:'ledger-source-name'},row.source_type||row.payment_mode||'—'),
                h('div',{className:'small-note ledger-reference-full'},row.payment_reference||row.reference_no||row.source_key||''),
                h('div',{className:'small-note ledger-reference-compact',title:row.payment_reference||row.reference_no||row.source_key||''},compactLedgerReference(row.payment_reference||row.reference_no||row.source_key||''))
              )
            )))
          )):h('div',{className:'empty-state'},'No billing transactions have been recorded for this patient yet.')
        )
      )
    );
  }

