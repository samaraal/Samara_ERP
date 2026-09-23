  function GeneralHandoverWorklist({profile}){
    const [rows,setRows]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [busyId,setBusyId]=React.useState('');
    const priorityRank={Critical:0,Important:1,Routine:2};

    async function load(){
      const {data,error}=await client.from('general_handover_tasks')
        .select('*')
        .in('status',['Pending','In Progress'])
        .order('created_at',{ascending:false})
        .limit(100);
      if(error){
        console.warn('General handover worklist could not be loaded:',error.message);
        setRows([]);setMessage('General handover worklist is unavailable. Please install the accompanying SQL once.');setLoading(false);return;
      }
      const sorted=[...(data||[])].sort((a,b)=>(priorityRank[a.priority]??3)-(priorityRank[b.priority]??3)||new Date(a.created_at||0)-new Date(b.created_at||0));
      setRows(sorted);setMessage('');setLoading(false);
    }

    React.useEffect(()=>{
      load();
      const ch=client.channel(`general-handover-${profile?.id||'user'}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'general_handover_tasks'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[profile?.id]);

    async function setStatus(row,status){
      if(busyId)return;
      setBusyId(row.id);setMessage('');
      const updates={status,updated_at:new Date().toISOString()};
      if(status==='Completed'){updates.completed_by=profile.id;updates.completed_at=new Date().toISOString()}
      const {error}=await client.from('general_handover_tasks').update(updates).eq('id',row.id);
      if(error)setMessage(error.message||'Unable to update the general task.');
      else{
        writeAuditEvent(`General Handover Task ${status}`,'General Handover',row.id,{department:row.department,task_text:row.task_text,status},'Success');
        await load();
      }
      setBusyId('');
    }

    return h(Section,{title:`General Priority Worklist${rows.length?` (${rows.length})`:''}`,subtitle:'Housekeeping, Maintenance and Operations tasks from Shift Handover'},
      h('div',{className:'general-handover-toolbar'},
        h('span',null,'Visible to all authorised role players'),
        h('button',{type:'button',className:'btn btn-secondary',onClick:load,disabled:loading},loading?'Loading…':'Refresh')
      ),
      message&&h('div',{className:'message error'},message),
      !loading&&!message&&!rows.length?h('div',{className:'clinical-empty'},'No open general handover tasks.'):
      h('div',{className:'general-handover-list'},rows.map((row,index)=>
        h('div',{className:`general-handover-row priority-${String(row.priority||'Routine').toLowerCase()}`,key:row.id},
          h('span',{className:'general-handover-number'},index+1),
          h('div',{className:'general-handover-detail'},
            h('div',{className:'general-handover-meta'},
              h('strong',null,row.department||'Operations'),
              h('span',{className:'general-handover-priority'},row.priority||'Routine'),
              h('span',{className:'general-handover-status'},row.status||'Pending')
            ),
            h('p',null,row.task_text),
            h(TamilAssist,{text:row.task_text,context:'General Handover'}),
            h('small',null,`${row.shift||'Shift'} · ${fmt(row.created_at)}`)
          ),
          h('div',{className:'general-handover-actions'},
            row.status==='Pending'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busyId===row.id,onClick:()=>setStatus(row,'In Progress')},'Start'),
            h('button',{type:'button',className:'btn btn-primary',disabled:busyId===row.id,onClick:()=>setStatus(row,'Completed')},busyId===row.id?'Saving…':'Complete')
          )
        )
      ))
    );
  }

  function SystemMaintenance({profile}){
    const [checking,setChecking]=React.useState(false);
    const isAdmin=profile?.role==='Admin';
    const runUpdateCheck=()=>{
      setChecking(true);
      try{
        if(typeof window.samaraCheckForUpdate==='function')window.samaraCheckForUpdate();
        else samaraOpenAppHelp();
      }finally{window.setTimeout(()=>setChecking(false),1400)}
    };
    if(!isAdmin)return h('div',{className:'section-card'},h('h3',null,'System Maintenance'),h('p',null,'This page is restricted to the Administrator.'));
    const serviceWorkerState=!('serviceWorker' in navigator)?'Not supported':(navigator.serviceWorker.controller?'Active':'Not controlling this page');
    const online=navigator.onLine?'Online':'Offline';
    return h('div',{className:'stack system-maintenance-page'},
      h('div',{className:'page-hero system-maintenance-hero'},
        h('div',null,h('div',{className:'eyebrow'},'ADMIN / APPLICATION'),h('h2',null,'System Maintenance'),h('p',null,'Safe application update, recovery and diagnostic controls. Patient, clinical and billing records are not altered here.'))
      ),
      h('div',{className:'system-maintenance-grid'},
        h('section',{className:'section-card system-maintenance-card'},h('span',{className:'system-maintenance-icon'},'↻'),h('h3',null,'Application Update'),h('p',null,'Check whether a newer Samara ERP build is available.'),h('button',{type:'button',className:'btn btn-primary',disabled:checking,onClick:runUpdateCheck},checking?'Checking…':'Check for Updates')),
        h('section',{className:'section-card system-maintenance-card'},h('span',{className:'system-maintenance-icon'},'⚙'),h('h3',null,'App Help & Repair'),h('p',null,'Open the safe reload and cache-repair controls. Supabase data will not be deleted.'),h('button',{type:'button',className:'btn btn-secondary',onClick:samaraOpenAppHelp},'Open App Help / Repair')),
        h('section',{className:'section-card system-maintenance-card'},h('span',{className:'system-maintenance-icon'},'⟳'),h('h3',null,'Reload Application'),h('p',null,'Reload the current application files without changing stored records.'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>window.location.reload()},'Reload Samara ERP'))
      ),
      h('section',{className:'section-card system-information-card'},
        h('h3',null,'System Information'),
        h('div',{className:'system-information-grid'},
          h('div',null,h('small',null,'ERP Version'),h('strong',null,APP_VERSION)),
          h('div',null,h('small',null,'Build'),h('strong',null,APP_BUILD_DATE)),
          h('div',null,h('small',null,'Schema'),h('strong',null,APP_SCHEMA_VERSION)),
          h('div',null,h('small',null,'Network'),h('strong',{className:navigator.onLine?'system-ok':'system-warn'},online)),
          h('div',null,h('small',null,'Service Worker'),h('strong',null,serviceWorkerState)),
          h('div',null,h('small',null,'Signed-in Role'),h('strong',null,profile.role))
        )
      )
    );
  }

