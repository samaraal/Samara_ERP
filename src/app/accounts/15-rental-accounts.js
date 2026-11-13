  // 2.19.78: GENSET (GENERATOR) ACCOUNT — Admin / Directors only (SQL 350 rental_account_rpc).
  // 2.20.5: same page also serves the RENT ACCOUNT (Samara · Hostel · Director House — SQL 351); "Zenset" spelling corrected to "Genset".
  // 2.20.7: Rent — printable owner's Rent Receipt per rent / deposit payment (owner signs) + upload of the signed copy (SQL 369 rent_receipt_rpc).
  // Refundable deposit / advance (not an expense) + monthly rent. Rent is recorded once here and is added to Expenses
  // automatically under the account's own head (Genset Rental / Rent - Samara / Rent - Hostel / Rent - Director House).
  const ZA_STATUS={Paid:['#e8f6ee','#13643a'],'Part paid':['#fff6e0','#8a5a00'],Due:['#eef3ff','#2b4c9a'],Overdue:['#fdecee','#b4232f']};
  const zaMonthLabel=iso=>{if(!iso)return '—';const [y,m]=String(iso).slice(0,7).split('-').map(Number);return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})};
  const RR_NO_BILL='Owner gives no bill — Samara rent receipt to be signed by the owner and uploaded';
  const zaAddMonths=(iso,n)=>{const [y,m]=String(iso).slice(0,7).split('-').map(Number);const d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,10)};
  // 2.20.81: preview of the chosen bill / receipt (photo shown; PDF opens in a new tab)
  function RaBillPreview({file}){
    const [url,setUrl]=React.useState('');
    React.useEffect(()=>{if(!file)return;let u='';try{u=URL.createObjectURL(file)}catch(_){}setUrl(u);return()=>{try{u&&URL.revokeObjectURL(u)}catch(_){}}},[file]);
    if(!file||!url)return null;
    const isImg=/^image\//.test(file.type||'')||/\.(jpe?g|png|webp|heic)$/i.test(file.name||'');
    const kb=Math.round((file.size||0)/1024);
    return h('div',{style:{marginTop:'10px',display:'flex',gap:'12px',alignItems:'flex-start',flexWrap:'wrap'}},
      isImg?h('a',{href:url,target:'_blank',rel:'noopener',title:'Open full size'},h('img',{src:url,alt:'Chosen receipt',style:{maxWidth:'220px',maxHeight:'220px',borderRadius:'10px',border:'1px solid #f3c2d8',objectFit:'contain',background:'#faf5f7'}}))
        :h('a',{href:url,target:'_blank',rel:'noopener',className:'btn btn-secondary',style:{margin:0}},'📄 Open PDF'),
      h('small',{style:{color:'#8a5a70'}},`${file.name} · ${kb>1024?(kb/1024).toFixed(1)+' MB':kb+' KB'}`,h('br'),'Tap the picture to see it full size. It is uploaded when you press Save.'));
  }
  function RentalAccountPage({profile,onNavigate,category}){
    const isRent=category==='Rent';
    const pageTitle=isRent?'Rent Account':'Genset Account';
    const isAdmin=profile?.role==='Admin';
    const [accountId,setAccountId]=React.useState('');
    const today=todayISOIndia();
    const [data,setData]=React.useState(null),[loading,setLoading]=React.useState(true),[msg,setMsg]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [panel,setPanel]=React.useState('');const [form,setForm]=React.useState({});
    const [bill,setBill]=React.useState(null);const upload=React.useRef(null);
    const [pendingOnly,setPendingOnly]=React.useState(false);
    const [flt,setFlt]=React.useState({kind:'All',month:today.slice(0,7),from:today.slice(0,8)+'01',to:today});
    async function load(){
      setLoading(true);
      try{const r=await client.rpc('rental_account_rpc',{p_action:'load',p:{category,account_id:accountId||''}});if(r.error)throw r.error;
        if(isRent&&(!(r.data?.accounts||[]).length||r.data?.account?.category!=='Rent'))throw new Error('The Rent Account is not set up yet — run SQL 351 in Supabase.');
        setData(r.data);setMsg(m=>m.startsWith('✓')?m:'')}
      catch(e){setMsg(/rental_account_rpc|function/i.test(e.message||'')?`The ${pageTitle} is not set up yet — run SQL 351 in Supabase.`:(e.message||String(e)))}
      finally{setLoading(false)}
    }
    React.useEffect(()=>{if(isAdmin)load()},[accountId,category]);
    if(!isAdmin)return h(Section,{title:pageTitle},h('p',null,'Admin / Directors only.'));
    const acc=data?.account,t=data?.totals||{},months=data?.months||[],entries=data?.entries||[];
    const depositHeld=Number(t.deposit_paid||0)-Number(t.deposit_refunded||0);
    const thisMonth=months.find(m=>String(m.month).slice(0,7)===today.slice(0,7));
    const overdue=months.filter(m=>m.status==='Overdue'||(m.status==='Part paid'&&today>m.due_date));
    const overdueAmt=overdue.reduce((s,m)=>s+Math.max(0,Number(m.due)-Number(m.paid)),0);

    function openRent(monthIso){
      const m=monthIso||(months.slice().reverse().find(x=>x.status!=='Paid')?.month)||(today.slice(0,8)+'01');
      const rent=Number(acc?.monthly_rent||0),gst=Math.round(rent*Number(acc?.gst_percent||0)/100); // GST to the whole rupee, as on the bill (13,549 + 2,439 = 15,988)
      setForm({month:String(m).slice(0,10),date:today,rent_amount:String(rent||''),gst_amount:String(gst||''),mode:'Bank Transfer',reference:'',note:'',no_bill:isRent,no_bill_reason:isRent?RR_NO_BILL:'',confirm_again:false});
      setBill(null);upload.current=null;setPanel('rent');setMsg('');
    }
    const depLabel=k=>k==='Deposit paid'?'Deposit / Advance paid':k==='Deposit refunded'?'Deposit / Advance refunded':k;
    const party=isRent?'owner':'vendor';
    function openDeposit(kind){setForm({kind,date:today,amount:'',mode:'Bank Transfer',reference:'',note:''});setBill(null);upload.current=null;setPanel('deposit');setMsg('')}
    function openSettings(){setForm({id:acc.id,vendor_name:acc.vendor_name||'',vendor_phone:acc.vendor_phone||'',vendor_gstin:acc.vendor_gstin||'',monthly_rent:String(acc.monthly_rent??''),gst_percent:String(acc.gst_percent??18),due_day:String(acc.due_day??10),rent_from:String(acc.rent_from||today).slice(0,7),notes:acc.notes||'',property_address:acc.property_address||'',owner_pan:acc.owner_pan||''});setPanel('settings');setMsg('')}
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
          `${zaMonthLabel(form.month)} rent ${npMoney(total)} recorded — also added to Expenses as "${acc.expense_head}".${isRent?' Print the owner\'s receipt (🖨) from Account entries below, get it signed and upload it there.':''}`);
      }catch(err){setBusy(false);setMsg(err.message||String(err))}
    }
    async function saveDeposit(e){
      e.preventDefault();
      try{
        if(!(Number(form.amount)>0))throw new Error('Enter the amount.');
        if(!form.date||form.date>today)throw new Error('Choose the date (not in the future).');
        setBusy(true);const path=await uploadBill(form.date);setBusy(false);
        await call('deposit',{account_id:acc.id,kind:form.kind,date:form.date,amount:Number(form.amount),mode:form.mode,reference:form.reference,note:form.note,bill_path:path},
          `${depLabel(form.kind)} ${npMoney(form.amount)} recorded (not an expense — it is Samara's money with the ${party}).`);
      }catch(err){setBusy(false);setMsg(err.message||String(err))}
    }
    async function saveSettings(e){
      e.preventDefault();
      if(isRent&&form.owner_pan&&!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(form.owner_pan).trim().toUpperCase())){setMsg('Owner PAN looks wrong — 10 characters like ABCDE1234F (or leave it empty).');return}
      if(isRent){
        // 2.20.7: property address + PAN (printed on the owner's rent receipt) — SQL 369
        try{const r=await client.rpc('rent_receipt_rpc',{p_action:'owner_details',p:{id:form.id,property_address:form.property_address,owner_pan:form.owner_pan}});if(r.error)throw r.error}
        catch(err){setMsg(/rent_receipt_rpc|function/i.test(err.message||'')?'Run SQL 369 in Supabase first (owner address / PAN for the rent receipt).':(err.message||String(err)));return}
      }
      call('save_account',{...form,rent_from:form.rent_from?form.rent_from+'-01':''},'Account details saved.');
    }

    // 2.20.7: OWNER'S RENT RECEIPT — printed from the ERP, signed by the owner, signed copy uploaded back to the same entry.
    const canReceipt=r=>isRent&&!r.voided_at&&(r.kind==='Rent payment'||r.kind==='Deposit paid');
    async function printReceipt(r){
      const win=samaraPrintBar(window.open('','_blank','width=900,height=1000'));if(!win){setMsg('Please allow pop-ups to print the receipt.');return}
      win.document.write('<p style="font-family:Arial;padding:20px">Preparing the receipt…</p>');
      let no=r.receipt_no;
      try{if(!no){const x=await client.rpc('rent_receipt_rpc',{p_action:'receipt_no',p:{id:r.id}});if(x.error)throw x.error;no=x.data?.receipt_no}}
      catch(err){try{win.close()}catch(_){};setMsg(/rent_receipt_rpc|function/i.test(err.message||'')?'Run SQL 369 in Supabase first — then the receipt can be printed.':(err.message||String(err)));return}
      const e=escapeHtml,m=v=>e(npMoney(v));
      const isDep=r.kind==='Deposit paid';
      const owner=acc.vendor_name||'';
      const purpose=isDep?'refundable rental advance / security deposit':`rent for the month of <b>${e(zaMonthLabel(r.period_month))}</b>`;
      const mode=[r.paid_mode,r.reference?`Ref. / UTR ${r.reference}`:''].filter(Boolean).join(' · ');
      const split=!isDep&&Number(r.gst_amount)>0?`<tr><td>Rent</td><td class="n">${m(r.rent_amount)}</td></tr><tr><td>GST</td><td class="n">${m(r.gst_amount)}</td></tr>`:'';
      win.document.open();
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Rent Receipt ${e(no||'')}</title><style>
        body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:24px;font-size:14px}
        .rc{border:2px solid #333;padding:22px 26px;max-width:720px;margin:0 auto}
        h1{text-align:center;margin:0 0 4px;font-size:24px;letter-spacing:3px;text-decoration:underline}
        .meta{display:flex;justify-content:space-between;margin:14px 0 18px;font-size:13px}
        p.body{line-height:2;text-align:justify;margin:0 0 12px}
        .blank{display:inline-block;min-width:160px;border-bottom:1px dotted #555}
        table{border-collapse:collapse;margin:6px 0 10px;min-width:280px}td{border:1px solid #aaa;padding:5px 10px}.n{text-align:right;white-space:nowrap}.tot td{font-weight:700}
        .sign{display:flex;justify-content:space-between;align-items:flex-end;margin-top:34px;gap:20px}
        .stamp{width:96px;height:110px;border:1px dashed #777;font-size:10px;color:#666;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px}
        .sig{text-align:center;min-width:250px}.sig .line{border-top:1px solid #333;margin-top:58px;padding-top:6px;font-weight:700}
        .foot{margin-top:18px;font-size:10.5px;color:#777;text-align:center}@media print{body{margin:12mm}}
      </style></head><body><div class="rc">
        <h1>RENT RECEIPT</h1>
        <div class="meta"><span>Receipt No.: <b>${e(no||'')}</b></span><span>Date: <b>${e(formatDateIN(r.entry_date))}</b></span></div>
        <p class="body">Received with thanks from <b>Samara Health Care LLP</b> a sum of <b>${m(r.amount)}</b>
          (<i>${e(billAmountInWords(r.amount))}</i>) ${mode?`by <b>${e(mode)}</b> `:''}paid on <b>${e(formatDateIN(r.entry_date))}</b>,
          towards ${purpose} for the premises
          ${acc.property_address?`at <b>${e(acc.property_address)}</b>`:`<span class="blank">&nbsp;</span>`} (${e(acc.item||acc.name)}).</p>
        ${split?`<table>${split}<tr class="tot"><td>Total received</td><td class="n">${m(r.amount)}</td></tr></table>`:''}
        <p class="body">Name of the owner: ${owner?`<b>${e(owner)}</b>`:'<span class="blank">&nbsp;</span>'}
          &nbsp;&nbsp; PAN: ${acc.owner_pan?`<b>${e(acc.owner_pan)}</b>`:'<span class="blank" style="min-width:120px">&nbsp;</span>'}
          ${acc.vendor_phone?`&nbsp;&nbsp; Phone: <b>${e(acc.vendor_phone)}</b>`:''}</p>
        <div class="sign">
          <div class="stamp">Revenue stamp ₹1<br>(cash payment above ₹5,000)</div>
          <div class="sig"><div class="line">Signature of the owner</div><div style="font-size:12px;margin-top:4px">${owner?e(owner):'Name: ____________________'}</div></div>
        </div>
        <p style="margin-top:22px;font-size:13px">Place: ____________________ &nbsp;&nbsp;&nbsp; Date: ____________________</p>
        <p class="foot">Receipt format prepared by Samara Health Care LLP (Samara Care ERP) · ${e(no||'')} · ${e(acc.name)} · please sign and return the signed copy</p>
      </div></body></html>`);
      win.document.close();
      if(!r.receipt_no)load();
    }
    async function uploadSigned(r,file){
      if(!file||busy)return;
      const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[file.type];
      if(!ext){setMsg('Choose a photo (JPG / PNG) or a PDF of the signed receipt.');return}
      setBusy(true);setMsg('');
      try{
        const path=`rent-receipts/${String(r.entry_date).slice(0,7)}/${crypto.randomUUID()}.${ext}`;
        const up=await client.storage.from('expense-bills').upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw new Error(up.error.message);
        const x=await client.rpc('rent_receipt_rpc',{p_action:'attach_signed',p:{id:r.id,path}});if(x.error)throw x.error;
        setMsg(`✓ Signed receipt uploaded — ${depLabel(r.kind)} ${npMoney(r.amount)}${r.period_month?' · '+zaMonthLabel(r.period_month):''}.`);
        if(typeof showSamaraActionToast==='function')showSamaraActionToast('success','Saved','Signed rent receipt uploaded.');
        await load();
      }catch(err){setMsg(/rent_receipt_rpc|function/i.test(err.message||'')?'Run SQL 369 in Supabase first — then the signed receipt can be uploaded.':(err.message||String(err)))}
      finally{setBusy(false)}
    }
    function removeSigned(r){
      if(!window.confirm('Remove the uploaded signed receipt from this entry (to upload a better copy)?'))return;
      (async()=>{setBusy(true);try{const x=await client.rpc('rent_receipt_rpc',{p_action:'remove_signed',p:{id:r.id}});if(x.error)throw x.error;setMsg('✓ Signed receipt removed — upload the new copy.');await load()}catch(err){setMsg(err.message||String(err))}finally{setBusy(false)}})();
    }
    function removeEntry(r){
      const reason=window.prompt(`Remove "${depLabel(r.kind)} · ${npMoney(r.amount)}"${r.kind==='Rent payment'?' (its Expenses entry is removed too)':''}? Give the reason:`);
      if(reason==null)return;call('void',{id:r.id,reason},'Entry removed.');
    }

    // ledger filter (All / Today / This Week / Month / Period)
    const weekStart=(()=>{const d=parseISODateUTC(today);const k=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-k);return d.toISOString().slice(0,10)})();
    const inFilter=r=>{const d=String(r.entry_date);if(flt.kind==='Today')return d===today;if(flt.kind==='This Week')return d>=weekStart&&d<=today;
      if(flt.kind==='Month')return d.slice(0,7)===flt.month;if(flt.kind==='Period')return d>=flt.from&&d<=flt.to;return true};
    const receiptPending=entries.filter(r=>canReceipt(r)&&!r.signed_receipt_path);
    const shown=entries.filter(inFilter).filter(r=>!pendingOnly||(canReceipt(r)&&!r.signed_receipt_path));
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
        bill&&h('button',{type:'button',className:'btn btn-secondary',style:{margin:0},onClick:()=>setBill(null)},'✕ Remove'),
        required&&h('label',{style:{display:'flex',gap:'6px',alignItems:'center',fontWeight:700,color:'#5d1740'}},h('input',{type:'checkbox',checked:!!form.no_bill,onChange:e=>setForm({...form,no_bill:e.target.checked})}),isRent?'No bill (owner signs Samara receipt)':'No bill')),
      bill&&h(RaBillPreview,{file:bill}), // 2.20.81: show the chosen photo / PDF
      required&&form.no_bill&&h('input',{style:{marginTop:'8px',width:'100%'},value:form.no_bill_reason||'',placeholder:'Why is there no bill? (e.g. bill to come from vendor)',onChange:e=>setForm({...form,no_bill_reason:e.target.value})}));
    const monthPaid=form.month&&months.find(m=>String(m.month).slice(0,7)===String(form.month).slice(0,7));
    // 2.20.6: every month from Aug 2026 (Samara opened 27-08-2026) to next month can be chosen — past months can be recorded
    // even before "Track rent from" / monthly rent are set.
    const allMonths=[];for(let m='2026-08-01';m<=zaAddMonths(today,1);m=zaAddMonths(m,1))allMonths.push(m);
    const rentMonthOptions=[...new Set([...months.map(m=>String(m.month).slice(0,10)),...allMonths])].sort().reverse();

    const accounts=data?.accounts||[];
    const rentNotSet=acc&&!(Number(acc.monthly_rent)>0&&acc.rent_from);
    return h(React.Fragment,null,
      // 2.20.5: Rent — one tab per place (Samara · Hostel · Director House), each with its own deposit / advance and rent
      isRent&&accounts.length>0&&h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'12px',marginBottom:'12px'}},
        accounts.map(x=>{const on=acc&&x.id===acc.id;const due=Number(x.monthly_rent||0)+Math.round(Number(x.monthly_rent||0)*Number(x.gst_percent||0)/100);
          return h('button',{key:x.id,type:'button',onClick:()=>{setPanel('');setAccountId(x.id)},style:{textAlign:'left',cursor:'pointer',borderRadius:'16px',padding:'14px 16px',display:'grid',gap:'4px',
            border:on?'2px solid #a80d4f':'1px solid #f3c2d8',background:on?'linear-gradient(135deg,#a80d4f,#d6338a)':'linear-gradient(160deg,#fff,#fff6fa)',color:on?'#fff':'#5d1740'}},
            h('strong',{style:{fontSize:'18px'}},'🏠 '+x.name),
            h('small',null,due>0?`Rent ${npMoney(due)} / month`:'Rent not set yet'),
            h('small',null,`Deposit / Advance held ${npMoney(x.deposit_held)}`),
            h('small',null,due>0?(Number(x.this_month_paid)>=due-1?'This month: Paid':`This month: ${npMoney(x.this_month_paid)} paid`):''))})),
      h(Section,{title:isRent?`Rent Account${acc?' · '+acc.name:''}`:pageTitle,subtitle:acc?`${acc.item||(isRent?'Rent':'Generator on hire')} · ${acc.vendor_name||(isRent?'owner name not set':'vendor name not set')} · ${Number(acc.monthly_rent)>0?`${npMoney(acc.monthly_rent)}${Number(acc.gst_percent)>0?` + GST ${Number(acc.gst_percent)}%`:''} a month, due by the ${acc.due_day}th`:'monthly rent not set'} · Admin / Directors only`:(isRent?'Rent — Samara · Hostel · Director House':'Generator (genset) on hire — deposit and monthly rent'),
        actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate&&onNavigate('Monthly Expenses')},'Expenses →'),
          acc&&h('button',{type:'button',className:'btn btn-secondary',onClick:openSettings},'⚙ Account details'))},
        loading&&!data&&h('p',null,'Loading…'),
        msg&&h('div',{className:`message ${msg.startsWith('✓')?'success':'error'}`},msg),
        rentNotSet&&!panel&&h('div',{className:'message',style:{background:'#fff6e0',color:'#8a5a00'}},'Set the monthly rent and "Track rent from" in ⚙ Account details to see the month-by-month rent status.'),
        acc&&!panel&&h(React.Fragment,null,
          h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'12px',margin:'4px 0 14px'}},
            tile(isRent?'Deposit / Advance with owner':'Deposit / Advance with vendor',npMoney(depositHeld),'refundable · not an expense','#7a1247'),
            tile(`This month · ${zaMonthLabel(today)}`,thisMonth?thisMonth.status:'—',thisMonth?`${npMoney(thisMonth.paid)} of ${npMoney(thisMonth.due)} · due ${formatDateIN(thisMonth.due_date)}`:'',thisMonth?ZA_STATUS[thisMonth.status]?.[1]||'#5d1740':'#5d1740',thisMonth&&thisMonth.status!=='Paid'?()=>openRent(thisMonth.month):null),
            tile('Overdue',overdue.length?npMoney(overdueAmt):'None',overdue.length?`${overdue.length} month${overdue.length>1?'s':''} · ${overdue.map(m=>m.label).join(', ')}`:'all rent up to date',overdue.length?'#b4232f':'#13643a'),
            tile('Rent paid (all months)',npMoney(t.rent_paid),`incl. GST ${npMoney(t.rent_paid_gst)} · in Expenses`,'#2e7d4f'),
            isRent&&tile('Signed owner receipts pending',receiptPending.length?String(receiptPending.length):'None',receiptPending.length?(pendingOnly?'showing only these — tap to show all':'tap to list them'):'all receipts signed & uploaded',receiptPending.length?'#b4232f':'#13643a',receiptPending.length||pendingOnly?()=>setPendingOnly(v=>!v):null)),
          h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'6px'}},
            h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>openRent()},'＋ Record rent payment'),
            h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openDeposit('Deposit paid')},'＋ Deposit / Advance paid'),
            depositHeld>0&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openDeposit('Deposit refunded')},'↩ Deposit / Advance refunded'))),

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
          h('strong',{style:{gridColumn:'1/-1',color:'#a80d4f',fontSize:'17px'}},form.kind==='Deposit paid'?`Deposit / Advance paid to the ${party}${isRent?' — '+acc.name:''} (refundable — not an expense)`:`Deposit / Advance refunded by the ${party} (held now ${npMoney(depositHeld)})`),
          fld('Amount ₹ *',h('input',{type:'number',min:'0.01',step:'0.01',value:form.amount,onChange:e=>setForm({...form,amount:e.target.value}),required:true,style:{fontSize:'18px',fontWeight:700}})),
          fld('Date *',h(StrictDateInput,{value:form.date,min:'2020-01-01',max:today,onChange:e=>setForm({...form,date:e.target.value}),required:true})),
          fld(form.kind==='Deposit paid'?'Paid by':'Received by',h('select',{value:form.mode,onChange:e=>setForm({...form,mode:e.target.value})},NP_MODES.map(x=>h('option',{key:x},x)))),
          fld('UTR / Reference No.',h('input',{value:form.reference,onChange:e=>setForm({...form,reference:e.target.value}),placeholder:'optional'})),
          fld('Note',h('input',{value:form.note,onChange:e=>setForm({...form,note:e.target.value}),placeholder:isRent?'e.g. rental advance as per agreement':'e.g. security deposit for the 62.5 kVA genset'}),true),
          billPicker(false),
          h('div',{style:{gridColumn:'1/-1',display:'flex',gap:'8px'}},h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPanel('');setMsg('')}},'Cancel'))),

        panel==='settings'&&h('form',{onSubmit:saveSettings,style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'12px',alignItems:'end',border:'1.5px solid #f0d2df',borderRadius:'16px',padding:'14px',background:'#fffafd'}},
          h('strong',{style:{gridColumn:'1/-1',color:'#a80d4f',fontSize:'17px'}},'Account details'),
          fld(isRent?'Owner name':'Vendor name',h('input',{value:form.vendor_name,onChange:e=>setForm({...form,vendor_name:e.target.value}),placeholder:isRent?'House owner / landlord':'Genset vendor / company'})),
          fld(isRent?'Owner phone':'Vendor phone',h('input',{value:form.vendor_phone,inputMode:'tel',onChange:e=>setForm({...form,vendor_phone:e.target.value})})),
          fld(isRent?'Owner GSTIN (if any)':'Vendor GSTIN',h('input',{value:form.vendor_gstin,onChange:e=>setForm({...form,vendor_gstin:e.target.value.toUpperCase()})})),
          fld('Monthly rent ₹ (before GST) *',h('input',{type:'number',min:'0',step:'0.01',value:form.monthly_rent,onChange:e=>setForm({...form,monthly_rent:e.target.value}),required:true})),
          fld('GST %',h('input',{type:'number',min:'0',max:'28',step:'0.01',value:form.gst_percent,onChange:e=>setForm({...form,gst_percent:e.target.value})})),
          fld('Due by (day of month)',h('input',{type:'number',min:'1',max:'28',value:form.due_day,onChange:e=>setForm({...form,due_day:e.target.value})})),
          fld('Track rent from (month)',h('input',{type:'month',value:form.rent_from,onChange:e=>setForm({...form,rent_from:e.target.value})})),
          isRent&&fld('Owner PAN (printed on receipt)',h('input',{value:form.owner_pan,maxLength:10,placeholder:'ABCDE1234F',onChange:e=>setForm({...form,owner_pan:e.target.value.toUpperCase()})})),
          isRent&&fld('Address of the rented premises (printed on receipt)',h('input',{value:form.property_address,onChange:e=>setForm({...form,property_address:e.target.value}),placeholder:'Door no., street, area, city, PIN'}),true),
          fld('Notes',h('input',{value:form.notes,onChange:e=>setForm({...form,notes:e.target.value})}),true),
          h('div',{style:{gridColumn:'1/-1',display:'flex',gap:'8px'}},h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save details'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPanel('');setMsg('')}},'Cancel')))
      ),

      acc&&!panel&&h(Section,{title:'Rent month by month',subtitle:`${npMoney(t.monthly_due)} a month${Number(acc.gst_percent)>0?` (${npMoney(acc.monthly_rent)} + GST)`:''} · due by the ${acc.due_day}th`},
        h('div',{className:'table-wrap'},h('table',{className:'table',style:{minWidth:0}},
          h('thead',null,h('tr',null,['Month','Due','Paid','Paid on','Status',''].map((x,i)=>h('th',{key:i,style:i===1||i===2?{textAlign:'right'}:{}},x)))),
          h('tbody',null,months.length?months.map(m=>{const c=ZA_STATUS[m.status]||['#fff','#5d1740'];return h('tr',{key:m.month},
            h('td',{style:{fontWeight:700}},m.label),h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},npMoney(m.due),h('small',{style:{display:'block',color:'#8a5a70'}},'by '+formatDateIN(m.due_date))),
            h('td',{style:{textAlign:'right',whiteSpace:'nowrap',fontWeight:700}},npMoney(m.paid)),h('td',null,m.paid_on?formatDateIN(m.paid_on):'—'),
            h('td',null,h('span',{style:{background:c[0],color:c[1],borderRadius:'999px',padding:'3px 10px',fontWeight:800,fontSize:'12.5px'}},m.status)),
            h('td',null,m.status!=='Paid'&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openRent(m.month)},'Pay')))}):h('tr',null,h('td',{colSpan:6,className:'empty-cell'},'No months yet — set "Track rent from" in Account details.')))))),

      acc&&!panel&&h(Section,{title:'Account entries',subtitle:`Deposits / advances and rent payments · rent entries are also in Expenses (${acc.expense_head})`},
        h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center',marginBottom:'10px'}},
          ['All','Today','This Week','Month','Period'].map(chip),
          flt.kind==='Month'&&h('input',{type:'month',value:flt.month,max:today.slice(0,7),onChange:e=>setFlt({...flt,month:e.target.value})}),
          flt.kind==='Period'&&h(React.Fragment,null,h(StrictDateInput,{value:flt.from,max:today,onChange:e=>setFlt({...flt,from:e.target.value})}),h('span',null,'to'),h(StrictDateInput,{value:flt.to,max:today,onChange:e=>setFlt({...flt,to:e.target.value})}))),
        periodBad?h('div',{className:'message error'},'"From" must be on or before "To".'):h(React.Fragment,null,
          h('p',{style:{margin:'0 0 8px',color:'#5d1740',fontWeight:700}},`Rent paid ${npMoney(sumKind('Rent payment'))} · Deposit / Advance paid ${npMoney(sumKind('Deposit paid'))} · Deposit / Advance refunded ${npMoney(sumKind('Deposit refunded'))}`),
          h('div',{className:'table-wrap'},h('table',{className:'table',style:{minWidth:0}},
            h('thead',null,h('tr',null,['Date','Entry','Month','Amount','Paid by','Ref.','Bill',...(isRent?['Owner receipt']:[]),'By',''].map((x,i)=>h('th',{key:i,style:i===3?{textAlign:'right'}:{}},x)))),
            h('tbody',null,shown.length?shown.map(r=>h('tr',{key:r.id,style:r.voided_at?{opacity:.5,textDecoration:'line-through'}:null},
              h('td',{style:{whiteSpace:'nowrap'}},formatDateIN(r.entry_date)),
              h('td',null,h('strong',null,depLabel(r.kind)),r.note&&h('small',{style:{display:'block',color:'#8a5a70'}},r.note),r.voided_at&&h('small',{style:{display:'block',color:'#b4232f',textDecoration:'none'}},`Removed: ${r.void_reason||''}`)),
              h('td',null,r.period_month?zaMonthLabel(r.period_month):'—'),
              h('td',{style:{textAlign:'right',whiteSpace:'nowrap',fontWeight:700,color:r.kind==='Deposit refunded'?'#13643a':'#5d1740'}},npMoney(r.amount),r.gst_amount>0&&h('small',{style:{display:'block',color:'#8a5a70',fontWeight:500}},`${npMoney(r.rent_amount)} + GST ${npMoney(r.gst_amount)}`)),
              h('td',null,r.paid_mode||'—'),h('td',null,r.reference||'—'),
              h('td',null,r.bill_path?h('button',{type:'button',className:'btn btn-secondary',onClick:async()=>{const er=await openSamaraStorageFile('expense-bills',r.bill_path,300,'Bill');if(er)setMsg(er)}},'🧾'):r.no_bill_reason?h('small',null,'No bill'):'—'),
              isRent&&h('td',null,canReceipt(r)&&h('div',{style:{display:'grid',gap:'4px',minWidth:'110px'}},
                h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>printReceipt(r),title:'Print the receipt for the owner to sign'},'🖨 Print'),
                r.signed_receipt_path
                  ?h(React.Fragment,null,h('button',{type:'button',className:'btn btn-secondary',style:{color:'#13643a',fontWeight:800},onClick:async()=>{const er=await openSamaraStorageFile('expense-bills',r.signed_receipt_path,300,'Signed rent receipt');if(er)setMsg(er)}},'✓ Signed'),
                     h('button',{type:'button',className:'btn btn-secondary',disabled:busy,style:{fontSize:'11px',padding:'2px 6px'},onClick:()=>removeSigned(r)},'Replace'))
                  :h('label',{className:'btn btn-primary',style:{cursor:busy?'wait':'pointer',margin:0,textAlign:'center'}},'⬆ Upload signed',h('input',{type:'file',accept:'image/*,application/pdf',disabled:busy,style:{display:'none'},onChange:e=>{const f=e.target.files&&e.target.files[0];e.target.value='';uploadSigned(r,f)}})),
                r.receipt_no&&h('small',{style:{color:'#8a5a70'}},r.receipt_no))),
              h('td',null,r.created_by_name||'—'),
              h('td',null,!r.voided_at&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>removeEntry(r)},'Remove'))))
              :h('tr',null,h('td',{colSpan:isRent?10:9,className:'empty-cell'},loading?'Loading…':pendingOnly?'No signed receipts pending in this period.':'No entries in this period.')))))))
    );
  }
  // 2.20.5: menu pages
  function GensetAccount(props){return h(RentalAccountPage,{...props,category:'Genset'})}
  function RentAccount(props){return h(RentalAccountPage,{...props,category:'Rent'})}
