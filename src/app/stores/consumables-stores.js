  function ConsumablesStores({profile,categoryFilter=''}){
    const authority=useStoreAuthority(profile);
    const controller=authority.controller;
    const canEditChargeRate=isNursingManagerProfile(profile)||profile?.role==='Admin'||profile?.role==='Manager';
    const oversight=['Admin','Manager'].includes(profile?.role);
    const [stock,setStock]=React.useState([]),[receipts,setReceipts]=React.useState([]),[ledger,setLedger]=React.useState([]),[patients,setPatients]=React.useState([]),[itemMaster,setItemMaster]=React.useState([]);
    const [busy,setBusy]=React.useState(false);
    const [stockSearch,setStockSearch]=React.useState('');
    const [stockView,setStockView]=React.useState('All');
    const [movementPeriod,setMovementPeriod]=React.useState('month'),[movementItem,setMovementItem]=React.useState('All'),[movementFrom,setMovementFrom]=React.useState(todayISOIndia().slice(0,8)+'01'),[movementTo,setMovementTo]=React.useState(todayISOIndia());
    const [historyItem,setHistoryItem]=React.useState(null),[historyLedger,setHistoryLedger]=React.useState([]),[historyReceipts,setHistoryReceipts]=React.useState([]),[historyBusy,setHistoryBusy]=React.useState(false);
    const [form,setForm]=React.useState({item_category:categoryFilter==='Pharmacy'?'Pharmacy':'Stores / Consumables',catalog_item:'',item_id:'',new_item_name:'',unit:'Nos',vendor_name:'',invoice_no:'',invoice_date:'',received_date:todayISOIndia(),quantity:'1',batch_no:'',expiry_date:'',unit_cost:'',remarks:'',generic_name:'',brand_name:'',strength:'',dosage_form:'Tablet',manufacturer:'',pack_size:''});
    const units=['Nos','Pairs','Packs','Boxes','Pieces','Rolls','Sets','Bottles'];
    const basicPharmacyUnits={"Glucometer Strips": "Nos", "Lancets": "Nos", "Alcohol Swabs": "Nos", "Digital Thermometer": "Nos", "Thermometer Probe Covers": "Nos", "Pulse Oximeter": "Nos", "BP Cuff / Spare Cuff": "Nos", "Sterile Gauze Pads - 2 x 2": "Nos", "Sterile Gauze Pads - 4 x 4": "Nos", "Cotton Rolls": "Rolls", "Cotton Balls": "Nos", "Micropore Adhesive Tape": "Rolls", "Sterile Dressing Pads": "Nos", "Crepe Bandage - 2 inch": "Rolls", "Crepe Bandage - 4 inch": "Rolls", "Crepe Bandage - 6 inch": "Rolls", "Roller / Gauze Bandages": "Rolls", "Disposable Examination Gloves - S": "Pieces", "Disposable Examination Gloves - M": "Pieces", "Disposable Examination Gloves - L": "Pieces", "Surgical Masks": "Nos", "Disposable Syringe - 1 mL": "Nos", "Disposable Syringe - 2 mL": "Nos", "Disposable Syringe - 3 mL": "Nos", "Disposable Syringe - 5 mL": "Nos", "Disposable Syringe - 10 mL": "Nos", "Disposable Syringe - 20 mL": "Nos", "Needle - 18G": "Nos", "Needle - 20G": "Nos", "Needle - 21G": "Nos", "Needle - 22G": "Nos", "Needle - 23G": "Nos", "Needle - 24G": "Nos", "Needle - 25G": "Nos", "Needle - 26G": "Nos", "Insulin Syringe - U-40": "Nos", "Insulin Syringe - U-100": "Nos", "Insulin Pen Needle - 4 mm": "Nos", "Insulin Pen Needle - 5 mm": "Nos", "Insulin Pen Needle - 6 mm": "Nos", "Insulin Pen Needle - 8 mm": "Nos", "IV Cannula - 18G": "Nos", "IV Cannula - 20G": "Nos", "IV Cannula - 22G": "Nos", "IV Cannula - 24G": "Nos", "IV Sets": "Nos", "IV Extension Lines": "Nos", "Normal Saline Flush Syringes": "Nos", "Urine Specimen Containers": "Nos", "Disposable Urine Measuring Containers": "Nos", "Adult Urine Bags": "Nos", "Nebulizer Mask / Kit - Adult": "Nos", "Oxygen Nasal Cannula": "Nos", "Oxygen Masks": "Nos", "Suction Catheter - 10 Fr": "Nos", "Suction Catheter - 12 Fr": "Nos", "Suction Catheter - 14 Fr": "Nos", "Suction Catheter - 16 Fr": "Nos", "Feeding Syringe - 50 mL": "Nos", "Feeding Syringe - 60 mL": "Nos", "Disposable Underpads": "Nos", "Tongue Depressors": "Nos", "Hand Sanitizer": "Bottles", "Povidone-iodine Solution": "Bottles", "Chlorhexidine Antiseptic - As per Samara Protocol": "Bottles", "Normal Saline for Wound Cleansing": "Bottles", "Sharps Disposal Containers": "Nos", "Biomedical-waste Bags": "Nos"};
    const storesCatalog=['Adult Diapers','Underpads','Examination Gloves','Sterile Gloves','Surgical Masks','N95 Masks','PPE Kits','Cotton','Gauze','Cotton Rolls','Gauze Rolls','Adhesive Plaster','Micropore Tape','Dressing Pads','Bandages','Crepe Bandages','Syringes','Needles','IV Cannulas','IV Sets','Three-Way Cannulas','Urine Bags','Urinary Catheters','Ryle’s / NG Tubes','Feeding Tubes','Feeding Syringes','Suction Catheters','Tracheostomy Tubes','Tracheostomy Masks','Oxygen Masks','Nasal Cannulas','Nebulizer Masks','Disposable Aprons','Hand Sanitizer','Disinfectant Solution','Bed Linens','Patient Gowns','Tissue Paper','Wet Wipes','Garbage Bags','Biomedical Waste Bags','Cleaning Materials','Other Consumables'];
    const pharmacyCatalog=[...["Glucometer Strips", "Lancets", "Alcohol Swabs", "Digital Thermometer", "Thermometer Probe Covers", "Pulse Oximeter", "BP Cuff / Spare Cuff", "Sterile Gauze Pads - 2 x 2", "Sterile Gauze Pads - 4 x 4", "Cotton Rolls", "Cotton Balls", "Micropore Adhesive Tape", "Sterile Dressing Pads", "Crepe Bandage - 2 inch", "Crepe Bandage - 4 inch", "Crepe Bandage - 6 inch", "Roller / Gauze Bandages", "Disposable Examination Gloves - S", "Disposable Examination Gloves - M", "Disposable Examination Gloves - L", "Surgical Masks", "Disposable Syringe - 1 mL", "Disposable Syringe - 2 mL", "Disposable Syringe - 3 mL", "Disposable Syringe - 5 mL", "Disposable Syringe - 10 mL", "Disposable Syringe - 20 mL", "Needle - 18G", "Needle - 20G", "Needle - 21G", "Needle - 22G", "Needle - 23G", "Needle - 24G", "Needle - 25G", "Needle - 26G", "Insulin Syringe - U-40", "Insulin Syringe - U-100", "Insulin Pen Needle - 4 mm", "Insulin Pen Needle - 5 mm", "Insulin Pen Needle - 6 mm", "Insulin Pen Needle - 8 mm", "IV Cannula - 18G", "IV Cannula - 20G", "IV Cannula - 22G", "IV Cannula - 24G", "IV Sets", "IV Extension Lines", "Normal Saline Flush Syringes", "Urine Specimen Containers", "Disposable Urine Measuring Containers", "Adult Urine Bags", "Nebulizer Mask / Kit - Adult", "Oxygen Nasal Cannula", "Oxygen Masks", "Suction Catheter - 10 Fr", "Suction Catheter - 12 Fr", "Suction Catheter - 14 Fr", "Suction Catheter - 16 Fr", "Feeding Syringe - 50 mL", "Feeding Syringe - 60 mL", "Disposable Underpads", "Tongue Depressors", "Hand Sanitizer", "Povidone-iodine Solution", "Chlorhexidine Antiseptic - As per Samara Protocol", "Normal Saline for Wound Cleansing", "Sharps Disposal Containers", "Biomedical-waste Bags"],'Tablets','Capsules','Syrups','Oral Drops','Injections','IV Fluids','Antibiotics','Analgesics / Pain Medicines','Antipyretics / Fever Medicines','Antacids','Antiemetics','Antihypertensives','Antidiabetic Medicines','Insulin','Anticoagulants','Respiratory Medicines','Nebulization Medicines','Antiseptic Solutions','Ointments','Creams','Eye Drops','Ear Drops','Nasal Drops / Sprays','Laxatives','Nutritional Supplements','Electrolyte Preparations','Emergency Medicines','Other Pharmacy Items'];
    const actor=formalName(profile)||profile?.full_name||profile?.login_id||profile?.role||'Staff';
    const notifyStore=(type,text)=>showSamaraActionToast(type,type==='success'?'Stores updated':'Stores action failed',text);
    const itemById=id=>stock.find(x=>x.item_id===id);
    const patientName=id=>{const p=patients.find(x=>x.id===id);return p?(formalName(p)||p.full_name||p.patient_id||'Patient'):'—'};
    async function load(){
      const [sRes,rRes,lRes,pRes,mRes]=await Promise.all([
        client.from('consumable_store_stock').select('*').order('item_name'),
        client.from('consumable_store_receipts').select('*').order('received_at',{ascending:false}).limit(150),
        client.from('consumable_store_ledger').select('*').order('movement_at',{ascending:false}).limit(5000),
        client.from('patients').select('id,title,full_name,patient_id').order('full_name').limit(1000),
        client.from('consumable_store_items').select('id,item_code,item_name,unit,active,item_category,strength,dosage_form,charge_rate').order('item_name')
      ]);
      if(sRes.error){console.warn(sRes.error);notifyStore('error','Stores database is not installed yet. Please run 91_consumables_store_inventory.sql once in Supabase.')} else setStock(sRes.data||[]);
      if(!rRes.error)setReceipts(rRes.data||[]);
      if(!lRes.error)setLedger(lRes.data||[]);
      if(!pRes.error)setPatients(pRes.data||[]); if(!mRes.error)setItemMaster(mRes.data||[]);
    }
    React.useEffect(()=>{load()},[]);
    function selectItem(id){const row=itemById(id);setForm(f=>({...f,item_id:id,catalog_item:'',new_item_name:'',unit:row?.unit||f.unit}))}
    function selectCatalogItem(name){setForm(f=>({...f,catalog_item:name,item_id:'',new_item_name:name,unit:basicPharmacyUnits[name]||(f.item_category==='Pharmacy'?'Packs':f.unit)}))}
    async function receiveStock(e){
      e.preventDefault();if(!controller||busy)return;
      if(!form.item_id&&!String(form.new_item_name||'').trim()){notifyStore('error','Select an item or enter a new item name.');return}
      if(!String(form.vendor_name||'').trim()||Number(form.quantity)<=0){notifyStore('error','Vendor and valid received quantity are required.');return}
      setBusy(true);
      const res=await client.rpc('receive_consumable_store_stock',{
        p_item_id:form.item_id||null,p_item_name:String(form.new_item_name||'').trim()||null,p_unit:form.unit||'Nos',p_vendor_name:String(form.vendor_name||'').trim(),
        p_invoice_no:String(form.invoice_no||'').trim()||null,p_invoice_date:form.invoice_date||null,p_received_date:form.received_date||todayISOIndia(),p_quantity:Number(form.quantity),
        p_batch_no:String(form.batch_no||'').trim()||null,p_expiry_date:form.expiry_date||null,p_unit_cost:String(form.unit_cost).trim()===''?null:Number(form.unit_cost),p_remarks:[form.item_category==='Pharmacy'?'Category: Pharmacy':'Category: Stores / Consumables',form.generic_name&&`Generic: ${form.generic_name}`,form.brand_name&&`Brand: ${form.brand_name}`,form.strength&&`Strength: ${form.strength}`,form.dosage_form&&form.item_category==='Pharmacy'&&`Dosage form: ${form.dosage_form}`,form.manufacturer&&`Manufacturer: ${form.manufacturer}`,form.pack_size&&`Pack size: ${form.pack_size}`,String(form.remarks||'').trim()].filter(Boolean).join(' | ')||null
      });
      setBusy(false);
      if(res.error)notifyStore('error',res.error.message);else{notifyStore('success',`${form.item_category} item received from ${form.vendor_name}.`);setForm(f=>({...f,catalog_item:'',item_id:'',new_item_name:'',vendor_name:'',invoice_no:'',invoice_date:'',received_date:todayISOIndia(),quantity:'1',batch_no:'',expiry_date:'',unit_cost:'',remarks:'',generic_name:'',brand_name:'',strength:'',manufacturer:'',pack_size:''}));await load()}
    }
    async function setReorder(row){
      if(!controller||busy)return;const input=prompt(`Minimum / reorder level for ${row.item_name}:`,String(row.reorder_level||0));if(input===null)return;
      const level=Number(input);if(!Number.isFinite(level)||level<0){notifyStore('error','Enter zero or a valid positive reorder level.');return}
      setBusy(true);const res=await client.rpc('update_consumable_reorder_level',{p_item_id:row.item_id,p_reorder_level:level});setBusy(false);
      if(res.error)notifyStore('error',res.error.message);else{notifyStore('success','Reorder level updated.');await load()}
    }
    async function reconcile(row){
      if(!controller||busy)return;const input=prompt(`ERP balance: ${row.balance_qty} ${row.unit}. Enter PHYSICAL stock counted:`,String(row.balance_qty));if(input===null)return;
      const qty=Number(input);if(!Number.isFinite(qty)||qty<0){notifyStore('error','Enter a valid physical stock quantity.');return}
      if(qty===Number(row.balance_qty)){notifyStore('success','Physical stock already tallies with ERP balance.');return}
      const reason=prompt('Reason for stock difference / reconciliation:','Physical stock verification');if(!String(reason||'').trim())return;
      setBusy(true);const res=await client.rpc('reconcile_consumable_store_stock',{p_item_id:row.item_id,p_physical_qty:qty,p_reason:String(reason).trim()});setBusy(false);
      if(res.error)notifyStore('error',res.error.message);else{notifyStore('success','Physical stock reconciled with a permanent ledger entry.');await load()}
    }
    const masterById=new Map(itemMaster.map(x=>[x.id,x]));
    const categoryStock=categoryFilter?stock.filter(x=>(masterById.get(x.item_id)?.item_category||'Consumables')===categoryFilter):stock;
    const stockSearchText=stockSearch.trim().toLowerCase();
    const searchedStock=stockSearchText.length>=3?categoryStock.filter(x=>String(x.item_name||'').toLowerCase().includes(stockSearchText)):categoryStock;
    const viewFilteredStock=searchedStock.filter(x=>stockView==='In Stock'?Number(x.balance_qty)>0:stockView==='Low Stock'?(Number(x.balance_qty)>0&&Number(x.reorder_level)>0&&Number(x.balance_qty)<=Number(x.reorder_level)):stockView==='Out of Stock'?Number(x.balance_qty)<=0:true);
    const displayStock=viewFilteredStock;
    const categoryIds=new Set(categoryStock.map(x=>x.item_id));
    const displayReceipts=categoryFilter?receipts.filter(x=>categoryIds.has(x.item_id)):receipts;
    const displayLedger=categoryFilter?ledger.filter(x=>categoryIds.has(x.item_id)):ledger;
    function movementDateOnly(value){return String(value||'').slice(0,10)}
    function periodBounds(){
      const today=todayISOIndia(); const d=new Date(`${today}T12:00:00`); let from=today,to=today;
      if(movementPeriod==='yesterday'){d.setDate(d.getDate()-1);from=to=d.toISOString().slice(0,10)}
      else if(movementPeriod==='week'){const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);from=d.toISOString().slice(0,10)}
      else if(movementPeriod==='month'){from=today.slice(0,8)+'01'}
      else if(movementPeriod==='lastmonth'){const first=new Date(`${today.slice(0,8)}01T12:00:00`);first.setMonth(first.getMonth()-1);from=first.toISOString().slice(0,10);const last=new Date(first);last.setMonth(last.getMonth()+1);last.setDate(0);to=last.toISOString().slice(0,10)}
      else if(movementPeriod==='custom'){from=movementFrom||today;to=movementTo||today}
      return {from,to};
    }
    const movementBounds=periodBounds();
    const movementCategoryLedger=displayLedger;
    const movementSelectedLedger=movementCategoryLedger.filter(r=>(movementItem==='All'||String(r.item_id)===String(movementItem))&&movementDateOnly(r.movement_at)>=movementBounds.from&&movementDateOnly(r.movement_at)<=movementBounds.to);
    const movementSummaryItems=(movementItem==='All'?categoryStock:categoryStock.filter(x=>String(x.item_id)===String(movementItem))).map(item=>{
      const before=movementCategoryLedger.filter(r=>String(r.item_id)===String(item.item_id)&&movementDateOnly(r.movement_at)<movementBounds.from).sort((a,b)=>String(b.movement_at||'').localeCompare(String(a.movement_at||'')))[0];
      const rows=movementSelectedLedger.filter(r=>String(r.item_id)===String(item.item_id));
      const first=[...rows].sort((a,b)=>String(a.movement_at||'').localeCompare(String(b.movement_at||'')))[0];
      const opening=before!=null?Number(before.balance_after||0):(first?Number(first.balance_after||0)-Number(first.qty_in||0)+Number(first.qty_out||0):Number(item.balance_qty||0));
      const received=rows.filter(r=>Number(r.qty_in)>0&&!/return/i.test(String(r.movement_type||''))).reduce((a,r)=>a+Number(r.qty_in||0),0);
      const returned=rows.filter(r=>Number(r.qty_in)>0&&/return/i.test(String(r.movement_type||''))).reduce((a,r)=>a+Number(r.qty_in||0),0);
      const handed=rows.reduce((a,r)=>a+Number(r.qty_out||0),0);
      return {...item,opening,received,handed,returned,closing:opening+received+returned-handed};
    });
    async function openItemHistory(row){
      setHistoryItem(row);setHistoryBusy(true);setHistoryLedger([]);setHistoryReceipts([]);
      const [l,r]=await Promise.all([
        client.from('consumable_store_ledger').select('*').eq('item_id',row.item_id).order('movement_at',{ascending:false}).limit(1000),
        client.from('consumable_store_receipts').select('*').eq('item_id',row.item_id).order('received_at',{ascending:false}).limit(500)
      ]);
      if(!l.error)setHistoryLedger(l.data||[]);if(!r.error)setHistoryReceipts(r.data||[]);setHistoryBusy(false);
    }
    function showStockView(view){setStockView(view);setTimeout(()=>document.getElementById('stores-current-stock')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
    async function editStoreItem(row){
      if(!controller)return;
      const master=masterById.get(row.item_id); if(!master)return notifyStore('error','Stores Master record not found. Refresh and try again.');
      const name=prompt('Item name:',master.item_name||''); if(name===null)return;
      const unit=prompt('Unit:',master.unit||'Nos'); if(unit===null)return;
      const strength=prompt('Strength / specification:',master.strength||''); if(strength===null)return;
      const dosage=prompt('Dosage form:',master.dosage_form||''); if(dosage===null)return;
      setBusy(true); const res=await client.rpc('store_incharge_edit_item',{p_item_id:master.id,p_item_name:String(name).trim(),p_unit:String(unit).trim(),p_strength:String(strength).trim()||null,p_dosage_form:String(dosage).trim()||null}); setBusy(false);
      if(res.error)notifyStore('error',res.error.message); else {notifyStore('success','Item details updated.');await load()}
    }
    async function editStoreChargeRate(row){
      if(!controller)return;
      const master=masterById.get(row.item_id); if(!master)return notifyStore('error','Stores Master record not found. Refresh and try again.');
      const input=prompt(`Charge rate for ${master.item_name}:`,String(master.charge_rate??0)); if(input===null)return;
      const rate=Number(input); if(!Number.isFinite(rate)||rate<0)return notifyStore('error','Enter a valid charge rate of zero or more.');
      setBusy(true); const res=await client.rpc('store_incharge_set_store_item_charge_rate',{p_item_id:master.id,p_charge_rate:rate}); setBusy(false);
      if(res.error)notifyStore('error',res.error.message); else {notifyStore('success','Charge rate updated for future patient charges. Previous patient charges are unchanged.');await load()}
    }
    const low=categoryStock.filter(x=>Number(x.balance_qty)>0&&Number(x.reorder_level)>0&&Number(x.balance_qty)<=Number(x.reorder_level));
    const out=categoryStock.filter(x=>Number(x.balance_qty)<=0);
    const inStock=categoryStock.filter(x=>Number(x.balance_qty)>0).length;
    const stockStatus=row=>Number(row.balance_qty)<=0?'OUT OF STOCK':(Number(row.reorder_level)>0&&Number(row.balance_qty)<=Number(row.reorder_level)?'LOW STOCK':'IN STOCK');
    const statusStyle=row=>({fontWeight:900,fontSize:'12px',padding:'5px 8px',borderRadius:'999px',display:'inline-block',background:Number(row.balance_qty)<=0?'#fdebec':(Number(row.reorder_level)>0&&Number(row.balance_qty)<=Number(row.reorder_level)?'#fff4dc':'#e7f6ef'),color:'#5d3146'});
    if(!controller&&!oversight)return h('div',null,h(Section,{title:'Pharmacy & Stores'},h('p',null,authority.active?'Pharmacy & Stores is presently assigned to the STD.':'Pharmacy & Stores access is assigned to the Nurse Manager.')));
    return h('div',null,
      h(Section,{title:categoryFilter||'Pharmacy & Stores',subtitle:`${categoryFilter==='Pharmacy'?'Medicines and pharmacy stock':categoryFilter==='Consumables'?'Patient consumables and general store stock':'Medicines, consumables, vendor receipts, stock issues and balances'}. Current In-charge: ${authority.active?'STD (temporary assignment)':'Nurse Manager'}.`},
        h('div',{className:'grid stats'},
          h('button',{type:'button',className:'card stat',onClick:()=>showStockView('In Stock'),style:{width:'100%',textAlign:'left',cursor:'pointer',fontFamily:'inherit',border:stockView==='In Stock'?'2px solid #b30b5d':'1px solid #ead2dd'}},h('span',null,'Items in Stock'),h('strong',null,inStock),h('small',{style:{display:'block',marginTop:'6px',fontWeight:800,color:'#9b1456'}},'Tap to view →')),
          h('button',{type:'button',className:'card stat',onClick:()=>showStockView('Low Stock'),style:{width:'100%',textAlign:'left',cursor:'pointer',fontFamily:'inherit',border:stockView==='Low Stock'?'2px solid #b30b5d':'1px solid #ead2dd'}},h('span',null,'Low Stock'),h('strong',null,low.length),h('small',{style:{display:'block',marginTop:'6px',fontWeight:800,color:'#9b1456'}},'Tap to view →')),
          h('button',{type:'button',className:'card stat',onClick:()=>showStockView('Out of Stock'),style:{width:'100%',textAlign:'left',cursor:'pointer',fontFamily:'inherit',border:stockView==='Out of Stock'?'2px solid #b30b5d':'1px solid #ead2dd'}},h('span',null,'Out of Stock'),h('strong',null,out.length),h('small',{style:{display:'block',marginTop:'6px',fontWeight:800,color:'#9b1456'}},'Tap to view →')),
          h('button',{type:'button',className:'card stat',onClick:()=>showStockView('All'),style:{width:'100%',textAlign:'left',cursor:'pointer',fontFamily:'inherit',border:stockView==='All'?'2px solid #b30b5d':'1px solid #ead2dd'}},h('span',null,'Store Items'),h('strong',null,categoryStock.length),h('small',{style:{display:'block',marginTop:'6px',fontWeight:800,color:'#9b1456'}},'Tap to view →'))
        )
      ),
      controller&&h(Section,{title:'Receive from Vendor',subtitle:'Every pharmacy or Stores item received from a vendor must first be entered here before issue.'},
        h('div',{className:'field',style:{marginBottom:'12px'}},h('label',null,'Search item (minimum 3 characters)'),h('input',{value:stockSearch,onChange:e=>setStockSearch(e.target.value),placeholder:categoryFilter==='Pharmacy'?'Example: dispo, syr, para':'Example: dia, glo, syr'}),h('small',null,stockSearch.trim().length>0&&stockSearch.trim().length<3?'Enter at least 3 characters.':'Matching items appear below — tap one to select.'),stockSearchText.length>=3&&h('div',{style:{marginTop:'8px',border:'1px solid #ead2dd',borderRadius:'10px',padding:'6px',maxHeight:'220px',overflowY:'auto',background:'#fff'}},(()=>{const master=(form.item_category==='Pharmacy'?pharmacyCatalog:storesCatalog).filter(x=>String(x||'').toLowerCase().includes(stockSearchText)).map(x=>({kind:'catalog',name:x,label:x}));const existing=categoryStock.filter(x=>String(x.item_name||'').toLowerCase().includes(stockSearchText)).map(x=>({kind:'existing',id:x.item_id,name:x.item_name,label:`${masterById.get(x.item_id)?.item_code?`${masterById.get(x.item_id).item_code} · `:''}${displayStoreItemName(x.item_name)} · Balance ${x.balance_qty} ${x.unit}`}));const seen=new Set();const matches=[...existing,...master].filter(x=>{const k=String(x.name||'').toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,30);return matches.length?matches.map((x,i)=>h('button',{key:`search-${x.kind}-${x.id||i}`,type:'button',className:'btn btn-secondary',style:{display:'block',width:'100%',textAlign:'left',margin:'3px 0'},onClick:()=>{x.kind==='existing'?selectItem(x.id):selectCatalogItem(x.name);setStockSearch('')}},x.label)):h('div',{style:{padding:'8px',color:'#7b6570'}},'No matching item found in this section.');})())),
        h('form',{onSubmit:receiveStock},
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Section *'),h('select',{value:form.item_category,onChange:e=>setForm({...form,item_category:e.target.value,catalog_item:'',item_id:'',new_item_name:'',unit:e.target.value==='Pharmacy'?'Packs':'Nos'})},['Stores / Consumables','Pharmacy'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Standard Item List'),h('select',{value:form.catalog_item,onChange:e=>selectCatalogItem(e.target.value)},h('option',{value:''},'Select from standard list'),((form.item_category==='Pharmacy'?pharmacyCatalog:storesCatalog).filter(x=>stockSearchText.length<3||String(x||'').toLowerCase().includes(stockSearchText))).map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Existing Inventory Item'),h('select',{value:form.item_id,onChange:e=>selectItem(e.target.value)},h('option',{value:''},'Select existing item'),((stockSearchText.length>=3?categoryStock.filter(x=>String(x.item_name||'').toLowerCase().includes(stockSearchText)):categoryStock)).map(x=>h('option',{key:x.item_id,value:x.item_id},`${masterById.get(x.item_id)?.item_code?`${masterById.get(x.item_id).item_code} · `:''}${displayStoreItemName(x.item_name)} · Balance ${x.balance_qty} ${x.unit}`)))),
            h('div',{className:'field'},h('label',null,'Add Item Manually'),h('input',{value:form.new_item_name,onChange:e=>setForm({...form,new_item_name:e.target.value,catalog_item:'',item_id:''}),placeholder:form.item_category==='Pharmacy'?'Enter medicine / pharmacy item':'Enter Stores item'})),
            h('div',{className:'field'},h('label',null,'Unit'),h('select',{value:form.unit,onChange:e=>setForm({...form,unit:e.target.value}),disabled:Boolean(form.item_id)},units.map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Quantity Received *'),h('input',{type:'number',min:'0.01',step:'0.01',value:form.quantity,onChange:e=>setForm({...form,quantity:e.target.value}),required:true})),
            h('div',{className:'field'},h('label',null,'Vendor *'),h('input',{value:form.vendor_name,onChange:e=>setForm({...form,vendor_name:e.target.value}),required:true,placeholder:'Vendor / Supplier name'})),
            h('div',{className:'field'},h('label',null,'Invoice / Bill No.'),h('input',{value:form.invoice_no,onChange:e=>setForm({...form,invoice_no:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Invoice Date'),h(StrictDateInput,{value:form.invoice_date,onChange:e=>setForm({...form,invoice_date:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Received Date *'),h(StrictDateInput,{value:form.received_date,onChange:e=>setForm({...form,received_date:e.target.value}),required:true})),
            h('div',{className:'field'},h('label',null,'Batch / Lot No.'),h('input',{value:form.batch_no,onChange:e=>setForm({...form,batch_no:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Expiry Date'),h(StrictDateInput,{value:form.expiry_date,onChange:e=>setForm({...form,expiry_date:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Unit Cost (optional)'),h('input',{type:'number',min:'0',step:'0.01',value:form.unit_cost,onChange:e=>setForm({...form,unit_cost:e.target.value}),placeholder:'₹'})),
            h('div',{className:'field'},h('label',null,'Received By'),h('input',{value:actor,readOnly:true}))
          ),
          form.item_category==='Pharmacy'&&h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Generic Name'),h('input',{value:form.generic_name,onChange:e=>setForm({...form,generic_name:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Brand Name'),h('input',{value:form.brand_name,onChange:e=>setForm({...form,brand_name:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Strength'),h('input',{value:form.strength,onChange:e=>setForm({...form,strength:e.target.value}),placeholder:'Example: 500 mg'})),
            h('div',{className:'field'},h('label',null,'Dosage Form'),h('select',{value:form.dosage_form,onChange:e=>setForm({...form,dosage_form:e.target.value})},['Tablet','Capsule','Syrup','Drops','Injection','IV Fluid','Ointment','Cream','Inhalation','Other'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Manufacturer'),h('input',{value:form.manufacturer,onChange:e=>setForm({...form,manufacturer:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Pack Size'),h('input',{value:form.pack_size,onChange:e=>setForm({...form,pack_size:e.target.value}),placeholder:'Example: 10 tablets'}))
          ),
          h('div',{className:'field'},h('label',null,'Remarks'),h('textarea',{rows:2,value:form.remarks,onChange:e=>setForm({...form,remarks:e.target.value})})),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Receive into Stores')
        )
      ),
      h('div',{id:'stores-current-stock',style:{scrollMarginTop:'90px'}},h(Section,{title:`Current ${categoryFilter||'Pharmacy & Stores'} Stock${stockView!=='All'?` — ${stockView}`:''}`,subtitle:'Tap History on any item to see its complete stock-wise movement trail: vendor receipts, patient handovers/issues, confirmed returns and balance after every movement.'},
        h('div',{className:'stores-stock-mobile'},displayStock.length?displayStock.map(r=>h('article',{className:'stores-stock-card',key:`mobile-${r.item_id}`},
          h('div',{className:'stores-stock-card-head'},h('strong',null,`${masterById.get(r.item_id)?.item_code?`${masterById.get(r.item_id).item_code} · `:''}${displayStoreItemName(r.item_name)}`),h('span',{style:statusStyle(r)},stockStatus(r))),
          h('div',{className:'stores-stock-card-values'},
            h('span',null,h('small',null,'Unit'),h('b',null,r.unit)),
            h('span',null,h('small',null,'Total In'),h('b',null,r.total_in)),
            h('span',null,h('small',null,'Total Out'),h('b',null,r.total_out)),
            h('span',null,h('small',null,'Balance'),h('b',null,r.balance_qty)),
            h('span',null,h('small',null,'Minimum'),h('b',null,r.reorder_level))
          ),
          controller?h('div',{className:'stores-stock-card-actions'},
            h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>setReorder(r)},'Set Minimum'),
            oversight?h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>reconcile(r)},'Physical Tally'):null,h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>openItemHistory(r)},'History'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreItem(r)},'Edit Item'),canEditChargeRate?h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreChargeRate(r)},`Rate ₹${Number(masterById.get(r.item_id)?.charge_rate||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`):null
          ):h('small',{className:'stores-view-only'},'View only')
        )):h('div',{className:'stores-stock-empty'},'No store items found.')),
        h('div',{className:'table-wrap stores-stock-desktop'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Item ID','Item','Unit','Total In','Total Out','Balance','Reorder Level','Status','Action'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,displayStock.length?displayStock.map(r=>h('tr',{key:r.item_id},
            h('td',null,masterById.get(r.item_id)?.item_code||'—'),h('td',null,h('strong',null,displayStoreItemName(r.item_name))),h('td',null,r.unit),h('td',null,r.total_in),h('td',null,r.total_out),h('td',null,h('strong',null,r.balance_qty)),h('td',null,r.reorder_level),h('td',null,h('span',{style:statusStyle(r)},stockStatus(r))),
            h('td',null,controller?h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>setReorder(r)},'Set Minimum'),oversight?h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>reconcile(r)},'Physical Tally'):null,h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>openItemHistory(r)},'History'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreItem(r)},'Edit Item'),canEditChargeRate?h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreChargeRate(r)},`Rate ₹${Number(masterById.get(r.item_id)?.charge_rate||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`):null):'View only')
          )):h('tr',null,h('td',{colSpan:9,style:{textAlign:'center',padding:'24px'}},'No store items found.'))
        ))
      )),
      h(Section,{title:'Vendor Receipt Register'},
        h('div',{className:'stores-register-mobile'},displayReceipts.length?displayReceipts.map(r=>{const item=itemById(r.item_id);return h('article',{className:'stores-ledger-card',key:`mobile-receipt-${r.id}`},h('div',{className:'stores-ledger-card-head'},h('strong',null,`SR-${String(r.receipt_no||'').padStart(5,'0')}`),h('span',null,formatDateIN(r.received_date))),h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Item'),h('strong',null,item?.item_name||'—')),h('div',null,h('small',null,'Quantity'),h('strong',null,`${r.quantity} ${r.unit}`)),h('div',null,h('small',null,'Vendor'),h('strong',null,r.vendor_name||'—')),h('div',null,h('small',null,'Invoice'),h('strong',null,[r.invoice_no,r.invoice_date&&formatDateIN(r.invoice_date)].filter(Boolean).join(' · ')||'—')),h('div',null,h('small',null,'Batch / Expiry'),h('strong',null,[r.batch_no,r.expiry_date&&`Exp ${formatDateIN(r.expiry_date)}`].filter(Boolean).join(' · ')||'—')),h('div',null,h('small',null,'Received By'),h('strong',null,r.received_by_name||'—'))))}):h('div',{className:'stores-view-only'},'No vendor receipts recorded.')),
        h('div',{className:'table-wrap stores-register-desktop'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Receipt','Date','Item','Qty','Vendor','Invoice','Batch / Expiry','Received By'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,displayReceipts.length?displayReceipts.map(r=>{const item=itemById(r.item_id);return h('tr',{key:r.id},h('td',null,`SR-${String(r.receipt_no||'').padStart(5,'0')}`),h('td',null,formatDateIN(r.received_date)),h('td',null,item?.item_name||'—'),h('td',null,`${r.quantity} ${r.unit}`),h('td',null,r.vendor_name),h('td',null,[r.invoice_no,r.invoice_date&&formatDateIN(r.invoice_date)].filter(Boolean).join(' · ')||'—'),h('td',null,[r.batch_no,r.expiry_date&&`Exp ${formatDateIN(r.expiry_date)}`].filter(Boolean).join(' · ')||'—'),h('td',null,r.received_by_name||'—'))}):h('tr',null,h('td',{colSpan:8,style:{textAlign:'center',padding:'24px'}},'No vendor receipts recorded.')))
        ))
      ),
      historyItem&&h('div',{className:'modal-backdrop',style:{background:'rgba(45,18,31,.48)'}},
        h('div',{className:'modal-card',style:{maxWidth:'1000px',maxHeight:'88vh',overflowY:'auto',background:'#fffafd',opacity:1,padding:'22px'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}},
            h('div',null,h('h3',null,`${displayStoreItemName(historyItem.item_name)} — Stock History`),h('p',null,`Current balance: ${historyItem.balance_qty} ${historyItem.unit} · Total In: ${historyItem.total_in} · Total Out: ${historyItem.total_out}`)),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setHistoryItem(null)},'Close')
          ),
          historyBusy?h('p',null,'Loading complete item history…'):h('div',null,
            h('h4',null,'Stock Movements'),
            historyLedger.length?historyLedger.map(r=>h('div',{key:r.id,className:'stores-ledger-card',style:{marginBottom:'8px'}},
              h('div',{className:'stores-ledger-card-head'},h('strong',null,r.movement_type||'Stock Movement'),h('span',null,formatDateTimeIN(r.movement_at))),
              h('div',{className:'stores-ledger-card-fields'},
                h('div',null,h('small',null,'Stock In'),h('strong',null,Number(r.qty_in)>0?`${r.qty_in} ${historyItem.unit}`:'—')),
                h('div',null,h('small',null,'Stock Out'),h('strong',null,Number(r.qty_out)>0?`${r.qty_out} ${historyItem.unit}`:'—')),
                h('div',null,h('small',null,'Balance After'),h('strong',null,r.balance_after)),
                h('div',null,h('small',null,'Patient / Reference'),h('strong',null,[r.patient_id&&patientName(r.patient_id),r.reference_text].filter(Boolean).join(' · ')||'—')),
                h('div',null,h('small',null,'By'),h('strong',null,r.actor_name||'—'))
              )
            )):h('p',null,'No stock movements recorded for this item.'),
            h('h4',{style:{marginTop:'18px'}},'Vendor Receipts'),
            historyReceipts.length?historyReceipts.map(r=>h('div',{key:r.id,className:'stores-ledger-card',style:{marginBottom:'8px'}},
              h('div',{className:'stores-ledger-card-head'},h('strong',null,`SR-${String(r.receipt_no||'').padStart(5,'0')}`),h('span',null,formatDateIN(r.received_date))),
              h('div',{className:'stores-ledger-card-fields'},
                h('div',null,h('small',null,'Quantity'),h('strong',null,`${r.quantity} ${r.unit}`)),
                h('div',null,h('small',null,'Vendor'),h('strong',null,r.vendor_name||'—')),
                h('div',null,h('small',null,'Invoice'),h('strong',null,[r.invoice_no,r.invoice_date&&formatDateIN(r.invoice_date)].filter(Boolean).join(' · ')||'—')),
                h('div',null,h('small',null,'Batch / Expiry'),h('strong',null,[r.batch_no,r.expiry_date&&`Exp ${formatDateIN(r.expiry_date)}`].filter(Boolean).join(' · ')||'—')),
                h('div',null,h('small',null,'Received By'),h('strong',null,r.received_by_name||'—'))
              )
            )):h('p',null,'No vendor receipts recorded for this item.')
          )
        )
      ),
      h(Section,{title:`${categoryFilter||'Pharmacy & Stores'} Stock Movement Register`,subtitle:'Read-only period-wise reconciliation. Opening + Vendor Received + Return Received − Handed Over = Closing Balance.'},
        h('div',{className:'form-grid',style:{marginBottom:'12px'}},
          h('div',{className:'field'},h('label',null,'Period'),h('select',{value:movementPeriod,onChange:e=>setMovementPeriod(e.target.value)},[['today','Today'],['yesterday','Yesterday'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['custom','Custom Date Range']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          h('div',{className:'field'},h('label',null,'Stock Item'),h('select',{value:movementItem,onChange:e=>setMovementItem(e.target.value)},h('option',{value:'All'},'All Items'),categoryStock.map(x=>h('option',{key:x.item_id,value:x.item_id},displayStoreItemName(x.item_name))))),
          movementPeriod==='custom'&&h('div',{className:'field'},h('label',null,'From'),h('input',{type:'date',value:movementFrom,onChange:e=>setMovementFrom(e.target.value)})),
          movementPeriod==='custom'&&h('div',{className:'field'},h('label',null,'To'),h('input',{type:'date',value:movementTo,onChange:e=>setMovementTo(e.target.value)}))
        ),
        h('p',{className:'small-note'},`Period: ${formatDateIN(movementBounds.from)} to ${formatDateIN(movementBounds.to)} · ${movementItem==='All'?'All stock items':displayStoreItemName(categoryStock.find(x=>String(x.item_id)===String(movementItem))?.item_name||'Selected item')}`),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Item','Opening Balance','Vendor Received','Handed Over','Return Received','Closing Balance'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,movementSummaryItems.length?movementSummaryItems.map(r=>h('tr',{key:`movement-summary-${r.item_id}`},h('td',null,displayStoreItemName(r.item_name)),h('td',null,`${r.opening} ${r.unit}`),h('td',null,`${r.received} ${r.unit}`),h('td',null,`${r.handed} ${r.unit}`),h('td',null,`${r.returned} ${r.unit}`),h('td',null,h('strong',null,`${r.closing} ${r.unit}`)))):h('tr',null,h('td',{colSpan:6,style:{textAlign:'center',padding:'20px'}},'No stock items for this filter.')))
        )),
        movementItem!=='All'&&h('div',{style:{marginTop:'16px'}},h('h4',null,'Selected Item — Movement Details'),movementSelectedLedger.length?movementSelectedLedger.map(r=>{const item=itemById(r.item_id);return h('div',{key:`movement-detail-${r.id}`,className:'stores-ledger-card',style:{marginBottom:'8px'}},h('div',{className:'stores-ledger-card-head'},h('strong',null,r.movement_type||'Stock Movement'),h('span',null,formatDateTimeIN(r.movement_at))),h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Stock In'),h('strong',null,Number(r.qty_in)>0?`${r.qty_in} ${item?.unit||''}`:'—')),h('div',null,h('small',null,'Stock Out'),h('strong',null,Number(r.qty_out)>0?`${r.qty_out} ${item?.unit||''}`:'—')),h('div',null,h('small',null,'Balance After'),h('strong',null,r.balance_after)),h('div',null,h('small',null,'Patient / Reference'),h('strong',null,[r.patient_id&&patientName(r.patient_id),r.reference_text].filter(Boolean).join(' · ')||'—')),h('div',null,h('small',null,'By'),h('strong',null,r.actor_name||'—'))))}):h('p',null,'No movements for this item in the selected period.'))
      ),
      h(Section,{title:`${categoryFilter||'Pharmacy & Stores'} Stock Ledger`,subtitle:'Every vendor receipt, patient handover/issue, confirmed return and physical adjustment is retained here. Use an item’s History button for its complete stock-wise trail.'},
        h('div',{className:'stores-ledger-mobile'},displayLedger.length?displayLedger.map(r=>{const item=itemById(r.item_id);return h('article',{className:'stores-ledger-card',key:`mobile-ledger-${r.id}`},h('div',{className:'stores-ledger-card-head'},h('strong',null,`SM-${String(r.movement_no||'').padStart(6,'0')}`),h('span',null,formatDateTimeIN(r.movement_at))),h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Item'),h('strong',null,item?.item_name||'—')),h('div',null,h('small',null,'Movement Type'),h('strong',null,r.movement_type||'—')),h('div',null,h('small',null,'Stock In'),h('strong',null,Number(r.qty_in)>0?`${r.qty_in} ${item?.unit||''}`:'—')),h('div',null,h('small',null,'Stock Out'),h('strong',null,Number(r.qty_out)>0?`${r.qty_out} ${item?.unit||''}`:'—')),h('div',null,h('small',null,'Balance After'),h('strong',null,r.balance_after)),h('div',null,h('small',null,'Patient / Reference'),h('strong',null,[r.patient_id&&patientName(r.patient_id),r.reference_text].filter(Boolean).join(' · ')||'—')),h('div',null,h('small',null,'By'),h('strong',null,r.actor_name||'—'))))}):h('div',{className:'stores-view-only'},'No stock movements recorded.')),
        h('div',{className:'table-wrap stores-ledger-desktop'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Movement','Date / Time','Item','Type','Stock In','Stock Out','Balance After','Patient / Reference','By'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,displayLedger.length?displayLedger.map(r=>{const item=itemById(r.item_id);return h('tr',{key:r.id},h('td',null,`SM-${String(r.movement_no||'').padStart(6,'0')}`),h('td',null,formatDateTimeIN(r.movement_at)),h('td',null,item?.item_name||'—'),h('td',null,r.movement_type),h('td',null,Number(r.qty_in)>0?`${r.qty_in} ${item?.unit||''}`:'—'),h('td',null,Number(r.qty_out)>0?`${r.qty_out} ${item?.unit||''}`:'—'),h('td',null,h('strong',null,r.balance_after)),h('td',null,[r.patient_id&&patientName(r.patient_id),r.reference_text].filter(Boolean).join(' · ')||'—'),h('td',null,r.actor_name||'—'))}):h('tr',null,h('td',{colSpan:9,style:{textAlign:'center',padding:'24px'}},'No stock movements recorded.')))
        ))
      )
    ));
  }

