  // 2.19.61: ACCOUNTS / BILLING → Razorpay Statement (Admin / Directors only).
  // Reads Razorpay live through the razorpay-statement Edge Function (read only):
  // money received into Razorpay, Razorpay fees + GST, money paid out to Samara's bank (settlements, UTR),
  // money still with Razorpay, and checks (payment not in ERP, amount differs, posted twice, slow settlement).
  // Opens on navigable boxes; each box opens its list with "← Back"; every row opens full details.
  const RZS_FIRST='2026-08-27'; // Samara inaugurated
  const rzsMoney=v=>`₹${(Number(v)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const rzsMonthStart=iso=>`${String(iso).slice(0,7)}-01`;
  const rzsMonthEnd=iso=>{const [y,m]=String(iso).slice(0,7).split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};
  const rzsShiftMonth=(iso,n)=>{const [y,m]=String(iso).slice(0,7).split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,10)};
  const rzsMonthLabel=iso=>new Date(`${rzsMonthStart(iso)}T00:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  function rzsMonthOptions(){const out=[];let m=rzsMonthStart(todayISOIndia());while(m>=rzsMonthStart(RZS_FIRST)){out.push(m);m=rzsShiftMonth(m,-1)}return out}
  const rzsTime=iso=>{try{return new Date(iso).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}catch(_){return ''}};
  const rzsWho=r=>{const m=(r.erp||[])[0];return m?[m.name,m.code].filter(Boolean).join(' · '):''};
  // 2.19.62: colourful amounts, same scheme as the other Accounts pages
  const RZS_C={in:'#087f5b',fee:'#b42336',bank:'#1d4ed8',held:'#b54708',net:'#a80d4f'};
  const rzsSigned=v=>Number(v)<0?`− ${rzsMoney(-Number(v))}`:rzsMoney(v);
  const rzsBank=r=>r.status==='refunded'?'Refunded':r.settled?`Paid to bank ${formatDateIN(r.settled_on)}`:'Awaiting bank payment';

  function RazorpayStatement({profile}){
    const isAdmin=profile?.role==='Admin';
    const today=todayISOIndia();
    const [mode,setMode]=React.useState('month'); // today | week | month | custom
    const [month,setMonth]=React.useState(rzsMonthStart(today));
    const [draft,setDraft]=React.useState({from:'',to:''}),[custom,setCustom]=React.useState({from:'',to:''});
    const [data,setData]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const [view,setView]=React.useState(''),[detail,setDetail]=React.useState(null);
    const clamp=d=>d<RZS_FIRST?RZS_FIRST:d;
    const range=mode==='today'?[today,today]:mode==='week'?[clamp(mondayOfWeek(today)),today]:mode==='month'?[clamp(month),rzsMonthEnd(month)>today?today:rzsMonthEnd(month)]:[custom.from,custom.to];
    const periodName=mode==='today'?`Today (${formatDateIN(today)})`:mode==='week'?`This Week (${formatDateIN(range[0])} – ${formatDateIN(range[1])})`:mode==='month'?rzsMonthLabel(month)+(rzsMonthEnd(month)>today?` (to ${formatDateIN(today)})`:''):`${formatDateIN(custom.from)} – ${formatDateIN(custom.to)}`;
    async function load(){
      if(!isAdmin||!range[0]||!range[1])return;
      setBusy(true);setError('');
      try{
        const {data:d,error:e}=await client.functions.invoke('razorpay-statement',{body:{from:range[0],to:range[1]}});
        if(e){let msg=e.message;try{const b=await e.context?.json?.();if(b?.error)msg=b.error}catch(_){}throw new Error(msg)}
        if(d?.error)throw new Error(d.error);
        setData(d);
      }catch(e){setData(null);setError(/not found|404|Failed to send/i.test(e.message||'')?'The Razorpay Statement server function is not deployed yet.':(e.message||'Unable to read Razorpay.'))}
      finally{setBusy(false)}
    }
    React.useEffect(()=>{load()},[mode,month,custom.from,custom.to]);
    if(!isAdmin)return h(Section,{title:'Razorpay Statement'},h('p',null,'Admin / Directors only.'));
    const T=data?.totals;

    // ---------- export ----------
    const receivedRows=()=>(data?.received||[]).map((r,i)=>[i+1,formatDateIN(r.date),rzsTime(r.at),r.method,rzsWho(r)||'Not in ERP',r.amount,r.fee,r.gst,r.refunded,r.net,rzsBank(r),r.settlement_utr,r.id]);
    const settlementRows=()=>(data?.settlements||[]).map((s,i)=>[i+1,formatDateIN(s.date),s.utr,s.payments.length,s.amount,s.fee+s.gst,s.id]);
    const unsettledRows=()=>(data?.unsettled||[]).map((r,i)=>[i+1,formatDateIN(r.date),r.method,rzsWho(r)||'Not in ERP',r.amount,r.fee_total,r.net,r.id]);
    function printIt(){
      if(!data)return;
      const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const tbl=(head,rows,num,total)=>`<table><thead><tr>${head.map((x,i)=>`<th class="${num.includes(i)?'n':''}">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((x,i)=>`<td class="${num.includes(i)?'n':''}">${esc(num.includes(i)&&typeof x==='number'?rzsMoney(x).slice(1):x)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${head.length}">None in this period.</td></tr>`}${total?`<tr class="t">${total.map((x,i)=>`<td class="${num.includes(i)?'n':''}">${esc(typeof x==='number'?rzsMoney(x).slice(1):x)}</td>`).join('')}</tr>`:''}</tbody></table>`;
      const rec=receivedRows().map(r=>[r[0],r[1],r[3],r[4],r[5],r[6]+r[7],r[9],r[10]]);
      const set=settlementRows().map(r=>[r[0],r[1],r[2],r[3],r[4]]);
      const uns=unsettledRows().map(r=>[r[0],r[1],r[2],r[3],r[4],r[5],r[6]]);
      const w=samaraPrintBar(window.open('','_blank'));if(!w){alert('Please allow pop-ups to print.');return;}
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Razorpay Statement</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#222}h2{margin:0;color:#8f1d5a}h3{margin:16px 0 6px;color:#7d1748}p{margin:2px 0 10px;color:#555}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #edd5e0;padding:5px 6px;text-align:left;vertical-align:top}th{background:#c2185b;color:#fff}.n{text-align:right;white-space:nowrap}tr.t td{background:#f8d7e3;font-weight:700}.s{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.s div{border:1px solid #efc3d6;background:#fdf0f5;border-radius:6px;padding:6px 10px}.s b{display:block;font-size:13px}</style></head><body>
<h2>Samara Health Care LLP — Razorpay Statement</h2><p>${esc(periodName)} · prepared ${esc(formatDateIN(today))} from Razorpay (live)</p>
<div class="s"><div>Received<b>${esc(rzsMoney(T.received))}</b></div><div>Razorpay fees + GST<b>${esc(rzsMoney(T.fee_total))}</b></div><div>Paid to bank<b>${esc(rzsMoney(T.settled))}</b></div><div>Still with Razorpay (today)<b>${esc(rzsMoney(T.unsettled))}</b></div></div>
<h3>1. Money received into Razorpay</h3>${tbl(['#','Date','Mode','Guest / ERP record','Amount ₹','Fee + GST ₹','Net ₹','Bank'],rec,[4,5,6],['','','','Total',T.received,T.fee_total,Math.round((T.received-T.fee_total-T.refunded)*100)/100,''])}
<h3>2. Paid by Razorpay to Samara's bank (settlements)</h3>${tbl(['#','Date','UTR','Payments','Amount ₹'],set,[4],['','','Total','',T.settled])}
<h3>3. Still with Razorpay (as on ${esc(formatDateIN(today))})</h3>${tbl(['#','Date','Mode','Guest / ERP record','Amount ₹','Fee + GST ₹','Expected to bank ₹'],uns,[4,5,6],['','','','Total',T.unsettled_gross,Math.round((T.unsettled_gross-T.unsettled)*100)/100,T.unsettled])}
${(data.checks||[]).length?`<h3>Checks</h3><ul>${data.checks.map(c=>`<li>${esc(formatDateIN(c.date))} · ${esc(c.text)} (${esc(c.payment_id)})</li>`).join('')}</ul>`:''}
<p style="margin-top:14px">UPI payments reach the bank in full. Card payments are paid out less Razorpay's fee + 18% GST. Failed attempts are not counted (${T.failed_attempts} in this period).</p></body></html>`);
      w.document.close();w.focus();setTimeout(()=>w.print(),300);
    }
    async function excel(){
      try{
        if(!window.XLSX)await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';sc.async=true;sc.onload=resolve;sc.onerror=()=>reject(new Error('Excel library could not be loaded — check the internet connection.'));document.head.appendChild(sc);});
        const X=window.XLSX,wb=X.utils.book_new();
        const sheet=(name,rows,cols)=>{const ws=X.utils.aoa_to_sheet(rows);ws['!cols']=cols.map(wch=>({wch}));X.utils.book_append_sheet(wb,ws,name)};
        sheet('Summary',[['Samara Health Care LLP — Razorpay Statement'],[periodName],[],['Money received into Razorpay',T.received],['  of which UPI',T.upi],['  of which Cards',T.card],['  other modes',T.other],['Razorpay fees (before GST)',T.fee],['GST on fees',T.gst],['Refunded',T.refunded],['Paid by Razorpay to bank (settlements)',T.settled],[`Still with Razorpay as on ${formatDateIN(today)} (expected to bank)`,T.unsettled],[],['Failed attempts (not counted)',T.failed_attempts]],[52,18]);
        sheet('Received',[['#','Date','Time','Mode','Guest / ERP record','Amount','Fee','GST','Refunded','Net','Bank','Settlement UTR','Razorpay Payment ID'],...receivedRows()],[4,12,9,13,34,12,10,9,10,12,24,20,22]);
        sheet('Paid to bank',[['#','Date','UTR','Payments covered','Amount','Fee + GST','Settlement ID'],...settlementRows()],[4,12,20,10,12,10,22]);
        sheet('Still with Razorpay',[['#','Date','Mode','Guest / ERP record','Amount','Fee + GST','Expected to bank','Razorpay Payment ID'],...unsettledRows()],[4,12,13,34,12,10,14,22]);
        sheet('Checks',[['Date','Check','Amount','Razorpay Payment ID'],...(data.checks||[]).map(c=>[formatDateIN(c.date),c.text,c.amount,c.payment_id])],[12,70,12,22]);
        X.writeFile(wb,`Samara_Razorpay_Statement_${range[0]}_${range[1]}.xlsx`);
      }catch(e){alert(e.message||'Unable to download the Excel file.')}
    }

    // ---------- details ----------
    function openPayment(r){
      const m=r.erp||[];
      setDetail({title:`${rzsMoney(r.amount)} · ${r.method}`,subtitle:`${formatDateIN(r.date)} ${rzsTime(r.at)} · ${r.id}`,fields:[
        ['Recorded in ERP',m.length?m.map(x=>`${x.source}: ${x.name}${x.code?' ('+x.code+')':''} — ${x.detail||''} ${rzsMoney(x.amount)} on ${formatDateIN(String(x.date||'').slice(0,10))}`).join(' | '):'Not recorded in the ERP'],
        ['Amount received',rzsMoney(r.amount)],
        ['Razorpay fee',r.fee?rzsMoney(r.fee):'Nil'],['GST on fee',r.gst?rzsMoney(r.gst):'Nil'],
        ['Refunded',r.refunded?rzsMoney(r.refunded):''],
        ['Net to bank',rzsMoney(r.net)],
        ['Bank payment',r.settled?`${formatDateIN(r.settled_on)} · UTR ${r.settlement_utr||'—'}`:'Not yet paid to the bank'],
        ['Card network',r.card_network],
        ['Payer mobile',r.contact],['Payer email',r.email],
        ['Bank RRN',r.rrn],['Razorpay order',r.order_id],['Description',r.description]]});
    }
    function openSettlement(s){
      const byId=new Map([...(data.received||[]),...(data.unsettled||[])].map(r=>[r.id,r]));
      setDetail({title:`${rzsMoney(s.amount)} paid to bank`,subtitle:`${formatDateIN(s.date)} · UTR ${s.utr||'—'}`,fields:[
        ['UTR (use to match the bank statement)',s.utr],['Status',s.status],['Fee + GST deducted',rzsMoney(s.fee+s.gst)],['Settlement ID',s.id]],
        children:h('div',{style:{marginTop:'10px'}},h('strong',null,`Payments in this bank credit (${s.payments.length})`),
          h('table',{className:'table',style:{marginTop:'6px'}},h('thead',null,h('tr',null,h('th',null,'Payment'),h('th',null,'Guest / ERP record'),h('th',{style:{textAlign:'right'}},'Amount'),h('th',{style:{textAlign:'right'}},'Credited'))),
            h('tbody',null,s.payments.map(p=>{const r=byId.get(p.id);return h('tr',{key:p.id},h('td',null,r?formatDateIN(r.date)+' · '+r.method:p.id),h('td',null,r?(rzsWho(r)||'Not in ERP'):'Paid before this period'),h('td',{style:{textAlign:'right'}},rzsMoney(p.amount)),h('td',{style:{textAlign:'right'}},rzsMoney(p.credit)))}),
              (s.adjustments||[]).map(a=>h('tr',{key:a.id},h('td',null,a.type),h('td',null,a.id),h('td',null,''),h('td',{style:{textAlign:'right'}},a.debit?'−'+rzsMoney(a.debit):rzsMoney(a.credit))))))) });
    }

    // ---------- views ----------
    const stat=(key,label,value,sub,colour)=>h('button',{type:'button',key,className:`card stat samara-pink-stat${view===key?' is-active':''}`,onClick:()=>setView(key),style:{padding:'14px 16px',display:'grid',gap:'4px',textAlign:'left',cursor:'pointer',border:0,font:'inherit'}},
      h('span',{style:{fontWeight:800,color:'#7d1748'}},label),h('strong',{style:{fontSize:'24px',color:colour||undefined}},value),sub?h('small',{style:{color:'#8a6a78',fontWeight:600}},sub):null);
    const back=h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setView('')},'← Back');
    const rowStyle={cursor:'pointer'};
    const num={textAlign:'right',whiteSpace:'nowrap'};
    const cn=k=>({...num,color:RZS_C[k],fontWeight:700});
    const totalRow=cells=>h('tr',{style:{background:'#fdf0f5',fontWeight:800}},cells.map((c,i)=>{const [v,k]=Array.isArray(c)?c:[c,''];return h('td',{key:i,style:typeof v==='number'?(k?cn(k):num):null},typeof v==='number'?rzsMoney(v):v)}));
    const whoCell=r=>{const w=rzsWho(r);return w?h('span',null,w,h('small',{style:{display:'block',color:'#8a6a78'}},(r.erp[0]||{}).source)):h('strong',{style:{color:r.amount<=10?'#8a6a78':'#b42336'}},r.amount<=10?'Test payment':'⚠ Not in ERP')};
    function list(){
      if(view==='received'||view==='fees'){
        const rows=view==='fees'?(data.received||[]).filter(r=>r.fee_total>0):(data.received||[]);
        return h(Section,{title:view==='fees'?'Razorpay fees + GST':'Money received into Razorpay',subtitle:`${periodName} · tap a row for full details`,actions:back},
          h('div',{className:'table-wrap'},h('table',{className:'table'},
            h('thead',null,h('tr',null,h('th',null,'Date'),h('th',null,'Mode'),view==='fees'?null:h('th',null,'Guest / ERP record'),h('th',{style:num},'Amount'),h('th',{style:num},view==='fees'?'Fee':'Fee + GST'),view==='fees'?h('th',{style:num},'GST'):null,h('th',{style:num},'Net'),view==='fees'?null:h('th',null,'Bank'))),
            h('tbody',null,rows.map(r=>h('tr',{key:r.id,style:rowStyle,onClick:()=>openPayment(r)},
              h('td',null,formatDateIN(r.date),h('small',{style:{display:'block',color:'#8a6a78'}},rzsTime(r.at))),h('td',null,r.method),
              view==='fees'?null:h('td',null,whoCell(r)),
              h('td',{style:cn('in')},rzsMoney(r.amount)),h('td',{style:cn('fee')},r[view==='fees'?'fee':'fee_total']?rzsMoney(r[view==='fees'?'fee':'fee_total']):'—'),
              view==='fees'?h('td',{style:cn('fee')},rzsMoney(r.gst)):null,h('td',{style:cn('net')},rzsMoney(r.net)),
              view==='fees'?null:h('td',null,h('small',{style:{color:r.settled?RZS_C.bank:RZS_C.held,fontWeight:700}},rzsBank(r))))),
              !rows.length?h('tr',null,h('td',{colSpan:7},view==='fees'?'No fees in this period — UPI payments have no fee.':'No payments in this period.')):
              view==='fees'?totalRow(['Total','',[rows.reduce((t,r)=>t+r.amount,0),'in'],[T.fee,'fee'],[T.gst,'fee'],[rows.reduce((t,r)=>t+r.net,0),'net']]):totalRow(['Total','','',[T.received,'in'],[T.fee_total,'fee'],[Math.round((T.received-T.fee_total-T.refunded)*100)/100,'net'],''])))),
          view==='fees'?h('p',{className:'small-note',style:{marginTop:'8px'}},'Razorpay deducts its fee and 18% GST on the fee before paying the bank. UPI payments have no fee; card payments do.'):null);
      }
      if(view==='settled')return h(Section,{title:'Paid by Razorpay to Samara’s bank',subtitle:`${periodName} · match each UTR with the bank statement · tap a row for the payments covered`,actions:back},
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,h('th',null,'Date'),h('th',null,'UTR'),h('th',null,'Payments covered'),h('th',{style:num},'Amount'))),
          h('tbody',null,(data.settlements||[]).map(s=>h('tr',{key:s.id,style:rowStyle,onClick:()=>openSettlement(s)},h('td',null,formatDateIN(s.date)),h('td',null,s.utr||'—'),h('td',null,`${s.payments.length} payment${s.payments.length===1?'':'s'}`),h('td',{style:cn('bank')},rzsMoney(s.amount)))),
            !(data.settlements||[]).length?h('tr',null,h('td',{colSpan:4},'No bank payments in this period.')):totalRow(['Total','',`${T.settled_count} credits`,[T.settled,'bank']])))));
      if(view==='pending')return h(Section,{title:'Still with Razorpay',subtitle:`As on ${formatDateIN(today)} · received but not yet paid to the bank (usually 2 working days)`,actions:back},
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,h('th',null,'Date'),h('th',null,'Mode'),h('th',null,'Guest / ERP record'),h('th',{style:num},'Amount'),h('th',{style:num},'Fee + GST'),h('th',{style:num},'Expected to bank'))),
          h('tbody',null,(data.unsettled||[]).map(r=>h('tr',{key:r.id,style:rowStyle,onClick:()=>openPayment(r)},h('td',null,formatDateIN(r.date)),h('td',null,r.method),h('td',null,whoCell(r)),h('td',{style:cn('in')},rzsMoney(r.amount)),h('td',{style:cn('fee')},r.fee_total?rzsMoney(r.fee_total):'—'),h('td',{style:cn('held')},rzsMoney(r.net)))),
            !(data.unsettled||[]).length?h('tr',null,h('td',{colSpan:6},'Nothing pending — everything received has been paid to the bank.')):totalRow(['Total','','',[T.unsettled_gross,'in'],[Math.round((T.unsettled_gross-T.unsettled)*100)/100,'fee'],[T.unsettled,'held']])))));
      if(view==='checks'){
        const byId=new Map([...(data.received||[]),...(data.unsettled||[])].map(r=>[r.id,r]));
        const checks=[...(data.checks||[])].sort((a,b)=>(a.severity==='high'?0:1)-(b.severity==='high'?0:1)||String(a.date).localeCompare(String(b.date)));
        return h(Section,{title:'Checks',subtitle:`${periodName} · tap a row to see the payment`,actions:back},
          !checks.length?h('p',{className:'empty'},'✓ All clear — every Razorpay payment in this period is in the ERP with the same amount, and nothing is waiting too long for the bank.'):
          h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,h('th',null,'Date'),h('th',null,'Finding'),h('th',{style:num},'Amount'))),
            h('tbody',null,checks.map((c,i)=>h('tr',{key:i,style:rowStyle,onClick:()=>{const r=byId.get(c.payment_id);if(r)openPayment(r)}},h('td',null,formatDateIN(c.date)),h('td',null,h('span',{style:{color:c.severity==='high'?'#b42336':'#8a6a78',fontWeight:c.severity==='high'?700:500}},(c.severity==='high'?'⚠ ':'ℹ ')+c.text)),h('td',{style:num},rzsMoney(c.amount))))))),
          h('p',{className:'small-note',style:{marginTop:'8px'}},'Small payments of ₹10 or less are gateway tests and are shown for information only.'));
      }
      return null;
    }

    return h(React.Fragment,null,
      h(Section,{title:'Razorpay Statement',subtitle:'Admin / Directors only · live from Razorpay: money received, fees, money paid to the bank, and what is still with Razorpay',actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:load},busy?'Reading Razorpay…':'↻ Refresh'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!data,onClick:printIt},'Print / PDF'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!data,onClick:excel},'Excel'))},
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},
          h('button',{type:'button',className:`btn ${mode==='today'?'btn-primary':'btn-secondary'}`,onClick:()=>{setMode('today');setView('')}},'Today'),
          h('button',{type:'button',className:`btn ${mode==='week'?'btn-primary':'btn-secondary'}`,onClick:()=>{setMode('week');setView('')}},'This Week'),
          h('button',{type:'button',className:`btn ${mode==='month'&&month===rzsMonthStart(today)?'btn-primary':'btn-secondary'}`,onClick:()=>{setMode('month');setMonth(rzsMonthStart(today));setView('')}},'This Month'),
          h('label',{style:{display:'flex',gap:'6px',alignItems:'center',margin:0}},'Month',h('select',{value:mode==='month'?month:'',onChange:e=>{setMode('month');setMonth(e.target.value);setView('')}},mode!=='month'?h('option',{value:''},'—'):null,rzsMonthOptions().map(m=>h('option',{key:m,value:m},rzsMonthLabel(m))))),
          h('span',{style:{fontWeight:700,color:'#7b6871',marginLeft:'6px'}},'Period'),
          h(StrictDateInput,{value:draft.from,min:RZS_FIRST,max:draft.to||today,onChange:e=>setDraft(d=>({...d,from:e.target.value})),style:{width:'150px'}}),
          h(StrictDateInput,{value:draft.to,min:draft.from||RZS_FIRST,max:today,onChange:e=>setDraft(d=>({...d,to:e.target.value})),style:{width:'150px'}}),
          h(ApplyFilterButton,{dirty:Boolean(draft.from&&draft.to)&&(mode!=='custom'||draft.from!==custom.from||draft.to!==custom.to),onApply:()=>{if(!draft.from||!draft.to){alert('Choose both From and To dates.');return}if(draft.from>draft.to){alert('From date is after To date.');return}setCustom(draft);setMode('custom');setView('')}}))),
      error?h('div',{className:'message error'},error):null,
      busy&&!data?h('p',{className:'empty'},'Reading Razorpay…'):null,
      data&&T?h(React.Fragment,null,
        !view?h(React.Fragment,null,
          h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'12px',margin:'0 0 14px'}},
            stat('received','Received in Razorpay',rzsMoney(T.received),`${T.received_count} payments · UPI ${rzsMoney(T.upi)} · Cards ${rzsMoney(T.card)}`,RZS_C.in),
            stat('fees','Razorpay fees + GST',rzsMoney(T.fee_total),`Fee ${rzsMoney(T.fee)} + GST ${rzsMoney(T.gst)}${T.refunded?` · refunded ${rzsMoney(T.refunded)}`:''}`,RZS_C.fee),
            stat('settled','Paid to bank',rzsMoney(T.settled),`${T.settled_count} bank credits (UTR) in this period`,RZS_C.bank),
            stat('pending','Still with Razorpay',rzsMoney(T.unsettled),`As on ${formatDateIN(today)} · ${T.unsettled_count} payment${T.unsettled_count===1?'':'s'} awaiting the bank`,RZS_C.held),
            stat('checks','Checks',T.checks_high?`⚠ ${T.checks_high}`:'✓ All clear',T.checks_high?'Need attention — tap to see':'Every payment is in the ERP',T.checks_high?RZS_C.fee:RZS_C.in)),
          h(Section,{title:`How it adds up · ${periodName}`},(()=>{
            // 2.19.63: one "still with Razorpay" figure only (today's total), with its payments listed underneath.
            const rows=data.received||[];
            const inBank=Math.round(rows.filter(r=>r.settled).reduce((t,r)=>t+r.net,0)*100)/100;
            const earlier=Math.max(0,Math.round((T.settled-inBank)*100)/100);
            const head=t=>h('tr',{style:{background:'#fdf0f5'}},h('td',{colSpan:5,style:{fontWeight:800,color:'#7d1748'}},t));
            const line=(l,v,k,opt={})=>h('tr',{style:opt.bold?{fontWeight:800}:null},h('td',{colSpan:4},l,opt.note?h('small',{style:{display:'block',color:'#8a6a78',fontWeight:500}},opt.note):null),h('td',{style:{...cn(k),fontSize:opt.bold?'16px':undefined}},rzsSigned(v)));
            const pend=data.unsettled||[];
            const sub={color:'#8a6a78',fontSize:'12px',fontWeight:700};
            return h('div',{className:'table-wrap'},h('table',{className:'table'},h('tbody',null,
              head('A. Payments received in this period'),
              line(`Money received into Razorpay (${T.received_count} payment${T.received_count===1?'':'s'})`,T.received,'in'),
              line('Razorpay fees + GST deducted (card payments only)',-T.fee_total,'fee'),
              T.refunded?line('Refunded to payers',-T.refunded,'fee'):null,
              head('B. Paid by Razorpay to the bank in this period'),
              line('Paid to bank',T.settled,'bank',{note:earlier?`${rzsMoney(earlier)} of this was for payments received before this period`:null}),
              head(`C. Still with Razorpay today (${formatDateIN(today)}) — coming to the bank`),
              pend.length?h('tr',null,h('td',{style:sub},'Payment date'),h('td',{style:sub},'Mode · Guest'),h('td',{style:{...sub,textAlign:'right'}},'Received'),h('td',{style:{...sub,textAlign:'right'}},'Fee + GST'),h('td',{style:{...sub,textAlign:'right'}},'Coming to bank')):null,
              ...pend.map(r=>h('tr',{key:r.id,style:{cursor:'pointer'},onClick:()=>openPayment(r)},h('td',null,formatDateIN(r.date)),h('td',null,r.method,rzsWho(r)?h('small',{style:{display:'block',color:'#8a6a78'}},rzsWho(r)):null),h('td',{style:cn('in')},rzsMoney(r.amount)),h('td',{style:cn('fee')},r.fee_total?rzsMoney(r.fee_total):'—'),h('td',{style:cn('held')},rzsMoney(r.net)))),
              line(pend.length?'Total still with Razorpay':'Nothing pending — everything received has reached the bank',T.unsettled,'held',{bold:true}))));
          })(),
            h('p',{className:'small-note',style:{marginTop:'8px'}},`Live from Razorpay, read ${formatDateIN(data.generated_at)} ${rzsTime(data.generated_at)}. UPI reaches the bank in full; cards are paid out less Razorpay's fee + 18% GST. Failed attempts are not counted (${T.failed_attempts} in this period). Tap a box to open its list.`))):list()):null,
      detail?h(RowDetailModal,{title:detail.title,subtitle:detail.subtitle,fields:detail.fields,onClose:()=>setDetail(null)},detail.children||null):null
    );
  }
