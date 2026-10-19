  // 2.18.37: Pharmacy & Consumables — FRESH START of stock (Boomi, 19-10-2026). SQL 256.
  // The old stock numbers were entered by non-professionals. We start again WITHOUT erasing anything:
  //   1. ⤓ Excel backup of the current entries (any section, any time; required before the reset).
  //   2. Stock Reset (Admin / Director only): each item's balance → 0 by ONE permanent "Stock Reset"
  //      adjustment line; item names, codes, units and the Charge Master rate (MRP) stay as they are;
  //      every Guest-linked record (indents, charges, bills, Family Portal) is untouched.
  //   3. Fresh stock: Receive from Vendor (invoice auto-read) + "Opening Stock – Physical Count" for
  //      shelf stock without an invoice.
  //   4. Bill MRP ≠ Charge Master rate → the Charge Master rate is KEPT and the line goes to
  //      "MRP Review" for Admin / Director.
  const FRESH_START_SECTIONS=['Pharmacy','Consumables'];
  const PHYSICAL_COUNT_VENDOR='Opening Stock – Physical Count';
  const OPEN_INDENT_STATUSES=['Initiated','Approved','Partially Approved','Handed Over'];
  const isStoreAdminDirector=p=>p?.role==='Admin'||/director/i.test(String(p?.designation||''));
  const freshMoney=v=>v==null||v===''?'':`₹${Number(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const freshQty=v=>Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});

  // Read every row of a table (Supabase returns at most 1,000 rows per request).
  async function freshFetchAll(table,columns='*',order='id',build=null){
    const rows=[];
    for(let offset=0;;offset+=1000){
      let q=client.from(table).select(columns).order(order).range(offset,offset+999);
      if(build)q=build(q);
      const r=await q;
      if(r.error)throw new Error(`${table}: ${r.error.message}`);
      rows.push(...(r.data||[]));
      if((r.data||[]).length<1000)return rows;
    }
  }

  // SheetJS is loaded only when someone downloads (keeps the app light).
  let freshXlsxPromise=null;
  function loadXlsxLibrary(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    if(!freshXlsxPromise)freshXlsxPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.async=true;
      s.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('Excel library did not load.'));
      s.onerror=()=>{freshXlsxPromise=null;reject(new Error('Excel library could not be loaded — check the internet connection.'))};
      document.head.appendChild(s);
    });
    return freshXlsxPromise;
  }
  function freshCsv(rows){
    return rows.map(r=>r.map(v=>{const t=String(v??'');return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t}).join(',')).join('\r\n');
  }
  function freshSaveBlob(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},1500);
  }
  function freshFileStamp(){
    const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    const p=n=>String(n).padStart(2,'0');
    return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}_${p(d.getHours())}${p(d.getMinutes())}`;
  }
  // Workbook of the CURRENT entries for the chosen section(s): Current Stock, Vendor Receipts, Stock Movements, About.
  async function downloadStoresExcel({sections,profile,label}){
    const secs=(sections&&sections.length?sections:STORE_SECTION_NAMES);
    const [items,stock,receipts,ledger]=await Promise.all([
      freshFetchAll('consumable_store_items','*','item_name'),
      freshFetchAll('consumable_store_stock','*','item_id'),
      freshFetchAll('consumable_store_receipts','*','received_at'),
      freshFetchAll('consumable_store_ledger','*','movement_at')
    ]);
    const inSec=items.filter(i=>secs.includes(i.item_category||'Consumables'));
    const byId=new Map(inSec.map(i=>[i.id,i])),stockById=new Map(stock.map(s=>[s.item_id,s]));
    const sortItems=(a,b)=>String(a.item_category||'').localeCompare(String(b.item_category||''))||String(a.item_code||'').localeCompare(String(b.item_code||''))||String(a.item_name||'').localeCompare(String(b.item_name||''));
    const stockSheet=[['Section','Item Code','Item Name','Standard Category','Unit','Strength','Dosage Form','Charge Master Rate (₹)','Reorder Level','Total In','Total Out','Current Balance','Status','Last Movement']];
    [...inSec].sort(sortItems).forEach(i=>{const s=stockById.get(i.id)||{};stockSheet.push([i.item_category||'Consumables',i.item_code||'',displayStoreItemName(i.item_name),i.standard_category||'',i.unit||'',i.strength||'',i.dosage_form||'',i.charge_rate==null?'':Number(i.charge_rate),Number(i.reorder_level||0),Number(s.total_in||0),Number(s.total_out||0),Number(s.balance_qty||0),i.active===false?'Inactive':'Active',s.last_movement_at?formatDateTimeIN(s.last_movement_at):''])});
    const recSheet=[['Receipt No.','Received Date','Entered At','Section','Item Code','Item Name','Quantity','Unit','Vendor','Invoice No.','Invoice Date','Batch No.','Expiry Date','Unit Cost (₹)','Received By','Remarks']];
    receipts.filter(r=>byId.has(r.item_id)).sort((a,b)=>String(b.received_at||'').localeCompare(String(a.received_at||''))).forEach(r=>{const i=byId.get(r.item_id);recSheet.push([`SR-${String(r.receipt_no||'').padStart(5,'0')}`,r.received_date?formatDateIN(r.received_date):'',r.received_at?formatDateTimeIN(r.received_at):'',i.item_category||'Consumables',i.item_code||'',displayStoreItemName(i.item_name),Number(r.quantity||0),r.unit||i.unit||'',r.vendor_name||'',r.invoice_no||'',r.invoice_date?formatDateIN(r.invoice_date):'',r.batch_no||'',r.expiry_date?formatDateIN(r.expiry_date):'',r.unit_cost==null?'':Number(r.unit_cost),r.received_by_name||'',r.remarks||''])});
    const ledSheet=[['Movement No.','Date & Time','Section','Item Code','Item Name','Movement','Stock In','Stock Out','Balance After','Reference','Recorded By','Remarks']];
    ledger.filter(r=>byId.has(r.item_id)).sort((a,b)=>String(b.movement_at||'').localeCompare(String(a.movement_at||''))).forEach(r=>{const i=byId.get(r.item_id);ledSheet.push([`SM-${String(r.movement_no||'').padStart(6,'0')}`,r.movement_at?formatDateTimeIN(r.movement_at):'',i.item_category||'Consumables',i.item_code||'',displayStoreItemName(i.item_name),r.movement_type||'',Number(r.qty_in||0),Number(r.qty_out||0),r.balance_after==null?'':Number(r.balance_after),r.reference_text||'',r.actor_name||'',r.remarks||''])});
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const about=[['Samara Health Care — Pharmacy & Stores backup'],[''],['Sections',secs.join(', ')],['Downloaded on',formatDateTimeIN(new Date().toISOString())],['Downloaded by',who],['ERP version',APP_VERSION],['Items',inSec.length],['Vendor receipts',recSheet.length-1],['Stock movements',ledSheet.length-1],[''],['This file is a copy of the ERP entries at the time of download. Keep it safely.']];
    const base=`Samara_Stores_${(label||secs.join('_')).replace(/[^A-Za-z0-9]+/g,'_')}_${freshFileStamp()}`;
    try{
      const X=await loadXlsxLibrary(),wb=X.utils.book_new();
      const add=(rows,name,widths)=>{const ws=X.utils.aoa_to_sheet(rows);ws['!cols']=widths.map(w=>({wch:w}));if(rows.length>1)ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:rows[0].length-1}})};X.utils.book_append_sheet(wb,ws,name)};
      add(stockSheet,'Current Stock',[14,11,38,22,9,12,12,12,9,9,9,12,9,18]);
      add(recSheet,'Vendor Receipts',[11,12,18,13,11,36,9,9,26,14,12,12,12,10,18,40]);
      add(ledSheet,'Stock Movements',[12,18,13,11,36,16,8,8,10,40,18,40]);
      const wsA=X.utils.aoa_to_sheet(about);wsA['!cols']=[{wch:20},{wch:60}];X.utils.book_append_sheet(wb,wsA,'About');
      X.writeFile(wb,`${base}.xlsx`);
      return {format:'xlsx',items:inSec.length,receipts:recSheet.length-1,movements:ledSheet.length-1};
    }catch(e){
      // fallback: the stock list as a CSV file (opens in Excel)
      console.warn(e);
      freshSaveBlob(new Blob(['﻿'+freshCsv(stockSheet)],{type:'text/csv;charset=utf-8'}),`${base}_Current_Stock.csv`);
      return {format:'csv',items:inSec.length,warning:e.message};
    }
  }
  function StoresExcelButton({profile,sections,label,className='btn btn-secondary',text='⤓ Download Stock (Excel)',onDone}){
    const [busy,setBusy]=React.useState(false);
    async function run(){
      if(busy)return;setBusy(true);
      try{
        const r=await downloadStoresExcel({sections,profile,label});
        showSamaraActionToast('success','Excel downloaded',r.format==='xlsx'?`${r.items} item(s), ${r.receipts} receipt(s) and ${r.movements} movement(s) saved to the Excel file.`:`Excel library unavailable (${r.warning}). The current stock list was saved as a CSV file instead — it opens in Excel.`);
        try{writeAuditEvent('Download Stores Excel','ConsumableStore',null,{sections:sections||'All',format:r.format,items:r.items})}catch(_){}
        if(onDone)onDone(r);
      }catch(e){showSamaraActionToast('error','Excel download failed',e.message||'Please try again.')}
      finally{setBusy(false)}
    }
    return h('button',{type:'button',className,disabled:busy,onClick:run},busy?'Preparing Excel…':text);
  }

  // Latest reset per section (used by the dashboard tile, Physical Count and Expiry Watch).
  async function loadStoreResets(limit=20){
    const r=await client.from('store_stock_resets').select('*').order('reset_at',{ascending:false}).limit(limit);
    if(r.error)return {rows:[],missing:/store_stock_resets|does not exist|schema cache/i.test(r.error.message||''),error:r.error.message};
    return {rows:r.data||[]};
  }
  const lastResetFor=(rows,section)=>(rows||[]).find(x=>(x.sections||[]).includes(section))||null;

  // ───────────────────────── Backup & Fresh Start (dashboard box) ─────────────────────────
  function StoreFreshStart({profile,categoryFilter,onChanged}){
    const admin=isStoreAdminDirector(profile);
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [downloaded,setDownloaded]=React.useState(null);
    const [sections,setSections]=React.useState(FRESH_START_SECTIONS);
    const [reason,setReason]=React.useState('Fresh start: the stock entered earlier did not match the shelves. New stock from vendor invoices and physical count.');
    const [confirmText,setConfirmText]=React.useState(''),[result,setResult]=React.useState(null),[detail,setDetail]=React.useState(null);
    // 2.18.38: reset method — 'bills_minus_used' (Boomi's choice: scan all purchase bills; recorded Guest use is deducted) or 'zero' (physical count)
    const [mode,setMode]=React.useState('bills_minus_used');
    async function load(){
      setError('');
      try{
        const [items,stock,indents,resets,ledger]=await Promise.all([
          freshFetchAll('consumable_store_items','id,item_code,item_name,item_category,unit,active','item_name'),
          freshFetchAll('consumable_store_stock','item_id,balance_qty','item_id'),
          freshFetchAll('patient_consumable_indents','id,status,store_item_id,indent_no','id',q=>q.in('status',OPEN_INDENT_STATUSES)),
          loadStoreResets(),
          freshFetchAll('consumable_store_ledger','id,item_id,movement_type,qty_in,qty_out','id')
        ]);
        const used=new Map();
        ledger.forEach(l=>{const q=l.movement_type==='Patient Issue'||l.movement_type==='Department Issue'?Number(l.qty_out||0)-Number(l.qty_in||0):l.movement_type==='Return to Store'?-(Number(l.qty_in||0)-Number(l.qty_out||0)):0;if(q)used.set(l.item_id,(used.get(l.item_id)||0)+q)});
        setData({items,stock,indents,resets:resets.rows,resetsMissing:resets.missing,used});
      }catch(e){setError(e.message||'Could not load the stock.')}
    }
    React.useEffect(()=>{load()},[]);
    const stockById=new Map((data?.stock||[]).map(s=>[s.item_id,Number(s.balance_qty||0)]));
    const perSection=FRESH_START_SECTIONS.map(sec=>{
      const its=(data?.items||[]).filter(i=>(i.item_category||'Consumables')===sec);
      const nonZero=its.filter(i=>(stockById.get(i.id)||0)!==0);
      const ids=new Set(its.map(i=>i.id));
      const usedItems=its.filter(i=>(data?.used?.get(i.id)||0)!==0);
      return {sec,usedItems:usedItems.length,usedQty:usedItems.reduce((n,i)=>n+(data.used.get(i.id)||0),0),items:its.length,nonZero:nonZero.length,qty:nonZero.reduce((n,i)=>n+(stockById.get(i.id)||0),0),negative:nonZero.filter(i=>(stockById.get(i.id)||0)<0).length,openIndents:(data?.indents||[]).filter(x=>ids.has(x.store_item_id)).length,last:lastResetFor(data?.resets,sec)};
    });
    const chosen=perSection.filter(p=>sections.includes(p.sec));
    const openIndents=chosen.reduce((n,p)=>n+p.openIndents,0);
    const ready=admin&&downloaded&&sections.length&&reason.trim().length>=5&&confirmText.trim().toUpperCase()==='RESET'&&!busy;
    async function reset(){
      if(!ready)return;
      const byUse=mode==='bills_minus_used';
      const lines=chosen.map(p=>byUse?`${p.sec}: old purchases removed; ${p.usedItems} item(s) keep their recorded Guest use and start below zero`:`${p.sec}: ${p.nonZero} item(s) with a balance will be set to 0`).join('\n');
      if(!confirm(`${byUse?'Reset by "Bills − recorded use"':'Reset to ZERO'} — ${sections.join(' & ')}?\n\n${lines}${byUse?'\n\nThen scan ALL purchase bills (old and new) in Receive from Vendor — each item ends at purchased − used.':''}${openIndents?`\n\n⚠ ${openIndents} indent(s) are still open — they can be handed over only after fresh stock is entered.`:''}\n\nItem names, codes, MRP / Charge Master rates and all Guest records stay as they are. Nothing is deleted.`))return;
      setBusy(true);
      try{
        const r=await client.rpc('store_stock_reset',{p_sections:sections,p_reason:reason.trim(),p_backup_confirmed:true,p_mode:mode});
        if(r.error)throw new Error(/store_stock_reset|schema cache|could not find the function/i.test(r.error.message||'')?'The database update is not installed yet. Please run supabase/sql/257_stock_reset_bills_minus_used.sql once in Supabase.':r.error.message);
        setResult(r.data);setConfirmText('');
        try{writeAuditEvent('Stores Stock Reset','ConsumableStore',r.data?.reset_id||null,{sections,reason:reason.trim(),...(r.data||{}),excel_downloaded_at:downloaded})}catch(_){}
        showSamaraActionToast('success','Stock reset done',mode==='bills_minus_used'?`RST-${String(r.data?.reset_no||'').padStart(4,'0')}: old purchases removed, recorded Guest use kept. Now scan all purchase bills in Receive from Vendor.`:`RST-${String(r.data?.reset_no||'').padStart(4,'0')}: ${r.data?.items_adjusted||0} item(s) set to zero. Now enter the Physical Count and Receive from Vendor.`);
        await load();if(onChanged)onChanged();
      }catch(e){showSamaraActionToast('error','Stock reset not done',e.message||'Please try again.')}
      finally{setBusy(false)}
    }
    async function openReset(rs){
      setDetail({reset:rs,rows:null});
      const r=await client.from('store_stock_reset_items').select('*').eq('reset_id',rs.id).order('item_code');
      setDetail({reset:rs,rows:r.error?[]:r.data||[],error:r.error?.message});
    }
    function downloadSnapshot(rs,rows){
      const sheet=[['Section','Item Code','Item Name','Unit','Charge Master Rate (₹)','Total In before reset','Total Out before reset','Balance before reset','Recorded use (kept)','Balance after reset']];
      rows.forEach(x=>sheet.push([x.item_category,x.item_code||'',displayStoreItemName(x.item_name),x.unit||'',x.charge_rate==null?'':Number(x.charge_rate),Number(x.total_in||0),Number(x.total_out||0),Number(x.old_balance||0),x.used_net==null?'':Number(x.used_net),x.new_balance==null?0:Number(x.new_balance)]));
      const name=`Samara_Stock_Reset_RST-${String(rs.reset_no).padStart(4,'0')}_snapshot`;
      loadXlsxLibrary().then(X=>{const wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet(sheet);ws['!cols']=[14,11,38,9,12,12,12,12,10].map(w=>({wch:w}));X.utils.book_append_sheet(wb,ws,'Before reset');X.writeFile(wb,name+'.xlsx')})
        .catch(()=>freshSaveBlob(new Blob(['﻿'+freshCsv(sheet)],{type:'text/csv;charset=utf-8'}),name+'.csv'));
    }
    const step=(n,title,body,done)=>h('div',{className:'section-card',style:{borderLeft:`5px solid ${done?'#1b7a43':'#b30b5d'}`,margin:'0 0 12px'}},
      h('strong',{style:{display:'block',marginBottom:'6px'}},`${done?'✓':n+'.'} ${title}`),body);
    return h(Section,{title:'Backup & Fresh Start of Stock',subtitle:'Pharmacy and Consumables. Nothing is deleted: item names, codes, MRP / Charge Master rates and every Guest record stay as they are.'},
      error&&h('p',{role:'alert',className:'message error'},error),
      data?.resetsMissing&&h('p',{role:'alert',className:'message error'},'The Fresh Start database update is not installed yet. Please run supabase/sql/256_stock_fresh_start.sql once in Supabase (Excel backup works already).'),
      !data&&!error&&h('p',{role:'status'},'Loading the current stock…'),
      data&&h(React.Fragment,null,
        step(1,'Download the Excel backup of the current entries',h('div',null,
          h('p',{className:'small-note',style:{margin:'0 0 8px'}},'Current Stock, Vendor Receipts and Stock Movements of the chosen section(s), in one Excel file. Keep it safely before the reset.'),
          h(StoresExcelButton,{profile,sections,label:`${sections.join('_')}_before_reset`,className:'btn btn-primary',text:`⤓ Download Excel backup (${sections.join(' & ')||'choose a section'})`,onDone:r=>setDownloaded(new Date().toISOString())}),
          downloaded&&h('small',{style:{display:'block',marginTop:'6px',color:'#1b7a43',fontWeight:700}},`✓ Backup downloaded at ${formatDateTimeIN(downloaded)}`)),!!downloaded),
        step(2,'Check before the reset',h('div',null,
          h('div',{className:'table-wrap'},h('table',{className:'table'},
            h('thead',null,h('tr',null,['Reset?','Section','Items','Items with a balance now','Total balance now','Recorded Guest use (kept)','Open indents','Last reset'].map(x=>h('th',{key:x},x)))),
            h('tbody',null,perSection.map(p=>h('tr',{key:p.sec},
              h('td',null,h('input',{type:'checkbox','aria-label':`Reset ${p.sec}`,checked:sections.includes(p.sec),disabled:!admin||busy,onChange:e=>{setDownloaded(null);setSections(s=>e.target.checked?[...new Set([...s,p.sec])]:s.filter(x=>x!==p.sec))}})),
              h('td',null,h('strong',null,p.sec)),h('td',null,p.items),h('td',null,p.nonZero+(p.negative?` (${p.negative} below zero)`:'')),h('td',null,freshQty(p.qty)),
              h('td',null,`${p.usedItems} item(s) · ${freshQty(p.usedQty)}`),
              h('td',{style:p.openIndents?{color:'#a12f29',fontWeight:700}:null},p.openIndents),
              h('td',null,p.last?`RST-${String(p.last.reset_no).padStart(4,'0')} · ${formatDateTimeIN(p.last.reset_at)}`:'Never')))))),
          openIndents?h('p',{style:{color:'#a12f29',fontWeight:700,margin:'8px 0 0'}},`⚠ ${openIndents} indent(s) are still open (awaiting approval / handover / nurse receipt). Finish them first if possible — after the reset, a handover needs fresh stock entered.`):h('p',{className:'small-note',style:{margin:'8px 0 0'}},'No open indents. Please do not raise new indents until the fresh stock is entered.'),
          h('p',{className:'small-note',style:{margin:'6px 0 0'}},'Changing the sections clears step 1 — download the backup again for the new choice.')),false),
        step(3,'Reset the stock',admin?h('div',null,
          h('div',{className:'field'},h('label',null,'Method *'),
            [['bills_minus_used','Bills − recorded use (recommended)','Old purchase entries are removed; everything already given to Guests stays. Each item starts BELOW ZERO by what was used. Then scan ALL purchase bills (old and new) — each item ends at purchased − used = what should be on the shelf.'],
             ['zero','Zero, then physical count','Every item becomes 0. The Nursing Manager counts the shelf (Opening Stock – Physical Count); only NEW bills are scanned from now on.']].map(([v,l,d])=>
              h('label',{key:v,style:{display:'flex',gap:'8px',alignItems:'flex-start',margin:'6px 0',padding:'8px',border:`1px solid ${mode===v?'#b30b5d':'#ead2dd'}`,borderRadius:'10px',background:mode===v?'#fff4f9':'#fff',cursor:'pointer',fontWeight:400}},
                h('input',{type:'radio',name:'fresh-mode',checked:mode===v,onChange:()=>setMode(v),style:{marginTop:'3px'}}),h('span',null,h('strong',{style:{display:'block'}},l),h('small',null,d))))),
          h('div',{className:'field'},h('label',null,'Reason *'),h('textarea',{rows:2,value:reason,onChange:e=>setReason(e.target.value)})),
          h('div',{className:'field'},h('label',null,'Type RESET to confirm *'),h('input',{value:confirmText,onChange:e=>setConfirmText(e.target.value),placeholder:'RESET',autoComplete:'off',style:{maxWidth:'200px'}})),
          !downloaded&&h('small',{className:'error-text',style:{display:'block',marginBottom:'6px'}},'Download the Excel backup (step 1) first.'),
          h('button',{type:'button',className:'btn btn-danger',disabled:!ready,onClick:reset},busy?'Resetting…':`Reset ${sections.join(' & ')} stock${mode==='zero'?' to zero':' (bills − recorded use)'}`),
          result&&h('div',{style:SAMARA_SCAN.noteStyle('ok')},result.mode==='bills_minus_used'?`Done — RST-${String(result.reset_no||'').padStart(4,'0')}: old purchases removed, recorded Guest use kept (${result.items_adjusted} of ${result.items_total} item(s) adjusted). Next: scan ALL purchase bills in Receive from Vendor — for each line choose "Yes, same item" when asked, so the bill joins the same item code.`:`Done — RST-${String(result.reset_no||'').padStart(4,'0')}: ${result.items_adjusted} of ${result.items_total} item(s) set to zero (removed ${freshQty(result.qty_removed)}${Number(result.qty_added)?`, below-zero balances corrected by ${freshQty(result.qty_added)}`:''}). Next: Opening Stock – Physical Count, then Receive from Vendor.`))
          :h('p',{className:'small-note'},'Only Admin / Director can reset the stock. Anyone with Stores access can download the Excel backup.'),!!result),
        h('h4',{style:{margin:'16px 0 6px'}},'Reset history'),
        (data.resets||[]).length?h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Reset','Date & time','Sections','Method','Items adjusted','By','Reason'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,data.resets.map(rs=>h('tr',{key:rs.id,className:'row-clickable',tabIndex:0,onClick:()=>openReset(rs),onKeyDown:e=>{if(e.key==='Enter')openReset(rs)}},
            h('td',null,`RST-${String(rs.reset_no).padStart(4,'0')}`),h('td',null,formatDateTimeIN(rs.reset_at)),h('td',null,(rs.sections||[]).join(', ')),h('td',null,rs.mode==='bills_minus_used'?'Bills − recorded use':'Zero + physical count'),
            h('td',null,`${rs.items_adjusted} of ${rs.items_total}`),h('td',null,rs.reset_by_name||'—'),h('td',null,rs.reason)))))):h('p',{className:'small-note'},'No stock reset has been done yet.')
      ),
      detail&&h(RowDetailModal,{title:`RST-${String(detail.reset.reset_no).padStart(4,'0')} · Stock Reset`,subtitle:`${formatDateTimeIN(detail.reset.reset_at)} · ${(detail.reset.sections||[]).join(', ')}`,onClose:()=>setDetail(null),
        fields:[['Method',detail.reset.mode==='bills_minus_used'?'Bills − recorded use':'Zero + physical count'],['Done by',detail.reset.reset_by_name],['Reason',detail.reset.reason],['Items in sections',String(detail.reset.items_total)],['Items set to zero',String(detail.reset.items_adjusted)],['Quantity removed',freshQty(detail.reset.qty_removed)],['Below-zero corrected',freshQty(detail.reset.qty_added)],['Excel backup confirmed',detail.reset.backup_confirmed?'Yes':'No']]},
        detail.rows==null?h('p',null,'Loading the snapshot…'):h('div',null,
          detail.error&&h('p',{className:'message error'},detail.error),
          h('button',{type:'button',className:'btn btn-secondary',style:{margin:'4px 0 8px'},onClick:()=>downloadSnapshot(detail.reset,detail.rows)},'⤓ Download this snapshot (Excel)'),
          h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Code','Item','Unit','Rate','Balance before reset','Recorded use','Balance after reset'].map(x=>h('th',{key:x},x)))),
            h('tbody',null,detail.rows.filter(x=>Number(x.old_balance)!==0||Number(x.used_net||0)!==0).map(x=>h('tr',{key:x.id},h('td',null,x.item_code),h('td',null,displayStoreItemName(x.item_name)),h('td',null,x.unit),h('td',null,freshMoney(x.charge_rate)),h('td',null,freshQty(x.old_balance)),h('td',null,x.used_net==null?'—':freshQty(x.used_net)),h('td',null,x.new_balance==null?'0':freshQty(x.new_balance)))))))))
    );
  }

  // ───────────────────────── Opening Stock – Physical Count ─────────────────────────
  function StorePhysicalCount({profile,categoryFilter,onChanged}){
    const section=FRESH_START_SECTIONS.includes(categoryFilter)?categoryFilter:'Consumables';
    const authority=useStoreAuthority(profile);
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [query,setQuery]=React.useState(''),[pick,setPick]=React.useState(null),[showLeft,setShowLeft]=React.useState(false);
    const blank={quantity:'',batch_no:'',expiry_date:'',count_date:todayISOIndia(),remarks:'',new_name:'',new_unit:section==='Pharmacy'?'Tablets':'Nos'};
    const [form,setForm]=React.useState(blank);
    async function load(){
      setError('');
      try{
        const [items,stock,resets]=await Promise.all([
          freshFetchAll('consumable_store_items','id,item_code,item_name,item_category,unit,active,strength','item_name',q=>q.eq('item_category',section)),
          freshFetchAll('consumable_store_stock','item_id,balance_qty','item_id'),
          loadStoreResets()
        ]);
        const last=lastResetFor(resets.rows,section);
        const counts=await freshFetchAll('consumable_store_receipts','*','received_at',q=>{q=q.eq('vendor_name',PHYSICAL_COUNT_VENDOR);return last?q.gte('received_at',last.reset_at):q});
        setData({items,stock,last,counts:counts.filter(c=>items.some(i=>i.id===c.item_id)),resetsMissing:resets.missing});
      }catch(e){setError(e.message||'Could not load.')}
    }
    React.useEffect(()=>{load()},[]);
    const bal=new Map((data?.stock||[]).map(s=>[s.item_id,Number(s.balance_qty||0)]));
    const active=(data?.items||[]).filter(i=>i.active!==false);
    const countedIds=new Set((data?.counts||[]).map(c=>c.item_id));
    const q=query.trim().toLowerCase();
    const matches=q.length>=3?active.filter(i=>`${i.item_code||''} ${i.item_name||''}`.toLowerCase().includes(q)).slice(0,30):[];
    const notCounted=active.filter(i=>!countedIds.has(i.id)&&(bal.get(i.id)||0)<=0);
    const isNew=pick==='new';
    async function save(e){
      e.preventDefault();if(busy)return;
      const qty=Number(form.quantity);
      if(!pick)return showSamaraActionToast('error','Physical Count','Choose the item (search 3+ letters), or add it as a new item.');
      if(isNew&&!form.new_name.trim())return showSamaraActionToast('error','Physical Count','Enter the new item name.');
      if(isNew&&!STORE_UNITS.includes(form.new_unit))return showSamaraActionToast('error','Physical Count','Choose the unit.');
      if(!Number.isSafeInteger(qty)||qty<=0)return showSamaraActionToast('error','Physical Count','Enter the counted quantity as a whole number above zero.');
      const item=isNew?null:pick;
      if(item&&countedIds.has(item.id)&&!confirm(`${displayStoreItemName(item.item_name)} was already counted after the reset. Add ${qty} ${item.unit} more (for example another batch)?`))return;
      setBusy(true);
      const r=await client.rpc('store_opening_physical_count',{p_section:section,p_item_id:item?item.id:null,p_item_name:item?null:form.new_name.trim().replace(/\s+/g,' '),p_unit:item?item.unit:form.new_unit,p_quantity:qty,
        p_count_date:form.count_date||todayISOIndia(),p_batch_no:form.batch_no.trim()||null,p_expiry_date:form.expiry_date||null,p_remarks:form.remarks.trim()||null});
      setBusy(false);
      if(r.error)return showSamaraActionToast('error','Physical Count not saved',/store_opening_physical_count|schema cache|could not find the function/i.test(r.error.message||'')?'Please run supabase/sql/256_stock_fresh_start.sql once in Supabase.':r.error.message);
      showSamaraActionToast('success','Physical Count saved',`${qty} ${item?item.unit:form.new_unit} ${item?displayStoreItemName(item.item_name):form.new_name.trim()} added to ${section} stock.${isNew?' New item — Admin / Director fixes its Guest rate in Charge Master.':''}`);
      setForm({...blank,count_date:form.count_date});setPick(null);setQuery('');
      await load();if(onChanged)onChanged();
    }
    if(!authority.ready)return h(Section,{title:'Opening Stock – Physical Count'},h('p',null,'Loading…'));
    if(!authority.controller)return h(Section,{title:'Opening Stock – Physical Count'},h('p',null,'The physical count is entered by the Store In-charge (Nursing Manager), the same person who receives stock from vendors.'));
    const itemLabel=i=>`${i.item_code?i.item_code+' · ':''}${displayStoreItemName(i.item_name)} (${i.unit||'—'})`;
    return h(Section,{title:`${section} — Opening Stock – Physical Count`,subtitle:'For stock already on the shelf that has no invoice to scan. Count each item and enter it here (one line per batch if the expiry differs). Stock bought with an invoice goes through Receive from Vendor. No price is set or changed here.'},
      error&&h('p',{role:'alert',className:'message error'},error),
      data?.resetsMissing&&h('p',{role:'alert',className:'message error'},'Please run supabase/sql/256_stock_fresh_start.sql once in Supabase first.'),
      data&&h('div',{style:SAMARA_SCAN.noteStyle(data.last?'ok':'')},data.last?`Counting after the stock reset RST-${String(data.last.reset_no).padStart(4,'0')} of ${formatDateTimeIN(data.last.reset_at)} · ${countedIds.size} of ${active.length} item(s) counted so far.`:`No stock reset has been done for ${section} yet. Counts entered now are ADDED to the present balances — normally Admin / Director resets first (Backup & Fresh Start).`),
      h('form',{onSubmit:save,style:{marginTop:'10px'}},
        h('div',{className:'field'},h('label',null,'Item * (search 3+ letters of the name or code)'),
          h('input',{value:query,onChange:e=>{setQuery(e.target.value);setPick(null)},placeholder:section==='Pharmacy'?'Example: para, dolo, cremaf':'Example: glo, syr, und'}),
          pick&&!isNew&&h('small',{style:{color:'#1b7a43',fontWeight:700}},`✓ ${itemLabel(pick)} · balance now ${freshQty(bal.get(pick.id))}${countedIds.has(pick.id)?' · already counted after the reset':''}`),
          q.length>=3&&!pick&&h('div',{style:{marginTop:'6px',border:'1px solid #ead2dd',borderRadius:'10px',padding:'6px',maxHeight:'240px',overflowY:'auto',background:'#fff'}},
            matches.map(i=>h('button',{key:i.id,type:'button',className:'btn btn-secondary',style:{display:'block',width:'100%',textAlign:'left',margin:'3px 0'},onClick:()=>{setPick(i);setQuery(displayStoreItemName(i.item_name))}},`${itemLabel(i)}${countedIds.has(i.id)?' · ✓ counted':''}`)),
            h('button',{type:'button',className:'btn btn-secondary',style:{display:'block',width:'100%',textAlign:'left',margin:'3px 0',borderStyle:'dashed'},onClick:()=>{setPick('new');setForm(f=>({...f,new_name:query.trim()}))}},matches.length?'Not in this list — add as a NEW item':'No match — add as a NEW item'))),
        isNew&&h('div',{className:'grid two',style:{background:'#fff8e1',borderRadius:'10px',padding:'8px',margin:'6px 0'}},
          h('div',{className:'field'},h('label',null,'New item name *'),h('input',{value:form.new_name,onChange:e=>setForm({...form,new_name:e.target.value})})),
          h('div',{className:'field'},h('label',null,'Unit *'),h('select',{value:form.new_unit,onChange:e=>setForm({...form,new_unit:e.target.value})},STORE_UNITS.map(u=>h('option',{key:u,value:u},u)))),
          h('small',{className:'small-note',style:{gridColumn:'1 / -1'}},'The ERP gives the item code. It has no Guest rate until Admin / Director fixes it in Charge Master.')),
        h('div',{className:'grid two'},
          h('div',{className:'field'},h('label',null,`Quantity counted *${pick&&!isNew?` (${pick.unit})`:''}`),h('input',{type:'number',min:'1',step:'1',inputMode:'numeric',value:form.quantity,onChange:e=>setForm({...form,quantity:e.target.value})})),
          h('div',{className:'field'},h('label',null,'Count date *'),h(StrictDateInput,{value:form.count_date,onChange:e=>setForm({...form,count_date:e.target.value})})),
          h('div',{className:'field'},h('label',null,'Batch / Lot No.'),h('input',{value:form.batch_no,onChange:e=>setForm({...form,batch_no:e.target.value})})),
          h('div',{className:'field'},h('label',null,'Expiry Date'),h(StrictDateInput,{value:form.expiry_date,onChange:e=>setForm({...form,expiry_date:e.target.value})}),h('small',null,'From the strip / box. Can be added later with the Expiry button.')),
          h('div',{className:'field',style:{gridColumn:'1 / -1'}},h('label',null,'Remarks'),h('input',{value:form.remarks,onChange:e=>setForm({...form,remarks:e.target.value}),placeholder:'Optional — e.g. shelf / cupboard'}))),
        h('button',{className:'btn btn-primary',disabled:busy||!data},busy?'Saving…':'Save count into stock')),
      data&&h(React.Fragment,null,
        h('h4',{style:{margin:'18px 0 6px'}},`Counted${data.last?' after the reset':''} (${data.counts.length})`),
        data.counts.length?h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Date','Item','Quantity','Batch','Expiry','Entered by'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,[...data.counts].sort((a,b)=>String(b.received_at||'').localeCompare(String(a.received_at||''))).map(c=>{const i=data.items.find(x=>x.id===c.item_id)||{};return h('tr',{key:c.id},
            h('td',null,formatDateIN(c.received_date)),h('td',null,itemLabel(i)),h('td',null,`${freshQty(c.quantity)} ${c.unit||i.unit||''}`),h('td',null,c.batch_no||'—'),h('td',null,c.expiry_date?formatDateIN(c.expiry_date):'—'),h('td',null,c.received_by_name||'—'))})))):h('p',{className:'small-note'},'Nothing counted yet.'),
        h('button',{type:'button',className:'btn btn-secondary',style:{marginTop:'10px'},onClick:()=>setShowLeft(v=>!v)},showLeft?'Hide items not yet counted':`Show items not yet counted and with no stock (${notCounted.length})`),
        showLeft&&h('div',{className:'table-wrap',style:{marginTop:'8px'}},h('table',{className:'table'},h('thead',null,h('tr',null,['Item','Unit','Action'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,notCounted.map(i=>h('tr',{key:i.id},h('td',null,`${i.item_code||''} · ${displayStoreItemName(i.item_name)}`),h('td',null,i.unit),h('td',null,h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPick(i);setQuery(displayStoreItemName(i.item_name));window.scrollTo({top:0,behavior:'smooth'})}},'Count')))))))
      )
    );
  }

  // ───────────────────────── MRP Review (Admin / Director) ─────────────────────────
  function StoreMrpReview({profile,categoryFilter,onChanged}){
    const admin=isStoreAdminDirector(profile);
    const [rows,setRows]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[tab,setTab]=React.useState('Open');
    async function load(){
      const r=await client.from('store_mrp_reviews').select('*').order('flagged_at',{ascending:false}).limit(500);
      if(r.error){setError(/store_mrp_reviews|does not exist|schema cache/i.test(r.error.message||'')?'Please run supabase/sql/256_stock_fresh_start.sql once in Supabase.':r.error.message);setRows([]);return}
      const items=await client.from('consumable_store_items').select('id,charge_rate,unit,item_category');
      const live=new Map((items.data||[]).map(i=>[i.id,i]));
      setRows((r.data||[]).map(x=>({...x,live:live.get(x.item_id)})).filter(x=>!categoryFilter||(x.item_category||x.live?.item_category)===categoryFilter));
    }
    React.useEffect(()=>{load()},[]);
    async function decide(x,decision){
      let rate=null;
      if(decision==='change'){const v=prompt(`New Guest rate (Charge Master) for ${x.item_name}, per ${x.unit||x.live?.unit||'unit'}:\n\nBill MRP: ${freshMoney(x.bill_mrp)}${x.pack_size?` (pack ${x.pack_size})`:''}\nCharge Master now: ${freshMoney(x.live?.charge_rate)||'no rate'}`,x.bill_mrp==null?'':String(x.bill_mrp));if(v===null)return;rate=Number(v);if(!Number.isFinite(rate)||rate<0)return showSamaraActionToast('error','MRP Review','Enter a valid rate of zero or more.')}
      else if(!confirm(`Keep the Charge Master rate ${freshMoney(x.live?.charge_rate)||'(none yet)'} for ${x.item_name}?`))return;
      setBusy(true);const r=await client.rpc('store_mrp_review_decide',{p_review_id:x.id,p_decision:decision,p_new_rate:rate,p_note:null});setBusy(false);
      if(r.error)return showSamaraActionToast('error','MRP Review',r.error.message);
      showSamaraActionToast('success','MRP Review',decision==='change'?`Charge Master rate set to ${freshMoney(rate)}.`:'Charge Master rate kept.');
      await load();if(onChanged)onChanged();
    }
    const shown=(rows||[]).filter(x=>tab==='Open'?x.status==='Open':x.status!=='Open');
    return h(Section,{title:`${categoryFilter?categoryFilter+' — ':''}MRP Review (bill vs Charge Master)`,subtitle:'When a supplier bill shows an MRP different from the Charge Master rate (or a new item has no rate yet), the Charge Master rate is kept and the line comes here. Only Admin / Director can change the Guest rate.',
      actions:h('div',{className:'stores-mode-switch',role:'tablist'},['Open','Closed'].map(t=>h('button',{key:t,type:'button',className:tab===t?'active':'',onClick:()=>setTab(t)},t)))},
      error&&h('p',{role:'alert',className:'message error'},error),
      rows==null?h('p',null,'Loading…'):shown.length?h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,['Item','Bill MRP','Charge Master rate now','Bill','Flagged',tab==='Open'?'Decision':'Closed'].map(c=>h('th',{key:c},c)))),
        h('tbody',null,shown.map(x=>h('tr',{key:x.id},
          h('td',null,h('strong',null,`${x.item_code?x.item_code+' · ':''}${displayStoreItemName(x.item_name)}`),h('div',{className:'small-note'},[x.unit||x.live?.unit,x.pack_size&&`pack ${x.pack_size}`].filter(Boolean).join(' · '))),
          h('td',null,freshMoney(x.bill_mrp)),
          h('td',null,x.live?.charge_rate!=null&&Number(x.live.charge_rate)>0?freshMoney(x.live.charge_rate):h('span',{style:{color:'#9a6700',fontWeight:700}},'No rate yet')),
          h('td',null,[x.vendor_name,x.invoice_no&&`Inv ${x.invoice_no}`,x.invoice_date&&formatDateIN(x.invoice_date)].filter(Boolean).join(' · ')||'—'),
          h('td',null,`${x.flagged_by_name||'—'} · ${formatDateTimeIN(x.flagged_at)}`),
          h('td',null,x.status==='Open'?(admin?h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},
            h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>decide(x,'keep')},'Keep rate'),
            h('button',{type:'button',className:'btn btn-primary',disabled:busy||!x.item_id,onClick:()=>decide(x,'change')},'Set new rate')):'Waiting for Admin / Director')
            :`${x.status}${x.new_rate!=null?` → ${freshMoney(x.new_rate)}`:''} · ${x.decided_by_name||''} · ${x.decided_at?formatDateTimeIN(x.decided_at):''}`)))))):h('p',{className:'small-note'},tab==='Open'?'No MRP differences waiting for review.':'No closed reviews yet.')
    );
  }
