  // Vendor responsibility is granted by the server's named assignment only.
  function foodViewsFor(profile){
    const views=[];
    if(profile?.__foodVendor?.assignment_version===1&&profile.__foodVendor.read)views.push('Food Vendor Management');
    if(profile?.role!=='STD')views.push('Resident Food Intake');
    return views;
  }
  function foodViewPreference(profile){
    let saved='';try{saved=sessionStorage.getItem('samara_food_view')||''}catch(_error){}
    const views=foodViewsFor(profile);
    return views.includes(saved)?saved:views[0];
  }
  function FoodNavigationLinks({profile,page,onNavigate,mobile=false}){
    const [view,setView]=React.useState(()=>foodViewPreference(profile));
    React.useEffect(()=>{const update=()=>setView(foodViewPreference(profile));window.addEventListener('samara-food-view',update);return()=>window.removeEventListener('samara-food-view',update)},[profile?.id,profile?.__foodVendor?.read]);
    const labels=foodViewsFor(profile);
    return h(React.Fragment,null,labels.map(label=>h('button',{key:label,type:'button','data-nav':'Food & Diet',className:page==='Food & Diet'&&view===label?'active':'',onClick:()=>{
      try{sessionStorage.setItem('samara_food_view',label)}catch(_error){}
      setView(label);window.dispatchEvent(new CustomEvent('samara-food-view',{detail:label}));onNavigate('Food & Diet');
    }},mobile?h('span',{className:'mobile-drawer-item-icon'},'♨'):null,h('span',null,label),mobile?h('span',{className:'mobile-drawer-item-arrow'},'›'):null)));
  }
  function FoodDiet({profile}){
    const views=foodViewsFor(profile);
    const [foodView,setFoodView]=React.useState(()=>foodViewPreference(profile));
    React.useEffect(()=>{const update=e=>setFoodView(views.includes(e?.detail)?e.detail:foodViewPreference(profile));update();window.addEventListener('samara-food-view',update);return()=>window.removeEventListener('samara-food-view',update)},[profile?.id,profile?.role,profile?.__foodVendor?.read]);
    if(!views.length)return h('p',{role:'status'},'Food Vendor Management is available only to the assigned in-charge and Admin/Director.');
    const canViewIntake=views.includes('Resident Food Intake');
    return h(React.Fragment,null,
      h('style',null,'@media(max-width:950px){.food-view-tabs{display:none!important}}'),
      h('div',{className:'employee-actions food-view-tabs'},(views.length>1?views:[]).map(name=>h('button',{type:'button',key:name,className:foodView===name?'btn btn-primary':'btn btn-secondary',onClick:()=>{setFoodView(name);try{sessionStorage.setItem('samara_food_view',name)}catch(_error){}window.dispatchEvent(new CustomEvent('samara-food-view',{detail:name}))}},name))),
      canViewIntake&&(foodView==='Resident Food Intake'||!views.includes('Food Vendor Management'))?h(ResidentFoodIntake,{profile}):window.SamaraFoodVendor?h(window.SamaraFoodVendor,{client,profile}):h('p',null,'Food Vendor files are updating. Refresh the ERP to load the module.')
    );
  }
  // 2.15.34: Resident Food Intake — meals are built item by item (Idli, then Sambar, then Chutney …,
  // or a typed item), and beverages (Tea, Coffee, Milk, Boost, Horlicks, Fresh Juice) are separate
  // entries (table beverage_records, supabase/sql/177_beverage_records.sql), any number per day.
  const FOOD_ITEMS={
    'Tiffin':{
      'Main':['Idli','Dosa','Ragi Dosa','Millet Dosa','Rava Dosa','Uthappam','Ven Pongal','Upma','Rava Kichadi','Idiyappam','Appam','Poori','Chapati','Bread','Oats Porridge','Ragi Koozh','Rice Kanji'],
      'Side':['Sambar','Coconut Chutney','Tomato Chutney','Mint Chutney','Groundnut Chutney','Vegetable Kurma','Potato Masala','Vegetable Stew','Kadala Curry','Gothsu','Podi with Oil'],
      'Other':['Boiled Egg','Banana','Fruit Bowl','Soft Diet (Mashed)']
    },
    'Lunch':{
      'Main':['Rice','Soft Rice','Millet Rice','Brown Rice','Chapati','Phulka','Vegetable Biryani','Lemon Rice','Tamarind Rice','Curd Rice','Sambar Rice','Rasam Rice','Rice Kanji'],
      'Side':['Sambar','Rasam','Kuzhambu','Dal','Poriyal','Kootu','Keerai','Avial','Vegetable Kurma','Raita','Curd','Buttermilk','Appalam','Pickle'],
      'Other':['Payasam','Banana','Fruit Bowl','Soft Diet (Mashed)']
    },
    'Dinner':{
      'Main':['Idli','Dosa','Ragi Dosa','Millet Dosa','Chapati','Phulka','Idiyappam','Appam','Ven Pongal','Upma','Rice','Soft Rice','Rice Kanji','Bread'],
      'Side':['Sambar','Coconut Chutney','Tomato Chutney','Mint Chutney','Vegetable Kurma','Vegetable Stew','Potato Masala','Dal','Rasam','Curd','Buttermilk'],
      'Other':['Banana','Milk Porridge','Fruit Bowl','Soft Diet (Mashed)']
    }
  };
  const FOOD_GROUP_LABEL={Main:'Main item',Side:'Sides / curries',Other:'Others'};
  const BEVERAGES=[['Tea','☕'],['Coffee','☕'],['Milk','🥛'],['Boost','🥤'],['Horlicks','🥤'],['Fresh Juice','🧃']];
  const INTAKE_OPTIONS=['Consumed fully','Consumed mostly','Consumed partially','Tasted only','Refused','Vomited','Tube feed completed'];
  // 2.15.40: quantity unit for beverages.
  const BEV_UNITS=[['ml','ml'],['cup','cup'],['glass','glass'],['tumbler','tumbler'],['mug','mug'],['tsp','tsp (teaspoon)'],['tbsp','tbsp (tablespoon)'],['g','g (gram)'],['mg','mg']];
  const bevQty=r=>r&&r.quantity!=null&&r.quantity!==''?`${Number(r.quantity)} ${r.quantity_unit||'ml'}`:r&&r.quantity_ml?`${r.quantity_ml} ml`:'';
  const BEVERAGE_INTAKE=['Consumed fully','Consumed partially','Refused'];
  const nowHHMM=()=>{try{return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())}catch(_e){return ''}};

  function ResidentFoodIntake({profile}){
    const [patients]=usePatients();
    const [rows,setRows]=React.useState([]);
    const [bevRows,setBevRows]=React.useState([]);
    const [bevReady,setBevReady]=React.useState(true);
    const [saving,setSaving]=React.useState(false);
    const [entryType,setEntryType]=React.useState('meal');
    const [patientId,setPatientId]=React.useState('');
    const blankMeal=()=>({meal_date:todayISOIndia(),meal_type:'Tiffin',items:[],custom:'',served_time:'',consumption_status:'Consumed fully',remarks:''});
    const blankBev=()=>({given_date:todayISOIndia(),beverage:'',juice_name:'',given_time:'',quantity:'',quantity_unit:'ml',consumption_status:'Consumed fully',remarks:''});
    const [form,setForm]=React.useState(blankMeal);
    const [bev,setBev]=React.useState(blankBev);
    const [pick,setPick]=React.useState('');
    // 2.15.35: Guest-wise Food & Beverage Register — one Guest, Today or a period (Apply).
    const [regGuest,setRegGuest]=React.useState(''),[regPeriod,setRegPeriod]=React.useState('today'),[regFrom,setRegFrom]=React.useState(''),[regTo,setRegTo]=React.useState('');
    const regF=useAppliedFilters({guest:regGuest,period:regPeriod,from:regFrom,to:regTo});const RF=regF.applied;
    const [regRows,setRegRows]=React.useState(null),[regLoading,setRegLoading]=React.useState(false);
    // Choosing a Guest for entry also shows that Guest in the register (staff can still pick another Guest there).
    const [regFollow,setRegFollow]=React.useState(false);
    React.useEffect(()=>{if(patientId){setRegGuest(patientId);setRegFollow(true)}},[patientId]);
    React.useEffect(()=>{if(regFollow&&regGuest===patientId){regF.apply();setRegFollow(false)}},[regFollow,regGuest]);
    const canonicalMealType=value=>{const v=String(value||'').toLowerCase();if(v.includes('lunch'))return 'Lunch';if(v.includes('dinner'))return 'Dinner';if(v.includes('breakfast')||v.includes('tiff'))return 'Tiffin';return null};
    const mealLabel=m=>m==='Tiffin'?'Breakfast':m;
    const validMealTime=(meal,time)=>{const minutes=Number(String(time).slice(0,2))*60+Number(String(time).slice(3,5));return meal==='Tiffin'?minutes>=300&&minutes<660:meal==='Lunch'?minutes>=660&&minutes<960:minutes>=960&&minutes<=1439};
    const mealTimeGuide=meal=>meal==='Tiffin'?'05:00 AM to 10:59 AM':meal==='Lunch'?'11:00 AM to 03:59 PM':'04:00 PM to 11:59 PM';
    const REG_PERIODS=[['today','Today'],['yesterday','Yesterday'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['custom','Select period']];
    const regBounds=(()=>{
      const t=todayISOIndia();
      switch(RF.period){
        case 'yesterday':{const d=new Date(`${t}T12:00:00`);d.setDate(d.getDate()-1);const y=d.toISOString().slice(0,10);return [y,y];}
        case 'week':return [mondayOfWeek(t),t];
        case 'month':return [t.slice(0,8)+'01',t];
        case 'lastmonth':{const d=new Date(`${t.slice(0,8)}01T12:00:00`);d.setDate(0);const e=d.toISOString().slice(0,10);return [e.slice(0,8)+'01',e];}
        case 'custom':{const x=RF.from||t,y=RF.to||RF.from||t;return x<=y?[x,y]:[y,x];}
        default:return [t,t];
      }
    })();
    // Recent rows feed only the "Added earlier" item list; the register loads per Guest + period.
    async function load(){
      const m=await client.from('meal_records').select('menu').order('served_at',{ascending:false}).limit(200);
      setRows(m.data||[]);
      const b=await client.from('beverage_records').select('id').limit(1);
      setBevReady(!(b.error&&/beverage_records|does not exist|schema cache/i.test(b.error.message||'')));
      await loadRegister();
    }
    async function loadRegister(){
      if(!RF.guest){setRegRows(null);return}
      setRegLoading(true);
      const [from,to]=regBounds;
      const [m,b]=await Promise.all([
        client.from('meal_records').select('*').eq('patient_id',RF.guest).gte('meal_date',from).lte('meal_date',to).order('served_at',{ascending:false}),
        client.from('beverage_records').select('*').eq('patient_id',RF.guest).gte('given_date',from).lte('given_date',to).order('given_at',{ascending:false})
      ]);
      setRegLoading(false);
      setBevRows(b.error?[]:(b.data||[]));
      setRegRows(m.data||[]);
    }
    React.useEffect(()=>{load()},[]);
    React.useEffect(()=>{loadRegister()},[RF.guest,RF.period,RF.from,RF.to]);
    // Items typed before (not in the standard list) are offered again under "Added earlier".
    const standardItems=new Set(Object.values(FOOD_ITEMS).flatMap(g=>Object.values(g).flat()).map(x=>x.toLowerCase()));
    const earlierItems=[...new Set(rows.flatMap(r=>String(r.menu||'').split(/\s*,\s*/)).map(x=>x.trim()).filter(x=>x&&x.length<=40&&!standardItems.has(x.toLowerCase())&&!/\bwith\b|\band\b/i.test(x)))].sort().slice(0,30);
    function addItem(name){
      const item=String(name||'').trim().replace(/\s+/g,' ');
      if(!item)return;
      if(form.items.some(x=>x.toLowerCase()===item.toLowerCase())){setPick('');return}
      setForm(f=>({...f,items:[...f.items,item],custom:''}));setPick('');
    }
    function removeItem(i){setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
    function moveItem(i,d){setForm(f=>{const a=[...f.items];const j=i+d;if(j<0||j>=a.length)return f;[a[i],a[j]]=[a[j],a[i]];return {...f,items:a}})}
    async function saveMeal(e){
      e.preventDefault();
      if(!patientId)return alert('Select a Guest before entering food details.');
      const pending=form.custom.trim();
      const items=pending&&!form.items.some(x=>x.toLowerCase()===pending.toLowerCase())?[...form.items,pending]:form.items;
      if(!items.length)return alert('Add at least one food item (for example Idli, then Sambar, then Chutney).');
      if(!form.served_time)return alert('Enter the actual meal consumption time. The current time is not filled automatically.');
      if(!validMealTime(form.meal_type,form.served_time))return alert(`${mealLabel(form.meal_type)} must be recorded between ${mealTimeGuide(form.meal_type)}. Please select the correct meal and actual consumption time.`);
      if(saving)return;
      setSaving(true);
      const {data:existing,error:checkError}=await client.from('meal_records').select('id,meal_type').eq('patient_id',patientId).eq('meal_date',form.meal_date);
      if(checkError){setSaving(false);return alert(checkError.message)}
      if((existing||[]).some(row=>canonicalMealType(row.meal_type)===form.meal_type)){setSaving(false);return alert(`${mealLabel(form.meal_type)} has already been recorded for this Guest on ${formatDateIN(form.meal_date)}. Only one Breakfast, one Lunch and one Dinner entry is allowed per Guest per day.`)}
      const payload={patient_id:patientId,meal_date:form.meal_date,meal_type:form.meal_type,menu:items.join(', '),consumption_status:form.consumption_status,remarks:form.remarks,served_at:`${form.meal_date}T${form.served_time}:00+05:30`,recorded_by:profile.id,beverage_type:null,beverage_time:null};
      const {error}=await client.from('meal_records').insert(payload);
      setSaving(false);
      if(error){
        if(error.code==='23505'||/meal_records_patient_date_type_unique/i.test(error.message||''))return alert(`${mealLabel(form.meal_type)} has already been recorded for this Guest on ${formatDateIN(form.meal_date)}. Duplicate meal entries are not allowed.`);
        if(error.code==='23514'||/meal_records_valid_consumption_time/i.test(error.message||''))return alert(`${mealLabel(form.meal_type)} must be recorded between ${mealTimeGuide(form.meal_type)}.`);
        return alert(error.message);
      }
      showSamaraActionToast('success','Meal saved',`${mealLabel(form.meal_type)} · ${items.join(', ')}`);
      setForm(f=>({...blankMeal(),meal_date:f.meal_date,meal_type:f.meal_type}));
      load();
    }
    async function saveBeverage(e){
      e.preventDefault();
      if(!bevReady)return alert('Beverage entries need a one-time database update: run supabase/sql/177_beverage_records.sql in Supabase, then save again.');
      if(!patientId)return alert('Select a Guest before entering the beverage.');
      if(!bev.beverage)return alert('Choose the beverage: Tea, Coffee, Milk, Boost, Horlicks or Fresh Juice.');
      if(bev.beverage==='Fresh Juice'&&!bev.juice_name.trim())return alert('Enter which juice was given (for example Orange, Mosambi, Pomegranate).');
      if(!bev.given_time)return alert('Enter the time the beverage was given.');
      if(bev.given_date===todayISOIndia()&&bev.given_time>nowHHMM())return alert('The beverage time cannot be later than now.');
      const qty=String(bev.quantity||'').trim()===''?null:Number(bev.quantity);
      const unit=bev.quantity_unit||'ml';
      if(qty!==null&&(!Number.isFinite(qty)||qty<=0||qty>5000))return alert('Enter a quantity above 0 (or leave it blank).');
      if(qty!==null&&unit==='ml'&&qty>2000)return alert('Quantity must be 2000 ml or less.');
      if(saving)return;
      setSaving(true);
      const payload={patient_id:patientId,given_date:bev.given_date,given_time:bev.given_time,given_at:`${bev.given_date}T${bev.given_time}:00+05:30`,beverage:bev.beverage,juice_name:bev.beverage==='Fresh Juice'?bev.juice_name.trim():null,quantity_ml:qty!==null&&unit==='ml'?Math.round(qty):null,quantity:qty,quantity_unit:qty===null?null:unit,consumption_status:bev.consumption_status,remarks:bev.remarks||null,recorded_by:profile.id,recorded_by_name:profile.full_name||null};
      let {error}=await client.from('beverage_records').insert(payload);
      // Before 179_beverage_quantity_unit.sql is run: save without the unit columns (ml only).
      if(error&&/quantity_unit|'quantity'|column .*quantity/i.test(error.message||'')){
        if(qty!==null&&unit!=='ml'){setSaving(false);return alert('Units other than ml need a one-time database update: run supabase/sql/179_beverage_quantity_unit.sql in Supabase. You can save in ml now.')}
        const {quantity:_q,quantity_unit:_u,...older}=payload;({error}=await client.from('beverage_records').insert(older));
      }
      setSaving(false);
      if(error){
        if(/beverage_records|does not exist|schema cache/i.test(error.message||'')){setBevReady(false);return alert('Beverage entries need a one-time database update: run supabase/sql/177_beverage_records.sql in Supabase, then save again.')}
        return alert(error.message);
      }
      showSamaraActionToast('success','Beverage saved',`${bev.beverage==='Fresh Juice'?`Fresh Juice (${bev.juice_name.trim()})`:bev.beverage} at ${bev.given_time}`);
      setBev(b=>({...blankBev(),given_date:b.given_date}));
      load();
    }
    const groups=FOOD_ITEMS[form.meal_type]||FOOD_ITEMS.Lunch;
    const guestName=r=>r.patients?[r.patients.title,r.patients.full_name].filter(Boolean).join(' '):'—';
    const roomOf=r=>r.patients?`${r.patients.room_no||'—'}-${r.patients.bed_no||'—'}`:'—';
    const regMeals=regRows||[];
    const combined=[
      ...regMeals.map(r=>({key:`m-${r.id}`,at:r.served_at,kind:'meal',r})),
      ...bevRows.map(r=>({key:`b-${r.id}`,at:r.given_at,kind:'bev',r}))
    ].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
    const regGuestRow=patients.find(p=>p.id===RF.guest);
    const regPeriodText=regBounds[0]===regBounds[1]?formatDateIN(regBounds[0]):`${formatDateIN(regBounds[0])} – ${formatDateIN(regBounds[1])}`;
    const singleDay=regBounds[0]===regBounds[1];
    const mealOn=(type)=>regMeals.find(r=>canonicalMealType(r.meal_type)===type);
    const intakeClass=v=>/refused|vomit/i.test(v||'')?'fi-bad':/partial|tasted/i.test(v||'')?'fi-warn':'fi-ok';
    return h(React.Fragment,null,
      h(Section,{title:'Food, Diet & Beverages',subtitle:'Nursing entry — meals item by item, and beverages separately'},
        h('div',{className:'fi-top'},
          h('div',{className:'fi-guest'},patientSelect(patients,patientId,v=>setPatientId(v),'Guest')),
          h('div',{className:'fi-switch',role:'tablist'},
            h('button',{type:'button',role:'tab','aria-selected':entryType==='meal',className:entryType==='meal'?'active':'',onClick:()=>setEntryType('meal')},'🍛 Meal'),
            h('button',{type:'button',role:'tab','aria-selected':entryType==='bev',className:entryType==='bev'?'active':'',onClick:()=>setEntryType('bev')},'☕ Beverage'))
        ),
        entryType==='meal'?h('form',{className:'fi-form',onSubmit:saveMeal},
          h('div',{className:'fi-row'},
            h('div',{className:'field'},h('label',null,'Entry Date'),h(StrictDateInput,{value:form.meal_date,max:todayISOIndia(),required:true,onChange:e=>setForm({...form,meal_date:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Meal'),h('select',{value:form.meal_type,onChange:e=>setForm({...form,meal_type:e.target.value})},['Tiffin','Lunch','Dinner'].map(v=>h('option',{value:v,key:v},mealLabel(v))))),
            h('div',{className:'field'},h('label',null,`Actual consumption time (${mealTimeGuide(form.meal_type)})`),h('input',{type:'time',value:form.served_time,required:true,onChange:e=>setForm({...form,served_time:e.target.value})}))
          ),
          h('div',{className:'fi-items'},
            h('label',{className:'fi-label'},`Food items served — add one by one (${form.items.length} added)`),
            h('div',{className:'fi-chips'},
              form.items.length?form.items.map((it,i)=>h('span',{key:it,className:'fi-chip'},
                i>0&&h('button',{type:'button',className:'fi-chip-move',title:'Move left','aria-label':`Move ${it} left`,onClick:()=>moveItem(i,-1)},'‹'),
                h('span',null,it),
                h('button',{type:'button',className:'fi-chip-x',title:'Remove','aria-label':`Remove ${it}`,onClick:()=>removeItem(i)},'×'))):h('span',{className:'fi-empty'},'No items yet — choose from the list below, e.g. Idli, then Sambar, then Coconut Chutney.')),
            h('div',{className:'fi-add'},
              h('select',{value:pick,'aria-label':'Add food item',onChange:e=>{const v=e.target.value;if(v==='__other'){setPick(v);return}addItem(v)}},
                h('option',{value:''},'＋ Add food item…'),
                Object.entries(groups).map(([g,list])=>h('optgroup',{key:g,label:FOOD_GROUP_LABEL[g]},list.filter(x=>!form.items.includes(x)).map(x=>h('option',{key:x,value:x},x)))),
                earlierItems.length?h('optgroup',{label:'Added earlier'},earlierItems.filter(x=>!form.items.includes(x)).map(x=>h('option',{key:x,value:x},x))):null,
                h('option',{value:'__other'},'✎ Other — type your own item')),
              pick==='__other'&&h('div',{className:'fi-other'},
                h('input',{type:'text',autoFocus:true,maxLength:60,value:form.custom,placeholder:'Type the item, e.g. Pumpkin Kootu',onChange:e=>setForm({...form,custom:e.target.value}),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();addItem(form.custom)}}}),
                h('button',{type:'button',className:'btn btn-secondary',onClick:()=>addItem(form.custom)},'Add'),
                h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPick('');setForm({...form,custom:''})}},'Cancel'))
            )
          ),
          h('div',{className:'fi-row'},miniSelect('Food consumed',form.consumption_status,INTAKE_OPTIONS,v=>setForm({...form,consumption_status:v}))),
          miniInput('Remarks',form.remarks,v=>setForm({...form,remarks:v})),
          h('div',{className:'field-help'},'Only one Breakfast, one Lunch and one Dinner entry is permitted for each Guest on each date. Record beverages in ☕ Beverage.'),
          h('button',{className:'btn btn-primary fi-save',disabled:saving},saving?'Saving…':`Save ${mealLabel(form.meal_type)} Entry`)
        ):h('form',{className:'fi-form',onSubmit:saveBeverage},
          !bevReady&&h('div',{className:'message error'},'Beverage entries need a one-time database update: run supabase/sql/177_beverage_records.sql in Supabase.'),
          h('label',{className:'fi-label'},'Beverage *'),
          h('div',{className:'fi-bev-grid'},BEVERAGES.map(([name,icon])=>h('button',{key:name,type:'button',className:`fi-bev ${bev.beverage===name?'active':''}`,'aria-pressed':bev.beverage===name,onClick:()=>setBev({...bev,beverage:name,juice_name:name==='Fresh Juice'?bev.juice_name:''})},h('span',{'aria-hidden':'true'},icon),name))),
          bev.beverage==='Fresh Juice'&&h('div',{className:'field'},h('label',null,'Which juice?'),h('input',{type:'text',maxLength:60,value:bev.juice_name,required:true,placeholder:'e.g. Orange, Mosambi, Pomegranate, Watermelon',onChange:e=>setBev({...bev,juice_name:e.target.value})})),
          h('div',{className:'fi-row'},
            h('div',{className:'field'},h('label',null,'Date'),h(StrictDateInput,{value:bev.given_date,max:todayISOIndia(),required:true,onChange:e=>setBev({...bev,given_date:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Time given'),h('input',{type:'time',value:bev.given_time,required:true,onChange:e=>setBev({...bev,given_time:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Quantity (optional)'),h('div',{className:'fi-qty'},
              h('input',{type:'number',min:0,step:'any',inputMode:'decimal',value:bev.quantity,placeholder:bev.quantity_unit==='ml'?'e.g. 150':'e.g. 1','aria-label':'Quantity',onChange:e=>setBev({...bev,quantity:e.target.value})}),
              h('select',{value:bev.quantity_unit,'aria-label':'Unit',onChange:e=>setBev({...bev,quantity_unit:e.target.value})},BEV_UNITS.map(([v,l])=>h('option',{key:v,value:v},l)))))
          ),
          h('div',{className:'fi-row'},miniSelect('Consumed',bev.consumption_status,BEVERAGE_INTAKE,v=>setBev({...bev,consumption_status:v}))),
          miniInput('Remarks',bev.remarks,v=>setBev({...bev,remarks:v})),
          h('div',{className:'field-help'},'Record every serving separately — any time of the day, as many times as given.'),
          h('button',{className:'btn btn-primary fi-save',disabled:saving||!bevReady},saving?'Saving…':!bevReady?'Cannot save yet — database update needed':`Save ${bev.beverage||'Beverage'} Entry`),
          !bevReady&&h('div',{className:'message error'},'Admin: run supabase/sql/177_beverage_records.sql once in Supabase → SQL Editor, then refresh. Meals can still be saved.')
        )
      ),
      h('div',{className:'card panel fi-register'},
        h('div',{className:'fi-reg-head'},
          h('div',null,h('h3',null,'Food & Beverage Register'),
            h('small',null,RF.guest?`${regGuestRow?formalName(regGuestRow):'Guest'}${regGuestRow?.patient_id?` · ${regGuestRow.patient_id}`:''} · ${(REG_PERIODS.find(p=>p[0]===RF.period)||[])[1]||''}: ${regPeriodText}`:'Choose a Guest and press Apply'))
        ),
        h('div',{className:'fi-reg-filters'},
          h('div',{className:'field fi-reg-guest'},h('label',null,'Guest'),h('select',{value:regGuest,onChange:e=>setRegGuest(e.target.value)},
            h('option',{value:''},'Select Guest'),
            patients.map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)} · ${p.patient_id||''}${p.room_no?` · Room ${p.room_no}-${p.bed_no||''}`:''}${p.is_trial?' · 🧪 TRIAL':''}`)))),
          h('div',{className:'field'},h('label',null,'Period'),h('select',{value:regPeriod,onChange:e=>setRegPeriod(e.target.value)},REG_PERIODS.map(([v,l])=>h('option',{key:v,value:v},l)))),
          regPeriod==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:regFrom,max:todayISOIndia(),onChange:e=>setRegFrom(e.target.value)})),
          regPeriod==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:regTo,max:todayISOIndia(),onChange:e=>setRegTo(e.target.value)})),
          h(ApplyFilterButton,{dirty:regF.dirty,onApply:regF.apply})
        ),
        !RF.guest?h('div',{className:'fi-reg-empty'},'Select a Guest and press Apply to see that Guest\'s meals and beverages.')
        :regLoading&&regRows===null?h('div',{className:'fi-reg-empty'},'Loading…')
        :h(React.Fragment,null,
          singleDay&&h('div',{className:'fi-day-summary'},
            ['Tiffin','Lunch','Dinner'].map(t=>{const r=mealOn(t);return h('div',{key:t,className:`fi-day-cell ${r?intakeClass(r.consumption_status):'fi-pending'}`},
              h('small',null,mealLabel(t)),h('strong',null,r?(r.consumption_status||'Recorded'):'Not recorded'),r&&h('span',null,`${String(fmt(r.served_at)).split(', ').slice(-1)[0]} · ${r.menu||''}`))}),
            h('div',{className:'fi-day-cell fi-bevcell'},h('small',null,'Beverages'),h('strong',null,`${bevRows.length} serving${bevRows.length===1?'':'s'}`),
              bevRows.length?h('span',null,bevRows.slice().reverse().map(b=>`${b.beverage==='Fresh Juice'?`Juice (${b.juice_name||''})`:b.beverage} ${String(fmt(b.given_at)).split(', ').slice(-1)[0].replace(' IST','')}`).join(' · ')):null)
          ),
          h('div',{className:'table-wrap'},h('table',{className:'table fi-reg-table'},
            h('thead',null,h('tr',null,['Date','Time','Type','Items / Beverage','Intake','Remarks'].map(x=>h('th',{key:x},x)))),
            h('tbody',null,
              combined.map(({key,kind,r})=>h('tr',{key},
                h('td',{'data-label':'Date'},formatDateIN(kind==='meal'?r.meal_date:r.given_date)),
                h('td',{'data-label':'Time'},String(fmt(kind==='meal'?r.served_at:r.given_at)).split(', ').slice(-1)[0]),
                h('td',{'data-label':'Type'},kind==='meal'?mealLabel(canonicalMealType(r.meal_type)||r.meal_type):h('span',{className:'fi-type-bev'},'Beverage')),
                h('td',{'data-label':'Items / Beverage'},kind==='meal'?h('span',null,r.menu||'—',r.beverage_type?h('small',{className:'fi-sub'},` · Beverage: ${r.beverage_type}${r.beverage_time?` at ${String(r.beverage_time).slice(0,5)}`:''}`):null)
                  :`${r.beverage==='Fresh Juice'?`Fresh Juice (${r.juice_name||'—'})`:r.beverage}${bevQty(r)?` · ${bevQty(r)}`:''}`),
                h('td',{'data-label':'Intake'},h('span',{className:`fi-intake ${intakeClass(r.consumption_status)}`},r.consumption_status||'—')),
                h('td',{'data-label':'Remarks'},r.remarks||'—'))),
              combined.length===0&&h('tr',null,h('td',{colSpan:6,className:'empty'},`No meals or beverages recorded for this Guest on ${regPeriodText}.`))
            )
          ))
        )
      )
    );
  }
