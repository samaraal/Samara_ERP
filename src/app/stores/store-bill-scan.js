  // 2.18.0: Scan a supplier bill / delivery note in Stores → Receive from Vendor (from the Scan Lab trial, tested
  // on real Sun Surgicals / Jomed bills). The AI only reads (Edge Function store-scan). Staff check each line,
  // tick ✓ Verified, then "Receive verified lines" receives them into stock through the same database function
  // as the manual form. A line not in the Stores Master is created as a NEW item (the ERP gives its code) with
  // NO price — the Guest charge rate is fixed only by Admin / Director in Charge Master.
  const BILL_SCAN_SECTIONS=['Pharmacy','Consumables','Housekeeping & General','Kitchen / Food Stores'];
  const BILL_UNIT_ALIAS={strip:'Strips',strips:'Strips',box:'Boxes',boxes:'Boxes',bottle:'Bottles',btl:'Bottles',bott:'Bottles',nos:'Nos',no:'Nos',pcs:'Pieces',pc:'Pieces',piece:'Pieces',pieces:'Pieces',pair:'Pairs',pairs:'Pairs',pack:'Packs',packs:'Packs',pkt:'Packets',pkts:'Packets',packet:'Packets',roll:'Rolls',rolls:'Rolls',vial:'Vials',amp:'Ampoules',ampoule:'Ampoules',tube:'Tubes',sachet:'Sachets',kg:'Kg',g:'Grams',gm:'Grams',l:'Litres',ltr:'Litres',litre:'Litres',ml:'ml',doz:'Dozens',tab:'Tablets',cap:'Capsules',each:'Nos',ea:'Nos',unit:'Nos',units:'Nos',bag:'Packs',bags:'Packs',set:'Sets',sets:'Sets',can:'Cans',cyl:'Cylinders'};
  const billBase=name=>String(name||'').toLowerCase()
    .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syr|syrup|susp|inj|injection|oint|cream|gel|drops?)\b\.?/g,' ')
    .replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  function billLev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let prev=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur}return prev[n]}
  // Sizes / strengths must agree: "Sterile Gloves 6 1/2" is NOT "Sterile Gloves (6)".
  const billSizes=name=>(String(name||'').toLowerCase().replace(/(\d+)\s*(?:1\/2|½)/g,(m,a)=>`${a}.5`).replace(/(\d+)\s*(?:1\/4|¼)/g,(m,a)=>`${a}.25`).match(/\d+(?:\.\d+)?/g)||[]).map(Number).sort((a,b)=>a-b).join(',');
  function billMatch(name,items){
    const b=billBase(name);if(!b||!items.length)return {kind:'none'};
    const sz=billSizes(name);let best=null;
    for(const it of items){
      const ib=billBase(it.item_name);if(!ib)continue;const isz=billSizes(it.item_name);
      if(sz&&isz&&sz!==isz)continue;
      if(ib===b)return {kind:'exact',item:it};
      const contained=b.split(' ').length>1&&ib.split(' ').length>1&&(ib.includes(b)||b.includes(ib))?0.9:0;
      const ratio=Math.max(contained,1-billLev(b,ib)/Math.max(b.length,ib.length));
      if(!best||ratio>best.ratio)best={ratio,item:it};
    }
    return best&&best.ratio>=0.78?{kind:'near',item:best.item}:{kind:'none'};
  }
  const billPackCount=p=>{const t=String(p||'').toLowerCase().replace(/\s+/g,'');let m=t.match(/^(\d+)x(\d+)$/);if(m)return Number(m[1])*Number(m[2]);m=t.match(/^(\d+)(?:'?s|nos|pcs|tabs?|caps?)?$/);return m?Number(m[1]):0};
  const billUnit=u=>{const t=String(u||'').trim();if(!t)return '';if(STORE_UNITS.includes(t))return t;return BILL_UNIT_ALIAS[t.toLowerCase().replace(/[^a-z]/g,'')]||''};
  const billIso=v=>{const t=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;const m=t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:''};
  const billMonthEnd=ym=>{const m=String(ym||'').match(/^(\d{4})-(\d{2})$/);if(!m)return '';return new Date(Date.UTC(+m[1],+m[2],0)).toISOString().slice(0,10)};
  function billLines(x,items){
    return (Array.isArray(x?.items)?x.items:[]).slice(0,50).map((r,i)=>{
      const s=k=>String(r?.[k]??'').trim();
      const flags=new Set(Array.isArray(r?.unclear_fields)?r.unclear_fields:[]),notes={};
      const l={key:`b${Date.now()}-${i}`,item_name:s('item_name'),section:BILL_SCAN_SECTIONS.includes(s('item_category'))?s('item_category'):'',unit:billUnit(s('unit')),
        quantity:s('quantity').replace(/^(\d+)\.0+$/,'$1'),free_quantity:s('free_quantity').replace(/^(\d+)\.0+$/,'$1'),pack_size:s('pack_size'),batch_no:s('batch_no'),
        expiry_date:billIso(s('expiry_date')),unit_cost:s('unit_cost'),mrp:s('mrp'),gst_percent:s('gst_percent'),generic_name:s('generic_name'),brand_name:s('brand_name'),
        strength:s('strength'),dosage_form:s('dosage_form'),manufacturer:s('manufacturer'),remarks:s('remarks'),raw:s('raw_text'),page:r?.page||0,
        confidence:['high','medium','low'].includes(r?.confidence)?r.confidence:'low',verified:false,done:false,error:'',converted:false};
      if(s('item_category')==='Biomedical Equipment')notes.section='Biomedical Equipment is entered in the Biomedical Equipment register — remove this line, or choose a Stores section';
      if(s('unit')&&!l.unit){flags.add('unit');notes.unit=`Printed as "${s('unit')}" — choose the ERP unit`}
      if(!l.expiry_date&&r?.expiry_month){l.expiry_date=billMonthEnd(r.expiry_month);flags.add('expiry_date');notes.expiry_date=`Printed as ${r.expiry_text||r.expiry_month} — set to the last day of that month`}
      if(!l.expiry_date&&r?.expiry_text){flags.add('expiry_date');notes.expiry_date=`Printed as "${r.expiry_text}" — enter the date`}
      l.match=billMatch(l.item_name,items);
      if(l.match.kind==='exact'){const it=l.match.item;if(it.item_category&&BILL_SCAN_SECTIONS.includes(it.item_category))l.section=it.item_category;if(it.unit&&l.unit!==it.unit){if(l.unit)notes.unit=`Bill unit ${l.unit} — Stores keeps this item in ${it.unit}. Convert the quantity if needed.`;l.unit=it.unit;flags.add('unit')}}
      if(!l.section)flags.add('section');if(!l.unit)flags.add('unit');if(!/^\d+$/.test(l.quantity)){flags.add('quantity');notes.quantity='Stores counts whole numbers only — check the pack / unit'}
      l.flags=[...flags];l.notes=notes;return l;
    });
  }
  function billProblems(l){
    const p=[];
    if(!l.item_name.trim())p.push('Item name');
    if(!BILL_SCAN_SECTIONS.includes(l.section))p.push('Section');
    if(!STORE_UNITS.includes(l.unit))p.push('Unit');
    if(!/^\d+$/.test(String(l.quantity))||Number(l.quantity)<=0)p.push('Quantity (whole number)');
    if(l.free_quantity&&!/^\d+$/.test(String(l.free_quantity)))p.push('Free qty (whole number)');
    if(l.unit_cost&&!(Number(l.unit_cost)>=0))p.push('Rate');
    if(l.match.kind==='near')p.push('Choose: same as the Stores item, or a new item');
    return p;
  }
  function StoreBillScan({items,defaultSection,onReceived,notify}){
    const [busy,setBusy]=React.useState(false),[status,setStatus]=React.useState(''),[tone,setTone]=React.useState('');
    const [head,setHead]=React.useState(null),[lines,setLines]=React.useState([]),[subtotal,setSubtotal]=React.useState('');
    const activeItems=(items||[]).filter(i=>i.active!==false);
    async function read(files){
      if(lines.some(l=>l.verified&&!l.done)&&!confirm('Replace the checked lines below with this new bill?'))return;
      setBusy(true);setTone('');
      try{
        const x=await SAMARA_SCAN.withTimer(setStatus,`Reading ${files.length} page(s)…`,()=>SAMARA_SCAN.readBill(files));
        setHead({vendor_name:String(x.vendor_name||'').trim(),invoice_no:String(x.invoice_no||'').trim(),invoice_date:billIso(x.invoice_date),received_date:todayISOIndia(),remarks:String(x.remarks||'').trim()});
        setSubtotal(String(x.subtotal||''));
        // 2.18.3: one bill may mix Pharmacy, Consumables, Housekeeping … — each line keeps its OWN section (from the
        // Stores Master, else as read from the bill). Only a line whose section is not clear takes this page's section,
        // and it is marked yellow so staff confirm it.
        const fallback=BILL_SCAN_SECTIONS.includes(defaultSection)?defaultSection:'';
        const ls=billLines(x,activeItems).map(l=>l.section||!fallback?l:{...l,section:fallback,flags:[...new Set([...l.flags,'section'])],notes:{...l.notes,section:l.notes.section||`Section not clear on the bill — set to ${fallback} (this page). Change it if this is a ${fallback==='Pharmacy'?'Consumables / other':'Pharmacy / other'} item.`}});
        setLines(ls);setTone(ls.length?'ok':'error');
        setStatus(ls.length?`${ls.length} line(s) read. Check every yellow field against the bill, tick ✓ Verified on each line, then press Receive.`:'No stock lines could be read. Use the manual form below.');
      }catch(e){setTone('error');setStatus(e.message||'Could not read the bill.')}
      finally{setBusy(false)}
    }
    const setLine=(key,patch)=>setLines(ls=>ls.map(l=>l.key===key?{...l,...patch,verified:false,error:'',flags:l.flags.filter(f=>!(f in patch)),notes:Object.fromEntries(Object.entries(l.notes).filter(([k])=>!(k in patch)))}:l));
    const rematch=(key,name)=>setLines(ls=>ls.map(l=>l.key===key?{...l,item_name:name,match:billMatch(name,activeItems),verified:false}:l));
    const useItem=(l,it)=>setLines(ls=>ls.map(x=>x.key===l.key?{...x,item_name:it.item_name,section:BILL_SCAN_SECTIONS.includes(it.item_category)?it.item_category:x.section,unit:it.unit||x.unit,match:{kind:'exact',item:it},verified:false}:x));
    const asNew=l=>setLines(ls=>ls.map(x=>x.key===l.key?{...x,match:{kind:'none',forced:true},verified:false}:x));
    async function receive(){
      const todo=lines.filter(l=>l.verified&&!l.done);
      if(!head)return;
      if(!String(head.vendor_name||'').trim())return notify('error','Enter the Supplier / Vendor name.');
      if(!billIso(head.received_date))return notify('error','Enter the Received date (the day the goods arrived).');
      if(!todo.length)return notify('error','Tick ✓ Verified on the lines to receive first.');
      const fresh=todo.filter(l=>l.match.kind!=='exact').length;
      const bySection=BILL_SCAN_SECTIONS.map(sec=>[sec,todo.filter(l=>l.section===sec).length]).filter(([,n])=>n).map(([sec,n])=>`${sec}: ${n} line(s)`).join('\n');
      if(!confirm(`Receive ${todo.length} verified line(s) from ${head.vendor_name} into stock?\n\n${bySection}${fresh?`\n\n${fresh} NEW item(s) will be added to the Stores Master (no price — Admin / Director fixes the Guest rate in Charge Master).`:''}`))return;
      setBusy(true);let ok=0,bad=0;
      for(const l of todo){
        const qty=Number(l.quantity)+(Number(l.free_quantity)||0);
        const args={p_section:l.section,p_item_id:l.match.kind==='exact'?l.match.item.id:null,p_item_name:l.match.kind==='exact'?null:l.item_name.trim().replace(/\s+/g,' '),p_unit:l.unit,
          p_vendor_name:head.vendor_name.trim(),p_invoice_no:head.invoice_no.trim()||null,p_invoice_date:billIso(head.invoice_date)||null,p_received_date:billIso(head.received_date),p_quantity:qty,
          p_batch_no:l.batch_no.trim()||null,p_expiry_date:billIso(l.expiry_date)||null,p_unit_cost:String(l.unit_cost).trim()===''?null:Number(l.unit_cost),
          p_remarks:[`Category: ${l.section}`,'Scanned from supplier bill',Number(l.free_quantity)?`Billed ${l.quantity} + free ${l.free_quantity}`:'',l.mrp&&`MRP: ₹${l.mrp}`,l.gst_percent&&`GST: ${l.gst_percent}%`,l.generic_name&&`Generic: ${l.generic_name}`,l.brand_name&&`Brand: ${l.brand_name}`,l.strength&&`Strength: ${l.strength}`,l.dosage_form&&`Dosage form: ${l.dosage_form}`,l.manufacturer&&`Manufacturer: ${l.manufacturer}`,l.pack_size&&`Pack size: ${l.pack_size}`,l.remarks,head.remarks].filter(Boolean).join(' | ')};
        const {p_section,...legacy}=args;
        let res=await client.rpc('store_receive_into_section',args);
        if(res.error&&/store_receive_into_section|schema cache|could not find the function/i.test(res.error.message||'')&&['Consumables','Pharmacy'].includes(p_section))res=await client.rpc('receive_consumable_store_stock',legacy);
        if(res.error){bad++;setLines(ls=>ls.map(x=>x.key===l.key?{...x,error:res.error.message}:x))}
        else{ok++;setLines(ls=>ls.map(x=>x.key===l.key?{...x,done:true,error:''}:x))}
      }
      setBusy(false);
      notify(bad?'error':'success',`${ok} line(s) received into stock from ${head.vendor_name}.${bad?` ${bad} line(s) not received — see the red message on each.`:''}`);
      if(ok&&onReceived)onReceived();
    }
    const fld=(l,k,label,input)=>h('div',{className:'field',key:k,style:l.flags.includes(k)&&!l.verified?{background:'#fff8e1',borderRadius:'8px',padding:'4px'}:undefined},h('label',null,label),input,l.notes[k]&&!l.verified?h('small',{style:{color:'#8a5a00'}},l.notes[k]):null);
    const txt=(l,k,extra={})=>h('input',{value:l[k]||'',disabled:l.done,onChange:e=>setLine(l.key,{[k]:e.target.value}),...extra});
    const total=lines.reduce((a,l)=>a+(Number(l.quantity)||0)*(Number(l.unit_cost)||0),0);
    const pendingCount=lines.filter(l=>l.verified&&!l.done).length;
    return h('div',{className:'section-card',style:{background:'#fff4f9',borderColor:'#e7b6cf',marginBottom:'12px'}},
      h('strong',null,'Fill from the supplier bill'),
      h('small',{className:'small-note',style:{display:'block',margin:'4px 0 8px'}},'Photo or PDF of the bill / delivery note, up to 8 pages. Every line is matched to the Stores Master. Check each line, tick ✓ Verified, then Receive. NEW items are added without a price.'),
      h(SAMARA_SCAN.ScanButton,{label:'Scan supplier bill',readLabel:'Read & Fill Stock Arrival',busy,status,tone,onFiles:read}),
      head&&h('div',{className:'grid two',style:{marginTop:'10px'}},
        h('div',{className:'field'},h('label',null,'Vendor *'),h('input',{value:head.vendor_name,onChange:e=>setHead({...head,vendor_name:e.target.value})})),
        h('div',{className:'field'},h('label',null,'Invoice / Bill No.'),h('input',{value:head.invoice_no,onChange:e=>setHead({...head,invoice_no:e.target.value})})),
        h('div',{className:'field'},h('label',null,'Invoice Date'),h(StrictDateInput,{value:head.invoice_date,onChange:e=>setHead({...head,invoice_date:e.target.value})})),
        h('div',{className:'field'},h('label',null,'Received Date *'),h(StrictDateInput,{value:head.received_date,required:true,onChange:e=>setHead({...head,received_date:e.target.value})}),h('small',null,'The day the goods actually arrived'))),
      head&&subtotal&&lines.length?(()=>{const diff=Math.abs(total-Number(subtotal)),tol=Math.max(1,Number(subtotal)*0.002);
        return h('div',{style:SAMARA_SCAN.noteStyle(diff<tol?'ok':'error')},diff<tol?`✓ Lines total ₹${total.toFixed(2)} matches the bill subtotal ₹${Number(subtotal).toFixed(2)} — no line missed.`:`Lines total ₹${total.toFixed(2)} does not match the bill subtotal ₹${Number(subtotal).toFixed(2)} (difference ₹${diff.toFixed(2)}). A line may be missing or a quantity / rate misread.`)})():null,
      lines.map((l,i)=>{
        const problems=billProblems(l);const per=billPackCount(l.pack_size);const qtyTotal=(Number(l.quantity)||0)+(Number(l.free_quantity)||0);
        const m=l.match;
        return h('div',{key:l.key,className:'section-card',style:{borderLeft:`5px solid ${l.done?'#1b7a43':l.verified?'#2f7d32':l.confidence==='low'?'#c0392b':'#e0b84a'}`,margin:'10px 0',background:'#fff'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px',flexWrap:'wrap'}},
            h('strong',null,`${i+1}. ${l.done?'✓ Received':l.verified?'✓ Verified':l.confidence==='high'?'Check':l.confidence==='medium'?'Check carefully':'Hard to read'}`),
            l.raw?h('small',{style:{fontFamily:'monospace'}},`On the bill${l.page?` (page ${l.page})`:''}: ${l.raw}`):null),
          h('div',{className:'grid two'},
            fld(l,'item_name','Item name',h('div',null,h('input',{value:l.item_name,disabled:l.done,onChange:e=>rematch(l.key,e.target.value)}),
              m.kind==='exact'?h('small',{style:{color:'#1b7a43',fontWeight:700}},`✓ In Stores: ${m.item.item_code?m.item.item_code+' · ':''}${m.item.item_name} (${m.item.unit||'—'})`)
              :m.kind==='near'?h('small',{style:{color:'#8a5a00'}},`Same as ${m.item.item_code?m.item.item_code+' · ':''}${m.item.item_name}? `,h('button',{type:'button',className:'btn btn-secondary',style:{padding:'2px 8px'},onClick:()=>useItem(l,m.item)},'Yes, same item'),' ',h('button',{type:'button',className:'btn btn-secondary',style:{padding:'2px 8px'},onClick:()=>asNew(l)},'No, new item'))
              :h('small',{style:{color:l.done?'#1b7a43':'#8a5a00',fontWeight:l.done?700:400}},l.done?'✓ Added to the Stores Master as a new item — Guest rate to be fixed by Admin / Director in Charge Master.':'NEW item — added to the Stores Master when received (the ERP gives its code; no price).'))),
            fld(l,'section','Section',h('select',{value:l.section,disabled:l.done||m.kind==='exact',onChange:e=>setLine(l.key,{section:e.target.value})},h('option',{value:''},'Choose section'),BILL_SCAN_SECTIONS.map(x=>h('option',{key:x,value:x},x)))),
            fld(l,'unit','Unit',h('select',{value:l.unit,disabled:l.done||m.kind==='exact',onChange:e=>setLine(l.key,{unit:e.target.value})},h('option',{value:''},'Choose unit'),STORE_UNITS.map(x=>h('option',{key:x,value:x},x)))),
            fld(l,'quantity','Quantity billed',txt(l,'quantity',{inputMode:'numeric'})),
            fld(l,'free_quantity','Free qty',txt(l,'free_quantity',{inputMode:'numeric'})),
            fld(l,'unit_cost','Rate per unit (₹, before tax)',txt(l,'unit_cost',{inputMode:'decimal'})),
            fld(l,'batch_no','Batch / Lot No.',txt(l,'batch_no')),
            fld(l,'expiry_date','Expiry Date',h(StrictDateInput,{value:l.expiry_date,disabled:l.done,onChange:e=>setLine(l.key,{expiry_date:e.target.value})})),
            fld(l,'mrp','MRP (₹)',txt(l,'mrp',{inputMode:'decimal'})),
            fld(l,'gst_percent','GST %',txt(l,'gst_percent',{inputMode:'decimal'})),
            fld(l,'pack_size','Pack size',txt(l,'pack_size'))),
          per>1&&['Nos','Pieces','Tablets','Capsules'].includes(l.unit)&&!l.converted&&qtyTotal&&!l.done?h('div',{style:SAMARA_SCAN.noteStyle('')},
            `Pack ${l.pack_size}: ${qtyTotal} pack(s) on the bill = ${qtyTotal*per} ${l.unit}. Does Stores count single pieces for this item? `,
            h('button',{type:'button',className:'btn btn-secondary',style:{padding:'2px 8px'},onClick:()=>setLines(ls=>ls.map(x=>x.key===l.key?{...x,converted:true,verified:false,quantity:String((Number(x.quantity)||0)*per),free_quantity:x.free_quantity?String((Number(x.free_quantity)||0)*per):'',unit_cost:x.unit_cost?String(Math.round(Number(x.unit_cost)/per*100)/100):'',mrp:x.mrp?String(Math.round(Number(x.mrp)/per*100)/100):''}:x))},`Convert to ${(Number(l.quantity)||0)*per} ${l.unit}`),' ',
            h('button',{type:'button',className:'btn btn-secondary',style:{padding:'2px 8px'},onClick:()=>setLines(ls=>ls.map(x=>x.key===l.key?{...x,converted:true}:x))},'Keep as packs')):null,
          h('small',{className:'small-note',style:{display:'block'}},`Stock to receive: ${qtyTotal||'—'} ${l.unit||''}${Number(l.free_quantity)?` (${l.quantity} billed + ${l.free_quantity} free)`:''}`),
          l.error?h('div',{style:SAMARA_SCAN.noteStyle('error')},`Not received: ${l.error}`):null,
          !l.done&&h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',marginTop:'8px'}},
            problems.length&&!l.verified?h('small',{className:'error-text',style:{flex:'1 1 200px'}},'Still needed: '+problems.join(', ')):h('span',{style:{flex:'1 1 200px'}}),
            h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:()=>setLines(ls=>ls.filter(x=>x.key!==l.key))},'Remove line'),
            l.verified?h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setLines(ls=>ls.map(x=>x.key===l.key?{...x,verified:false}:x))},'Undo verify')
              :h('button',{type:'button',className:'btn btn-primary',disabled:busy||problems.length>0,title:problems.length?'Complete the missing details first':'I have checked this line against the bill',onClick:()=>setLines(ls=>ls.map(x=>x.key===l.key?{...x,verified:true}:x))},'✓ Verified')));
      }),
      lines.length?h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',marginTop:'8px'}},
        h('button',{type:'button',className:'btn btn-primary',disabled:busy||!pendingCount,onClick:receive},busy?'Receiving…':`Receive ${pendingCount} verified line(s) into stock`),
        h('small',{className:'small-note'},`${lines.filter(l=>l.done).length} received · ${pendingCount} verified · ${lines.filter(l=>!l.verified&&!l.done).length} still to check`),
        lines.every(l=>l.done)?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setLines([]);setHead(null);setStatus('');setSubtotal('')}},'Clear — next bill'):null):null);
  }
