  // 2.18.45: Pharmacy & Stores — STOCK REPORT download (Boomi, 20-10-2026).
  // Two reports, each as Excel or PDF, every row with a serial number (S.No.):
  //   • Simple   — only the remaining (balance) quantity of each item.
  //   • Detailed — Opening Stock · Received from Vendor · Used to Guests · Adjustments (±) · Balance, for a period.
  // All numbers come from the Stock Movement ledger (voided lines ignored), so they match the Current Stock and
  // Stock Movement Register screens exactly:
  //   Opening  = every movement before the From date
  //   Received = Vendor Receipt lines (incl. "Opening Stock – Physical Count" entries)
  //   Used     = Patient Issue (handed over to Guests / Outside Nursing) − Return to Store (unused returned)
  //   Adjust.  = Adjustment In / Out (incl. Stock Reset lines) and Department Issue
  //   Balance  = Opening + Received − Used ± Adjustments  (= ledger balance at the end of the To date)
  // Uses loadXlsxLibrary / freshFetchAll / freshSaveBlob / freshCsv / freshFileStamp from stock-fresh-start.js.
  function srDay(value){
    if(!value)return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return String(value);
    const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const p=k=>parts.find(x=>x.type===k)?.value;return `${p('year')}-${p('month')}-${p('day')}`;
  }
  function srPeriodBounds(f){
    const today=todayISOIndia();
    if(f.period==='today')return [today,today];
    if(f.period==='week')return [mondayOfWeek(today),today];
    if(f.period==='date'){const d=f.date&&f.date<=today?f.date:today;return [d,d]}
    if(f.period==='monthpick'&&/^\d{4}-\d{2}$/.test(f.month||'')){const [y,m]=f.month.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);return [`${f.month}-01`,last<today?last:today]}
    if(f.period==='custom'){const a=f.from||today,b=f.to||today;return a<=b?[a,b]:[b,a]}
    return [today.slice(0,8)+'01',today];
  }
  // last 18 months for the "Month" choice, newest first, e.g. ['2026-10','October 2026']
  function srMonthOptions(){
    const t=todayISOIndia(),out=[];let y=Number(t.slice(0,4)),m=Number(t.slice(5,7));
    const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
    for(let i=0;i<18;i++){out.push([`${y}-${String(m).padStart(2,'0')}`,`${names[m-1]} ${y}`]);m--;if(!m){m=12;y--}}
    return out;
  }
  const SR_PERIODS=[['today','Today'],['date','Selected Date'],['week','This Week'],['month','This Month'],['monthpick','Month (choose)'],['custom','Selected Period (From – To)']];
  const srNum=v=>Math.round((Number(v)||0)*100)/100;
  const srSigned=v=>{const n=srNum(v);return n>0?`+${freshQty(n)}`:n<0?`−${freshQty(-n)}`:'0'};
  const srEsc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  async function buildStockReport({sections,from,to,includeInactive}){
    const [items,ledger]=await Promise.all([
      freshFetchAll('consumable_store_items','*','item_name'),
      freshFetchAll('consumable_store_ledger','id,item_id,movement_type,qty_in,qty_out,movement_at,voided_at','movement_at')
    ]);
    const inSec=items.filter(i=>sections.includes(i.item_category||'Consumables'));
    const rows=new Map(inSec.map(i=>[i.id,{item:i,opening:0,received:0,used:0,other:0,balance:0,current:0,moved:false}]));
    ledger.forEach(l=>{
      if(l.voided_at)return;const r=rows.get(l.item_id);if(!r)return;
      const net=(Number(l.qty_in)||0)-(Number(l.qty_out)||0),day=srDay(l.movement_at);
      r.current+=net;
      if(!day||day>to)return;
      if(day<from){r.opening+=net;return}
      r.moved=true;
      if(l.movement_type==='Vendor Receipt')r.received+=net;
      else if(l.movement_type==='Patient Issue')r.used-=net;           // issue is stock OUT → positive use
      else if(l.movement_type==='Return to Store')r.used-=net;         // return is stock IN → reduces use
      else r.other+=net;                                               // Adjustment In / Out, Department Issue
    });
    const list=[...rows.values()].map(r=>({...r,opening:srNum(r.opening),received:srNum(r.received),used:srNum(r.used),other:srNum(r.other),current:srNum(r.current)}))
      .map(r=>({...r,balance:srNum(r.opening+r.received-r.used+r.other)}))
      .filter(r=>includeInactive||r.item.active!==false||r.balance!==0||r.current!==0||r.moved)
      .sort((a,b)=>String(a.item.item_category||'').localeCompare(String(b.item.item_category||''))||String(a.item.item_code||'').localeCompare(String(b.item.item_code||''),undefined,{numeric:true})||String(a.item.item_name||'').localeCompare(String(b.item.item_name||'')));
    return list;
  }

  function stockReportTitle(type,sections){
    const sec=sections.length===1?sections[0]:'Pharmacy & Stores';
    return `${sec} — ${type==='detailed'?'Detailed Stock Report':'Stock Report (Remaining Quantity)'}`;
  }
  // Table as rows of cells (first row = header). Used by Excel and PDF so both always match the screen.
  function stockReportTable(type,list,sections,hideZero){
    const multi=sections.length>1;
    const rows=type==='detailed'?list.filter(r=>!hideZero||r.opening||r.received||r.used||r.other||r.balance):list.filter(r=>!hideZero||r.balance);
    const head=type==='detailed'
      ?['S.No.',...(multi?['Section']:[]),'Item Code','Item Name','Unit','Opening Stock','Received from Vendor','Used to Guests','Adjustments (±)','Balance']
      :['S.No.',...(multi?['Section']:[]),'Item Code','Item Name','Unit','Remaining Quantity'];
    const body=rows.map((r,i)=>{const it=r.item;const base=[i+1,...(multi?[it.item_category||'Consumables']:[]),it.item_code||'',displayStoreItemName(it.item_name)+(it.strength?` ${it.strength}`:''),it.unit||''];
      return type==='detailed'?[...base,r.opening,r.received,r.used,r.other,r.balance]:[...base,r.balance]});
    return {head,body,count:rows.length,numFrom:head.length-(type==='detailed'?5:1)};
  }

  async function downloadStockReportExcel({type,list,sections,from,to,hideZero,profile}){
    const t=stockReportTable(type,list,sections,hideZero);
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const top=[['SAMARA HEALTH CARE LLP'],[stockReportTitle(type,sections)],
      [type==='detailed'?`Period: ${formatDateIN(from)} to ${formatDateIN(to)}`:`Remaining quantity as on ${formatDateIN(to)} (end of day)`],
      [`Downloaded on ${formatDateTimeIN(new Date().toISOString())} by ${who} · ${t.count} item(s)`],[]];
    const sheet=[...top,t.head,...t.body];
    if(type==='detailed')sheet.push([],['Balance = Opening Stock + Received from Vendor − Used to Guests ± Adjustments. Used to Guests is net of unused items returned to Stores. Adjustments include Stock Reset, corrections and Department Issue.']);
    const base=`Samara_Stock_${type==='detailed'?'Detailed':'Simple'}_${sections.length===1?sections[0].replace(/[^A-Za-z0-9]+/g,'_'):'All'}_${freshFileStamp()}`;
    try{
      const X=await loadXlsxLibrary(),wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet(sheet);
      const multi=sections.length>1;
      ws['!cols']=[6,...(multi?[14]:[]),11,40,9,...(type==='detailed'?[13,15,14,14,11]:[16])].map(w=>({wch:w}));
      const hr=top.length;ws['!autofilter']={ref:X.utils.encode_range({s:{r:hr,c:0},e:{r:hr+Math.max(t.body.length,1),c:t.head.length-1}})};
      ws['!merges']=[0,1,2,3].map(r=>({s:{r,c:0},e:{r,c:t.head.length-1}}));
      X.utils.book_append_sheet(wb,ws,type==='detailed'?'Detailed Stock':'Current Stock');
      X.writeFile(wb,`${base}.xlsx`);return 'xlsx';
    }catch(e){
      console.warn(e);freshSaveBlob(new Blob(['﻿'+freshCsv(sheet)],{type:'text/csv;charset=utf-8'}),`${base}.csv`);return 'csv';
    }
  }

  function openStockReportPdf({type,list,sections,from,to,hideZero,profile}){
    const t=stockReportTable(type,list,sections,hideZero);
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const now=formatDateTimeIN(new Date().toISOString());
    const logo=new URL('assets/samara-logo.png',window.location.href).href;
    const cell=(v,i)=>i>=t.numFrom?`<td class="num${i===t.head.length-1?' bal':''}${Number(v)<0?' neg':''}">${srEsc(type==='detailed'&&i===t.head.length-2?srSigned(v):freshQty(v))}</td>`:`<td${i===0?' class="sn"':''}>${srEsc(v)}</td>`;
    const rows=t.body.map(r=>`<tr>${r.map(cell).join('')}</tr>`).join('')||`<tr><td colspan="${t.head.length}" style="text-align:center;padding:14px">No items to show</td></tr>`;
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>${srEsc(stockReportTitle(type,sections))}</title><style>
      @page{size:A4 ${type==='detailed'?'landscape':'portrait'};margin:11mm 9mm 13mm}*{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:10.5px;line-height:1.35;background:#fff}
      .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b20b5d;padding:0 2px 8px;margin-bottom:10px}
      .logo{width:130px;max-height:64px;object-fit:contain}.org{text-align:right}.org strong{display:block;color:#b20b5d;font-size:16px}.org span{display:block;color:#6d5963;font-size:9px}
      h1{font-size:17px;margin:4px 0 2px;text-align:center;color:#321d28}.meta{text-align:center;color:#7b6670;margin:0 0 10px}
      table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}
      th{background:#f7dce8;color:#67123d;border:1px solid #dfb4c6;padding:6px 5px;text-align:left;font-size:9.5px}
      td{border:1px solid #ead4dd;padding:5px;vertical-align:top}tbody tr:nth-child(even) td{background:#fffafd}
      .num{text-align:right;white-space:nowrap}.sn{text-align:center;width:34px}.bal{font-weight:700;color:#741041}.neg{color:#b3261e}
      th.n{text-align:right}.note{margin-top:10px;color:#6b5961;font-size:9px}.sign{display:flex;justify-content:space-between;margin-top:34px}.sign div{border-top:1px solid #6f5c65;padding-top:6px;width:30%;text-align:center}
      .footer{border-top:1px solid #eccbd9;margin-top:18px;padding-top:6px;text-align:center;color:#6f5a64;font-size:8.5px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="top"><img class="logo" src="${logo}" alt="Samara Assisted Living"><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Pharmacy &amp; Stores</span><span>Compassion • Comfort • Dignity</span></div></div>
      <h1>${srEsc(stockReportTitle(type,sections))}</h1>
      <p class="meta">${type==='detailed'?`Period: ${srEsc(formatDateIN(from))} to ${srEsc(formatDateIN(to))}`:`Remaining quantity as on ${srEsc(formatDateIN(to))} (end of day)`} · ${t.count} item(s)</p>
      <table><thead><tr>${t.head.map((x,i)=>`<th${i>=t.numFrom?' class="n"':''}>${srEsc(x)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      ${type==='detailed'?'<p class="note">Balance = Opening Stock + Received from Vendor − Used to Guests ± Adjustments. Used to Guests is net of unused items returned to Stores. Adjustments include Stock Reset, corrections and Department Issue.</p>':''}
      <div class="sign"><div>Prepared By</div><div>Nursing Manager / Store Keeper</div><div>Admin / Director</div></div>
      <div class="footer">Generated from Samara Care ERP on ${srEsc(now)} by ${srEsc(who)} · Computer-generated report</div>
      <script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250));});<\/script>
    </body></html>`;
    const win=samaraPrintBar(window.open('','_blank'));
    if(!win){alert('Please allow pop-ups to download / save the Stock Report PDF.');return false}
    win.document.open();win.document.write(html);win.document.close();return true;
  }

const SR_COMPACT_CSS=`.sr-compact .sr-filters{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:flex-end;margin:0 0 8px}.sr-compact .sr-filters .field{flex:0 1 200px;min-width:150px;margin:0}.sr-compact .sr-filters .field.sr-wide{flex-basis:250px}.sr-compact .sr-filters label{font-size:12px;margin:0 0 3px;line-height:1.2}.sr-compact .sr-filters select,.sr-compact .sr-filters input[type=text]{min-height:36px!important;height:36px!important;padding:5px 10px!important;font-size:14px!important}.sr-compact .sr-filters .apply-filter-wrap{margin:0}.sr-compact .sr-filters .apply-filter-wrap .btn{min-height:36px;padding:6px 14px}.sr-compact .sr-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 8px}.sr-compact .sr-bar .btn{min-height:34px;padding:6px 14px;font-size:14px}.sr-compact .sr-bar .small-note{margin:0 8px 0 0}.sr-compact table.table th,.sr-compact table.table td{padding:5px 8px!important;font-size:13.5px;line-height:1.3}.sr-compact table.table thead th{position:sticky;top:0;z-index:1}`;
  function StoreStockReport({profile,categoryFilter,onOpenItem}){
    const fixedSection=categoryFilter&&STORE_SECTION_NAMES.includes(categoryFilter)?categoryFilter:'';
    const [type,setType]=React.useState('simple'),[section,setSection]=React.useState(fixedSection||'All');
    const [period,setPeriod]=React.useState('today'),[from,setFrom]=React.useState(''),[to,setTo]=React.useState(''),[date,setDate]=React.useState(todayISOIndia()),[month,setMonth]=React.useState(todayISOIndia().slice(0,7));
    const [hideZero,setHideZero]=React.useState(false);
    const fa=useAppliedFilters({type,section,period,from,to,date,month,hideZero});const A=fa.applied;
    const [list,setList]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState('');
    const sections=A.section==='All'?STORE_SECTION_NAMES:[A.section];
    const [pFrom,pTo]=srPeriodBounds(A);
    const loadKey=`${sections.join('|')}|${pFrom}|${pTo}`;
    React.useEffect(()=>{
      let live=true;setList(null);setError('');
      buildStockReport({sections,from:pFrom,to:pTo,includeInactive:false}).then(r=>{if(live)setList(r)}).catch(e=>{if(live)setError(e.message||'Could not load the stock.')});
      return()=>{live=false};
    },[loadKey]);
    const table=list?stockReportTable(A.type,list,sections,A.hideZero):null;
    async function download(fmt){
      if(!list||busy)return;setBusy(fmt);
      const args={type:A.type,list,sections,from:pFrom,to:pTo,hideZero:A.hideZero,profile};
      try{
        if(fmt==='excel'){const f=await downloadStockReportExcel(args);showSamaraActionToast('success','Stock report downloaded',f==='xlsx'?`${table.count} item(s) saved to the Excel file.`:'Excel library unavailable — saved as a CSV file instead (opens in Excel).')}
        else openStockReportPdf(args);
        try{writeAuditEvent('Download Stock Report','ConsumableStore',null,{report:A.type,format:fmt,sections,from:A.type==='detailed'?pFrom:null,to:A.type==='detailed'?pTo:null,items:table.count})}catch(_){}
      }catch(e){showSamaraActionToast('error','Download failed',e.message||'Please try again.')}
      finally{setBusy('')}
    }
    const cellView=(v,i)=>i>=table.numFrom?h('td',{key:i,className:'stock-report-num',style:{textAlign:'right',fontWeight:i===table.head.length-1?700:400,color:Number(v)<0?'#b3261e':undefined}},A.type==='detailed'&&i===table.head.length-2?srSigned(v):freshQty(v)):h('td',{key:i,style:i===0?{textAlign:'center'}:undefined},v);
    const visibleRows=list?(A.type==='detailed'?list.filter(r=>!A.hideZero||r.opening||r.received||r.used||r.other||r.balance):list.filter(r=>!A.hideZero||r.balance)):[];
    return h('div',{className:'sr-compact'},h('style',null,SR_COMPACT_CSS),h(Section,{title:'Stock Report',subtitle:'Simple = remaining quantity as on a date · Detailed = Opening · Received · Used to Guests · Balance for a period.'},
      h('div',{className:'sr-filters'},
        h('div',{className:'field sr-wide'},h('label',null,'Report'),h('select',{value:type,onChange:e=>setType(e.target.value)},h('option',{value:'simple'},'Simple — Remaining quantity'),h('option',{value:'detailed'},'Detailed — Opening / Received / Used / Balance'))),
        !fixedSection&&h('div',{className:'field'},h('label',null,'Section'),h('select',{value:section,onChange:e=>setSection(e.target.value)},h('option',{value:'All'},'All sections'),STORE_SECTION_NAMES.map(s=>h('option',{key:s,value:s},s)))),
        h('div',{className:'field'},h('label',null,type==='detailed'?'Period':'Date / Period'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},SR_PERIODS.map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='date'&&h('div',{className:'field'},h('label',null,'Date'),h(StrictDateInput,{value:date,max:todayISOIndia(),onChange:e=>setDate(e.target.value)})),
        period==='monthpick'&&h('div',{className:'field'},h('label',null,'Month'),h('select',{value:month,onChange:e=>setMonth(e.target.value)},srMonthOptions().map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:from,max:todayISOIndia(),onChange:e=>setFrom(e.target.value)})),
        period==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:to,max:todayISOIndia(),onChange:e=>setTo(e.target.value)})),
        h('div',{className:'field'},h('label',null,'Items'),h('label',{style:{display:'flex',gap:'8px',alignItems:'center',justifyContent:'flex-start',fontWeight:400,minHeight:'36px',cursor:'pointer',fontSize:'13px'}},h('input',{type:'checkbox',checked:hideZero,onChange:e=>setHideZero(e.target.checked),style:{width:'20px',height:'20px',minWidth:'20px',minHeight:'20px',margin:0,flex:'0 0 20px'}}),h('span',null,type==='detailed'?'Hide items with no stock and no movement':'Hide items with zero balance'))),
        h(ApplyFilterButton,{dirty:fa.dirty,onApply:fa.apply})
      ),
      h('div',{className:'sr-bar'},
        h('span',{className:'small-note'},`${sections.length===1?sections[0]:'All sections'} · ${A.type==='detailed'?`Period ${formatDateIN(pFrom)} to ${formatDateIN(pTo)}`:`Remaining quantity as on ${formatDateIN(pTo)} (end of day)`}${table?` · ${table.count} item(s)`:''}`),
        h('button',{type:'button',className:'btn btn-primary',disabled:!list||!!busy||fa.dirty,onClick:()=>download('excel')},busy==='excel'?'Preparing Excel…':'⤓ Download Excel'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!list||!!busy||fa.dirty,onClick:()=>download('pdf')},busy==='pdf'?'Preparing PDF…':'⤓ Download PDF'),
        fa.dirty&&h('small',{className:'error-text',style:{alignSelf:'center'}},'Press Apply first — the download follows the applied filter.')
      ),
      error&&h('p',{role:'alert',className:'message error'},error),
      !list&&!error&&h('p',{className:'small-note'},'Loading stock…'),
      table&&h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,table.head.map((x,i)=>h('th',{key:i,style:i>=table.numFrom?{textAlign:'right'}:undefined},x)))),
        h('tbody',null,table.body.length?table.body.map((r,ri)=>h('tr',{key:ri,style:onOpenItem?{cursor:'pointer'}:undefined,title:onOpenItem?'Open this item’s usage register':undefined,onClick:onOpenItem?()=>onOpenItem(visibleRows[ri].item.id):undefined},r.map(cellView)))
          :h('tr',null,h('td',{colSpan:table.head.length,style:{textAlign:'center'}},'No items to show')))
      )),
      A.type==='detailed'&&table&&h('p',{className:'small-note',style:{marginTop:'8px'}},'Balance = Opening + Received from Vendor − Used to Guests ± Adjustments. "Used to Guests" is net of unused items returned. Adjustments = Stock Reset, corrections and Department Issue.')
    ));
  }
