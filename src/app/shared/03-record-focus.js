  // 2.15.19: GLOBAL RULE — a click that points at one record opens that record, not a long list.
  // openRecord(page, focus) remembers what to show and opens the page; the page calls
  // useRecordFocus(page) to get it, shows only that record (with a "Show all" button),
  // scrolls to it and highlights it. focus = {id?, patient_id?, label}.
  const RECORD_FOCUS_KEY='samara-record-focus';
  function openRecord(page,focus){
    const payload={...(focus||{}),page,at:Date.now()};
    try{sessionStorage.setItem(RECORD_FOCUS_KEY,JSON.stringify(payload))}catch(_e){}
    window.dispatchEvent(new CustomEvent('samara-record-focus',{detail:payload}));
    window.dispatchEvent(new CustomEvent('samara-open-page',{detail:{page}}));
  }
  function takeRecordFocus(page){
    try{
      const f=JSON.parse(sessionStorage.getItem(RECORD_FOCUS_KEY)||'null');
      if(!f||f.page!==page||Date.now()-Number(f.at||0)>120000)return null;
      sessionStorage.removeItem(RECORD_FOCUS_KEY);
      return f;
    }catch(_e){return null}
  }
  function useRecordFocus(page){
    const [focus,setFocus]=React.useState(()=>takeRecordFocus(page));
    React.useEffect(()=>{
      const on=e=>{if(e.detail?.page===page){try{sessionStorage.removeItem(RECORD_FOCUS_KEY)}catch(_e){}setFocus(e.detail)}};
      window.addEventListener('samara-record-focus',on);
      return()=>window.removeEventListener('samara-record-focus',on);
    },[page]);
    return [focus,()=>setFocus(null),setFocus];
  }
  // Scroll to the element and flash it once the rows have rendered.
  function useScrollToFocused(elementId,ready){
    React.useEffect(()=>{
      if(!elementId||!ready)return;
      const t=setTimeout(()=>{
        const el=document.getElementById(elementId);
        if(!el)return;
        el.scrollIntoView({behavior:'smooth',block:'center'});
        el.classList.add('record-focus-flash');
        setTimeout(()=>el.classList.remove('record-focus-flash'),2600);
      },120);
      return()=>clearTimeout(t);
    },[elementId,ready]);
  }
  function RecordFocusBanner({focus,onShowAll}){
    if(!focus)return null;
    return h('div',{className:'record-focus-banner',role:'status'},
      h('span',null,'Showing only: ',h('strong',null,focus.label||'selected record')),
      h('button',{type:'button',className:'btn btn-secondary',onClick:onShowAll},'Show all'));
  }
