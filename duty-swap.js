(function(){
  'use strict';
  const h=React.createElement;
  const signature=p=>[p?.role,p?.designation,p?.department,p?.__dutyContext?.assignment?.id||''].join('|');
  function applyContext(profile,context){
    if(!context||context.profile_id!==profile.id)throw new Error('Duty assignment identity could not be verified.');
    return {...profile,role:context.role,designation:context.designation,department:context.department,__dutyContext:context};
  }
  function regularProfile(profile){
    const c=profile?.__dutyContext;
    return c?{...profile,role:c.regular_role,designation:c.regular_designation,department:c.regular_department}:profile;
  }
  function useContext({client,profile,setProfile,onChanged}){
    const [state,setState]=React.useState({id:null,ready:false,error:''});
    const latest=React.useRef({profile,onChanged});latest.current={profile,onChanged};
    const refreshRef=React.useRef(()=>{});
    React.useEffect(()=>{
      const id=profile?.id;if(!id){setState({id:null,ready:false,error:''});return;}
      let active=true,boundaryTimer,sequence=0;
      async function refresh(block=false){
        const attempt=++sequence;
        if(block)setState({id,ready:false,error:''});
        try{
          const {data,error}=await client.rpc('duty_swap_context');
          if(!active||attempt!==sequence)return;
          if(error)throw error;
          const before=latest.current.profile;
          if(before?.id!==id)return;
          const next=applyContext(before,data);
          latest.current.profile=next;setProfile(next);setState({id,ready:true,error:''});
          if(signature(before)!==signature(next))latest.current.onChanged(next);
          clearTimeout(boundaryTimer);
          if(data.next_change_at){
            const delay=new Date(data.next_change_at).getTime()-new Date(data.server_now).getTime();
            boundaryTimer=setTimeout(()=>refresh(true),Math.max(10,Math.min(delay+30,2147483000)));
          }
        }catch(error){if(active&&attempt===sequence)setState({id,ready:false,error:error.message||'Unable to verify current duties.'});}
      }
      refreshRef.current=()=>refresh(true);refresh(true);
      const interval=setInterval(()=>refresh(),15000);
      const focus=()=>refresh(true);
      const visible=()=>{if(document.visibilityState==='visible')refresh(true)};
      window.addEventListener('focus',focus);window.addEventListener('samara-duty-swap-changed',focus);document.addEventListener('visibilitychange',visible);
      return()=>{active=false;clearInterval(interval);clearTimeout(boundaryTimer);window.removeEventListener('focus',focus);window.removeEventListener('samara-duty-swap-changed',focus);document.removeEventListener('visibilitychange',visible)};
    },[profile?.id,Boolean(profile?.__dutyContext)]);
    return {...state,ready:state.id===profile?.id&&Boolean(profile?.__dutyContext)&&state.ready,refresh:()=>refreshRef.current()};
  }
  const indiaInput=date=>new Date(date.getTime()+330*60000).toISOString().slice(0,16);
  const indiaISO=value=>value?new Date(value+':00+05:30').toISOString():null;
  const display=value=>value?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value))+' IST':'—';
  function useDailyNotice({client,profile,ready=true}){
    const [notice,setNotice]=React.useState(null);
    const context=profile?.__dutyContext;
    const day=context?.server_now?indiaInput(new Date(context.server_now)).slice(0,10):'';
    React.useEffect(()=>{
      let active=true;
      async function claim(){
        if(document.visibilityState!=='visible'||!profile?.id||!context)return;
        try{
          const {data,error}=await client.rpc('claim_department_duty_notice');
          if(active&&!error&&data?.profile_id===profile.id)setNotice(data);
        }catch(_error){/* A notice failure never changes verified duties. */}
      }
      claim();document.addEventListener('visibilitychange',claim);
      return()=>{active=false;document.removeEventListener('visibilitychange',claim)};
    },[profile?.id,day,context?.assignment?.id,context?.next_change_at]);
    React.useEffect(()=>{if(!notice||!ready)return;const timer=setTimeout(()=>setNotice(null),8000);return()=>clearTimeout(timer)},[notice,ready]);
    return {notice:notice?.profile_id===profile?.id?notice:null,onClose:()=>setNotice(null)};
  }
  function DailyNotice({notice,onClose}){
    if(!notice)return null;
    return h('div',{className:'duty-login-notice'},
      h('style',null,`.duty-login-notice{position:fixed;inset:0;z-index:11000;display:grid;place-items:center;overflow:hidden;background:rgba(255,248,252,.97);color:#7d104c;padding:24px}.duty-login-notice-message{width:min(100%,1050px);text-align:center;font-weight:900;line-height:1.2;animation:duty-notice-rise 8s ease-in-out both}.duty-login-notice-title{font-size:clamp(24px,3vw,44px);margin:0 0 14px}.duty-login-notice-main{font-size:clamp(30px,4.5vw,66px);margin:12px 0}.duty-login-notice-detail{font-size:clamp(18px,2vw,28px);margin:14px 0}.duty-login-notice-close{position:absolute;right:18px;top:18px;font-size:18px;font-weight:800}@keyframes duty-notice-rise{0%{transform:translateY(100vh);opacity:0}18%,80%{transform:translateY(0);opacity:1}100%{transform:translateY(-100vh);opacity:0}}@media(prefers-reduced-motion:reduce){.duty-login-notice-message{animation:none}}`),
      h('div',{className:'duty-login-notice-message',role:'status','aria-live':'polite'},
        h('p',{className:'duty-login-notice-title'},'TEMPORARY DUTY SWAP'),
        h('p',{className:'duty-login-notice-detail'},notice.name),
        h('p',{className:'duty-login-notice-main'},notice.upcoming?`You will take charge of ${notice.acting_as} duties today.`:`You are assigned ${notice.acting_as} duties.`),
        notice.upcoming&&h('p',{className:'duty-login-notice-detail'},`Starts: ${display(notice.starts_at)}`),
        h('p',{className:'duty-login-notice-detail'},`Until ${display(notice.ends_at)}`),
        h('p',{className:'duty-login-notice-detail'},'Your regular duties return automatically afterwards.')
      ),
      h('button',{type:'button',className:'btn btn-secondary duty-login-notice-close',onClick:onClose,'aria-label':'Dismiss duty assignment notice'},'Close ✕')
    );
  }
  function Page({client}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [form,setForm]=React.useState({std:'',nursing:'',start:indiaInput(new Date()),end:indiaInput(new Date(Date.now()+8*3600000)),reason:''});
    const [ending,setEnding]=React.useState(null),[endReason,setEndReason]=React.useState('');
    const lock=React.useRef(false);
    async function load(){
      const result=await client.rpc('duty_swap_workspace');
      if(result.error){setError(result.error.message);return;}
      setData(result.data);setError('');
      setForm(f=>({...f,std:f.std||result.data.candidates.find(p=>p.role==='STD')?.id||'',nursing:f.nursing||result.data.candidates.find(p=>p.role==='Manager')?.id||''}));
    }
    React.useEffect(()=>{load();const timer=setInterval(load,15000);return()=>clearInterval(timer)},[]);
    async function save(e){
      e.preventDefault();if(lock.current||!data?.can_manage)return;
      lock.current=true;setBusy(true);setError('');
      try{
        const {error}=await client.rpc('create_department_duty_swap',{p_std:form.std,p_nursing:form.nursing,p_starts_at:indiaISO(form.start),p_ends_at:indiaISO(form.end),p_reason:form.reason.trim()});
        if(error)throw error;
        setForm(f=>({...f,reason:''}));await load();window.dispatchEvent(new Event('samara-duty-swap-changed'));
      }catch(error){setError(error.message||'Unable to save assignment.')}finally{lock.current=false;setBusy(false)}
    }
    async function end(e){
      e.preventDefault();if(lock.current||!ending)return;lock.current=true;setBusy(true);
      try{
        const {error}=await client.rpc('cancel_department_duty_swap',{p_id:ending,p_reason:endReason.trim()});
        if(error)throw error;setEnding(null);setEndReason('');await load();window.dispatchEvent(new Event('samara-duty-swap-changed'));
      }catch(error){setError(error.message)}finally{lock.current=false;setBusy(false)}
    }
    const input=(label,key,type='text')=>h('label',{className:'field'},label,h('input',{type,required:true,value:form[key],onInput:e=>{const value=e.target.value;setForm(f=>({...f,[key]:value}))},onChange:e=>{const value=e.target.value;setForm(f=>({...f,[key]:value}))}}));
    const select=(label,key,role)=>h('label',{className:'field'},label,h('select',{required:true,value:form[key],onChange:e=>setForm({...form,[key]:e.target.value})},h('option',{value:''},'Select employee'),...(data?.candidates||[]).filter(p=>p.role===role).map(p=>h('option',{value:p.id,key:p.id},p.name))));
    return h('div',{className:'card'},
      h('h3',null,'Temporary Duty Swap'),
      h('p',null,'Interchange STD and Nursing Manager department responsibilities for a selected period. Regular duties return automatically at the end time, even when the ERP is closed.'),
      h('p',null,'Each employee keeps their own login, personal records and audit identity. Admin/Director authority is not transferred.'),
      error&&h('div',{className:'message error',role:'alert'},error),
      !data?h('p',null,'Loading assignments…'):null,
      data?.can_manage&&h('form',{onSubmit:save},
        h('h4',null,'Assign a period'),h('div',{className:'modal-grid'},select('Regular STD','std','STD'),select('Regular Nursing Manager','nursing','Manager'),input('Start — India time','start','datetime-local'),input('End — India time','end','datetime-local')),
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{const day=form.start.slice(0,10);const next=new Date(day+'T00:00:00+05:30');next.setTime(next.getTime()+86400000);setForm({...form,start:day+'T00:00',end:indiaInput(next)})}},'Use full selected day'),
        h('label',{className:'field'},'Reason / training purpose',h('textarea',{required:true,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value})})),
        h('p',{className:'message warning'},'All department duties and permissions will interchange during this period, including nursing oversight, Stores, Food & Diet, the STD desk and the corresponding WhatsApp access. Resolve any conflicting leave handover first.'),
        h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save Temporary Swap')
      ),
      h('h4',null,'Assignment history'),h('button',{type:'button',className:'btn btn-secondary',onClick:load,disabled:busy},'Refresh'),
      (data?.assignments||[]).map(s=>h('div',{className:'card',key:s.id,style:{marginTop:'12px'}},
        h('strong',null,s.status),h('p',null,`${s.std_name} → Nursing Manager duties; ${s.nursing_name} → STD duties`),
        h('p',null,`${display(s.starts_at)} — ${display(s.ends_at)}`),h('p',null,s.reason),h('small',null,`Assigned by ${s.created_by_name}`),
        s.cancellation_reason&&h('p',null,`Ended early: ${s.cancellation_reason}`),
        data?.can_manage&&['Active','Scheduled','Inactive employee'].includes(s.status)&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{setEnding(s.id);setEndReason('')}},s.status==='Scheduled'?'Cancel assignment':'End assignment now')
      )),
      data&&!data.assignments.length&&h('p',null,'No temporary duty swaps recorded.'),
      ending&&h('form',{className:'card',onSubmit:end},h('h4',null,'End temporary assignment'),h('p',null,'This immediately restores regular department duties.'),h('textarea',{required:true,placeholder:'Reason',value:endReason,onChange:e=>setEndReason(e.target.value)}),h('button',{className:'btn btn-primary',disabled:busy},'Confirm end'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setEnding(null),disabled:busy},'Keep assignment'))
    );
  }
  window.SamaraDutySwap={applyContext,regularProfile,useContext,useDailyNotice,Page,DailyNotice,signature,indiaISO,indiaInput};
})();
