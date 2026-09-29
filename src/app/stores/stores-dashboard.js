  // 2.14.91: Pharmacy & Stores dashboard — one per sidebar category (Consumables, Pharmacy).
  // Opens with navigable boxes showing live numbers. Each box opens one section on its own,
  // with a "← Back to Dashboard" bar and Close. The phone / browser back button also returns
  // to the dashboard. The sections themselves are the existing ConsumablesStores and
  // PatientConsumables screens, shown one part at a time (no change to how they work).
  function StoresDashboard({profile,categoryFilter}){
    const [view,setView]=React.useState('');
    const [refreshKey,setRefreshKey]=React.useState(0);
    const [stats,setStats]=React.useState(null),[indents,setIndents]=React.useState(null);
    const viewRef=React.useRef('');
    React.useEffect(()=>{viewRef.current=view},[view]);
    React.useEffect(()=>{
      // Runs before the app's own page-back handler (capture phase) and stops it, so Back
      // closes the open section instead of leaving the page.
      const onPop=e=>{
        if(!viewRef.current)return;
        try{e.stopImmediatePropagation()}catch(_){}
        viewRef.current='';
        setView('');
        window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}});
      };
      window.addEventListener('popstate',onPop,true);
      return()=>window.removeEventListener('popstate',onPop,true);
    },[]);
    function openView(key){
      if(viewRef.current){viewRef.current=key;setView(key)}
      else{try{history.pushState({samaraStoresView:key},'')}catch(_){}viewRef.current=key;setView(key)}
      window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}});
    }
    function backToDashboard(){
      let usedHistory=false;
      try{if(history.state&&history.state.samaraStoresView){history.back();usedHistory=true}}catch(_){}
      if(!usedHistory){viewRef.current='';setView('');window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}})}
    }
    const cat=categoryFilter||'Pharmacy & Stores';
    const isPharmacy=categoryFilter==='Pharmacy';
    const info=storeSectionInfo(categoryFilter||'Consumables');
    const n=value=>value==null?'…':value;
    const ready=!!(stats&&indents);
    const s=stats||{},ind=indents||{};
    const indentAction=Number(ind.initiated||0)+Number(ind.handover||0);
    const tiles=[
      {key:'action',icon:'⚑',title:'Indents — Action Needed',value:ready?indentAction:null,unit:'to act on',
        lines:[`${n(ind.initiated)} awaiting approval`,`${n(ind.handover)} awaiting handover`,`${n(ind.receipt)} awaiting nurse receipt`,...(Number(ind.discrepancy||0)>0?[`${ind.discrepancy} receipt discrepancy`]:[])],
        alert:indentAction>0||Number(ind.discrepancy||0)>0},
      {key:'register',icon:'▤',title:`${isPharmacy?'Pharmacy':categoryFilter==='Consumables'||!categoryFilter?'Consumables':'Resident'} Indent Register`,value:ready?ind.total:null,unit:'indents',
        lines:[`${n(ind.today)} raised today`,`${n(ind.week)} this week`,`${n(ind.open)} still open`]},
      {key:'balance',icon:'⇄',title:'Received / Used Balance',value:ready?ind.withBalance:null,unit:'with unused balance',
        lines:[`${n(ind.returnsPending)} return(s) awaiting confirmation`],alert:Number(ind.returnsPending||0)>0},
      {key:'stock',icon:isPharmacy?'℞':info.departmentIssue?info.icon:'▦',title:'Current Stock',value:ready?s.items:null,unit:'items',
        lines:[`${n(s.inStock)} in stock`,`${n(s.low)} low stock`,`${n(s.out)} out of stock`],alert:Number(s.low||0)+Number(s.out||0)>0},
      ...(info.departmentIssue?[{key:'issue',icon:'➜',title:'Issue to Department',value:ready?s.deptMonth:null,unit:'issues this month',lines:[`${n(s.deptToday)} issued today`,'Floor, kitchen / pantry, laundry and other departments']}]:[]),
      ...(s.controller?[{key:'receive',icon:'＋',title:'Receive from Vendor',value:null,valueText:'New',unit:'receipt',lines:['Enter stock received from a vendor, with batch and expiry']}]:[]),
      {key:'receipts',icon:'🧾',title:'Vendor Receipt Register',value:ready?s.receipts:null,unit:'receipts',
        lines:[s.lastReceipt?`Last received ${formatDateIN(s.lastReceipt)}`:'No receipts yet']},
      {key:'movement',icon:'↕',title:'Stock Movement Register',value:ready?s.monthMoves:null,unit:'movements this month',
        lines:[`Today: +${n(s.todayIn)} in · −${n(s.todayOut)} out`,'Summary and every movement']},
      {key:'expiry',icon:'⏳',title:'Expiry Watch',value:ready?Number(s.expired||0)+Number(s.soon||0):null,unit:'expired / expiring',
        lines:[`${n(s.expired)} expired`,`${n(s.soon)} within 90 days`,`${n(s.missing)} expiry not entered`],alert:Number(s.expired||0)>0,warn:Number(s.soon||0)>0}
    ];
    const viewTitle=(tiles.find(t=>t.key===view)||{}).title||'';
    const storeSection=['stock','receive','receipts','movement','expiry','issue'].includes(view)?view:'none';
    const indentSection=view==='action'||view==='register'?'register':view==='balance'?'balance':'none';
    const registerFilter=view==='action'?'Open':view==='register'?'All':'';
    if(stats&&stats.access===false)return h(ConsumablesStores,{profile,categoryFilter});
    return h('div',{className:'stores-dash-wrap'},
      !view&&h('div',{className:'stores-dash'},
        h('div',{className:'stores-dash-hero'},
          h('div',null,
            h('small',null,'PHARMACY & STORES'),
            h('h2',null,cat),
            h('p',null,info.blurb)
          ),
          h('button',{type:'button',className:'stores-dash-refresh',onClick:()=>{setStats(null);setIndents(null);setRefreshKey(k=>k+1)}},'↻ Refresh')
        ),
        h('div',{className:'stores-dash-grid'},tiles.map(t=>h('button',{key:t.key,type:'button',className:`stores-dash-tile${t.alert?' alert':t.warn?' warn':''}`,onClick:()=>openView(t.key)},
          h('span',{className:'stores-dash-icon','aria-hidden':'true'},t.icon),
          h('span',{className:'stores-dash-title'},t.title),
          h('span',{className:'stores-dash-value'},h('b',null,t.valueText||n(t.value)),h('small',null,t.unit)),
          h('span',{className:'stores-dash-lines'},t.lines.map((line,i)=>h('span',{key:i},line))),
          h('span',{className:'stores-dash-open'},'Open →')
        )))
      ),
      view&&h('div',{className:'stores-dash-backbar'},
        h('button',{type:'button',className:'stores-dash-back',onClick:backToDashboard},'← Back to Dashboard'),
        h('strong',null,h('span',{className:'stores-dash-backbar-cat'},`${cat} · `),viewTitle),
        h('button',{type:'button',className:'stores-dash-close','aria-label':'Close and return to dashboard',onClick:backToDashboard},'×')
      ),
      h(React.Fragment,{key:`stores-dash-data-${refreshKey}`},
        h(ConsumablesStores,{profile,categoryFilter,section:storeSection,onSummary:setStats,onOpenSection:openView}),
        h(PatientConsumables,{profile,categoryFilter,section:indentSection,registerFilter,onSummary:setIndents})
      )
    );
  }
