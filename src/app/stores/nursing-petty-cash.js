  // 2.16.19: Nursing Manager Petty Cash (SQL 215).
  // Nursing Manager requests → Admin / Director approves and hands over → Nursing Manager confirms cash received.
  // She records expenses (purpose, optional bill photo / PDF); Admin reviews or reverses them.
  // Kitchen cash she hands over to STD is deducted here automatically. The balance may go below zero (red).
  function NursingPettyCash({profile}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[tab,setTab]=React.useState('book');
    const [dialog,setDialog]=React.useState(null),[form,setForm]=React.useState({}),[detail,setDetail]=React.useState(null);
    const [expense,setExpense]=React.useState({date:todayISOIndia(),amount:'',note:'',paid_to:'',bill:''}),[bill,setBill]=React.useState(null);
    const lock=React.useRef(false),token=React.useRef(null),uploadRef=React.useRef(null);
    const rowClick=fn=>e=>{if(e&&e.target&&e.target.closest&&e.target.closest('button,a,input,select,textarea,label'))return;fn()}; // 2.16.21: local helper (was missing → page crash)
    const [focus,clearFocus]=useRecordFocus('Petty Cash');
    // Cash book period filter (Apply button, global filter rule).
    const [period,setPeriod]=React.useState('month'),[from,setFrom]=React.useState(todayISOIndia()),[to,setTo]=React.useState(todayISOIndia());
    const filters=useAppliedFilters({period,from,to});
    const load=React.useCallback(async()=>{const r=await client.rpc('nm_petty_workspace');if(r.error){setError(r.error.message);return}setData(r.data);setError('')},[]);
    React.useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[load]);
    React.useEffect(()=>{if(focus)setTab(focus.kind==='entry'?'book':'requests')},[focus]);
    const money=n=>{const v=Number(n||0);return (v<0?'−₹':'₹')+Math.abs(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})};
    const toast=(ok,text)=>showSamaraActionToast(ok?'success':'error',ok?'Petty cash updated':'Petty cash action failed',text);
    async function post(action,payload){
      const sig=JSON.stringify({action,payload});if(token.current?.sig!==sig)token.current={sig,id:crypto.randomUUID()};
      const r=await client.rpc('nm_petty_post',{p_id:token.current.id,p_action:action,p_data:payload});if(r.error)throw r.error;
      token.current=null;await load();
    }
    async function run(action,payload,okText){if(lock.current)return false;lock.current=true;setBusy(true);setError('');try{await post(action,payload);toast(true,okText);return true}catch(e){setError(e.message);toast(false,e.message);return false}finally{lock.current=false;setBusy(false)}}
    const open=(action,title,defaults={},help='')=>{setDialog({action,title,help});setForm(defaults);setError('');token.current=null};
    async function submitDialog(e){e.preventDefault();const labels={request:'Petty cash request sent to Admin / Director.',approve:'Request approved.',approve_handover:'Approved and handed over. Waiting for the Nursing Manager to confirm.',decline:'Request declined.',handover:'Cash handed over. Waiting for the Nursing Manager to confirm.',receive:'Cash received — added to your petty cash.',cancel:'Request cancelled.',review:'Review saved.',reverse:'Expense reversed — amount added back.'};
      const payload={...form};if('amount' in payload)payload.amount=Number(payload.amount);
      if(await run(dialog.action,payload,labels[dialog.action]||'Saved.'))setDialog(null)}
    async function saveExpense(e){
      e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
      try{
        let path='';
        if(bill){
          if(bill.size>10485760||!['image/jpeg','image/png','image/webp','application/pdf'].includes(bill.type))throw Error('Use a JPG, PNG, WebP or PDF up to 10 MB.');
          if(uploadRef.current?.file!==bill){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[bill.type];const p=data.access.actor+'/'+crypto.randomUUID()+'.'+ext;const r=await client.storage.from('nm-petty-receipts').upload(p,bill,{contentType:bill.type,upsert:false});if(r.error)throw r.error;uploadRef.current={file:bill,path:p}}
          path=uploadRef.current.path;
        }
        await post('expense',{date:expense.date,amount:Number(expense.amount),note:expense.note,paid_to:expense.paid_to,bill:expense.bill,receipt:path});
        setExpense({date:todayISOIndia(),amount:'',note:'',paid_to:'',bill:''});setBill(null);uploadRef.current=null;setTab('book');toast(true,'Expense recorded.');
      }catch(err){setError(err.message);toast(false,err.message)}finally{lock.current=false;setBusy(false)}
    }
    async function viewBill(path){const r=await client.storage.from('nm-petty-receipts').createSignedUrl(path,120);if(r.error){setError(r.error.message);return}window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}
    if(!data)return h(Section,{title:'Petty Cash'},h('p',{role:'status'},error||'Loading petty cash…'),error&&h('p',null,'If this is new, apply SQL 215 before using this page.'));
    const {admin,nm,actor}=data.access;const balance=Number(data.balance||0);
    const btn=(text,action,defaults,primary=false,help='')=>h('button',{type:'button',className:'btn '+(primary?'btn-primary':'btn-secondary'),disabled:busy,onClick:e=>{e.stopPropagation();open(action,text,defaults,help)}},text);
    // Running balance, oldest first.
    const chrono=data.entries.slice().reverse();let run_=0;const balAfter={};chrono.forEach(x=>{run_+=Number(x.amount);balAfter[x.id]=run_});
    const day=x=>x.kind==='Expense'?x.entry_date:new Date(x.created_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
    const today=todayISOIndia(),f=filters.applied;
    const weekStart=(()=>{const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10)})();
    const inPeriod=x=>{const d=day(x);return f.period==='all'?true:f.period==='today'?d===today:f.period==='week'?d>=weekStart:f.period==='month'?d.slice(0,7)===today.slice(0,7):d>=f.from&&d<=f.to};
    const entries=focus?.kind==='entry'?data.entries.filter(x=>String(x.id)===String(focus.id)):data.entries.filter(inPeriod);
    const requests=focus?.id&&focus.kind!=='entry'?data.requests.filter(x=>String(x.id)===String(focus.id)):data.requests;
    const monthExpense=data.entries.filter(x=>x.kind==='Expense'&&x.review_status!=='Reversed'&&String(day(x)).slice(0,7)===today.slice(0,7)).reduce((s,x)=>s-Number(x.amount),0);
    const monthKitchen=data.entries.filter(x=>x.kind==='Kitchen cash to STD'&&String(day(x)).slice(0,7)===today.slice(0,7)).reduce((s,x)=>s-Number(x.amount),0);
    const openReq=data.requests.filter(x=>['Requested','Approved','Handed over'].includes(x.status));
    const pendingReview=data.entries.filter(x=>x.kind==='Expense'&&['Pending review','Query'].includes(x.review_status));
    const when=v=>v?formatDateTimeIN(v):'';
    const pill=(t,tone)=>h('span',{style:{display:'inline-block',padding:'4px 9px',borderRadius:'999px',fontWeight:800,fontSize:'12px',background:tone==='good'?'#e7f6ef':tone==='bad'?'#fdebec':tone==='blue'?'#eaf2ff':'#fff4dc',color:'#5d3146'}},t);
    const reqTone=s=>s==='Received'?'good':['Declined','Cancelled'].includes(s)?'bad':s==='Handed over'?'blue':'';
    const actions=(...c)=>h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'},onClick:e=>e.stopPropagation()},...c);
    const reqActions=x=>actions(
      admin&&x.status==='Requested'&&btn('Approve & Hand Over','approve_handover',{id:x.id,amount:x.requested_amount,note:''},true,'Approve the amount and record that you have given the cash now.'),
      admin&&x.status==='Requested'&&btn('Approve only','approve',{id:x.id,amount:x.requested_amount,note:''},false,'Approve now; record the cash handover later.'),
      admin&&x.status==='Requested'&&btn('Decline','decline',{id:x.id,note:''}),
      admin&&x.status==='Approved'&&btn('Hand Over Cash','handover',{id:x.id,note:`Cash ${money(x.amount)} given to ${x.requested_by_name||'Nursing Manager'}`},true),
      (admin&&['Requested','Approved'].includes(x.status)||(nm&&x.status==='Requested'&&x.requested_by===actor))&&btn('Cancel Request','cancel',{id:x.id,note:''}),
      nm&&x.status==='Handed over'&&btn('Confirm Cash Received','receive',{id:x.id,amount:x.amount,note:''},true,'Count the cash. The amount must match what was handed over.'),
      !admin&&x.status==='Requested'&&h('small',null,'Waiting for Admin / Director approval.'),
      !admin&&x.status==='Approved'&&h('small',null,'Approved — waiting for Admin / Director to hand over the cash.'),
      !nm&&x.status==='Handed over'&&h('small',null,'Waiting for the Nursing Manager to confirm cash received.'));
    const entryActions=x=>actions(
      x.receipt_path&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>viewBill(x.receipt_path)},'View Bill'),
      admin&&x.kind==='Expense'&&x.review_status!=='Reversed'&&btn('Review / Query','review',{id:x.id,status:'Reviewed',note:''}),
      admin&&x.kind==='Expense'&&x.review_status!=='Reversed'&&btn('Reverse','reverse',{id:x.id,note:''},false,'Adds the amount back to the petty cash (e.g. wrong entry, or paid by the office).'));
    const reqDetail=x=>({title:`Petty cash request · ${x.status}`,subtitle:x.purpose,fields:[['Purpose',x.purpose],['Requested',money(x.requested_amount)],['Requested by',[x.requested_by_name,when(x.requested_at)].filter(Boolean).join(' · ')],['Approved amount',x.amount!=null?money(x.amount):''],['Approved / decided by',[x.decided_by_name,when(x.decided_at)].filter(Boolean).join(' · ')],['Decision note',x.decision_note],['Handed over by',[x.handed_by_name,when(x.handed_at)].filter(Boolean).join(' · ')],['Handover note',x.handover_note],['Received',when(x.received_at)],['Receipt note',x.receipt_note]]});
    const entryDetail=x=>({title:`${x.kind} · ${money(x.amount)}`,subtitle:x.details,fields:[['Date',formatDateIN(day(x))],['Type',x.kind],['Details',x.details],['Paid to',x.paid_to],['Bill number',x.bill_no],['Bill attached',x.receipt_path?'Yes':''],['Cash in',Number(x.amount)>0?money(x.amount):''],['Cash out',Number(x.amount)<0?money(-x.amount):''],['Balance after',money(balAfter[x.id])],['Recorded by',[x.actor_name,when(x.created_at)].filter(Boolean).join(' · ')],['Review',x.review_status],['Reviewed by',[x.reviewed_by_name,when(x.reviewed_at)].filter(Boolean).join(' · ')],['Review note',x.review_note]]});
    function exportBook(){
      const rows=[['Date','Type','Details','Paid to','Bill no','Cash in','Cash out','Balance','Recorded by','Review'],...entries.slice().reverse().map(x=>[formatDateIN(day(x)),x.kind,x.details,x.paid_to||'',x.bill_no||'',Number(x.amount)>0?x.amount:'',Number(x.amount)<0?-x.amount:'',balAfter[x.id],x.actor_name,x.review_status||''])];
      const csv=rows.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n');
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));a.download=`Petty_Cash_${today}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    }
    const table=(heads,rows,onRow,keys)=>h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),
      h('tbody',null,rows.length?rows.map((r,i)=>h('tr',{key:keys[i],className:'row-clickable',onClick:rowClick(()=>onRow(i))},r.map((c,j)=>h('td',{key:j,style:{whiteSpace:'normal'}},c)))):h('tr',null,h('td',{colSpan:heads.length,style:{textAlign:'center',padding:'20px'}},'No entries yet.')))));
    const tabs=[['book','Cash Book'],['requests','Cash Requests'],...(nm?[['expense','Record Expense']]:[])];
    const field=(label,key,type='text',opts={})=>h('div',{className:'field'},h('label',null,label),h('input',{type,value:expense[key],onChange:e=>setExpense(v=>({...v,[key]:e.target.value})),...opts}));
    return h('div',{className:'nm-petty-cash'},
      detail&&h(RowDetailModal,{title:detail.title,subtitle:detail.subtitle,fields:detail.fields,onClose:()=>setDetail(null)}),
      h('div',{className:'card panel dr-head'},h('div',{className:'dr-head-text'},h('h2',null,'Petty Cash — Nursing Manager'),h('small',null,'Nursing Manager requests → Admin / Director approves and hands over → Nursing Manager confirms. Kitchen cash given to STD is deducted automatically.')),
        actions(nm&&!openReq.length&&btn('Request Cash','request',{amount:'',note:''},true),h('button',{type:'button',className:'btn btn-secondary',onClick:load},'Refresh'))),
      error&&h('p',{className:'message error',role:'alert'},error),
      balance<0&&h('p',{className:'message error',role:'status'},`Petty cash is below zero (${money(balance)}). ${nm?'Request cash from Admin / Director to top up.':'The Nursing Manager needs a top-up.'}`),
      h('div',{className:'dr-boxes'},[['Cash in Hand',money(balance),'book',balance<0],['Expenses This Month',money(monthExpense),'book'],['Kitchen Cash to STD This Month',money(monthKitchen),'book'],['Open Requests',openReq.length,'requests'],['Expenses to Review',pendingReview.length,'book']].map(([label,value,key,red])=>h('button',{key:label,type:'button',className:'dr-box',onClick:()=>setTab(key)},h('span',{className:'dr-box-label'},label),h('b',{className:'dr-box-value',style:red?{color:'#b42318'}:undefined},value)))),
      actions(...tabs.map(([k,l])=>h('button',{key:k,type:'button',className:'btn '+(tab===k?'btn-primary':'btn-secondary'),onClick:()=>setTab(k)},l))),
      focus?.id&&h('p',{className:'message',role:'status'},'Showing only the entry from the alert. ',h('button',{type:'button',className:'btn btn-secondary',onClick:clearFocus},'Show all')),
      tab==='requests'&&h(Section,{title:'Cash Requests'},
        table(['Purpose','Requested','Approved','Status','Requested by','Handed over by','Action'],requests.map(x=>[x.purpose,money(x.requested_amount),x.amount!=null?money(x.amount):'—',pill(x.status,reqTone(x.status)),[x.requested_by_name,formatDateTimeIN(x.requested_at)].filter(Boolean).join(' · '),x.handed_by_name?`${x.handed_by_name} · ${formatDateTimeIN(x.handed_at)}`:'—',reqActions(x)]),i=>setDetail(reqDetail(requests[i])),requests.map(x=>x.id))),
      tab==='book'&&h(Section,{title:'Cash Book',actions:h('button',{type:'button',className:'btn btn-secondary',onClick:exportBook},'Export CSV')},
        !focus&&h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'flex-end',marginBottom:'10px'}},
          h('div',{className:'field',style:{marginBottom:0}},h('label',null,'Period'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},[['today','Today'],['week','This Week'],['month','This Month'],['range','Selected period'],['all','All']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          period==='range'&&h('div',{className:'field',style:{marginBottom:0}},h('label',null,'From'),h('input',{type:'date',value:from,max:to,onChange:e=>setFrom(e.target.value)})),
          period==='range'&&h('div',{className:'field',style:{marginBottom:0}},h('label',null,'To'),h('input',{type:'date',value:to,min:from,max:today,onChange:e=>setTo(e.target.value)})),
          h(ApplyFilterButton,{dirty:filters.dirty,onApply:filters.apply})),
        table(['Date','Type','Details','Cash in','Cash out','Balance','Review','Action'],entries.map(x=>[formatDateIN(day(x)),x.kind,h('span',null,x.details,x.paid_to&&h('small',{style:{display:'block'}},`Paid to: ${x.paid_to}`)),Number(x.amount)>0?money(x.amount):'',Number(x.amount)<0?money(-x.amount):'',h('span',{style:balAfter[x.id]<0?{color:'#b42318',fontWeight:800}:undefined},money(balAfter[x.id])),x.review_status?pill(x.review_status,x.review_status==='Reviewed'?'good':x.review_status==='Query'||x.review_status==='Reversed'?'bad':''):'—',entryActions(x)]),i=>setDetail(entryDetail(entries[i])),entries.map(x=>x.id))),
      tab==='expense'&&nm&&h(Section,{title:'Record Expense',subtitle:'Cash you paid out from the petty cash. Attach the bill if you have one; Admin reviews it later.'},
        h('form',{onSubmit:saveExpense},h('fieldset',{disabled:busy,style:{border:0,padding:0}},
          h('div',{className:'grid two'},field('Date *','date','date',{required:true,max:today}),field('Amount (₹) *','amount','number',{required:true,min:'0.01',step:'0.01'}),
            h('div',{className:'field'},h('label',null,'Spent on (purpose) *'),h('input',{required:true,minLength:3,value:expense.note,placeholder:'e.g. Auto fare to pharmacy',onChange:e=>setExpense(v=>({...v,note:e.target.value}))})),
            field('Paid to','paid_to','text',{placeholder:'Shop / person'}),field('Bill number','bill')),
          h('div',{className:'field'},h('label',null,'Bill photo / PDF (optional, up to 10 MB)'),h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,application/pdf',onChange:e=>{setBill(e.target.files?.[0]||null);uploadRef.current=null}})),
          Number(expense.amount)>balance&&h('p',{className:'message',role:'status'},`This is more than the cash in hand (${money(balance)}); the balance will go below zero.`),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Record Expense')))),
      dialog&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:submitDialog,role:'dialog','aria-modal':true},
        h('h3',null,dialog.title),dialog.help&&h('p',{className:'small-note'},dialog.help),error&&h('p',{role:'alert',className:'message error'},error),
        h('fieldset',{disabled:busy,style:{border:0,padding:0}},
          'amount' in form&&h('div',{className:'field'},h('label',null,dialog.action==='receive'?'Counted cash (₹)':'Amount (₹)'),h('input',{type:'number',required:true,min:'0.01',step:'0.01',value:form.amount,onChange:e=>setForm(v=>({...v,amount:e.target.value}))})),
          dialog.action==='review'&&h('div',{className:'field'},h('label',null,'Decision'),h('select',{value:form.status,onChange:e=>setForm(v=>({...v,status:e.target.value}))},h('option',{value:'Reviewed'},'Reviewed — OK'),h('option',{value:'Query'},'Query — needs clarification'))),
          h('div',{className:'field'},h('label',null,{request:'Purpose *',decline:'Reason *',cancel:'Reason *',review:'Note *',reverse:'Reason *'}[dialog.action]||'Note (optional)'),
            h('textarea',{rows:2,value:form.note||'',required:['request','decline','cancel','review','reverse'].includes(dialog.action),minLength:['request','decline','cancel','review','reverse'].includes(dialog.action)?3:undefined,onChange:e=>setForm(v=>({...v,note:e.target.value}))})),
          h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Confirm'),h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setDialog(null)},'Cancel')))))
    );
  }
