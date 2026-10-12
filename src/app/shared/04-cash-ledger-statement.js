  // 2.16.22: shared Cash Ledger & Statement (Nursing Manager Petty Cash, Kitchen petty cash).
  // entries: [{id, date:'YYYY-MM-DD' (India), at (timestamp), kind, details, amount (signed: + in, − out), by, extra:[[label,value]…]}]
  // Period filter Today / This Week / This Month / Pick period with Apply (global filter rule); opening balance,
  // ledger with running balance, closing balance (also in words), printable statement (Print / Save PDF) and CSV.
  function CashLedgerStatement({bookTitle,holder,entries,fileName}){
    const today=todayISOIndia();
    const [period,setPeriod]=React.useState('month'),[from,setFrom]=React.useState(today.slice(0,8)+'01'),[to,setTo]=React.useState(today);
    const filters=useAppliedFilters({period,from,to});
    const [detail,setDetail]=React.useState(null);
    const money=n=>{const v=Number(n||0);return (v<0?'−₹':'₹')+Math.abs(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})};
    const weekStart=(()=>{const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10)})();
    const f=filters.applied;
    const range=f.period==='today'?[today,today]:f.period==='week'?[weekStart,today]:f.period==='month'?[today.slice(0,8)+'01',today]:[f.from||today,f.to||today];
    const [start,end]=range[0]<=range[1]?range:[range[1],range[0]];
    const periodLabel=f.period==='today'?`Today (${formatDateIN(start)})`:f.period==='week'?`This Week (${formatDateIN(start)} to ${formatDateIN(end)})`:f.period==='month'?`This Month (${formatDateIN(start)} to ${formatDateIN(end)})`:`${formatDateIN(start)} to ${formatDateIN(end)}`;
    // Oldest first; same day keeps the order the entries were made.
    const sorted=(entries||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.at||'').localeCompare(String(b.at||'')));
    const opening=sorted.filter(x=>x.date<start).reduce((s,x)=>s+Number(x.amount||0),0);
    let runBal=opening;
    const rows=sorted.filter(x=>x.date>=start&&x.date<=end).map(x=>{runBal+=Number(x.amount||0);return {...x,balance:runBal}});
    const closing=runBal;
    const totalIn=rows.filter(x=>Number(x.amount)>0).reduce((s,x)=>s+Number(x.amount),0);
    const totalOut=rows.filter(x=>Number(x.amount)<0).reduce((s,x)=>s-Number(x.amount),0);
    const byKind={};rows.forEach(x=>{const k=x.kind||'Other';byKind[k]=(byKind[k]||0)+Number(x.amount||0)});
    const kinds=Object.entries(byKind).sort((a,b)=>b[1]-a[1]);
    const inWords=v=>`${v<0?'Minus ':''}${billAmountInWords(Math.abs(v))}`;
    const rowClick=fn=>e=>{if(e&&e.target&&e.target.closest&&e.target.closest('button,a,input,select,textarea,label'))return;fn()};
    function exportCsv(){
      const data=[[`${bookTitle} — ${holder||''}`],[`Period: ${periodLabel}`],[],['Date','Type','Details','Cash in','Cash out','Balance','Recorded by'],
        [formatDateIN(start),'Opening balance','','','',opening,''],
        ...rows.map(x=>[formatDateIN(x.date),x.kind,x.details,Number(x.amount)>0?x.amount:'',Number(x.amount)<0?-x.amount:'',x.balance,x.by||'']),
        [formatDateIN(end),'Closing balance','',totalIn,totalOut,closing,'']];
      const csv=data.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@-](?=\D)/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
      const url=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${fileName||'Cash-Statement'}-${start}-to-${end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    }
    function printStatement(){
      const win=samaraPrintBar(window.open('','_blank','width=900,height=900'));if(!win){alert('Please allow pop-ups to print the statement.');return}
      const e=escapeHtml;const m=v=>e(money(v));
      const body=rows.map(x=>`<tr><td>${e(formatDateIN(x.date))}</td><td>${e(x.kind)}</td><td>${e(x.details)}</td><td class="n">${Number(x.amount)>0?m(x.amount):''}</td><td class="n">${Number(x.amount)<0?m(-x.amount):''}</td><td class="n${x.balance<0?' neg':''}">${m(x.balance)}</td></tr>`).join('');
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${e(bookTitle)} Statement</title><style>
        body{font-family:Arial,Helvetica,sans-serif;color:#2b1a22;margin:24px;font-size:12px}
        .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b30b5d;padding-bottom:10px;margin-bottom:14px}
        .head img{height:58px}.head h1{margin:0;font-size:20px;color:#8f0d4c}.head p{margin:3px 0 0;color:#6f4a5c}
        .sum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.sum div{border:1px solid #ead2dd;border-radius:8px;padding:8px}.sum small{display:block;color:#7a5566}.sum b{font-size:15px}
        table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #e3cdd8;padding:6px 7px;text-align:left;vertical-align:top}th{background:#fbeef4;color:#6f123f}
        .n{text-align:right;white-space:nowrap}.neg{color:#b42318}.bal td{font-weight:700;background:#fff7fb}
        .words{margin:10px 0;font-weight:700}.kinds td{border:0;padding:2px 8px 2px 0}.sign{display:flex;justify-content:space-between;margin-top:56px}.sign div{border-top:1px solid #999;padding-top:6px;width:30%;text-align:center}
        .foot{margin-top:18px;color:#7a5566;font-size:10px}@media print{body{margin:10mm}}
      </style></head><body>
        <div class="head"><div><h1>${e(bookTitle)} — Statement</h1><p>${e(holder||'')}</p><p>Period: <b>${e(periodLabel)}</b></p></div><img src="${e(BRAND_LOGO_URL)}" alt="Samara"></div>
        <div class="sum"><div><small>Opening balance</small><b class="${opening<0?'neg':''}">${m(opening)}</b></div><div><small>Cash in</small><b>${m(totalIn)}</b></div><div><small>Cash out</small><b>${m(totalOut)}</b></div><div><small>Closing balance</small><b class="${closing<0?'neg':''}">${m(closing)}</b></div></div>
        <table class="kinds">${kinds.map(([k,v])=>`<tr><td>${e(k)}</td><td class="n">${m(v)}</td></tr>`).join('')}</table>
        <table><thead><tr><th>Date</th><th>Type</th><th>Details</th><th class="n">Cash in</th><th class="n">Cash out</th><th class="n">Balance</th></tr></thead><tbody>
          <tr class="bal"><td>${e(formatDateIN(start))}</td><td colspan="4">Opening balance</td><td class="n${opening<0?' neg':''}">${m(opening)}</td></tr>
          ${body||'<tr><td colspan="6">No entries in this period.</td></tr>'}
          <tr class="bal"><td>${e(formatDateIN(end))}</td><td colspan="2">Closing balance</td><td class="n">${m(totalIn)}</td><td class="n">${m(totalOut)}</td><td class="n${closing<0?' neg':''}">${m(closing)}</td></tr>
        </tbody></table>
        <p class="words">Closing balance in words: ${e(inWords(closing))}</p>
        <div class="sign"><div>Prepared by</div><div>Verified by (Admin / Director)</div><div>Received / Acknowledged</div></div>
        <p class="foot">Samara Health Care LLP · Generated from Samara Care ERP on ${e(formatDateTimeIN(new Date().toISOString()))}</p>
      </body></html>`);
      win.document.close();
    }
    const box=(label,value,red)=>h('div',{className:'dr-box',style:{cursor:'default'}},h('span',{className:'dr-box-label'},label),h('b',{className:'dr-box-value',style:red?{color:'#b42318'}:undefined},value));
    const rowFields=x=>({title:`${x.kind} · ${money(x.amount)}`,subtitle:x.details,fields:[['Date',formatDateIN(x.date)],['Recorded at',x.at?formatDateTimeIN(x.at):''],['Type',x.kind],['Details',x.details],['Cash in',Number(x.amount)>0?money(x.amount):''],['Cash out',Number(x.amount)<0?money(-x.amount):''],['Balance after',money(x.balance)],['Recorded by',x.by],...(x.extra||[])]});
    return h(Section,{title:'Ledger & Statement',subtitle:`${bookTitle}${holder?' · '+holder:''}`,actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},h('button',{type:'button',className:'btn btn-primary',onClick:printStatement},'Print / Save PDF'),h('button',{type:'button',className:'btn btn-secondary',onClick:exportCsv},'Download CSV'))},
      detail&&h(RowDetailModal,{title:detail.title,subtitle:detail.subtitle,fields:detail.fields,onClose:()=>setDetail(null)}),
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'flex-end',marginBottom:'10px'}},
        h('div',{className:'field',style:{marginBottom:0}},h('label',null,'Period'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},[['today','Today'],['week','This Week'],['month','This Month'],['range','Pick period']].map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='range'&&h('div',{className:'field',style:{marginBottom:0}},h('label',null,'From'),h('input',{type:'date',value:from,max:today,onChange:e=>setFrom(e.target.value)})),
        period==='range'&&h('div',{className:'field',style:{marginBottom:0}},h('label',null,'To'),h('input',{type:'date',value:to,max:today,onChange:e=>setTo(e.target.value)})),
        h(ApplyFilterButton,{dirty:filters.dirty,onApply:filters.apply})),
      h('p',{className:'small-note'},`Period: ${periodLabel}`),
      h('div',{className:'dr-boxes'},box('Opening balance',money(opening),opening<0),box('Cash in',money(totalIn)),box('Cash out',money(totalOut)),box('Closing balance',money(closing),closing<0)),
      kinds.length>0&&h('p',{className:'small-note'},kinds.map(([k,v])=>`${k}: ${money(v)}`).join(' · ')),
      h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,['Date','Type','Details','Cash in','Cash out','Balance','By'].map(x=>h('th',{key:x},x)))),
        h('tbody',null,
          h('tr',{style:{fontWeight:800,background:'#fff7fb'}},h('td',null,formatDateIN(start)),h('td',{colSpan:4},'Opening balance'),h('td',{style:opening<0?{color:'#b42318'}:undefined},money(opening)),h('td',null,'')),
          rows.length?rows.map(x=>h('tr',{key:x.id,className:'row-clickable',onClick:rowClick(()=>setDetail(rowFields(x)))},
            h('td',null,formatDateIN(x.date)),h('td',null,x.kind),h('td',{style:{whiteSpace:'normal'}},x.details),
            h('td',null,Number(x.amount)>0?money(x.amount):''),h('td',null,Number(x.amount)<0?money(-x.amount):''),
            h('td',{style:x.balance<0?{color:'#b42318',fontWeight:800}:undefined},money(x.balance)),h('td',null,x.by||''))):
            h('tr',null,h('td',{colSpan:7,style:{textAlign:'center',padding:'18px'}},'No entries in this period.')),
          h('tr',{style:{fontWeight:800,background:'#fff7fb'}},h('td',null,formatDateIN(end)),h('td',{colSpan:2},'Closing balance'),h('td',null,money(totalIn)),h('td',null,money(totalOut)),h('td',{style:closing<0?{color:'#b42318'}:undefined},money(closing)),h('td',null,''))))),
      h('p',{className:'small-note',style:{fontWeight:700}},`Closing balance in words: ${inWords(closing)}`)
    );
  }
