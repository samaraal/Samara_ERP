  // 2.18.54: ACCOUNTS / BILLING → Statement. One table of Guests for a Date / Week / Month / Period:
  //   Opening balance · Charges · Received (Payments + Advances) · Discount · Refund · Balance
  // All Guests or only the Guests picked. Every figure comes from billing_transactions, the same rows
  // the Guest Ledger uses: room-tariff adjustments are folded into the charge (billFoldTariffAdjustments)
  // so they never look like discounts, and a row's date is its service day (billRowDayISO).
  // Reuses srPeriodBounds / srMonthOptions / SR_PERIODS / srEsc (stores/stock-report.js) and
  // loadXlsxLibrary / freshFetchAll / freshSaveBlob / freshCsv / freshFileStamp (stores/stock-fresh-start.js).
  const astMoney=v=>`₹${(Math.round((Number(v)||0)*100)/100).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
  const astBal=v=>{const n=Math.round((Number(v)||0)*100)/100;return n<0?`${astMoney(-n)} Cr`:astMoney(n)};
  const astSign=row=>{const t=String(row?.transaction_type||'');return t==='Charge'||t==='Refund'?1:['Payment','Advance','Discount'].includes(t)?-1:0};
  const astGuestName=p=>formalName(p)||p?.full_name||'Guest';
  const astRoom=p=>p?.is_active===false?'Discharged':p?.room_no?`Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'—';
  const AST_HEAD=['Sl.','Guest','Guest ID','Room / Status','Opening Balance','Charges','Received','Discount','Refund','Balance'];

  function buildAccountsStatement({patients,transactions,from,to,scope,guestMode,selectedIds,includeTrial,hideNil}){
    const byPatient=new Map();
    (transactions||[]).forEach(r=>{if(!r.patient_id)return;if(!byPatient.has(r.patient_id))byPatient.set(r.patient_id,[]);byPatient.get(r.patient_id).push(r)});
    const picked=new Set(selectedIds||[]);
    const guests=(patients||[]).filter(p=>
      (guestMode==='selected'?picked.has(p.id):
        (scope==='all'||(scope==='inactive'?p.is_active===false:p.is_active!==false))&&(includeTrial||!p.is_trial))
    ).sort((a,b)=>astGuestName(a).localeCompare(astGuestName(b),'en',{sensitivity:'base',numeric:true}));
    const rows=[];
    guests.forEach(p=>{
      const list=billFoldTariffAdjustments(byPatient.get(p.id)||[]);
      const r={patient:p,opening:0,charges:0,received:0,discount:0,refund:0,lines:[]};
      list.forEach(t=>{
        const day=billRowDayISO(t),amount=Number(t.amount||0),type=String(t.transaction_type||'');
        if(!day||day>to)return;
        if(day<from){r.opening+=astSign(t)*amount;return}
        if(type==='Charge')r.charges+=amount;
        else if(type==='Payment'||type==='Advance')r.received+=amount;
        else if(type==='Discount')r.discount+=amount;
        else if(type==='Refund')r.refund+=amount;
        else return;
        r.lines.push({...t,_day:day});
      });
      r.balance=r.opening+r.charges-r.received-r.discount+r.refund;
      const nil=v=>Math.abs(v)<0.005;
      if(hideNil&&guestMode!=='selected'&&!r.lines.length&&nil(r.opening)&&nil(r.balance))return;
      r.lines.sort((a,b)=>String(a._day).localeCompare(String(b._day))||String(a.transaction_date||'').localeCompare(String(b.transaction_date||'')));
      rows.push(r);
    });
    const total=rows.reduce((s,r)=>{['opening','charges','received','discount','refund','balance'].forEach(k=>s[k]+=r[k]);return s},
      {opening:0,charges:0,received:0,discount:0,refund:0,balance:0});
    return {rows,total};
  }

  function astTableRows(st){
    return st.rows.map((r,i)=>[i+1,astGuestName(r.patient),r.patient.patient_id||'—',astRoom(r.patient),r.opening,r.charges,r.received,r.discount,r.refund,r.balance]);
  }
  const astPeriodText=(from,to)=>from===to?`Date: ${formatDateIN(from)}`:`Period: ${formatDateIN(from)} to ${formatDateIN(to)}`;
  const astScopeText=A=>A.guestMode==='selected'?`Selected Guests (${(A.selectedIds||[]).length})`:
    `${A.scope==='all'?'All Guests':A.scope==='inactive'?'Discharged / Inactive Guests':'Active Guests'}${A.includeTrial?' · incl. Trial':''}`;

  async function downloadAccountsStatementExcel({st,from,to,A,profile}){
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const top=[['SAMARA HEALTH CARE LLP'],['Accounts Statement — Guests'],[`${astPeriodText(from,to)} · ${astScopeText(A)}`],
      [`Downloaded on ${formatDateTimeIN(new Date().toISOString())} by ${who} · ${st.rows.length} Guest(s)`],[]];
    const money2=v=>Math.round((Number(v)||0)*100)/100;
    const body=astTableRows(st).map(r=>r.map((v,i)=>i>=4?money2(v):v));
    const t=st.total;
    const sheet=[...top,AST_HEAD,...body,['','TOTAL','','',money2(t.opening),money2(t.charges),money2(t.received),money2(t.discount),money2(t.refund),money2(t.balance)],[],
      ['Balance = Opening Balance + Charges − Received − Discount + Refund. A negative balance is an advance held (Cr).']];
    const base=`Samara_Accounts_Statement_${from}_to_${to}_${freshFileStamp()}`;
    try{
      const X=await loadXlsxLibrary(),wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet(sheet);
      ws['!cols']=[6,30,16,14,15,13,13,12,11,15].map(w=>({wch:w}));
      ws['!merges']=[0,1,2,3].map(r=>({s:{r,c:0},e:{r,c:AST_HEAD.length-1}}));
      X.utils.book_append_sheet(wb,ws,'Statement');
      X.writeFile(wb,`${base}.xlsx`);return 'xlsx';
    }catch(e){
      console.warn(e);freshSaveBlob(new Blob(['﻿'+freshCsv(sheet)],{type:'text/csv;charset=utf-8'}),`${base}.csv`);return 'csv';
    }
  }

  // mode 'print' opens the browser Print dialog for paper; 'pdf' opens the same page to Save as PDF.
  function openAccountsStatementPdf({st,from,to,A,profile,mode}){
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const now=formatDateTimeIN(new Date().toISOString());
    const logo=new URL('assets/samara-logo.png',window.location.href).href;
    const cell=(v,i)=>i>=4?`<td class="num${i===9?' bal':''}">${srEsc(i===9?astBal(v):astMoney(v))}</td>`:`<td${i===0?' class="sn"':''}>${srEsc(v)}</td>`;
    const rows=astTableRows(st).map(r=>`<tr>${r.map(cell).join('')}</tr>`).join('')||`<tr><td colspan="${AST_HEAD.length}" style="text-align:center;padding:14px">No Guests to show</td></tr>`;
    const t=st.total;
    const totalRow=`<tr class="tot"><td></td><td>TOTAL</td><td></td><td></td>${[t.opening,t.charges,t.received,t.discount,t.refund].map(v=>`<td class="num">${srEsc(astMoney(v))}</td>`).join('')}<td class="num bal">${srEsc(astBal(t.balance))}</td></tr>`;
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Samara_Accounts_Statement_${srEsc(from)}_to_${srEsc(to)}</title><style>
      @page{size:A4 landscape;margin:11mm 9mm 13mm}*{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:10.5px;line-height:1.35;background:#fff}
      .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b20b5d;padding:0 2px 8px;margin-bottom:10px}
      .logo{width:130px;max-height:64px;object-fit:contain}.org{text-align:right}.org strong{display:block;color:#b20b5d;font-size:16px}.org span{display:block;color:#6d5963;font-size:9px}
      h1{font-size:17px;margin:4px 0 2px;text-align:center;color:#321d28}.meta{text-align:center;color:#7b6670;margin:0 0 10px}
      table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}
      th{background:#f7dce8;color:#67123d;border:1px solid #dfb4c6;padding:6px 5px;text-align:left;font-size:9.5px}th.n{text-align:right}
      td{border:1px solid #ead4dd;padding:5px;vertical-align:top}tbody tr:nth-child(even) td{background:#fffafd}
      .num{text-align:right;white-space:nowrap}.sn{text-align:center;width:34px}.bal{font-weight:700;color:#741041}
      tr.tot td{font-weight:700;background:#fbe9f1!important;border-top:2px solid #b20b5d}
      .note{margin-top:10px;color:#6b5961;font-size:9px}.sign{display:flex;justify-content:space-between;margin-top:34px}.sign div{border-top:1px solid #6f5c65;padding-top:6px;width:30%;text-align:center}
      .footer{border-top:1px solid #eccbd9;margin-top:18px;padding-top:6px;text-align:center;color:#6f5a64;font-size:8.5px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="top"><img class="logo" src="${logo}" alt="Samara Assisted Living"><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Accounts / Billing</span><span>Compassion • Comfort • Dignity</span></div></div>
      <h1>Accounts Statement — Guests</h1>
      <p class="meta">${srEsc(astPeriodText(from,to))} · ${srEsc(astScopeText(A))} · ${st.rows.length} Guest(s)</p>
      <table><thead><tr>${AST_HEAD.map((x,i)=>`<th${i>=4?' class="n"':''}>${srEsc(x)}</th>`).join('')}</tr></thead><tbody>${rows}${st.rows.length?totalRow:''}</tbody></table>
      <p class="note">Balance = Opening Balance + Charges − Received − Discount + Refund. "Cr" = advance held for the Guest. Received = payments and advances.</p>
      <div class="sign"><div>Prepared By</div><div>Accounts</div><div>Admin / Director</div></div>
      <div class="footer">Generated from Samara Care ERP on ${srEsc(now)} by ${srEsc(who)} · Computer-generated statement</div>
      <script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250));});<\/script>
    </body></html>`;
    const win=samaraPrintBar(window.open('','_blank'));
    if(!win){alert(`Please allow pop-ups to ${mode==='print'?'print':'download / save'} the Statement.`);return false}
    win.document.open();win.document.write(html);win.document.close();return true;
  }


  // Real PDF file (Download PDF): jsPDF + AutoTable, loaded on first use like the Excel library.
  // Standard PDF fonts have no ₹ sign, so amounts print as "Rs. 1,234".
  let astPdfPromise=null;
  function loadAstPdfLibrary(){
    if(window.jspdf?.jsPDF&&window.jspdf.jsPDF.API?.autoTable)return Promise.resolve(window.jspdf.jsPDF);
    const add=src=>new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=src;sc.async=true;sc.onload=res;sc.onerror=()=>rej(new Error('PDF library could not be loaded — check the internet connection.'));document.head.appendChild(sc)});
    if(!astPdfPromise)astPdfPromise=add('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js')
      .then(()=>add('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'))
      .then(()=>{if(!window.jspdf?.jsPDF?.API?.autoTable)throw new Error('PDF library did not load.');return window.jspdf.jsPDF})
      .catch(e=>{astPdfPromise=null;throw e});
    return astPdfPromise;
  }
  async function downloadAccountsStatementPdfFile({st,from,to,A,profile}){
    const jsPDF=await loadAstPdfLibrary();
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const rs=v=>astMoney(v).replace('₹','Rs. ');
    const rsBal=v=>astBal(v).replace('₹','Rs. ');
    const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    try{
      const blob=await fetch(new URL('assets/samara-logo.png',window.location.href).href).then(r=>{if(!r.ok)throw 0;return r.blob()});
      const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(blob)});
      const img=await new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=data});
      if(img){const h2=16,w2=Math.min(48,h2*img.width/img.height);doc.addImage(data,'PNG',10,8,w2,h2)}
    }catch(_){}
    doc.setTextColor(178,11,93);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('SAMARA HEALTH CARE LLP',W-10,13,{align:'right'});
    doc.setTextColor(109,89,99);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Accounts / Billing  ·  Compassion • Comfort • Dignity',W-10,18,{align:'right'});
    doc.setDrawColor(178,11,93);doc.setLineWidth(0.8);doc.line(10,26,W-10,26);
    doc.setTextColor(50,29,40);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('Accounts Statement — Guests',W/2,33,{align:'center'});
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(123,102,112);
    doc.text(`${astPeriodText(from,to)}  ·  ${astScopeText(A).replace('🧪','')}  ·  ${st.rows.length} Guest(s)`,W/2,38.5,{align:'center'});
    const body=astTableRows(st).map(r=>r.map((v,i)=>i===9?rsBal(v):i>=4?rs(v):String(v)));
    const t=st.total;
    const foot=st.rows.length?[['','TOTAL','','',rs(t.opening),rs(t.charges),rs(t.received),rs(t.discount),rs(t.refund),rsBal(t.balance)]]:[];
    doc.autoTable({startY:42,head:[AST_HEAD],body:body.length?body:[[{content:'No Guests to show',colSpan:AST_HEAD.length,styles:{halign:'center'}}]],foot,
      theme:'grid',showFoot:'lastPage',margin:{left:10,right:10,bottom:16},
      styles:{fontSize:8.5,cellPadding:1.8,lineColor:[234,212,221],textColor:[59,40,51]},
      headStyles:{fillColor:[247,220,232],textColor:[103,18,61],fontStyle:'bold'},
      footStyles:{fillColor:[251,233,241],textColor:[116,16,65],fontStyle:'bold'},
      alternateRowStyles:{fillColor:[255,250,253]},
      columnStyles:{0:{halign:'center',cellWidth:10},4:{halign:'right'},5:{halign:'right'},6:{halign:'right'},7:{halign:'right'},8:{halign:'right'},9:{halign:'right',fontStyle:'bold',textColor:[116,16,65]}},
      didParseCell:d=>{if((d.section==='head'||d.section==='foot')&&d.column.index>=4)d.cell.styles.halign='right'}
    });
    let y=(doc.lastAutoTable?.finalY||50)+6;
    if(y>H-40){doc.addPage();y=20}
    doc.setFontSize(8);doc.setTextColor(107,89,97);
    doc.text('Balance = Opening Balance + Charges - Received - Discount + Refund. "Cr" = advance held for the Guest. Received = payments and advances.',10,y);
    y+=20;doc.setDrawColor(111,92,101);doc.setLineWidth(0.3);
    [['Prepared By',10],['Accounts',W/2-35],['Admin / Director',W-80]].forEach(([l,x])=>{doc.line(x,y,x+70,y);doc.text(l,x+35,y+4.5,{align:'center'})});
    const pages=doc.internal.getNumberOfPages(),now=formatDateTimeIN(new Date().toISOString());
    for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7.5);doc.setTextColor(111,90,100);
      doc.text(`Generated from Samara Care ERP on ${now} by ${who} · Computer-generated statement · Page ${i} of ${pages}`,W/2,H-7,{align:'center'})}
    doc.save(`Samara_Accounts_Statement_${from}_to_${to}_${freshFileStamp()}.pdf`);
  }

  function AccountsStatement({profile}){
    const [patients]=usePatients(true);
    const today=todayISOIndia();
    const [scope,setScope]=React.useState('all'),[guestMode,setGuestMode]=React.useState('all');
    const [selectedIds,setSelectedIds]=React.useState([]),[query,setQuery]=React.useState('');
    const [includeTrial,setIncludeTrial]=React.useState(false),[hideNil,setHideNil]=React.useState(true);
    const [period,setPeriod]=React.useState('month'),[from,setFrom]=React.useState(''),[to,setTo]=React.useState(''),[date,setDate]=React.useState(today),[month,setMonth]=React.useState(today.slice(0,7));
    const fa=useAppliedFilters({scope,guestMode,selectedIds,includeTrial,hideNil,period,from,to,date,month});const A=fa.applied;
    const [transactions,setTransactions]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(''),[reloadKey,setReloadKey]=React.useState(0);
    const [detail,setDetail]=React.useState(null);
    React.useEffect(()=>{
      let live=true;setError('');
      freshFetchAll('billing_transactions','*','transaction_date').then(rows=>{if(live)setTransactions(rows)}).catch(e=>{if(live)setError(e.message||'Could not load the ledger.')});
      return()=>{live=false};
    },[reloadKey]);
    const [pFrom,pTo]=srPeriodBounds(A);
    const st=transactions?buildAccountsStatement({patients,transactions,from:pFrom,to:pTo,...A}):null;
    const byId=new Map((patients||[]).map(p=>[p.id,p]));
    const q=String(query||'').trim().toLowerCase();
    const pickList=(patients||[]).filter(p=>!selectedIds.includes(p.id)&&(scope==='all'||(scope==='inactive'?p.is_active===false:p.is_active!==false))&&(includeTrial||!p.is_trial))
      .filter(p=>q.length<3||[astGuestName(p),p.full_name,p.patient_id,p.room_no].filter(Boolean).join(' ').toLowerCase().includes(q))
      .sort((a,b)=>astGuestName(a).localeCompare(astGuestName(b),'en',{sensitivity:'base',numeric:true}));

    async function download(fmt){
      if(!st||busy||fa.dirty)return;setBusy(fmt);
      const args={st,from:pFrom,to:pTo,A,profile};
      try{
        if(fmt==='excel'){const f=await downloadAccountsStatementExcel(args);showSamaraActionToast('success','Statement downloaded',f==='xlsx'?`${st.rows.length} Guest(s) saved to the Excel file.`:'Excel library unavailable — saved as a CSV file instead (opens in Excel).')}
        else if(fmt==='pdf'){
          try{await downloadAccountsStatementPdfFile(args);showSamaraActionToast('success','Statement PDF downloaded',`${st.rows.length} Guest(s) saved to the PDF file.`)}
          catch(e){console.warn(e);openAccountsStatementPdf({...args,mode:'pdf'});showSamaraActionToast('warning','PDF opened for saving',`${e.message||'PDF library unavailable'} — choose "Save as PDF" in the window that opened.`)}
        }
        else openAccountsStatementPdf({...args,mode:'print'});
        try{writeAuditEvent('Download Accounts Statement','Billing',null,{format:fmt,from:pFrom,to:pTo,guests:st.rows.length,mode:A.guestMode})}catch(_){}
      }catch(e){showSamaraActionToast('error','Download failed',e.message||'Please try again.')}
      finally{setBusy('')}
    }
    const numCell=(v,key,bold,bal)=>h('td',{key,'data-label':key,style:{textAlign:'right',whiteSpace:'nowrap',fontWeight:bold?700:400,color:bal&&v>0.005?'#b42336':bal&&v<-0.005?'#16814d':undefined}},bal?astBal(v):astMoney(v));
    const fieldRow={display:'flex',gap:'8px',alignItems:'center',fontWeight:400,minHeight:'36px',cursor:'pointer',fontSize:'13px'};
    const box={width:'20px',height:'20px',minWidth:'20px',margin:0};

    return h('div',{className:'sr-compact'},h('style',null,SR_COMPACT_CSS),h(Section,{title:'Statement',subtitle:'Guest-wise Opening balance, Charges, Received, Discount, Refund and Balance for a Date, Week, Month or Period.'},
      h('div',{className:'sr-filters'},
        h('div',{className:'field'},h('label',null,'Guests'),h('select',{value:guestMode,onChange:e=>setGuestMode(e.target.value)},h('option',{value:'all'},'All Guests'),h('option',{value:'selected'},'Selected Guests'))),
        h('div',{className:'field'},h('label',null,'Status'),h('select',{value:scope,onChange:e=>setScope(e.target.value)},h('option',{value:'all'},'Active + Discharged'),h('option',{value:'active'},'Active Guests'),h('option',{value:'inactive'},'Discharged / Inactive'))),
        h('div',{className:'field'},h('label',null,'Date / Period'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},SR_PERIODS.map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='date'&&h('div',{className:'field'},h('label',null,'Date'),h(StrictDateInput,{value:date,max:today,onChange:e=>setDate(e.target.value)})),
        period==='monthpick'&&h('div',{className:'field'},h('label',null,'Month'),h('select',{value:month,onChange:e=>setMonth(e.target.value)},srMonthOptions().map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:from,max:today,onChange:e=>setFrom(e.target.value)})),
        period==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:to,max:today,onChange:e=>setTo(e.target.value)})),
        h('div',{className:'field'},h('label',null,'Show'),
          h('label',{style:fieldRow},h('input',{type:'checkbox',checked:includeTrial,onChange:e=>setIncludeTrial(e.target.checked),style:box}),h('span',null,'Include Trial Guests')),
          guestMode==='all'&&h('label',{style:fieldRow},h('input',{type:'checkbox',checked:hideNil,onChange:e=>setHideNil(e.target.checked),style:box}),h('span',null,'Hide Guests with no entries & ₹0'))),
        h(ApplyFilterButton,{dirty:fa.dirty,onApply:fa.apply})
      ),
      guestMode==='selected'&&h('div',{className:'card',style:{padding:'10px 12px',margin:'0 0 10px',border:'1px solid #f0c9da'}},
        h('div',{className:'sr-filters',style:{marginBottom:'6px'}},
          h('div',{className:'field sr-wide'},h('label',null,'Search Guest name / ID'),h('input',{type:'search',value:query,placeholder:'Type at least 3 characters',onChange:e=>setQuery(e.target.value)})),
          h('div',{className:'field sr-wide'},h('label',null,'Add Guest'),h('select',{value:'',onChange:e=>{const id=e.target.value;if(id){setSelectedIds([...selectedIds,id]);setQuery('')}}},
            h('option',{value:''},pickList.length?`Choose a Guest (${pickList.length})…`:'No Guests match'),
            pickList.map(p=>h('option',{key:p.id,value:p.id},`${astGuestName(p)} · ${p.patient_id||'No ID'} · ${astRoom(p)}${p.is_trial?' · 🧪 Trial':''}`))))),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px'}},
          selectedIds.length?selectedIds.map(id=>{const p=byId.get(id);return h('span',{key:id,className:'status-pill',style:{display:'inline-flex',gap:'6px',alignItems:'center',background:'#fbe9f1',color:'#741041',borderRadius:'14px',padding:'4px 10px',fontWeight:700}},
            `${p?astGuestName(p):'Guest'} · ${p?.patient_id||''}`,
            h('button',{type:'button','aria-label':'Remove',onClick:()=>setSelectedIds(selectedIds.filter(x=>x!==id)),style:{border:0,background:'transparent',color:'#b42336',fontWeight:800,cursor:'pointer',padding:0}},'×'))})
          :h('small',{className:'small-note'},'No Guest selected yet — add one or more Guests, then press Apply.'),
          selectedIds.length>1&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setSelectedIds([])},'Clear all'))
      ),
      h('div',{className:'sr-bar'},
        h('span',{className:'small-note'},`${astScopeText(A)} · ${astPeriodText(pFrom,pTo)}${st?` · ${st.rows.length} Guest(s)`:''}`),
        h('button',{type:'button',className:'btn btn-primary',disabled:!st||!!busy||fa.dirty,onClick:()=>download('excel')},busy==='excel'?'Preparing Excel…':'⤓ Download Excel'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!st||!!busy||fa.dirty,onClick:()=>download('print')},busy==='print'?'Preparing…':'🖨 Print'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!st||!!busy||fa.dirty,onClick:()=>download('pdf')},busy==='pdf'?'Preparing PDF…':'⤓ Download PDF'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>{setTransactions(null);setReloadKey(k=>k+1)}},'Refresh'),
        fa.dirty&&h('small',{className:'error-text',style:{alignSelf:'center'}},'Press Apply first — the table and downloads follow the applied filter.')
      ),
      error&&h('p',{role:'alert',className:'message error'},error),
      !transactions&&!error&&h('p',{className:'small-note'},'Loading statement…'),
      st&&h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,AST_HEAD.map((x,i)=>h('th',{key:x,style:i>=4?{textAlign:'right'}:undefined},x)))),
        h('tbody',null,
          st.rows.length?st.rows.map((r,i)=>h('tr',{key:r.patient.id,style:{cursor:'pointer'},title:'Show this Guest’s entries',onClick:()=>setDetail(r)},
            h('td',{'data-label':'Sl.',style:{textAlign:'center'}},i+1),
            h('td',{'data-label':'Guest'},h('b',null,astGuestName(r.patient)),r.patient.is_trial&&h('small',null,' · 🧪 Trial')),
            h('td',{'data-label':'Guest ID'},r.patient.patient_id||'—'),
            h('td',{'data-label':'Room / Status'},astRoom(r.patient)),
            numCell(r.opening,'Opening Balance'),numCell(r.charges,'Charges'),numCell(r.received,'Received'),numCell(r.discount,'Discount'),numCell(r.refund,'Refund'),numCell(r.balance,'Balance',true,true)))
          :h('tr',null,h('td',{colSpan:AST_HEAD.length,style:{textAlign:'center'}},A.guestMode==='selected'&&!(A.selectedIds||[]).length?'Add Guests and press Apply.':'No Guests to show for this filter.')),
          st.rows.length>0&&h('tr',{style:{background:'#fbe9f1',fontWeight:700}},
            h('td',null,''),h('td',{'data-label':'Total'},h('b',null,'TOTAL')),h('td',null,''),h('td',null,''),
            numCell(st.total.opening,'Opening Balance',true),numCell(st.total.charges,'Charges',true),numCell(st.total.received,'Received',true),numCell(st.total.discount,'Discount',true),numCell(st.total.refund,'Refund',true),numCell(st.total.balance,'Balance',true,true))
        ))),
      st&&h('p',{className:'small-note',style:{marginTop:'8px'}},'Balance = Opening Balance + Charges − Received − Discount + Refund. Red = due from the family; green "Cr" = advance held. Received = payments and advances. Tap a Guest to see the entries.'),
      detail&&h(RowDetailModal,{title:astGuestName(detail.patient),subtitle:`${detail.patient.patient_id||''} · ${astRoom(detail.patient)} · ${astPeriodText(pFrom,pTo)}`,onClose:()=>setDetail(null),
        fields:[['Opening Balance',astBal(detail.opening)],['Charges',astMoney(detail.charges)],['Received',astMoney(detail.received)],['Discount',astMoney(detail.discount)],['Refund',astMoney(detail.refund)],['Balance',astBal(detail.balance)]]},
        h('div',{className:'table-wrap',style:{marginTop:'10px',maxHeight:'50vh',overflow:'auto'}},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Date','Particulars','Debit','Credit'].map((x,i)=>h('th',{key:x,style:i>=2?{textAlign:'right'}:undefined},x)))),
          h('tbody',null,detail.lines.length?detail.lines.map(t=>{const s=astSign(t),a=Number(t.amount||0);return h('tr',{key:t.id},
            h('td',{'data-label':'Date'},formatDateIN(t._day)),h('td',{'data-label':'Particulars'},billLineLabel(t)),
            h('td',{'data-label':'Debit',style:{textAlign:'right'}},s>0?astMoney(a):'—'),h('td',{'data-label':'Credit',style:{textAlign:'right'}},s<0?astMoney(a):'—'))})
            :h('tr',null,h('td',{colSpan:4,style:{textAlign:'center'}},'No entries in this period.'))))))
    ));
  }
