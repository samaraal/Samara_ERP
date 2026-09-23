  function foodViewPreference(){
    try{return sessionStorage.getItem('samara_food_view')==='Resident Food Intake'?'Resident Food Intake':'Food Vendor Management'}catch(_error){return 'Food Vendor Management'}
  }
  function FoodNavigationLinks({profile,page,onNavigate,mobile=false}){
    const [view,setView]=React.useState(foodViewPreference);
    React.useEffect(()=>{const update=()=>setView(foodViewPreference());window.addEventListener('samara-food-view',update);return()=>window.removeEventListener('samara-food-view',update)},[]);
    const labels=profile?.role!=='STD'&&!isNursingManagerProfile(profile)?['Food Vendor Management','Resident Food Intake']:['Food Vendor Management'];
    return h(React.Fragment,null,labels.map(label=>h('button',{key:label,type:'button','data-nav':'Food & Diet',className:page==='Food & Diet'&&view===label?'active':'',onClick:()=>{
      try{sessionStorage.setItem('samara_food_view',label)}catch(_error){}
      setView(label);window.dispatchEvent(new CustomEvent('samara-food-view',{detail:label}));onNavigate('Food & Diet');
    }},mobile?h('span',{className:'mobile-drawer-item-icon'},'♨'):null,h('span',null,label),mobile?h('span',{className:'mobile-drawer-item-arrow'},'›'):null)));
  }
  function FoodDiet({profile}){
    const [foodView,setFoodView]=React.useState(foodViewPreference);
    React.useEffect(()=>{const update=e=>setFoodView(e.detail||foodViewPreference());window.addEventListener('samara-food-view',update);return()=>window.removeEventListener('samara-food-view',update)},[]);
    const canViewIntake=profile?.role!=='STD'&&!isNursingManagerProfile(profile);
    return h(React.Fragment,null,
      h('style',null,'@media(max-width:950px){.food-view-tabs{display:none!important}}'),
      h('div',{className:'employee-actions food-view-tabs'},(canViewIntake?['Food Vendor Management','Resident Food Intake']:['Food Vendor Management']).map(name=>h('button',{type:'button',key:name,className:foodView===name?'btn btn-primary':'btn btn-secondary',onClick:()=>{setFoodView(name);try{sessionStorage.setItem('samara_food_view',name)}catch(_error){}window.dispatchEvent(new CustomEvent('samara-food-view',{detail:name}))}},name))),
      canViewIntake&&foodView==='Resident Food Intake'?h(ResidentFoodIntake,{profile}):window.SamaraFoodVendor?h(window.SamaraFoodVendor,{client,profile}):h('p',null,'Food Vendor files are updating. Refresh the ERP to load the module.')
    );
  }
  function ResidentFoodIntake({profile}){
    const [patients]=usePatients();
    const [rows,setRows]=React.useState([]);
    const [saving,setSaving]=React.useState(false);
    const blank=()=>({patient_id:'',meal_date:todayISOIndia(),meal_type:'Tiffin',menu:'Idli with sambar and chutney',custom_menu:'',served_time:'',consumption_status:'Consumed fully',beverage_type:'None',beverage_time:'',remarks:''});
    const [form,setForm]=React.useState(blank);
    const menus={
      'Tiffin':['Idli with sambar and chutney','Dosa with sambar and chutney','Ven pongal with sambar','Vegetable upma with chutney','Idiyappam with vegetable kurma','Appam with vegetable stew','Poori with potato masala','Chapati with vegetable kurma','Ragi dosa with chutney','Rice kanji / soft diet','Other / Custom'],
      'Lunch':['Rice, sambar, poriyal, rasam and curd','Rice, kuzhambu, poriyal, rasam and curd','Vegetable biryani with raita','Lemon rice with curd','Tamarind rice with curd','Curd rice with vegetable','Sambar rice with vegetable','Chapati with vegetable kurma','Millet meal - diabetic diet','Soft rice / mashed diet','Other / Custom'],
      'Dinner':['Idli with sambar and chutney','Dosa with sambar and chutney','Chapati with vegetable kurma','Idiyappam with vegetable kurma','Appam with vegetable stew','Ven pongal with sambar','Vegetable upma with chutney','Rice and rasam','Rice kanji / soft diet','Millet dosa with chutney','Other / Custom'],
    };
    const beverageOptions=['None','Tea','Coffee','Milk','Buttermilk','Fresh juice','Tender coconut water','Health drink','Cool drink','Soup','Other'];
    const canonicalMealType=value=>{const v=String(value||'').toLowerCase();if(v.includes('lunch'))return 'Lunch';if(v.includes('dinner'))return 'Dinner';if(v.includes('breakfast')||v.includes('tiff'))return 'Tiffin';return null};
    const validMealTime=(meal,time)=>{const minutes=Number(String(time).slice(0,2))*60+Number(String(time).slice(3,5));return meal==='Tiffin'?minutes>=300&&minutes<660:meal==='Lunch'?minutes>=660&&minutes<960:minutes>=960&&minutes<=1439};
    const mealTimeGuide=meal=>meal==='Tiffin'?'05:00 AM to 10:59 AM':meal==='Lunch'?'11:00 AM to 03:59 PM':'04:00 PM to 11:59 PM';
    async function load(){const {data}=await client.from('meal_records').select('*,patients(full_name,room_no,bed_no)').order('served_at',{ascending:false}).limit(100);setRows(data||[])}
    React.useEffect(()=>{load()},[]);
    async function save(e){
      e.preventDefault();
      if(!form.patient_id)return alert('Select a patient before entering food or beverage details.');
      const menu=form.menu==='Other / Custom'?form.custom_menu.trim():form.menu;
      if(!menu)return alert('Select the menu, or enter the custom menu.');
      if(!form.served_time)return alert('Enter the actual meal consumption time. The current time is not filled automatically.');
      if(!validMealTime(form.meal_type,form.served_time))return alert(`${form.meal_type} must be recorded between ${mealTimeGuide(form.meal_type)}. Please select the correct meal and actual consumption time.`);
      if(form.beverage_type!=='None'&&!form.beverage_time)return alert('Enter the beverage consumption time.');
      if(saving)return;
      setSaving(true);
      const {data:existing,error:checkError}=await client.from('meal_records').select('id,meal_type').eq('patient_id',form.patient_id).eq('meal_date',form.meal_date);
      if(checkError){setSaving(false);return alert(checkError.message)}
      if((existing||[]).some(row=>canonicalMealType(row.meal_type)===form.meal_type)){setSaving(false);return alert(`${form.meal_type==='Tiffin'?'Breakfast':form.meal_type} has already been recorded for this patient on ${formatDateIN(form.meal_date)}. Only one Breakfast, one Lunch and one Dinner entry is allowed per patient per day.`)}
      const servedAt=`${form.meal_date}T${form.served_time||'12:00'}:00+05:30`;
      const payload={patient_id:form.patient_id,meal_date:form.meal_date,meal_type:form.meal_type,menu,consumption_status:form.consumption_status,remarks:form.remarks,served_at:servedAt,recorded_by:profile.id,beverage_type:form.beverage_type==='None'?null:form.beverage_type,beverage_time:form.beverage_type==='None'?null:form.beverage_time};
      const {error}=await client.from('meal_records').insert(payload);
      setSaving(false);
      if(error){
        if(error.code==='23505'||/meal_records_patient_date_type_unique/i.test(error.message||''))return alert(`${form.meal_type==='Tiffin'?'Breakfast':form.meal_type} has already been recorded for this patient on ${formatDateIN(form.meal_date)}. Duplicate meal entries are not allowed.`);
        if(error.code==='23514'||/meal_records_valid_consumption_time/i.test(error.message||''))return alert(`${form.meal_type} must be recorded between ${mealTimeGuide(form.meal_type)}.`);
        return alert(error.message);
      }
      const retainedPatient=form.patient_id;
      setForm({...blank(),patient_id:retainedPatient});
      load();
    }
    const menuOptions=menus[form.meal_type]||menus.Other;
    return h(React.Fragment,null,
      h(Section,{title:'Food, Diet & Beverages',subtitle:'Nursing entry for patient-wise meals, intake and beverages'},
        h('form',{className:'modal-grid food-beverage-entry',onSubmit:save},
          patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v})),
          h('div',{className:'field'},h('label',null,'Entry Date'),h(StrictDateInput,{value:form.meal_date,max:todayISOIndia(),required:true,onChange:e=>setForm({...form,meal_date:e.target.value})})),
          h('div',{className:'field'},h('label',null,'Meal'),h('select',{value:form.meal_type,onChange:e=>{const v=e.target.value;setForm({...form,meal_type:v,menu:menus[v][0],custom_menu:''})}},['Tiffin','Lunch','Dinner'].map(v=>h('option',{value:v,key:v},v==='Tiffin'?'Breakfast':v)))),
          h('div',{className:'field-help'},'Only one Breakfast, one Lunch and one Dinner entry is permitted for each patient on each date.'),
          miniSelect('South Indian Menu',form.menu,menuOptions,v=>setForm({...form,menu:v})),
          form.menu==='Other / Custom'&&miniInput('Custom menu / feed',form.custom_menu,v=>setForm({...form,custom_menu:v}),true),
          miniInput(`Actual consumption time (${mealTimeGuide(form.meal_type)})`,form.served_time,v=>setForm({...form,served_time:v}),true,'time'),
          miniSelect('Food consumed',form.consumption_status,['Consumed fully','Consumed mostly','Consumed partially','Tasted only','Refused','Vomited','Tube feed completed'],v=>setForm({...form,consumption_status:v})),
          miniSelect('Beverage',form.beverage_type,beverageOptions,v=>setForm({...form,beverage_type:v,beverage_time:v==='None'?'':form.beverage_time})),
          form.beverage_type!=='None'&&miniInput('Beverage consumption time',form.beverage_time,v=>setForm({...form,beverage_time:v}),true,'time'),
          miniInput('Remarks',form.remarks,v=>setForm({...form,remarks:v})),
          h('button',{className:'btn btn-primary',disabled:saving},saving?'Saving…':'Save Food & Beverage Entry')
        )
      ),
      h(LogTable,{title:'Recent Food & Beverage Records',heads:['Patient / Room','Meal','Menu','Food Intake','Meal Time','Beverage','Beverage Time'],rows:rows.map(r=>[`${r.patients?.full_name||'—'} · ${r.patients?.room_no||'—'}-${r.patients?.bed_no||'—'}`,r.meal_type==='Tiffin'?'Breakfast':r.meal_type,r.menu,r.consumption_status,fmt(r.served_at),r.beverage_type||'—',r.beverage_time?String(r.beverage_time).slice(0,5):'—'])})
    );
  }

