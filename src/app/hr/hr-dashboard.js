  function HRDashboard({profile,onNavigate}){
    const [employees,setEmployees]=React.useState([]),[applications,setApplications]=React.useState([]),[waComms,setWaComms]=React.useState([]);
    async function load(){
      const [e,a,w]=await Promise.all([
        client.from('profiles').select('id,full_name,title,role,department,designation,is_active,active').order('full_name'),
        client.from('career_applications').select('*').order('created_at',{ascending:false}).limit(100),
        client.from('hr_whatsapp_communications').select('*').order('created_at',{ascending:false}).limit(250)
      ]);
      if(!e.error)setEmployees(e.data||[]);
      if(!a.error)setApplications(a.data||[]);
      if(!w.error)setWaComms(w.data||[]);
    }
    React.useEffect(()=>{load();const ch=client.channel('hr-dashboard-live').on('postgres_changes',{event:'*',schema:'public',table:'career_applications'},load).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},load).on('postgres_changes',{event:'*',schema:'public',table:'hr_whatsapp_communications'},load).subscribe();return()=>client.removeChannel(ch)},[]);
    const active=deduplicateEmployeeProfiles(employees.filter(x=>(x.is_active??x.active)!==false&&!isSamaraAdministratorAccount(x)));
    const now=Date.now();
    const upcoming=applications.filter(x=>x.interview_at&&new Date(x.interview_at).getTime()>=now).sort((a,b)=>new Date(a.interview_at)-new Date(b.interview_at)).slice(0,5);
    const newApps=applications.filter(x=>x.status==='New').length;
    const shortlisted=applications.filter(x=>x.status==='Shortlisted').length;
    const interviewCount=applications.filter(x=>x.status==='Interview Scheduled').length;
    const selectedCount=applications.filter(x=>x.status==='Selected').length;
    const onHold=applications.filter(x=>x.status==='On Hold').length;
    const deptCount=name=>active.filter(x=>employeeDepartment(x)===name).length;
    const nowLocal=new Date();
    const todayStart=new Date(nowLocal.getFullYear(),nowLocal.getMonth(),nowLocal.getDate());
    const tomorrowStart=new Date(nowLocal.getFullYear(),nowLocal.getMonth(),nowLocal.getDate()+1);
    const isApplicantWhatsApp=x=>Boolean(x.career_application_id)||/career|applicant|application|interview/i.test(`${x.communication_type||''} ${x.template_name||''} ${x.source_type||''}`);
    const waTodayRaw=waComms.filter(x=>{
      if(!isApplicantWhatsApp(x))return false;
      const d=new Date(x.sent_at||x.created_at||0);
      return d>=todayStart&&d<tomorrowStart;
    });
    const waToday=[...new Map(waTodayRaw.map(x=>[x.provider_message_id||x.id,x])).values()];
    const waFailedToday=waToday.filter(x=>String(x.status||'').toLowerCase().includes('fail')).length;
    const metrics=[
      ['Active Employees',active.length,'Employees','♙','Currently employed','Open Employees →','#a91360','#f8e6ef'],
      ['Nursing',deptCount('Nursing'),'Employees','⚕','Nursing workforce','View Nursing Staff →','#d93679','#fde9f2'],
      ['Caregiving',deptCount('Caregiving'),'Employees','♡','Caregiving workforce','View Caregivers →','#16a36c','#e7f6ef'],
      ['New Applications',newApps,'Career Applications','＋','Awaiting HR review','Open Applications →','#e23e80','#fde8f1'],
      ['Shortlisted',shortlisted,'Career Applications','✓','Candidates shortlisted','Review Shortlist →','#2aa97b','#e8f7f1'],
      ['Interviews',interviewCount,'Interviews','◷','Interview scheduled','Open Interviews →','#f08a4b','#fff0e8'],
      ['Applicant WhatsApp',waToday.length,'Career Applications','◉',`${waToday.length} applicant message${waToday.length===1?'':'s'} logged today${waFailedToday?` · ${waFailedToday} failed`:''}`,'Open Applicant History →','#169b67','#e6f7ef'],
      ['Selected',selectedCount,'Career Applications','★','Candidates selected','View Selected →','#7c62d7','#f0ecfb'],
      ['On Hold',onHold,'Career Applications','Ⅱ','Applications on hold','Review On Hold →','#7a1247','#f4e9ef']
    ];
    const statusClass=status=>String(status||'').toLowerCase().includes('interview')?'success':'';
    return h(React.Fragment,null,
      h(Section,{title:'HR Dashboard',subtitle:'Employees, recruitment applications and interview actions in one workspace'},
        h('div',{style:{display:'flex',justifyContent:'space-between',gap:'14px',alignItems:'center',flexWrap:'wrap',marginBottom:'16px'}},
          h('div',null,h('strong',{style:{fontSize:'16px',color:'#5d1039'}},'People & Recruitment Overview'),h('div',{style:{fontSize:'13px',color:'#75616d',marginTop:'3px'}},'Live workforce and recruitment position')), 
          h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Employees','Active Employees',{source:'HR Dashboard'})},'Employees'),
            h('button',{type:'button',className:'btn btn-primary',onClick:()=>dashboardNavigate(onNavigate,'Career Applications','All Applications',{source:'HR Dashboard'})},'Career Applications')
          )
        ),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(265px,1fr))',gap:'20px',marginBottom:'24px'}},metrics.map(([label,value,page,icon,note,action,accent,iconBg])=>
          h('button',{key:label,type:'button',onClick:()=>dashboardNavigate(onNavigate,page,label,{source:'HR Dashboard'}),style:{position:'relative',overflow:'hidden',textAlign:'left',padding:'30px 26px 24px',border:'0',borderRadius:'24px',background:'linear-gradient(145deg,#ffffff 0%,#fffafd 100%)',minHeight:'205px',cursor:'pointer',boxShadow:'0 12px 26px rgba(93,16,57,.10)',outline:'1px solid rgba(234,208,222,.72)'}},
            h('span',{style:{position:'absolute',left:0,right:0,top:0,height:'7px',background:`linear-gradient(90deg,#7a1247 0%,${accent} 68%,#f6b72d 100%)`}}),
            h('span',{style:{position:'absolute',right:'0',top:'0',width:'96px',height:'96px',borderRadius:'0 24px 0 38px',display:'grid',placeItems:'center',background:iconBg,color:accent,fontSize:'30px',fontWeight:900}},icon),
            h('span',{style:{display:'block',maxWidth:'72%',fontSize:'16px',fontWeight:800,color:'#53716a',marginTop:'18px'}},label),
            h('strong',{style:{display:'block',fontSize:'40px',lineHeight:'1.05',marginTop:'14px',color:'#113c34',letterSpacing:'-.02em'}},value),
            h('small',{style:{display:'block',marginTop:'10px',fontSize:'14px',color:'#806b77'}},note),
            h('span',{style:{display:'block',marginTop:'18px',fontSize:'13px',fontWeight:900,color:accent}},action)
          )
        )),
        h('div',{style:{display:'grid',gridTemplateColumns:'minmax(0,1.45fr) minmax(330px,.8fr)',gap:'16px',alignItems:'start'}},
          h('div',{className:'card panel',style:{overflow:'hidden'}},
            h('div',{className:'panel-head'},h('div',null,h('h3',null,'Recent Career Applications'),h('small',null,'Newest applications received from the public Careers page')),h('button',{className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Career Applications','All Applications',{source:'HR Dashboard'})},'View All')),
            h('div',{className:'table-wrap'},h('table',{className:'table'},
              h('thead',null,h('tr',null,['Applicant','Department','Designation','Status','Received'].map(x=>h('th',{key:x},x)))),
              h('tbody',null,
                applications.slice(0,6).map(r=>h('tr',{key:r.id},
                  h('td',null,h('strong',null,r.applicant_name||'—')),
                  h('td',null,r.department||'—'),
                  h('td',null,r.designation||'—'),
                  h('td',null,h('span',{className:`badge ${statusClass(r.status)}`},r.status||'New')),
                  h('td',null,fmt(r.created_at))
                )),
                applications.length===0?h('tr',null,h('td',{colSpan:5,className:'empty'},'No career applications received yet.')):null
              )
            ))
          ),
          h('div',{className:'card panel'},
            h('div',{className:'panel-head'},h('div',null,h('h3',null,'Upcoming Interviews'),h('small',null,'Next scheduled candidate interviews')),h('button',{className:'btn btn-secondary',onClick:()=>onNavigate('Interviews')},'Open Interviews')),
            upcoming.length?h('div',{style:{display:'grid',gap:'10px'}},upcoming.map(r=>h('button',{type:'button',key:r.id,onClick:()=>onNavigate('Interviews'),style:{textAlign:'left',width:'100%',padding:'13px 14px',border:'1px solid #ead0de',borderRadius:'13px',background:'#fffafd',cursor:'pointer'}},
              h('strong',{style:{display:'block',color:'#5d1039',fontSize:'15px'}},r.applicant_name||'Candidate'),
              h('span',{style:{display:'block',marginTop:'4px',color:'#65495a'}},r.designation||r.department||'—'),
              h('span',{style:{display:'block',marginTop:'7px',fontWeight:800,color:'#a91360'}},fmt(r.interview_at)),
              r.interview_mode?h('small',{style:{display:'block',marginTop:'3px',color:'#85717c'}},[r.interview_mode,r.interview_venue].filter(Boolean).join(' · ')):null
            ))):h('p',{className:'empty'},'No upcoming interviews scheduled.')
          )
        ),
        h('div',{className:'card panel',style:{marginTop:'16px'}},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Workforce Snapshot'),h('small',null,'Active employees by key department'))),
          h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'10px'}},
            ['Nursing','Caregiving','Administration','Housekeeping','HR','Operations','Accounts & Finance','Food & Kitchen'].map(name=>h('button',{type:'button',key:name,onClick:()=>dashboardNavigate(onNavigate,'Employees','Active Employees',{source:'HR Dashboard'}),style:{padding:'12px',border:'1px solid #efd7e2',borderRadius:'12px',background:'#fffafd',textAlign:'left',cursor:'pointer'}},h('span',{style:{display:'block',fontSize:'12px',color:'#806575'}},name),h('strong',{style:{display:'block',fontSize:'20px',marginTop:'4px',color:'#6d123f'}},deptCount(name))))
          )
        )
      )
    );
  }

