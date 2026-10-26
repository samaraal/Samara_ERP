  // 2.18.169: ACCOUNTS / BILLING → Net Profit Statement + Monthly Expenses (Admin / Directors only).
  // Income = charges RAISED in the period (less discounts; Trial Guests excluded) — collections shown below it.
  // Expenses = every ERP source (stock receipts, food vendor, kitchen, petty cash, outsourced physio, outside bills)
  // + Monthly Expenses entered here (salaries paid, rent, electricity …). Equipment purchases count in full
  // in the month bought, on their own line: Operating Profit (before equipment) and Net Profit (after).
  const NP_HEADS=['Salaries','Rent','Electricity','Water','Internet & Phone','Maintenance & Repairs','Housekeeping & Cleaning','Laundry','Marketing & Advertising','Professional Fees (CA / Legal)','Licences & Fees','Transport & Fuel','Insurance','Bank Charges','Office & Stationery','Other'];
  const NP_MODES=['Cash','UPI','Bank Transfer','Cheque','Card'];
  const npMoney=v=>`₹${(Number(v)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const npMonthStart=iso=>`${String(iso).slice(0,7)}-01`;
  const npMonthEnd=iso=>{const [y,m]=String(iso).slice(0,7).split('-').map(Number);const d=new Date(Date.UTC(y,m,0));return d.toISOString().slice(0,10)};
  const npShiftMonth=(iso,n)=>{const [y,m]=String(iso).slice(0,7).split('-').map(Number);const d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,10)};
  const npMonthLabel=iso=>new Date(`${npMonthStart(iso)}T00:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const NP_FIRST_MONTH='2026-08-01'; // Samara inaugurated 27-08-2026
  function npMonthOptions(){const out=[];let m=npMonthStart(todayISOIndia());while(m>=NP_FIRST_MONTH){out.push(m);m=npShiftMonth(m,-1)}return out}
  function npStatementTotals(s){
    if(!s)return null;
    const gross=(s.income||[]).reduce((t,x)=>t+Number(x.amount||0),0);
    const netIncome=gross-Number(s.discounts||0);
    const erp=(s.erp_expenses||[]).reduce((t,x)=>t+Number(x.amount||0),0);
    const opex=erp+Number(s.outgoing_total||0)+Number(s.manual_total||0);
    const operating=netIncome-opex;
    const net=operating-Number(s.equipment||0);
    return {gross,netIncome,erp,opex,operating,net,margin:netIncome?net/netIncome*100:0};
  }

  function NetProfitStatement({profile,onNavigate}){
    const isAdmin=profile?.role==='Admin';
    const today=todayISOIndia();
    const [mode,setMode]=React.useState('month'); // month | custom
    const [month,setMonth]=React.useState(npMonthStart(today));
    const [draft,setDraft]=React.useState({from:'',to:''}),[custom,setCustom]=React.useState({from:'',to:''});
    const [cur,setCur]=React.useState(null),[prev,setPrev]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const range=mode==='month'?[month,npMonthEnd(month)>today?today:npMonthEnd(month)]:[custom.from,custom.to];
    const prevRange=mode==='month'?[npShiftMonth(month,-1),npMonthEnd(npShiftMonth(month,-1))]:null;
    const periodName=mode==='month'?npMonthLabel(month)+(npMonthEnd(month)>today?` (to ${formatDateIN(today)})`:''):`${formatDateIN(custom.from)} – ${formatDateIN(custom.to)}`;
    async function load(){
      if(!isAdmin||!range[0]||!range[1])return;
      setBusy(true);setError('');
      try{
        const a=await client.rpc('get_net_profit_statement',{p_from:range[0],p_to:range[1]});if(a.error)throw a.error;setCur(a.data);
        if(prevRange&&prevRange[1]>=NP_FIRST_MONTH){const b=await client.rpc('get_net_profit_statement',{p_from:prevRange[0]<'2026-08-27'?'2026-08-27':prevRange[0],p_to:prevRange[1]});setPrev(b.error?null:b.data);}else setPrev(null);
      }catch(e){setError(/get_net_profit_statement|function/i.test(e.message||'')&&/not find|does not exist/i.test(e.message||'')?'The Net Profit database update (SQL 305) has not been run yet.':(e.message||'Unable to load the statement.'));setCur(null)}
      finally{setBusy(false)}
    }
    React.useEffect(()=>{load()},[mode,month,custom.from,custom.to]);
    if(!isAdmin)return h(Section,{title:'Net Profit Statement'},h('p',null,'Admin / Directors only.'));
    const T=npStatementTotals(cur),P=npStatementTotals(prev);
    const prevName=prevRange?npMonthLabel(prevRange[0]):'';
    // statement lines: [label, current, previous, kind]
    const lines=[];
    if(cur){
      lines.push(['INCOME — charges raised (Trial Guests excluded)',null,null,'head']);
      const cats=[...new Set([...(cur.income||[]).map(x=>x.category),...((prev&&prev.income)||[]).map(x=>x.category)])];
      const amt=(s,c)=>Number(((s&&s.income)||[]).find(x=>x.category===c)?.amount||0);
      cats.forEach(c=>lines.push([c,amt(cur,c),prev?amt(prev,c):null,'row']));
      lines.push(['Gross charges',T.gross,P?P.gross:null,'sub']);
      lines.push(['Less: discounts given',-Number(cur.discounts||0),prev?-Number(prev.discounts||0):null,'row']);
      lines.push(['NET INCOME',T.netIncome,P?P.netIncome:null,'total']);
      lines.push(['EXPENSES — from ERP records',null,null,'head']);
      (cur.erp_expenses||[]).forEach((x,i)=>lines.push([x.head+(x.note?` ⚠ ${x.note}`:''),Number(x.amount||0),prev?Number(prev.erp_expenses?.[i]?.amount||0):null,'row']));
      const oHeads=[...new Set([...(cur.outgoing_expenses||[]).map(x=>x.head),...((prev&&prev.outgoing_expenses)||[]).map(x=>x.head)])];
      if(oHeads.length){lines.push(['EXPENSES — paid through Outgoing Payments',null,null,'head']);
        const oAmt=(s,hd)=>Number(((s&&s.outgoing_expenses)||[]).find(x=>x.head===hd)?.amount||0);
        oHeads.forEach(hd=>lines.push([hd,oAmt(cur,hd),prev?oAmt(prev,hd):null,'row']));}
      lines.push(['EXPENSES — Monthly Expenses entered',null,null,'head']);
      const heads=[...new Set([...(cur.manual_expenses||[]).map(x=>x.head),...((prev&&prev.manual_expenses)||[]).map(x=>x.head)])];
      const mAmt=(s,hd)=>Number(((s&&s.manual_expenses)||[]).find(x=>x.head===hd)?.amount||0);
      if(!heads.length)lines.push(['No monthly expenses entered for this period (salaries, rent, electricity …)',0,prev?0:null,'note']);
      heads.forEach(hd=>lines.push([hd,mAmt(cur,hd),prev?mAmt(prev,hd):null,'row']));
      lines.push(['TOTAL OPERATING EXPENSES',T.opex,P?P.opex:null,'total']);
      lines.push(['OPERATING PROFIT (before equipment)',T.operating,P?P.operating:null,'profit']);
      lines.push(['Less: equipment purchases (counted in full when bought)',-Number(cur.equipment||0),prev?-Number(prev.equipment||0):null,'row']);
      lines.push(['NET PROFIT',T.net,P?P.net:null,'profit']);
    }
    const colour=v=>({color:Number(v)<0?'#b42336':'#087f5b'});
    const cell=(v,kind)=>v==null?'':(['profit','total'].includes(kind)?h('strong',{style:kind==='profit'?colour(v):null},npMoney(v)):npMoney(v));
    function exportRows(){return lines.map(([l,c,p,k])=>[l,k==='head'?'':(c==null?'':Math.round(c*100)/100),k==='head'||p==null?'':Math.round(p*100)/100])}
    function printIt(){
      const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const w=samaraPrintBar(window.open('','_blank'));if(!w){alert('Please allow pop-ups to print.');return;}
      const body=lines.map(([l,c,p,k])=>`<tr class="${k}"><td>${esc(l)}</td><td class="n">${k==='head'||c==null?'':esc(npMoney(c))}</td>${prev?`<td class="n">${k==='head'||p==null?'':esc(npMoney(p))}</td>`:''}</tr>`).join('');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Net Profit Statement</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:22px;color:#222}h2{margin:0;color:#8f1d5a}p{margin:2px 0 12px;color:#555}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #edd5e0;padding:6px 8px;text-align:left}th{background:#fbe3ee}.n{text-align:right;white-space:nowrap}tr.head td{background:#fdf0f5;font-weight:700;color:#7d1748;padding-top:12px}tr.total td,tr.sub td{font-weight:700}tr.profit td{font-weight:800;font-size:13.5px;border-top:2px solid #b44a7d}small{color:#666}</style></head><body><h2>Samara Health Care — Net Profit Statement</h2><p>${esc(periodName)} · prepared ${esc(formatDateIN(new Date()))} by ${esc(cur?.generated_by||'')}</p><table><thead><tr><th>Particulars</th><th class="n">${esc(periodName)}</th>${prev?`<th class="n">${esc(prevName)}</th>`:''}</tr></thead><tbody>${body}</tbody></table><p style="margin-top:14px"><b>Cash view:</b> collected ${esc(npMoney(cur?.collected))}${Number(cur?.refunds||0)?` · refunds ${esc(npMoney(cur.refunds))}`:''} · outstanding from Guests today ${esc(npMoney(cur?.outstanding_now))}</p><small>Income = charges raised in the period, less discounts; Trial Guests excluded. Purchases are at stock-receipt cost. Equipment is counted in full in the month bought.</small></body></html>`);
      w.document.close();w.focus();setTimeout(()=>w.print(),300);
    }
    async function excel(){
      try{
        if(!window.XLSX)await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';sc.async=true;sc.onload=resolve;sc.onerror=()=>reject(new Error('Excel library could not be loaded — check the internet connection.'));document.head.appendChild(sc);});
        const ws=window.XLSX.utils.aoa_to_sheet([['Samara Health Care — Net Profit Statement'],[periodName],[],['Particulars',periodName,prev?prevName:''],...exportRows(),[],['Collected (payments + advances)',Number(cur.collected||0)],['Outstanding from Guests today',Number(cur.outstanding_now||0)]]);
        ws['!cols']=[{wch:62},{wch:18},{wch:18}];
        const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,'Net Profit');
        window.XLSX.writeFile(wb,`Samara_Net_Profit_${range[0]}_${range[1]}.xlsx`);
      }catch(e){alert(e.message||'Unable to download the Excel file.')}
    }
    const stat=(label,value,sub,good)=>h('div',{className:'card stat samara-pink-stat',style:{padding:'14px 16px',display:'grid',gap:'4px'}},
      h('span',{style:{fontWeight:800,color:'#7d1748'}},label),h('strong',{style:{fontSize:'26px',...(good==null?{}:colour(good))}},value),sub?h('small',{style:{color:'#8a6a78',fontWeight:600}},sub):null);
    return h(React.Fragment,null,
      h(Section,{title:'Net Profit Statement',subtitle:'Admin / Directors only · income earned in the period minus all expenses',actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate&&onNavigate('Monthly Expenses')},'＋ Monthly Expenses'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!cur,onClick:printIt},'Print / PDF'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!cur,onClick:excel},'Excel'))},
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},
          h('button',{type:'button',className:`btn ${mode==='month'&&month===npMonthStart(today)?'btn-primary':'btn-secondary'}`,onClick:()=>{setMode('month');setMonth(npMonthStart(today))}},'This Month'),
          h('button',{type:'button',className:`btn ${mode==='month'&&month===npShiftMonth(today,-1)?'btn-primary':'btn-secondary'}`,onClick:()=>{setMode('month');setMonth(npShiftMonth(today,-1))}},'Last Month'),
          h('label',{style:{display:'flex',gap:'6px',alignItems:'center',margin:0}},'Month',h('select',{value:mode==='month'?month:'',onChange:e=>{setMode('month');setMonth(e.target.value)}},mode!=='month'?h('option',{value:''},'—'):null,npMonthOptions().map(m=>h('option',{key:m,value:m},npMonthLabel(m))))),
          h('span',{style:{fontWeight:700,color:'#7b6871',marginLeft:'6px'}},'Period'),
          h(StrictDateInput,{value:draft.from,min:'2026-08-27',max:draft.to||today,onChange:e=>setDraft(d=>({...d,from:e.target.value}))}),
          h(StrictDateInput,{value:draft.to,min:draft.from||'2026-08-27',max:today,onChange:e=>setDraft(d=>({...d,to:e.target.value}))}),
          h(ApplyFilterButton,{dirty:Boolean(draft.from&&draft.to)&&(mode!=='custom'||draft.from!==custom.from||draft.to!==custom.to),onApply:()=>{if(!draft.from||!draft.to){alert('Choose both From and To dates.');return}setCustom(draft);setMode('custom')}}))),
      error?h('div',{className:'message error'},error):null,
      busy&&!cur?h('p',{className:'empty'},'Preparing the statement…'):null,
      cur&&T?h(React.Fragment,null,
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'12px',margin:'0 0 14px'}},
          stat('Net Income',npMoney(T.netIncome),`Charges ${npMoney(T.gross)} − discounts ${npMoney(cur.discounts)}`),
          stat('Operating Expenses',npMoney(T.opex),`ERP ${npMoney(T.erp)}${Number(cur.outgoing_total)?` · paid out ${npMoney(cur.outgoing_total)}`:''} · entered ${npMoney(cur.manual_total)}`),
          stat('Operating Profit',npMoney(T.operating),'before equipment',T.operating),
          stat('Net Profit',npMoney(T.net),`Margin ${T.margin.toFixed(1)}%${P?` · ${prevName}: ${npMoney(P.net)}`:''}`,T.net),
          stat('Cash Collected',npMoney(cur.collected),`Outstanding from Guests today ${npMoney(cur.outstanding_now)}`)),
        h(Section,{title:`Statement · ${periodName}`,subtitle:prev?`Compared with ${prevName}`:null},
          h('div',{className:'table-wrap'},h('table',{className:'table np-statement'},
            h('thead',null,h('tr',null,h('th',null,'Particulars'),h('th',{style:{textAlign:'right'}},periodName),prev?h('th',{style:{textAlign:'right'}},prevName):null)),
            h('tbody',null,lines.map(([l,c,p,k],i)=>h('tr',{key:i,style:k==='head'?{background:'#fdf0f5'}:k==='profit'?{borderTop:'2px solid #d97aa3'}:null},
              h('td',{style:{fontWeight:k==='head'?800:['total','profit','sub'].includes(k)?800:500,color:k==='head'?'#7d1748':k==='note'?'#8a6a78':undefined,paddingLeft:k==='row'||k==='note'?'22px':undefined,fontStyle:k==='note'?'italic':undefined}},l),
              h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},k==='head'||k==='note'?'':cell(c,k)),
              prev?h('td',{style:{textAlign:'right',whiteSpace:'nowrap',color:'#7b6871'}},k==='head'||k==='note'?'':cell(p,k)):null))))),
          h('p',{className:'small-note',style:{marginTop:'10px'}},'Income = charges raised in the period, less discounts (Trial Guests excluded); collections are shown separately. Purchases are at stock-receipt cost — receipts priced per box / pack or at MRP will overstate cost. Equipment is counted in full in the month bought. Salaries, rent and other overheads come from Outgoing Payments (Food vendor / Purchase payments excluded — already counted from receipts) and Monthly Expenses.'))
      ):null
    );
  }

  function MonthlyExpenses({profile,onNavigate}){
    const isAdmin=profile?.role==='Admin';
    const today=todayISOIndia();
    const [month,setMonth]=React.useState(npMonthStart(today));
    const [rows,setRows]=React.useState([]),[staff,setStaff]=React.useState([]),[msg,setMsg]=React.useState(''),[busy,setBusy]=React.useState(false);
    const blank=()=>({date:today<npMonthEnd(month)?today:npMonthEnd(month),head:'Rent',description:'',amount:'',mode:'Bank Transfer',paid_to:'',reference:''});
    const [form,setForm]=React.useState(blank);
    const [salary,setSalary]=React.useState({}); // employee id -> amount draft
    const [salaryDate,setSalaryDate]=React.useState('');
    const end=npMonthEnd(month);
    async function load(){
      if(!isAdmin)return;
      const [a,b]=await Promise.all([client.rpc('samara_expense_rpc',{p_action:'list',p:{from:month,to:end}}),client.rpc('samara_expense_rpc',{p_action:'salary_prefill',p:{}})]);
      if(a.error){setMsg(/samara_expense_rpc/i.test(a.error.message)?'The Net Profit database update (SQL 305) has not been run yet.':a.error.message);return}
      setRows(a.data||[]);setStaff(b.data||[]);
      setSalary(Object.fromEntries((b.data||[]).map(s=>[s.id,s.salary!=null?String(s.salary):''])));
    }
    React.useEffect(()=>{setForm(blank());setSalaryDate(end<today?end:today);load()},[month]);
    if(!isAdmin)return h(Section,{title:'Monthly Expenses'},h('p',null,'Admin / Directors only.'));
    async function add(payload){
      const r=await client.rpc('samara_expense_rpc',{p_action:'add',p:payload});if(r.error)throw r.error;
    }
    async function save(e){
      e.preventDefault();setBusy(true);setMsg('');
      try{
        if(!form.date||form.date<month||form.date>end)throw new Error(`Choose a date in ${npMonthLabel(month)}.`);
        await add(form);setForm(blank());setMsg('✓ Expense saved.');await load();
      }catch(err){setMsg(err.message||'Unable to save.')}finally{setBusy(false)}
    }
    const paidIds=new Set(rows.filter(r=>r.head==='Salaries'&&r.employee_profile_id).map(r=>String(r.employee_profile_id)));
    async function recordSalary(list){
      setBusy(true);setMsg('');
      try{
        if(!salaryDate||salaryDate<month||salaryDate>end)throw new Error(`Choose the salary paid date in ${npMonthLabel(month)}.`);
        let n=0;
        for(const s of list){const amt=Number(salary[s.id]);if(!(amt>0)||paidIds.has(String(s.id)))continue;
          await add({date:salaryDate,head:'Salaries',description:`Salary — ${s.name} (${s.designation||''}) · ${npMonthLabel(month)}`,amount:amt,mode:'Bank Transfer',paid_to:s.name,employee_id:s.id});n++;}
        setMsg(n?`✓ ${n} salar${n===1?'y':'ies'} recorded.`:'Nothing to record — enter the amount paid, or it is already recorded.');await load();
      }catch(err){setMsg(err.message||'Unable to record salaries.')}finally{setBusy(false)}
    }
    async function remove(r){
      const reason=window.prompt(`Remove “${r.head} · ${npMoney(r.amount)}”? Give the reason:`);if(reason==null)return;
      const x=await client.rpc('samara_expense_rpc',{p_action:'void',p:{id:r.id,reason}});
      if(x.error)alert(x.error.message);else{setMsg('✓ Expense removed (kept in the audit with the reason).');load()}
    }
    const byHead=NP_HEADS.map(hd=>[hd,rows.filter(r=>r.head===hd).reduce((t,r)=>t+Number(r.amount),0)]).filter(([,v])=>v>0);
    const total=rows.reduce((t,r)=>t+Number(r.amount),0);
    const f=(label,node)=>h('div',{className:'field',style:{margin:0}},h('label',null,label),node);
    return h(React.Fragment,null,
      h(Section,{title:'Monthly Expenses',subtitle:'Admin / Directors only · salaries paid, rent, electricity and other overheads not already in the ERP',actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},
          h('select',{value:month,onChange:e=>setMonth(e.target.value)},npMonthOptions().map(m=>h('option',{key:m,value:m},npMonthLabel(m)))),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate&&onNavigate('Net Profit Statement')},'Net Profit Statement →'))},
        msg?h('div',{className:`message ${msg.startsWith('✓')?'success':'error'}`},msg):null,
        h('div',{className:'notice',style:{marginBottom:'12px'}},'⚠ Anything already paid through Payment Requests → Payment Vouchers (Outgoing Payments) is counted automatically — do not enter it here again.'),
        h('form',{onSubmit:save,style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:'10px',alignItems:'end'}},
          f('Date *',h(StrictDateInput,{value:form.date,min:month<'2026-08-27'?'2026-08-27':month,max:end<today?end:today,onChange:e=>setForm({...form,date:e.target.value}),required:true})),
          f('Expense Head *',h('select',{value:form.head,onChange:e=>setForm({...form,head:e.target.value})},NP_HEADS.filter(x=>x!=='Salaries').map(x=>h('option',{key:x},x)))),
          f('Amount (₹) *',h('input',{type:'number',min:'0.01',step:'0.01',value:form.amount,onChange:e=>setForm({...form,amount:e.target.value}),required:true})),
          f('Paid By',h('select',{value:form.mode,onChange:e=>setForm({...form,mode:e.target.value})},NP_MODES.map(x=>h('option',{key:x},x)))),
          f('Paid To',h('input',{value:form.paid_to,onChange:e=>setForm({...form,paid_to:e.target.value}),placeholder:'e.g. TNEB, landlord'})),
          f('Bill / Reference No.',h('input',{value:form.reference,onChange:e=>setForm({...form,reference:e.target.value})})),
          h('div',{className:'field',style:{margin:0,gridColumn:'1/-1'}},h('label',null,'Description'),h('input',{value:form.description,onChange:e=>setForm({...form,description:e.target.value}),placeholder:'e.g. October electricity bill'})),
          h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save Expense'))),
      h(Section,{title:`Salaries paid · ${npMonthLabel(month)}`,subtitle:'Amounts are pre-filled from HR (current salary) — change for leave, advances, overtime or part-month, then Record.',actions:h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
          h('span',{style:{fontWeight:700,color:'#7b6871'}},'Paid on'),h(StrictDateInput,{value:salaryDate,min:month<'2026-08-27'?'2026-08-27':month,max:end<today?end:today,onChange:e=>setSalaryDate(e.target.value)}),
          h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>recordSalary(staff)},'Record all entered'))},
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Employee','Designation','HR Salary','Amount Paid (₹)','Status',''].map(x=>h('th',{key:x},x)))),
          h('tbody',null,staff.length?staff.map(s=>{const done=paidIds.has(String(s.id));return h('tr',{key:s.id},
            h('td',null,s.name),h('td',null,`${s.designation||'—'}${s.department?` · ${s.department}`:''}`),h('td',null,s.salary!=null?`${npMoney(s.salary)} ${s.frequency||''}`:'Not set in HR'),
            h('td',null,h('input',{type:'number',min:'0',step:'0.01',value:salary[s.id]||'',disabled:done,onChange:e=>setSalary(v=>({...v,[s.id]:e.target.value})),style:{maxWidth:'140px'}})),
            h('td',null,done?h('span',{className:'badge success'},'Recorded'):h('span',{className:'badge'},'Not recorded')),
            h('td',null,done?null:h('button',{type:'button',className:'btn btn-secondary',disabled:busy||!(Number(salary[s.id])>0),onClick:()=>recordSalary([s])},'Record')))}):h('tr',null,h('td',{colSpan:6,className:'empty'},'No active employees found.')))))),
      h(Section,{title:`Entries · ${npMonthLabel(month)} · Total ${npMoney(total)}`,subtitle:byHead.map(([hd,v])=>`${hd} ${npMoney(v)}`).join(' · ')||null},
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Date','Head','Description','Amount','Paid By','Paid To','Reference','Entered By',''].map(x=>h('th',{key:x},x)))),
          h('tbody',null,rows.length?rows.map(r=>h('tr',{key:r.id},
            h('td',null,formatDateIN(r.expense_date)),h('td',null,r.head),h('td',null,r.description||'—'),h('td',{style:{whiteSpace:'nowrap'}},npMoney(r.amount)),
            h('td',null,r.paid_mode||'—'),h('td',null,r.paid_to||'—'),h('td',null,r.reference||'—'),h('td',null,`${r.created_by_name||'—'} · ${fmt(r.created_at)}`),
            h('td',null,h('button',{type:'button',className:'btn btn-secondary',onClick:()=>remove(r)},'Remove')))):h('tr',null,h('td',{colSpan:9,className:'empty'},'No expenses entered for this month yet.'))))))
    );
  }
