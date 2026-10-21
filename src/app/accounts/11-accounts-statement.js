  // 2.18.58: ACCOUNTS / BILLING → Statement, for a chosen Date / Month / Period (all figures within it):
  //   Sl. · Guest Name · Status · Total Bill · Advance Received · Payment Received · Discount · Balance Due
  // Section 1 = Samara Guests (billing_transactions; room-tariff adjustments folded into the charge, so they
  // never show as discounts). Section 2 = Outside Samara Nursing Procedures (loadOutsideNursingFinance),
  // grouped per person by name + phone; outside nursing has no advances. Then GRAND TOTAL (1 + 2).
  // Balance Due = Total Bill − Advance − Payment − Discount + Refund (a refund paid back adds to it).
  // Names A → Z by the name itself, ignoring the title (Mr. / Mrs. …).
  // Reuses srPeriodBounds / srMonthOptions / SR_PERIODS / srEsc (stores/stock-report.js) and
  // loadXlsxLibrary / freshFetchAll / freshSaveBlob / freshCsv / freshFileStamp (stores/stock-fresh-start.js).
  const astMoney=v=>`₹${(Math.round((Number(v)||0)*100)/100).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
  const astBal=v=>{const n=Math.round((Number(v)||0)*100)/100;return n<-0.005?`${astMoney(-n)} Cr`:astMoney(n)};
  const astGuestName=p=>formalName(p)||p?.full_name||'Guest';
  const astRoom=p=>p?.is_active===false?'Discharged':p?.room_no?`Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'—';
  const AST_TITLE_RE=/^\s*(thirumathi|thiru|kumari|master|selvi|shri|prof|miss|baby|late|mrs|smt|rev|dr|mr|ms|fr|br|sr)(?:\.\s*|\s+)/i;
  const astSortName=p=>String(p?.full_name||astGuestName(p)||'').replace(AST_TITLE_RE,'').replace(AST_TITLE_RE,'').trim().toLowerCase();
  const astSort=(a,b)=>astSortName(a).localeCompare(astSortName(b),'en',{sensitivity:'base',numeric:true});
  const AST_KEYS=['bill','advance','payment','discount','balance'];
  const AST_HEAD=['Sl.','Guest Name','Status','Total Bill','Advance Received','Payment Received','Discount','Balance Due'];
  const astZero=()=>({bill:0,advance:0,payment:0,discount:0,refund:0,balance:0});
  const astOutsideKey=p=>`${String(p?.full_name||'').trim().toLowerCase()}|${String(p?.phone||p?.mobile||'').replace(/\D/g,'').slice(-10)}`;

  function astSection(title,map){
    const rows=[...map.values()].map(r=>({...r,balance:r.bill-r.advance-r.payment-r.discount+r.refund,
      lines:r.lines.sort((a,b)=>String(a._day).localeCompare(String(b._day))||String(a.transaction_date||'').localeCompare(String(b.transaction_date||'')))}))
      .sort((a,b)=>astSort(a.patient,b.patient));
    const total=rows.reduce((s,r)=>{['bill','advance','payment','discount','refund','balance'].forEach(k=>s[k]+=r[k]);return s},astZero());
    return {title,rows,total};
  }
  function buildAccountsStatement({patients,transactions,outsideRows,from,to,guestId}){
    const byId=new Map((patients||[]).map(p=>[p.id,p]));
    const want=guestId||'';
    const add=(map,key,patient,status,t)=>{
      const day=billRowDayISO(t);if(!day||day<from||day>to)return;
      const type=String(t.transaction_type||''),amount=Number(t.amount||0);
      if(!map.has(key))map.set(key,{key,patient,status,...astZero(),lines:[]});
      const r=map.get(key);
      if(type==='Charge')r.bill+=amount;
      else if(type==='Advance'||type==='Payment'){if(billIsAdvance(t))r.advance+=amount;else r.payment+=amount}
      else if(type==='Discount')r.discount+=amount;
      else if(type==='Refund')r.refund+=amount;
      else return;
      r.lines.push({...t,_day:day});
    };
    const samara=new Map(),outside=new Map();
    if(!want.startsWith('o:')){
      const byPatient=new Map();
      (transactions||[]).forEach(t=>{const p=byId.get(t.patient_id);if(!p)return;if(want?`g:${p.id}`!==want:p.is_trial)return;
        if(!byPatient.has(p.id))byPatient.set(p.id,[]);byPatient.get(p.id).push(t)});
      byPatient.forEach((list,id)=>{const p=byId.get(id);billFoldTariffAdjustments(list).forEach(t=>add(samara,`g:${id}`,p,p.is_active===false?'Discharged':'Active',t))});
    }
    if(!want.startsWith('g:'))(outsideRows||[]).forEach(t=>{
      const key=`o:${astOutsideKey(t.patients)}`;if(want&&key!==want)return;
      add(outside,key,t.patients||{full_name:'Outside patient'},'Outside visit',t);
    });
    const sections=[astSection('1. Samara',samara),astSection('2. Outside Samara Nursing Procedures',outside)];
    const grand=sections.reduce((s,x)=>{Object.keys(s).forEach(k=>s[k]+=x.total[k]);return s},astZero());
    return {sections,grand};
  }
  // one display row: [Sl, Name, Status, bill, advance, payment, discount, balance]
  const astTableRows=sec=>sec.rows.map((r,i)=>[i+1,astGuestName(r.patient),r.status,...AST_KEYS.map(k=>r[k])]);
  const astTotalRow=(label,t)=>['',label,'',...AST_KEYS.map(k=>t[k])];
  const astFmt=(v,i)=>i===7?astBal(v):astMoney(v);
  const astPeriodText=(from,to)=>from===to?`Date: ${formatDateIN(from)}`:`Period: ${formatDateIN(from)} to ${formatDateIN(to)}`;
  const AST_NOTE='All figures are for the chosen period. Balance Due = Total Bill − Advance − Payment − Discount (+ any refund paid back). "Cr" = advance held.';

  async function downloadAccountsStatementExcel({st,from,to,profile}){
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const top=[['SAMARA HEALTH CARE LLP'],['Accounts / Billing — Statement'],[astPeriodText(from,to)],
      [`Downloaded on ${formatDateTimeIN(new Date().toISOString())} by ${who}`],[]];
    const m2=v=>Math.round((Number(v)||0)*100)/100;
    const num=r=>r.map((v,i)=>i>=3?m2(v):v);
    const sheet=[...top];
    st.sections.forEach(sec=>{
      sheet.push([sec.title],AST_HEAD,...astTableRows(sec).map(num));
      if(!sec.rows.length)sheet.push(['','No entries in this period']);
      sheet.push(num(astTotalRow('TOTAL',sec.total)),[]);
    });
    sheet.push(num(astTotalRow('GRAND TOTAL (1 + 2)',st.grand)),[],[AST_NOTE]);
    const base=`Samara_Statement_${from}_to_${to}_${freshFileStamp()}`;
    try{
      const X=await loadXlsxLibrary(),wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet(sheet);
      ws['!cols']=[6,30,13,14,16,16,12,15].map(w=>({wch:w}));
      ws['!merges']=[0,1,2,3].map(r=>({s:{r,c:0},e:{r,c:AST_HEAD.length-1}}));
      X.utils.book_append_sheet(wb,ws,'Statement');
      X.writeFile(wb,`${base}.xlsx`);return 'xlsx';
    }catch(e){
      console.warn(e);freshSaveBlob(new Blob(['﻿'+freshCsv(sheet)],{type:'text/csv;charset=utf-8'}),`${base}.csv`);return 'csv';
    }
  }

  // Print (and PDF fallback): a printable A4 page that opens the browser Print dialog.
  function openAccountsStatementPdf({st,from,to,profile,mode}){
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const now=formatDateTimeIN(new Date().toISOString());
    const logo=new URL('assets/samara-logo.png',window.location.href).href;
    const cells=r=>r.map((v,i)=>i>=3?`<td class="num${i===7?' bal':''}">${srEsc(astFmt(v,i))}</td>`:`<td${i===0?' class="sn"':''}>${srEsc(v)}</td>`).join('');
    const secHtml=sec=>{
      const rows=astTableRows(sec).map(r=>`<tr>${cells(r)}</tr>`).join('')||`<tr><td colspan="8" style="text-align:center;padding:10px">No entries in this period</td></tr>`;
      return `<h2>${srEsc(sec.title)}</h2><table><thead><tr>${AST_HEAD.map((x,i)=>`<th${i>=3?' class="n"':''}>${srEsc(x)}</th>`).join('')}</tr></thead><tbody>${rows}<tr class="tot">${cells(astTotalRow('TOTAL',sec.total))}</tr></tbody></table>`;
    };
    const body=st.sections.map(secHtml).join('')+`<table class="grand"><tbody><tr>${cells(astTotalRow('GRAND TOTAL (1 + 2)',st.grand))}</tr></tbody></table>`;
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Samara_Statement_${srEsc(from)}_to_${srEsc(to)}</title><style>
      @page{size:A4 landscape;margin:11mm 9mm 13mm}*{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:10.5px;line-height:1.4;background:#fff}
      .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:3px solid #b20b5d;padding:0 2px 8px;margin-bottom:12px}
      .logo{width:130px;max-height:64px;object-fit:contain}.mid{text-align:center;color:#741041;font-weight:700;font-size:13px;letter-spacing:.3px}
      .org{text-align:right}.org strong{display:block;color:#b20b5d;font-size:16px}.org span{display:block;color:#6d5963;font-size:9px}
      h1{font-size:17px;margin:4px 0 2px;text-align:center;color:#321d28}.meta{text-align:center;color:#7b6670;margin:0 0 10px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{page-break-inside:avoid}
      th{background:#f7dce8;color:#67123d;border:1px solid #dfb4c6;padding:6px 5px;text-align:left}th.n{text-align:right}
      td{border:1px solid #ead4dd;padding:5px;overflow-wrap:anywhere}tbody tr:nth-child(even) td{background:#fffafd}
      th:nth-child(1),td:nth-child(1){width:34px}th:nth-child(2),td:nth-child(2){width:24%}th:nth-child(3),td:nth-child(3){width:9%}
      .num{text-align:right;white-space:nowrap}.sn{text-align:center}.bal{font-weight:700;color:#741041}
      tr.tot td{font-weight:700;background:#fbe9f1!important;border-top:2px solid #b20b5d}
      h2{font-size:13px;color:#741041;margin:12px 0 6px}
      table.grand{margin-top:12px}table.grand td{font-weight:800;font-size:11.5px;background:#b20b5d!important;color:#fff;border:1px solid #b20b5d;padding:7px 5px}
      .note{margin-top:8px;color:#6b5961;font-size:9px}
      .sign{display:flex;justify-content:space-between;margin-top:36px}.sign div{border-top:1px solid #6f5c65;padding-top:6px;width:28%;text-align:center}
      .footer{border-top:1px solid #eccbd9;margin-top:16px;padding-top:6px;text-align:center;color:#6f5a64;font-size:8.5px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="top"><img class="logo" src="${logo}" alt="Samara Assisted Living"><div class="mid">Accounts / Billing</div><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Compassion • Comfort • Dignity</span></div></div>
      <h1>Statement</h1>
      <p class="meta">${srEsc(astPeriodText(from,to))}</p>
      ${body}
      <p class="note">${srEsc(AST_NOTE)}</p>
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
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const rs=(v,i)=>astFmt(v,i).replace('₹','Rs. ');
    const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    try{
      const blob=await fetch(new URL('assets/samara-logo.png',window.location.href).href).then(r=>{if(!r.ok)throw 0;return r.blob()});
      const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(blob)});
      const img=await new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=data});
      if(img){const h2=16,w2=Math.min(48,h2*img.width/img.height);doc.addImage(data,'PNG',10,8,w2,h2)}
    }catch(_){}
    doc.setTextColor(178,11,93);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('SAMARA HEALTH CARE LLP',W-10,14,{align:'right'});
    doc.setTextColor(109,89,99);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Compassion • Comfort • Dignity',W-10,19,{align:'right'});
    doc.setTextColor(116,16,65);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('Accounts / Billing',W/2,17,{align:'center'});
    doc.setDrawColor(178,11,93);doc.setLineWidth(0.8);doc.line(10,26,W-10,26);
    doc.setTextColor(50,29,40);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('Statement',W/2,33,{align:'center'});
    doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(123,102,112);doc.text(astPeriodText(from,to),W/2,38.5,{align:'center'});
    const fmtRow=r=>r.map((v,i)=>i>=3?rs(v,i):String(v));
    const money={halign:'right',cellWidth:30};
    const common={theme:'grid',margin:{left:10,right:10,bottom:16},
      styles:{fontSize:9,cellPadding:2,lineColor:[234,212,221],textColor:[59,40,51]},
      headStyles:{fillColor:[247,220,232],textColor:[103,18,61],fontStyle:'bold'},
      footStyles:{fillColor:[251,233,241],textColor:[116,16,65],fontStyle:'bold'},
      alternateRowStyles:{fillColor:[255,250,253]},
      columnStyles:{0:{halign:'center',cellWidth:11},2:{cellWidth:24},3:money,4:money,5:money,6:{...money,cellWidth:26},7:{...money,cellWidth:30,fontStyle:'bold',textColor:[116,16,65]}},
      didParseCell:d=>{if((d.section==='head'||d.section==='foot')&&d.column.index>=3)d.cell.styles.halign='right'}};
    let y=45;
    st.sections.forEach(sec=>{
      if(y>H-40){doc.addPage();y=20}
      doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(116,16,65);doc.text(sec.title,10,y);
      const body=astTableRows(sec).map(fmtRow);
      doc.autoTable({...common,startY:y+2,head:[AST_HEAD],body:body.length?body:[[{content:'No entries in this period',colSpan:8,styles:{halign:'center'}}]],
        foot:[fmtRow(astTotalRow('TOTAL',sec.total))],showFoot:'lastPage'});
      y=(doc.lastAutoTable?.finalY||y)+10;
    });
    doc.autoTable({...common,startY:y-4,body:[fmtRow(astTotalRow('GRAND TOTAL (1 + 2)',st.grand))],
      bodyStyles:{fillColor:[178,11,93],textColor:[255,255,255],fontStyle:'bold',fontSize:10},alternateRowStyles:{},
      columnStyles:{...common.columnStyles,7:{...money,cellWidth:30,fontStyle:'bold',textColor:[255,255,255]}}});
    y=(doc.lastAutoTable?.finalY||50)+6;
    if(y>H-34){doc.addPage();y=20}
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(107,89,97);
    doc.text(AST_NOTE.replace(/−/g,'-'),10,y);
    y+=20;doc.setDrawColor(111,92,101);doc.setLineWidth(0.3);doc.setFontSize(8.5);
    [['Prepared By',10],['Accounts',W/2-35],['Admin / Director',W-80]].forEach(([l,x])=>{doc.line(x,y,x+70,y);doc.text(l,x+35,y+4.5,{align:'center'})});
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
    const [transactions,setTransactions]=React.useState(null),[outside,setOutside]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(''),[reloadKey,setReloadKey]=React.useState(0);
    const [detail,setDetail]=React.useState(null);
    React.useEffect(()=>{
      let live=true;setError('');
      freshFetchAll('billing_transactions','*','transaction_date').then(rows=>{if(live)setTransactions(rows)}).catch(e=>{if(live)setError(e.message||'Could not load the receipts.')});
      loadOutsideNursingFinance().then(r=>{if(live)setOutside(r)}).catch(e=>{if(live)setOutside({rows:[],error:e.message||'Outside nursing receipts could not be loaded.'})});
      return()=>{live=false};
    },[reloadKey]);
    const [pFrom,pTo]=srPeriodBounds(A);
    const st=transactions&&outside?buildAccountsStatement({patients,transactions,outsideRows:outside.rows,from:pFrom,to:pTo,guestId:A.guestId}):null;
    const guests=[...(patients||[])].sort(astSort);
    const outsidePeople=(()=>{const m=new Map();(outside?.rows||[]).forEach(r=>{const k=astOutsideKey(r.patients);if(!m.has(k))m.set(k,r.patients||{})});return [...m.entries()].sort((a,b)=>astSort(a[1],b[1]))})();

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
        try{writeAuditEvent('Download Accounts Statement','Billing',null,{format:fmt,from:pFrom,to:pTo,guests:st.sections.reduce((n,x)=>n+x.rows.length,0)})}catch(_){}
      }catch(e){showSamaraActionToast('error','Download failed',e.message||'Please try again.')}
      finally{setBusy('')}
    }
    const num=(v,bold,bal,white)=>h('td',{style:{textAlign:'right',whiteSpace:'nowrap',fontWeight:bold?700:400,color:white?'#fff':bal&&v>0.005?'#b42336':bal&&v<-0.005?'#16814d':undefined}},bal?astBal(v):astMoney(v));
    const nums=(r,bold,white)=>AST_KEYS.map(k=>h(React.Fragment,{key:k},num(r[k],bold||k==='balance',k==='balance',white)));

    return h('div',{className:'sr-compact'},h('style',null,SR_COMPACT_CSS),h(Section,{title:'Statement',subtitle:'Bill, advance, payment, discount and balance per Guest for a date, month or period.'},
      h('div',{className:'sr-filters'},
        h('div',{className:'field sr-wide'},h('label',null,'Guest'),h('select',{value:guestId,onChange:e=>setGuestId(e.target.value)},
          h('option',{value:''},'All (Samara + Outside Nursing)'),
          h('optgroup',{label:'Samara Guests'},guests.map(p=>h('option',{key:p.id,value:`g:${p.id}`},`${astGuestName(p)} · ${p.patient_id||'No ID'} · ${astRoom(p)}`))),
          outsidePeople.length>0&&h('optgroup',{label:'Outside Samara Nursing Procedures'},outsidePeople.map(([k,p])=>h('option',{key:k,value:`o:${k}`},`${astGuestName(p)}${p.phone?` · ${p.phone}`:''}`))))),
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
      !st&&!error&&h('p',{className:'small-note'},'Loading statement…'),
      outside?.error&&h('p',{role:'alert',className:'message warning'},outside.error),
      st&&st.sections.map(sec=>h('div',{key:sec.title,style:{marginBottom:'14px'}},
        h('h4',{style:{margin:'6px 0',color:'#741041'}},sec.title),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,AST_HEAD.map((x,i)=>h('th',{key:x,style:i>=3?{textAlign:'right'}:i===0?{width:'50px'}:undefined},x)))),
          h('tbody',null,
            sec.rows.length?sec.rows.map((r,i)=>h('tr',{key:r.key,style:{cursor:'pointer'},title:'Show the entries',onClick:()=>setDetail(r)},
              h('td',{style:{textAlign:'center'}},i+1),
              h('td',null,h('b',null,astGuestName(r.patient))),
              h('td',null,h('span',{style:{fontSize:'12px',fontWeight:700,padding:'2px 8px',borderRadius:'10px',background:r.status==='Active'?'#e8f6ee':r.status==='Discharged'?'#f2ecef':'#eef3fb',color:r.status==='Active'?'#0a8a4a':r.status==='Discharged'?'#6d5963':'#2d5fa8'}},r.status)),
              ...nums(r)))
            :h('tr',null,h('td',{colSpan:8,style:{textAlign:'center'}},'No entries in this period.')),
            h('tr',{style:{background:'#fbe9f1'}},h('td',null,''),h('td',null,h('b',null,'TOTAL')),h('td',null,''),...nums(sec.total,true))
          ))))),
      st&&h('div',{className:'table-wrap'},h('table',{className:'table'},h('tbody',null,
        h('tr',{style:{background:'#b20b5d'}},h('td',{style:{width:'50px'}},''),h('td',{style:{color:'#fff'}},h('b',null,'GRAND TOTAL (1 + 2)')),h('td',null,''),...nums(st.grand,true,true))))),
      st&&h('p',{className:'small-note',style:{marginTop:'8px'}},AST_NOTE+' Tap a Guest to see the entries.'),
      detail&&h(RowDetailModal,{title:astGuestName(detail.patient),subtitle:`${detail.key.startsWith('o:')?'Outside Samara Nursing Procedures':(detail.patient.patient_id||'')} · ${astPeriodText(pFrom,pTo)}`,onClose:()=>setDetail(null),
        fields:[['Status',detail.status],['Total Bill',astMoney(detail.bill)],['Advance Received',astMoney(detail.advance)],['Payment Received',astMoney(detail.payment)],['Discount',astMoney(detail.discount)],['Refund',detail.refund?astMoney(detail.refund):''],['Balance Due',astBal(detail.balance)]]},
        h('div',{style:{marginTop:'10px',maxHeight:'50vh',overflowY:'auto',overflowX:'hidden'}},h('table',{className:'table',style:{width:'100%',minWidth:0,tableLayout:'fixed'}},
          h('thead',null,h('tr',null,[['Date','92px'],['Particulars','auto'],['Debit','96px'],['Credit','96px']].map(([x,w],i)=>h('th',{key:x,style:{width:w,textAlign:i>=2?'right':'left'}},x)))),
          h('tbody',null,detail.lines.map(t=>{const debit=['Charge','Refund'].includes(t.transaction_type);return h('tr',{key:t.id},
            h('td',null,formatDateIN(t._day)),
            h('td',{style:{overflowWrap:'anywhere'}},t.source==='Outside Nursing'?`${t.transaction_type==='Payment'?'Payment received':t.transaction_type==='Discount'?'Concession':'Charge'} · ${t.description||t.invoice_number||''}${t.transaction_type==='Payment'&&t.payment_reference?` · ${t.payment_reference}`:''}`:billLineLabel(t)),
            h('td',{style:{textAlign:'right'}},debit?astMoney(t.amount):'—'),
            h('td',{style:{textAlign:'right'}},debit?'—':astMoney(t.amount)))})))))
    ));
  }
