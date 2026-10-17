  // 2.17.2: Charge Master → "Rate Change History". Every patient charge-rate change (Stores / Pharmacy item
  // rate or service tariff) is recorded by the database (SQL 246): old rate, new rate, who and when. Read-only.
  function ChargeRateHistoryView(){
    const [rows,setRows]=React.useState(null),[error,setError]=React.useState('');
    const [period,setPeriod]=React.useState('all'),[from,setFrom]=React.useState(''),[to,setTo]=React.useState('');
    const [search,setSearch]=React.useState('');
    const {applied,apply,dirty}=useAppliedFilters({period,from,to,search});
    React.useEffect(()=>{(async()=>{
      const {data,error:e}=await client.from('charge_rate_history').select('*').order('changed_at',{ascending:false}).limit(5000);
      if(e){setError(/charge_rate_history/.test(e.message||'')?'Rate history is not switched on yet. Run SQL 246_charge_rate_history.sql in Supabase.':(e.message||'Rate history could not be loaded.'));setRows([]);return;}
      setRows(data||[]);
    })()},[]);
    const istDay=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
    const rate=v=>v==null?'Not set':cmMoney(v);
    const visible=(rows||[]).filter(r=>{
      if(applied.period!=='all'){
        const [a,b]=cmPeriodBounds({period:applied.period,from:applied.from,to:applied.to});const d=istDay(r.changed_at);
        if(d<a||d>b)return false;
      }
      const q=applied.search.trim().toLowerCase();
      if(q.length>=3&&![r.item_name,r.item_code,r.category].filter(Boolean).join(' ').toLowerCase().includes(q))return false;
      return true;
    });
    const pBtn=(v,l)=>h('button',{type:'button',key:v,className:`btn ${period===v?'btn-primary':'btn-secondary'}`,onClick:()=>setPeriod(v)},l);
    return h(React.Fragment,null,
      h(Section,{title:'Rate Change History',subtitle:'Every change of a patient charge rate — old rate, new rate, who changed it and when. Charges already approved keep the rate that applied on their day.'},
        h('div',{className:'actions',style:{flexWrap:'wrap',gap:'8px'}},pBtn('all','All'),pBtn('today','Today'),pBtn('week','This Week'),pBtn('month','This Month'),pBtn('custom','Period')),
        h('div',{className:'payment-filter-grid',style:{marginTop:'10px'}},
          period==='custom'&&h('div',{className:'field'},h('label',{htmlFor:'crh-from'},'From'),h('input',{id:'crh-from',type:'date',value:from,onChange:e=>setFrom(e.target.value)})),
          period==='custom'&&h('div',{className:'field'},h('label',{htmlFor:'crh-to'},'To'),h('input',{id:'crh-to',type:'date',value:to,onChange:e=>setTo(e.target.value)})),
          h('div',{className:'field'},h('label',{htmlFor:'crh-search'},'Item'),h('input',{id:'crh-search',type:'search',value:search,placeholder:'Item name or code (any 3 characters)',onChange:e=>setSearch(e.target.value)}))),
        h(ApplyFilterButton,{dirty,onApply:apply,style:{marginTop:'10px'}}),
        error&&h('div',{className:'message warning'},error)),
      h(LogTable,{
        title:rows===null?'Loading rate history…':`Rate changes (${visible.length})`,
        heads:['Date & Time','Item ID','Item','Category','Old Rate','New Rate','Changed By'],
        rows:visible.map(r=>[formatDateTimeIN(r.changed_at),r.item_code||'—',r.item_name||'—',r.category||r.source,rate(r.old_rate),rate(r.new_rate),`${r.changed_by_name||'—'}${r.changed_by_role?` (${r.changed_by_role})`:''}`])
      })
    );
  }
