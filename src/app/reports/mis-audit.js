  // 2.19.11: MIS & AUDIT (Admin / Directors only) — one page that audits ERP entries across Clinical, Financial and
  // Operational areas for a chosen period: problems / missed entries first (with the page to fix them), then the key
  // numbers. Data: SQL 317 mis_audit_report(p_from, p_to). Each check runs on its own in the database, so one
  // failing check shows "could not run" without hiding the others.
  const MIS_SEVERITY={
    high:{label:'High',bg:'#fde8ec',fg:'#b4232f',bd:'#f3b5bf',rank:0},
    medium:{label:'Medium',bg:'#fff4dc',fg:'#8a5a00',bd:'#f2d27b',rank:1},
    low:{label:'Low',bg:'#e9f1ff',fg:'#1f4f9a',bd:'#bcd2f5',rank:2},
    ok:{label:'OK',bg:'#e7f6ee',fg:'#13643a',bd:'#b7e2c8',rank:3},
    error:{label:'Not run',bg:'#f1eef0',fg:'#6b5a63',bd:'#ddd3d8',rank:4}
  };
  function misEnsureStyle(){
    if(document.getElementById('mis-audit-style'))return;
    const st=document.createElement('style');st.id='mis-audit-style';
    st.textContent=`
      .mis-wrap{display:grid;gap:16px;min-width:0}
      .mis-filter{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
      .mis-filter .field{margin:0;min-width:0}
      .mis-chips{display:flex;flex-wrap:wrap;gap:6px}
      .mis-chips button{border:1.5px solid #e9a9c4;background:#fff;color:#8a1c52;border-radius:999px;padding:7px 14px;font-weight:800;cursor:pointer;font-size:14px}
      .mis-chips button[aria-pressed="true"]{background:linear-gradient(135deg,#a80d4f,#d6338a);color:#fff;border-color:transparent}
      .mis-health{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
      .mis-health .mis-hcard{border-radius:16px;padding:12px 14px;border:1.5px solid;min-width:0}
      .mis-health strong{display:block;font-size:26px;line-height:1.1}
      .mis-health span{font-size:13px;font-weight:800}
      .mis-tabs{display:flex;flex-wrap:wrap;gap:8px;border-bottom:2px solid #f0d2df;padding-bottom:8px}
      .mis-tabs button{border:0;background:transparent;font-size:16px;font-weight:900;color:#8b6b79;padding:6px 10px;border-radius:10px;cursor:pointer}
      .mis-tabs button[aria-selected="true"]{background:#fcdde9;color:#a80d4f}
      .mis-tabs .mis-badge{display:inline-block;margin-left:6px;min-width:20px;padding:0 6px;border-radius:999px;background:#b4232f;color:#fff;font-size:12px;line-height:20px;text-align:center}
      .mis-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
      .mis-kpi{background:linear-gradient(145deg,#fffafd,#fdf1f6);border:1px solid #e8c3d2;border-radius:14px;padding:10px 12px;min-width:0}
      .mis-kpi small{display:block;color:#8b6b79;font-weight:700;font-size:12.5px}
      .mis-kpi strong{display:block;font-size:22px;color:#4a1430;margin-top:2px;overflow-wrap:anywhere}
      .mis-kpi em{display:block;font-style:normal;font-size:12px;color:#8b6b79;margin-top:2px}
      .mis-check{border:1.5px solid #f0d2df;border-radius:14px;background:#fff;min-width:0;overflow:hidden}
      .mis-check-head{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;cursor:pointer;width:100%;text-align:left;background:transparent;border:0;font:inherit;color:inherit}
      .mis-check-head:focus-visible{outline:3px solid rgba(214,51,138,.35)}
      .mis-sev{flex:0 0 auto;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:900;border:1px solid}
      .mis-check-title{flex:1 1 auto;min-width:0}
      .mis-check-title b{display:block;color:#4a1430;font-size:15px;overflow-wrap:anywhere}
      .mis-check-title small{display:block;color:#7a5a68;font-size:12.5px;margin-top:2px;overflow-wrap:anywhere}
      .mis-count{flex:0 0 auto;font-size:20px;font-weight:900;color:#4a1430}
      .mis-rows{border-top:1px dashed #f0d2df;padding:8px 12px 12px}
      .mis-row{display:grid;grid-template-columns:150px minmax(0,1.2fr) minmax(0,2fr) 100px;gap:8px;padding:6px 0;border-bottom:1px solid #f7e6ee;font-size:13.5px;color:#4a2a39}
      .mis-row span{min-width:0;overflow-wrap:anywhere}
      .mis-row .mis-amt{text-align:right;font-weight:800}
      .mis-row.mis-row-head{font-weight:900;color:#8a3a62;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
      .mis-passed{display:flex;flex-wrap:wrap;gap:6px}
      .mis-passed span{background:#e7f6ee;color:#13643a;border:1px solid #b7e2c8;border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:700}
      @media(max-width:640px){
        .mis-row{grid-template-columns:minmax(0,1fr) auto}
        .mis-row span:nth-child(1){grid-column:1/-1;color:#8b6b79;font-size:12px}
        .mis-row span:nth-child(3){grid-column:1/-1}
        .mis-row.mis-row-head{display:none}
        .mis-health strong{font-size:22px}
        .mis-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
        .mis-kpi strong{font-size:19px}
      }`;
    document.head.appendChild(st);
  }
  function misMoney(v){return v===null||v===undefined||v===''?'':'₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}
  function misKpiValue(k){
    if(k.value===null||k.value===undefined)return '—';
    if(k.unit==='₹')return misMoney(k.value);
    if(k.unit==='%')return Number(k.value).toLocaleString('en-IN',{maximumFractionDigits:1})+'%';
    return Number(k.value).toLocaleString('en-IN',{maximumFractionDigits:1})+(k.unit?` ${k.unit}`:'');
  }
  function misCheckSeverity(c){return c.error?'error':(Number(c.count||0)>0?(c.severity||'medium'):'ok')}

  function MisAudit({profile,onNavigate}){
    const isAdmin=profile?.role==='Admin';
    const today=todayISOIndia();
    const [preset,setPreset]=React.useState('yesterday');
    const [month,setMonth]=React.useState(today.slice(0,7));
    const [custom,setCustom]=React.useState({from:addDaysISO(today,-6),to:today});
    const rangeFor=(p,m,c)=>{
      if(p==='today')return [today,today];
      if(p==='yesterday'){const y=addDaysISO(today,-1);return [y,y]}
      if(p==='week')return [mondayOfWeek(today),today];
      if(p==='month'){const from=m+'-01';const end=addDaysISO(addDaysISO(from,32).slice(0,7)+'-01',-1);return [from,end>today?today:end]}
      return [c.from,c.to];
    };
    const draftRange=rangeFor(preset,month,custom);
    const {applied,apply,dirty}=useAppliedFilters({from:draftRange[0],to:draftRange[1]});
    const rangeBad=!applied.from||!applied.to||applied.from>applied.to||applied.to>today;
    const [data,setData]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const [tab,setTab]=React.useState('');
    const [open,setOpen]=React.useState({});
    React.useEffect(()=>{misEnsureStyle()},[]);
    async function load(){
      if(!isAdmin||rangeBad)return;
      setBusy(true);setError('');
      try{
        const res=await client.rpc('mis_audit_report',{p_from:applied.from,p_to:applied.to});
        if(res.error)throw res.error;
        setData(res.data||null);
        setTab(t=>t||(res.data?.sections?.[0]?.key||''));
      }catch(e){
        const m=String(e.message||e);
        setError(/mis_audit_report/.test(m)&&/not find|does not exist|schema cache/i.test(m)?'The MIS database update (SQL 317) has not been run yet. Run supabase/sql/317_mis_audit_report.sql in Supabase → SQL Editor.':m);
        setData(null);
      }finally{setBusy(false)}
    }
    React.useEffect(()=>{load()},[applied.from,applied.to]);
    if(!isAdmin)return h(Section,{title:'MIS & Audit'},h('p',null,'Admin / Directors only.'));

    const sections=data?.sections||[];
    const allChecks=sections.flatMap(s=>(s.checks||[]).map(c=>({...c,section:s.title})));
    const sevCount=k=>allChecks.filter(c=>misCheckSeverity(c)===k).length;
    const current=sections.find(s=>s.key===tab)||sections[0];
    const periodName=applied.from===applied.to?formatDateIN(applied.from):`${formatDateIN(applied.from)} – ${formatDateIN(applied.to)}`;

    function printReport(){
      const esc=s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
      const body=sections.map(s=>{
        const issues=(s.checks||[]).filter(c=>misCheckSeverity(c)!=='ok').sort((a,b)=>MIS_SEVERITY[misCheckSeverity(a)].rank-MIS_SEVERITY[misCheckSeverity(b)].rank);
        const passed=(s.checks||[]).filter(c=>misCheckSeverity(c)==='ok');
        return `<h2>${esc(s.title)}</h2>
          <table class="k"><tr>${(s.kpis||[]).map(k=>`<td><small>${esc(k.label)}</small><b>${esc(misKpiValue(k))}</b>${k.note?`<i>${esc(k.note)}</i>`:''}</td>`).join('')}</tr></table>
          ${issues.length?issues.map(c=>`<h3><span class="s ${misCheckSeverity(c)}">${MIS_SEVERITY[misCheckSeverity(c)].label}</span> ${esc(c.title)} — ${c.error?'could not run':esc(c.count)}</h3>
            ${c.detail?`<p>${esc(c.detail)}</p>`:''}${c.error?`<p class="e">${esc(c.error)}</p>`:''}
            ${(c.rows||[]).length?`<table><tr><th>Date</th><th>Guest / Staff</th><th>Detail</th><th>Amount</th></tr>${c.rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.who)}</td><td>${esc(r.detail)}</td><td style="text-align:right">${esc(misMoney(r.amount))}</td></tr>`).join('')}</table>`:''}`).join(''):'<p>No problems found.</p>'}
          ${passed.length?`<p class="ok">Passed: ${passed.map(c=>esc(c.title)).join(' · ')}</p>`:''}`;
      }).join('');
      const w=samaraPrintBar(window.open('','_blank'));if(!w)return;
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>MIS &amp; Audit — ${esc(periodName)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#222}h1{margin:0;color:#8f1d5a;font-size:20px}h2{margin:18px 0 6px;color:#8f1d5a;border-bottom:2px solid #f0d2df;padding-bottom:3px}h3{font-size:13px;margin:10px 0 3px}p{margin:2px 0 6px}table{border-collapse:collapse;width:100%;margin:4px 0 8px}td,th{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}table.k td{width:16%}table.k small{display:block;color:#666}table.k b{display:block;font-size:15px}table.k i{display:block;color:#666;font-style:normal;font-size:11px}.s{border-radius:9px;padding:1px 7px;font-size:11px;border:1px solid}.s.high{background:#fde8ec;color:#b4232f}.s.medium{background:#fff4dc;color:#8a5a00}.s.low{background:#e9f1ff;color:#1f4f9a}.s.error{background:#eee;color:#555}.ok{color:#13643a}.e{color:#b4232f}</style></head><body>
        <h1>Samara Health Care — MIS &amp; Audit Report</h1><p>Period: ${esc(periodName)} · Generated ${esc(formatDateTimeIN(new Date()))} · ${sevCount('high')} high, ${sevCount('medium')} medium, ${sevCount('low')} low issues · ${sevCount('ok')} checks passed</p>${body}</body></html>`);
      w.document.close();
    }

    const periodControls=h('div',{className:'mis-filter'},
      h('div',{className:'mis-chips',role:'group','aria-label':'Period'},
        [['today','Today'],['yesterday','Yesterday'],['week','This Week'],['month','Month'],['period','Period']].map(([k,l])=>h('button',{key:k,type:'button','aria-pressed':preset===k,onClick:()=>setPreset(k)},l))),
      preset==='month'&&h('div',{className:'field'},h('label',{htmlFor:'mis-month'},'Month'),h('input',{id:'mis-month',type:'month',value:month,max:today.slice(0,7),onChange:e=>setMonth(e.target.value)})),
      preset==='period'&&h('div',{className:'field'},h('label',{htmlFor:'mis-from'},'From'),h('input',{id:'mis-from',type:'date',value:custom.from,max:today,onChange:e=>setCustom(c=>({...c,from:e.target.value}))})),
      preset==='period'&&h('div',{className:'field'},h('label',{htmlFor:'mis-to'},'To'),h('input',{id:'mis-to',type:'date',value:custom.to,max:today,onChange:e=>setCustom(c=>({...c,to:e.target.value}))})),
      h(ApplyFilterButton,{dirty,onApply:apply})
    );

    const checkCard=(c,i)=>{
      const sev=misCheckSeverity(c),S=MIS_SEVERITY[sev];const id=`${current?.key}-${c.key||i}`;const isOpen=!!open[id];
      const rows=c.rows||[];
      return h('div',{key:id,className:'mis-check',style:{borderColor:sev==='high'?'#f3b5bf':undefined}},
        h('button',{type:'button',className:'mis-check-head','aria-expanded':isOpen,onClick:()=>setOpen(o=>({...o,[id]:!o[id]}))},
          h('span',{className:'mis-sev',style:{background:S.bg,color:S.fg,borderColor:S.bd}},S.label),
          h('span',{className:'mis-check-title'},h('b',null,c.title),h('small',null,c.error?'This check could not run: '+c.error:(c.detail||''))),
          !c.error&&h('span',{className:'mis-count'},c.amount!==null&&c.amount!==undefined&&Number(c.amount)?`${c.count} · ${misMoney(c.amount)}`:String(c.count))),
        isOpen&&h('div',{className:'mis-rows'},
          rows.length?h(React.Fragment,null,
            h('div',{className:'mis-row mis-row-head'},h('span',null,'Date'),h('span',null,'Guest / Staff'),h('span',null,'Detail'),h('span',{className:'mis-amt'},'Amount')),
            rows.map((r,j)=>h('div',{key:j,className:'mis-row'},h('span',null,r.date||'—'),h('span',null,r.who||'—'),h('span',null,r.detail||''),h('span',{className:'mis-amt'},misMoney(r.amount)))),
            Number(c.count)>rows.length&&h('p',{className:'small-note'},`Showing ${rows.length} of ${c.count}. Open the page for the full list.`)
          ):h('p',{className:'small-note'},'No item list for this check.'),
          c.page&&onNavigate&&h('button',{type:'button',className:'btn btn-primary',style:{marginTop:'8px'},onClick:()=>onNavigate(c.page)},`Open ${c.page}`))
      );
    };

    const issues=current?(current.checks||[]).filter(c=>misCheckSeverity(c)!=='ok').sort((a,b)=>MIS_SEVERITY[misCheckSeverity(a)].rank-MIS_SEVERITY[misCheckSeverity(b)].rank||Number(b.count||0)-Number(a.count||0)):[];
    const passed=current?(current.checks||[]).filter(c=>misCheckSeverity(c)==='ok'):[];

    return h('div',{className:'mis-wrap'},
      h(Section,{title:'MIS & Audit',subtitle:`Admin / Directors only · audit of ERP entries — Clinical, Financial, Operational · ${periodName}`,
        actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy||rangeBad,onClick:load},busy?'Checking…':'Re-check'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!data,onClick:printReport},'Print / PDF'))},
        periodControls,
        rangeBad&&h('p',{className:'message error',role:'alert'},'Choose a valid period (From on or before To, not in the future).'),
        error&&h('p',{className:'message error',role:'alert'},error),
        busy&&!data&&h('p',null,'Checking ERP entries…'),
        data&&h('div',{className:'mis-health',style:{marginTop:'12px'}},
          [['high','High priority'],['medium','Medium'],['low','Low'],['ok','Checks passed']].map(([k,l])=>{const S=MIS_SEVERITY[k];return h('div',{key:k,className:'mis-hcard',style:{background:S.bg,color:S.fg,borderColor:S.bd}},h('strong',null,sevCount(k)),h('span',null,l))}),
          sevCount('error')>0&&h('div',{className:'mis-hcard',style:{background:MIS_SEVERITY.error.bg,color:MIS_SEVERITY.error.fg,borderColor:MIS_SEVERITY.error.bd}},h('strong',null,sevCount('error')),h('span',null,'Checks not run'))
        )),
      data&&h(Section,{title:current?.title||'',subtitle:current?.subtitle||''},
        h('div',{className:'mis-tabs',role:'tablist'},sections.map(s=>{const n=(s.checks||[]).filter(c=>['high','medium'].includes(misCheckSeverity(c))).length;
          return h('button',{key:s.key,type:'button',role:'tab','aria-selected':current?.key===s.key,onClick:()=>setTab(s.key)},s.title,n>0&&h('span',{className:'mis-badge'},n))})),
        h('h4',{style:{margin:'14px 0 8px',color:'#8a3a62'}},'Key numbers'),
        h('div',{className:'mis-kpis'},(current?.kpis||[]).map((k,i)=>h('div',{key:i,className:'mis-kpi'},h('small',null,k.label),h('strong',null,misKpiValue(k)),k.note&&h('em',null,k.note)))),
        h('h4',{style:{margin:'16px 0 8px',color:'#8a3a62'}},issues.length?`Audit findings (${issues.length}) — tap one to see the entries`:'Audit findings'),
        issues.length?h('div',{style:{display:'grid',gap:'8px'}},issues.map(checkCard)):h('p',{style:{color:'#13643a',fontWeight:800}},'✓ No problems found in this area for the period.'),
        passed.length>0&&h(React.Fragment,null,h('h4',{style:{margin:'16px 0 8px',color:'#13643a'}},`Checks passed (${passed.length})`),h('div',{className:'mis-passed'},passed.map((c,i)=>h('span',{key:i},'✓ '+c.title))))
      ),
      data&&h('p',{className:'small-note'},`Checked ${formatDateTimeIN(data.generated_at||new Date())} · India time. Trial Guests are left out. The morning WhatsApp summary covers the previous day.`)
    );
  }
