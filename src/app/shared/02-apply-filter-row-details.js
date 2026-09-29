  // 2.14.96: shared "Apply filter" and row-details helpers.
  // useAppliedFilters: the filter controls change a DRAFT; lists and reports use the APPLIED values,
  // which change only when the user presses Apply (so a half-chosen period / date never blanks a list).
  function useAppliedFilters(values){
    const [applied,setApplied]=React.useState(values);
    const draftKey=JSON.stringify(values),appliedKey=JSON.stringify(applied);
    const dirty=draftKey!==appliedKey;
    const apply=()=>setApplied(JSON.parse(draftKey));
    return {applied,apply,dirty};
  }
  function ApplyFilterButton({dirty,onApply,style}){
    return h('div',{className:'apply-filter-wrap',style},
      h('button',{type:'button',className:`btn ${dirty?'btn-primary apply-filter-dirty':'btn-secondary'}`,onClick:onApply,'aria-label':'Apply filter'},dirty?'✓ Apply':'✓ Applied'),
      dirty&&h('small',{className:'apply-filter-note'},'Filter changed — press Apply')
    );
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
