  // 2.16.43: System Health (Admin only) — the ERP's automatic fault log (table client_errors, SQL 137 + 219).
  // Faults are grouped (same kind + same message), newest first. Filters use Apply. Every group opens its full details
  // (staff, role, page, time, version, device, detail). Admin can mark a group as resolved with a short note.
  // Recorded automatically: page crashes, JavaScript errors, failed saves, server errors, unreachable server, slow
  // requests (> 8 s) and Talk to Guest events. No Guest names, audio or clinical details are stored.
  const SYSTEM_HEALTH_KINDS={
    'page-crash':['Screen crashed','A page stopped working and showed "This page had a problem".'],
    'app-crash':['App crashed','The whole app stopped working.'],
    'window-error':['Program error','An error in the app code (the page kept working).'],
    'unhandled-rejection':['Unfinished action','An action failed in the background.'],
    'save-failed':['Save refused','The database refused a save (permission or data rule).'],
    'server-error':['Server error','The server failed to answer correctly.'],
    'network-error':['Server unreachable','The phone could not reach the server (internet).'],
    'offline':['Phone offline','The phone had no internet.'],
    'slow-request':['Slow screen','A request took longer than 8 seconds.'],
    'ttg-live-fallback':['Talk to Guest: Live unavailable','Live mode could not start or kept failing; Standard mode was used.'],
    'ttg-live-drop':['Talk to Guest: Live dropped','The live connection dropped and reconnected.'],
    'ttg-live-stall':['Talk to Guest: speech missed','People were speaking but Live heard nothing; it restarted itself.'],
    'ttg-echo':['Talk to Guest: echo','The translation was heard again by the microphone; muting was made stronger automatically.'],
    'ttg-auto-pause':['Talk to Guest: wait increased','Speech was cut too often; the wait after the speaker stops was increased automatically.'],
    'ttg-not-caught':['Talk to Guest: not understood','Several sentences in a row were not understood.'],
    'ttg-slow':['Talk to Guest: slow translation','A translation took longer than 7 seconds.'],
    'ttg-error':['Talk to Guest: error','Translation failed.'],
    'ttg-mic':['Talk to Guest: microphone','The microphone could not be opened.']
  };
  function SystemHealth({profile}){
    const isAdmin=profile?.role==='Admin';
    const [period,setPeriod]=React.useState('week');
    const [from,setFrom]=React.useState('');
    const [to,setTo]=React.useState('');
    const [showResolved,setShowResolved]=React.useState('open');
    const filters=useAppliedFilters({period,from,to,showResolved});
    const [rows,setRows]=React.useState([]);
    const [staff,setStaff]=React.useState({});
    const [loading,setLoading]=React.useState(false);
    const [error,setError]=React.useState('');
    const [open,setOpen]=React.useState(null);
    const [note,setNote]=React.useState('');
    const [saving,setSaving]=React.useState(false);
    const [canResolve,setCanResolve]=React.useState(true);
    const range=f=>{
      const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);
      if(f.period==='today')return [start,now];
      if(f.period==='week'){start.setDate(start.getDate()-6);return [start,now];}
      if(f.period==='month'){start.setDate(1);return [start,now];}
      const a=f.from?new Date(`${f.from}T00:00:00`):start,b=f.to?new Date(`${f.to}T23:59:59`):now;return [a,b];
    };
    const load=React.useCallback(async()=>{
      if(!isAdmin)return;setLoading(true);setError('');
      try{
        const [a,b]=range(filters.applied);
        const {data,error:e}=await client.from('client_errors').select('*').gte('created_at',a.toISOString()).lte('created_at',b.toISOString()).order('created_at',{ascending:false}).limit(2000);
        if(e)throw e;
        const list=data||[];setRows(list);
        setCanResolve(!list.length||list.some(x=>Object.prototype.hasOwnProperty.call(x,'resolved_at'))); // column exists once SQL 219 is run
        const ids=[...new Set(list.map(r=>r.user_id).filter(Boolean))];
        if(ids.length){const {data:ps}=await client.from('profiles').select('id,auth_user_id,full_name,role').or(`id.in.(${ids.join(',')}),auth_user_id.in.(${ids.join(',')})`);const m={};(ps||[]).forEach(p=>{m[p.id]=p;if(p.auth_user_id)m[p.auth_user_id]=p;});setStaff(m);}
      }catch(e){setError(e.message||'Could not load the fault log.');}
      finally{setLoading(false);}
    },[isAdmin,JSON.stringify(filters.applied)]);
    React.useEffect(()=>{load();},[load]);
    if(!isAdmin)return h('div',{className:'section-card'},h('h3',null,'System Health'),h('p',null,'This page is restricted to the Administrator.'));

    // Group same kind + same message (numbers inside messages ignored), newest first.
    const norm=t=>String(t||'').replace(/\d+(\.\d+)?/g,'#').slice(0,220);
    const groups=[];const byKey=new Map();
    for(const r of rows){
      const k=r.kind+'|'+norm(r.message);let g=byKey.get(k);
      if(!g){g={key:k,kind:r.kind,message:r.message,items:[],pages:new Set(),roles:new Set(),versions:new Set(),users:new Set()};byKey.set(k,g);groups.push(g);}
      g.items.push(r);if(r.page)g.pages.add(r.page);if(r.app_version)g.versions.add(r.app_version);if(r.user_id){g.users.add(r.user_id);const p=staff[r.user_id];if(p?.role)g.roles.add(p.role);}
    }
    groups.forEach(g=>{g.open=g.items.filter(x=>!x.resolved_at).length;g.last=g.items[0].created_at;g.first=g.items[g.items.length-1].created_at;});
    const shown=groups.filter(g=>filters.applied.showResolved==='all'||(filters.applied.showResolved==='open'?g.open>0:g.open===0));
    const label=k=>(SYSTEM_HEALTH_KINDS[k]||[k||'Fault'])[0];
    const explain=k=>(SYSTEM_HEALTH_KINDS[k]||[,''])[1];
    const tone=k=>/crash|server|save-failed|ttg-error|fallback/.test(k||'')?'#b01264':/slow|stall|echo|not-caught|network|offline|drop/.test(k||'')?'#b7791f':'#087667';
    const openGroups=groups.filter(g=>g.open>0).length;
    const people=new Set(rows.map(r=>r.user_id).filter(Boolean)).size;
    const topPage=(()=>{const c={};rows.forEach(r=>{if(r.page)c[r.page]=(c[r.page]||0)+1;});return Object.entries(c).sort((a,b)=>b[1]-a[1])[0];})();

    async function resolve(g){
      if(!note.trim()){setError('Please write a short note on what was fixed.');return;}
      setSaving(true);setError('');
      try{
        const {data:{user}}=await client.auth.getUser();
        const ids=g.items.filter(x=>!x.resolved_at).map(x=>x.id);
        for(let i=0;i<ids.length;i+=100){const {error:e}=await client.from('client_errors').update({resolved_at:new Date().toISOString(),resolved_by:user?.id||null,resolution_note:note.trim().slice(0,500)}).in('id',ids.slice(i,i+100));if(e)throw e;}
        setNote('');setOpen(null);await load();
      }catch(e){setError(/resolved|column|permission|policy/i.test(e.message||'')?'Marking as resolved needs SQL 219 to be run once in Supabase.':(e.message||'Could not save.'));}
      finally{setSaving(false);}
    }
    const tile=(title,value,sub,color)=>h('div',{className:'section-card',style:{padding:14,borderLeft:`5px solid ${color||'#5d1039'}`}},h('small',null,title),h('div',{style:{fontSize:26,fontWeight:800,margin:'4px 0'}},value),h('small',{style:{color:'#78636f'}},sub));
    const g=open&&groups.find(x=>x.key===open);

    return h('div',{className:'stack system-health-page'},
      h('div',{className:'page-hero'},h('div',null,h('div',{className:'eyebrow'},'ADMIN / APPLICATION'),h('h2',null,'System Health'),
        h('p',null,'Problems the ERP noticed by itself while staff were using it: crashes, failed saves, server errors, slow screens and Talk to Guest issues. No Guest names, audio or medical details are recorded.'))),
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}},
        tile('Faults in period',rows.length,'all recorded events',rows.length?'#b7791f':'#087667'),
        tile('Open problems',openGroups,'different problems not yet resolved',openGroups?'#b01264':'#087667'),
        tile('Staff affected',people,'people who met a problem'),
        tile('Most affected page',topPage?topPage[0]:'—',topPage?topPage[1]+' events':'no events')),
      h('div',{className:'section-card',style:{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}},
        h('label',null,h('small',null,'Period'),h('select',{className:'input',value:period,onChange:e=>setPeriod(e.target.value)},
          h('option',{value:'today'},'Today'),h('option',{value:'week'},'This Week (7 days)'),h('option',{value:'month'},'This Month'),h('option',{value:'custom'},'Selected period'))),
        period==='custom'&&h('label',null,h('small',null,'From'),h('input',{className:'input',type:'date',value:from,onChange:e=>setFrom(e.target.value)})),
        period==='custom'&&h('label',null,h('small',null,'To'),h('input',{className:'input',type:'date',value:to,onChange:e=>setTo(e.target.value)})),
        h('label',null,h('small',null,'Show'),h('select',{className:'input',value:showResolved,onChange:e=>setShowResolved(e.target.value)},
          h('option',{value:'open'},'Open problems'),h('option',{value:'resolved'},'Resolved'),h('option',{value:'all'},'All'))),
        h(ApplyFilterButton,{dirty:filters.dirty,onApply:filters.apply}),
        h('button',{type:'button',className:'btn btn-secondary',onClick:load,disabled:loading},loading?'Loading…':'↻ Refresh')),
      error&&h('div',{className:'section-card',style:{color:'#b01264'}},error),
      !canResolve&&h('div',{className:'section-card',style:{background:'#fff6fa'}},'Run supabase/sql/219_system_health.sql once in Supabase → SQL Editor to enable details and "Mark resolved".'),
      !loading&&!shown.length&&h('div',{className:'section-card',style:{textAlign:'center',color:'#087667',padding:30}},filters.applied.showResolved==='open'?'✓ No open problems in this period.':'Nothing to show for this period.'),
      shown.map(x=>h('button',{key:x.key,type:'button',className:'section-card',onClick:()=>{setOpen(open===x.key?null:x.key);setNote('');},
          style:{textAlign:'left',width:'100%',cursor:'pointer',borderLeft:`5px solid ${tone(x.kind)}`,display:'block'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}},
          h('strong',{style:{color:tone(x.kind)}},label(x.kind)),
          h('span',{style:{fontWeight:700}},x.items.length+'×'+(x.open?'':' · resolved'))),
        h('div',{style:{margin:'6px 0',overflowWrap:'anywhere'}},x.message),
        h('small',{style:{color:'#78636f'}},'Last: '+formatDateTimeIN(x.last)+' · First: '+formatDateTimeIN(x.first)+(x.pages.size?' · Page: '+[...x.pages].slice(0,3).join(', '):'')+(x.roles.size?' · Role: '+[...x.roles].join(', '):'')))),
      g&&h('div',{className:'section-card',style:{border:'2px solid #5d1039'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',gap:10}},h('h3',{style:{margin:0}},label(g.kind)),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setOpen(null)},'Close')),
        h('p',{style:{color:'#78636f'}},explain(g.kind)),
        h('p',{style:{overflowWrap:'anywhere'}},h('strong',null,'Message: '),g.message),
        h('p',null,h('strong',null,'Versions: '),[...g.versions].join(', ')||'—',' · ',h('strong',null,'Staff affected: '),g.users.size),
        g.open?h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',margin:'10px 0'}},
          h('input',{className:'input',style:{flex:'1 1 260px'},placeholder:'What was fixed / why it can be closed',value:note,onChange:e=>setNote(e.target.value)}),
          h('button',{type:'button',className:'btn btn-primary',disabled:saving||!canResolve,onClick:()=>resolve(g)},saving?'Saving…':'✓ Mark resolved'))
          :h('p',{style:{color:'#087667'}},'Resolved'+(g.items[0].resolution_note?': '+g.items[0].resolution_note:'')+(g.items[0].resolved_at?' ('+formatDateTimeIN(g.items[0].resolved_at)+')':'')),
        h('div',{style:{overflowX:'auto'}},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Date & time','Staff','Role','Page','Version','Details'].map(t=>h('th',{key:t},t)))),
          h('tbody',null,g.items.slice(0,50).map(r=>{const p=staff[r.user_id]||{};return h('tr',{key:r.id},
            h('td',null,formatDateTimeIN(r.created_at)),h('td',null,p.full_name||'—'),h('td',null,p.role||'—'),h('td',null,r.page||'—'),h('td',null,r.app_version||'—'),
            h('td',{style:{fontSize:12,maxWidth:420,overflowWrap:'anywhere'}},r.detail?Object.entries(r.detail).map(([k,v])=>k+': '+(typeof v==='object'?JSON.stringify(v):v)).join(' · '):(r.stack?String(r.stack).split('\n')[0]:'—')));})))),
        g.items.length>50&&h('small',null,'Showing the latest 50 of '+g.items.length+'.'))
    );
  }
