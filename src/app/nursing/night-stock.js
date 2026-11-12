  // 2.20.53: Night Stock (SQL 387) → 2.20.56: renamed Ward Stock and used on BOTH shifts (SQL 390) — Nursing → Ward Stock.
  // The Nursing Manager (store keeper) is not on duty at night. A locked cupboard at the nurses' station holds
  // a fixed list of Consumables / Pharmacy items at set levels.
  //   Evening : Nursing Manager (or her Stores leave cover / Admin) tops it up from the Main Store.
  //   19:00   : night nurse counts and accepts (opening count).
  //   Night   : night nurse records use for a Guest → a Guest indent already "Received" is created, so the item
  //             is charged in Bills & Charges exactly like a day indent (Stores is not reduced a second time).
  //   07:00   : night nurse closing count.
  //   Morning : Nursing Manager verifies — or, when she is not on Day duty today, the Day-shift duty nurse.
  // Counts are entered without seeing the ERP figure; differences are shown after "Check".
  // 2.20.55: Samara baby-pink gradient boxes; box title bold and larger, status line smaller.
  function ensureNightStockCss(){
    if(document.getElementById('night-stock-css'))return;
    const st=document.createElement('style');st.id='night-stock-css';
    st.textContent=`.night-stock .ns-boxes .dr-box{background:linear-gradient(135deg,#fff5f9 0%,#fbdce9 55%,#f5bdd5 100%);border:1px solid #edb5ce;border-top:4px solid #a91360;color:#56243e;box-shadow:0 8px 20px rgba(143,23,76,.08);padding:14px 16px;gap:6px}
.night-stock .ns-boxes .dr-box:hover,.night-stock .ns-boxes .dr-box:focus-visible{box-shadow:0 10px 24px rgba(143,23,76,.18)}
.night-stock .ns-boxes .dr-box-label{font-size:18px;font-weight:900;color:#7a1247;min-height:0;line-height:1.25}
.night-stock .ns-boxes .dr-box-value{font-size:13px;font-weight:600;color:#5b3a4b}`;
    document.head.appendChild(st);
  }
  // 2.20.57: Print / PDF of the Ward Stock list — also a count sheet (blank "Counted" column).
  // Nurse logins get item names only (blind counts); Nursing Manager / Admin also get the usual level and the ERP quantity.
  function nsPrintWardStock({rows,showQty,shiftText,who}){
    const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const logo=new URL('assets/samara-logo.png',window.location.href).href;
    const now=new Date().toLocaleString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).replace(/\//g,'-').replace(',','');
    const head=['S.No','Item','Unit',...(showQty?['Usual level','In cupboard (ERP)']:[]),'Counted','Remarks'];
    const body=rows.map((i,k)=>`<tr><td class="n">${k+1}</td><td>${esc(i.item_name)}</td><td>${esc(i.unit)}</td>${showQty?`<td class="n">${Number(i.par_qty||0)}</td><td class="n">${Number(i.night_balance||0)}</td>`:''}<td class="box"></td><td class="rem"></td></tr>`).join('');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Ward Stock — ${esc(shiftText)}</title><style>
      @page{size:A4 portrait;margin:11mm 9mm 13mm}*{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:11px;line-height:1.35;background:#fff}
      .top{display:flex;align-items:center;gap:14px;border-bottom:2px solid #a91360;padding-bottom:8px;margin-bottom:10px}.logo{height:54px}
      .org{display:flex;flex-direction:column}.org strong{font-size:15px;color:#7a1247}.org span{font-size:11px;color:#6b4a5b}
      h1{font-size:17px;margin:4px 0 2px;color:#7a1247}.meta{margin:0 0 10px;color:#5b3a4b}
      table{width:100%;border-collapse:collapse}th{background:#fbdce9;color:#5b1a3b;text-align:left;font-size:10.5px}
      th,td{border:1px solid #e3c2d2;padding:6px 7px;vertical-align:middle}td.n,th.n{text-align:right;width:70px}
      td.box{width:80px}td.rem{width:150px}tr:nth-child(even) td{background:#fff7fb}
      .sign{display:flex;justify-content:space-between;gap:16px;margin-top:34px}.sign div{flex:1;border-top:1px solid #8a6a7a;padding-top:5px;text-align:center;font-size:10.5px}
      .footer{margin-top:16px;font-size:9.5px;color:#8a6a7a;text-align:center}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="top"><img class="logo" src="${logo}" alt="Samara Assisted Living"><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Nursing · Ward Stock</span><span>Compassion • Comfort • Dignity</span></div></div>
      <h1>Ward Stock — Count Sheet</h1>
      <p class="meta">${esc(shiftText)} · ${rows.length} item(s) · Printed ${esc(now)}</p>
      <table><thead><tr>${head.map(x=>`<th${/Usual|ERP|S\.No/.test(x)?' class="n"':''}>${esc(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
      <div class="sign"><div>Counted by (Nurse) — name &amp; time</div><div>Received by (incoming Nurse)</div><div>Verified by (Nursing Manager)</div></div>
      <div class="footer">Generated from Samara Care ERP${who?` by ${esc(who)}`:''} · Computer-generated sheet</div>
      <script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250));});<\/script>
    </body></html>`;
    const win=samaraPrintBar(window.open('','_blank'));
    if(!win){alert('Please allow pop-ups to print / save the Ward Stock PDF.');return}
    win.document.open();win.document.write(html);win.document.close();
  }
  function NightStock({profile,onNavigate}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [tab,setTab]=React.useState('home'),[detail,setDetail]=React.useState(null);
    const [patients]=usePatients();
    const lock=React.useRef(false),token=React.useRef(null);
    const [focus,clearFocus]=useRecordFocus('Ward Stock');
    React.useEffect(()=>{ensureNightStockCss()},[]);
    const load=React.useCallback(async()=>{const r=await client.rpc('night_stock_workspace');if(r.error){setError(r.error.message);return}setData(r.data);setError('')},[]);
    React.useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t)},[load]);
    React.useEffect(()=>{if(focus)setTab('home')},[focus]);
    const toast=(ok,title,text)=>showSamaraActionToast(ok?'success':'error',title,text);
    async function post(action,payload,okTitle,okText){
      if(lock.current)return null;lock.current=true;setBusy(true);setError('');
      const sig=JSON.stringify({action,payload});if(token.current?.sig!==sig)token.current={sig,id:crypto.randomUUID()};
      try{const r=await client.rpc('night_stock_post',{p_id:token.current.id,p_action:action,p_data:payload});if(r.error)throw r.error;token.current=null;await load();toast(true,okTitle,okText);return r.data||{};}
      catch(e){setError(e.message);toast(false,'Ward Stock',e.message);return null}
      finally{lock.current=false;setBusy(false)}
    }
    if(!data)return h(Section,{title:'Ward Stock'},h('p',{role:'status'},error||'Loading Ward Stock…'),error&&/night_stock_workspace|function/i.test(error)&&h('p',null,'Apply SQL 387 in Supabase before using this page.'));

    const acc=data.access||{},cs=data.current_shift||{},cur=cs.date,curShift=cs.shift,mins=Number(data.minutes_into_shift||0);
    const n=v=>Number(v||0),qty=(v,u)=>`${n(v)} ${u||''}`.trim();
    const addDays=(d,k)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+k);return x.toISOString().slice(0,10)};
    const rank=(d,s)=>Math.round(new Date(d+'T00:00:00Z').getTime()/86400000)*2+(s==='Night'?1:0);
    const shiftRow=(d,s)=>(data.shifts||[]).find(x=>x.night_date===d&&x.shift===s);
    const prevOf=(d,s)=>s==='Day'?{date:addDays(d,-1),shift:'Night'}:{date:d,shift:'Day'};
    const nextOf=(d,s)=>s==='Day'?{date:d,shift:'Night'}:{date:addDays(d,1),shift:'Day'};
    const shiftLabel=(d,s)=>`${s==='Night'?'🌙':'☀️'} ${s} shift ${formatDateIN(d)}`;
    const verified=s=>['Verified','Verified – Discrepancy'].includes(s);
    const curRank=rank(cur,curShift),prev=prevOf(cur,curShift),curRow=shiftRow(cur,curShift),prevRow=shiftRow(prev.date,prev.shift);
    const acceptTarget=mins>=660?nextOf(cur,curShift):{date:cur,shift:curShift};
    const closeTarget=mins<120?prev:{date:cur,shift:curShift};
    const acceptRow=shiftRow(acceptTarget.date,acceptTarget.shift),closeRow=shiftRow(closeTarget.date,closeTarget.shift);
    const listItems=(data.items||[]).filter(i=>i.in_list&&(i.active||n(i.night_balance)!==0)).sort((a,b)=>a.item_name.localeCompare(b.item_name));
    const itemById=id=>(data.items||[]).find(i=>i.store_item_id===id);
    // ended shifts not yet verified (the morning verification covers all of them)
    const pending=(data.shifts||[]).filter(x=>rank(x.night_date,x.shift)<curRank&&!verified(x.status)).sort((a,b)=>rank(b.night_date,b.shift)-rank(a.night_date,a.shift));
    const toVerify=pending[0]||null;
    // late Guest-use entry: a recent ended shift that is not verified yet
    const lateShifts=pending.filter(x=>rank(x.night_date,x.shift)>=curRank-3);
    const pLabel=id=>{const p=patients.find(x=>x.id===id);return p?`${formalName(p)||p.full_name} · ${p.patient_id||''}${p.room_no?` · Room ${p.room_no}-${p.bed_no||''}`:''}`:'Guest'};
    const when=v=>v?formatDateTimeIN(v):'';
    const pill=(t,tone)=>h('span',{style:{display:'inline-block',padding:'4px 9px',borderRadius:'999px',fontWeight:800,fontSize:'12px',background:tone==='good'?'#e7f6ef':tone==='bad'?'#fdebec':tone==='blue'?'#eaf2ff':'#fff4dc',color:'#5d3146'}},t);
    const statusTone=s=>s==='Verified'?'good':s==='Verified – Discrepancy'||s==='Returned'?'bad':s==='Closed'?'blue':'';
    const btn=(text,onClick,primary=false,disabled=false)=>h('button',{type:'button',className:'btn '+(primary?'btn-primary':'btn-secondary'),disabled:busy||disabled,onClick},text);
    const table=(heads,rows,onRow)=>h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),
      h('tbody',null,rows.length?rows.map((r,i)=>h('tr',{key:i,className:onRow?'row-clickable':undefined,style:onRow?{cursor:'pointer'}:undefined,onClick:onRow?e=>{if(e.target.closest&&e.target.closest('button,input,select,textarea,a'))return;onRow(i)}:undefined},r.map((c,j)=>h('td',{key:j,style:{whiteSpace:'normal'}},c)))):h('tr',null,h('td',{colSpan:heads.length,style:{textAlign:'center',padding:'18px'}},'Nothing to show.')))));

    const statusText=(()=>{
      if(!listItems.length)return acc.manage?'Ward Stock is not set up yet. Tap "➕ Add items to Ward Stock" to choose the items and quantities.':'Ward Stock is not set up yet. The Nursing Manager chooses the items.';
      const now=shiftLabel(cur,curShift);
      if(!curRow?.accepted_at)return `${now}: the incoming nurse counts the cupboard and taps Opening Count / Accept before using any item.`;
      if(curRow.status==='Closed')return `${now}: closing count done by ${curRow.closed_by_name}.`;
      return `${now}: accepted by ${curRow.accepted_by_name} at ${when(curRow.accepted_at)}. Record every item you use for a Guest.${toVerify&&curShift==='Day'?` · ${pending.length} ended shift${pending.length===1?'':'s'} waiting for morning verification.`:''}`;
    })();

    function openShift(d,s){
      const x=shiftRow(d,s)||{night_date:d,shift:s,status:'—'};const counts=(data.counts||[]).filter(c=>c.night_date===d&&(c.shift||'Night')===s),moves=(data.ledger||[]).filter(m=>m.night_date===d&&(m.shift||'Night')===s);
      const ids=[...new Set([...counts.map(c=>c.store_item_id),...moves.map(m=>m.store_item_id)])];
      const c=(id,k)=>{const r=counts.find(z=>z.store_item_id===id&&z.kind===k);return r?(n(r.counted_qty)===n(r.expected_qty)?String(n(r.counted_qty)):`${n(r.counted_qty)} (ERP ${n(r.expected_qty)})`):'—'};
      setDetail({title:`${shiftLabel(d,s)} · ${x.status}`,fields:[['Accepted by',[x.accepted_by_name,when(x.accepted_at)].filter(Boolean).join(' · ')],['Opening note',x.accept_note],['Closing count by',[x.closed_by_name,when(x.closed_at)].filter(Boolean).join(' · ')],['Closing note',x.close_note],['Returned by',[x.returned_by_name,when(x.returned_at)].filter(Boolean).join(' · ')],['Return note',x.return_note],['Verified by',[x.verified_by_name,x.verifier_as,when(x.verified_at)].filter(Boolean).join(' · ')],['Verification note',x.verify_note]],
        children:h('div',null,counts.length>0&&h('h4',null,'Counts'),counts.length>0&&table(['Item','Opening','Closing','Verified'],ids.filter(id=>counts.some(c=>c.store_item_id===id)).map(id=>[itemById(id)?.item_name||'Item',c(id,'Opening'),c(id,'Closing'),c(id,'Verify')])),
          h('h4',null,'Movements'),table(['Time','Movement','Item','Qty','Guest','By'],moves.map(m=>[when(m.created_at),m.movement+(m.late_entry?' (late)':''),itemById(m.store_item_id)?.item_name||'',`${n(m.qty)>0?'+':''}${n(m.qty)}`,m.patient_id?pLabel(m.patient_id):'—',m.actor_name||''])))});
    }

    const ctx={load,acc,cur,curShift,mins,prev,curRow,prevRow,acceptTarget,closeTarget,acceptRow,closeRow,pending,lateShifts,shiftLabel,rank,listItems,toVerify,n,qty,pill,btn,table,post,setError,setTab,when,verified,itemById,patients,pLabel,onNavigate,busy,data,addDays,shiftRow,statusTone,openShift,setDetail};
    const lastTopup=(data.ledger||[]).filter(m=>m.movement==='Top-up'&&m.night_date===cur&&(m.shift||'Night')===curShift).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0]||null;
    const usedNow=(data.ledger||[]).filter(m=>m.night_date===cur&&(m.shift||'Night')===curShift&&m.movement==='Use').length;
    const canUse=acc.nurse||acc.nm;
    const boxes=[
      ['➕ Add items to Ward Stock',lastTopup?`Done · ${new Date(lastTopup.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kolkata'})} · ${lastTopup.actor_name||''}`:'Tap to add','add',acc.manage],
      ['Ward Stock now',`${listItems.length} item${listItems.length===1?'':'s'}`,'stock',true],
      ['Use for a Guest',`${usedNow} entr${usedNow===1?'y':'ies'} this shift`,'use',canUse],
      ['Opening Count / Accept',acceptRow?.accepted_at?`Done · ${acceptRow.accepted_by_name}`:mins>=660?`Next shift — from now`:mins>=30?'Due now':'At shift start','accept',acc.nurse],
      ['Closing Count',closeRow?.closed_at?`Done · ${closeRow.closed_by_name}`:mins<120&&prevRow&&!verified(prevRow.status)?'Previous shift — not done!':mins>=660?'Due before shift ends':'At shift end','close',acc.nurse],
      ['Morning Verification',toVerify?(toVerify.status==='Returned'?'Returned to nurse':`Waiting · ${pending.length} shift${pending.length===1?'':'s'}`):'Up to date','verify',true],
      ['Register','Shifts & movements','register',true]
    ].filter(b=>b[3]);
    return h('div',{className:'night-stock'},
      detail&&h(RowDetailModal,{title:detail.title,subtitle:detail.subtitle,fields:detail.fields,onClose:()=>setDetail(null)},detail.children),
      h('div',{className:'card panel dr-head'},h('div',{className:'dr-head-text'},h('h2',null,'🗄️ Ward Stock'),h('small',null,'Cupboard for both shifts: Nursing Manager adds items → opening count at each shift start (07:00 / 19:00) → use for Guests → closing count at shift end → morning verification by the Nursing Manager.')),
        h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},tab!=='home'&&btn('← Back',()=>{setTab('home');setError('')}))),
      error&&h('p',{className:'message error',role:'alert'},error),
      h('p',{className:'message',role:'status'},statusText,acc.verify_as&&toVerify&&curShift==='Day'?` You can verify as: ${acc.verify_as}.`:''),
      focus&&h('p',{className:'message',role:'status'},'Opened from an alert. ',btn('OK',clearFocus)),
      tab==='home'&&h('div',{className:'dr-boxes ns-boxes'},boxes.map(([label,value,key])=>h('button',{key,type:'button',className:'dr-box',onClick:()=>{setError('');setTab(key)}},h('span',{className:'dr-box-label'},label),h('b',{className:'dr-box-value',style:/not done|Due now|Waiting|Returned/i.test(value)?{color:'#b42318'}:undefined},value)))),
      tab==='stock'&&h(NsStockNow,{ctx}),
      tab==='use'&&h(NsUseForm,{ctx}),
      tab==='accept'&&h(NsCountForm,{ctx,kind:'accept'}),
      tab==='close'&&h(NsCountForm,{ctx,kind:'close'}),
      tab==='verify'&&h(NsCountForm,{ctx,kind:'verify'}),
      tab==='add'&&h(NsAddItems,{ctx}),
      tab==='register'&&h(NsRegister,{ctx}));
  }
  // 2.20.55: blind count. Nurse logins never see the ERP quantity — Check only says Matched / Not matched (SQL 389).
  // 1st Check with a mismatch → recount those items; still not matching → save with a note.
  function NsCountForm({ctx,kind}){
    const {acc,listItems,toVerify,pending,acceptTarget,closeTarget,acceptRow,closeRow,shiftLabel,mins,pill,btn,table,post,setError,setTab,when,busy}=ctx;
    const [counts,setCounts]=React.useState({}),[result,setResult]=React.useState(null),[tries,setTries]=React.useState(0),[note,setNote]=React.useState(''),[checking,setChecking]=React.useState(false);
    const showQty=Boolean(acc.manage);
    const target=kind==='verify'?toVerify:null;
    const res=id=>(result||[]).find(r=>r.store_item_id===id);
    const mismatched=(result||[]).filter(r=>!r.matched);
    const complete=listItems.every(i=>counts[i.store_item_id]!==undefined&&counts[i.store_item_id]!==''&&Number.isInteger(Number(counts[i.store_item_id]))&&Number(counts[i.store_item_id])>=0);
    const countList=()=>listItems.map(i=>({store_item_id:i.store_item_id,counted:Number(counts[i.store_item_id])}));
    const covers=pending.map(x=>shiftLabel(x.night_date,x.shift)).reverse().join(', ');
    const titles={accept:[`Opening Count — ${shiftLabel(acceptTarget.date,acceptTarget.shift)}`,'You are taking over the cupboard. Count each item and type the number you see. Then tap Check.'],close:[`Closing Count — ${shiftLabel(closeTarget.date,closeTarget.shift)}`,mins<120?'Late closing count for the shift that has just ended. Count each item in the cupboard, then tap Check.':'Before your shift ends, make sure every item used is recorded, then count each item in the cupboard and tap Check.'],verify:['Morning Verification',target?`Covers: ${covers}. ${target.closed_at?`Last closing count by ${target.closed_by_name} at ${when(target.closed_at)}`:'The last shift was NOT closed by the nurse'}${target.close_note?` · note: ${target.close_note}`:''}`:'No shift is waiting for verification.']};
    if(kind==='verify'&&!target)return h(Section,{title:titles.verify[0]},h('p',null,'No shift is waiting for verification.'));
    if(kind==='accept'&&acceptRow?.accepted_at)return h(Section,{title:titles.accept[0]},h('p',null,`Already accepted by ${acceptRow.accepted_by_name} at ${when(acceptRow.accepted_at)}.`));
    if(kind==='close'&&closeRow?.closed_at)return h(Section,{title:titles.close[0]},h('p',null,`Closing count already done by ${closeRow.closed_by_name} at ${when(closeRow.closed_at)}.`));
    if(kind==='verify'&&!acc.verify)return h(Section,{title:titles.verify[0]},h('p',null,acc.nm_on_day_duty?'The Nursing Manager is on Day duty today — she verifies the Ward Stock.':'Only the Nursing Manager verifies — or, when she is not on Day duty today, the Day-shift duty nurse.'));
    if(kind!=='verify'&&!acc.nurse)return h(Section,{title:titles[kind][0]},h('p',null,'The nurse on duty does this count from her Nurse login.'));
    async function check(){
      if(!complete){setError('Enter a whole-number count for every item (0 if none).');return}
      setError('');setChecking(true);
      try{const r=await client.rpc('night_stock_check',{p_counts:countList()});if(r.error)throw r.error;setResult(Array.isArray(r.data)?r.data:[]);setTries(t=>t+1)}
      catch(e){setError(e.message)}finally{setChecking(false)}
    }
    const canSave=result&&(mismatched.length===0||tries>=2);
    const save=async()=>{if(mismatched.length&&note.trim().length<3){setError('Write a note explaining the difference.');return}
      const r=await post(kind,{note,which:kind==='close'?(mins<120?'previous':'current'):undefined,counts:countList()},kind==='accept'?'Ward Stock accepted':kind==='close'?'Closing count saved':'Ward Stock verified',mismatched.length?'Saved with a difference — the note goes to the Nursing Manager.':'All counts matched.');
      if(r){setCounts({});setResult(null);setTries(0);setNote('');setTab('home')}};
    const sendBack=async()=>{if(note.trim().length<3){setError('Tell the nurse what to check.');return}const r=await post('return_to_nurse',{shift_date:target.night_date,shift:target.shift,note},'Returned to the nurse','She can now enter the missed Guest use for that night.');if(r){setTab('home')}};
    const rows=listItems.slice().sort((a,b)=>a.item_name.localeCompare(b.item_name,undefined,{sensitivity:'base'}));
    return h(Section,{title:titles[kind][0],subtitle:titles[kind][1]},
      table(['S.No','Item','Unit','Your count',...(result?['Result']:[])],rows.map((i,k)=>{const r=res(i.store_item_id),bad=r&&!r.matched;return [k+1,h('b',null,i.item_name),i.unit,
        h('input',{type:'number',min:0,step:1,inputMode:'numeric',style:{maxWidth:'110px',...(bad?{border:'2px solid #b42318',background:'#fff1f1'}:{})},value:counts[i.store_item_id]??'','aria-label':`Count of ${i.item_name}`,onChange:e=>{setResult(null);setCounts(v=>({...v,[i.store_item_id]:e.target.value}))}}),
        ...(result?[r?(r.matched?pill('✓ Matched','good'):pill(showQty&&r.erp!=null?`✗ Not matched (ERP ${Number(r.erp)}, ${Number(r.difference)>0?'+':''}${Number(r.difference)})`:'✗ Not matched','bad')):'']:[])]})),
      !result&&h('div',{style:{marginTop:'10px'}},btn(checking?'Checking…':tries?'Check again':'Check',check,true,checking)),
      result&&mismatched.length===0&&h('p',{className:'message',role:'status',style:{marginTop:'10px'}},'✓ All counts matched.'),
      result&&mismatched.length>0&&tries<2&&h('div',{style:{marginTop:'10px'}},
        h('p',{className:'message error',role:'alert'},`✗ ${mismatched.length} item${mismatched.length===1?' does':'s do'} not match. Please count ${mismatched.length===1?'that item':'those items'} (marked red) again, correct the number and tap Check again.`),
        btn('Recount',()=>setResult(null),true)),
      result&&mismatched.length>0&&tries>=2&&h('p',{className:'message error',role:'alert',style:{marginTop:'10px'}},`✗ Still not matching (${mismatched.length} item${mismatched.length===1?'':'s'}). ${kind==='close'?'If you used an item for a Guest and did not record it, go back and record it in Use for a Guest first. Otherwise write a note and save.':kind==='verify'?'Return to the nurse to enter missed Guest use, or write the reason and verify (the difference is written off).':'Write a note and save — the Nursing Manager will be informed.'}`),
      canSave&&h('div',{style:{marginTop:'10px'}},
        h('div',{className:'field'},h('label',null,mismatched.length?'Note — reason for the difference *':'Note (optional)'),h('textarea',{rows:2,value:note,onChange:e=>setNote(e.target.value)})),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          btn(busy?'Saving…':kind==='accept'?'Accept Ward Stock':kind==='close'?'Save Closing Count':mismatched.length?'Verify with Difference':'Verify — All OK',save,true),
          kind==='verify'&&mismatched.length>0&&btn('Return to Nurse',sendBack),
          btn('Recount',()=>setResult(null)))));
  }
  function NsUseForm({ctx}){
    const {acc,cur,curShift,curRow,lateShifts,shiftLabel,listItems,n,qty,btn,post,setError,itemById,patients,pLabel,onNavigate,busy}=ctx;
    const [f,setF]=React.useState({patient_id:'',store_item_id:'',qty:'1',note:'',when:'now'}),[search,setSearch]=React.useState(''),[done,setDone]=React.useState(null);
    if(!(acc.nurse||acc.nm))return h(Section,{title:'Use for a Guest'},h('p',null,'Nurses record use from their Nurse login.'));
    const showQty=Boolean(acc.manage);
    const lateT=f.when==='now'?null:lateShifts.find(x=>`${x.night_date}|${x.shift}`===f.when);
    const late=Boolean(lateT);
    const q=search.trim().toLowerCase();
    const guests=patients.filter(p=>p.is_active!==false).filter(p=>q.length<3||pLabel(p.id).toLowerCase().includes(q)).sort((a,b)=>pLabel(a.id).localeCompare(pLabel(b.id)));
    const avail=listItems.filter(i=>i.active&&(!showQty||n(i.night_balance)>0)).slice().sort((a,b)=>a.item_name.localeCompare(b.item_name,undefined,{sensitivity:'base'}));
    const it=itemById(f.store_item_id);
    const save=async e=>{e.preventDefault();const k=Number(f.qty);if(!f.patient_id||!f.store_item_id){setError('Select the Guest and the item.');return}if(!Number.isInteger(k)||k<=0||(showQty&&k>n(it?.night_balance))){setError(showQty?`Enter a whole number from 1 to ${n(it?.night_balance)}.`:'Enter a whole number above 0.');return}if(late&&f.note.trim().length<3){setError('Late entry: say why it was not entered during that shift.');return}
      const r=await post('use',{patient_id:f.patient_id,store_item_id:f.store_item_id,qty:k,note:f.note,shift_date:late?lateT.night_date:cur,shift:late?lateT.shift:curShift},'Ward Stock use recorded',`${k} ${it.unit} ${it.item_name} for ${pLabel(f.patient_id)}. Now raise the charge in Bills & Charges.`);
      if(r){setDone({patient_id:f.patient_id,item:it.item_name,qty:k,unit:it.unit});setF(v=>({...v,store_item_id:'',qty:'1',note:''}))}};
    return h(Section,{title:'Use for a Guest',subtitle:'Takes the item out of the Ward Stock cupboard and gives it to the Guest as a received item. Then charge it in Bills & Charges as usual. No indent needed.'},
      !late&&!curRow?.accepted_at&&h('p',{className:'message error',role:'status'},'Ward Stock is not accepted yet for this shift — please do the opening count first.'),
      done&&h('div',{className:'message',role:'status'},`Recorded: ${done.qty} ${done.unit} ${done.item} for ${pLabel(done.patient_id)}. `,onNavigate&&btn('Raise charge in Bills & Charges',()=>onNavigate('Charge Approvals'),true)),
      h('form',{onSubmit:save},h('fieldset',{disabled:busy,style:{border:0,padding:0}},
        lateShifts.length>0&&h('div',{className:'field'},h('label',null,'Shift'),h('select',{value:f.when,onChange:e=>setF(v=>({...v,when:e.target.value}))},h('option',{value:'now'},`Now — ${shiftLabel(cur,curShift)}`),lateShifts.map(x=>h('option',{key:x.night_date+x.shift,value:`${x.night_date}|${x.shift}`},`Late entry — ${shiftLabel(x.night_date,x.shift)}${x.status==='Returned'?' (returned)':''}`)))),
        h('div',{className:'grid two'},
          h('div',{className:'field'},h('label',null,'Search Guest / ID'),h('input',{value:search,placeholder:'At least 3 characters',onChange:e=>setSearch(e.target.value)})),
          h('div',{className:'field'},h('label',null,'Guest *'),h('select',{required:true,value:f.patient_id,onChange:e=>setF(v=>({...v,patient_id:e.target.value}))},h('option',{value:''},'Select Guest'),guests.map(p=>h('option',{key:p.id,value:p.id},pLabel(p.id))))),
          h('div',{className:'field'},h('label',null,'Item *'),h('select',{required:true,value:f.store_item_id,onChange:e=>setF(v=>({...v,store_item_id:e.target.value}))},h('option',{value:''},'Select item'),avail.map(i=>h('option',{key:i.store_item_id,value:i.store_item_id},showQty?`${i.item_name} · ${qty(i.night_balance,i.unit)} in cupboard`:i.item_name)))),
          h('div',{className:'field'},h('label',null,`Quantity${it?` (${it.unit}${showQty?`, up to ${n(it.night_balance)}`:''})`:''} *`),h('input',{type:'number',min:1,step:1,required:true,value:f.qty,onChange:e=>setF(v=>({...v,qty:e.target.value}))}))),
        h('div',{className:'field'},h('label',null,late?'Why was it not entered during that shift? *':'Note (optional)'),h('textarea',{rows:2,value:f.note,onChange:e=>setF(v=>({...v,note:e.target.value}))})),
        h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Record Use'))));
  }
  // 2.20.54: one screen — full Consumables / Pharmacy list (S.No, A–Z), type a quantity against any items, Save once.
  // A new item's first quantity becomes its usual level; "Fill up to usual levels" pre-fills last night's use.
  function NsAddItems({ctx}){
    const {acc,listItems,toVerify,pending,n,qty,pill,btn,table,post,setError,setTab,verified,data,busy}=ctx;
    const [q,setQ]=React.useState({}),[search,setSearch]=React.useState(''),[cat,setCat]=React.useState('All'),[note,setNote]=React.useState('');
    if(!acc.manage)return h(Section,{title:'Add items to Ward Stock'},h('p',null,'The Nursing Manager (or her Stores leave cover) adds items to Ward Stock.'));
    const blocked=toVerify&&!verified(toVerify.status);
    const all=(data.items||[]).slice().sort((a,b)=>a.item_name.localeCompare(b.item_name,undefined,{sensitivity:'base'}));
    const sq=search.trim().toLowerCase();
    const rows=all.filter(i=>(cat==='All'||i.category===cat)&&(!sq||`${i.item_name} ${i.item_code||''}`.toLowerCase().includes(sq)));
    const fill=()=>{const v={};listItems.filter(i=>i.active).forEach(i=>{const g=Math.min(Math.max(0,n(i.par_qty)-n(i.night_balance)),Math.max(0,n(i.central_balance)));if(g>0)v[i.store_item_id]=String(g)});setQ(v);setError(Object.keys(v).length?'':'Ward Stock is already at its usual levels.')};
    const chosen=Object.entries(q).map(([id,v])=>({store_item_id:id,qty:Number(v||0)})).filter(x=>x.qty>0);
    const save=async()=>{
      const bad=chosen.find(x=>{const i=all.find(z=>z.store_item_id===x.store_item_id);return !Number.isInteger(x.qty)||x.qty>n(i?.central_balance)});
      if(!chosen.length){setError('Type a quantity against at least one item.');return}
      if(bad){const i=all.find(z=>z.store_item_id===bad.store_item_id);setError(`${i?.item_name}: enter a whole number up to ${n(i?.central_balance)} (Main Store balance).`);return}
      if(await post('topup',{items:chosen,note},'Added to Ward Stock',`${chosen.length} item${chosen.length===1?'':'s'} moved from the Main Store to Ward Stock.`)){setQ({});setNote('');setTab('home')}};
    const field=(label,el)=>h('div',{className:'field',style:{marginBottom:0}},h('label',null,label),el);
    return h(Section,{title:'➕ Add items to Ward Stock',subtitle:'Type the quantity against the items you are keeping in the Ward Stock cupboard, then tap Save. Quantities move from the Main Store to Ward Stock.'},
      blocked&&h('p',{className:'message error',role:'status'},`${pending.length} ended shift${pending.length===1?' is':'s are'} waiting for Morning Verification. Verify first, then add items.`),
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'flex-end',marginBottom:'10px'}},
        field('Search item',h('input',{value:search,placeholder:'Item name or code',onChange:e=>setSearch(e.target.value)})),
        field('Show',h('select',{value:cat,onChange:e=>setCat(e.target.value)},['All','Consumables','Pharmacy'].map(c=>h('option',{key:c,value:c},c==='All'?'All (Consumables + Pharmacy)':c)))),
        listItems.length>0&&btn('Fill up to usual levels',fill,false,blocked)),
      table(['S.No','Item','Category','In Main Store','In Ward Stock now','Add qty'],rows.map((i,k)=>{const low=n(i.central_balance)<=0;return [k+1,
        h('span',null,h('b',null,i.item_name),i.in_list&&i.active&&h('span',{style:{marginLeft:'6px'}},pill('In Ward Stock'))),i.category||'',
        h('span',{style:low?{color:'#b42318',fontWeight:800}:undefined},qty(i.central_balance,i.unit)),i.in_list?qty(i.night_balance,i.unit):'—',
        h('input',{type:'number',min:0,step:1,max:n(i.central_balance),disabled:blocked||low,inputMode:'numeric',style:{maxWidth:'90px'},value:q[i.store_item_id]??'','aria-label':`Add quantity of ${i.item_name}`,onChange:e=>setQ(v=>({...v,[i.store_item_id]:e.target.value}))})]})),
      h('div',{className:'field',style:{marginTop:'10px'}},h('label',null,'Note (optional)'),h('input',{value:note,onChange:e=>setNote(e.target.value)})),
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},btn(busy?'Saving…':`Save${chosen.length?` (${chosen.length} item${chosen.length===1?'':'s'})`:''}`,save,true,blocked||!chosen.length),
        chosen.length>0&&btn('Clear',()=>setQ({}))));
  }

  // 2.20.54: what is in the cupboard; Nursing Manager can change an item's usual level, return it to the Main Store or remove it.
  function NsStockNow({ctx}){
    const {acc,listItems,n,qty,pill,btn,table,post,setError,cur,curShift,shiftLabel}=ctx;
    const [edit,setEdit]=React.useState(null);
    const rows=listItems.slice().sort((a,b)=>a.item_name.localeCompare(b.item_name,undefined,{sensitivity:'base'}));
    const short=i=>Math.max(0,n(i.par_qty)-n(i.night_balance));
    const saveLevel=async()=>{const v=Number(edit.level);if(!Number.isInteger(v)||v<=0){setError('Usual level must be a whole number above 0.');return}if(await post('set_list',{items:[{store_item_id:edit.item.store_item_id,active:true,par_qty:v}]},'Usual level changed',`${edit.item.item_name}: ${v} ${edit.item.unit}`))setEdit(null)};
    const giveBack=async()=>{const v=Number(edit.ret);if(!Number.isInteger(v)||v<=0||v>n(edit.item.night_balance)){setError(`Return a whole number up to ${n(edit.item.night_balance)}.`);return}if(edit.reason.trim().length<3){setError('Enter the reason for returning.');return}if(await post('return_to_store',{items:[{store_item_id:edit.item.store_item_id,qty:v}],note:edit.reason},'Returned to the Main Store',`${v} ${edit.item.unit} ${edit.item.item_name}`))setEdit(null)};
    const remove=async()=>{if(await post('set_list',{items:[{store_item_id:edit.item.store_item_id,active:false,par_qty:n(edit.item.par_qty)||1}]},'Removed from Ward Stock',edit.item.item_name))setEdit(null)};
    return h(Section,{title:'Ward Stock now',actions:btn('🖨️ Print / PDF',()=>nsPrintWardStock({rows:acc.manage?rows:rows.filter(i=>i.active),showQty:Boolean(acc.manage),shiftText:shiftLabel(cur,curShift).replace(/^\S+ /,''),who:acc.name||''}),true,!rows.length),subtitle:acc.manage?'What should be in the Ward Stock cupboard now (A–Z).':'Items kept in the Ward Stock cupboard (A–Z). Quantities are counted at the opening and closing counts.'},
      !acc.manage?table(['S.No','Item','Unit'],rows.filter(i=>i.active).map((i,k)=>[k+1,h('b',null,i.item_name),i.unit])):
      table(['S.No','Item','Usual level','In cupboard','Short',...(acc.manage?['']:[])],rows.map((i,k)=>[k+1,h('b',null,i.item_name),i.active?qty(i.par_qty,i.unit):pill('Removed — return balance'),qty(i.night_balance,i.unit),
        i.active&&short(i)?pill(qty(short(i),i.unit),'bad'):pill('Full','good'),...(acc.manage?[btn('Edit / Remove',()=>{setError('');setEdit({item:i,level:String(n(i.par_qty)||''),ret:'',reason:''})})]:[])])),
      edit&&h('div',{className:'modal-backdrop'},h('div',{className:'card modal',role:'dialog','aria-modal':true},
        h('h3',null,edit.item.item_name),h('p',{className:'small-note'},`In cupboard: ${qty(edit.item.night_balance,edit.item.unit)}`),
        h('div',{className:'field'},h('label',null,'Usual level (kept in the cupboard)'),h('input',{type:'number',min:1,step:1,value:edit.level,onChange:e=>setEdit(v=>({...v,level:e.target.value}))})),
        btn('Save level',saveLevel,true),
        n(edit.item.night_balance)>0&&h('div',{style:{marginTop:'14px'}},h('h4',null,'Return to the Main Store'),
          h('div',{className:'grid two'},h('div',{className:'field'},h('label',null,'Quantity'),h('input',{type:'number',min:1,step:1,max:n(edit.item.night_balance),value:edit.ret,onChange:e=>setEdit(v=>({...v,ret:e.target.value}))})),
            h('div',{className:'field'},h('label',null,'Reason *'),h('input',{value:edit.reason,placeholder:'e.g. close to expiry',onChange:e=>setEdit(v=>({...v,reason:e.target.value}))}))),
          btn('Return to Main Store',giveBack)),
        h('div',{style:{marginTop:'14px',display:'flex',gap:'8px',flexWrap:'wrap'}},
          n(edit.item.night_balance)===0?btn('Remove from Ward Stock',remove):h('small',null,'To remove this item, first return all of it to the Main Store.'),
          btn('Close',()=>setEdit(null))))));
  }

  function NsRegister({ctx}){
    const {acc,cur,listItems,n,qty,pill,btn,table,when,itemById,pLabel,data,addDays,statusTone,openShift,setDetail,shiftLabel}=ctx;
    const today=todayISOIndia();
    const [period,setPeriod]=React.useState('week'),[month,setMonth]=React.useState(today.slice(0,7)),[from,setFrom]=React.useState(addDays(today,-6)),[to,setTo]=React.useState(today);
    const [guest,setGuest]=React.useState(''),[search,setSearch]=React.useState(''),[item,setItem]=React.useState(''),[view,setView]=React.useState('shifts');
    const filters=useAppliedFilters({period,month,from,to,guest,item});const fa=filters.applied;
    let start=fa.from,end=fa.to;
    if(fa.period==='today'){start=end=cur}
    if(fa.period==='week'){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));start=d.toISOString().slice(0,10);end=today}
    if(fa.period==='month'){start=fa.month+'-01';const d=new Date(start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);end=d.toISOString().slice(0,10)}
    const valid=/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=end;
    const nights=valid?(data.shifts||[]).filter(x=>x.night_date>=start&&x.night_date<=end):[];
    const moves=valid?(data.ledger||[]).filter(x=>x.night_date>=start&&x.night_date<=end&&(!fa.guest||x.patient_id===fa.guest)&&(!fa.item||x.store_item_id===fa.item)):[];
    const gq=search.trim().toLowerCase(),guestIds=[...new Set((data.ledger||[]).map(x=>x.patient_id).filter(Boolean))];
    const guestOpts=guestIds.filter(id=>gq.length<3||pLabel(id).toLowerCase().includes(gq)).sort((a,b)=>pLabel(a).localeCompare(pLabel(b)));
    const usedTotals={};moves.filter(m=>m.movement==='Use').forEach(m=>{const i=itemById(m.store_item_id);const k=i?.unit||'Nos';usedTotals[k]=(usedTotals[k]||0)-n(m.qty)});
    const field=(label,el)=>h('div',{className:'field',style:{marginBottom:0}},h('label',null,label),el);
    return h(Section,{title:'Ward Stock Register',subtitle:'Tap a shift for its counts and movements.'},
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'flex-end',marginBottom:'10px'}},
        field('Show',h('select',{value:view,onChange:e=>setView(e.target.value)},h('option',{value:'movements'},'Movements (use, top-up, adjustments)'),h('option',{value:'shifts'},'Shifts'))),
        field('Period',h('select',{value:period,onChange:e=>setPeriod(e.target.value)},h('option',{value:'month'},'Month'),h('option',{value:'range'},'Period (From–To)'),h('option',{value:'week'},'This Week'),h('option',{value:'today'},'Today'))),
        period==='month'&&field('Month',h('input',{type:'month',value:month,onChange:e=>setMonth(e.target.value)})),
        period==='range'&&field('From',h(StrictDateInput,{value:from,max:to,onChange:e=>setFrom(e.target.value)})),
        period==='range'&&field('To',h(StrictDateInput,{value:to,min:from,onChange:e=>setTo(e.target.value)})),
        view==='movements'&&field('Search Guest / ID',h('input',{value:search,placeholder:'At least 3 characters',onChange:e=>setSearch(e.target.value)})),
        view==='movements'&&field('Guest',h('select',{value:guest,onChange:e=>setGuest(e.target.value)},h('option',{value:''},'All Guests'),guestOpts.map(id=>h('option',{key:id,value:id},pLabel(id))))),
        view==='movements'&&field('Item',h('select',{value:item,onChange:e=>setItem(e.target.value)},h('option',{value:''},'All items'),listItems.map(i=>h('option',{key:i.store_item_id,value:i.store_item_id},i.item_name)))),
        h(ApplyFilterButton,{dirty:filters.dirty,onApply:filters.apply})),
      !valid&&h('p',{role:'alert',className:'message error'},'Enter a valid date range; From must not be after To.'),
      valid&&h('p',{className:'small-note'},`${formatDateIN(start)} to ${formatDateIN(end)} (a Night shift is dated by the day it starts). Used for Guests: ${Object.entries(usedTotals).map(([u,v])=>`${v} ${u}`).join(' · ')||'none'}.`),
      valid&&view==='shifts'&&table(['Shift','Status','Accepted','Closing count','Verified','Use entries'],nights.map(x=>[shiftLabel(x.night_date,x.shift||'Night'),pill(x.status,statusTone(x.status)),x.accepted_by_name?`${x.accepted_by_name} · ${when(x.accepted_at)}${x.accept_discrepancy?' ⚠':''}`:'—',x.closed_by_name?`${x.closed_by_name} · ${when(x.closed_at)}${x.close_discrepancy?' ⚠':''}`:'Not done',x.verified_by_name?`${x.verified_by_name} (${x.verifier_as||''}) · ${when(x.verified_at)}`:'—',(data.ledger||[]).filter(m=>m.night_date===x.night_date&&(m.shift||'Night')===(x.shift||'Night')&&m.movement==='Use').length]),i=>openShift(nights[i].night_date,nights[i].shift||'Night')),
      valid&&view==='movements'&&table(['Shift','Time','Movement','Item','Qty','Guest','By','Note'],moves.map(m=>{const i=itemById(m.store_item_id);return [shiftLabel(m.night_date,m.shift||'Night'),when(m.created_at),m.movement+(m.late_entry?' (late)':''),i?.item_name||'Item',h('b',{style:{color:n(m.qty)<0?'#b42318':'#127a4b'}},`${n(m.qty)>0?'+':''}${n(m.qty)} ${i?.unit||''}`),m.patient_id?pLabel(m.patient_id):'—',m.actor_name||'',m.remarks||'']}),i=>setDetail({title:`${moves[i].movement} · ${itemById(moves[i].store_item_id)?.item_name||''}`,fields:[['Shift',shiftLabel(moves[i].night_date,moves[i].shift||'Night')],['Recorded',when(moves[i].created_at)],['Quantity',String(moves[i].qty)],['Guest',moves[i].patient_id?pLabel(moves[i].patient_id):''],['By',moves[i].actor_name],['Late entry',moves[i].late_entry?'Yes':''],['Note',moves[i].remarks]]})));
  }
