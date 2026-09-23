function AuditTrail(){
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [profiles,setProfiles]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [fromDate,setFromDate]=React.useState('');
    const [toDate,setToDate]=React.useState('');
    const [entityFilter,setEntityFilter]=React.useState('All');
    const [resultFilter,setResultFilter]=React.useState('All');
    const [userFilter,setUserFilter]=React.useState('All');
    const [search,setSearch]=React.useState('');

    async function load(){
      setLoading(true);setMessage('');
      const [logs,users]=await Promise.all([
        client.from('audit_log').select('*').order('created_at',{ascending:false}).limit(2000),
        client.from('profiles').select('id,auth_user_id,title,full_name,login_id,role')
      ]);
      if(logs.error)setMessage(logs.error.message||'Unable to load audit trail.');
      setRows(logs.data||[]);setProfiles(users.data||[]);setLoading(false);
    }
    React.useEffect(()=>{load();const ch=client.channel('audit-trail-live').on('postgres_changes',{event:'INSERT',schema:'public',table:'audit_log'},load).subscribe();return()=>client.removeChannel(ch)},[]);

    const profileFor=id=>profiles.find(p=>p.id===id||p.auth_user_id===id)||null;
    const userName=row=>{const p=profileFor(row.user_id);return p?`${formalName(p)} · ${p.role}`:(row.user_name||row.user_id||'System');};
    const dateOnly=value=>String(value||'').slice(0,10);
    const entities=[...new Set(rows.map(r=>r.entity).filter(Boolean))].sort();
    const users=[...new Set(rows.map(r=>r.user_id).filter(Boolean))];
    const filtered=rows.filter(r=>{
      const date=dateOnly(r.created_at);
      const text=[r.action,r.entity,r.entity_id,r.result,r.user_name,JSON.stringify(r.details||{}),JSON.stringify(r.new_data||{})].join(' ').toLowerCase();
      return (!fromDate||date>=fromDate)&&(!toDate||date<=toDate)&&
        (entityFilter==='All'||r.entity===entityFilter)&&
        (resultFilter==='All'||String(r.result||'Success')===resultFilter)&&
        (userFilter==='All'||String(r.user_id||'')===userFilter)&&
        (!search.trim()||text.includes(search.trim().toLowerCase()));
    });

    function detailSummary(row){
      const d=row.details||{};
      if(d.summary)return d.summary;
      if(d.login_id)return `Login ID: ${d.login_id}`;
      const changed=row.old_data&&row.new_data?Object.keys(row.new_data).filter(k=>JSON.stringify(row.old_data?.[k])!==JSON.stringify(row.new_data?.[k])).filter(k=>!['updated_at'].includes(k)).slice(0,8):[];
      if(changed.length)return `Changed: ${changed.join(', ')}`;
      return row.entity_id?`Record: ${row.entity_id}`:'—';
    }

    function exportCsv(){
      const headers=['Date & Time','User','Role','Action','Module / Entity','Record','Result','Details'];
      const lines=[headers,...filtered.map(r=>{
        const p=profileFor(r.user_id);
        return [fmt(r.created_at),p?formalName(p):(r.user_name||r.user_id||'System'),p?.role||r.user_role||'—',r.action||'—',r.entity||'—',r.entity_id||'—',r.result||'Success',detailSummary(r)];
      })].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob=new Blob([lines],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`Samara_Audit_Trail_${todayISOIndia()}.csv`;a.click();URL.revokeObjectURL(url);
    }

    return h(React.Fragment,null,
      h(Section,{title:'Audit Trail',subtitle:'Admin-only record of system activity, clinical entries and data changes'},
        message&&h('div',{className:'message error'},message),
        h('div',{className:'modal-grid'},
          h('div',{className:'field'},h('label',null,'From date'),h(StrictDateInput,{value:fromDate,max:todayISOIndia(),onChange:e=>setFromDate(e.target.value)})),
          h('div',{className:'field'},h('label',null,'To date'),h(StrictDateInput,{value:toDate,max:todayISOIndia(),onChange:e=>setToDate(e.target.value)})),
          h('div',{className:'field'},h('label',null,'Module'),h('select',{value:entityFilter,onChange:e=>setEntityFilter(e.target.value)},h('option',{value:'All'},'All modules'),entities.map(x=>h('option',{key:x,value:x},x)))),
          h('div',{className:'field'},h('label',null,'User'),h('select',{value:userFilter,onChange:e=>setUserFilter(e.target.value)},h('option',{value:'All'},'All users'),users.map(id=>h('option',{key:id,value:id},userName({user_id:id}))))),
          h('div',{className:'field'},h('label',null,'Result'),h('select',{value:resultFilter,onChange:e=>setResultFilter(e.target.value)},['All','Success','Failed'].map(x=>h('option',{key:x,value:x},x)))),
          h('div',{className:'field'},h('label',null,'Search'),h('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:'Action, record or details'})),
          h('button',{type:'button',className:'btn btn-secondary',onClick:load},loading?'Loading…':'Refresh'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:exportCsv,disabled:!filtered.length},'Export Excel / CSV')
        )
      ),
      h(Section,{title:`Audit Records (${filtered.length})`,subtitle:'Latest records appear first'},
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Date & Time','User','Action','Module','Record','Result','Details'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,
            filtered.map(r=>h('tr',{key:r.id},
              h('td',null,fmt(r.created_at)),
              h('td',null,userName(r)),
              h('td',null,r.action||'—'),
              h('td',null,r.entity||'—'),
              h('td',null,r.entity_id||'—'),
              h('td',null,h('span',{className:`badge ${String(r.result||'Success')==='Failed'?'off':''}`},r.result||'Success')),
              h('td',null,detailSummary(r))
            )),
            !filtered.length?h('tr',null,h('td',{colSpan:7,className:'empty'},loading?'Loading audit records…':'No audit records match the selected filters.')):null
          )
        ))
      )
    );
  }

  function LogTable({title,subtitle,heads,rows,className=''}){
    const mobileCards=String(className||'').split(/\s+/).includes('samara-mobile-card-table');
    const wideMobileLabels=new Set(['Patient','Service','Action','Provider','Remarks']);
    return h(Section,{title,subtitle,className},
      h('div',{className:`table-wrap ${mobileCards?'samara-mobile-card-wrap':''}`.trim()},
        h('table',{className:`table ${className}`.trim()},
          h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),
          h('tbody',null,
            ...rows.map((r,i)=>h('tr',{key:i,className:mobileCards?'samara-mobile-card-row':''},...r.map((v,j)=>h('td',{key:j,'data-label':heads[j]||'','data-mobile-label':heads[j]||'',className:mobileCards&&wideMobileLabels.has(heads[j])?'samara-mobile-wide-cell':''},v)))),
            rows.length===0?h('tr',{className:mobileCards?'samara-mobile-card-row':''},h('td',{colSpan:heads.length,className:'empty','data-mobile-label':''},'No records found')):null
          )
        )
      )
    );
  }

