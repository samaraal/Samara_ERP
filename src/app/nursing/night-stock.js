  // 2.20.53: Night Stock (SQL 387) — Nursing → Night Stock.
  // The Nursing Manager (store keeper) is not on duty at night. A locked cupboard at the nurses' station holds
  // a fixed list of Consumables / Pharmacy items at set levels.
  //   Evening : Nursing Manager (or her Stores leave cover / Admin) tops it up from the Main Store.
  //   19:00   : night nurse counts and accepts (opening count).
  //   Night   : night nurse records use for a Guest → a Guest indent already "Received" is created, so the item
  //             is charged in Bills & Charges exactly like a day indent (Stores is not reduced a second time).
  //   07:00   : night nurse closing count.
  //   Morning : Nursing Manager verifies — or, when she is not on Day duty today, the Day-shift duty nurse.
  // Counts are entered without seeing the ERP figure; differences are shown after "Check".
  function NightStock({profile,onNavigate}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [tab,setTab]=React.useState('home'),[detail,setDetail]=React.useState(null);
    const [patients]=usePatients();
    const lock=React.useRef(false),token=React.useRef(null);
    const [focus,clearFocus]=useRecordFocus('Night Stock');
    const load=React.useCallback(async()=>{const r=await client.rpc('night_stock_workspace');if(r.error){setError(r.error.message);return}setData(r.data);setError('')},[]);
    React.useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t)},[load]);
    React.useEffect(()=>{if(focus)setTab('home')},[focus]);
    const toast=(ok,title,text)=>showSamaraActionToast(ok?'success':'error',title,text);
    async function post(action,payload,okTitle,okText){
      if(lock.current)return null;lock.current=true;setBusy(true);setError('');
      const sig=JSON.stringify({action,payload});if(token.current?.sig!==sig)token.current={sig,id:crypto.randomUUID()};
      try{const r=await client.rpc('night_stock_post',{p_id:token.current.id,p_action:action,p_data:payload});if(r.error)throw r.error;token.current=null;await load();toast(true,okTitle,okText);return r.data||{};}
      catch(e){setError(e.message);toast(false,'Night Stock',e.message);return null}
      finally{lock.current=false;setBusy(false)}
    }
    if(!data)return h(Section,{title:'Night Stock'},h('p',{role:'status'},error||'Loading Night Stock…'),error&&/night_stock_workspace|function/i.test(error)&&h('p',null,'Apply SQL 387 in Supabase before using this page.'));

    const acc=data.access||{},cur=data.current_night,isNight=Boolean(data.is_night);
    const n=v=>Number(v||0),qty=(v,u)=>`${n(v)} ${u||''}`.trim();
    const night=d=>(data.nights||[]).find(x=>x.night_date===d);
    const addDays=(d,k)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+k);return x.toISOString().slice(0,10)};
    const prevNight=addDays(cur,-1);
    const verified=s=>['Verified','Verified – Discrepancy'].includes(s);
    const listItems=(data.items||[]).filter(i=>i.in_list&&(i.active||n(i.night_balance)!==0)).sort((a,b)=>a.item_name.localeCompare(b.item_name));
    const itemById=id=>(data.items||[]).find(i=>i.store_item_id===id);
    const tonight=night(cur),lastNight=night(prevNight);
    // the night the morning verifier / late entry works on: the latest unverified night before tonight
    const toVerify=(data.nights||[]).filter(x=>x.night_date<cur&&!verified(x.status)).sort((a,b)=>a.night_date.localeCompare(b.night_date))[0]||null;
    const lateNight=!isNight&&lastNight&&!verified(lastNight.status)?lastNight:null;
    const pLabel=id=>{const p=patients.find(x=>x.id===id);return p?`${formalName(p)||p.full_name} · ${p.patient_id||''}${p.room_no?` · Room ${p.room_no}-${p.bed_no||''}`:''}`:'Guest'};
    const when=v=>v?formatDateTimeIN(v):'';
    const pill=(t,tone)=>h('span',{style:{display:'inline-block',padding:'4px 9px',borderRadius:'999px',fontWeight:800,fontSize:'12px',background:tone==='good'?'#e7f6ef':tone==='bad'?'#fdebec':tone==='blue'?'#eaf2ff':'#fff4dc',color:'#5d3146'}},t);
    const statusTone=s=>s==='Verified'?'good':s==='Verified – Discrepancy'||s==='Returned'?'bad':s==='Closed'?'blue':'';
    const btn=(text,onClick,primary=false,disabled=false)=>h('button',{type:'button',className:'btn '+(primary?'btn-primary':'btn-secondary'),disabled:busy||disabled,onClick},text);
    const table=(heads,rows,onRow)=>h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),
      h('tbody',null,rows.length?rows.map((r,i)=>h('tr',{key:i,className:onRow?'row-clickable':undefined,style:onRow?{cursor:'pointer'}:undefined,onClick:onRow?e=>{if(e.target.closest&&e.target.closest('button,input,select,textarea,a'))return;onRow(i)}:undefined},r.map((c,j)=>h('td',{key:j,style:{whiteSpace:'normal'}},c)))):h('tr',null,h('td',{colSpan:heads.length,style:{textAlign:'center',padding:'18px'}},'Nothing to show.')))));

    // ---------- status line ----------
    const statusText=(()=>{
      if(!listItems.length)return acc.manage?'Night Stock is not set up yet. Open "Item List & Levels" to choose the items and their set levels.':'Night Stock is not set up yet. The Nursing Manager chooses the items and levels.';
      if(isNight){if(!tonight?.accepted_at)return 'Night shift: count the cupboard and tap Accept (opening count) before using any item.';if(tonight.status==='Closed')return `Closing count done by ${tonight.closed_by_name}.`;return `Accepted by ${tonight.accepted_by_name} at ${when(tonight.accepted_at)}. Record every item you use for a Guest.`;}
      if(toVerify)return `Night of ${formatDateIN(toVerify.night_date)} — ${toVerify.status==='Returned'?'returned to the night nurse to enter missed Guest use':toVerify.closed_at?'closing count done, waiting for morning verification':'NOT closed by the night nurse, waiting for morning verification'}.`;
      return 'Last night is verified. Top up the cupboard before 19:00.';
    })();





    function openNight(d){
      const x=night(d)||{night_date:d,status:'—'};const counts=(data.counts||[]).filter(c=>c.night_date===d),moves=(data.ledger||[]).filter(m=>m.night_date===d);
      const ids=[...new Set([...counts.map(c=>c.store_item_id),...moves.map(m=>m.store_item_id)])];
      const c=(id,k)=>{const r=counts.find(z=>z.store_item_id===id&&z.kind===k);return r?(n(r.counted_qty)===n(r.expected_qty)?String(n(r.counted_qty)):`${n(r.counted_qty)} (ERP ${n(r.expected_qty)})`):'—'};
      setDetail({title:`Night of ${formatDateIN(d)} · ${x.status}`,fields:[['Accepted by',[x.accepted_by_name,when(x.accepted_at)].filter(Boolean).join(' · ')],['Opening note',x.accept_note],['Closing count by',[x.closed_by_name,when(x.closed_at)].filter(Boolean).join(' · ')],['Closing note',x.close_note],['Returned by',[x.returned_by_name,when(x.returned_at)].filter(Boolean).join(' · ')],['Return note',x.return_note],['Verified by',[x.verified_by_name,x.verifier_as,when(x.verified_at)].filter(Boolean).join(' · ')],['Verification note',x.verify_note]],
        children:h('div',null,h('h4',null,'Counts'),table(['Item','Opening','Closing','Verified'],ids.map(id=>[itemById(id)?.item_name||'Item',c(id,'Opening'),c(id,'Closing'),c(id,'Verify')])),
          h('h4',null,'Movements'),table(['Time','Movement','Item','Qty','Guest','By'],moves.map(m=>[when(m.created_at),m.movement+(m.late_entry?' (late)':''),itemById(m.store_item_id)?.item_name||'',`${n(m.qty)>0?'+':''}${n(m.qty)}`,m.patient_id?pLabel(m.patient_id):'—',m.actor_name||''])))});
    }

    const ctx={acc,cur,isNight,listItems,toVerify,prevNight,n,qty,pill,btn,table,post,setError,setTab,when,verified,itemById,patients,pLabel,lateNight,tonight,onNavigate,busy,data,addDays,night,statusTone,openNight,setDetail};
    const usedTonight=(data.ledger||[]).filter(m=>m.night_date===(isNight?cur:prevNight)&&m.movement==='Use').length;
    const boxes=[
      ['Night Stock now',`${listItems.length} item${listItems.length===1?'':'s'}`,'stock',true],
      ['Use for a Guest',isNight?`${usedTonight} entr${usedTonight===1?'y':'ies'} tonight`:lateNight?'Late entry only':'Night shift only','use',acc.nurse],
      ['Opening Count / Accept',tonight?.accepted_at?`Done · ${tonight.accepted_by_name}`:isNight?'Due now':'From 18:00','accept',acc.nurse],
      ['Closing Count',tonight?.closed_at&&isNight?'Done':(!isNight&&lastNight&&!lastNight.closed_at&&!verified(lastNight.status))?'Not done!':isNight?'Before 07:00':'—','close',acc.nurse],
      ['Morning Verification',toVerify?(toVerify.status==='Returned'?'Returned to nurse':'Waiting'):'Up to date','verify',true],
      ['Top-up',acc.manage?'Before 19:00':'Nursing Manager','topup',acc.manage],
      ['Item List & Levels',`${listItems.filter(i=>i.active).length} items`,'list',true],
      ['Register','Nights & movements','register',true]
    ].filter(b=>b[3]);
    return h('div',{className:'night-stock'},
      detail&&h(RowDetailModal,{title:detail.title,subtitle:detail.subtitle,fields:detail.fields,onClose:()=>setDetail(null)},detail.children),
      h('div',{className:'card panel dr-head'},h('div',{className:'dr-head-text'},h('h2',null,'🌙 Night Stock'),h('small',null,'Evening top-up by the Nursing Manager → 19:00 opening count → night use for Guests → 07:00 closing count → morning verification.')),
        h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},tab!=='home'&&btn('← Back',()=>{setTab('home');setError('')}),btn('Refresh',load))),
      error&&h('p',{className:'message error',role:'alert'},error),
      h('p',{className:'message',role:'status'},statusText,acc.verify_as&&toVerify&&!isNight?` You can verify as: ${acc.verify_as}.`:''),
      focus&&h('p',{className:'message',role:'status'},'Opened from an alert. ',btn('OK',clearFocus)),
      tab==='home'&&h('div',{className:'dr-boxes'},boxes.map(([label,value,key])=>h('button',{key,type:'button',className:'dr-box',onClick:()=>{setError('');setTab(key)}},h('span',{className:'dr-box-label'},label),h('b',{className:'dr-box-value',style:/Not done|Due now|Waiting|Returned/.test(value)?{color:'#b42318'}:undefined},value)))),
      tab==='stock'&&h(Section,{title:'Night Stock now'},table(['Item','Set level','In cupboard','Short of level'],listItems.map(i=>[h('b',null,i.item_name),qty(i.par_qty,i.unit),qty(i.night_balance,i.unit),Math.max(0,n(i.par_qty)-n(i.night_balance))?pill(qty(Math.max(0,n(i.par_qty)-n(i.night_balance)),i.unit),'bad'):pill('Full','good')]))),
      tab==='use'&&h(NsUseForm,{ctx}),
      tab==='accept'&&h(NsCountForm,{ctx,kind:'accept'}),
      tab==='close'&&h(NsCountForm,{ctx,kind:'close'}),
      tab==='verify'&&h(NsCountForm,{ctx,kind:'verify'}),
      tab==='topup'&&h(NsTopUp,{ctx}),
      tab==='list'&&h(NsItemList,{ctx}),
      tab==='register'&&h(NsRegister,{ctx}));
  }
  function NsCountForm({ctx,kind}){
  const {acc,cur,isNight,listItems,toVerify,prevNight,n,qty,pill,btn,table,post,setError,setTab,when,verified,itemById,patients,pLabel,lateNight,tonight,onNavigate,busy,data,addDays,night,statusTone,openNight,setDetail}=ctx;
    const [counts,setCounts]=React.useState({}),[checked,setChecked]=React.useState(false),[note,setNote]=React.useState('');
    const target=kind==='verify'?toVerify:null;
    const diffs=listItems.filter(i=>counts[i.store_item_id]!==undefined&&counts[i.store_item_id]!==''&&n(counts[i.store_item_id])!==n(i.night_balance));
    const complete=listItems.every(i=>counts[i.store_item_id]!==undefined&&counts[i.store_item_id]!==''&&Number.isInteger(Number(counts[i.store_item_id]))&&Number(counts[i.store_item_id])>=0);
    const payload=()=>({night_date:target?.night_date,note,counts:listItems.map(i=>({store_item_id:i.store_item_id,counted:Number(counts[i.store_item_id])}))});
    const titles={accept:['Opening Count — Accept Night Stock','Count each item in the cupboard and type the number you see. Then tap Check.'],close:['Closing Count',isNight?'Before 07:00, count each item in the cupboard. Then tap Check.':`Late closing count for the night of ${formatDateIN(prevNight)}.`],verify:['Morning Verification',target?`Night of ${formatDateIN(target.night_date)} · ${target.closed_at?`closing count by ${target.closed_by_name} at ${when(target.closed_at)}`:'the night nurse did NOT do the closing count'}${target.close_note?` · note: ${target.close_note}`:''}`:'No night is waiting for verification.']};
    if(kind==='verify'&&!target)return h(Section,{title:titles.verify[0]},h('p',null,'No night is waiting for verification.'));
    if(kind==='verify'&&!acc.verify)return h(Section,{title:titles.verify[0]},h('p',null,acc.nm_on_day_duty?'The Nursing Manager is on Day duty today — she verifies the Night Stock.':'Only the Nursing Manager verifies — or, when she is not on Day duty today, the Day-shift duty nurse.'));
    if(kind!=='verify'&&!acc.nurse)return h(Section,{title:titles[kind][0]},h('p',null,'The night nurse does this count from her Nurse login.'));
    const save=async()=>{const r=await post(kind,payload(),kind==='accept'?'Night Stock accepted':kind==='close'?'Closing count saved':'Night Stock verified',diffs.length?'Saved with differences — the note goes to the Nursing Manager.':'All counts match the ERP.');if(r){setCounts({});setChecked(false);setNote('');setTab('home')}};
    const sendBack=async()=>{if(note.trim().length<3){setError('Tell the night nurse what to check.');return}const r=await post('return_to_nurse',{night_date:target.night_date,note},'Returned to the night nurse','She can now enter the missed Guest use for that night.');if(r){setTab('home')}};
    return h(Section,{title:titles[kind][0],subtitle:titles[kind][1]},
      table(['Item','Unit','Your count',...(checked?['ERP balance','Difference']:[])],listItems.map(i=>{const c=counts[i.store_item_id]??'',d=c===''?null:n(c)-n(i.night_balance);return [h('b',null,i.item_name),i.unit,
        h('input',{type:'number',min:0,step:1,inputMode:'numeric',style:{maxWidth:'110px'},value:c,'aria-label':`Count of ${i.item_name}`,onChange:e=>{setChecked(false);setCounts(v=>({...v,[i.store_item_id]:e.target.value}))}}),
        ...(checked?[qty(i.night_balance),d===0?pill('Matches','good'):pill(`${d>0?'+':''}${d} ${i.unit}`,'bad')]:[])]})),
      !checked&&h('div',{style:{marginTop:'10px'}},btn('Check',()=>{if(!complete){setError('Enter a whole-number count for every item (0 if none).');return}setError('');setChecked(true)},true)),
      checked&&h('div',{style:{marginTop:'10px'}},
        diffs.length?h('p',{className:'message error',role:'status'},`${diffs.length} item${diffs.length===1?'':'s'} differ from the ERP.${kind==='verify'?' If a Guest use was not entered, Return to the night nurse. Otherwise save with the reason — the difference is written off as a Count Adjustment.':kind==='close'?' If you used an item for a Guest and did not enter it, go back and record it first (Use for a Guest).':' Recount; if it is still different, explain in the note.'}`):h('p',{className:'message',role:'status'},'All counts match the ERP.'),
        h('div',{className:'field'},h('label',null,diffs.length?'Reason / note *':'Note (optional)'),h('textarea',{rows:2,value:note,onChange:e=>setNote(e.target.value)})),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          btn(kind==='accept'?'Accept Night Stock':kind==='close'?'Save Closing Count':diffs.length?'Verify with Difference':'Verify — All OK',()=>{if(diffs.length&&note.trim().length<3){setError('Enter the reason for the difference.');return}save()},true),
          kind==='verify'&&diffs.length>0&&btn('Return to Night Nurse',sendBack),
          btn('Change counts',()=>setChecked(false)))));
  }
  function NsUseForm({ctx}){
  const {acc,cur,isNight,listItems,toVerify,prevNight,n,qty,pill,btn,table,post,setError,setTab,when,verified,itemById,patients,pLabel,lateNight,tonight,onNavigate,busy,data,addDays,night,statusTone,openNight,setDetail}=ctx;
    const late=!isNight;
    const [f,setF]=React.useState({patient_id:'',store_item_id:'',qty:'1',note:''}),[search,setSearch]=React.useState(''),[done,setDone]=React.useState(null);
    if(!acc.nurse)return h(Section,{title:'Use for a Guest'},h('p',null,'Night nurses record use from their Nurse login.'));
    if(late&&!lateNight)return h(Section,{title:'Use for a Guest'},h('p',null,'Night Stock is used only on the night shift (19:00–07:00). Day-shift items go through Raise Indent.'));
    const q=search.trim().toLowerCase();
    const guests=patients.filter(p=>p.is_active!==false).filter(p=>q.length<3||pLabel(p.id).toLowerCase().includes(q)).sort((a,b)=>pLabel(a.id).localeCompare(pLabel(b.id)));
    const avail=listItems.filter(i=>n(i.night_balance)>0);
    const it=itemById(f.store_item_id);
    const save=async e=>{e.preventDefault();const k=Number(f.qty);if(!f.patient_id||!f.store_item_id){setError('Select the Guest and the item.');return}if(!Number.isInteger(k)||k<=0||k>n(it?.night_balance)){setError(`Enter a whole number from 1 to ${n(it?.night_balance)}.`);return}if(late&&f.note.trim().length<3){setError('Late entry: say why it was not entered during the night.');return}
      const r=await post('use',{patient_id:f.patient_id,store_item_id:f.store_item_id,qty:k,note:f.note,night_date:late?lateNight.night_date:cur},'Night Stock use recorded',`${k} ${it.unit} ${it.item_name} for ${pLabel(f.patient_id)}. Now raise the charge in Bills & Charges.`);
      if(r){setDone({patient_id:f.patient_id,item:it.item_name,qty:k,unit:it.unit});setF({patient_id:f.patient_id,store_item_id:'',qty:'1',note:''})}};
    return h(Section,{title:late?`Use for a Guest — late entry (night of ${formatDateIN(lateNight.night_date)})`:'Use for a Guest',subtitle:'Takes the item out of the Night Stock cupboard and gives it to the Guest as a received indent. Charge it in Bills & Charges as usual.'},
      !tonight?.accepted_at&&!late&&h('p',{className:'message error',role:'status'},'Night Stock is not accepted yet tonight — please do the opening count first.'),
      done&&h('div',{className:'message',role:'status'},`Recorded: ${done.qty} ${done.unit} ${done.item} for ${pLabel(done.patient_id)}. `,onNavigate&&btn('Raise charge in Bills & Charges',()=>onNavigate('Charge Approvals'),true)),
      h('form',{onSubmit:save},h('fieldset',{disabled:busy,style:{border:0,padding:0}},
        h('div',{className:'grid two'},
          h('div',{className:'field'},h('label',null,'Search Guest / ID'),h('input',{value:search,placeholder:'At least 3 characters',onChange:e=>setSearch(e.target.value)})),
          h('div',{className:'field'},h('label',null,'Guest *'),h('select',{required:true,value:f.patient_id,onChange:e=>setF(v=>({...v,patient_id:e.target.value}))},h('option',{value:''},'Select Guest'),guests.map(p=>h('option',{key:p.id,value:p.id},pLabel(p.id))))),
          h('div',{className:'field'},h('label',null,'Item *'),h('select',{required:true,value:f.store_item_id,onChange:e=>setF(v=>({...v,store_item_id:e.target.value}))},h('option',{value:''},'Select item'),avail.map(i=>h('option',{key:i.store_item_id,value:i.store_item_id},`${i.item_name} · ${qty(i.night_balance,i.unit)} in cupboard`)))),
          h('div',{className:'field'},h('label',null,`Quantity${it?` (${it.unit}, up to ${n(it.night_balance)})`:''} *`),h('input',{type:'number',min:1,step:1,required:true,value:f.qty,onChange:e=>setF(v=>({...v,qty:e.target.value}))}))),
        h('div',{className:'field'},h('label',null,late?'Why was it not entered during the night? *':'Note (optional)'),h('textarea',{rows:2,value:f.note,onChange:e=>setF(v=>({...v,note:e.target.value}))})),
        h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Record Use'))));
  }
  function NsTopUp({ctx}){
  const {acc,cur,isNight,listItems,toVerify,prevNight,n,qty,pill,btn,table,post,setError,setTab,when,verified,itemById,patients,pLabel,lateNight,tonight,onNavigate,busy,data,addDays,night,statusTone,openNight,setDetail}=ctx;
    const gap=i=>Math.max(0,n(i.par_qty)-n(i.night_balance));
    const [q,setQ]=React.useState(()=>Object.fromEntries(listItems.filter(i=>i.active).map(i=>[i.store_item_id,String(Math.min(gap(i),Math.max(0,n(i.central_balance))))])));
    const [ret,setRet]=React.useState({}),[note,setNote]=React.useState(''),[retNote,setRetNote]=React.useState('');
    if(!acc.manage)return h(Section,{title:'Top-up'},h('p',null,'The Nursing Manager (or her Stores leave cover) tops up the Night Stock.'));
    const blocked=toVerify&&!verified(toVerify.status);
    return h(React.Fragment,null,
      h(Section,{title:'Top-up from the Main Store',subtitle:'Suggested quantity = set level − what is in the cupboard. Issued from the Main Store as "Night Stock top-up".'},
        blocked&&h('p',{className:'message error',role:'status'},`Verify the night of ${formatDateIN(toVerify.night_date)} first, then top up.`),
        table(['Item','Set level','In cupboard','Main Store','Top-up now'],listItems.filter(i=>i.active).map(i=>[h('b',null,i.item_name),qty(i.par_qty,i.unit),qty(i.night_balance,i.unit),h('span',{style:n(i.central_balance)<gap(i)?{color:'#b42318',fontWeight:800}:undefined},qty(i.central_balance,i.unit)),
          h('input',{type:'number',min:0,step:1,style:{maxWidth:'100px'},value:q[i.store_item_id]??'',onChange:e=>setQ(v=>({...v,[i.store_item_id]:e.target.value}))})])),
        h('div',{className:'field'},h('label',null,'Note (optional)'),h('input',{value:note,onChange:e=>setNote(e.target.value)})),
        btn('Issue to Night Stock',async()=>{const items=Object.entries(q).map(([id,v])=>({store_item_id:id,qty:Number(v||0)})).filter(x=>x.qty>0);if(!items.length){setError('Nothing to top up.');return}if(await post('topup',{items,note},'Night Stock topped up',`${items.length} item${items.length===1?'':'s'} issued from the Main Store.`))setTab('home')},true,blocked)),
      h(Section,{title:'Return to the Main Store',subtitle:'For items no longer needed at night, or close to expiry.'},
        table(['Item','In cupboard','Return'],listItems.filter(i=>n(i.night_balance)>0).map(i=>[i.item_name,qty(i.night_balance,i.unit),h('input',{type:'number',min:0,step:1,max:n(i.night_balance),style:{maxWidth:'100px'},value:ret[i.store_item_id]??'',onChange:e=>setRet(v=>({...v,[i.store_item_id]:e.target.value}))})])),
        h('div',{className:'field'},h('label',null,'Reason *'),h('input',{value:retNote,onChange:e=>setRetNote(e.target.value)})),
        btn('Return to Main Store',async()=>{const items=Object.entries(ret).map(([id,v])=>({store_item_id:id,qty:Number(v||0)})).filter(x=>x.qty>0);if(!items.length||retNote.trim().length<3){setError('Enter quantities and the reason.');return}if(await post('return_to_store',{items,note:retNote},'Returned to the Main Store','Night Stock reduced and the Main Store increased.'))setRet({})})));
  }
  function NsItemList({ctx}){
  const {acc,cur,isNight,listItems,toVerify,prevNight,n,qty,pill,btn,table,post,setError,setTab,when,verified,itemById,patients,pLabel,lateNight,tonight,onNavigate,busy,data,addDays,night,statusTone,openNight,setDetail}=ctx;
    const [edit,setEdit]=React.useState({}),[search,setSearch]=React.useState(''),[show,setShow]=React.useState('list');
    const q=search.trim().toLowerCase();
    const rows=(data.items||[]).filter(i=>show==='all'||i.in_list).filter(i=>q.length<2||`${i.item_name} ${i.item_code||''}`.toLowerCase().includes(q));
    const val=i=>edit[i.store_item_id]||{active:i.in_list&&i.active,par_qty:i.par_qty??''};
    const set=(i,patch)=>setEdit(v=>({...v,[i.store_item_id]:{...val(i),...patch}}));
    const changed=Object.entries(edit);
    return h(Section,{title:'Item List & Set Levels',subtitle:acc.manage?'Tick the items kept in the Night Stock cupboard and the level to keep each night.':'Set by the Nursing Manager.'},
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'flex-end',marginBottom:'10px'}},
        h('div',{className:'field',style:{marginBottom:0}},h('label',null,'Search item'),h('input',{value:search,onChange:e=>setSearch(e.target.value)})),
        acc.manage&&h('div',{className:'field',style:{marginBottom:0}},h('label',null,'Show'),h('select',{value:show,onChange:e=>setShow(e.target.value)},h('option',{value:'all'},'All Consumables / Pharmacy items'),h('option',{value:'list'},'Night Stock items only')))),
      table(['In Night Stock','Item','Category','Set level','In cupboard','Main Store'],rows.map(i=>{const v=val(i);return [
        h('input',{type:'checkbox',disabled:!acc.manage,checked:Boolean(v.active),'aria-label':`Keep ${i.item_name} in Night Stock`,onChange:e=>set(i,{active:e.target.checked,par_qty:v.par_qty||1})}),
        h('b',null,i.item_name),i.category||'',
        acc.manage?h('input',{type:'number',min:1,step:1,disabled:!v.active,style:{maxWidth:'90px'},value:v.par_qty??'',onChange:e=>set(i,{par_qty:e.target.value})}):qty(i.par_qty,i.unit),
        qty(i.night_balance,i.unit),qty(i.central_balance,i.unit)]})),
      acc.manage&&h('div',{style:{marginTop:'10px'}},btn(`Save changes${changed.length?` (${changed.length})`:''}`,async()=>{
        const items=changed.map(([id,v])=>({store_item_id:id,active:Boolean(v.active),par_qty:Number(v.par_qty||0)}));
        if(items.some(x=>x.active&&(!Number.isInteger(x.par_qty)||x.par_qty<=0))){setError('Set level must be a whole number above 0.');return}
        if(await post('set_list',{items},'Night Stock list saved',`${items.length} item${items.length===1?'':'s'} updated.`))setEdit({})},true,!changed.length)));
  }
  function NsRegister({ctx}){
  const {acc,cur,isNight,listItems,toVerify,prevNight,n,qty,pill,btn,table,post,setError,setTab,when,verified,itemById,patients,pLabel,lateNight,tonight,onNavigate,busy,data,addDays,night,statusTone,openNight,setDetail}=ctx;
    const today=todayISOIndia();
    const [period,setPeriod]=React.useState('week'),[month,setMonth]=React.useState(today.slice(0,7)),[from,setFrom]=React.useState(addDays(today,-6)),[to,setTo]=React.useState(today);
    const [guest,setGuest]=React.useState(''),[search,setSearch]=React.useState(''),[item,setItem]=React.useState(''),[view,setView]=React.useState('nights');
    const filters=useAppliedFilters({period,month,from,to,guest,item});const fa=filters.applied;
    let start=fa.from,end=fa.to;
    if(fa.period==='today'){start=end=cur}
    if(fa.period==='week'){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));start=d.toISOString().slice(0,10);end=today}
    if(fa.period==='month'){start=fa.month+'-01';const d=new Date(start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);end=d.toISOString().slice(0,10)}
    const valid=/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=end;
    const nights=valid?(data.nights||[]).filter(x=>x.night_date>=start&&x.night_date<=end):[];
    const moves=valid?(data.ledger||[]).filter(x=>x.night_date>=start&&x.night_date<=end&&(!fa.guest||x.patient_id===fa.guest)&&(!fa.item||x.store_item_id===fa.item)):[];
    const gq=search.trim().toLowerCase(),guestIds=[...new Set((data.ledger||[]).map(x=>x.patient_id).filter(Boolean))];
    const guestOpts=guestIds.filter(id=>gq.length<3||pLabel(id).toLowerCase().includes(gq)).sort((a,b)=>pLabel(a).localeCompare(pLabel(b)));
    const usedTotals={};moves.filter(m=>m.movement==='Use').forEach(m=>{const i=itemById(m.store_item_id);const k=i?.unit||'Nos';usedTotals[k]=(usedTotals[k]||0)-n(m.qty)});
    const field=(label,el)=>h('div',{className:'field',style:{marginBottom:0}},h('label',null,label),el);
    return h(Section,{title:'Night Stock Register',subtitle:'Tap a night for its counts and movements.'},
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'flex-end',marginBottom:'10px'}},
        field('Show',h('select',{value:view,onChange:e=>setView(e.target.value)},h('option',{value:'movements'},'Movements (use, top-up, adjustments)'),h('option',{value:'nights'},'Nights'))),
        field('Period',h('select',{value:period,onChange:e=>setPeriod(e.target.value)},h('option',{value:'month'},'Month'),h('option',{value:'range'},'Period (From–To)'),h('option',{value:'week'},'This Week'),h('option',{value:'today'},'Today'))),
        period==='month'&&field('Month',h('input',{type:'month',value:month,onChange:e=>setMonth(e.target.value)})),
        period==='range'&&field('From',h(StrictDateInput,{value:from,max:to,onChange:e=>setFrom(e.target.value)})),
        period==='range'&&field('To',h(StrictDateInput,{value:to,min:from,onChange:e=>setTo(e.target.value)})),
        view==='movements'&&field('Search Guest / ID',h('input',{value:search,placeholder:'At least 3 characters',onChange:e=>setSearch(e.target.value)})),
        view==='movements'&&field('Guest',h('select',{value:guest,onChange:e=>setGuest(e.target.value)},h('option',{value:''},'All Guests'),guestOpts.map(id=>h('option',{key:id,value:id},pLabel(id))))),
        view==='movements'&&field('Item',h('select',{value:item,onChange:e=>setItem(e.target.value)},h('option',{value:''},'All items'),listItems.map(i=>h('option',{key:i.store_item_id,value:i.store_item_id},i.item_name)))),
        h(ApplyFilterButton,{dirty:filters.dirty,onApply:filters.apply})),
      !valid&&h('p',{role:'alert',className:'message error'},'Enter a valid date range; From must not be after To.'),
      valid&&h('p',{className:'small-note'},`${formatDateIN(start)} to ${formatDateIN(end)} (night = the date the night shift starts). Used for Guests: ${Object.entries(usedTotals).map(([u,v])=>`${v} ${u}`).join(' · ')||'none'}.`),
      valid&&view==='nights'&&table(['Night of','Status','Accepted','Closing count','Verified','Use entries'],nights.map(x=>[formatDateIN(x.night_date),pill(x.status,statusTone(x.status)),x.accepted_by_name?`${x.accepted_by_name} · ${when(x.accepted_at)}${x.accept_discrepancy?' ⚠':''}`:'—',x.closed_by_name?`${x.closed_by_name} · ${when(x.closed_at)}${x.close_discrepancy?' ⚠':''}`:'Not done',x.verified_by_name?`${x.verified_by_name} (${x.verifier_as||''}) · ${when(x.verified_at)}`:'—',(data.ledger||[]).filter(m=>m.night_date===x.night_date&&m.movement==='Use').length]),i=>openNight(nights[i].night_date)),
      valid&&view==='movements'&&table(['Night of','Time','Movement','Item','Qty','Guest','By','Note'],moves.map(m=>{const i=itemById(m.store_item_id);return [formatDateIN(m.night_date),when(m.created_at),m.movement+(m.late_entry?' (late)':''),i?.item_name||'Item',h('b',{style:{color:n(m.qty)<0?'#b42318':'#127a4b'}},`${n(m.qty)>0?'+':''}${n(m.qty)} ${i?.unit||''}`),m.patient_id?pLabel(m.patient_id):'—',m.actor_name||'',m.remarks||'']}),i=>setDetail({title:`${moves[i].movement} · ${itemById(moves[i].store_item_id)?.item_name||''}`,fields:[['Night of',formatDateIN(moves[i].night_date)],['Recorded',when(moves[i].created_at)],['Quantity',String(moves[i].qty)],['Guest',moves[i].patient_id?pLabel(moves[i].patient_id):''],['By',moves[i].actor_name],['Late entry',moves[i].late_entry?'Yes':''],['Note',moves[i].remarks]]})));
  }
