  // 2.19.78: ZENSET (GENERATOR) ACCOUNT — Admin / Directors only (SQL 350 rental_account_rpc).
  // Refundable deposit with the vendor (not an expense) + monthly rent (₹13,549 + 18% GST = ₹15,988, due by the 10th).
  // Rent is recorded once here and is added to Expenses automatically under "Zenset Rental" (so it counts in Net Profit).
  const ZA_STATUS={Paid:['#e8f6ee','#13643a'],'Part paid':['#fff6e0','#8a5a00'],Due:['#eef3ff','#2b4c9a'],Overdue:['#fdecee','#b4232f']};
  const zaMonthLabel=iso=>{if(!iso)return '—';const [y,m]=String(iso).slice(0,7).split('-').map(Number);return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})};
  const zaAddMonths=(iso,n)=>{const [y,m]=String(iso).slice(0,7).split('-').map(Number);const d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,10)};
  function ZensetAccount({profile,onNavigate}){
    const isAdmin=profile?.role==='Admin';
    const today=todayISOIndia();
    const [data,setData]=React.useState(null),[loading,setLoading]=React.useState(true),[msg,setMsg]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [panel,setPanel]=React.useState('');const [form,setForm]=React.useState({});
    const [bill,setBill]=React.useState(null);const upload=React.useRef(null);
    const [flt,setFlt]=React.useState({kind:'All',month:today.slice(0,7),from:today.slice(0,8)+'01',to:today});
    async function load(){
      setLoading(true);
      try{const r=await client.rpc('rental_account_rpc',{p_action:'load',p:{}});if(r.error)throw r.error;setData(r.data);setMsg(m=>m.startsWith('✓')?m:'')}
      catch(e){setMsg(/rental_account_rpc|function/i.test(e.message||'')?'The Zenset Account is not set up yet — run SQL 350 in Supabase.':(e.message||String(e)))}
      finally{setLoading(false)}
    }
    React.useEffect(()=>{if(isAdmin)load()},[]);
    if(!isAdmin)return h(Section,{title:'Zenset Account'},h('p',null,'Admin / Directors only.'));
    const acc=data?.account,t=data?.totals||{},months=data?.months||[],entries=data?.entries||[];
    const depositHeld=Number(t.deposit_paid||0)-Number(t.deposit_refunded||0);
    const thisMonth=months.find(m=>String(m.month).slice(0,7)===today.slice(0,7));
    const overdue=months.filter(m=>m.status==='Overdue'||(m.status==='Part paid'&&today>m.due_date));
    const overdueAmt=overdue.reduce((s,m)=>s+Math.max(0,Number(m.due)-Number(m.paid)),0);

    function openRent(monthIso){
      const m=monthIso||(months.slice().reverse().find(x=>x.status!=='Paid')?.month)||zaAddMonths(today,0);
      const rent=Number(acc?.monthly_rent||0),gst=Math.round(rent*Number(acc?.gst_percent||0)/100); // GST to the whole rupee, as on the bill (13,549 + 2,439 = 15,988)
      setForm({month:String(m).slice(0,10),date:today,rent_amount:String(rent||''),gst_amount:String(gst||''),mode:'Bank Transfer',reference:'',note:'',no_bill:false,no_bill_reason:'',confirm_again:false});
      setBill(null);upload.current=null;setPanel('rent');setMsg('');
    }
    function openDeposit(kind){setForm({kind,date:today,amount:'',mode:'Bank Transfer',reference:'',note:''});setBill(null);upload.current=null;setPanel('deposit');setMsg('')}
    function openSettings(){setForm({id:acc.id,vendor_name:acc.vendor_name||'',vendor_phone:acc.vendor_phone||'',vendor_gstin:acc.vendor_gstin||'',monthly_rent:String(acc.monthly_rent??''),gst_percent:String(acc.gst_percent??18),due_day:String(acc.due_day??10),rent_from:String(acc.rent_from||today).slice(0,7),notes:acc.notes||''});setPanel('settings');setMsg('')}
    async function uploadBill(dateIso){
      if(!bill)return '';
      if(upload.current?.file===bill)return upload.current.path;
      const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[bill.type];
      if(!ext)throw new Error('Choose a photo (JPG / PNG) or a PDF.');
      const p=`${String(dateIso).slice(0,7)}/${crypto.randomUUID()}.${ext}`;
      const r=await client.storage.from('expense-bills').upload(p,bill,{contentType:bill.type,upsert:false});
      if(r.error)throw new Error(r.error.message);
      upload.current={file:bill,path:p};return p;
    }
    async function call(action,p,done){
      if(busy)return;setBusy(true);setMsg('');
      try{const r=await client.rpc('rental_account_rpc',{p_action:action,p});if(r.error)throw r.error;setPanel('');setMsg('✓ '+done);if(typeof showSamaraActionToast==='function')showSamaraActionToast('success','Saved',done);await load()}
      catch(e){setMsg(e.message||String(e))}
      finally{setBusy(false)}
    }
    async function saveRent(e){
      e.preventDefault();
      try{
        if(!form.date||form.date>today||form.date<'2026-08-27')throw new Error('Choose the payment date — between 27-08-2026 and today.');
        if(!(Number(form.rent_amount)>0))throw new Error('Enter the rent amount.');
        if(!bill&&!form.no_bill)throw new Error('Add a photo / PDF of the bill, or tick "No bill" and give the reason.');
        if(form.no_bill&&String(form.no_bill_reason).trim().length<3)throw new Error('Give the reason there is no bill.');
        setBusy(true);const path=await uploadBill(form.date);setBusy(false);
        const total=Number(form.rent_amount)+Number(form.gst_amount||0);
        await call('pay_rent',{account_id:acc.id,month:form.month,date:form.date,rent_amount:Number(form.rent_amount),gst_amount:Number(form.gst_amount||0),mode:form.mode,reference:form.reference,note:form.note,
          bill_path:path,no_bill_reason:form.no_bill?form.no_bill_reason:'',confirm_again:!!form.confirm_again},
          `${zaMonthLabel(form.month)} rent ${npMoney(total)} recorded — also added to Expenses as "${acc.expense_head}".`);
      }catch(err){setBusy(false);setMsg(err.message||String(err))}
    }
    async function saveDeposit(e){
      e.preventDefault();
      try{
        if(!(Number(form.amount)>0))throw new Error('Enter the amount.');
        if(!form.date||form.date>today)throw new Error('Choose the date (not in the future).');
        setBusy(true);const path=await uploadBill(form.date);setBusy(false);
        await call('deposit',{account_id:acc.id,kind:form.kind,date:form.date,amount:Number(form.amount),mode:form.mode,reference:form.reference,note:form.note,bill_path:path},
          `${form.kind} ${npMoney(form.amount)} recorded (not an expense — it is Samara's money with the vendor).`);
      }catch(err){setBusy(false);setMsg(err.message||String(err))}
    }
    function saveSettings(e){
      e.preventDefault();
      call('save_account',{...form,rent_from:form.rent_from?form.rent_from+'-01':''},'Account details saved.');
    }
    function removeEntry(r){
      const reason=window.prompt(`Remove "${r.kind} · ${npMoney(r.amount)}"${r.kind==='Rent payment'?' (its Expenses entry is removed too)':''}? Give the reason:`);
      if(reason==null)return;call('void',{id:r.id,reason},'Entry removed.');
    }

    // ledger filter (All / Today / This Week / Month / Period)
    const weekStart=(()=>{const d=parseISODateUTC(today);const k=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-k);return d.toISOString().slice(0,10)})();
    const inFilter=r=>{const d=String(r.entry_date);if(flt.kind==='Today')return d===today;if(flt.kind==='This Week')return d>=weekStart&&d<=today;
      if(flt.kind==='Month')return d.slice(0,7)===flt.month;if(flt.kind==='Period')return d>=flt.from&&d<=flt.to;return true};
    const shown=entries.filter(inFilter);
    const live=shown.filter(r=>!r.voided_at);
    const sumKind=k=>live.filter(r=>r.kind===k).reduce((s,r)=>s+Number(r.amount),0);
    const periodBad=flt.kind==='Period'&&flt.from>flt.to;

    const fld=(label,el,wide)=>h('label',{style:{display:'grid',gap:'4px',fontWeight:700,color:'#5d1740',fontSize:'13px',gridColumn:wide?'1/-1':undefined}},label,el);
    const tile=(label,value,sub,color,onClick)=>h(onClick?'button':'div',{type:onClick?'button':undefined,onClick,style:{textAlign:'left',cursor:onClick?'pointer':'default',border:'1px solid #f3c2d8',borderTop:`4px solid ${color}`,borderRadius:'16px',padding:'14px 16px',background:'linear-gradient(160deg,#fff,#fff6fa)',display:'grid',gap:'4px'}},
      h('span',{style:{color:'#5d1740',fontWeight:800,fontSize:'14px'}},label),h('strong',{style:{fontSize:'21px',color}},value),sub&&h('small',{style:{color:'#8a5a70'}},sub));
    const chip=(k)=>h('button',{key:k,type:'button',onClick:()=>setFlt({...flt,kind:k}),style:{border:'1.5px solid #e9a9c4',borderRadius:'999px',padding:'6px 13px',fontWeight:800,cursor:'pointer',background:flt.kind===k?'linear-gradient(135deg,#a80d4f,#d6338a)':'#fff',color:flt.kind===k?'#fff':'#8a1c52'}},k);
    const billPicker=(required)=>h('div',{style:{gridColumn:'1/-1',border:'1px solid #f3c2d8',borderRadius:'12px',padding:'12px',background:'#fff'}},
      h('strong',{style:{color:'#5d1740'}},required?'Bill photo / PDF *':'Receipt photo / PDF (optional)'),
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'8px',alignItems:'center'}},
        h('label',{className:'btn btn-primary',style:{cursor:'pointer',margin:0}},'📷 Take photo',h('input',{type:'file',accept:'image/*',capture:'environment',style:{display:'none'},onChange:e=>{setBill(e.target.files&&e.target.files[0]||null);e.target.value=''}})),
        h('label',{className:'btn btn-secondary',style:{cursor:'pointer',margin:0}},'🖼 Choose photo / PDF',h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,application/pdf',style:{display:'none'},onChange:e=>{setBill(e.target.files&&e.target.files[0]||null);e.target.value=''}})),
        bill&&h('span',{style:{color:'#2e7d4f',fontWeight:700}},`✓ ${bill.name}`),
        required&&h('label',{style:{display:'flex',gap:'6px',alignItems:'center',fontWeight:700,color:'#5d1740'}},h('input',{type:'checkbox',checked:!!form.no_bill,onChange:e=>setForm({...form,no_bill:e.target.checked})}),'No bill')),
      required&&form.no_bill&&h('input',{style:{marginTop:'8px',width:'100%'},value:form.no_bill_reason||'',placeholder:'Why is there no bill? (e.g. bill to come from vendor)',onChange:e=>setForm({...form,no_bill_reason:e.target.value})}));
    const monthPaid=form.month&&months.find(m=>String(m.month).slice(0,7)===String(form.month).slice(0,7));
    const rentMonthOptions=[...new Set([...months.map(m=>String(m.month).slice(0,10)),zaAddMonths(today,1)])].sort().reverse();

    return h(React.Fragment,null,
      h(Section,{title:'Zenset Account',subtitle:acc?`${acc.item||'Generator on hire'} · ${acc.vendor_name||'vendor name not set'} · ${npMoney(acc.monthly_rent)} + GST ${Number(acc.gst_percent)}% a month, due by the ${acc.due_day}th · Admin / Directors only`:'Generator (genset) on hire — deposit and monthly rent',
        actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate&&onNavigate('Monthly Expenses')},'Expenses →'),
          acc&&h('button',{type:'button',className:'btn btn-secondary',onClick:openSettings},'⚙ Account details'))},
        loading&&!data&&h('p',null,'Loading…'),
        msg&&h('div',{className:`message ${msg.startsWith('✓')?'success':'error'}`},msg),
        acc&&!panel&&h(React.Fragment,null,
          h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'12px',margin:'4px 0 14px'}},
            tile('Deposit with vendor',npMoney(depositHeld),'refundable · not an expense','#7a1247'),
            tile(`This month · ${zaMonthLabel(today)}`,thisMonth?thisMonth.status:'—',thisMonth?`${npMoney(thisMonth.paid)} of ${npMoney(thisMonth.due)} · due ${formatDateIN(thisMonth.due_date)}`:'',thisMonth?ZA_STATUS[thisMonth.status]?.[1]||'#5d1740':'#5d1740',thisMonth&&thisMonth.status!=='Paid'?()=>openRent(thisMonth.month):null),
            tile('Overdue',overdue.length?npMoney(overdueAmt):'None',overdue.length?`${overdue.length} month${overdue.length>1?'s':''} · ${overdue.map(m=>m.label).join(', ')}`:'all rent up to date',overdue.length?'#b4232f':'#13643a'),
            tile('Rent paid (all months)',npMoney(t.rent_paid),`incl. GST ${npMoney(t.rent_paid_gst)} · in Expenses`,'#2e7d4f')),
          h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'6px'}},
            h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>openRent()},'＋ Record rent payment'),
            h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openDeposit('Deposit paid')},'＋ Deposit paid'),
            depositHeld>0&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openDeposit('Deposit refunded')},'↩ Deposit refunded'))),

        panel==='rent'&&h('form',{onSubmit:saveRent,style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'12px',alignItems:'end',border:'1.5px solid #f0d2df',borderRadius:'16px',padding:'14px',background:'#fffafd'}},
          h('strong',{style:{gridColumn:'1/-1',color:'#a80d4f',fontSize:'17px'}},'Record rent payment — also goes to Expenses as "'+acc.expense_head+'"'),
          fld('Rent for month *',h('select',{value:form.month,onChange:e=>setForm({...form,month:e.target.value,confirm_again:false})},rentMonthOptions.map(m=>h('option',{key:m,value:m},zaMonthLabel(m)+(months.find(x=>String(x.month).slice(0,10)===m)?.status==='Paid'?' — paid':''))))),
          fld('Payment date *',h(StrictDateInput,{value:form.date,min:'2026-08-27',max:today,onChange:e=>setForm({...form,date:e.target.value}),required:true})),
          fld('Rent ₹ *',h('input',{type:'number',min:'0.01',step:'0.01',value:form.rent_amount,onChange:e=>{const v=e.target.value;setForm({...form,rent_amount:v,gst_amount:String(Math.round(Number(v||0)*Number(acc.gst_percent||0)/100))})},required:true})),
          fld(`GST ₹ (${Number(acc.gst_percent)}%)`,h('input',{type:'number',min:'0',step:'0.01',value:form.gst_amount,onChange:e=>setForm({...form,gst_amount:e.target.value})})),
          fld('Total paid',h('div',{style:{fontSize:'20px',fontWeight:800,color:'#5d1740',padding:'6px 0'}},npMoney(Number(form.rent_amount||0)+Number(form.gst_amount||0)))),
          fld('Paid by',h('select',{value:form.mode,onChange:e=>setForm({...form,mode:e.target.value})},NP_MODES.map(x=>h('option',{key:x},x)))),
          fld('Bill / UTR / Reference No.',h('input',{value:form.reference,onChange:e=>setForm({...form,reference:e.target.value}),placeholder:'optional'})),
          fld('Note',h('input',{value:form.note,onChange:e=>setForm({...form,note:e.target.value}),placeholder:'optional'})),
          billPicker(true),
          monthPaid&&monthPaid.status==='Paid'&&h('label',{style:{gridColumn:'1/-1',display:'flex',gap:'8px',alignItems:'center',color:'#b4232f',fontWeight:700}},h('input',{type:'checkbox',checked:!!form.confirm_again,onChange:e=>setForm({...form,confirm_again:e.target.checked})}),`${zaMonthLabel(form.month)} is already paid — pay again for this month (a real second payment)`),
          h('div',{style:{gridColumn:'1/-1',display:'flex',gap:'8px'}},h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save rent payment'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPanel('');setMsg('')}},'Cancel'))),

        panel==='deposit'&&h('form',{onSubmit:saveDeposit,style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'12px',alignItems:'end',border:'1.5px solid #f0d2df',borderRadius:'16px',padding:'14px',background:'#fffafd'}},
          h('strong',{style:{gridColumn:'1/-1',color:'#a80d4f',fontSize:'17px'}},form.kind==='Deposit paid'?'Deposit paid to the vendor (refundable — not an expense)':`Deposit refunded by the vendor (held now ${npMoney(depositHeld)})`),
          fld('Amount ₹ *',h('input',{type:'number',min:'0.01',step:'0.01',value:form.amount,onChange:e=>setForm({...form,amount:e.target.value}),required:true,style:{fontSize:'18px',fontWeight:700}})),
          fld('Date *',h(StrictDateInput,{value:form.date,min:'2025-01-01',max:today,onChange:e=>setForm({...form,date:e.target.value}),required:true})),
          fld(form.kind==='Deposit paid'?'Paid by':'Received by',h('select',{value:form.mode,onChange:e=>setForm({...form,mode:e.target.value})},NP_MODES.map(x=>h('option',{key:x},x)))),
          fld('UTR / Reference No.',h('input',{value:form.reference,onChange:e=>setForm({...form,reference:e.target.value}),placeholder:'optional'})),
          fld('Note',h('input',{value:form.note,onChange:e=>setForm({...form,note:e.target.value}),placeholder:'e.g. security deposit for the 62.5 kVA genset'}),true),
          billPicker(false),
          h('div',{style:{gridColumn:'1/-1',display:'flex',gap:'8px'}},h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPanel('');setMsg('')}},'Cancel'))),

        panel==='settings'&&h('form',{onSubmit:saveSettings,style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'12px',alignItems:'end',border:'1.5px solid #f0d2df',borderRadius:'16px',padding:'14px',background:'#fffafd'}},
          h('strong',{style:{gridColumn:'1/-1',color:'#a80d4f',fontSize:'17px'}},'Account details'),
          fld('Vendor name',h('input',{value:form.vendor_name,onChange:e=>setForm({...form,vendor_name:e.target.value}),placeholder:'Zenset vendor / company'})),
          fld('Vendor phone',h('input',{value:form.vendor_phone,inputMode:'tel',onChange:e=>setForm({...form,vendor_phone:e.target.value})})),
          fld('Vendor GSTIN',h('input',{value:form.vendor_gstin,onChange:e=>setForm({...form,vendor_gstin:e.target.value.toUpperCase()})})),
          fld('Monthly rent ₹ (before GST) *',h('input',{type:'number',min:'0',step:'0.01',value:form.monthly_rent,onChange:e=>setForm({...form,monthly_rent:e.target.value}),required:true})),
          fld('GST %',h('input',{type:'number',min:'0',max:'28',step:'0.01',value:form.gst_percent,onChange:e=>setForm({...form,gst_percent:e.target.value})})),
          fld('Due by (day of month)',h('input',{type:'number',min:'1',max:'28',value:form.due_day,onChange:e=>setForm({...form,due_day:e.target.value})})),
          fld('Track rent from (month)',h('input',{type:'month',value:form.rent_from,onChange:e=>setForm({...form,rent_from:e.target.value})})),
          fld('Notes',h('input',{value:form.notes,onChange:e=>setForm({...form,notes:e.target.value})}),true),
          h('div',{style:{gridColumn:'1/-1',display:'flex',gap:'8px'}},h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save details'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPanel('');setMsg('')}},'Cancel')))
      ),

      acc&&!panel&&h(Section,{title:'Rent month by month',subtitle:`${npMoney(t.monthly_due)} a month (${npMoney(acc.monthly_rent)} + GST) · due by the ${acc.due_day}th`},
        h('div',{className:'table-wrap'},h('table',{className:'table',style:{minWidth:0}},
          h('thead',null,h('tr',null,['Month','Due','Paid','Paid on','Status',''].map((x,i)=>h('th',{key:i,style:i===1||i===2?{textAlign:'right'}:{}},x)))),
          h('tbody',null,months.length?months.map(m=>{const c=ZA_STATUS[m.status]||['#fff','#5d1740'];return h('tr',{key:m.month},
            h('td',{style:{fontWeight:700}},m.label),h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},npMoney(m.due),h('small',{style:{display:'block',color:'#8a5a70'}},'by '+formatDateIN(m.due_date))),
            h('td',{style:{textAlign:'right',whiteSpace:'nowrap',fontWeight:700}},npMoney(m.paid)),h('td',null,m.paid_on?formatDateIN(m.paid_on):'—'),
            h('td',null,h('span',{style:{background:c[0],color:c[1],borderRadius:'999px',padding:'3px 10px',fontWeight:800,fontSize:'12.5px'}},m.status)),
            h('td',null,m.status!=='Paid'&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openRent(m.month)},'Pay')))}):h('tr',null,h('td',{colSpan:6,className:'empty-cell'},'No months yet — set "Track rent from" in Account details.')))))),

      acc&&!panel&&h(Section,{title:'Account entries',subtitle:'Deposits and rent payments · rent entries are also in Expenses (Zenset Rental)'},
        h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginBottom:'10px'}},
          ['All','Today','This Week','Month','Period'].map(chip),
          flt.kind==='Month'&&h('input',{type:'month',value:flt.month,max:today.slice(0,7),onChange:e=>setFlt({...flt,month:e.target.value})}),
          flt.kind==='Period'&&h(React.Fragment,null,h(StrictDateInput,{value:flt.from,max:today,onChange:e=>setFlt({...flt,from:e.target.value})}),h('span',null,'to'),h(StrictDateInput,{value:flt.to,max:today,onChange:e=>setFlt({...flt,to:e.target.value})}))),
        periodBad?h('div',{className:'message error'},'"From" must be on or before "To".'):h(React.Fragment,null,
          h('p',{style:{margin:'0 0 8px',color:'#5d1740',fontWeight:700}},`Rent paid ${npMoney(sumKind('Rent payment'))} · Deposit paid ${npMoney(sumKind('Deposit paid'))} · Deposit refunded ${npMoney(sumKind('Deposit refunded'))}`),
          h('div',{className:'table-wrap'},h('table',{className:'table',style:{minWidth:0}},
            h('thead',null,h('tr',null,['Date','Entry','Month','Amount','Paid by','Ref.','Bill','By',''].map((x,i)=>h('th',{key:i,style:i===3?{textAlign:'right'}:{}},x)))),
            h('tbody',null,shown.length?shown.map(r=>h('tr',{key:r.id,style:r.voided_at?{opacity:.5,textDecoration:'line-through'}:null},
              h('td',{style:{whiteSpace:'nowrap'}},formatDateIN(r.entry_date)),
              h('td',null,h('strong',null,r.kind),r.note&&h('small',{style:{display:'block',color:'#8a5a70'}},r.note),r.voided_at&&h('small',{style:{display:'block',color:'#b4232f',textDecoration:'none'}},`Removed: ${r.void_reason||''}`)),
              h('td',null,r.period_month?zaMonthLabel(r.period_month):'—'),
              h('td',{style:{textAlign:'right',whiteSpace:'nowrap',fontWeight:700,color:r.kind==='Deposit refunded'?'#13643a':'#5d1740'}},npMoney(r.amount),r.gst_amount>0&&h('small',{style:{display:'block',color:'#8a5a70',fontWeight:500}},`${npMoney(r.rent_amount)} + GST ${npMoney(r.gst_amount)}`)),
              h('td',null,r.paid_mode||'—'),h('td',null,r.reference||'—'),
              h('td',null,r.bill_path?h('button',{type:'button',className:'btn btn-secondary',onClick:async()=>{const er=await openSamaraStorageFile('expense-bills',r.bill_path,300,'Bill');if(er)setMsg(er)}},'🧾'):r.no_bill_reason?h('small',null,'No bill'):'—'),
              h('td',null,r.created_by_name||'—'),
              h('td',null,!r.voided_at&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>removeEntry(r)},'Remove'))))
              :h('tr',null,h('td',{colSpan:9,className:'empty-cell'},loading?'Loading…':'No entries in this period.')))))))
    );
  }
