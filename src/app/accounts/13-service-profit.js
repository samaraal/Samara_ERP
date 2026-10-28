  // 2.18.198: ACCOUNTS / BILLING → Profit by Service (Admin / Directors only).
  // Net profit of Consumables (incl. Pharmacy & Basic Supplies), Nursing Procedures and Physiotherapy alone,
  // for any period and any Guest (or all Guests). Data: get_service_profit (316_service_profit.sql).
  //   Consumables   cost = qty × average purchase price (stock receipts); no purchase price → kept out of profit, listed.
  //   Physiotherapy cost = the outsourced session fee of the same session.
  //   Nursing       cost = nil (staff salaries stay in the Net Profit Statement) — Admin's decision 29-10-2026.
  const SP_HEADS=['Consumables','Nursing Procedures','Physiotherapy'];
  function ServiceProfit({profile}){
    const isAdmin=profile?.role==='Admin';
    const today=todayISOIndia();
    const [patients]=usePatients();
    const [mode,setMode]=React.useState('month'); // month | last | custom
    const [draft,setDraft]=React.useState({from:'',to:''}),[custom,setCustom]=React.useState({from:'',to:''});
    const [guest,setGuest]=React.useState(''),[head,setHead]=React.useState('All'),[by,setBy]=React.useState('item');
    const [data,setData]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const [open,setOpen]=React.useState({});
    const range=mode==='month'?[npMonthStart(today),today]:mode==='last'?[npShiftMonth(today,-1),npMonthEnd(npShiftMonth(today,-1))]:[custom.from,custom.to];
    const periodName=mode==='month'?`${npMonthLabel(today)} (to ${formatDateIN(today)})`:mode==='last'?npMonthLabel(npShiftMonth(today,-1)):`${formatDateIN(custom.from)} – ${formatDateIN(custom.to)}`;
    React.useEffect(()=>{(async()=>{
      if(!isAdmin||!range[0]||!range[1])return;
      setBusy(true);setError('');
      try{const r=await client.rpc('get_service_profit',{p_from:range[0]<'2026-08-27'?'2026-08-27':range[0],p_to:range[1],p_patient:null});if(r.error)throw r.error;setData(r.data);setOpen({})}
      catch(e){setError(e.message||String(e))}finally{setBusy(false)}
    })()},[mode,custom.from,custom.to]);
    const all=(data&&data.lines)||[];
    const {pFor,pLabel}=usePatientLookup(patients,all.map(l=>l.patient_id));
    if(!isAdmin)return h(Section,{title:'Profit by Service'},h('p',null,'Admin / Directors only.'));

    const guestName=id=>{const p=pFor(id);return p.id?`${formalName(p)} · ${p.patient_id||'—'}${p.is_active===false?' · Discharged':''}`:'—'};
    const guestIds=[...new Set(all.map(l=>l.patient_id))].sort((a,b)=>guestName(a).localeCompare(guestName(b)));
    const lines=all.filter(l=>(!guest||l.patient_id===guest)&&(head==='All'||l.head===head));
    const num=v=>Number(v)||0;
    const sum=list=>{const known=list.filter(l=>l.cost!=null);
      const income=list.reduce((t,l)=>t+num(l.income),0),kIncome=known.reduce((t,l)=>t+num(l.income),0),cost=known.reduce((t,l)=>t+num(l.cost),0);
      return {n:list.length,qty:list.reduce((t,l)=>t+num(l.qty),0),income,kIncome,cost,profit:kIncome-cost,margin:kIncome?(kIncome-cost)/kIncome*100:0,
        unknownN:list.length-known.length,unknownIncome:income-kIncome,noFee:list.filter(l=>l.no_fee).length};};
    const heads=SP_HEADS.filter(x=>head==='All'||x===head).map(x=>({head:x,list:lines.filter(l=>l.head===x)}));
    const total=sum(lines);
    const groupsOf=list=>{const g={};list.forEach(l=>{const k=by==='item'?l.item:l.patient_id;(g[k]=g[k]||[]).push(l)});
      return Object.entries(g).map(([k,ls])=>({key:k,label:by==='item'?k:guestName(k),...sum(ls)})).sort((a,b)=>b.income-a.income);};
    const profitStyle=v=>({color:v<0?'#b42318':'#14733a'});
    const costText=s=>s.unknownN&&!s.cost&&s.unknownN===s.n?'no purchase price':npMoney(s.cost);
    const noteOf=(s,hd)=>[s.unknownN?`${s.unknownN} charge${s.unknownN===1?'':'s'} (${npMoney(s.unknownIncome)}) have no purchase price — not in profit`:'',
      s.noFee?`${s.noFee} session${s.noFee===1?'':'s'} with no physio fee recorded`:'',hd==='Nursing Procedures'?'Cost nil — staff salaries are in the Net Profit Statement':''].filter(Boolean).join(' · ');

    const exportRows=()=>{const out=[];heads.forEach(({head:hd,list})=>{const s=sum(list);
      out.push([hd,'',s.n,s.qty,s.income,s.cost,s.profit,`${s.margin.toFixed(1)}%`,noteOf(s,hd)]);
      groupsOf(list).forEach(g=>out.push(['',g.label,g.n,g.qty,g.income,g.unknownN===g.n?'':g.cost,g.profit,`${g.margin.toFixed(1)}%`,noteOf(g,'')]));});
      out.push(['TOTAL','',total.n,'',total.income,total.cost,total.profit,`${total.margin.toFixed(1)}%`,total.unknownN?`${npMoney(total.unknownIncome)} income without purchase price not in profit`:'']);return out;};
    const EX_HEADS=['Head',by==='item'?'Item':'Guest','Charges','Qty','Income','Cost','Net Profit','Margin','Note'];
    const subtitle=`${periodName} · ${guest?guestName(guest):'All Guests'} · ${head==='All'?'All three heads':head}`;
    const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    function printIt(){
      const w=window.open('','_blank');if(!w)return;
      const rows=exportRows().map(r=>`<tr${r[0]?' style="background:#fdf0f5;font-weight:800"':''}>${r.map((v,i)=>`<td${[4,5,6].includes(i)?' style="text-align:right"':''}>${esc([4,5,6].includes(i)&&v!==''?npMoney(v):v)}</td>`).join('')}</tr>`).join('');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Profit by Service</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px}h2{margin:0 0 2px;color:#8f1d5a}p{margin:0 0 8px;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9b3c6;padding:4px 6px;text-align:left;vertical-align:top}th{background:#fbe3ee}@page{size:A4 landscape;margin:10mm}</style></head><body><h2>Samara — Profit by Service</h2><p>${esc(subtitle)} · Printed ${esc(formatDateIN(new Date()))}</p><table><thead><tr>${EX_HEADS.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`);
      w.document.close();w.focus();setTimeout(()=>w.print(),300);
    }
    function excel(){
      if(!window.XLSX){alert('Excel library is still loading. Try again in a moment.');return}
      const ws=window.XLSX.utils.aoa_to_sheet([['Samara Health Care — Profit by Service'],[subtitle],[],EX_HEADS,...exportRows()]);
      const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,'Profit by Service');
      window.XLSX.writeFile(wb,`Samara_Profit_by_Service_${formatDateIN(new Date())}.xlsx`);
    }

    const stat=(label,s,hd)=>h('div',{key:label,className:'card stat samara-pink-stat',style:{padding:'12px 14px',display:'flex',flexDirection:'column',gap:'4px'}},
      h('span',{style:{fontWeight:800,color:'#7d1748'}},label),
      h('strong',{style:{fontSize:'24px',...profitStyle(s.profit)}},npMoney(s.profit)),
      h('small',{style:{color:'#8a6a78',fontWeight:600}},`Income ${npMoney(s.income)} · Cost ${hd==='Nursing Procedures'?'nil':npMoney(s.cost)} · Margin ${s.margin.toFixed(1)}%`));
    const btn=(on,label,onClick)=>h('button',{type:'button',className:`btn ${on?'btn-primary':'btn-secondary'}`,onClick},label);
    const td=(v,extra)=>h('td',{style:{textAlign:'right',whiteSpace:'nowrap',...(extra||{})}},v);

    return h(React.Fragment,null,
      h(Section,{title:'Profit by Service',subtitle:'Admin / Directors only · Consumables, Nursing Procedures and Physiotherapy — income minus their own cost',actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',disabled:!lines.length,onClick:printIt},'Print / PDF'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!lines.length,onClick:excel},'Excel'))},
        h('div',{className:'sp-filters',style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},
          btn(mode==='month','This Month',()=>setMode('month')),btn(mode==='last','Last Month',()=>setMode('last')),
          h('span',{style:{fontWeight:700,color:'#7b6871',marginLeft:'6px'}},'Period'),
          h(StrictDateInput,{value:draft.from,min:'2026-08-27',max:draft.to||today,onChange:e=>setDraft(d=>({...d,from:e.target.value}))}),
          h(StrictDateInput,{value:draft.to,min:draft.from||'2026-08-27',max:today,onChange:e=>setDraft(d=>({...d,to:e.target.value}))}),
          h(ApplyFilterButton,{dirty:Boolean(draft.from&&draft.to)&&(mode!=='custom'||draft.from!==custom.from||draft.to!==custom.to),onApply:()=>{if(!draft.from||!draft.to){alert('Choose both From and To dates.');return}setCustom(draft);setMode('custom')}})),
        h('div',{style:{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center',marginTop:'10px'}},
          h('label',{style:{display:'flex',gap:'6px',alignItems:'center',margin:0,fontWeight:700}},'Guest',
            h('select',{value:guest,onChange:e=>setGuest(e.target.value),style:{maxWidth:'320px'}},h('option',{value:''},'All Guests'),guestIds.map(id=>h('option',{key:id,value:id},guestName(id))))),
          h('label',{style:{display:'flex',gap:'6px',alignItems:'center',margin:0,fontWeight:700}},'Head',
            h('select',{value:head,onChange:e=>setHead(e.target.value)},['All',...SP_HEADS].map(x=>h('option',{key:x,value:x},x==='All'?'All three':x)))),
          h('label',{style:{display:'flex',gap:'6px',alignItems:'center',margin:0,fontWeight:700}},'Show',
            h('select',{value:by,onChange:e=>setBy(e.target.value)},h('option',{value:'item'},'Item-wise'),h('option',{value:'guest'},'Guest-wise'))))),
      error?h('div',{className:'message error'},error):null,
      busy&&!data?h('p',{className:'empty'},'Working out the profit…'):null,
      data?h(React.Fragment,null,
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'12px',margin:'0 0 14px'}},
          heads.map(({head:hd,list})=>stat(hd,sum(list),hd)),heads.length>1?stat('All three',total,''):null),
        h(Section,{title:`Profit · ${subtitle}`,subtitle:`Tap a head to see it ${by==='item'?'item-wise':'Guest-wise'}.`},
          !lines.length?h('p',{className:'empty'},'No charges in this period.'):
          h('div',{className:'table-wrap'},h('table',{className:'table'},
            h('thead',null,h('tr',null,['',by==='item'?'Item':'Guest','Charges','Income','Cost','Net Profit','Margin'].map((x,i)=>h('th',{key:i,style:i>=2?{textAlign:'right'}:null},x)))),
            h('tbody',null,heads.flatMap(({head:hd,list})=>{const s=sum(list),isOpen=!!open[hd],note=noteOf(s,hd);
              const rows=[h('tr',{key:hd,onClick:()=>setOpen(o=>({...o,[hd]:!o[hd]})),style:{cursor:'pointer',background:'#fdf0f5'}},
                h('td',{style:{width:'24px',fontWeight:900,color:'#a80d4f'}},isOpen?'▾':'▸'),
                h('td',{style:{fontWeight:800,color:'#7d1748'}},hd,note?h('div',{style:{fontWeight:500,fontSize:'12px',color:'#8a6a78',fontStyle:'italic'}},note):null),
                td(s.n,{fontWeight:700}),td(npMoney(s.income),{fontWeight:700}),td(hd==='Nursing Procedures'?'nil':costText(s),{fontWeight:700}),
                td(npMoney(s.profit),{fontWeight:900,...profitStyle(s.profit)}),td(`${s.margin.toFixed(1)}%`,{fontWeight:700}))];
              if(isOpen)groupsOf(list).forEach(g=>rows.push(h('tr',{key:`${hd}:${g.key}`},h('td',null,''),
                h('td',{style:{paddingLeft:'14px'}},g.label,by==='item'&&hd!=='Nursing Procedures'&&g.qty!==g.n?h('small',{style:{color:'#8a6a78'}},` · qty ${g.qty}`):null,
                  g.unknownN?h('div',{style:{fontSize:'12px',color:'#b54708'}},'No purchase price — not in profit'):null,
                  g.noFee?h('div',{style:{fontSize:'12px',color:'#b54708'}},`${g.noFee} session${g.noFee===1?'':'s'} with no physio fee`):null),
                td(g.n),td(npMoney(g.income)),td(hd==='Nursing Procedures'?'nil':g.unknownN===g.n?'—':npMoney(g.cost)),
                td(g.unknownN===g.n?'—':npMoney(g.profit),profitStyle(g.profit)),td(g.unknownN===g.n?'—':`${g.margin.toFixed(1)}%`))));
              return rows;}),
              h('tr',{key:'total',style:{borderTop:'2px solid #d97aa3'}},h('td',null,''),h('td',{style:{fontWeight:900,fontSize:'16px'}},'TOTAL'),
                td(total.n,{fontWeight:900}),td(npMoney(total.income),{fontWeight:900,fontSize:'16px'}),td(npMoney(total.cost),{fontWeight:900,fontSize:'16px'}),
                td(npMoney(total.profit),{fontWeight:900,fontSize:'18px',...profitStyle(total.profit)}),td(`${total.margin.toFixed(1)}%`,{fontWeight:900}))))),
          h('p',{className:'small-note',style:{marginTop:'10px'}},'Income = charges raised in the period (Trial Guests excluded). Consumables cost = quantity × average purchase price from stock receipts (receipts priced per box / pack are left out); charges whose item has no purchase price are listed and kept out of profit and margin. Physiotherapy cost = outsourced session fee of the same session. Nursing Procedures cost is nil — salaries, rent and other running costs are in the Net Profit Statement.'))
      ):null
    );
  }
