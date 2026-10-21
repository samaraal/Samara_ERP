  // 2.18.56: ACCOUNTS / BILLING → Statement — Samara Guests' money received in a chosen period:
  //   Sl. · Guest name · Advance Received · Amount Received · Total   (+ TOTAL row)
  // Advance = an "Advance" entry or a Payment in the Advance category (billIsAdvance); Amount Received =
  // every other Payment. Discounts, charges and refunds are not part of this statement.
  // Reuses srPeriodBounds / srMonthOptions / SR_PERIODS / srEsc (stores/stock-report.js) and
  // loadXlsxLibrary / freshFetchAll / freshSaveBlob / freshCsv / freshFileStamp (stores/stock-fresh-start.js).
  const astMoney=v=>`₹${(Math.round((Number(v)||0)*100)/100).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
  const astGuestName=p=>formalName(p)||p?.full_name||'Guest';
  const astRoom=p=>p?.is_active===false?'Discharged':p?.room_no?`Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'—';
  const AST_HEAD=['Sl.','Guest Name','Advance Received','Amount Received','Total'];
  const astSort=(a,b)=>astGuestName(a).localeCompare(astGuestName(b),'en',{sensitivity:'base',numeric:true});

  function buildAccountsStatement({patients,transactions,from,to,guestId}){
    const byId=new Map((patients||[]).map(p=>[p.id,p]));
    const map=new Map();
    (transactions||[]).forEach(t=>{
      const type=String(t.transaction_type||'');
      if(type!=='Payment'&&type!=='Advance')return;
      const p=byId.get(t.patient_id);if(!p)return;
      if(guestId?p.id!==guestId:p.is_trial)return;
      const day=billRowDayISO(t);if(!day||day<from||day>to)return;
      if(!map.has(p.id))map.set(p.id,{patient:p,advance:0,received:0,lines:[]});
      const r=map.get(p.id),amount=Number(t.amount||0),adv=billIsAdvance(t);
      if(adv)r.advance+=amount;else r.received+=amount;
      r.lines.push({...t,_day:day,_adv:adv});
    });
    const rows=[...map.values()].map(r=>({...r,total:r.advance+r.received,lines:r.lines.sort((a,b)=>String(a._day).localeCompare(String(b._day))||String(a.transaction_date||'').localeCompare(String(b.transaction_date||'')))}))
      .sort((a,b)=>astSort(a.patient,b.patient));
    const total=rows.reduce((s,r)=>({advance:s.advance+r.advance,received:s.received+r.received,total:s.total+r.total}),{advance:0,received:0,total:0});
    return {rows,total};
  }
  const astTableRows=st=>st.rows.map((r,i)=>[i+1,astGuestName(r.patient),r.advance,r.received,r.total]);
  const astPeriodText=(from,to)=>from===to?`Date: ${formatDateIN(from)}`:`Period: ${formatDateIN(from)} to ${formatDateIN(to)}`;
  const astScopeText=A=>A.guestId?'One Guest':'All Guests';

  async function downloadAccountsStatementExcel({st,from,to,A,profile}){
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const top=[['SAMARA HEALTH CARE LLP'],['Statement of Amount Received'],[astPeriodText(from,to)],
      [`Downloaded on ${formatDateTimeIN(new Date().toISOString())} by ${who}`],[]];
    const m2=v=>Math.round((Number(v)||0)*100)/100;
    const sheet=[...top,AST_HEAD,...astTableRows(st).map(r=>r.map((v,i)=>i>=2?m2(v):v)),['','TOTAL',m2(st.total.advance),m2(st.total.received),m2(st.total.total)]];
    const base=`Samara_Statement_${from}_to_${to}_${freshFileStamp()}`;
    try{
      const X=await loadXlsxLibrary(),wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet(sheet);
      ws['!cols']=[6,34,18,18,16].map(w=>({wch:w}));
      ws['!merges']=[0,1,2,3].map(r=>({s:{r,c:0},e:{r,c:AST_HEAD.length-1}}));
      X.utils.book_append_sheet(wb,ws,'Statement');
      X.writeFile(wb,`${base}.xlsx`);return 'xlsx';
    }catch(e){
      console.warn(e);freshSaveBlob(new Blob(['\ufeff'+freshCsv(sheet)],{type:'text/csv;charset=utf-8'}),`${base}.csv`);return 'csv';
    }
  }

  // Print (and PDF fallback): a printable A4 page that opens the browser Print dialog.
  function openAccountsStatementPdf({st,from,to,profile,mode}){
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const now=formatDateTimeIN(new Date().toISOString());
    const logo=new URL('assets/samara-logo.png',window.location.href).href;
    const rows=astTableRows(st).map(r=>`<tr><td class="sn">${r[0]}</td><td>${srEsc(r[1])}</td><td class="num">${srEsc(astMoney(r[2]))}</td><td class="num">${srEsc(astMoney(r[3]))}</td><td class="num bal">${srEsc(astMoney(r[4]))}</td></tr>`).join('')
      ||`<tr><td colspan="5" style="text-align:center;padding:14px">No amount received in this period</td></tr>`;
    const t=st.total;
    const totalRow=st.rows.length?`<tr class="tot"><td></td><td>TOTAL</td><td class="num">${srEsc(astMoney(t.advance))}</td><td class="num">${srEsc(astMoney(t.received))}</td><td class="num bal">${srEsc(astMoney(t.total))}</td></tr>`:'';
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Samara_Statement_${srEsc(from)}_to_${srEsc(to)}</title><style>
      @page{size:A4 portrait;margin:12mm 10mm 14mm}*{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:11px;line-height:1.4;background:#fff}
      .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b20b5d;padding:0 2px 8px;margin-bottom:12px}
      .logo{width:130px;max-height:64px;object-fit:contain}.org{text-align:right}.org strong{display:block;color:#b20b5d;font-size:16px}.org span{display:block;color:#6d5963;font-size:9px}
      h1{font-size:17px;margin:4px 0 2px;text-align:center;color:#321d28}.meta{text-align:center;color:#7b6670;margin:0 0 12px}
      table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}
      th{background:#f7dce8;color:#67123d;border:1px solid #dfb4c6;padding:7px 6px;text-align:left}th.n{text-align:right}
      td{border:1px solid #ead4dd;padding:6px}tbody tr:nth-child(even) td{background:#fffafd}
      .num{text-align:right;white-space:nowrap}.sn{text-align:center;width:40px}.bal{font-weight:700;color:#741041}
      tr.tot td{font-weight:700;background:#fbe9f1!important;border-top:2px solid #b20b5d}
      .sign{display:flex;justify-content:space-between;margin-top:40px}.sign div{border-top:1px solid #6f5c65;padding-top:6px;width:30%;text-align:center}
      .footer{border-top:1px solid #eccbd9;margin-top:18px;padding-top:6px;text-align:center;color:#6f5a64;font-size:8.5px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="top"><img class="logo" src="${logo}" alt="Samara Assisted Living"><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Accounts / Billing</span><span>Compassion • Comfort • Dignity</span></div></div>
      <h1>Statement of Amount Received</h1>
      <p class="meta">${srEsc(astPeriodText(from,to))}</p>
      <table><thead><tr>${AST_HEAD.map((x,i)=>`<th${i>=2?' class="n"':''}>${srEsc(x)}</th>`).join('')}</tr></thead><tbody>${rows}${totalRow}</tbody></table>
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
  async function downloadAccountsStatementPdfFile({st,from,to,profile}){
    const jsPDF=await loadAstPdfLibrary();
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const rs=v=>astMoney(v).replace('₹','Rs. ');
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
    doc.setTextColor(50,29,40);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('Statement of Amount Received',W/2,34,{align:'center'});
    doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(123,102,112);doc.text(astPeriodText(from,to),W/2,40,{align:'center'});
    const body=astTableRows(st).map(r=>[String(r[0]),r[1],rs(r[2]),rs(r[3]),rs(r[4])]);
    const t=st.total;
    doc.autoTable({startY:45,head:[AST_HEAD],body:body.length?body:[[{content:'No amount received in this period',colSpan:5,styles:{halign:'center'}}]],
      foot:st.rows.length?[['','TOTAL',rs(t.advance),rs(t.received),rs(t.total)]]:[],showFoot:'lastPage',
      theme:'grid',margin:{left:10,right:10,bottom:16},
      styles:{fontSize:9.5,cellPadding:2.2,lineColor:[234,212,221],textColor:[59,40,51]},
      headStyles:{fillColor:[247,220,232],textColor:[103,18,61],fontStyle:'bold'},
      footStyles:{fillColor:[251,233,241],textColor:[116,16,65],fontStyle:'bold'},
      alternateRowStyles:{fillColor:[255,250,253]},
      columnStyles:{0:{halign:'center',cellWidth:12},2:{halign:'right',cellWidth:38},3:{halign:'right',cellWidth:38},4:{halign:'right',cellWidth:36,fontStyle:'bold',textColor:[116,16,65]}},
      didParseCell:d=>{if((d.section==='head'||d.section==='foot')&&d.column.index>=2)d.cell.styles.halign='right'}
    });
    let y=(doc.lastAutoTable?.finalY||50)+28;
    if(y>H-24){doc.addPage();y=30}
    doc.setDrawColor(111,92,101);doc.setLineWidth(0.3);doc.setFontSize(8.5);doc.setTextColor(107,89,97);
    [['Prepared By',10],['Accounts',W/2-28],['Admin / Director',W-66]].forEach(([l,x])=>{doc.line(x,y,x+56,y);doc.text(l,x+28,y+4.5,{align:'center'})});
    const pages=doc.internal.getNumberOfPages(),now=formatDateTimeIN(new Date().toISOString());
    for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7.5);doc.setTextColor(111,90,100);
      doc.text(`Generated from Samara Care ERP on ${now} by ${who} · Computer-generated statement · Page ${i} of ${pages}`,W/2,H-7,{align:'center'})}
    doc.save(`Samara_Statement_${from}_to_${to}_${freshFileStamp()}.pdf`);
  }

  function AccountsStatement({profile}){
    const [patients]=usePatients(true);
    const today=todayISOIndia();
    const [guestId,setGuestId]=React.useState('');
    const [period,setPeriod]=React.useState('month'),[from,setFrom]=React.useState(''),[to,setTo]=React.useState(''),[date,setDate]=React.useState(today),[month,setMonth]=React.useState(today.slice(0,7));
    const fa=useAppliedFilters({guestId,period,from,to,date,month});const A=fa.applied;
    const [transactions,setTransactions]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(''),[reloadKey,setReloadKey]=React.useState(0);
    const [detail,setDetail]=React.useState(null);
    React.useEffect(()=>{
      let live=true;setError('');
      freshFetchAll('billing_transactions','*','transaction_date',q=>q.in('transaction_type',['Payment','Advance'])).then(rows=>{if(live)setTransactions(rows)}).catch(e=>{if(live)setError(e.message||'Could not load the receipts.')});
      return()=>{live=false};
    },[reloadKey]);
    const [pFrom,pTo]=srPeriodBounds(A);
    const st=transactions?buildAccountsStatement({patients,transactions,from:pFrom,to:pTo,guestId:A.guestId}):null;
    const guests=[...(patients||[])].sort(astSort);

    async function download(fmt){
      if(!st||busy||fa.dirty)return;setBusy(fmt);
      const args={st,from:pFrom,to:pTo,A,profile};
      try{
        if(fmt==='excel'){const f=await downloadAccountsStatementExcel(args);showSamaraActionToast('success','Statement downloaded',f==='xlsx'?'Saved to the Excel file.':'Excel library unavailable — saved as a CSV file instead (opens in Excel).')}
        else if(fmt==='pdf'){
          try{await downloadAccountsStatementPdfFile(args);showSamaraActionToast('success','Statement PDF downloaded','Saved to the PDF file.')}
          catch(e){console.warn(e);openAccountsStatementPdf({...args,mode:'pdf'});showSamaraActionToast('warning','PDF opened for saving',`${e.message||'PDF library unavailable'} — choose "Save as PDF" in the window that opened.`)}
        }
        else openAccountsStatementPdf({...args,mode:'print'});
        try{writeAuditEvent('Download Accounts Statement','Billing',null,{format:fmt,from:pFrom,to:pTo,guests:st.rows.length})}catch(_){}
      }catch(e){showSamaraActionToast('error','Download failed',e.message||'Please try again.')}
      finally{setBusy('')}
    }
    const num=(v,bold)=>h('td',{style:{textAlign:'right',whiteSpace:'nowrap',fontWeight:bold?700:400}},astMoney(v));

    return h('div',{className:'sr-compact'},h('style',null,SR_COMPACT_CSS),h(Section,{title:'Statement',subtitle:'Amount received from Samara Guests for a date, month or period.'},
      h('div',{className:'sr-filters'},
        h('div',{className:'field sr-wide'},h('label',null,'Guest'),h('select',{value:guestId,onChange:e=>setGuestId(e.target.value)},
          h('option',{value:''},'All Guests'),
          guests.map(p=>h('option',{key:p.id,value:p.id},`${astGuestName(p)} · ${p.patient_id||'No ID'} · ${astRoom(p)}`)))),
        h('div',{className:'field'},h('label',null,'Date / Period'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},SR_PERIODS.map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='date'&&h('div',{className:'field'},h('label',null,'Date'),h(StrictDateInput,{value:date,max:today,onChange:e=>setDate(e.target.value)})),
        period==='monthpick'&&h('div',{className:'field'},h('label',null,'Month'),h('select',{value:month,onChange:e=>setMonth(e.target.value)},srMonthOptions().map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:from,max:today,onChange:e=>setFrom(e.target.value)})),
        period==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:to,max:today,onChange:e=>setTo(e.target.value)})),
        h(ApplyFilterButton,{dirty:fa.dirty,onApply:fa.apply})
      ),
      h('div',{className:'sr-bar'},
        h('span',{className:'small-note'},astPeriodText(pFrom,pTo)),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!st||!!busy||fa.dirty,onClick:()=>download('print')},busy==='print'?'Preparing…':'🖨 Print'),
        h('button',{type:'button',className:'btn btn-primary',disabled:!st||!!busy||fa.dirty,onClick:()=>download('pdf')},busy==='pdf'?'Preparing PDF…':'⤓ Download PDF'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!st||!!busy||fa.dirty,onClick:()=>download('excel')},busy==='excel'?'Preparing Excel…':'⤓ Download Excel'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>{setTransactions(null);setReloadKey(k=>k+1)}},'Refresh'),
        fa.dirty&&h('small',{className:'error-text',style:{alignSelf:'center'}},'Press Apply first.')
      ),
      error&&h('p',{role:'alert',className:'message error'},error),
      !transactions&&!error&&h('p',{className:'small-note'},'Loading statement…'),
      st&&h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,AST_HEAD.map((x,i)=>h('th',{key:x,style:i>=2?{textAlign:'right'}:i===0?{width:'50px'}:undefined},x)))),
        h('tbody',null,
          st.rows.length?st.rows.map((r,i)=>h('tr',{key:r.patient.id,style:{cursor:'pointer'},title:'Show the receipts',onClick:()=>setDetail(r)},
            h('td',{style:{textAlign:'center'}},i+1),
            h('td',null,h('b',null,astGuestName(r.patient))),
            num(r.advance),num(r.received),num(r.total,true)))
          :h('tr',null,h('td',{colSpan:5,style:{textAlign:'center'}},'No amount received in this period.')),
          st.rows.length>0&&h('tr',{style:{background:'#fbe9f1'}},h('td',null,''),h('td',null,h('b',null,'TOTAL')),num(st.total.advance,true),num(st.total.received,true),num(st.total.total,true))
        ))),
      detail&&h(RowDetailModal,{title:astGuestName(detail.patient),subtitle:`${detail.patient.patient_id||''} · ${astPeriodText(pFrom,pTo)}`,onClose:()=>setDetail(null),
        fields:[['Advance Received',astMoney(detail.advance)],['Amount Received',astMoney(detail.received)],['Total',astMoney(detail.total)]]},
        h('div',{style:{marginTop:'10px',maxHeight:'50vh',overflowY:'auto',overflowX:'hidden'}},h('table',{className:'table',style:{width:'100%',minWidth:0,tableLayout:'fixed'}},
          h('thead',null,h('tr',null,[['Date','92px'],['Receipt','auto'],['Mode','90px'],['Amount','100px']].map(([x,w],i)=>h('th',{key:x,style:{width:w,textAlign:i===3?'right':'left'}},x)))),
          h('tbody',null,detail.lines.map(t=>h('tr',{key:t.id},
            h('td',null,formatDateIN(t._day)),
            h('td',{style:{overflowWrap:'anywhere'}},`${t._adv?'Advance':'Payment'}${t.payment_reference?` · ${t.payment_reference}`:''}`),
            h('td',null,/not applicable/i.test(t.payment_mode||'')?'—':(t.payment_mode||'—')),
            h('td',{style:{textAlign:'right'}},astMoney(t.amount))))))))
    ));
  }
