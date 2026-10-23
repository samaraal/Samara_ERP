  const formatDateIN = value => {
    if(!value)return '—';
    const raw=String(value).trim();
    const dateOnly=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(dateOnly)return `${dateOnly[3]}-${dateOnly[2]}-${dateOnly[1]}`;
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return raw;
    const parts=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(date);
    const get=type=>parts.find(part=>part.type===type)?.value||'';
    return `${get('day')}-${get('month')}-${get('year')}`;
  };
  const formatDateWithDayIN = value => {
    if(!value)return '—';
    const raw=String(value).trim();
    const dateOnly=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date=dateOnly?new Date(Date.UTC(Number(dateOnly[1]),Number(dateOnly[2])-1,Number(dateOnly[3]))):new Date(value);
    if(Number.isNaN(date.getTime()))return formatDateIN(value);
    const weekday=new Intl.DateTimeFormat('en-IN',{timeZone:dateOnly?'UTC':'Asia/Kolkata',weekday:'long'}).format(date);
    return `${formatDateIN(value)} – ${weekday}`;
  };
  // Strict ERP date controls: the visible value is always DD-MM-YYYY.
  // A transparent native picker is retained only for calendar selection; its locale-specific
  // MM/DD/YYYY rendering is never shown to the user. Database values remain YYYY-MM-DD.
  const StrictDateInput = props => {
    const {value,onChange,style,...nativeProps}=props||{};
    return h('div',{style:{position:'relative',width:'100%'}},
      h('input',{type:'text',readOnly:true,value:value?formatDateIN(value):'',placeholder:'DD-MM-YYYY',style:{...(style||{}),width:'100%',paddingRight:'48px',cursor:'pointer'}}),
      h('span',{'aria-hidden':'true',style:{position:'absolute',right:'15px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:'18px'}},'▾'),
      h('input',{...nativeProps,'data-samara-native':'1',type:'date',value:value||'',onChange,tabIndex:-1,'aria-label':nativeProps['aria-label']||'Choose date',style:{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer'}})
    );
  };
  const time24Parts=value=>{
    const match=String(value||'').match(/^(\d{1,2}):([0-5]\d)(?::\d{2})?$/);
    if(!match)return null;
    const hour=Number(match[1]);
    return hour>23?null:{hour,minute:Number(match[2])};
  };
  const formatManualTime=value=>{
    const parts=time24Parts(value);
    if(!parts)return '';
    return `${parts.hour%12||12}:${String(parts.minute).padStart(2,'0')} ${parts.hour>=12?'PM':'AM'}`;
  };
  const parseManualTime=(value,period)=>{
    const match=String(value||'').trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)$/);
    if(!match)return '';
    let hour=Number(match[1])%12;
    if(String(period||'').toUpperCase()==='PM')hour+=12;
    else if(String(period||'').toUpperCase()!=='AM')return '';
    return `${String(hour).padStart(2,'0')}:${match[2]}`;
  };
  function ManualTimeInput(props){
    const {value,onChange,style,className,placeholder,min,max,step,required,name,validateTime,...inputProps}=props||{};
    const initial=formatManualTime(value).split(' ');
    const [draft,setDraft]=React.useState(initial[0]||'');
    const [period,setPeriod]=React.useState(initial[1]||'AM');
    const inputRef=React.useRef(null);
    React.useEffect(()=>{const parts=formatManualTime(value).split(' ');setDraft(parts[0]||'');setPeriod(parts[1]||'AM')},[value]);
    React.useEffect(()=>{
      const input=inputRef.current;
      if(!input)return;
      const parsed=parseManualTime(draft,period);
      let problem=parsed&&validateTime?validateTime(parsed)||'':'';
      if(parsed&&step&&Number(step)>60){
        const parts=time24Parts(parsed);
        if((parts.hour*3600+parts.minute*60)%Number(step)!==0)problem=problem||`Use a time in ${Math.round(Number(step)/60)}-minute intervals.`;
      }
      input.setCustomValidity(problem);
    },[draft,period,step,validateTime]);
    const emit=(nextDraft,nextPeriod,event)=>{
      const parsed=parseManualTime(nextDraft,nextPeriod);
      if(onChange&&parsed)onChange({target:{value:parsed},currentTarget:event?.currentTarget});
      else if(onChange&&!nextDraft.trim()&&!required)onChange({target:{value:''},currentTarget:event?.currentTarget});
    };
    return React.createElement(React.Fragment,null,
      React.createElement('div',{className:'samara-time-entry',style:{display:'flex',gap:'6px',width:'100%'}},
        React.createElement('input',{
          ...inputProps,
          ref:inputRef,
          type:'text',
          value:draft,
          required:Boolean(required),
          placeholder:placeholder||'h:mm',
          inputMode:'text',
          autoComplete:'off',
          pattern:'(?:0?[1-9]|1[0-2]):[0-5]\\d',
          title:'Enter the time as h:mm, then choose AM or PM.',
          'data-samara-time-entry':'true',
          'aria-label':inputProps['aria-label']||'Time (h:mm)',
          className,
          style:{flex:'1 1 auto',minWidth:0,...(style||{})},
          min:undefined,max:undefined,step:undefined,
          onChange:event=>{const next=event.target.value;setDraft(next);emit(next,period,event)}
        }),
        React.createElement('select',{value:period,disabled:Boolean(inputProps.disabled),'aria-label':'AM/PM',onChange:event=>{const next=event.target.value;setPeriod(next);emit(draft,next,event)},style:{flex:'0 0 78px',width:'78px',padding:'8px 6px'}},
          React.createElement('option',{value:'AM'},'AM'),React.createElement('option',{value:'PM'},'PM'))
      ),
      name?React.createElement('input',{type:'hidden',name,value:parseManualTime(draft,period)}):null
    );
  }
  function StrictDateTimeInput(props){
    const {value,onChange,style,className,required,disabled,min,max,id,name,...inputProps}=props||{};
    const split=value=>{
      const match=String(value||'').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      return {date:match?.[1]||'',time:match?.[2]||''};
    };
    const initial=split(value);
    const [date,setDate]=React.useState(initial.date);
    const [time,setTime]=React.useState(initial.time);
    React.useEffect(()=>{const next=split(value);setDate(next.date);setTime(next.time)},[value]);
    const emit=(nextDate,nextTime)=>{
      if(!onChange)return;
      const parsed=time24Parts(nextTime);
      onChange({target:{value:nextDate&&parsed?`${nextDate}T${nextTime}`:''}});
    };
    const dateChanged=event=>{
      const nextDate=event.target.value;
      setDate(nextDate);
      if(nextDate&&time24Parts(time))emit(nextDate,time);
      else if(!nextDate&&!time)emit('','');
    };
    const validateTime=parsed=>{
      let problem='';
      if(parsed&&date){
        const current=`${date}T${parsed}`;
        const minValue=String(min||'').slice(0,16),maxValue=String(max||'').slice(0,16);
        if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(minValue)&&current<minValue)problem='Choose a date and time at or after the allowed time.';
        if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(maxValue)&&current>maxValue)problem='Choose a date and time at or before the allowed time.';
      }
      return problem;
    };
    const dateMax=String(max||'').slice(0,10)||undefined;
    const dateMin=String(min||'').slice(0,10)||undefined;
    const valueToSubmit=date&&time24Parts(time)?`${date}T${time}`:'';
    return h('div',{className:`samara-datetime-entry ${className||''}`.trim(),style:{width:'100%',display:'grid',gridTemplateColumns:'minmax(0,1.15fr) minmax(190px,.85fr)',gap:'8px',alignItems:'center',...(style||{})}},
      h('div',{style:{position:'relative',minWidth:0}},
        h('input',{type:'text',readOnly:true,value:date?formatDateIN(date):'',placeholder:'DD-MM-YYYY',disabled,tabIndex:-1,'aria-hidden':'true',style:{width:'100%',paddingRight:'42px',cursor:'pointer'}}),
        h('span',{'aria-hidden':'true',style:{position:'absolute',right:'14px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:'16px'}},'▾'),
        h('input',{...inputProps,'data-samara-native':'1',id,name:undefined,type:'date',value:date,required:Boolean(required),disabled,min:dateMin,max:dateMax,onChange:dateChanged,tabIndex:0,'aria-label':inputProps['aria-label']||'Choose date',style:{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer'}})
      ),
      h(ManualTimeInput,{...inputProps,id:undefined,name:undefined,value:time,onChange:event=>{setTime(event.target.value);if(date&&time24Parts(event.target.value))emit(date,event.target.value);else if(!event.target.value&&!required)emit('','')},required,disabled,validateTime,'aria-label':`${inputProps['aria-label']||'Date and time'} — time (h:mm)`}),
      name?h('input',{type:'hidden',name,value:valueToSubmit}):null
    );
  }

  const formatTimeIN = value => window.SamaraDateTime.time(value);
  const formatDateTimeIN = value => window.SamaraDateTime.dateTime(value);
  const fmt = value => formatDateTimeIN(value);
  const normaliseVisibleIndianDates = root => {
    if(!root)return;
    const convert = text => window.SamaraDateTime.text(String(text||''));
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const parent=node.parentElement;
      if(!parent||parent.closest('script,style,textarea,option,[contenteditable]'))return;
      const updated=convert(node.nodeValue);
      if(updated!==node.nodeValue)node.nodeValue=updated;
    });
  };
  const TASK_NAVIGATION_KEY='samara_regular_task_context';
  const saveTaskNavigationContext = context => {
    try{
      sessionStorage.setItem(TASK_NAVIGATION_KEY,JSON.stringify({
        ...context,
        created_at:new Date().toISOString()
      }));
    }catch(error){console.warn('Task navigation context could not be saved.',error)}
  };
  const readTaskNavigationContext = expectedPage => {
    try{
      const raw=sessionStorage.getItem(TASK_NAVIGATION_KEY);
      if(!raw)return null;
      const context=JSON.parse(raw);
      if(expectedPage&&context?.page!==expectedPage)return null;
      const age=Date.now()-new Date(context.created_at||0).getTime();
      if(!Number.isFinite(age)||age>10*60*1000){
        sessionStorage.removeItem(TASK_NAVIGATION_KEY);
        return null;
      }
      return context;
    }catch(error){
      sessionStorage.removeItem(TASK_NAVIGATION_KEY);
      return null;
    }
  };
  // 2.17.10: Meal alert -> Resident Food Intake with the Guest, meal and date already chosen.
  const mealTaskContext = a => {
    const title=String(a?.title||'').toLowerCase();
    const meal_type=title.includes('breakfast')?'Tiffin':title.includes('lunch')?'Lunch':title.includes('dinner')?'Dinner':'';
    let meal_date='',hour=null;
    try{const d=new Date(a?.due_at);if(!Number.isNaN(d.getTime())){meal_date=d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});hour=Number(d.toLocaleString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}))}}catch(_error){}
    // Escalation register rows carry no title: Meal Due times are 8 AM / 1 PM / 8 PM.
    const byHour=hour===8?'Tiffin':hour===13?'Lunch':hour===20?'Dinner':'';
    return {meal_type:meal_type||(String(a?.alert_type||'').toLowerCase()==='meal'?byHour:''),meal_date,poor_intake:String(a?.alert_type||'').toLowerCase()==='meal intake'};
  };
  const clearTaskNavigationContext = () => {
    try{sessionStorage.removeItem(TASK_NAVIGATION_KEY)}catch(_error){}
  };

