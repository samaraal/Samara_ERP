  function KitchenCashWorkspace({profile}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[busy,setBusy]=React.useState(false),[tab,setTab]=React.useState('home');
    const [dialog,setDialog]=React.useState(null),[form,setForm]=React.useState({}),[receipt,setReceipt]=React.useState(null);
    const lock=React.useRef(false),token=React.useRef(null);
    const emptyLine=()=>({name:'',unit:'kg',quantity:'1',price:'',stock:true});
    const [purchase,setPurchase]=React.useState({date:todayISOIndia(),vendor:'',bill:'',no_receipt:'',items:[emptyLine()]});
    const load=React.useCallback(async()=>{const r=await client.rpc('kitchen_workspace');if(r.error){setError(r.error.message);return}setData(r.data);setError('')},[]);
    React.useEffect(()=>{load();const timer=setInterval(load,30000);return()=>clearInterval(timer)},[load]);
    const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const name=id=>data?.people?.find(x=>x.id===id)?.name||'Staff';
    const input=(label,key,type='text',options={})=>h('div',{className:'field'},h('label',null,label),h('input',{type,value:form[key]??'',onChange:e=>setForm(v=>({...v,[key]:e.target.value})),...options}));
    const select=(label,key,values)=>h('div',{className:'field'},h('label',null,label),h('select',{value:form[key]||'',required:true,onChange:e=>setForm(v=>({...v,[key]:e.target.value}))},h('option',{value:''},'Select'),values.map(([v,l])=>h('option',{key:v,value:v},l))));
    const open=(action,title,defaults={})=>{setDialog({action,title});setForm(defaults);setNotice('');setError('');token.current=null};
    const button=(text,action,defaults={},primary=false)=>h('button',{type:'button',className:'btn '+(primary?'btn-primary':'btn-secondary'),disabled:busy,onClick:()=>open(action,text,defaults)},text);
    async function post(action,payload){
      const signature=JSON.stringify({action,payload});if(token.current?.signature!==signature)token.current={signature,id:crypto.randomUUID()};
      const r=await client.rpc('kitchen_post',{p_id:token.current.id,p_action:action,p_data:payload});if(r.error)throw r.error;
      token.current=null;setDialog(null);setNotice('✓ Saved successfully.');await load();window.dispatchEvent(new Event('samara-kitchen-authority-changed'));
    }
    async function submit(e){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await post(dialog.action,form)}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
    const uploadRef=React.useRef(null);
    async function savePurchase(e){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
      let path='';if(receipt){
        if(receipt.size>10485760||!['image/jpeg','image/png','image/webp','application/pdf'].includes(receipt.type))throw Error('Use a JPG, PNG, WebP or PDF up to 10 MB.');
        if(uploadRef.current?.file!==receipt){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[receipt.type];path=data.access.actor+'/'+crypto.randomUUID()+'.'+ext;const r=await client.storage.from('kitchen-receipts').upload(path,receipt,{contentType:receipt.type,upsert:false});if(r.error)throw r.error;uploadRef.current={file:receipt,path}}
        path=uploadRef.current.path;
      }
      await post('purchase',{...purchase,receipt:path});setPurchase({date:todayISOIndia(),vendor:'',bill:'',no_receipt:'',items:[emptyLine()]});setReceipt(null);uploadRef.current=null;setTab('purchases');
    }catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
    async function viewReceipt(path){const r=await client.storage.from('kitchen-receipts').createSignedUrl(path,120);if(r.error){setError(r.error.message);return}window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}
    function exportCash(){const rows=[['Date','Type','Details','Cash in','Cash out','Balance','Recorded by','Reference'],...data.cash.slice().reverse().map(x=>[formatDateTimeIN(x.created_at),x.kind,x.details,x.amount>0?x.amount:'',x.amount<0?-x.amount:'',x.balance_after,x.actor_name,x.reference_id||x.id])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Kitchen-Cash-Book-'+todayISOIndia()+'.csv';a.click();URL.revokeObjectURL(url)}
    if(!data)return h(Section,{title:'Kitchen & Pantry'},h('p',{role:'status'},error||'Loading kitchen cash book…'),h('p',null,'If this workspace is not installed, apply SQL 186 before using this release.'));
    const admin=data.access.admin,spend=data.access.spend,actor=data.access.actor,w=data.wallet;
    const pendingHandover=data.handovers.find(x=>['Awaiting outgoing','Awaiting receipt'].includes(x.status));
    const month=t=>String(t).slice(0,7)===todayISOIndia().slice(0,7);
    const expense=data.purchases.filter(x=>x.status!=='Reversed'&&month(x.expense_date)).reduce((s,x)=>s+Number(x.total),0);
    const tabs=[['home','Overview'],['purchase','Record Purchase'],['purchases','Purchase Register'],['funding','Cash Requests'],['stock','Kitchen Stock'],['handover','In-charge & Handover'],['cash','Cash Book & Reports'],...(admin?[['legacy','Historical Stores Register']]:[])].filter(([k])=>k!=='purchase'||spend);
    const table=(heads,rows)=>h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),h('tbody',null,rows.length?rows.map((r,i)=>h('tr',{key:i},r.map((c,j)=>h('td',{key:j,style:{whiteSpace:'normal'}},c)))):h('tr',null,h('td',{colSpan:heads.length},'No entries yet.')))));
    const actions=(...children)=>h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},...children);
    const field=(label,key,type='text',opts={})=>h('div',{className:'field'},h('label',null,label),h('input',{type,value:purchase[key],onChange:e=>setPurchase(v=>({...v,[key]:e.target.value})),...opts}));
    const lineChange=(i,key,value)=>setPurchase(v=>({...v,items:v.items.map((x,j)=>j===i?{...x,[key]:value}:x)}));
    return h('div',{className:'kitchen-cash'},
      h('style',null,`@media(max-width:760px){
        .app:has(.kitchen-cash) .samara-float-nav{display:none!important}
        .app:has(.kitchen-cash) .global-page-tools .global-back-button{display:inline-flex!important}
        .kitchen-cash{padding-bottom:calc(100px + env(safe-area-inset-bottom))}
        .kitchen-cash td[data-mobile-label="Action"]{grid-column:1/-1!important;order:-1}
        .kitchen-cash td[data-mobile-label="Action"] .btn{width:100%;white-space:normal}
      }`),
      h('div',{className:'card panel dr-head'},h('div',{className:'dr-head-text'},h('h2',null,'Kitchen & Pantry — Cash Management'),h('small',null,'Cash only · Purchases reviewed afterward by Admin'),h('p',{className:'small-note'},`Primary: ${name(w.primary_staff)} · Current in-charge: ${name(w.custodian)}${w.cover_leave?' · Temporary leave cover':''}`)),h('button',{className:'btn btn-secondary',onClick:load},'Refresh')),
      error&&h('p',{className:'message error',role:'alert'},error),notice&&h('p',{className:'message success',role:'status'},notice),
      data.access.return_ready&&h('p',{className:'message',role:'status'},'Return to Duty has been recorded. Spending is paused until Admin arranges cash/stock handback and the primary in-charge accepts it.'),
      data.access.frozen&&h('p',{className:'message',role:'status'},'Cash and stock handover in progress. Spending and stock usage are paused.'),
      h('div',{className:'dr-boxes'},[['Cash in Hand',money(data.balance),'cash'],['Expenses This Month',money(expense),'purchases'],['Cash Requests',data.funding.filter(x=>['Requested','Approved','Handed over'].includes(x.status)).length,'funding'],['Pending Review',data.purchases.filter(x=>['Pending review','Query'].includes(x.status)).length,'purchases'],['Low Stock',data.stock.filter(x=>Number(x.quantity)<=Number(x.low_level)).length,'stock']].map(([label,value,key])=>h('button',{key:label,className:'dr-box',onClick:()=>setTab(key)},h('span',{className:'dr-box-label'},label),h('b',{className:'dr-box-count'},value)))),
      Number(data.balance)<=Number(w.low_limit)&&h('p',{className:'message',role:'status'},`Low Cash — balance ${money(data.balance)}; alert level ${money(w.low_limit)}. `,spend&&button('Request Cash','request_cash',{amount:w.opening_amount,note:''},true)),
      actions(...tabs.map(([key,label])=>h('button',{key,className:'btn '+(tab===key?'btn-primary':'btn-secondary'),onClick:()=>setTab(key)},label))),
      tab==='legacy'&&h(StoresDashboard,{profile,categoryFilter:'Kitchen / Food Stores'}),
      tab==='home'&&h(Section,{title:'Daily kitchen routine'},h('p',null,'Confirm cash received, record purchases with receipts, record stock usage, and count physical cash regularly. Funding transfers are not expenses. Purchase amounts reduce cash immediately; Admin review does not deduct cash again.'),
        h('p',null,`Opening cash allocation: ${money(w.opening_amount)}. Cash increases only after receipt confirmation.`),
        actions(spend&&h('button',{className:'btn btn-primary',onClick:()=>setTab('purchase')},'Record Purchase'),spend&&button('Count / Reconcile Cash','reconcile',{amount:data.balance,note:''}),admin&&button('Set Low-Cash Limit','settings',{amount:w.low_limit,note:''}))),
      tab==='purchase'&&spend&&h(Section,{title:'Record cash purchase / expense'},h('form',{onSubmit:savePurchase},h('fieldset',{disabled:busy,style:{border:0,padding:0}},
        h('div',{className:'grid two'},field('Purchase date','date','date',{required:true,max:todayISOIndia()}),field('Shop / vendor','vendor','text',{required:true}),field('Bill number','bill')),
        purchase.items.map((x,i)=>h('div',{key:i,className:'card panel'},h('div',{className:'grid two'},...['name','unit','quantity','price'].map(k=>h('div',{className:'field',key:k},h('label',null,{name:'Item / expense',unit:'Unit',quantity:'Quantity',price:'Unit price (₹)'}[k]),h('input',{required:true,type:['quantity','price'].includes(k)?'number':'text',min:k==='quantity'?'0.001':'0',step:k==='quantity'?'0.001':'0.01',value:x[k],onChange:e=>lineChange(i,k,e.target.value)}))),
          h('label',null,h('input',{type:'checkbox',checked:x.stock,onChange:e=>lineChange(i,'stock',e.target.checked)}),' Add to kitchen stock (untick if used immediately)'),
          h('strong',null,'Line total: '+money(Math.round(Number(x.quantity)*Number(x.price)*100)/100))),purchase.items.length>1&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPurchase(v=>({...v,items:v.items.filter((_,j)=>j!==i)}))},'Remove line'))),
        h('button',{type:'button',className:'btn btn-secondary',disabled:purchase.items.length>=50,onClick:()=>setPurchase(v=>({...v,items:[...v.items,emptyLine()]}))},'＋ Add item'),
        h('p',null,'Total cash paid: ',h('strong',null,money(purchase.items.reduce((s,x)=>s+Math.round(Number(x.quantity)*Number(x.price)*100)/100,0)))),
        h('div',{className:'field'},h('label',null,'Receipt photo / PDF (up to 10 MB)'),h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,application/pdf',onChange:e=>{setReceipt(e.target.files?.[0]||null);uploadRef.current=null}})),
        !receipt&&field('Reason no receipt is available','no_receipt','text',{required:true,minLength:3}),
        h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Record Expense')))),
      tab==='purchases'&&h(Section,{title:'Purchase Register — Admin review afterward'},...data.purchases.map(x=>h('details',{key:x.id,className:'card panel'},h('summary',null,`${formatDateIN(x.expense_date)} · ${x.vendor} · ${money(x.total)} · ${x.status}`),h('p',null,`Entered by ${x.entered_name} · Bill: ${x.bill_no||'—'}`),table(['Item','Quantity','Unit price','Total','Stock'],x.items.map(l=>[l.name,l.quantity+' '+l.unit,money(l.price),money(l.total),l.stock?'Added to stock':'Used immediately'])),
        x.receipt_path?h('button',{className:'btn btn-secondary',onClick:()=>viewReceipt(x.receipt_path)},'View Receipt'):h('p',null,'No receipt: '+x.no_receipt_reason),x.review_note&&h('p',null,'Review: '+x.review_note),
        admin&&x.status!=='Reversed'&&actions(button('Review / Query','review',{id:x.id,status:'Reviewed',note:''}),button('Reverse / Correct','reverse',{id:x.id,note:''})))),!data.purchases.length&&h('p',null,'No purchases yet.')),
      tab==='funding'&&h(Section,{title:'Cash requests and handovers'},spend&&button('Request Cash','request_cash',{amount:2000,note:''},true),table(['Purpose','Recipient','Requested','Approved','Status','Action'],data.funding.map(x=>[x.purpose,name(x.recipient),money(x.requested_amount),x.amount?money(x.amount):'—',x.status,actions(
        admin&&x.status==='Requested'&&button('Approve Amount','approve_funding',{id:x.id,amount:x.requested_amount,note:''}),admin&&x.status==='Requested'&&button('Decline','decline_funding',{id:x.id,note:''}),
        admin&&x.status==='Approved'&&button('Record Cash Handed Over','handover_cash',{id:x.id,note:''}),
        admin&&['Requested','Approved'].includes(x.status)&&button('Cancel Request','cancel_funding',{id:x.id,note:''}),
        x.status==='Approved'&&!admin&&h('p',null,'Awaiting Admin to record cash handed over. Receipt confirmation becomes available after that.'),
        x.status==='Handed over'&&x.recipient===actor&&button('Confirm Cash Received','receive_cash',{id:x.id,amount:x.amount,note:''},true))]))),
      tab==='stock'&&h(Section,{title:'Kitchen stock and usage'},h('p',null,'Purchases marked “Add to kitchen stock” appear here. Existing Stores stock remains in its historical register; it is not silently imported or charged again.'),table(['Item','Balance','Low level','Action'],data.stock.map(x=>[x.name,x.quantity+' '+x.unit,x.low_level,actions(spend&&button('Record Usage / Wastage','use_stock',{id:x.id,quantity:'',kind:'Usage',note:''}), (spend||admin)&&button('Set Stock Alert','stock_limit',{id:x.id,amount:x.low_level,note:''}))])),
        h('details',null,h('summary',null,'Stock movement history'),table(['When','Item','Movement','Quantity','Reason','Staff'],data.movements.map(x=>[formatDateTimeIN(x.created_at),data.stock.find(s=>s.id===x.item_id)?.name,x.kind,x.quantity,x.reason,name(x.actor)])))),
      tab==='handover'&&h(Section,{title:'Responsibility, leave cover and cash handover'},h('p',null,`Primary: ${name(w.primary_staff)}. Current custodian: ${name(w.custodian)}.`),h('p',null,'Leave cover continues beyond the planned leave end date. After the existing Return to Duty approval, spending pauses until cash and stock are handed back. Each handover retains the stock snapshot and both confirmations.'),
        admin&&!pendingHandover&&button('Assign / Hand Over','handover_create',{kind:data.access.return_ready?'Return':'Leave cover',staff:data.access.return_ready?w.primary_staff:'',leave:'',note:''},true),
        ...data.handovers.map(x=>h('details',{key:x.id,className:'card panel',open:['Awaiting outgoing','Awaiting receipt'].includes(x.status)},h('summary',null,`${x.kind}: ${name(x.from_staff)} → ${name(x.to_staff)} · ${x.status}`),h('p',null,`Cash to transfer: ${money(x.expected_cash)} · ${x.reason}`),h('p',null,x.stock_note||'Stock confirmation pending'),table(['Stock at handover','Quantity'],x.stock_snapshot.map(s=>[s.name,s.quantity+' '+s.unit])),actions(
          x.status==='Awaiting outgoing'&&(x.from_staff===actor||admin)&&button(admin&&actor!==x.from_staff?'Emergency Admin Handover':'Confirm Outgoing Cash / Stock','handover_out',{id:x.id,amount:x.expected_cash,note:''}),
          x.status==='Awaiting receipt'&&x.to_staff===actor&&button('Accept Cash / Stock','handover_receive',{id:x.id,amount:x.counted_cash,note:''},true),
          admin&&['Awaiting outgoing','Awaiting receipt'].includes(x.status)&&button('Cancel Handover','handover_cancel',{id:x.id,note:''}))))),
      tab==='cash'&&h(Section,{title:'Cash Book & Accounts Reports'},h('p',null,'Kitchen cash subledger: funding is a cash transfer; purchases are expenses. Use these references when reconciling the central cash book. No resident ledger charges are generated.'),
        actions(h('button',{className:'btn btn-secondary',onClick:exportCash},'Download Cash Book (CSV)'),spend&&button('Count / Reconcile Cash','reconcile',{amount:data.balance,note:''}),admin&&button('Record Cash Correction','adjust',{amount:'',note:''})),
        table(['Date','Type','Details','In','Out','Balance','Staff'],data.cash.map(x=>[formatDateTimeIN(x.created_at),x.kind,x.details,x.amount>0?money(x.amount):'—',x.amount<0?money(-x.amount):'—',money(x.balance_after),x.actor_name])),
        h('details',null,h('summary',null,'Physical cash counts and discrepancies'),table(['When','Book cash','Physical cash','Difference','Staff','Note'],data.reconciliations.map(x=>[formatDateTimeIN(x.created_at),money(x.book_cash),money(x.physical_cash),money(x.difference),name(x.actor),x.note]))),
        h('details',null,h('summary',null,'Assignment and action audit history'),table(['When','Action','Staff','Details'],data.audit.map(x=>[formatDateTimeIN(x.created_at),x.action,x.actor_name||'Initial setup',JSON.stringify(x.details)])))),
      dialog&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:submit,role:'dialog','aria-modal':true},h('h3',null,dialog.title),error&&h('p',{role:'alert',className:'message error'},error),h('fieldset',{disabled:busy,style:{border:0,padding:0}},
        ['amount'].filter(k=>k in form).map(k=>input(dialog.action==='adjust'?'Signed cash correction (₹); negative reduces cash':'Counted / approved amount (₹)',k,'number',{required:true,step:'0.01',min:dialog.action==='adjust'?undefined:0})),
        'quantity' in form&&input('Quantity','quantity','number',{required:true,min:'0.001',step:'0.001'}),
        dialog.action==='review'&&select('Review decision','status',[['Reviewed','Reviewed'],['Query','Needs clarification']]),
        dialog.action==='use_stock'&&select('Movement','kind',[['Usage','Used in kitchen / pantry'],['Wastage','Wastage']]),
        dialog.action==='handover_create'&&h(React.Fragment,null,select('Assignment type','kind',[['Leave cover','Temporary leave cover'],['Return','Handback after Return to Duty'],['Permanent','Change primary in-charge']]),select('Incoming staff','staff',data.people.map(x=>[x.id,x.name+' · '+x.role])),form.kind==='Leave cover'&&select('Primary staff approved leave','leave',data.leaves.map(x=>[x.id,formatDateIN(x.from_date)+' to '+formatDateIN(x.to_date)]))),
        h('div',{className:'field'},h('label',null,dialog.action.startsWith('handover_')?'Confirm stock / cash handover and reason':'Purpose / reason / confirmation'),h('textarea',{required:true,minLength:3,value:form.note||'',onChange:e=>setForm(v=>({...v,note:e.target.value}))})),
        dialog.action==='reverse'&&h('p',null,'Confirm the cash has actually been restored or the original entry was incorrect. This credits cash and reverses purchased stock. It cannot undo stock already consumed.'),
        dialog.action==='adjust'&&h('p',null,'Admin correction only. Record the physical evidence and reason. Original cash-book entries remain unchanged.'),
        h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Confirm'),h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setDialog(null)},'Cancel')))));
  }
