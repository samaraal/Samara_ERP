  function ClinicalAlertsPage({engine,setPage}){
    const mobileClinicalDevice=isMobileClinicalDevice();
    const [filter,setFilter]=React.useState(()=>{
      try{
        const requested=sessionStorage.getItem('samaraClinicalAlertFilter');
        if(requested)sessionStorage.removeItem('samaraClinicalAlertFilter');
        return requested||'All';
      }catch(_){return 'All'}
    });
    const [dashboardFocus,setDashboardFocus]=React.useState(()=>{
      try{
        const value=sessionStorage.getItem('samara-clinical-alert-focus')||'';
        sessionStorage.removeItem('samara-clinical-alert-focus');
        return ['Medication','Daily Care'].includes(value)?value:'';
      }catch(_error){return ''}
    });
    const [escalatedKeys,setEscalatedKeys]=React.useState(new Set());
    const [loadingEscalations,setLoadingEscalations]=React.useState(false);

    async function refreshEscalations(){
      setLoadingEscalations(true);
      try{
        const {data,error}=await client.from('clinical_alert_escalations')
          .select('alert_key,resolved_at')
          .is('resolved_at',null)
          .limit(500);
        if(error)throw error;
        setEscalatedKeys(new Set((data||[]).map(x=>String(x.alert_key||'')).filter(Boolean)));
      }catch(e){
        console.warn('Nurse escalation status:',e?.message||e);
        setEscalatedKeys(new Set());
      }finally{
        setLoadingEscalations(false);
      }
    }

    React.useEffect(()=>{refreshEscalations()},[]);

    async function refreshAll(){
      await engine.refresh();
      await refreshEscalations();
    }

    function openClinicalTask(a){
      const page=a.target_page||'Clinical Alerts';
      if(page==='Clinical Alerts'){setPage(page);return;}
      const context={
        page,
        return_page:'Clinical Alerts',
        patient_id:a.patient_id||'',
        source_id:a.source_id||'',
        alert_key:a.key||'',
        alert_type:a.alert_type||'',
        from_escalation:Boolean(a.isEscalated)
      };
      if(page==='Medicines'){
        context.order_id=a.source_id||'';
        const due=new Date(a.due_at);
        if(!Number.isNaN(due.getTime()))context.scheduled_time=`${String(due.getHours()).padStart(2,'0')}:${String(due.getMinutes()).padStart(2,'0')}`;
      }else if(page==='Daily Care'){
        context.care_order_id=a.source_id||'';
        context.care_type=String(a.title||'').replace(/^Daily Care Due:\s*/i,'')||'Daily Care';
      }else if(page==='Physiotherapy'){
        context.plan_id=a.source_id||'';
      }
      saveTaskNavigationContext(context);
      setPage(page);
    }

    const allRows=(engine.alerts||[]).map(a=>({
      ...a,
      // Engine status is authoritative; legacy alert_key lookup remains fallback only.
      isEscalated:Boolean(a.is_escalated)||escalatedKeys.has(String(a.key||'')),
      isOverdue:Number(a.overdue_minutes||0)>0
    }));

    const rows=allRows.filter(a=>{
      const focusMatch=!dashboardFocus||
        (dashboardFocus==='Medication'&&(
          String(a.target_page||'')==='Medicines'||
          /medicat|medicine/i.test(`${a.alert_type||''} ${a.title||''}`)
        ))||
        (dashboardFocus==='Daily Care'&&(
          String(a.target_page||'')==='Daily Care'||
          /daily care|care due/i.test(`${a.alert_type||''} ${a.title||''}`)
        ));
      if(!focusMatch)return false;
      if(filter==='All')return true;
      if(filter==='Escalated')return a.isEscalated;
      if(filter==='Overdue')return a.isOverdue&&!a.isEscalated;
      if(filter==='Due now')return !a.isOverdue&&!a.isEscalated;
      return a.priority===filter;
    });

    const escalatedCount=allRows.filter(a=>a.isEscalated).length;
    const overdueCount=allRows.filter(a=>a.isOverdue&&!a.isEscalated).length;
    const dueNowCount=allRows.filter(a=>!a.isOverdue&&!a.isEscalated).length;
    const regularisationCount=allRows.filter(a=>String(a.alert_type||'').toLowerCase()==='regularisation').length;

    return h('div',{className:'director-office-theme'},
      h('style',null,`
        .director-office-theme{
          background:
            radial-gradient(circle at 88% 4%, rgba(218,61,125,.10), transparent 28%),
            radial-gradient(circle at 8% 18%, rgba(246,190,214,.17), transparent 24%);
          border-radius:22px;
        }
        .director-office-theme > .card.panel{
          background:linear-gradient(145deg,#fff8fb 0%,#fdf0f5 52%,#f9e4ed 100%);
          border:1px solid #ebc2d2;
          box-shadow:0 10px 28px rgba(112,16,60,.07);
        }
        .director-office-theme > .card.panel:first-of-type{
          background:linear-gradient(135deg,#fff8fb 0%,#fdeaf1 48%,#f6d8e4 100%);
        }
        .director-office-theme .panel-head h3{
          color:#6f103d;
        }
        .director-office-theme .btn-secondary{
          background:#f9e3ec;
          border-color:#e9bfd0;
          color:#7d1547;
        }
        .director-office-theme .btn-secondary:hover{
          background:#f4cedd;
        }
        .director-office-theme input,
        .director-office-theme select,
        .director-office-theme textarea{
          background:#fffafb;
          border-color:#dfb8c8;
        }
        .director-office-theme .empty{
          color:#7f6a74;
        }
        @media(max-width:700px){
          .director-office-theme{border-radius:14px}
        }
      `),
      h(Section,{title:dashboardFocus?`${dashboardFocus} Actions`:'Clinical Alerts',subtitle:dashboardFocus?`Dashboard view · ${dashboardFocus} actions currently due / pending`:'Nursing action dashboard — escalated items first, then overdue and due items',
        actions:h('div',{className:'employee-actions'},
          dashboardFocus&&h('button',{className:'btn btn-secondary',onClick:()=>setDashboardFocus('')},'Show All Clinical Alerts'),
          h('button',{className:'btn btn-secondary',onClick:refreshAll},loadingEscalations?'Refreshing…':'Refresh'),
          !mobileClinicalDevice&&h('button',{
          className:'btn btn-secondary',
          style:{
            background:engine.soundUnlocked?'#dff3e4':'#fde2e2',
            color:engine.soundUnlocked?'#176b35':'#9b1c1c',
            border:engine.soundUnlocked?'1px solid #b9dfc4':'1px solid #f3bcbc'
          },
          onClick:engine.toggleSound,
          title:engine.soundUnlocked?'Click to disable alert sound and automatic voice':'Click to enable alert sound and automatic voice'
        },engine.soundUnlocked?'✓ Sound Enabled':'Enable Sound'),
          h('div',{
            style:{
              display:'grid',
              gridTemplateColumns:'1fr',
              gap:'8px',
              width:'100%'
            }
          },
            h('button',{
              className:'btn',
              style:{
                width:'100%',
                background:'#dff3e4',
                color:'#176b35',
                border:'2px solid #8fc69d',
                fontWeight:'800',
                opacity:engine.pushEnabled?1:0.92
              },
              disabled:engine.pushEnabled,
              onClick:engine.requestNotifications,
              title:engine.pushEnabled
                ?'Mobile notifications are enabled on this phone.'
                :'Tap to enable mobile notifications on this phone.'
            },engine.pushEnabled
                ?(mobileClinicalDevice?'✓ Mobile Notifications Enabled':'✓ Browser Alerts Enabled')
                :(mobileClinicalDevice?'Enable Mobile Notifications':'Enable Browser Alerts')),

            h('button',{
              className:'btn',
              style:{
                width:'100%',
                background:'#fde2e2',
                color:'#9b1c1c',
                border:'2px solid #e9a5a5',
                fontWeight:'800',
                opacity:engine.pushEnabled?1:0.92
              },
              disabled:!engine.pushEnabled,
              onClick:engine.disableNotifications,
              title:engine.pushEnabled
                ?'Tap to disable mobile notifications on this phone.'
                :'Mobile notifications are disabled on this phone.'
            },engine.pushEnabled
                ?(mobileClinicalDevice?'Disable Mobile Notifications':'Disable Browser Alerts')
                :(mobileClinicalDevice?'✕ Mobile Notifications Disabled':'✕ Browser Alerts Disabled'))
          ),
          h('button',{className:'btn btn-primary',onClick:engine.testClinicalAlert},'🔔 Test Alert'),
          !mobileClinicalDevice&&h('button',{className:'btn btn-secondary',onClick:engine.runAudioDiagnostics},'🔊 Audio Diagnostics'),
          !mobileClinicalDevice&&h('button',{className:'btn btn-secondary',onClick:engine.testVitalsVoice},'▶ Test Vitals Voice'),
          !mobileClinicalDevice&&h('button',{className:'btn btn-secondary',onClick:engine.testDailyCareVoice},'▶ Test Daily Care Voice'),
          !mobileClinicalDevice&&h('button',{className:'btn btn-secondary',onClick:engine.testClinicalTaskVoice},'▶ Test Clinical Task Voice'),
          !mobileClinicalDevice&&h('button',{className:'btn btn-secondary',onClick:engine.testSampleEscalationVoice},'▶ Sample Escalation Voice'),
          !mobileClinicalDevice&&h('button',{className:'btn btn-primary',onClick:engine.playCurrentLiveEscalation},'▶ Play Current Live Escalation')
        )},
        h('div',{className:'grid stats'},
          h('button',{type:'button',className:'card stat clinical-red',onClick:()=>setFilter('Escalated'),title:'Show escalated alerts'},h('span',null,'Escalated'),h('strong',null,escalatedCount),h('small',null,'Requires immediate nursing action')),
          h('button',{type:'button',className:'card stat clinical-amber',onClick:()=>setFilter('Overdue'),title:'Show overdue alerts'},h('span',null,'Overdue'),h('strong',null,overdueCount),h('small',null,'Not yet escalated')),
          h('button',{type:'button',className:'card stat clinical-blue',onClick:()=>setFilter('Due now'),title:'Show due-now alerts'},h('span',null,'Due now'),h('strong',null,dueNowCount),h('small',null,'Current actionable items')),
          h('button',{type:'button',className:'card stat',onClick:()=>setFilter('All'),title:'Show all alerts including regularisation'},h('span',null,'Regularisation'),h('strong',null,regularisationCount),h('small',null,'One consolidated historical backlog'))
        ),
        h('div',{className:'field',style:{maxWidth:'300px',marginTop:'14px'}},
          h('label',null,'View'),
          h('select',{value:filter,onChange:e=>setFilter(e.target.value)},
            ['All','Escalated','Overdue','Due now','Critical','Urgent','Routine'].map(x=>h('option',{key:x,value:x},x))
          )
        )
      ),
      h(LogTable,{title:`Active Alerts (${rows.length})`,subtitle:'Complete the underlying clinical task; management resolution is not available to Nursing',
        heads:['Status','Priority','Patient','Room','Alert','Due','Overdue','Details','Action'],
        rows:rows
          .sort((a,b)=>(Number(b.isEscalated)-Number(a.isEscalated))||(Number(b.overdue_minutes||0)-Number(a.overdue_minutes||0)))
          .map(a=>[
            h('span',{className:'badge',style:a.isEscalated?{background:'#fdecec',color:'#b42318'}:a.isOverdue?{background:'#fff4dd',color:'#9a6700'}:{background:'#eef5ff',color:'#175cd3'}},
              a.isEscalated?'ESCALATED':a.isOverdue?'OVERDUE':'DUE NOW'),
            h('span',{className:'badge',style:a.priority==='Critical'?{background:'#fdecec',color:'#b42318'}:a.priority==='Urgent'?{background:'#fff4dd',color:'#9a6700'}:{background:'#eef5ff',color:'#175cd3'}},a.priority),
            a.patient_name||'—',
            a.room_label||'—',
            a.title,
            fmt(a.due_at),
            Number(a.overdue_minutes)>0?englishOverdueLabel(a.overdue_minutes):'Due now',
            a.description||'—',
            h('div',{className:'employee-actions'},
              h('button',{className:'btn btn-primary',onClick:()=>openClinicalTask(a)},a.alert_type==='Regularisation'?'Review':'Complete / Record'),
              a.alert_type!=='Regularisation'&&!a.isEscalated&&h('button',{className:'btn btn-secondary',onClick:()=>engine.acknowledge(a,'Snoozed',5)},'Snooze 5'),
              a.alert_type==='Regularisation'&&h('button',{className:'btn btn-secondary',onClick:()=>engine.acknowledge(a,'Acknowledged',0)},'Regularise Backlog')
            )
          ])
      })
    );
  }

  function ClinicalEscalationsDashboard({profile,onNavigate}){
    const [rows,setRows]=React.useState([]),[patients,setPatients]=React.useState({}),[filter,setFilter]=React.useState(()=>{
      try{
        const value=sessionStorage.getItem('samara-escalation-filter')||'';
        sessionStorage.removeItem('samara-escalation-filter');
        return value==='open'?'Open':'Open';
      }catch(_error){return 'Open'}
    }),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
    const [dashboardEscalationFocus,setDashboardEscalationFocus]=React.useState('Open escalations');
    const canView=['Admin','Manager'].includes(profile?.role);
    const targetForType=type=>{
      const t=String(type||'').toLowerCase();
      if(t.includes('med'))return 'Medicines';
      if(t.includes('vital'))return 'Vital Signs';
      if(t.includes('care'))return 'Daily Care';
      if(t.includes('physio'))return 'Physiotherapy';
      if(t.includes('regular'))return 'Clinical Alerts';
      return 'Clinical Alerts';
    };
    async function load(){
      if(!canView)return;
      setBusy(true);setMessage('');
      try{
        await client.rpc('process_clinical_alert_escalations');
        const [esc,pat]=await Promise.all([
          client.from('clinical_alert_escalations').select('*').order('created_at',{ascending:false}).limit(300),
          client.from('patients').select('id,full_name,patient_id,room_no,bed_no,is_active')
        ]);
        if(esc.error)throw esc.error;
        if(pat.error)throw pat.error;
        const map={};(pat.data||[]).forEach(p=>map[p.id]=p);setPatients(map);setRows(esc.data||[]);
      }catch(e){setMessage(e.message||String(e))}finally{setBusy(false)}
    }
    React.useEffect(()=>{load()},[]);
    React.useEffect(()=>{
      if(!initialView)return;
      const target=initialView==='balance'?'patient-received-balance':'patient-raise-indent';
      setTimeout(()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}),120);
    },[initialView]);
    async function resolve(row){
      const remarks=window.prompt('Enter resolution / corrective action taken (mandatory):','');
      if(remarks===null)return;
      if(String(remarks).trim().length<5){alert('Please enter a meaningful resolution remark.');return}
      setBusy(true);setMessage('');
      const {error}=await client.rpc('resolve_clinical_escalation',{p_escalation_id:row.id,p_resolution_remarks:String(remarks).trim(),p_resolution_action:'Resolved'});
      setBusy(false);
      if(error){setMessage(error.message);return}
      await load();
    }
    if(!canView)return h(Section,{title:'Clinical Escalations'},h('div',{className:'message error'},'Clinical Escalations are available only to Manager and Administrator.'));
    const unresolved=rows.filter(r=>!r.resolved_at);
    const visible=(rows.filter(r=>filter==='All'||(filter==='Open'?!r.resolved_at:!!r.resolved_at))).filter(r=>{
      if(dashboardEscalationFocus==='Critical')return !r.resolved_at&&String(r.priority||'').toLowerCase()==='critical';
      if(dashboardEscalationFocus==='Medication')return !r.resolved_at&&String(r.alert_type||'').toLowerCase().includes('med');
      if(dashboardEscalationFocus==='Regularisation')return !r.resolved_at&&String(r.alert_type||'').toLowerCase()==='regularisation';
      if(dashboardEscalationFocus==='Open escalations')return !r.resolved_at;
      return true;
    });
    const critical=unresolved.filter(r=>String(r.priority||'').toLowerCase()==='critical').length;
    const medication=unresolved.filter(r=>String(r.alert_type||'').toLowerCase().includes('med')).length;
    const regularisation=unresolved.filter(r=>String(r.alert_type||'').toLowerCase()==='regularisation').length;
    return h(React.Fragment,null,
      h(Section,{title:'Clinical Escalations',subtitle:'Manager / Administrator oversight of unresolved clinical alerts after escalation threshold',actions:h('button',{className:'btn btn-secondary',disabled:busy,onClick:load},busy?'Refreshing…':'Refresh')},
        message&&h('div',{className:'message error'},message),
        h('div',{className:'grid stats'},
          h('button',{type:'button',className:'card stat clinical-red',onClick:()=>setDashboardEscalationFocus('Open escalations')},h('span',null,'Open escalations'),h('strong',null,unresolved.length),h('small',null,'Requires management oversight')),
          h('button',{type:'button',className:'card stat clinical-red',onClick:()=>setDashboardEscalationFocus('Critical')},h('span',null,'Critical'),h('strong',null,critical),h('small',null,'Critical unresolved items')),
          h('button',{type:'button',className:'card stat clinical-amber',onClick:()=>setDashboardEscalationFocus('Medication')},h('span',null,'Medication'),h('strong',null,medication),h('small',null,'Medication escalations')),
          h('button',{type:'button',className:'card stat clinical-blue',onClick:()=>setDashboardEscalationFocus('Regularisation')},h('span',null,'Regularisation'),h('strong',null,regularisation),h('small',null,'One-time historical backlog'))
        ),
        h('div',{className:'field',style:{maxWidth:'260px',marginTop:'14px'}},h('label',null,'Status'),h('select',{value:filter,onChange:e=>setFilter(e.target.value)},['Open','Resolved','All'].map(x=>h('option',{key:x,value:x},x))))
      ),
      h(LogTable,{title:`Escalation Register (${visible.length})`,subtitle:'Open source item, review corrective action, and close only after resolution',
        heads:['Status','Type','Patient','Room / Bed','Priority','Escalated At','Elapsed','Reason','Resolution','Action'],
        rows:visible.map(r=>{
          const p=patients[r.patient_id]||{};
          const elapsed=Math.max(0,Math.floor((Date.now()-new Date(r.created_at).getTime())/60000));
          return [
            h('span',{className:'badge',style:r.resolved_at?{background:'#eef5f2',color:'#17624b'}:{background:'#fdecec',color:'#b42318'}},r.resolved_at?'Resolved':'Open'),
            r.alert_type||'Clinical',
            p.full_name|| (r.alert_type==='Regularisation'?'All current patients':'—'),
            p.id?`Room ${p.room_no||'—'}${p.bed_no?'-'+p.bed_no:''}`:'—',
            r.priority||'—',fmt(r.created_at),r.resolved_at?'—':`${elapsed} min`,r.escalation_reason||'—',
            r.resolved_at?`${r.resolution_action||'Resolved'} · ${r.resolution_remarks||'—'}${r.resolved_at?` · ${fmt(r.resolved_at)}`:''}`:'Pending management resolution',
            h('div',{className:'employee-actions'},
              h('button',{className:'btn btn-secondary',onClick:()=>onNavigate(targetForType(r.alert_type))},'Open Source'),
              !r.resolved_at&&h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>resolve(r)},'Mark Resolved')
            )
          ];
        })
      })
    );
  }

  function AlertSettings({profile,engine}){
    const [form,setForm]=React.useState(engine.settings);
    const [toast,setToast]=React.useState(null);
    React.useEffect(()=>setForm(engine.settings),[engine.settings]);
    async function save(e){
      e.preventDefault();
      const {data:{user}}=await client.auth.getUser();
      const payload={...form,setting_key:'global',is_active:true,updated_by:user?.id||profile.id,updated_at:new Date().toISOString()};
      const {error}=await client.from('clinical_alert_settings').upsert(payload,{onConflict:'setting_key'});
      if(error){setToast({type:'error',text:error.message});return}
      engine.setSettings(payload);setToast({type:'success',text:'Clinical alert settings saved.'});
    }
    if(profile?.role!=='Admin')return h(Section,{title:'Alert Settings'},h('div',{className:'message error'},'Administrator access is required.'));
    return h(React.Fragment,null,
      h(Section,{title:'Clinical Alert Settings',subtitle:'Sound, voice, repeat interval and escalation thresholds'},
        h('form',{className:'modal-grid',onSubmit:save},
          h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!form.sound_enabled,onChange:e=>setForm({...form,sound_enabled:e.target.checked})}),h('span',null,'Sound alerts')),
          h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!form.voice_enabled,onChange:e=>setForm({...form,voice_enabled:e.target.checked})}),h('span',null,'Voice announcements')),
          h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!form.browser_notifications_enabled,onChange:e=>setForm({...form,browser_notifications_enabled:e.target.checked})}),h('span',null,'Browser notifications')),
          miniInput('Medicine lead minutes',form.medicine_lead_minutes,v=>setForm({...form,medicine_lead_minutes:Number(v)}),true,'number'),
          miniInput('Vitals lead minutes',form.vitals_lead_minutes,v=>setForm({...form,vitals_lead_minutes:Number(v)}),true,'number'),
          miniInput('Daily care lead minutes',form.care_lead_minutes,v=>setForm({...form,care_lead_minutes:Number(v)}),true,'number'),
          miniInput('Repeat every minutes',form.repeat_minutes,v=>setForm({...form,repeat_minutes:Number(v)}),true,'number'),
          miniInput('Manager escalation minutes',form.manager_escalation_minutes,v=>setForm({...form,manager_escalation_minutes:Number(v)}),true,'number'),
          miniInput('Medication error threshold minutes',form.medication_error_minutes,v=>setForm({...form,medication_error_minutes:Number(v)}),true,'number'),
          h('button',{className:'btn btn-primary'},'Save Settings')
        )
      ),


      toast&&h('div',{className:`samara-toast ${toast.type}`},h('span',{className:'samara-toast-icon'},toast.type==='success'?'✓':'!'),h('div',null,h('strong',null,toast.type==='success'?'Saved':'Failed'),h('span',null,toast.text)),h('button',{onClick:()=>setToast(null)},'×'))
    );
  }

