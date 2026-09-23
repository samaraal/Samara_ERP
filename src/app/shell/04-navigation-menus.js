  function Sidebar({profile,page,setPage,allowed}){
    const sections=sectionsFor(allowed,profile.role,profile.__dutyContext?.can_manage);
    const activeSection=sections.find(section=>section.items.includes(page))?.title||sections[0]?.title||'';
    const [openSection,setOpenSection]=React.useState(activeSection);
    React.useEffect(()=>{
      const next=sections.find(section=>section.items.includes(page))?.title;
      if(next)setOpenSection(next);
    },[page,allowed.join('|')]);
    function toggle(title){setOpenSection(current=>current===title?'':title)}
    return h('aside',{className:'sidebar'},
      h('div',{className:'side-brand'},h(BrandLogo,{className:'side-brand-logo'}),h('div',null,h('strong',null,'Samara Care'),h('small',null,`Assisted Living ERP ${APP_VERSION}`))),
      h('nav',{className:'nav-scroll'},sections.map(section=>{
        const expanded=openSection===section.title;
        return h('div',{className:`nav-section ${expanded?'expanded':''}`,key:section.title},
          h('button',{
            type:'button',
            className:'nav-heading-button',
            'data-section':section.title,
            onClick:()=>toggle(section.title),
            'aria-expanded':expanded
          },h('span',null,section.title),h('span',{className:'nav-chevron','aria-hidden':'true'},expanded?'−':'+')),
          expanded&&h('div',{className:'nav nav-submenu'},section.items.map(item=>item==='Food & Diet'?h(FoodNavigationLinks,{key:item,profile,page,onNavigate:setPage}):h('button',{
            key:item,
            type:'button',
            'data-nav':item,
            className:page===item?'active':'',
            onClick:()=>setPage(item)
          },displayNavLabel(item,profile.role))))
        );
      })),
      h('div',{className:'sidebar-footer'},
        h('button',{type:'button',className:'user-chip',onClick:()=>setPage('My Profile'),title:'Open My Profile',style:{width:'100%',textAlign:'left',cursor:'pointer'}},h('strong',null,formalName(profile)),h('small',null,`${profile.login_id} · ${profile.role}`)),
        h('button',{type:'button',className:'btn btn-secondary full',onClick:samaraOpenAppHelp},'App Help / Repair'),
        h('button',{className:'btn btn-secondary full',onClick:async()=>{await writeAuditEvent('User Logout','Authentication',profile.id,{login_id:profile.login_id},'Success');await client.auth.signOut()}},'Sign out')
      )
    );
  }

  function MobileMenu({page,profile,onOpenMenu}){
    return h('div',{className:'mobile-menu'},
      h('label',null,'Module'),
      h('button',{type:'button',className:'mobile-module-menu-button',onClick:onOpenMenu,'aria-label':`Open module menu. Current module: ${displayNavLabel(page,profile.role)}`,'aria-haspopup':'dialog'},
        h('span',null,displayNavLabel(page,profile.role)),
        h('span',{className:'mobile-module-menu-icon','aria-hidden':'true'},'☰')
      )
    );
  }


  function MobileBottomNav({page,setPage,allowed,profile,onOpenMenu}){
    const home=homePageForProfile(profile)||allowed[0]||'Dashboard';
    const choose=(preferred,fallbacks=[])=>[preferred,...fallbacks].find(item=>allowed.includes(item));

    if(CLINICAL_ROLES.includes(profile.role)){
      const clinicalHome=choose('Clinical Dashboard',[home]);
      const medicines=choose('Medicines',['Shift Tasks']);
      const vitals=choose('Vital Signs',['Shift Tasks']);
      const care=choose('Daily Care',['Shift Tasks']);
      const items=[
        clinicalHome&&{page:clinicalHome,icon:'⌂',label:'Home'},
        medicines&&{page:medicines,icon:'◐',label:'Meds'},
        vitals&&{page:vitals,icon:'∿',label:'Vitals'},
        care&&{page:care,icon:'♡',label:'Care'}
      ].filter(Boolean);
      return h('nav',{className:'mobile-bottom-nav nursing-mobile-nav','aria-label':'Nursing mobile navigation'},
        items.map(item=>h('button',{
          type:'button',key:item.label,
          className:page===item.page?'active':'',
          onClick:()=>setPage(item.page),
          'aria-label':item.label
        },h('span',{className:'mobile-nav-icon'},item.icon),h('span',null,item.label))),
        h('button',{type:'button',onClick:onOpenMenu,'aria-label':'Open nursing menu'},
          h('span',{className:'mobile-nav-icon'},'☰'),h('span',null,'More'))
      );
    }

    const patients=choose('Patients');
    const work=profile?.role==='Manager'?choose('My To-Do & Follow-up',['HR Dashboard']):choose('HR Dashboard',['Clinical Dashboard','Admissions','Employees','Billing & Payments']);
    const reports=choose('Reports',['Intelligent Reports','Billing & Payments','Notifications']);
    const items=[
      {page:home,icon:'⌂',label:'Home'},
      patients&&{page:patients,icon:'♙',label:'Patients'},
      work&&{page:work,icon:'✚',label:'Work'},
      reports&&{page:reports,icon:'▥',label:'Reports'}
    ].filter(Boolean);
    return h('nav',{className:'mobile-bottom-nav','aria-label':'Mobile navigation'},
      items.map(item=>h('button',{type:'button',key:item.label,className:page===item.page?'active':'',onClick:()=>setPage(item.page),'aria-label':item.label},
        h('span',{className:'mobile-nav-icon'},item.icon),h('span',null,item.label))),
      h('button',{type:'button',onClick:onOpenMenu,'aria-label':'Open all modules'},
        h('span',{className:'mobile-nav-icon'},'☰'),h('span',null,'Menu'))
    );
  }

  function MobileNavigationDrawer({profile,allowed,page,onNavigate,onClose}){
    const sections=sectionsFor(allowed,profile.role,profile.__dutyContext?.can_manage);
    const home=homePageForProfile(profile)||allowed[0]||'Dashboard';
    const activeSection=sections.find(section=>section.items.includes(page))?.title||sections[0]?.title||'';
    const [openSection,setOpenSection]=React.useState(activeSection);
    React.useEffect(()=>{const next=sections.find(section=>section.items.includes(page))?.title;if(next)setOpenSection(next)},[page]);
    const sectionIcon=title=>/OVERVIEW/.test(title)?'⌂':/HR/.test(title)?'♙':/ADMISSION/.test(title)?'♥':/ROOM/.test(title)?'▦':/PHARMACY|STORE/.test(title)?'♨':/FOOD/.test(title)?'₹':/CLINICAL/.test(title)?'✚':'⚙';
    const itemIcon=item=>item==='Notifications'?'🔔':item==='Patients'?'♙':item==='Rooms'?'▦':item==='Care Packages'?'▣':item==='Admissions'?'＋':item==='Employees'?'♙':item==='Patient Consumables'?'▤':item==='Consumables'?'▤':item==='Pharmacy'?'✚':item==='Stores'?'▥':item==='Food & Diet'?'♨':item==='My Profile'?'●':item==='My Leave & Permission'?'◷':item==='Clinical Alerts'?'!':item==='Clinical Escalations'?'⚠':item==='My To-Do List'?'✓':'›';
    React.useEffect(()=>{
      const onKey=e=>{if(e.key==='Escape')onClose()};
      document.addEventListener('keydown',onKey);
      document.body.classList.add('mobile-drawer-open');
      return()=>{document.removeEventListener('keydown',onKey);document.body.classList.remove('mobile-drawer-open')};
    },[]);
    async function signOut(){
      if(!window.confirm('Are you sure you want to sign out?'))return;
      onClose();
      await writeAuditEvent('User Logout','Authentication',profile.id,{login_id:profile.login_id},'Success');
      await client.auth.signOut();
    }
    return h('div',{className:'mobile-drawer-layer',role:'presentation',onClick:e=>{if(e.target===e.currentTarget)onClose()}},
      h('aside',{className:'mobile-nav-drawer elegant-mobile-drawer',role:'dialog','aria-modal':'true','aria-label':'Samara Care mobile menu'},
        h('style',null,`
          .elegant-mobile-drawer{background:linear-gradient(180deg,#fffafc 0%,#f9d5e5 48%,#d52b78 100%)!important;border-radius:24px 0 0 24px!important;overflow:hidden!important}
          .elegant-mobile-drawer .mobile-drawer-head{padding:17px 16px 14px!important;background:linear-gradient(135deg,#fff 0%,#fff0f6 100%)!important;border-bottom:1px solid #ecc5d6!important}
          .elegant-mobile-drawer .mobile-drawer-brand img{width:132px!important;height:54px!important;object-fit:contain!important}
          .elegant-mobile-drawer .mobile-drawer-brand strong{font-size:18px!important;color:#46182f!important}.elegant-mobile-drawer .mobile-drawer-brand small{font-size:13px!important;color:#9a1b5a!important;font-weight:800!important}
          .elegant-mobile-drawer .mobile-drawer-close{background:#f6dce8!important;color:#8d114b!important;box-shadow:0 5px 14px rgba(111,16,61,.12)!important}
          .elegant-mobile-drawer .mobile-drawer-user{margin:12px 14px!important;padding:13px 14px!important;border-radius:15px!important;background:linear-gradient(135deg,#9e0d52,#d12674)!important;color:#fff!important;box-shadow:0 8px 20px rgba(123,13,64,.22)!important}
          .elegant-mobile-drawer .mobile-drawer-user strong{font-size:18px!important}.elegant-mobile-drawer .mobile-drawer-user span{font-size:13px!important;background:rgba(255,255,255,.2)!important;color:#fff!important}.elegant-mobile-drawer .mobile-drawer-user small{display:block;font-size:14px!important;opacity:.9;margin-top:3px}
          .elegant-mobile-drawer .mobile-drawer-home{width:calc(100% - 28px)!important;min-height:50px!important;border:1px solid #e8bfd1!important;border-radius:14px!important;background:#fff7fb!important;color:#74103f!important;font-size:17px!important;font-weight:900!important;text-align:left!important;padding:0 15px!important;box-shadow:0 5px 15px rgba(91,25,56,.08)!important}
          .elegant-mobile-drawer .mobile-drawer-home.active{background:#7f0b43!important;color:#fff!important}
          .elegant-mobile-drawer .mobile-drawer-scroll{padding:4px 12px 14px!important}.elegant-mobile-drawer .mobile-drawer-group{margin:8px 0!important;border:1px solid rgba(188,58,116,.22)!important;border-radius:16px!important;background:rgba(255,255,255,.78)!important;overflow:hidden!important;box-shadow:0 5px 14px rgba(92,21,54,.07)!important}
          .elegant-mobile-drawer .mobile-drawer-group-head{width:100%!important;min-height:52px!important;margin:0!important;padding:11px 13px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#59142f!important;display:grid!important;grid-template-columns:32px 1fr 26px!important;align-items:center!important;gap:7px!important;text-align:left!important;font-size:16px!important;font-weight:950!important;letter-spacing:.025em!important}
          .elegant-mobile-drawer .mobile-drawer-group.expanded .mobile-drawer-group-head{background:linear-gradient(90deg,#fff0f6,#f5cadd)!important;color:#970c50!important}.mobile-drawer-group-icon{width:30px;height:30px;border-radius:9px;background:#f6dce8;display:grid;place-items:center;color:#9b0c51;font-size:16px}.mobile-drawer-group-chevron{text-align:center;font-size:20px}
          .elegant-mobile-drawer .mobile-drawer-items{padding:5px 8px 9px!important;border-top:1px solid #efd4e0!important}.elegant-mobile-drawer .mobile-drawer-items button{width:100%!important;min-height:47px!important;margin:2px 0!important;padding:9px 10px!important;border:0!important;border-radius:11px!important;background:transparent!important;color:#4f3542!important;display:grid!important;grid-template-columns:30px 1fr 18px!important;align-items:center!important;gap:7px!important;text-align:left!important;font-size:17px!important}
          .elegant-mobile-drawer .mobile-drawer-items button.active{background:linear-gradient(100deg,#9b0c50,#d62b78)!important;color:#fff!important;font-weight:900!important;box-shadow:0 5px 13px rgba(139,11,70,.2)!important}.mobile-drawer-item-icon{width:28px;height:28px;border-radius:8px;background:#f8e5ee;display:grid;place-items:center;color:#a00e55;font-weight:900}.mobile-drawer-items button.active .mobile-drawer-item-icon{background:rgba(255,255,255,.2);color:#fff}.mobile-drawer-item-arrow{text-align:right;font-weight:900}
          .elegant-mobile-drawer .mobile-drawer-footer{background:rgba(120,5,62,.94)!important;border:0!important;padding:10px 14px calc(10px + env(safe-area-inset-bottom))!important;display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}.elegant-mobile-drawer .mobile-drawer-footer button{min-height:46px!important;border-radius:12px!important;border:1px solid rgba(255,255,255,.35)!important;background:rgba(255,255,255,.12)!important;color:#fff!important;font-size:15px!important;font-weight:850!important}.elegant-mobile-drawer .mobile-signout-button{grid-column:1/-1!important;background:#fff!important;color:#8b0b49!important}
        `),
        h('div',{className:'mobile-drawer-head'},
          h('div',{className:'mobile-drawer-brand'},h(BrandLogo,{className:'mobile-header-brand-logo'}),h('div',null,h('strong',null,'Samara Care ERP'),h('small',null,`Version ${APP_VERSION}`))),
          h('button',{type:'button',className:'mobile-drawer-close',onClick:onClose,'aria-label':'Close menu'},'×')
        ),
        h('div',{className:'mobile-drawer-user'},h('div',null,h('strong',null,formalName(profile)),h('small',null,`${profile.login_id||''} · ${profile.designation||profile.role}`)),h('span',{className:'badge'},profile.role)),
        h('button',{type:'button',className:`mobile-drawer-home ${page===home?'active':''}`,onClick:()=>onNavigate(home)},(CLINICAL_ROLES.includes(profile.role)||isNursingManagerProfile(profile))?'⌂  Nursing Dashboard':'⌂  Dashboard'),
        h('div',{className:'mobile-drawer-scroll'},sections.map(section=>{const expanded=openSection===section.title;return h('section',{className:`mobile-drawer-group ${expanded?'expanded':''}`,key:section.title},
          h('button',{type:'button',className:'mobile-drawer-group-head',onClick:()=>setOpenSection(current=>current===section.title?'':section.title),'aria-expanded':expanded},h('span',{className:'mobile-drawer-group-icon'},sectionIcon(section.title)),h('span',null,section.title),h('span',{className:'mobile-drawer-group-chevron'},expanded?'−':'+')),
          expanded?h('div',{className:'mobile-drawer-items'},section.items.map(item=>item==='Food & Diet'?h(FoodNavigationLinks,{key:item,profile,page,onNavigate,mobile:true}):h('button',{type:'button',key:item,'data-nav':item,className:page===item?'active':'',onClick:()=>onNavigate(item)},h('span',{className:'mobile-drawer-item-icon'},itemIcon(item)),h('span',null,displayNavLabel(item,profile.role)),h('span',{className:'mobile-drawer-item-arrow'},'›')))):null
        )})),
        h('div',{className:'mobile-drawer-footer'},
          h('button',{type:'button',className:'mobile-update-button',onClick:samaraOpenAppHelp},'⚙  App Help / Repair'),
          h('button',{type:'button',className:'mobile-update-button',onClick:e=>samaraManualUpdateCheck(e.currentTarget)},'↻  Check for Updates'),
          h('button',{type:'button',className:'mobile-signout-button',onClick:signOut},'⇥  Sign Out')
        )
      )
    );
  }

  function NursingMobileQuickActions({profile,page,onNavigate}){
    // Keep the large clinical shortcut grid on the nursing dashboard only.
    // Workflow pages need the full mobile viewport for their actual content.
    if(page!=='Clinical Dashboard')return null;
    if(!CLINICAL_ROLES.includes(profile?.role)&&!isNursingManagerProfile(profile))return null;
    const actions=[
      ['Medicines','◐','Medication','Give / record'],
      ['Vital Signs','∿','Vitals','Enter observations'],
      ['Daily Care','♡','Daily Care','Complete care'],
      ['Food & Diet','♨','Food & Beverages','Record intake'],
      ['Shift Tasks','☷','Tasks','Current shift']
    ];
    if(profile?.role==='Nurse'||isNursingManagerProfile(profile))actions.push(['My To-Do List','＋','To-Do','Voice / personal']);
    return h('section',{className:'nursing-mobile-quick-actions','aria-label':'Nursing quick actions'},
      actions.map(([target,icon,label,sub])=>h('button',{
        type:'button',
        key:target,
        className:page===target?'active':'',
        onClick:()=>onNavigate(target)
      },
        h('span',{className:'nursing-quick-icon'},icon),
        h('span',{className:'nursing-quick-copy'},h('strong',null,label),h('small',null,sub))
      ))
    );
  }



