  // Unposted requests must remain visible even when the posted ledger is settled.
  function chargeNeedsReview(row){
    const status=String(row.approval_status||'Pending');
    return status!=='Rejected' && (!['Approved','Partially Approved'].includes(status)||!row.billing_transaction_id);
  }
  async function fetchUnpostedCharges(patientId){
    if(!patientId)return [];
    const rows=[];
    for(let offset=0;;offset+=500){
      const result=await client.from('bill_charge_requests').select('*').eq('patient_id',patientId).order('id').range(offset,offset+499);
      if(result.error)throw result.error;
      rows.push(...(result.data||[]));
      if((result.data||[]).length<500)break;
    }
    return rows.filter(chargeNeedsReview);
  }
  function useChargeReadiness(patientId){
    const [state,setState]=React.useState({patientId:null,loading:true,rows:[],error:''});
    React.useEffect(()=>{
      let active=true,sequence=0;
      async function refresh(){
        const current=++sequence;
        try{const rows=await fetchUnpostedCharges(patientId);if(active&&sequence===current)setState({patientId,loading:false,rows,error:''});}
        catch(error){if(active&&sequence===current)setState({patientId,loading:false,rows:[],error:error.message||'Unable to verify charges'});}
      }
      refresh();
      const timer=setInterval(refresh,15000);
      window.addEventListener('focus',refresh);
      window.addEventListener('samara-refresh-charges',refresh);
      const channel=patientId?client.channel('clearance-charges-'+patientId+'-'+Math.random())
        .on('postgres_changes',{event:'*',schema:'public',table:'bill_charge_requests',filter:'patient_id=eq.'+patientId},refresh).subscribe():null;
      return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('samara-refresh-charges',refresh);if(channel)client.removeChannel(channel)};
    },[patientId]);
    return state.patientId===patientId?state:{patientId,loading:true,rows:[],error:''};
  }
  function openPatientChargeApprovals(patientId){
    window.dispatchEvent(new CustomEvent('samara-open-patient-charges',{detail:{patientId}}));
  }
  function ChargeReadinessSummary({state}){
    if(!state.patientId)return null;
    return h('div',{className:'message '+(state.error||state.rows.length?'warning':'info'),style:{margin:'12px 0'},role:'status'},
      h('strong',null,state.loading?'Checking unposted charges…':state.error?'Charge verification unavailable':state.rows.length?`${state.rows.length} charge request(s) awaiting approval / ledger posting`:'All charge requests resolved'),
      state.error&&h('div',null,state.error+' Clearance is blocked until verification succeeds.'),
      state.rows.length>0&&h(React.Fragment,null,
        h('button',{type:'button',className:'btn btn-primary',onClick:()=>openPatientChargeApprovals(state.patientId)},'View this patient’s pending charges'),
        h('p',null,'These requests are not included in Net Payable. Accounts must resolve them in Charge Approvals before discharge clearance.'),
        h('ul',null,state.rows.map(row=>h('li',{key:row.id},`${row.charge_date||''} · ${row.service_name||row.description||row.category} · Qty ${row.quantity||1} · ${row.approval_status||'Pending'}${row.billing_transaction_id?'':' · Not posted'}`)))
      ),
      h('button',{type:'button',className:'btn btn-secondary',onClick:()=>window.dispatchEvent(new Event('samara-refresh-charges'))},'Refresh charge check')
    );
  }
  function PatientChargeReadiness({patientId}){
    const state=useChargeReadiness(patientId);
    return h(ChargeReadinessSummary,{state});
  }

