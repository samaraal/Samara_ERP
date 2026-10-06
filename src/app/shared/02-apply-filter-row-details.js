  // 2.14.96: shared "Apply filter" and row-details helpers.
  // useAppliedFilters: the filter controls change a DRAFT; lists and reports use the APPLIED values,
  // which change only when the user presses Apply (so a half-chosen period / date never blanks a list).
  function useAppliedFilters(values){
    const [applied,setApplied]=React.useState(values);
    const draftKey=JSON.stringify(values),appliedKey=JSON.stringify(applied);
    const dirty=draftKey!==appliedKey;
    const apply=()=>setApplied(JSON.parse(draftKey));
    // setNow: apply a value immediately (used by one-tap shortcuts such as "Show Trial cases").
    const setNow=patch=>setApplied(prev=>({...prev,...patch}));
    return {applied,apply,dirty,setNow};
  }
  function ApplyFilterButton({dirty,onApply,style}){
    return h('div',{className:'apply-filter-wrap',style},
      h('button',{type:'button',className:`btn ${dirty?'btn-primary apply-filter-dirty':'btn-secondary'}`,onClick:onApply,'aria-label':'Apply filter'},dirty?'✓ Apply':'✓ Applied'),
      dirty&&h('small',{className:'apply-filter-note'},'Filter changed — press Apply')
    );
  }
  // 2.15.80: print / PDF windows open as a new tab — on phones there was no way back.
  // Adds a top bar with "← Back to ERP" and "Print / Save PDF" (hidden when printing).
  // Wrap any window.open('','_blank') for a printable page: samaraPrintBar(window.open(...)).
  function samaraPrintBar(win,backLabel){
    if(!win)return win;
    const appUrl=window.location.origin+window.location.pathname;
    let tries=0;
    const add=()=>{
      try{
        if(win.closed)return;
        const d=win.document;
        if(d&&d.body&&d.body.childElementCount&&!d.getElementById('samara-print-bar')){
          const st=d.createElement('style');st.id='samara-print-bar-style';
          st.textContent='#samara-print-bar{position:sticky;top:0;z-index:2147483647;display:flex;gap:10px;justify-content:space-between;align-items:center;padding:10px 12px;margin:0 0 10px;background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c);box-shadow:0 4px 14px rgba(80,10,40,.25);font-family:Arial,sans-serif}#samara-print-bar button{border:0;border-radius:999px;padding:10px 16px;font-size:15px;font-weight:700;cursor:pointer}#samara-print-bar .sp-back{background:#fff;color:#7a1247}#samara-print-bar .sp-print{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.6)}@media print{#samara-print-bar{display:none!important}}';
          const bar=d.createElement('div');bar.id='samara-print-bar';
          const back=d.createElement('button');back.type='button';back.className='sp-back';back.textContent=backLabel||'\u2190 Back to ERP';
          const pr=d.createElement('button');pr.type='button';pr.className='sp-print';pr.textContent='Print / Save PDF';
          back.onclick=()=>{try{win.close()}catch(_){}setTimeout(()=>{try{if(!win.closed)win.location.href=appUrl}catch(_){}},350)};
          pr.onclick=()=>{try{win.focus();win.print()}catch(_){}};
          bar.append(back,pr);
          (d.head||d.body).appendChild(st);
          d.body.insertBefore(bar,d.body.firstChild);
        }
      }catch(_){}
      if(++tries<40)setTimeout(add,300);
    };
    setTimeout(add,0);
    return win;
  }
  // RowDetailModal: full details of one register row. fields = [[label, value], …] (empty values are skipped).
  function RowDetailModal({title,subtitle,fields,children,onClose}){
    React.useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[]);
    const shown=(fields||[]).filter(([,v])=>v!==null&&v!==undefined&&v!==''&&v!==false);
    return h('div',{className:'modal-backdrop row-detail-backdrop',onClick:e=>{if(e.target===e.currentTarget)onClose()}},
      h('div',{className:'card modal row-detail-modal',role:'dialog','aria-modal':'true'},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,title),subtitle&&h('small',null,subtitle)),h('button',{type:'button',className:'close',onClick:onClose,'aria-label':'Close'},'×')),
        h('div',{className:'row-detail-grid'},shown.map(([label,value],i)=>h('div',{key:i,className:'row-detail-field'},h('small',null,label),h('strong',null,value)))),
        children,
        h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:onClose},'Close'))
      )
    );
  }
