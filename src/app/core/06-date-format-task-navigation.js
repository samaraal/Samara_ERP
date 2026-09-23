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
      h('input',{...nativeProps,type:'date',value:value||'',onChange,tabIndex:-1,'aria-label':nativeProps['aria-label']||'Choose date',style:{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer'}})
    );
  };
  const StrictDateTimeInput = props => {
    const {value,onChange,style,...nativeProps}=props||{};
    let shown='';
    if(value){
      const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if(m){const hr=Number(m[4]);shown=`${m[3]}-${m[2]}-${m[1]}, ${String(hr%12||12).padStart(2,'0')}:${m[5]} ${hr>=12?'PM':'AM'} IST`;}
      else shown=String(value);
    }
    return h('div',{style:{position:'relative',width:'100%'}},
      h('input',{type:'text',readOnly:true,value:shown,placeholder:'DD-MM-YYYY, hh:mm AM/PM IST',style:{...(style||{}),width:'100%',paddingRight:'48px',cursor:'pointer'}}),
      h('span',{'aria-hidden':'true',style:{position:'absolute',right:'15px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:'18px'}},'▾'),
      h('input',{...nativeProps,type:'datetime-local',value:value||'',onChange,tabIndex:-1,'aria-label':nativeProps['aria-label']||'Choose date and time',style:{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer'}})
    );
  };

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
  const clearTaskNavigationContext = () => {
    try{sessionStorage.removeItem(TASK_NAVIGATION_KEY)}catch(_error){}
  };

