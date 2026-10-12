  // 2.16.31: Kitchen units standardised. Every kitchen item is kept in ONE unit only — Kg, Litres or Nos —
  // and is bought in fixed pack sizes (e.g. Milk only as 500 ml or 1 L packets). Staff choose the pack and the
  // number of packets; the ERP converts to the item's unit, so stock never mixes ml with Litres or g with Kg.
  const KITCHEN_UNITS=['Kg','Litres','Nos'];
  const KITCHEN_UNIT_LABEL={Kg:'Kg',Litres:'Litres',Nos:'Nos (pieces / packets)'};
  const kGrams=(...n)=>n.map(x=>x>=1000?{label:`${x/1000} kg`,size:x/1000}:{label:`${x} g`,size:x/1000});
  const kMl=(...n)=>n.map(x=>x>=1000?{label:`${x/1000} L`,size:x/1000}:{label:`${x} ml`,size:x/1000});
  const kCount=(...n)=>n.map(([count,label])=>({label,size:count}));
  // [name, unit, packs, loose allowed (weigh / count directly)]
  const KITCHEN_STANDARD_GROUPS=[
    ['Rice, Flour & Grains',[
      ['Raw Rice (Ponni)','Kg',kGrams(1000,5000,10000,25000),true],['Boiled Rice (Puzhungal Arisi)','Kg',kGrams(1000,5000,10000,25000),true],['Idli Rice','Kg',kGrams(1000,5000,10000,25000),true],['Basmati Rice','Kg',kGrams(1000,5000),true],
      ['Rava (Sooji)','Kg',kGrams(500,1000),true],['Idli Rava','Kg',kGrams(500,1000),true],['Semiya (Vermicelli)','Kg',kGrams(200,500,1000),false],['Aval (Poha)','Kg',kGrams(500,1000),true],
      ['Wheat Flour (Atta)','Kg',kGrams(1000,5000,10000),true],['Maida','Kg',kGrams(500,1000),true],['Rice Flour','Kg',kGrams(500,1000),true],['Ragi Flour','Kg',kGrams(500,1000),true],
      ['Besan (Kadalai Maavu)','Kg',kGrams(500,1000),true],['Broken Wheat (Godhumai Rava)','Kg',kGrams(500,1000),true],['Sago (Javvarisi)','Kg',kGrams(250,500,1000),true],['Oats','Kg',kGrams(500,1000),false],['Health Mix (Sathu Maavu)','Kg',kGrams(250,500,1000),false]]],
    ['Dals & Pulses',[
      ['Toor Dal (Thuvaram Paruppu)','Kg',kGrams(500,1000),true],['Urad Dal (Ulundhu)','Kg',kGrams(500,1000),true],['Moong Dal (Paasi Paruppu)','Kg',kGrams(500,1000),true],['Chana Dal (Kadalai Paruppu)','Kg',kGrams(500,1000),true],
      ['Roasted Gram (Pottukadalai)','Kg',kGrams(250,500,1000),true],['Green Gram (Pachai Payaru)','Kg',kGrams(500,1000),true],['Black Chana (Kondakadalai)','Kg',kGrams(500,1000),true],['White Chana (Kabuli)','Kg',kGrams(500,1000),true],
      ['Rajma','Kg',kGrams(500,1000),true],['Cow Peas (Karamani)','Kg',kGrams(500,1000),true],['Groundnut (Verkadalai)','Kg',kGrams(250,500,1000),true]]],
    ['Oil & Ghee',[
      ['Gingelly Oil (Nallennai)','Litres',kMl(500,1000,5000),false],['Groundnut Oil','Litres',kMl(500,1000,5000),false],['Sunflower Oil','Litres',kMl(500,1000,5000),false],['Coconut Oil','Litres',kMl(200,500,1000),false],['Ghee','Litres',kMl(200,500,1000),false]]],
    ['Milk & Dairy',[
      ['Milk','Litres',kMl(500,1000),false],['Curd','Kg',kGrams(200,500,1000),false],['Buttermilk','Litres',kMl(200,500),false],['Paneer','Kg',kGrams(200,500,1000),false],['Butter','Kg',kGrams(100,500),false]]],
    ['Tea, Coffee & Health Drinks',[
      ['Tea Powder','Kg',kGrams(100,250,500,1000),false],['Coffee Powder (Filter)','Kg',kGrams(100,200,500,1000),false],['Instant Coffee','Kg',kGrams(50,100,200),false],['Boost','Kg',kGrams(200,500,1000),false],['Horlicks','Kg',kGrams(200,500,1000),false],
      ['Sugar','Kg',kGrams(1000,5000),true],['Jaggery (Vellam)','Kg',kGrams(500,1000),true],['Drinking Water Can (20 L)','Nos',[],true]]],
    ['Spices & Masala',[
      ['Salt','Kg',kGrams(1000),false],['Mustard Seeds (Kadugu)','Kg',kGrams(50,100,250,500),true],['Cumin (Jeeragam)','Kg',kGrams(50,100,250,500),true],['Fenugreek (Vendhayam)','Kg',kGrams(50,100,250),true],['Fennel (Sombu)','Kg',kGrams(50,100,250),true],
      ['Pepper (Milagu)','Kg',kGrams(50,100,250),true],['Dry Red Chilli (Vathal)','Kg',kGrams(100,250,500,1000),true],['Chilli Powder','Kg',kGrams(100,200,500,1000),false],['Turmeric Powder','Kg',kGrams(50,100,200,500),false],['Coriander Powder','Kg',kGrams(100,200,500,1000),false],
      ['Sambar Powder','Kg',kGrams(100,200,500,1000),false],['Rasam Powder','Kg',kGrams(100,200,500),false],['Garam Masala','Kg',kGrams(50,100,200),false],['Asafoetida (Perungayam)','Kg',kGrams(50,100),false],['Tamarind (Puli)','Kg',kGrams(250,500,1000),true],
      ['Cardamom (Elakkai)','Kg',kGrams(50,100),true],['Cloves (Kirambu)','Kg',kGrams(50,100),true],['Cinnamon (Pattai)','Kg',kGrams(50,100),true]]],
    ['Vegetables',[
      ['Onion (Big)','Kg',kGrams(500,1000,5000),true],['Small Onion (Chinna Vengayam)','Kg',kGrams(250,500,1000),true],['Tomato','Kg',kGrams(500,1000),true],['Potato','Kg',kGrams(500,1000),true],['Carrot','Kg',kGrams(250,500,1000),true],
      ['Beans','Kg',kGrams(250,500,1000),true],['Brinjal (Kathirikai)','Kg',kGrams(250,500,1000),true],['Ladies Finger (Vendakkai)','Kg',kGrams(250,500,1000),true],['Cabbage','Kg',[],true],['Beetroot','Kg',kGrams(500,1000),true],
      ['Snake Gourd (Pudalangai)','Kg',[],true],['Bottle Gourd (Suraikkai)','Kg',[],true],['Ash Gourd (Poosanikai)','Kg',[],true],['Pumpkin (Parangikai)','Kg',[],true],['Chow Chow','Kg',[],true],['Cucumber','Kg',[],true],
      ['Green Chilli','Kg',kGrams(100,250,500),true],['Ginger','Kg',kGrams(100,250,500),true],['Garlic','Kg',kGrams(100,250,500),true],
      ['Drumstick (Murungakkai)','Nos',[],true],['Raw Banana (Vazhakkai)','Nos',[],true],['Cauliflower','Nos',[],true],['Coconut','Nos',[],true],['Lemon','Nos',[],true],
      ['Curry Leaves (bunch)','Nos',[],true],['Coriander Leaves (bunch)','Nos',[],true],['Mint Leaves (bunch)','Nos',[],true],['Greens / Keerai (bunch)','Nos',[],true]]],
    ['Fruits',[
      ['Banana','Nos',kCount([12,'1 dozen (12)']),true],['Apple','Kg',[],true],['Orange','Kg',[],true],['Sweet Lime (Sathukudi)','Kg',[],true],['Papaya','Kg',[],true],['Guava','Kg',[],true],['Pomegranate','Kg',[],true],['Watermelon','Kg',[],true]]],
    ['Eggs, Bread & Snacks',[
      ['Eggs','Nos',kCount([6,'Pack of 6'],[12,'1 dozen (12)'],[30,'Tray (30)']),true],['Bread (loaf)','Nos',[],true],['Rusk (packet)','Nos',[],true],['Marie Biscuits (packet)','Nos',[],true],['Glucose Biscuits (packet)','Nos',[],true],
      ['Cashew (Mundhiri)','Kg',kGrams(50,100,250,500),true],['Raisins (Ularndha Thiratchai)','Kg',kGrams(50,100,250),true],['Badam (Almonds)','Kg',kGrams(100,250,500),true]]],
    ['Gas, Disposables & Cleaning',[
      ['Gas Cylinder (LPG)','Nos',[],true],['Paper Cups','Nos',kCount([50,'Pack of 50'],[100,'Pack of 100']),true],['Paper Plates','Nos',kCount([25,'Pack of 25'],[50,'Pack of 50']),true],['Aluminium Foil (roll)','Nos',[],true],
      ['Dish Wash Liquid','Litres',kMl(250,500,1000),false],['Dish Wash Bar','Nos',[],true],['Scrubber','Nos',[],true]]]
  ];
  const KITCHEN_STANDARD=KITCHEN_STANDARD_GROUPS.flatMap(([group,items])=>items.map(([name,unit,packs,loose])=>({group,name,unit,packs,loose})));
  const KITCHEN_GENERIC_PACKS={Kg:kGrams(50,100,200,250,500,1000,5000,10000,25000),Litres:kMl(200,250,500,1000,2000,5000),Nos:[]};
  // Packs for a kitchen stock item: its standard list entry, or the general sizes for its unit.
  function kitchenPacksFor(item){
    if(!item)return {packs:[],loose:true,standard:false};
    const std=KITCHEN_STANDARD.find(s=>s.name.toLowerCase()===String(item.name||'').trim().toLowerCase()&&s.unit===item.unit);
    if(std)return {packs:std.packs,loose:std.loose||!std.packs.length,standard:true};
    return {packs:KITCHEN_GENERIC_PACKS[item.unit]||[],loose:true,standard:false};
  }
  const kitchenUnitOk=u=>KITCHEN_UNITS.includes(u);
  const kitchenQty=n=>{const v=Math.round(Number(n||0)*1000)/1000;return Number.isFinite(v)?v:0};
  const kitchenUnitWord=(u,q)=>u==='Litres'?(Number(q)===1?'Litre':'Litres'):u;
  // Pack choice + number of packets → quantity in the item's own unit.
  function kitchenLineQty(line){
    if(line.pack==='loose'||line.pack==='')return kitchenQty(line.quantity);
    const size=Number(line.pack);return kitchenQty(size*Number(line.count||0));
  }
  function KitchenCashWorkspace({profile}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[busy,setBusy]=React.useState(false),[tab,setTab]=React.useState('home');
    const [dialog,setDialog]=React.useState(null),[form,setForm]=React.useState({}),[receipt,setReceipt]=React.useState(null);
    const lock=React.useRef(false),token=React.useRef(null);
    // 2.16.17: a kitchen-cash alert opens Cash Requests showing only that request (global record-focus rule).
    const [cashFocus,clearCashFocus]=useRecordFocus('Kitchen / Food Stores');
    React.useEffect(()=>{if(cashFocus)setTab('funding')},[cashFocus]);
    const emptyLine=()=>({item_id:'',name:'',unit:'',pack:'',count:'1',quantity:'1',price:'',stock:true});
    // 2.15.55: kitchen item list with automatic KIT- codes; several items can be added at once (SQL 190).
    const emptyNewItem=()=>({std:'',name:'',unit:'Kg',low_level:''});
    const [newItems,setNewItems]=React.useState(null),[newItemsError,setNewItemsError]=React.useState('');
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
    async function submit(e){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await post(dialog.action,dialog.action==='use_stock'?{...form,quantity:kitchenLineQty(form)}:form)}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
    const uploadRef=React.useRef(null);
    async function savePurchase(e){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
      let path='';if(receipt){
        if(receipt.size>10485760||!['image/jpeg','image/png','image/webp','application/pdf'].includes(receipt.type))throw Error('Use a JPG, PNG, WebP or PDF up to 10 MB.');
        if(uploadRef.current?.file!==receipt){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[receipt.type];path=data.access.actor+'/'+crypto.randomUUID()+'.'+ext;const r=await client.storage.from('kitchen-receipts').upload(path,receipt,{contentType:receipt.type,upsert:false});if(r.error)throw r.error;uploadRef.current={file:receipt,path}}
        path=uploadRef.current.path;
      }
      // 2.16.31: convert pack + number of packets into the item's unit before saving
      const items=purchase.items.map((x,i)=>{const c=lineCalc(x);
        if(c.packed&&!(Number(x.count)>0))throw Error(`Item ${i+1}: enter the number of packets.`);
        if(x.item_id&&x.item_id!=='__other'&&x.pack==='')throw Error(`Item ${i+1}: choose the pack size.`);
        if(!(c.qty>0))throw Error(`Item ${i+1}: enter a quantity more than zero.`);
        if(!Number.isFinite(c.unitPrice)||c.unitPrice<0)throw Error(`Item ${i+1}: enter the price.`);
        return {item_id:x.item_id==='__other'?'':x.item_id,name:x.name,unit:x.unit,quantity:c.qty,price:c.unitPrice,stock:x.item_id==='__other'?false:x.stock,pack:c.packLabel||null,packets:c.packed?Number(x.count):null}});
      await post('purchase',{...purchase,items,receipt:path});setPurchase({date:todayISOIndia(),vendor:'',bill:'',no_receipt:'',items:[emptyLine()]});setReceipt(null);uploadRef.current=null;setTab('purchases');
    }catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
    async function viewReceipt(path){const r=await client.storage.from('kitchen-receipts').createSignedUrl(path,120);if(r.error){setError(r.error.message);return}window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}
    function exportCash(){const rows=[['Date','Type','Details','Cash in','Cash out','Balance','Recorded by','Reference'],...data.cash.slice().reverse().map(x=>[formatDateTimeIN(x.created_at),x.kind,x.details,x.amount>0?x.amount:'',x.amount<0?-x.amount:'',x.balance_after,x.actor_name,x.reference_id||x.id])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Kitchen-Cash-Book-'+todayISOIndia()+'.csv';a.click();URL.revokeObjectURL(url)}
    if(!data)return h(Section,{title:'Kitchen & Pantry'},h('p',{role:'status'},error||'Loading kitchen cash book…'),h('p',null,'If this workspace is not installed, apply SQL 186 before using this release.'));
    const admin=data.access.admin,spend=data.access.spend,actor=data.access.actor,w=data.wallet;
    // 2.16.17: STD requests → Admin / Director approves → Nursing Manager hands over cash → STD confirms receipt (SQL 214).
    const nm=!!data.access.nm,handoverOnly=!!data.access.handover_only;
    const pendingHandover=data.handovers.find(x=>['Awaiting outgoing','Awaiting receipt'].includes(x.status));
    const month=t=>String(t).slice(0,7)===todayISOIndia().slice(0,7);
    const expense=data.purchases.filter(x=>x.status!=='Reversed'&&month(x.expense_date)).reduce((s,x)=>s+Number(x.total),0);
    const tabs=[['home','Overview'],['purchase','Record Purchase'],['purchases','Purchase Register'],['funding','Cash Requests'],['stock','Kitchen Stock'],['handover','In-charge & Handover'],['cash','Cash Book & Reports'],['ledger','Ledger & Statement'],...(admin?[['legacy','Historical Stores Register']]:[])].filter(([k])=>k!=='purchase'||spend);
    const table=(heads,rows)=>h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),h('tbody',null,rows.length?rows.map((r,i)=>h('tr',{key:i},r.map((c,j)=>h('td',{key:j,style:{whiteSpace:'normal'}},c)))):h('tr',null,h('td',{colSpan:heads.length},'No entries yet.')))));
    const actions=(...children)=>h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},...children);
    const fundingRows=cashFocus?.id?data.funding.filter(x=>String(x.id)===String(cashFocus.id)):data.funding;
    const waitNote=t=>h('small',{style:{display:'block',color:'#7a5566'}},t);
    const fundingSection=h(Section,{title:'Cash requests and handovers',subtitle:'STD requests → Admin / Director approves → Nursing Manager hands over the cash → STD confirms cash received.'},
      cashFocus?.id&&h('p',{className:'message',role:'status'},'Showing only the request from the alert. ',h('button',{type:'button',className:'btn btn-secondary',onClick:clearCashFocus},'Show all')),
      spend&&button('Request Cash','request_cash',{amount:2000,note:''},true),
      table(['Purpose','Recipient','Requested','Approved','Status','Handed over by','Action'],fundingRows.map(x=>[x.purpose,name(x.recipient),money(x.requested_amount),x.amount?money(x.amount):'—',x.status,x.handed_by?`${name(x.handed_by)}${x.handed_at?' · '+formatDateTimeIN(x.handed_at):''}`:'—',actions(
        admin&&x.status==='Requested'&&button('Approve Amount','approve_funding',{id:x.id,amount:x.requested_amount,note:''}),admin&&x.status==='Requested'&&button('Decline','decline_funding',{id:x.id,note:''}),
        x.status==='Requested'&&!admin&&waitNote('Waiting for Admin / Director approval.'),
        nm&&x.status==='Approved'&&button('Hand Over Cash','handover_cash',{id:x.id,note:`Cash ${money(x.amount)} given to ${name(x.recipient)}`},true),
        !nm&&admin&&x.status==='Approved'&&button('Record Cash Handed Over (Nursing Manager away)','handover_cash',{id:x.id,note:''}),
        x.status==='Approved'&&!nm&&!admin&&waitNote('Approved — waiting for the Nursing Manager to hand over the cash. Confirm receipt after you get it.'),
        admin&&['Requested','Approved'].includes(x.status)&&button('Cancel Request','cancel_funding',{id:x.id,note:''}),
        x.status==='Handed over'&&x.recipient===actor&&button('Confirm Cash Received','receive_cash',{id:x.id,amount:x.amount,note:''},true),
        x.status==='Handed over'&&x.recipient!==actor&&waitNote(`Waiting for ${name(x.recipient)} to confirm cash received.`))])));
    const field=(label,key,type='text',opts={})=>h('div',{className:'field'},h('label',null,label),h('input',{type,value:purchase[key],onChange:e=>setPurchase(v=>({...v,[key]:e.target.value})),...opts}));
    const lineChange=(i,key,value)=>setPurchase(v=>({...v,items:v.items.map((x,j)=>j===i?{...x,[key]:value}:x)}));
    const kitchenItems=(data.stock||[]).filter(x=>x.active!==false).slice().sort((a,b)=>String(a.item_code||'').localeCompare(String(b.item_code||''),undefined,{numeric:true}));
    const itemLabel=x=>`${x.item_code?x.item_code+' · ':''}${x.name} · ${x.unit}`;
    const codeFor=(nm,unit)=>(data.stock||[]).find(x=>x.name===nm&&x.unit===unit)?.item_code;
    const pickItem=(i,value)=>setPurchase(v=>({...v,items:v.items.map((x,j)=>{if(j!==i)return x;if(value==='__other')return {...x,item_id:'__other',name:'',unit:'Nos',stock:false};const it=kitchenItems.find(k=>String(k.id)===String(value));if(!it)return {...x,item_id:'',name:'',unit:'',pack:''};const pk=kitchenPacksFor(it);return {...x,item_id:it.id,name:it.name,unit:it.unit,stock:true,pack:pk.packs.length?'':'loose',count:'1',quantity:'1'}})}));
    // 2.16.31: what is saved — quantity in the item's own unit and the price per that unit (the server multiplies them).
    const lineCalc=x=>{const it=x.item_id&&x.item_id!=='__other'?kitchenItems.find(k=>String(k.id)===String(x.item_id)):null;const packed=it&&x.pack&&x.pack!=='loose';const qty=x.item_id==='__other'?kitchenQty(x.quantity):kitchenLineQty(x);const size=packed?Number(x.pack):1;const unitPrice=x.price===''?NaN:Math.round(Number(x.price)/size*100)/100;const total=Number.isFinite(unitPrice)?Math.round(qty*unitPrice*100)/100:0;const packLabel=packed?(kitchenPacksFor(it).packs.find(p=>String(p.size)===String(x.pack))||{}).label:'';return {it,packed,qty,unitPrice,total,packLabel}};
    // 2.16.31: pack size (fixed list per item) + number of packets, or loose quantity in the item's unit
    function purchaseQtyFields(x,i){
      const priceField=label=>h('div',{className:'field',key:'price'},h('label',null,label),h('input',{required:true,type:'number',min:'0',step:'0.01',value:x.price,onChange:e=>lineChange(i,'price',e.target.value)}));
      if(!x.item_id)return [];
      if(x.item_id==='__other')return [h('div',{className:'field',key:'q'},h('label',null,'Quantity *'),h('input',{required:true,type:'number',min:'0.001',step:'0.001',value:x.quantity,onChange:e=>lineChange(i,'quantity',e.target.value)})),priceField('Unit price (₹) *')];
      const it=kitchenItems.find(k=>String(k.id)===String(x.item_id)),pk=kitchenPacksFor(it),unitWord=kitchenUnitWord(x.unit,2);
      const packSelect=(pk.packs.length>0)&&h('div',{className:'field',key:'pack'},h('label',null,'Pack size *'),h('select',{required:true,value:x.pack,onChange:e=>lineChange(i,'pack',e.target.value)},h('option',{value:''},'Select pack size'),pk.packs.map(p=>h('option',{key:p.label,value:String(p.size)},p.label)),pk.loose&&h('option',{value:'loose'},`Loose — enter in ${unitWord}`)));
      const packed=x.pack&&x.pack!=='loose';
      return [packSelect,
        packed?h('div',{className:'field',key:'count'},h('label',null,'Number of packets *'),h('input',{required:true,type:'number',min:'1',step:'1',value:x.count,onChange:e=>lineChange(i,'count',e.target.value)}))
          :x.pack==='loose'?h('div',{className:'field',key:'q'},h('label',null,`Quantity in ${unitWord} *`),h('input',{required:true,type:'number',min:'0.001',step:x.unit==='Nos'?'1':'0.001',value:x.quantity,onChange:e=>lineChange(i,'quantity',e.target.value)})):null,
        x.pack!==''&&priceField(packed?'Price per packet (₹) *':`Price per ${x.unit==='Litres'?'Litre':x.unit==='Nos'?'piece / packet':'Kg'} (₹) *`)].filter(Boolean);
    }
    const canAddItems=admin||[w.primary_staff,w.custodian].includes(actor);
    const existingKitchenNames=new Set((data.stock||[]).map(k=>String(k.name||'').trim().toLowerCase()));
    const openNewItems=()=>{setNewItems([emptyNewItem()]);setNewItemsError('')};
    async function saveNewItems(e){
      e.preventDefault();if(lock.current)return;
      const rows=newItems.map(x=>({name:String(x.name||'').trim().replace(/\s+/g,' '),unit:x.unit,low_level:x.low_level===''?0:Number(x.low_level)}));
      if(rows.some(x=>x.name.length<2))return setNewItemsError('Choose an item from the list (or type the name for "Other item"), or remove the empty row.');
      if(rows.some(x=>!kitchenUnitOk(x.unit)))return setNewItemsError('Kitchen items can only be in Kg, Litres or Nos.');
      const names=rows.map(x=>x.name.toLowerCase());const twice=names.find((n,i)=>names.indexOf(n)!==i);if(twice)return setNewItemsError(`"${twice}" is entered twice.`);
      const exists=rows.find(x=>(data.stock||[]).some(k=>String(k.name).toLowerCase()===x.name.toLowerCase()));if(exists){const k=data.stock.find(k=>String(k.name).toLowerCase()===exists.name.toLowerCase());return setNewItemsError(`${exists.name} already exists as ${k.item_code||''} (${k.unit}). Use the existing item.`)}
      lock.current=true;setBusy(true);setNewItemsError('');
      try{const r=await client.rpc('kitchen_add_items',{p_items:rows});if(r.error)throw r.error;const added=Array.isArray(r.data)?r.data:[];setNewItems(null);await load();showSamaraActionToast('success',`${added.length} kitchen item${added.length===1?'':'s'} added`,added.map(x=>`${x.item_code} ${x.name}`).join(', '));}
      catch(err){setNewItemsError(/kitchen_add_items/.test(err.message||'')?'Run SQL 190 first. '+err.message:err.message)}
      finally{lock.current=false;setBusy(false)}
    }
    const newItemsDialog=newItems&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:saveNewItems,role:'dialog','aria-modal':true,style:{maxWidth:'720px',width:'min(96vw,720px)',maxHeight:'90vh',overflow:'auto'}},
      h('h3',null,'Add Kitchen Items'),h('p',{className:'small-note'},'Pick items from the standard South Indian kitchen list — each has one fixed unit (Kg, Litres or Nos), so stock is never kept two ways. Codes are given automatically (KIT-0001, KIT-0002 …) when you save. Add as many items as you need, then save once.'),
      newItemsError&&h('p',{className:'message error',role:'alert'},newItemsError),
      h('fieldset',{disabled:busy,style:{border:0,padding:0}},
        h('details',{className:'card panel',style:{marginBottom:'10px'}},h('summary',null,h('strong',null,'Quick add — tick several items from the standard list')),
          KITCHEN_STANDARD_GROUPS.map(([group,items])=>{const free=items.filter(([nm])=>!existingKitchenNames.has(nm.toLowerCase()));return h('div',{key:group,style:{margin:'8px 0'}},h('b',null,group),free.length?h('div',{style:{display:'flex',flexWrap:'wrap',gap:'4px 14px',marginTop:'4px'}},free.map(([nm,unit])=>h('label',{key:nm,style:{display:'inline-flex',gap:'4px',alignItems:'center',fontWeight:400}},h('input',{type:'checkbox',checked:newItems.some(y=>y.std===nm),onChange:e=>{const on=e.target.checked;setNewItems(v=>{const st=KITCHEN_STANDARD.find(k=>k.name===nm);if(on){const rest=v.filter(y=>y.std||String(y.name||'').trim());return rest.length>=50?v:[...rest,{std:nm,name:nm,unit:st.unit,low_level:''}]}const rest=v.filter(y=>y.std!==nm);return rest.length?rest:[emptyNewItem()]})}}),`${nm} (${unit})`))):h('small',{style:{display:'block',color:'#7a5566'}},'All items of this group are already in the list.'))})),
        newItems.map((x,i)=>h('div',{key:i,className:'card panel',style:{marginBottom:'10px'}},
          h('strong',null,`Item ${i+1}`),
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Item *'),h('select',{required:true,value:x.std,onChange:e=>{const val=e.target.value,st=KITCHEN_STANDARD.find(k=>k.name===val);setNewItems(v=>v.map((y,j)=>j!==i?y:val==='__other'?{...y,std:'__other',name:'',unit:'Kg'}:st?{...y,std:val,name:st.name,unit:st.unit}:{...y,std:'',name:''}))}},
              h('option',{value:''},'Select from standard kitchen list'),
              KITCHEN_STANDARD_GROUPS.map(([group,items])=>h('optgroup',{key:group,label:group},items.map(([nm])=>{const have=existingKitchenNames.has(nm.toLowerCase())||newItems.some((y,j)=>j!==i&&y.std===nm);return h('option',{key:nm,value:nm,disabled:have},nm+(have?' — already added':''))}))),
              h('option',{value:'__other'},'Other item (type the name)'))),
            x.std==='__other'&&h('div',{className:'field'},h('label',null,'Item name *'),h('input',{required:true,minLength:2,value:x.name,placeholder:'e.g. Kesari Powder',onChange:e=>setNewItems(v=>v.map((y,j)=>j===i?{...y,name:e.target.value}:y))})),
            x.std==='__other'?h('div',{className:'field'},h('label',null,'Unit *'),h('select',{required:true,value:x.unit,onChange:e=>setNewItems(v=>v.map((y,j)=>j===i?{...y,unit:e.target.value}:y))},KITCHEN_UNITS.map(u=>h('option',{key:u,value:u},KITCHEN_UNIT_LABEL[u]))),h('small',null,'Packets of 200 g / 500 ml etc. are chosen when buying — the stock stays in this one unit.'))
              :x.std&&h('div',{className:'field'},h('label',null,'Unit (fixed)'),h('input',{readOnly:true,tabIndex:-1,value:KITCHEN_UNIT_LABEL[x.unit]||x.unit,style:{background:'#f7f1f4'}}),(st=>st&&st.packs.length?h('small',null,'Bought as: '+st.packs.map(p=>p.label).join(' / ')+(st.loose?' or loose':'')):null)(KITCHEN_STANDARD.find(k=>k.name===x.std))),
            h('div',{className:'field'},h('label',null,`Low-stock alert level in ${x.unit==='Litres'?'Litres':x.unit} (optional)`),h('input',{type:'number',min:'0',step:'0.001',value:x.low_level,onChange:e=>setNewItems(v=>v.map((y,j)=>j===i?{...y,low_level:e.target.value}:y))}))),
          newItems.length>1&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setNewItems(v=>v.filter((_,j)=>j!==i))},'Remove'))),
        h('button',{type:'button',className:'btn btn-secondary',disabled:newItems.length>=50,onClick:()=>setNewItems(v=>[...v,emptyNewItem()])},'＋ Add another item'),
        h('div',{style:{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'12px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setNewItems(null)},'Cancel'),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':`Save ${newItems.length} item${newItems.length===1?'':'s'}`)))));
    // 2.16.31: usage / wastage — in the item's own unit, or as whole packets (e.g. 2 × 500 ml milk = 1 Litre)
    function useQtyFields(){
      const it=(data.stock||[]).find(k=>String(k.id)===String(form.id)),pk=kitchenPacksFor(it),unitWord=kitchenUnitWord(it?.unit,2),q=kitchenLineQty(form);
      return h(React.Fragment,null,
        it&&h('p',{className:'small-note'},`${it.item_code?it.item_code+' · ':''}${it.name} — balance ${it.quantity} ${kitchenUnitWord(it.unit,it.quantity)}`),
        pk.packs.length>0&&h('div',{className:'field'},h('label',null,'Enter as'),h('select',{value:form.pack||'loose',onChange:e=>setForm(v=>({...v,pack:e.target.value}))},h('option',{value:'loose'},`${unitWord} (e.g. 0.5, 1.25)`),pk.packs.map(p=>h('option',{key:p.label,value:String(p.size)},`Packets of ${p.label}`)))),
        form.pack&&form.pack!=='loose'?input('Number of packets','count','number',{required:true,min:'1',step:'1'}):input(`Quantity in ${unitWord}`,'quantity','number',{required:true,min:'0.001',step:'0.001'}),
        q>0&&h('small',{style:{display:'block',color:'#7a5566',marginBottom:'8px'}},`Reduces stock by ${q} ${kitchenUnitWord(it?.unit,q)}.`));
    }
    const dialogEl=dialog&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:submit,role:'dialog','aria-modal':true},h('h3',null,dialog.title),dialog.action==='handover_cash'&&nm&&h('p',{className:'small-note'},'This amount is taken out of your Petty Cash book automatically (2.16.19).'),error&&h('p',{role:'alert',className:'message error'},error),h('fieldset',{disabled:busy,style:{border:0,padding:0}},
        ['amount'].filter(k=>k in form).map(k=>input(dialog.action==='adjust'?'Signed cash correction (₹); negative reduces cash':'Counted / approved amount (₹)',k,'number',{required:true,step:'0.01',min:dialog.action==='adjust'?undefined:0})),
        'quantity' in form&&(dialog.action==='use_stock'?useQtyFields():input('Quantity','quantity','number',{required:true,min:'0.001',step:'0.001'})),
        dialog.action==='review'&&select('Review decision','status',[['Reviewed','Reviewed'],['Query','Needs clarification']]),
        dialog.action==='use_stock'&&select('Movement','kind',[['Usage','Used in kitchen / pantry'],['Wastage','Wastage']]),
        dialog.action==='handover_create'&&h(React.Fragment,null,select('Assignment type','kind',[['Leave cover','Temporary leave cover'],['Return','Handback after Return to Duty'],['Permanent','Change primary in-charge']]),select('Incoming staff','staff',data.people.map(x=>[x.id,x.name+' · '+x.role])),form.kind==='Leave cover'&&select('Primary staff approved leave','leave',data.leaves.map(x=>[x.id,formatDateIN(x.from_date)+' to '+formatDateIN(x.to_date)]))),
        h('div',{className:'field'},h('label',null,dialog.action==='handover_cash'?'Cash handed over (amount and to whom)':dialog.action.startsWith('handover_')?'Confirm stock / cash handover and reason':'Purpose / reason / confirmation'),h('textarea',{required:true,minLength:3,value:form.note||'',onChange:e=>setForm(v=>({...v,note:e.target.value}))})),
        dialog.action==='reverse'&&h('p',null,'Confirm the cash has actually been restored or the original entry was incorrect. This credits cash and reverses purchased stock. It cannot undo stock already consumed.'),
        dialog.action==='adjust'&&h('p',null,'Admin correction only. Record the physical evidence and reason. Original cash-book entries remain unchanged.'),
        h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Confirm'),h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setDialog(null)},'Cancel'))));
    // 2.16.17: Nursing Manager without other kitchen access — only the cash requests to hand over.
    if(handoverOnly)return h('div',{className:'kitchen-cash'},
      h('div',{className:'card panel dr-head'},h('div',{className:'dr-head-text'},h('h2',null,'Kitchen Petty Cash — Hand Over Cash'),h('small',null,'Requests approved by Admin / Director. Give the cash, then tap Hand Over Cash. The STD confirms when she receives it.')),h('button',{className:'btn btn-secondary',onClick:load},'Refresh')),
      error&&h('p',{className:'message error',role:'alert'},error),notice&&h('p',{className:'message success',role:'status'},notice),
      fundingSection,dialogEl);
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
      h('div',{className:'dr-boxes'},[['Cash in Hand',money(data.balance),'cash'],['Expenses This Month',money(expense),'purchases'],['Cash Requests',data.funding.filter(x=>['Requested','Approved','Handed over'].includes(x.status)).length,'funding'],['Pending Review',data.purchases.filter(x=>['Pending review','Query'].includes(x.status)).length,'purchases'],['Low Stock',kitchenItems.filter(x=>Number(x.quantity)<=Number(x.low_level)).length,'stock']].map(([label,value,key])=>h('button',{key:label,className:'dr-box',onClick:()=>setTab(key)},h('span',{className:'dr-box-label'},label),h('b',{className:'dr-box-count'},value)))),
      Number(data.balance)<=Number(w.low_limit)&&h('p',{className:'message',role:'status'},`Low Cash — balance ${money(data.balance)}; alert level ${money(w.low_limit)}. `,spend&&button('Request Cash','request_cash',{amount:w.opening_amount,note:''},true)),
      actions(...tabs.map(([key,label])=>h('button',{key,className:'btn '+(tab===key?'btn-primary':'btn-secondary'),onClick:()=>setTab(key)},label))),
      tab==='legacy'&&h(StoresDashboard,{profile,categoryFilter:'Kitchen / Food Stores'}),
      tab==='home'&&h(Section,{title:'Daily kitchen routine'},h('p',null,'Confirm cash received, record purchases with receipts, record stock usage, and count physical cash regularly. Funding transfers are not expenses. Purchase amounts reduce cash immediately; Admin review does not deduct cash again.'),
        h('p',null,`Opening cash allocation: ${money(w.opening_amount)}. Cash increases only after receipt confirmation.`),
        actions(spend&&h('button',{className:'btn btn-primary',onClick:()=>setTab('purchase')},'Record Purchase'),spend&&button('Count / Reconcile Cash','reconcile',{amount:data.balance,note:''}),admin&&button('Set Low-Cash Limit','settings',{amount:w.low_limit,note:''}))),
      tab==='purchase'&&spend&&h(Section,{title:'Record cash purchase / expense'},h('form',{onSubmit:savePurchase},h('fieldset',{disabled:busy,style:{border:0,padding:0}},
        h('div',{className:'grid two'},field('Purchase date','date','date',{required:true,max:todayISOIndia()}),field('Shop / vendor','vendor','text',{required:true}),field('Bill number','bill')),
        h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',margin:'6px 0 10px'}},h('small',null,kitchenItems.length?`${kitchenItems.length} kitchen items in the list.`:'No kitchen items yet — add them first.'),canAddItems&&h('button',{type:'button',className:'btn btn-secondary',onClick:openNewItems},'＋ New Kitchen Items')),
        purchase.items.map((x,i)=>h('div',{key:i,className:'card panel'},h('strong',null,`Item ${i+1}`),h('div',{className:'grid two'},
          h('div',{className:'field'},h('label',null,'Item *'),h('select',{required:true,value:x.item_id||'',onChange:e=>pickItem(i,e.target.value)},h('option',{value:''},'Select item'),kitchenItems.map(k=>h('option',{key:k.id,value:k.id},itemLabel(k))),h('option',{value:'__other'},'Other expense (not a stock item)'))),
          x.item_id==='__other'?h('div',{className:'field'},h('label',null,'Expense details *'),h('input',{required:true,minLength:2,value:x.name,placeholder:'e.g. Auto fare, gas refill',onChange:e=>lineChange(i,'name',e.target.value)})):h('div',{className:'field'},h('label',null,'Unit (fixed for this item)'),h('input',{readOnly:true,value:x.unit||'—',tabIndex:-1,style:{background:'#f7f1f4'}}),x.unit&&!kitchenUnitOk(x.unit)&&h('small',{className:'unit-warn'},`⚠ Old unit "${x.unit}" — kitchen items should be in Kg, Litres or Nos. Ask Admin to run the kitchen unit clean-up.`)),
          x.item_id==='__other'&&h('div',{className:'field'},h('label',null,'Unit *'),h('select',{required:true,value:x.unit||'Nos',onChange:e=>lineChange(i,'unit',e.target.value)},STORE_UNITS.map(u=>h('option',{key:u,value:u},u)))),
          ...purchaseQtyFields(x,i),
          x.item_id&&x.item_id!=='__other'&&h('label',null,h('input',{type:'checkbox',checked:x.stock,onChange:e=>lineChange(i,'stock',e.target.checked)}),' Add to kitchen stock (untick if used immediately)'),
          (c=>h('div',null,c.qty>0&&x.item_id&&x.item_id!=='__other'&&h('small',{style:{display:'block',color:'#7a5566'}},`Adds ${c.qty} ${kitchenUnitWord(x.unit,c.qty)} to kitchen stock${c.packed?` (${x.count} × ${c.packLabel})`:''}${x.stock?'':' — not added (used immediately)'}`),h('strong',null,'Line total: '+money(c.total))))(lineCalc(x))),purchase.items.length>1&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPurchase(v=>({...v,items:v.items.filter((_,j)=>j!==i)}))},'Remove line'))),
        h('button',{type:'button',className:'btn btn-secondary',disabled:purchase.items.length>=50,onClick:()=>setPurchase(v=>({...v,items:[...v.items,emptyLine()]}))},'＋ Add item'),
        h('p',null,'Total cash paid: ',h('strong',null,money(Math.round(purchase.items.reduce((s,x)=>s+lineCalc(x).total,0)*100)/100))),
        h('div',{className:'field'},h('label',null,'Receipt photo / PDF (up to 10 MB)'),h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,application/pdf',onChange:e=>{setReceipt(e.target.files?.[0]||null);uploadRef.current=null}})),
        !receipt&&field('Reason no receipt is available','no_receipt','text',{required:true,minLength:3}),
        h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Record Expense')))),
      tab==='purchases'&&h(Section,{title:'Purchase Register — Admin review afterward'},...data.purchases.map(x=>h('details',{key:x.id,className:'card panel'},h('summary',null,`${formatDateIN(x.expense_date)} · ${x.vendor} · ${money(x.total)} · ${x.status}`),h('p',null,`Entered by ${x.entered_name} · Bill: ${x.bill_no||'—'}`),table(['Item','Quantity','Unit price','Total','Stock'],x.items.map(l=>[(codeFor(l.name,l.unit)?codeFor(l.name,l.unit)+' · ':'')+l.name,l.quantity+' '+l.unit,money(l.price),money(l.total),l.stock?'Added to stock':'Used immediately'])),
        x.receipt_path?h('button',{className:'btn btn-secondary',onClick:()=>viewReceipt(x.receipt_path)},'View Receipt'):h('p',null,'No receipt: '+x.no_receipt_reason),x.review_note&&h('p',null,'Review: '+x.review_note),
        admin&&x.status!=='Reversed'&&actions(button('Review / Query','review',{id:x.id,status:'Reviewed',note:''}),button('Reverse / Correct','reverse',{id:x.id,note:''})))),!data.purchases.length&&h('p',null,'No purchases yet.')),
      tab==='funding'&&fundingSection,
      tab==='stock'&&h(Section,{title:'Kitchen stock and usage'},h('p',null,'Kitchen item list with automatic codes. Each item is kept in one unit only — Kg, Litres or Nos. Purchases marked “Add to kitchen stock” add to these balances. Existing Stores stock remains in its historical register; it is not silently imported or charged again.'),
        kitchenItems.some(x=>!kitchenUnitOk(x.unit))&&h('p',{className:'message',role:'status'},`${kitchenItems.filter(x=>!kitchenUnitOk(x.unit)).length} item(s) still use an old unit (${[...new Set(kitchenItems.filter(x=>!kitchenUnitOk(x.unit)).map(x=>x.unit))].join(', ')}). Admin: run SQL 217 (kitchen unit clean-up) — Grams become Kg and ml become Litres automatically; the rest are listed for you to decide.`),canAddItems&&h('button',{type:'button',className:'btn btn-primary',onClick:openNewItems},'＋ New Kitchen Items'),table(['Code','Item','Balance','Low level','Action'],kitchenItems.slice().sort((a,b)=>String(a.item_code||'').localeCompare(String(b.item_code||''),undefined,{numeric:true})).map(x=>[x.item_code||'—',x.name,h('span',null,x.quantity+' '+x.unit,!kitchenUnitOk(x.unit)&&h('small',{className:'unit-warn',style:{display:'block'}},'⚠ old unit — see note above')),x.low_level,actions(spend&&button('Record Usage / Wastage','use_stock',{id:x.id,quantity:'',pack:'loose',count:'1',kind:'Usage',note:''}), (spend||admin)&&button('Set Stock Alert','stock_limit',{id:x.id,amount:x.low_level,note:''}))])),
        h('details',null,h('summary',null,'Stock movement history'),table(['When','Item','Movement','Quantity','Reason','Staff'],data.movements.map(x=>[formatDateTimeIN(x.created_at),(s=>s?`${s.item_code?s.item_code+' · ':''}${s.name}`:'—')(data.stock.find(s=>s.id===x.item_id)),x.kind,x.quantity,x.reason,name(x.actor)])))),
      tab==='handover'&&h(Section,{title:'Responsibility, leave cover and cash handover'},h('p',null,`Primary: ${name(w.primary_staff)}. Current custodian: ${name(w.custodian)}.`),h('p',null,'Leave cover continues beyond the planned leave end date. After the existing Return to Duty approval, spending pauses until cash and stock are handed back. Each handover retains the stock snapshot and both confirmations.'),
        admin&&!pendingHandover&&button('Assign / Hand Over','handover_create',{kind:data.access.return_ready?'Return':'Leave cover',staff:data.access.return_ready?w.primary_staff:'',leave:'',note:''},true),
        ...data.handovers.map(x=>h('details',{key:x.id,className:'card panel',open:['Awaiting outgoing','Awaiting receipt'].includes(x.status)},h('summary',null,`${x.kind}: ${name(x.from_staff)} → ${name(x.to_staff)} · ${x.status}`),h('p',null,`Cash to transfer: ${money(x.expected_cash)} · ${x.reason}`),h('p',null,x.stock_note||'Stock confirmation pending'),table(['Stock at handover','Quantity'],x.stock_snapshot.map(s=>[s.name,s.quantity+' '+s.unit])),actions(
          x.status==='Awaiting outgoing'&&(x.from_staff===actor||admin)&&button(admin&&actor!==x.from_staff?'Emergency Admin Handover':'Confirm Outgoing Cash / Stock','handover_out',{id:x.id,amount:x.expected_cash,note:''}),
          x.status==='Awaiting receipt'&&x.to_staff===actor&&button('Accept Cash / Stock','handover_receive',{id:x.id,amount:x.counted_cash,note:''},true),
          admin&&['Awaiting outgoing','Awaiting receipt'].includes(x.status)&&button('Cancel Handover','handover_cancel',{id:x.id,note:''}))))),
      // 2.16.22: ledger + printable statement with Today / This Week / This Month / Pick period.
      tab==='ledger'&&h(CashLedgerStatement,{bookTitle:'Kitchen Petty Cash',holder:`Kitchen in-charge: ${name(w.custodian)}`,fileName:'Kitchen-Petty-Cash-Statement',entries:data.cash.map(x=>({id:x.id,date:new Date(x.created_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),at:x.created_at,kind:x.kind,details:x.details,amount:Number(x.amount),by:x.actor_name,extra:[['Reference',x.reference_id||'']]}))}),
      tab==='cash'&&h(Section,{title:'Cash Book & Accounts Reports'},h('p',null,'Kitchen cash subledger: funding is a cash transfer; purchases are expenses. Use these references when reconciling the central cash book. No resident ledger charges are generated.'),
        actions(h('button',{className:'btn btn-secondary',onClick:exportCash},'Download Cash Book (CSV)'),spend&&button('Count / Reconcile Cash','reconcile',{amount:data.balance,note:''}),admin&&button('Record Cash Correction','adjust',{amount:'',note:''})),
        table(['Date','Type','Details','In','Out','Balance','Staff'],data.cash.map(x=>[formatDateTimeIN(x.created_at),x.kind,x.details,x.amount>0?money(x.amount):'—',x.amount<0?money(-x.amount):'—',money(x.balance_after),x.actor_name])),
        h('details',null,h('summary',null,'Physical cash counts and discrepancies'),table(['When','Book cash','Physical cash','Difference','Staff','Note'],data.reconciliations.map(x=>[formatDateTimeIN(x.created_at),money(x.book_cash),money(x.physical_cash),money(x.difference),name(x.actor),x.note]))),
        h('details',null,h('summary',null,'Assignment and action audit history'),table(['When','Action','Staff','Details'],data.audit.map(x=>[formatDateTimeIN(x.created_at),x.action,x.actor_name||'Initial setup',JSON.stringify(x.details)])))),
      newItemsDialog,
      dialogEl);
  }
