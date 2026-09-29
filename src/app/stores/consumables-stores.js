  function ConsumablesStores({profile,categoryFilter='',section='',onSummary=null}){
    // 2.14.91: section = '' (full page, as before) | 'none' | 'stock' | 'receive' | 'receipts' | 'movement' | 'expiry' — used by the Pharmacy & Stores dashboard
    const show=key=>!section||section===key;
    const authority=useStoreAuthority(profile);
    const controller=authority.controller;
    const canEditChargeRate=isNursingManagerProfile(profile)||profile?.role==='Admin'||profile?.role==='Manager';
    const oversight=['Admin','Manager'].includes(profile?.role);
    const [stock,setStock]=React.useState([]),[receipts,setReceipts]=React.useState([]),[ledger,setLedger]=React.useState([]),[patients,setPatients]=React.useState([]),[itemMaster,setItemMaster]=React.useState([]);
    const [busy,setBusy]=React.useState(false);
    const [stockSearch,setStockSearch]=React.useState('');
    // 2.14.69: separate stock-list search, Receive form opened by its own button, on-page Edit / Remove dialogs
    const [listSearch,setListSearch]=React.useState('');
    const [showReceive,setShowReceive]=React.useState(false);
    const [editItem,setEditItem]=React.useState(null),[editForm,setEditForm]=React.useState({item_name:'',unit:'Nos',strength:'',dosage_form:''});
    const [removeTarget,setRemoveTarget]=React.useState(null),[moveChoice,setMoveChoice]=React.useState('');
    const isAdminProfile=profile?.role==='Admin';
    const [stockView,setStockView]=React.useState('All');
    const [movementMode,setMovementMode]=React.useState('summary');
    const [movementPeriod,setMovementPeriod]=React.useState('month'),[movementItem,setMovementItem]=React.useState('All'),[movementFrom,setMovementFrom]=React.useState(todayISOIndia().slice(0,8)+'01'),[movementTo,setMovementTo]=React.useState(todayISOIndia());
    const [historyItem,setHistoryItem]=React.useState(null),[historyLedger,setHistoryLedger]=React.useState([]),[historyReceipts,setHistoryReceipts]=React.useState([]),[historyBusy,setHistoryBusy]=React.useState(false);
    const [categoryEditItem,setCategoryEditItem]=React.useState(null),[categoryEditValue,setCategoryEditValue]=React.useState('');
    const [cleanupCandidates,setCleanupCandidates]=React.useState(null);
    // 2.14.89: add / edit Batch No. and Expiry Date on stock already received (expiry is often not known on receipt)
    const [expiryItem,setExpiryItem]=React.useState(null),[expiryRows,setExpiryRows]=React.useState([]),[expiryEdits,setExpiryEdits]=React.useState({}),[expiryLoading,setExpiryLoading]=React.useState(false),[expiryFocus,setExpiryFocus]=React.useState('');
    const [form,setForm]=React.useState({item_category:categoryFilter==='Pharmacy'?'Pharmacy':'Stores / Consumables',catalog_item:'',item_id:'',new_item_name:'',unit:'Nos',vendor_name:'',invoice_no:'',invoice_date:'',received_date:todayISOIndia(),quantity:'1',batch_no:'',expiry_date:'',unit_cost:'',remarks:'',generic_name:'',brand_name:'',strength:'',dosage_form:'Tablet',manufacturer:'',pack_size:''});
    const units=['Nos','Pairs','Packs','Boxes','Pieces','Rolls','Sets','Bottles'];
    const basicPharmacyUnits={"Glucometer Strips": "Nos", "Lancets": "Nos", "Alcohol Swabs": "Nos", "Digital Thermometer": "Nos", "Thermometer Probe Covers": "Nos", "Pulse Oximeter": "Nos", "BP Cuff / Spare Cuff": "Nos", "Sterile Gauze Pads - 2 x 2": "Nos", "Sterile Gauze Pads - 4 x 4": "Nos", "Cotton Rolls": "Rolls", "Cotton Balls": "Nos", "Micropore Adhesive Tape": "Rolls", "Sterile Dressing Pads": "Nos", "Crepe Bandage - 2 inch": "Rolls", "Crepe Bandage - 4 inch": "Rolls", "Crepe Bandage - 6 inch": "Rolls", "Roller / Gauze Bandages": "Rolls", "Disposable Examination Gloves - S": "Pieces", "Disposable Examination Gloves - M": "Pieces", "Disposable Examination Gloves - L": "Pieces", "Surgical Masks": "Nos", "Disposable Syringe - 1 mL": "Nos", "Disposable Syringe - 2 mL": "Nos", "Disposable Syringe - 3 mL": "Nos", "Disposable Syringe - 5 mL": "Nos", "Disposable Syringe - 10 mL": "Nos", "Disposable Syringe - 20 mL": "Nos", "Needle - 18G": "Nos", "Needle - 20G": "Nos", "Needle - 21G": "Nos", "Needle - 22G": "Nos", "Needle - 23G": "Nos", "Needle - 24G": "Nos", "Needle - 25G": "Nos", "Needle - 26G": "Nos", "Insulin Syringe - U-40": "Nos", "Insulin Syringe - U-100": "Nos", "Insulin Pen Needle - 4 mm": "Nos", "Insulin Pen Needle - 5 mm": "Nos", "Insulin Pen Needle - 6 mm": "Nos", "Insulin Pen Needle - 8 mm": "Nos", "IV Cannula - 18G": "Nos", "IV Cannula - 20G": "Nos", "IV Cannula - 22G": "Nos", "IV Cannula - 24G": "Nos", "IV Sets": "Nos", "IV Extension Lines": "Nos", "Normal Saline Flush Syringes": "Nos", "Urine Specimen Containers": "Nos", "Disposable Urine Measuring Containers": "Nos", "Adult Urine Bags": "Nos", "Nebulizer Mask / Kit - Adult": "Nos", "Oxygen Nasal Cannula": "Nos", "Oxygen Masks": "Nos", "Suction Catheter - 10 Fr": "Nos", "Suction Catheter - 12 Fr": "Nos", "Suction Catheter - 14 Fr": "Nos", "Suction Catheter - 16 Fr": "Nos", "Feeding Syringe - 50 mL": "Nos", "Feeding Syringe - 60 mL": "Nos", "Disposable Underpads": "Nos", "Tongue Depressors": "Nos", "Hand Sanitizer": "Bottles", "Povidone-iodine Solution": "Bottles", "Chlorhexidine Antiseptic - As per Samara Protocol": "Bottles", "Normal Saline for Wound Cleansing": "Bottles", "Sharps Disposal Containers": "Nos", "Biomedical-waste Bags": "Nos"};
    // Master-data rule: non-medicinal clinical supplies belong only to Consumables.
    // Pharmacy is reserved for medicines / medicinal preparations. Keeping these
    // standard lists separated prevents the same physical item being recreated
    // under both masters.
    const clinicalSupplyCatalog=["Glucometer Strips","Lancets","Alcohol Swabs","Digital Thermometer","Thermometer Probe Covers","Pulse Oximeter","BP Cuff / Spare Cuff","Sterile Gauze Pads - 2 x 2","Sterile Gauze Pads - 4 x 4","Cotton Rolls","Cotton Balls","Micropore Adhesive Tape","Sterile Dressing Pads","Crepe Bandage - 2 inch","Crepe Bandage - 4 inch","Crepe Bandage - 6 inch","Roller / Gauze Bandages","Disposable Examination Gloves - S","Disposable Examination Gloves - M","Disposable Examination Gloves - L","Surgical Masks","Disposable Syringe - 1 mL","Disposable Syringe - 2 mL","Disposable Syringe - 3 mL","Disposable Syringe - 5 mL","Disposable Syringe - 10 mL","Disposable Syringe - 20 mL","Needle - 18G","Needle - 20G","Needle - 21G","Needle - 22G","Needle - 23G","Needle - 24G","Needle - 25G","Needle - 26G","Insulin Syringe - U-40","Insulin Syringe - U-100","Insulin Pen Needle - 4 mm","Insulin Pen Needle - 5 mm","Insulin Pen Needle - 6 mm","Insulin Pen Needle - 8 mm","IV Cannula - 18G","IV Cannula - 20G","IV Cannula - 22G","IV Cannula - 24G","IV Sets","IV Extension Lines","Normal Saline Flush Syringes","Urine Specimen Containers","Disposable Urine Measuring Containers","Adult Urine Bags","Nebulizer Mask / Kit - Adult","Oxygen Nasal Cannula","Oxygen Masks","Suction Catheter - 10 Fr","Suction Catheter - 12 Fr","Suction Catheter - 14 Fr","Suction Catheter - 16 Fr","Feeding Syringe - 50 mL","Feeding Syringe - 60 mL","Disposable Underpads","Tongue Depressors","Hand Sanitizer","Sharps Disposal Containers","Biomedical-waste Bags"];
    const storesCatalog=[...new Set(['Adult Diapers','Underpads','Examination Gloves','Sterile Gloves','N95 Masks','PPE Kits','Cotton','Gauze','Gauze Rolls','Adhesive Plaster','Micropore Tape','Dressing Pads','Bandages','Crepe Bandages','Syringes','Needles','IV Cannulas','IV Sets','Three-Way Cannulas','Urine Bags','Urinary Catheters','Ryle’s / NG Tubes','Feeding Tubes','Feeding Syringes','Suction Catheters','Tracheostomy Tubes','Tracheostomy Masks','Oxygen Masks','Nasal Cannulas','Nebulizer Masks','Disposable Aprons','Disinfectant Solution','Bed Linens','Patient Gowns','Tissue Paper','Wet Wipes','Garbage Bags','Cleaning Materials','Other Consumables',...clinicalSupplyCatalog])];
    const pharmacyCatalog=['Tablets','Capsules','Syrups','Oral Drops','Injections','IV Fluids','Antibiotics','Analgesics / Pain Medicines','Antipyretics / Fever Medicines','Antacids','Antiemetics','Antihypertensives','Antidiabetic Medicines','Insulin','Anticoagulants','Respiratory Medicines','Nebulization Medicines','Antiseptic Solutions','Ointments','Creams','Eye Drops','Ear Drops','Nasal Drops / Sprays','Laxatives','Nutritional Supplements','Electrolyte Preparations','Emergency Medicines','Other Pharmacy Items'];
    // Standard Item List category -> 3-letter name prefix (Tablets -> TAB, matching
    // the CAP./INJ. style already used in the existing catalog), and the reverse
    // map (Dosage Form -> category) used by the auto-match backfill below.
    const PHARMACY_CATEGORY_PREFIX={'Tablets':'TAB','Capsules':'CAP','Syrups':'SYR','Oral Drops':'ODR','Injections':'INJ','IV Fluids':'IVF','Antibiotics':'ATB','Analgesics / Pain Medicines':'ANL','Antipyretics / Fever Medicines':'APY','Antacids':'ANT','Antiemetics':'AEM','Antihypertensives':'AHT','Antidiabetic Medicines':'ADB','Insulin':'INS','Anticoagulants':'ACG','Respiratory Medicines':'RSP','Nebulization Medicines':'NEB','Antiseptic Solutions':'ASP','Ointments':'OIN','Creams':'CRM','Eye Drops':'EYD','Ear Drops':'EAD','Nasal Drops / Sprays':'NSL','Laxatives':'LAX','Nutritional Supplements':'NUT','Electrolyte Preparations':'ELP','Emergency Medicines':'EMG','Other Pharmacy Items':'OTP'};
    const DOSAGE_FORM_TO_CATEGORY={'Tablet':'Tablets','Capsule':'Capsules','Syrup':'Syrups','Drops':'Oral Drops','Injection':'Injections','IV Fluid':'IV Fluids','Ointment':'Ointments','Cream':'Creams','Inhalation':'Nebulization Medicines'};
    function prefixForPharmacyCategory(category){return PHARMACY_CATEGORY_PREFIX[category]||'ITM'}
    function guessStandardCategory(masterRow){
      if(masterRow.standard_category)return masterRow.standard_category;
      const list=masterRow.item_category==='Pharmacy'?pharmacyCatalog:storesCatalog;
      if(masterRow.item_category==='Pharmacy'&&DOSAGE_FORM_TO_CATEGORY[masterRow.dosage_form])return DOSAGE_FORM_TO_CATEGORY[masterRow.dosage_form];
      const name=String(masterRow.item_name||'').trim().toLowerCase();
      if(!name)return null;
      const exact=list.find(c=>name===c.toLowerCase());
      if(exact)return exact;
      const contains=list.find(c=>name.includes(c.toLowerCase())||c.toLowerCase().includes(name));
      return contains||null;
    }
    const actor=formalName(profile)||profile?.full_name||profile?.login_id||profile?.role||'Staff';
    const notifyStore=(type,text)=>showSamaraActionToast(type,type==='success'?'Stores updated':'Stores action failed',text);
    const itemById=id=>stock.find(x=>x.item_id===id);
    const patientName=id=>{const p=patients.find(x=>x.id===id);return p?(formalName(p)||p.full_name||p.patient_id||'Patient'):'—'};
    async function load(){
      const [sRes,rRes,lRes,pRes,mRes]=await Promise.all([
        client.from('consumable_store_stock').select('*').order('item_name'),
        client.from('consumable_store_receipts').select('*').order('received_at',{ascending:false}).limit(1000),
        client.from('consumable_store_ledger').select('*').order('movement_at',{ascending:false}).limit(5000),
        client.from('patients').select('id,title,full_name,patient_id').order('full_name').limit(1000),
        client.from('consumable_store_items').select('id,item_code,item_name,unit,active,item_category,strength,dosage_form,charge_rate,standard_category').order('item_name')
      ]);
      if(sRes.error){console.warn(sRes.error);notifyStore('error','Stores database is not installed yet. Please run 91_consumables_store_inventory.sql once in Supabase.')} else setStock(sRes.data||[]);
      if(!rRes.error)setReceipts(rRes.data||[]);
      if(!lRes.error)setLedger(lRes.data||[]);
      if(!pRes.error)setPatients(pRes.data||[]); if(!mRes.error)setItemMaster(mRes.data||[]);
    }
    React.useEffect(()=>{load()},[]);
    function selectItem(id){const row=itemById(id);setForm(f=>({...f,item_id:id,catalog_item:'',new_item_name:'',unit:row?.unit||f.unit}))}
    function selectCatalogItem(name){
      if(!name){setForm(f=>({...f,catalog_item:'',item_id:'',new_item_name:''}));return}
      const isPharmacy=form.item_category==='Pharmacy';
      setForm(f=>({...f,catalog_item:name,item_id:'',new_item_name:isPharmacy?`${prefixForPharmacyCategory(name)}.`:name,unit:basicPharmacyUnits[name]||(f.item_category==='Pharmacy'?'Packs':f.unit)}))
    }
    async function openCategoryEdit(row){setCategoryEditItem(row);setCategoryEditValue(masterById.get(row.item_id)?.standard_category||'')}
    async function saveCategoryEdit(){
      if(!categoryEditItem||busy)return;
      const master=masterById.get(categoryEditItem.item_id); if(!master)return notifyStore('error','Stores Master record not found. Refresh and try again.');
      setBusy(true);
      const res=await client.rpc('store_incharge_set_standard_category',{p_item_id:master.id,p_standard_category:categoryEditValue||null});
      setBusy(false);
      if(res.error)notifyStore('error',res.error.message);
      else{notifyStore('success','Standard category updated.');setCategoryEditItem(null);await load()}
    }
    async function autoAssignCategories(){
      if(busy)return;
      const targets=itemMaster.filter(m=>m.active!==false&&!m.standard_category).map(m=>({id:m.id,name:m.item_name,guess:guessStandardCategory(m)})).filter(x=>x.guess);
      if(!targets.length){notifyStore('error','No items could be auto-matched from Dosage Form or name. Set the remaining categories individually using each item\'s Category button.');return}
      if(!confirm(`Auto-assign a Standard Category to ${targets.length} item(s), matched from Dosage Form / item name? Please spot-check the results afterwards using each item's Category button — some guesses may need correcting.`))return;
      setBusy(true);
      let done=0,failed=0;
      for(let i=0;i<targets.length;i+=20){
        const batch=targets.slice(i,i+20);
        const results=await Promise.all(batch.map(t=>client.rpc('store_incharge_set_standard_category',{p_item_id:t.id,p_standard_category:t.guess})));
        results.forEach(r=>r.error?failed++:done++);
      }
      setBusy(false);
      notifyStore(failed?'error':'success',`${done} item(s) auto-tagged.${failed?` ${failed} could not be saved — try again.`:''} Please spot-check using each item's Category button; matches from a plain name search may not always be exact.`);
      await load();
    }
    // Some items were entered with the received quantity stuck onto the end of the
    // name by mistake (e.g. "INJ.ADRENALINE 1ML-2" instead of "INJ.ADRENALINE 1ML",
    // the "-2" being that day's quantity, not part of the item). This finds items
    // ending in "-<number>" for review, never renames anything without a human
    // checking each suggestion first — a few legitimate names also end in a
    // hyphen + number (e.g. an "Insulin Syringe - U-40" strength code) and must
    // stay unchanged, so every row can be unchecked or hand-edited before Apply.
    function openCleanupNames(){
      const relevant=categoryFilter?itemMaster.filter(m=>(m.item_category||'Consumables')===categoryFilter):itemMaster;
      const candidates=relevant.filter(m=>m.active!==false).map(m=>{
        const oldName=String(m.item_name||'').trim();
        const newName=oldName.replace(/-\d{1,3}$/,'').trim();
        return {id:m.id,oldName,newName,unit:m.unit,strength:m.strength,dosage_form:m.dosage_form,selected:true};
      }).filter(c=>c.newName&&c.newName!==c.oldName);
      if(!candidates.length){notifyStore('error','No item names ending in "-<number>" were found in this section.');return}
      setCleanupCandidates(candidates);
    }
    function toggleCleanupCandidate(id){setCleanupCandidates(list=>list.map(c=>c.id===id?{...c,selected:!c.selected}:c))}
    function editCleanupCandidateName(id,value){setCleanupCandidates(list=>list.map(c=>c.id===id?{...c,newName:value}:c))}
    async function applyCleanupNames(){
      if(!cleanupCandidates||busy)return;
      const selected=cleanupCandidates.filter(c=>c.selected&&c.newName.trim()&&c.newName.trim()!==c.oldName);
      if(!selected.length){setCleanupCandidates(null);return}
      setBusy(true);
      let done=0,failed=0;
      for(let i=0;i<selected.length;i+=10){
        const batch=selected.slice(i,i+10);
        const results=await Promise.all(batch.map(c=>client.rpc('store_incharge_edit_item',{p_item_id:c.id,p_item_name:c.newName.trim(),p_unit:String(c.unit||'Nos').trim(),p_strength:c.strength||null,p_dosage_form:c.dosage_form||null})));
        results.forEach(r=>r.error?failed++:done++);
      }
      setBusy(false);
      notifyStore(failed?'error':'success',`${done} item name(s) cleaned up.${failed?` ${failed} failed — try again.`:''}`);
      setCleanupCandidates(null);
      await load();
    }
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
      if(res.error)notifyStore('error',res.error.message);else{
        notifyStore('success',`${form.item_category} item received from ${form.vendor_name}.`);
        if(form.catalog_item&&!form.item_id){
          const savedName=String(form.new_item_name||'').trim();
          if(savedName){
            const fresh=await client.from('consumable_store_items').select('id').eq('item_name',savedName).order('created_at',{ascending:false}).limit(1);
            const newId=fresh.data?.[0]?.id;
            if(newId)await client.rpc('store_incharge_set_standard_category',{p_item_id:newId,p_standard_category:form.catalog_item});
          }
        }
        setForm(f=>({...f,catalog_item:'',item_id:'',new_item_name:'',vendor_name:'',invoice_no:'',invoice_date:'',received_date:todayISOIndia(),quantity:'1',batch_no:'',expiry_date:'',unit_cost:'',remarks:'',generic_name:'',brand_name:'',strength:'',manufacturer:'',pack_size:''}));
        await load()
      }
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
    // 2.14.69: an item removed with history is deactivated (active=false) - keep it out of the active stock list.
    const activeStock=stock.filter(x=>masterById.get(x.item_id)?.active!==false);
    const categoryStock=categoryFilter?activeStock.filter(x=>(masterById.get(x.item_id)?.item_category||'Consumables')===categoryFilter):activeStock;
    const standardCategoryMatches=form.catalog_item?categoryStock.filter(x=>(masterById.get(x.item_id)?.standard_category||'')===form.catalog_item):null;
    // Never hide existing items just because tagging hasn't been done yet —
    // filter to the chosen category only once at least one item is tagged
    // with it; otherwise fall back to showing every item in the section.
    const standardCategoryStock=standardCategoryMatches&&standardCategoryMatches.length?standardCategoryMatches:categoryStock;
    const standardCategoryFilterActive=Boolean(standardCategoryMatches&&standardCategoryMatches.length);
    const untaggedGuessableCount=itemMaster.filter(m=>m.active!==false&&!m.standard_category&&guessStandardCategory(m)).length;
    const stockSearchText=stockSearch.trim().toLowerCase();
    const listSearchText=listSearch.trim().toLowerCase();
    const searchedStock=listSearchText?categoryStock.filter(x=>String(x.item_name||'').toLowerCase().includes(listSearchText)||String(masterById.get(x.item_id)?.item_code||'').toLowerCase().includes(listSearchText)):categoryStock;
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
    // 2.14.91: data for the Pharmacy & Stores dashboard boxes
    const ledgerList=section==='movement'?movementSelectedLedger:displayLedger;
    const expiryToday=todayISOIndia(),expirySoonLimit=addDaysISO(todayISOIndia(),90);
    const expiryStateOf=r=>!r.expiry_date?'missing':String(r.expiry_date).slice(0,10)<expiryToday?'expired':String(r.expiry_date).slice(0,10)<=expirySoonLimit?'soon':'ok';
    const expiryWatch=displayReceipts.filter(r=>Number(itemById(r.item_id)?.balance_qty||0)>0).map(r=>({...r,_state:expiryStateOf(r)})).filter(r=>r._state!=='ok')
      .sort((a,b)=>({expired:0,soon:1,missing:2}[a._state]-{expired:0,soon:1,missing:2}[b._state])||String(a.expiry_date||a.received_date||'').localeCompare(String(b.expiry_date||b.received_date||'')));
    const [expiryWatchFilter,setExpiryWatchFilter]=React.useState('All');
    const expiryWatchVisible=expiryWatch.filter(r=>expiryWatchFilter==='All'||r._state===expiryWatchFilter);
    const todayMoves=displayLedger.filter(r=>movementDateOnly(r.movement_at)===expiryToday);
    const storesSummary={
      loaded:stock.length>0||itemMaster.length>0,
      items:categoryStock.length,
      inStock:categoryStock.filter(x=>Number(x.balance_qty)>0).length,
      low:categoryStock.filter(x=>Number(x.balance_qty)>0&&Number(x.reorder_level)>0&&Number(x.balance_qty)<=Number(x.reorder_level)).length,
      out:categoryStock.filter(x=>Number(x.balance_qty)<=0).length,
      receipts:displayReceipts.length,
      lastReceipt:displayReceipts[0]?.received_date||'',
      expired:expiryWatch.filter(r=>r._state==='expired').length,
      soon:expiryWatch.filter(r=>r._state==='soon').length,
      missing:expiryWatch.filter(r=>r._state==='missing').length,
      todayIn:todayMoves.reduce((a,r)=>a+Number(r.qty_in||0),0),
      todayOut:todayMoves.reduce((a,r)=>a+Number(r.qty_out||0),0),
      monthMoves:displayLedger.filter(r=>movementDateOnly(r.movement_at)>=expiryToday.slice(0,8)+'01').length,
      controller:!!controller,
      access:!!(controller||oversight)
    };
    const storesSummaryKey=JSON.stringify(storesSummary);
    React.useEffect(()=>{if(typeof onSummary==='function')onSummary(storesSummary)},[storesSummaryKey]);
    async function openItemHistory(row){
      setHistoryItem(row);setHistoryBusy(true);setHistoryLedger([]);setHistoryReceipts([]);
      const [l,r]=await Promise.all([
        client.from('consumable_store_ledger').select('*').eq('item_id',row.item_id).order('movement_at',{ascending:false}).limit(1000),
        client.from('consumable_store_receipts').select('*').eq('item_id',row.item_id).order('received_at',{ascending:false}).limit(500)
      ]);
      if(!l.error)setHistoryLedger(l.data||[]);if(!r.error)setHistoryReceipts(r.data||[]);setHistoryBusy(false);
    }
    async function openExpiryEdit(row,focusReceiptId=''){
      if(!controller||!row)return;
      setExpiryItem(row);setExpiryFocus(focusReceiptId);setExpiryLoading(true);setExpiryRows([]);setExpiryEdits({});
      const r=await client.from('consumable_store_receipts').select('*').eq('item_id',row.item_id).order('received_at',{ascending:false}).limit(300);
      const list=r.error?[]:(r.data||[]);
      setExpiryRows(list);
      setExpiryEdits(Object.fromEntries(list.map(x=>[x.id,{batch_no:x.batch_no||'',expiry_date:x.expiry_date||''}])));
      setExpiryLoading(false);
      if(r.error)notifyStore('error',r.error.message);
      if(focusReceiptId)setTimeout(()=>document.getElementById(`expiry-receipt-${focusReceiptId}`)?.scrollIntoView({behavior:'smooth',block:'center'}),120);
    }
    function setExpiryEdit(id,key,value){setExpiryEdits(all=>({...all,[id]:{...(all[id]||{}),[key]:value}}))}
    async function saveReceiptExpiry(e,rec){
      e.preventDefault();
      if(!controller||busy)return;
      const edit=expiryEdits[rec.id]||{};
      const batch=String(edit.batch_no||'').trim()||null,expiry=edit.expiry_date||null;
      setBusy(true);
      const res=await client.rpc('store_incharge_update_receipt_expiry',{p_receipt_id:rec.id,p_batch_no:batch,p_expiry_date:expiry,p_actor_name:actor});
      setBusy(false);
      if(res.error){
        notifyStore('error',/does not exist|schema cache|could not find the function/i.test(res.error.message)?'Expiry editing is not installed yet. Please run supabase/sql/159_store_receipt_expiry_edit.sql once in Supabase.':res.error.message);
        return;
      }
      const receiptNo=`SR-${String(rec.receipt_no||'').padStart(5,'0')}`;
      notifyStore('success',expiry?`Expiry date ${formatDateIN(expiry)} saved for ${receiptNo}.`:`Batch / expiry updated for ${receiptNo} (expiry left blank).`);
      const patch=x=>x.id===rec.id?{...x,batch_no:batch,expiry_date:expiry}:x;
      setExpiryRows(rows=>rows.map(patch));setReceipts(rows=>rows.map(patch));setHistoryReceipts(rows=>rows.map(patch));
    }
    function batchExpiryCell(r){
      const batch=r.batch_no?`Batch ${r.batch_no}`:'';
      if(!r.expiry_date)return h('span',null,batch?`${batch} · `:'',h('span',{style:{color:'#9a6700',fontWeight:700}},'Expiry not entered'));
      const expired=String(r.expiry_date).slice(0,10)<todayISOIndia();
      const soon=!expired&&String(r.expiry_date).slice(0,10)<=addDaysISO(todayISOIndia(),90);
      return h('span',null,batch?`${batch} · `:'',h('span',{style:expired?{color:'#b42318',fontWeight:800}:soon?{color:'#9a6700',fontWeight:700}:null},`${expired?'EXPIRED ':soon?'Expires soon · ':'Exp '}${formatDateIN(r.expiry_date)}`));
    }
    const receiptItemRow=r=>itemById(r.item_id)||{item_id:r.item_id,item_name:'Item',unit:r.unit,balance_qty:'—'};
    function showStockView(view){setStockView(view);setTimeout(()=>document.getElementById('stores-current-stock')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
    function editStoreItem(row){
      if(!controller)return;
      const master=masterById.get(row.item_id); if(!master)return notifyStore('error','Stores Master record not found. Refresh and try again.');
      setEditForm({item_name:master.item_name||'',unit:master.unit||'Nos',strength:master.strength||'',dosage_form:master.dosage_form||''});setEditItem(row);
    }
    async function saveEditItem(e){
      e.preventDefault();if(!controller||busy||!editItem)return;
      const master=masterById.get(editItem.item_id); if(!master)return notifyStore('error','Stores Master record not found. Refresh and try again.');
      const name=String(editForm.item_name||'').trim(),unit=String(editForm.unit||'').trim();
      if(!name||!unit)return notifyStore('error','Item name and unit are required.');
      setBusy(true); const res=await client.rpc('store_incharge_edit_item',{p_item_id:master.id,p_item_name:name,p_unit:unit,p_strength:String(editForm.strength||'').trim()||null,p_dosage_form:String(editForm.dosage_form||'').trim()||null}); setBusy(false);
      if(res.error)notifyStore('error',res.error.message); else {notifyStore('success','Item details updated.');setEditItem(null);await load()}
    }
    function openReceiveFor(row){
      if(!controller)return;
      const master=masterById.get(row.item_id);
      setForm(f=>({...f,item_category:master?.item_category==='Pharmacy'?'Pharmacy':'Stores / Consumables',catalog_item:'',item_id:row.item_id,new_item_name:'',unit:row.unit||f.unit}));
      setShowReceive(true);
      setTimeout(()=>document.getElementById('stores-receive-form')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
    }
    async function editStoreChargeRate(row){
      if(!controller)return;
      const master=masterById.get(row.item_id); if(!master)return notifyStore('error','Stores Master record not found. Refresh and try again.');
      const input=prompt(`Charge rate for ${master.item_name}:`,String(master.charge_rate??0)); if(input===null)return;
      const rate=Number(input); if(!Number.isFinite(rate)||rate<0)return notifyStore('error','Enter a valid charge rate of zero or more.');
      setBusy(true); const res=await client.rpc('store_incharge_set_store_item_charge_rate',{p_item_id:master.id,p_charge_rate:rate}); setBusy(false);
      if(res.error)notifyStore('error',res.error.message); else {notifyStore('success','Charge rate updated for future patient charges. Previous patient charges are unchanged.');await load()}
    }
    function removeItem(row){
      if(!oversight||busy)return;
      if(!masterById.get(row.item_id))return notifyStore('error','Stores Master record not found. Refresh and try again.');
      setMoveChoice('');setRemoveTarget(row);
    }
    // 2.14.70: instead of removing, move the item to an approved category (Standard Item List).
    // Same section -> store in-charge sets the standard category; other section (Consumables <-> Pharmacy) -> Admin only,
    // using the same admin_update_store_item call as Stores Master > Move Item. Stock and history stay with the item.
    async function moveRemoveTarget(){
      const row=removeTarget; if(!row||busy||!moveChoice)return;
      const master=masterById.get(row.item_id); if(!master)return notifyStore('error','Stores Master record not found. Refresh and try again.');
      const [kind,...rest]=moveChoice.split('|'); const category=rest.join('|');
      const currentSection=master.item_category==='Pharmacy'?'Pharmacy':'Consumables';
      const targetSection=kind==='other'?(currentSection==='Pharmacy'?'Consumables':'Pharmacy'):currentSection;
      setBusy(true);
      if(kind==='other'){
        const moved=await client.rpc('admin_update_store_item',{p_item_id:master.id,p_item_name:master.item_name,p_category:targetSection,p_unit:master.unit||row.unit||'Nos',p_strength:master.strength||null,p_dosage_form:master.dosage_form||null});
        if(moved.error){setBusy(false);notifyStore('error',moved.error.message);return}
      }
      const tagged=await client.rpc('store_incharge_set_standard_category',{p_item_id:master.id,p_standard_category:category||null});
      setBusy(false);
      await writeAuditEvent('Move Store Item','ConsumableStoreItem',master.id,{item_name:row.item_name,from_section:currentSection,to_section:targetSection,to_category:category||null});
      const label=`${targetSection}${category?` → ${category}`:''}`;
      if(tagged.error&&kind!=='other'){notifyStore('error',tagged.error.message);return}
      notifyStore('success',tagged.error?`${displayStoreItemName(row.item_name)} moved to ${targetSection}. Set its category there with the Category button (${tagged.error.message}).`:`${displayStoreItemName(row.item_name)} moved to ${label}. Stock and history are kept.`);
      setRemoveTarget(null);setMoveChoice('');await load();
    }
    async function confirmRemoveItem(){
      const row=removeTarget; if(!oversight||busy||!row)return;
      const master=masterById.get(row.item_id); if(!master){setRemoveTarget(null);return notifyStore('error','Stores Master record not found. Refresh and try again.');}
      setBusy(true);
      const res=await client.rpc('store_item_remove',{p_item_id:master.id});
      setBusy(false);
      if(res.error){notifyStore('error',res.error.message);return}
      setRemoveTarget(null);
      await writeAuditEvent('Remove Store Item','ConsumableStoreItem',master.id,{item_name:row.item_name,mode:res.data?.mode});
      notifyStore('success',res.data?.mode==='deleted'?`${displayStoreItemName(row.item_name)} removed.`:`${displayStoreItemName(row.item_name)} removed from the active stock list (its past receipts and issues are kept).`);
      await load();
    }
    const low=categoryStock.filter(x=>Number(x.balance_qty)>0&&Number(x.reorder_level)>0&&Number(x.balance_qty)<=Number(x.reorder_level));
    const out=categoryStock.filter(x=>Number(x.balance_qty)<=0);
    const inStock=categoryStock.filter(x=>Number(x.balance_qty)>0).length;
    const stockStatus=row=>Number(row.balance_qty)<=0?'OUT OF STOCK':(Number(row.reorder_level)>0&&Number(row.balance_qty)<=Number(row.reorder_level)?'LOW STOCK':'IN STOCK');
    const statusStyle=row=>({fontWeight:900,fontSize:'12px',padding:'5px 8px',borderRadius:'999px',display:'inline-block',background:Number(row.balance_qty)<=0?'#fdebec':(Number(row.reorder_level)>0&&Number(row.balance_qty)<=Number(row.reorder_level)?'#fff4dc':'#e7f6ef'),color:'#5d3146'});
    if(section==='none')return null;
    if(!controller&&!oversight)return h('div',null,h(Section,{title:'Pharmacy & Stores'},h('p',null,authority.active?'Pharmacy & Stores is presently assigned to the STD.':'Pharmacy & Stores access is assigned to the Nurse Manager.')));
    return h('div',null,
      show('stock')&&h(Section,{title:categoryFilter||'Pharmacy & Stores',subtitle:`${categoryFilter==='Pharmacy'?'Medicines and pharmacy stock':categoryFilter==='Consumables'?'Patient consumables and general store stock':'Medicines, consumables, vendor receipts, stock issues and balances'}. Current In-charge: ${authority.active?'STD (temporary assignment)':'Nurse Manager'}.`},
        h('div',{className:'grid stats'},
          h('button',{type:'button',className:'card stat',onClick:()=>showStockView('In Stock'),style:{width:'100%',textAlign:'left',cursor:'pointer',fontFamily:'inherit',border:stockView==='In Stock'?'2px solid #b30b5d':'1px solid #ead2dd'}},h('span',null,'Items in Stock'),h('strong',null,inStock),h('small',{style:{display:'block',marginTop:'6px',fontWeight:800,color:'#9b1456'}},'Tap to view →')),
          h('button',{type:'button',className:'card stat',onClick:()=>showStockView('Low Stock'),style:{width:'100%',textAlign:'left',cursor:'pointer',fontFamily:'inherit',border:stockView==='Low Stock'?'2px solid #b30b5d':'1px solid #ead2dd'}},h('span',null,'Low Stock'),h('strong',null,low.length),h('small',{style:{display:'block',marginTop:'6px',fontWeight:800,color:'#9b1456'}},'Tap to view →')),
          h('button',{type:'button',className:'card stat',onClick:()=>showStockView('Out of Stock'),style:{width:'100%',textAlign:'left',cursor:'pointer',fontFamily:'inherit',border:stockView==='Out of Stock'?'2px solid #b30b5d':'1px solid #ead2dd'}},h('span',null,'Out of Stock'),h('strong',null,out.length),h('small',{style:{display:'block',marginTop:'6px',fontWeight:800,color:'#9b1456'}},'Tap to view →')),
          h('button',{type:'button',className:'card stat',onClick:()=>showStockView('All'),style:{width:'100%',textAlign:'left',cursor:'pointer',fontFamily:'inherit',border:stockView==='All'?'2px solid #b30b5d':'1px solid #ead2dd'}},h('span',null,'Store Items'),h('strong',null,categoryStock.length),h('small',{style:{display:'block',marginTop:'6px',fontWeight:800,color:'#9b1456'}},'Tap to view →'))
        )
      ),
      !section&&controller&&h('div',{className:'stores-action-bar',style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'0 0 16px'}},
        h('button',{type:'button',className:showReceive?'btn btn-secondary':'btn btn-primary',onClick:()=>{const next=!showReceive;setShowReceive(next);if(next)setTimeout(()=>document.getElementById('stores-receive-form')?.scrollIntoView({behavior:'smooth',block:'start'}),60);}},showReceive?'✕ Close Receive from Vendor':'＋ Receive from Vendor'),
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>document.getElementById('stores-current-stock')?.scrollIntoView({behavior:'smooth',block:'start'})},'⌕ Search / Edit Stock')
      ),
      controller&&(section==='receive'||((!section||section==='stock')&&showReceive))&&h('div',{id:'stores-receive-form',style:{scrollMarginTop:'90px'}},h(Section,{title:'Receive from Vendor',subtitle:'Every pharmacy or Stores item received from a vendor must first be entered here before issue.'},
        h('div',{className:'field',style:{marginBottom:'12px'}},h('label',null,'Find item to receive (minimum 3 characters)'),h('input',{value:stockSearch,onChange:e=>setStockSearch(e.target.value),placeholder:categoryFilter==='Pharmacy'?'Example: dispo, syr, para':'Example: dia, glo, syr'}),h('small',null,stockSearch.trim().length>0&&stockSearch.trim().length<3?'Enter at least 3 characters.':'Matching items appear below — tap one to select.'),stockSearchText.length>=3&&h('div',{style:{marginTop:'8px',border:'1px solid #ead2dd',borderRadius:'10px',padding:'6px',maxHeight:'220px',overflowY:'auto',background:'#fff'}},(()=>{const master=(form.item_category==='Pharmacy'?pharmacyCatalog:storesCatalog).filter(x=>String(x||'').toLowerCase().includes(stockSearchText)).map(x=>({kind:'catalog',name:x,label:x}));const existing=categoryStock.filter(x=>String(x.item_name||'').toLowerCase().includes(stockSearchText)).map(x=>({kind:'existing',id:x.item_id,name:x.item_name,label:`${masterById.get(x.item_id)?.item_code?`${masterById.get(x.item_id).item_code} · `:''}${displayStoreItemName(x.item_name)} · Balance ${x.balance_qty} ${x.unit}`}));const seen=new Set();const matches=[...existing,...master].filter(x=>{const k=String(x.name||'').toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,30);return matches.length?matches.map((x,i)=>h('button',{key:`search-${x.kind}-${x.id||i}`,type:'button',className:'btn btn-secondary',style:{display:'block',width:'100%',textAlign:'left',margin:'3px 0'},onClick:()=>{x.kind==='existing'?selectItem(x.id):selectCatalogItem(x.name);setStockSearch('')}},x.label)):h('div',{style:{padding:'8px',color:'#7b6570'}},'No matching item found in this section.');})())),
        h('form',{onSubmit:receiveStock},
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Section *'),h('select',{value:form.item_category,onChange:e=>setForm({...form,item_category:e.target.value,catalog_item:'',item_id:'',new_item_name:'',unit:e.target.value==='Pharmacy'?'Packs':'Nos'})},['Stores / Consumables','Pharmacy'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Standard Item List'),h('select',{value:form.catalog_item,onChange:e=>selectCatalogItem(e.target.value)},h('option',{value:''},'Select from standard list'),((form.item_category==='Pharmacy'?pharmacyCatalog:storesCatalog).filter(x=>stockSearchText.length<3||String(x||'').toLowerCase().includes(stockSearchText))).map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Existing Inventory Item'),h('select',{value:form.item_id,onChange:e=>selectItem(e.target.value)},h('option',{value:''},'Select existing item'),((stockSearchText.length>=3?standardCategoryStock.filter(x=>String(x.item_name||'').toLowerCase().includes(stockSearchText)):standardCategoryStock)).map(x=>h('option',{key:x.item_id,value:x.item_id},`${masterById.get(x.item_id)?.item_code?`${masterById.get(x.item_id).item_code} · `:''}${displayStoreItemName(x.item_name)} · Balance ${x.balance_qty} ${x.unit}`))),form.catalog_item&&h('small',null,standardCategoryFilterActive?`Showing only items tagged "${form.catalog_item}".`:`No items are tagged "${form.catalog_item}" yet, so every ${form.item_category} item is shown below — use the Category button on an item, or Assign Category to All, to start filtering.`)),
            h('div',{className:'field'},h('label',null,'Add Item Manually'),h('input',{value:form.new_item_name,onChange:e=>setForm({...form,new_item_name:e.target.value,catalog_item:'',item_id:''}),placeholder:form.item_category==='Pharmacy'?'Enter medicine / pharmacy item':'Enter Stores item'})),
            h('div',{className:'field'},h('label',null,'Unit'),h('select',{value:form.unit,onChange:e=>setForm({...form,unit:e.target.value}),disabled:Boolean(form.item_id)},units.map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Quantity Received *'),h('input',{type:'number',min:'0.01',step:'0.01',value:form.quantity,onChange:e=>setForm({...form,quantity:e.target.value}),required:true})),
            h('div',{className:'field'},h('label',null,'Vendor *'),h('input',{value:form.vendor_name,onChange:e=>setForm({...form,vendor_name:e.target.value}),required:true,placeholder:'Vendor / Supplier name'})),
            h('div',{className:'field'},h('label',null,'Invoice / Bill No.'),h('input',{value:form.invoice_no,onChange:e=>setForm({...form,invoice_no:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Invoice Date'),h(StrictDateInput,{value:form.invoice_date,onChange:e=>setForm({...form,invoice_date:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Received Date *'),h(StrictDateInput,{value:form.received_date,onChange:e=>setForm({...form,received_date:e.target.value}),required:true})),
            h('div',{className:'field'},h('label',null,'Batch / Lot No.'),h('input',{value:form.batch_no,onChange:e=>setForm({...form,batch_no:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Expiry Date'),h(StrictDateInput,{value:form.expiry_date,onChange:e=>setForm({...form,expiry_date:e.target.value})}),h('small',null,'Optional now — can be added later with the item\'s Expiry button.')),
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
      )),
      h('div',{id:'stores-current-stock',style:{scrollMarginTop:'90px'}},show('stock')&&h(Section,{title:`Current ${categoryFilter||'Pharmacy & Stores'} Stock${stockView!=='All'?` — ${stockView}`:''}`,subtitle:'Tap History on any item to see its complete stock-wise movement trail: vendor receipts, patient handovers/issues, confirmed returns and balance after every movement. Use Category to tag an item so it appears when that Standard Item List category is chosen above.'},
        h('div',{className:'field',style:{marginBottom:'12px'}},h('label',null,'Search stock'),h('input',{type:'search',value:listSearch,onChange:e=>setListSearch(e.target.value),placeholder:'Item name or code — e.g. diaper or CON-0017'}),listSearchText?h('small',null,`${displayStock.length} matching item${displayStock.length===1?'':'s'}${stockView!=='All'?` in ${stockView}`:''}`):null),
        controller&&h('div',{style:{marginBottom:'12px',display:'flex',gap:'8px',flexWrap:'wrap'}},
          untaggedGuessableCount>0&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:autoAssignCategories},`Assign Category to All (${untaggedGuessableCount})`),
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:openCleanupNames},'Clean Up Item Names (remove trailing quantity)')
        ),
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
            h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>openReceiveFor(r)},'Receive Stock'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>setReorder(r)},'Set Minimum'),
            oversight?h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>reconcile(r)},'Physical Tally'):null,h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>openItemHistory(r)},'History'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>openExpiryEdit(r)},'Expiry'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreItem(r)},'Edit Item'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>openCategoryEdit(r)},masterById.get(r.item_id)?.standard_category?`Category: ${masterById.get(r.item_id).standard_category}`:'Set Category'),canEditChargeRate?h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreChargeRate(r)},`Rate ₹${Number(masterById.get(r.item_id)?.charge_rate||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`):null
          ):h('small',{className:'stores-view-only'},'View only'),
          oversight?h('div',{className:'stores-stock-card-actions',style:{marginTop:'6px'}},h('button',{className:'btn btn-danger',disabled:busy,onClick:()=>removeItem(r)},'Remove Item')):null
        )):h('div',{className:'stores-stock-empty'},'No store items found.')),
        h('div',{className:'table-wrap stores-stock-desktop'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Item ID','Item','Unit','Total In','Total Out','Balance','Reorder Level','Status','Action'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,displayStock.length?displayStock.map(r=>h('tr',{key:r.item_id},
            h('td',null,masterById.get(r.item_id)?.item_code||'—'),h('td',null,h('strong',null,displayStoreItemName(r.item_name))),h('td',null,r.unit),h('td',null,r.total_in),h('td',null,r.total_out),h('td',null,h('strong',null,r.balance_qty)),h('td',null,r.reorder_level),h('td',null,h('span',{style:statusStyle(r)},stockStatus(r))),
            h('td',null,h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}},
              controller?h('div',{key:'controller-actions',style:{display:'flex',gap:'6px',flexWrap:'wrap'}},h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>openReceiveFor(r)},'Receive Stock'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>setReorder(r)},'Set Minimum'),oversight?h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>reconcile(r)},'Physical Tally'):null,h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>openItemHistory(r)},'History'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>openExpiryEdit(r)},'Expiry'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreItem(r)},'Edit Item'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>openCategoryEdit(r)},masterById.get(r.item_id)?.standard_category?`Category: ${masterById.get(r.item_id).standard_category}`:'Set Category'),canEditChargeRate?h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreChargeRate(r)},`Rate ₹${Number(masterById.get(r.item_id)?.charge_rate||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`):null):h('span',{key:'view-only'},'View only'),
              oversight?h('button',{key:'remove',className:'btn btn-danger',disabled:busy,onClick:()=>removeItem(r)},'Remove'):null
            ))
          )):h('tr',null,h('td',{colSpan:9,style:{textAlign:'center',padding:'24px'}},'No store items found.'))
        ))
      )),
      show('receipts')&&h(Section,{title:`${categoryFilter?categoryFilter+' — ':''}Vendor Receipt Register`},
        h('div',{className:'stores-register-mobile'},displayReceipts.length?displayReceipts.map(r=>{const item=itemById(r.item_id);return h('article',{className:'stores-ledger-card',key:`mobile-receipt-${r.id}`},h('div',{className:'stores-ledger-card-head'},h('strong',null,`SR-${String(r.receipt_no||'').padStart(5,'0')}`),h('span',null,formatDateIN(r.received_date))),h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Item'),h('strong',null,item?.item_name||'—')),h('div',null,h('small',null,'Quantity'),h('strong',null,`${r.quantity} ${r.unit}`)),h('div',null,h('small',null,'Vendor'),h('strong',null,r.vendor_name||'—')),h('div',null,h('small',null,'Invoice'),h('strong',null,[r.invoice_no,r.invoice_date&&formatDateIN(r.invoice_date)].filter(Boolean).join(' · ')||'—')),h('div',null,h('small',null,'Batch / Expiry'),h('strong',null,batchExpiryCell(r))),h('div',null,h('small',null,'Received By'),h('strong',null,r.received_by_name||'—'))),controller&&h('div',{style:{marginTop:'8px'}},h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openExpiryEdit(receiptItemRow(r),r.id)},r.expiry_date?'Edit Expiry':'Add Expiry')))}):h('div',{className:'stores-view-only'},'No vendor receipts recorded.')),
        h('div',{className:'table-wrap stores-register-desktop'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Receipt','Date','Item','Qty','Vendor','Invoice','Batch / Expiry','Received By',...(controller?['Action']:[])].map(x=>h('th',{key:x},x)))),
          h('tbody',null,displayReceipts.length?displayReceipts.map(r=>{const item=itemById(r.item_id);return h('tr',{key:r.id},h('td',null,`SR-${String(r.receipt_no||'').padStart(5,'0')}`),h('td',null,formatDateIN(r.received_date)),h('td',null,item?.item_name||'—'),h('td',null,`${r.quantity} ${r.unit}`),h('td',null,r.vendor_name),h('td',null,[r.invoice_no,r.invoice_date&&formatDateIN(r.invoice_date)].filter(Boolean).join(' · ')||'—'),h('td',null,batchExpiryCell(r)),h('td',null,r.received_by_name||'—'),controller&&h('td',null,h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openExpiryEdit(receiptItemRow(r),r.id)},r.expiry_date?'Edit Expiry':'Add Expiry')))}):h('tr',null,h('td',{colSpan:controller?9:8,style:{textAlign:'center',padding:'24px'}},'No vendor receipts recorded.')))
        ))
      ),
      section==='expiry'&&h(Section,{title:`${categoryFilter?categoryFilter+' — ':''}Expiry Watch`,subtitle:'Vendor receipts of items still in stock that are expired, expire within 90 days, or have no expiry date entered. Most urgent first.'},
        h('div',{className:'stores-mode-switch',role:'tablist',style:{marginBottom:'12px'}},[['All',`All (${expiryWatch.length})`],['expired',`Expired (${storesSummary.expired})`],['soon',`Within 90 days (${storesSummary.soon})`],['missing',`Expiry not entered (${storesSummary.missing})`]].map(([k,l])=>h('button',{key:k,type:'button',role:'tab','aria-selected':expiryWatchFilter===k,className:expiryWatchFilter===k?'active':'',onClick:()=>setExpiryWatchFilter(k)},l))),
        expiryWatchVisible.length?h('div',{className:'stores-expiry-list'},expiryWatchVisible.map(r=>{const item=receiptItemRow(r);return h('article',{key:`expiry-${r.id}`,className:`stores-ledger-card stores-expiry-${r._state}`},
          h('div',{className:'stores-ledger-card-head'},h('strong',null,`${masterById.get(r.item_id)?.item_code?masterById.get(r.item_id).item_code+' · ':''}${displayStoreItemName(item.item_name)}`),h('span',null,r._state==='expired'?'EXPIRED':r._state==='soon'?'Expires within 90 days':'Expiry not entered')),
          h('div',{className:'stores-ledger-card-fields'},
            h('div',null,h('small',null,'Batch / Expiry'),h('strong',null,batchExpiryCell(r))),
            h('div',null,h('small',null,'Receipt'),h('strong',null,`SR-${String(r.receipt_no||'').padStart(5,'0')} · ${formatDateIN(r.received_date)}`)),
            h('div',null,h('small',null,'Received Qty'),h('strong',null,`${r.quantity} ${r.unit||item.unit||''}`)),
            h('div',null,h('small',null,'Item Balance Now'),h('strong',null,`${item.balance_qty} ${item.unit||''}`)),
            h('div',null,h('small',null,'Vendor'),h('strong',null,r.vendor_name||'—'))
          ),
          controller&&h('div',{style:{marginTop:'8px'}},h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openExpiryEdit(item,r.id)},r.expiry_date?'Edit Expiry':'Add Expiry'))
        )})):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},expiryWatch.length?'Nothing in this filter.':'All good — no expired, soon-to-expire or missing expiry dates for items in stock.')
      ),
      editItem&&h('div',{className:'modal-backdrop',style:{background:'rgba(45,18,31,.48)'}},
        h('form',{className:'modal-card',onSubmit:saveEditItem,style:{maxWidth:'560px',background:'#fffafd',opacity:1,padding:'22px'}},
          h('h3',null,'Edit Item'),h('p',null,`${masterById.get(editItem.item_id)?.item_code?`${masterById.get(editItem.item_id).item_code} · `:''}Balance ${editItem.balance_qty} ${editItem.unit}. Stock quantities are not changed here.`),
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Item name *'),h('input',{value:editForm.item_name,onChange:e=>setEditForm({...editForm,item_name:e.target.value}),required:true})),
            h('div',{className:'field'},h('label',null,'Unit *'),h('select',{value:editForm.unit,onChange:e=>setEditForm({...editForm,unit:e.target.value})},[...new Set([editForm.unit,...units].filter(Boolean))].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Strength / specification'),h('input',{value:editForm.strength,onChange:e=>setEditForm({...editForm,strength:e.target.value}),placeholder:'Example: 500 mg or 10 mL'})),
            h('div',{className:'field'},h('label',null,'Dosage form'),h('input',{value:editForm.dosage_form,onChange:e=>setEditForm({...editForm,dosage_form:e.target.value}),placeholder:'Example: Tablet (pharmacy items)'}))
          ),
          h('div',{style:{display:'flex',gap:'8px',justifyContent:'flex-end',flexWrap:'wrap',marginTop:'8px'}},h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setEditItem(null)},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save Changes'))
        )
      ),
      removeTarget&&h('div',{className:'modal-backdrop',style:{background:'rgba(45,18,31,.48)'}},
        h('div',{className:'modal-card',role:'alertdialog','aria-modal':'true',style:{maxWidth:'520px',background:'#fffafd',opacity:1,padding:'22px'}},
          h('h3',null,'Remove or Move Item'),
          h('p',null,h('strong',null,`${masterById.get(removeTarget.item_id)?.item_code?`${masterById.get(removeTarget.item_id).item_code} · `:''}${displayStoreItemName(removeTarget.item_name)}`),` — balance ${removeTarget.balance_qty} ${removeTarget.unit}.`),
          (controller||isAdminProfile)&&(()=>{
            const m=masterById.get(removeTarget.item_id)||{};const cur=m.item_category==='Pharmacy'?'Pharmacy':'Consumables';const other=cur==='Pharmacy'?'Consumables':'Pharmacy';
            const sameList=(cur==='Pharmacy'?pharmacyCatalog:storesCatalog).filter(x=>x!==m.standard_category);const otherList=other==='Pharmacy'?pharmacyCatalog:storesCatalog;
            return h('div',{style:{border:'1px solid #ead2dd',borderRadius:'12px',padding:'12px',margin:'4px 0 14px',background:'#fff'}},
              h('strong',{style:{display:'block',marginBottom:'4px'}},'Move to another category instead'),
              h('small',{style:{display:'block',marginBottom:'8px'}},`Currently: ${cur}${m.standard_category?` → ${m.standard_category}`:' (no category)'}. Moving keeps the item code, stock balance and history.`),
              h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},
                h('select',{value:moveChoice,onChange:e=>setMoveChoice(e.target.value),style:{flex:'1 1 240px',minWidth:0}},
                  h('option',{value:''},'Select approved category…'),
                  controller&&h('optgroup',{label:`Within ${cur}`},sameList.map(x=>h('option',{key:`s-${x}`,value:`same|${x}`},x))),
                  isAdminProfile&&h('optgroup',{label:`Move to ${other} (Admin)`},otherList.map(x=>h('option',{key:`o-${x}`,value:`other|${x}`},x)))
                ),
                h('button',{type:'button',className:'btn btn-primary',disabled:busy||!moveChoice,onClick:moveRemoveTarget},busy?'Moving…':'Move Item')
              ),
              other==='Pharmacy'&&isAdminProfile&&h('small',{style:{display:'block',marginTop:'6px'}},'Pharmacy is only for medicines; clinical supplies stay in Consumables.')
            );
          })(),
          h('strong',{style:{display:'block',marginBottom:'2px'}},'Or remove it'),
          h('p',null,Number(removeTarget.total_in)>0||Number(removeTarget.total_out)>0?'This item has stock history, so it will be removed from the active stock list and its past receipts, issues and charges will be kept.':'This item has never been received or issued, so it will be deleted.'),
          Number(removeTarget.balance_qty)>0&&h('p',{style:{color:'#a12f29',fontWeight:700}},`Note: ${removeTarget.balance_qty} ${removeTarget.unit} is still shown in stock. Use Physical Tally first if this stock no longer exists.`),
          h('div',{style:{display:'flex',gap:'8px',justifyContent:'flex-end',flexWrap:'wrap',marginTop:'8px'}},h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{setRemoveTarget(null);setMoveChoice('')}},'Cancel'),h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:confirmRemoveItem},busy?'Removing…':'Remove Item'))
        )
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
                h('div',null,h('small',null,'Batch / Expiry'),h('strong',null,batchExpiryCell(r))),
                h('div',null,h('small',null,'Received By'),h('strong',null,r.received_by_name||'—'))
              )
            )):h('p',null,'No vendor receipts recorded for this item.')
          )
        )
      ),
      expiryItem&&h('div',{className:'modal-backdrop',style:{background:'rgba(45,18,31,.48)'}},
        h('div',{className:'modal-card',style:{maxWidth:'860px',maxHeight:'88vh',overflowY:'auto',background:'#fffafd',opacity:1,padding:'22px'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:'12px',flexWrap:'wrap',alignItems:'flex-start'}},
            h('div',null,
              h('h3',null,`${displayStoreItemName(expiryItem.item_name)} — Batch & Expiry`),
              h('p',{className:'small-note'},'Add or correct the batch number and expiry date for each vendor receipt of this item. Quantities, stock balance, vendor and invoice are not changed.')
            ),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setExpiryItem(null)},'Close')
          ),
          expiryLoading?h('p',null,'Loading vendor receipts…'):expiryRows.length?expiryRows.map(rec=>{
            const edit=expiryEdits[rec.id]||{batch_no:'',expiry_date:''};
            return h('form',{key:rec.id,id:`expiry-receipt-${rec.id}`,className:'stores-ledger-card',onSubmit:e=>saveReceiptExpiry(e,rec),
                style:{marginBottom:'10px',border:expiryFocus===rec.id?'2px solid #b3136a':undefined}},
              h('div',{className:'stores-ledger-card-head'},
                h('strong',null,`SR-${String(rec.receipt_no||'').padStart(5,'0')}`),
                h('span',null,`Received ${formatDateIN(rec.received_date)} · ${rec.quantity} ${rec.unit} · ${rec.vendor_name||'—'}${rec.invoice_no?` · Inv ${rec.invoice_no}`:''}`)
              ),
              h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'10px',alignItems:'end',marginTop:'8px'}},
                h('div',{className:'field',style:{margin:0}},h('label',null,'Batch No.'),h('input',{value:edit.batch_no,onChange:e=>setExpiryEdit(rec.id,'batch_no',e.target.value),placeholder:'As printed on the pack'})),
                h('div',{className:'field',style:{margin:0}},h('label',null,'Expiry Date'),h(StrictDateInput,{value:edit.expiry_date,onChange:e=>setExpiryEdit(rec.id,'expiry_date',e.target.value)})),
                h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
                  h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save Expiry'),
                  edit.expiry_date&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setExpiryEdit(rec.id,'expiry_date','')},'Clear date')
                )
              ),
              h('small',{style:{display:'block',marginTop:'6px'}},'Now: ',batchExpiryCell(rec),rec.expiry_updated_at?` · last changed ${formatDateTimeIN(rec.expiry_updated_at)}${rec.expiry_updated_by_name?` by ${rec.expiry_updated_by_name}`:''}`:'')
            );
          }):h('p',null,'No vendor receipts recorded for this item yet. The expiry date is entered when stock is received.')
        )
      ),
      categoryEditItem&&h('div',{className:'modal-backdrop',style:{background:'rgba(45,18,31,.48)'}},
        h('div',{className:'modal-card',style:{maxWidth:'420px'}},
          h('h3',null,'Standard Category'),
          h('p',{className:'small-note'},displayStoreItemName(categoryEditItem.item_name)),
          h('div',{className:'field'},h('label',null,'Category'),
            h('select',{value:categoryEditValue,onChange:e=>setCategoryEditValue(e.target.value)},
              h('option',{value:''},'— None —'),
              (masterById.get(categoryEditItem.item_id)?.item_category==='Pharmacy'?pharmacyCatalog:storesCatalog).map(x=>h('option',{key:x,value:x},x))
            )
          ),
          h('div',{style:{display:'flex',gap:'8px',marginTop:'14px',flexWrap:'wrap'}},
            h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:saveCategoryEdit},busy?'Saving…':'Save'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setCategoryEditItem(null)},'Cancel')
          )
        )
      ),
      cleanupCandidates&&h('div',{className:'modal-backdrop',style:{background:'rgba(45,18,31,.48)'}},
        h('div',{className:'modal-card',style:{maxWidth:'720px',maxHeight:'88vh',overflowY:'auto'}},
          h('h3',null,'Clean Up Item Names'),
          h('p',{className:'small-note'},'Untick, or edit the New Name, for any row that is not actually a mistaken quantity — e.g. a genuine strength/size code that happens to end in a number (such as "U-40") should be left as is.'),
          h('div',{className:'table-wrap',style:{marginTop:'10px'}},h('table',{className:'table'},
            h('thead',null,h('tr',null,['','Current Name','New Name'].map(x=>h('th',{key:x},x)))),
            h('tbody',null,cleanupCandidates.map(c=>h('tr',{key:c.id},
              h('td',null,h('input',{type:'checkbox',checked:c.selected,onChange:()=>toggleCleanupCandidate(c.id)})),
              h('td',null,c.oldName),
              h('td',null,h('input',{value:c.newName,disabled:!c.selected,onChange:e=>editCleanupCandidateName(c.id,e.target.value),style:{width:'100%'}}))
            )))
          )),
          h('div',{style:{display:'flex',gap:'8px',marginTop:'14px',flexWrap:'wrap'}},
            h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:applyCleanupNames},busy?'Saving…':`Apply to ${cleanupCandidates.filter(c=>c.selected).length} item(s)`),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setCleanupCandidates(null)},'Cancel')
          )
        )
      ),
      show('movement')&&h(Section,{title:`${categoryFilter||'Pharmacy & Stores'} Stock Movement Register`,subtitle:section&&movementMode==='every'?'Every stock movement in the selected period and item, with the balance after each movement.':'Read-only period-wise reconciliation. Opening + Vendor Received + Return Received − Handed Over = Closing Balance.',actions:section?h('div',{className:'stores-mode-switch',role:'tablist'},[['summary','Summary'],['every','Every Movement']].map(([k,l])=>h('button',{key:k,type:'button',role:'tab','aria-selected':movementMode===k,className:movementMode===k?'active':'',onClick:()=>setMovementMode(k)},l))):null},
        h('div',{className:'form-grid',style:{marginBottom:'12px'}},
          h('div',{className:'field'},h('label',null,'Period'),h('select',{value:movementPeriod,onChange:e=>setMovementPeriod(e.target.value)},[['today','Today'],['yesterday','Yesterday'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['custom','Custom Date Range']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          h('div',{className:'field'},h('label',null,'Stock Item'),h('select',{value:movementItem,onChange:e=>setMovementItem(e.target.value)},h('option',{value:'All'},'All Items'),categoryStock.map(x=>h('option',{key:x.item_id,value:x.item_id},displayStoreItemName(x.item_name))))),
          movementPeriod==='custom'&&h('div',{className:'field'},h('label',null,'From'),h('input',{type:'date',value:movementFrom,onChange:e=>setMovementFrom(e.target.value)})),
          movementPeriod==='custom'&&h('div',{className:'field'},h('label',null,'To'),h('input',{type:'date',value:movementTo,onChange:e=>setMovementTo(e.target.value)}))
        ),
        h('p',{className:'small-note'},`Period: ${formatDateIN(movementBounds.from)} to ${formatDateIN(movementBounds.to)} · ${movementItem==='All'?'All stock items':displayStoreItemName(categoryStock.find(x=>String(x.item_id)===String(movementItem))?.item_name||'Selected item')}`),
        (!section||movementMode==='summary')&&h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Item','Opening Balance','Vendor Received','Handed Over','Return Received','Closing Balance'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,movementSummaryItems.length?movementSummaryItems.map(r=>h('tr',{key:`movement-summary-${r.item_id}`},h('td',null,displayStoreItemName(r.item_name)),h('td',null,`${r.opening} ${r.unit}`),h('td',null,`${r.received} ${r.unit}`),h('td',null,`${r.handed} ${r.unit}`),h('td',null,`${r.returned} ${r.unit}`),h('td',null,h('strong',null,`${r.closing} ${r.unit}`)))):h('tr',null,h('td',{colSpan:6,style:{textAlign:'center',padding:'20px'}},'No stock items for this filter.')))
        )),
        (!section||movementMode==='summary')&&movementItem!=='All'&&h('div',{style:{marginTop:'16px'}},h('h4',null,'Selected Item — Movement Details'),movementSelectedLedger.length?movementSelectedLedger.map(r=>{const item=itemById(r.item_id);return h('div',{key:`movement-detail-${r.id}`,className:'stores-ledger-card',style:{marginBottom:'8px'}},h('div',{className:'stores-ledger-card-head'},h('strong',null,r.movement_type||'Stock Movement'),h('span',null,formatDateTimeIN(r.movement_at))),h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Stock In'),h('strong',null,Number(r.qty_in)>0?`${r.qty_in} ${item?.unit||''}`:'—')),h('div',null,h('small',null,'Stock Out'),h('strong',null,Number(r.qty_out)>0?`${r.qty_out} ${item?.unit||''}`:'—')),h('div',null,h('small',null,'Balance After'),h('strong',null,r.balance_after)),h('div',null,h('small',null,'Patient / Reference'),h('strong',null,[r.patient_id&&patientName(r.patient_id),r.reference_text].filter(Boolean).join(' · ')||'—')),h('div',null,h('small',null,'By'),h('strong',null,r.actor_name||'—'))))}):h('p',null,'No movements for this item in the selected period.'))
      ),
      (!section||(section==='movement'&&movementMode==='every'))&&h(Section,{title:`${categoryFilter||'Pharmacy & Stores'} Stock Ledger${section?` · ${ledgerList.length} movement(s)`:''}`,subtitle:'Every vendor receipt, patient handover/issue, confirmed return and physical adjustment is retained here. Use an item’s History button for its complete stock-wise trail.'},
        h('div',{className:'stores-ledger-mobile'},ledgerList.length?ledgerList.map(r=>{const item=itemById(r.item_id);return h('article',{className:'stores-ledger-card',key:`mobile-ledger-${r.id}`},h('div',{className:'stores-ledger-card-head'},h('strong',null,`SM-${String(r.movement_no||'').padStart(6,'0')}`),h('span',null,formatDateTimeIN(r.movement_at))),h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Item'),h('strong',null,item?.item_name||'—')),h('div',null,h('small',null,'Movement Type'),h('strong',null,r.movement_type||'—')),h('div',null,h('small',null,'Stock In'),h('strong',null,Number(r.qty_in)>0?`${r.qty_in} ${item?.unit||''}`:'—')),h('div',null,h('small',null,'Stock Out'),h('strong',null,Number(r.qty_out)>0?`${r.qty_out} ${item?.unit||''}`:'—')),h('div',null,h('small',null,'Balance After'),h('strong',null,r.balance_after)),h('div',null,h('small',null,'Patient / Reference'),h('strong',null,[r.patient_id&&patientName(r.patient_id),r.reference_text].filter(Boolean).join(' · ')||'—')),h('div',null,h('small',null,'By'),h('strong',null,r.actor_name||'—'))))}):h('div',{className:'stores-view-only'},'No stock movements recorded.')),
        h('div',{className:'table-wrap stores-ledger-desktop'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Movement','Date / Time','Item','Type','Stock In','Stock Out','Balance After','Patient / Reference','By'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,ledgerList.length?ledgerList.map(r=>{const item=itemById(r.item_id);return h('tr',{key:r.id},h('td',null,`SM-${String(r.movement_no||'').padStart(6,'0')}`),h('td',null,formatDateTimeIN(r.movement_at)),h('td',null,item?.item_name||'—'),h('td',null,r.movement_type),h('td',null,Number(r.qty_in)>0?`${r.qty_in} ${item?.unit||''}`:'—'),h('td',null,Number(r.qty_out)>0?`${r.qty_out} ${item?.unit||''}`:'—'),h('td',null,h('strong',null,r.balance_after)),h('td',null,[r.patient_id&&patientName(r.patient_id),r.reference_text].filter(Boolean).join(' · ')||'—'),h('td',null,r.actor_name||'—'))}):h('tr',null,h('td',{colSpan:9,style:{textAlign:'center',padding:'24px'}},'No stock movements recorded.')))
        ))
      )
    ));
  }

