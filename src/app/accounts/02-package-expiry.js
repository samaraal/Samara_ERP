  function PackageExpiryDashboard({profile,onNavigate}){
    const allowed=['Admin','Manager','Accounts'].includes(profile?.role);
    const [rows,setRows]=React.useState([]);
    const [packages,setPackages]=React.useState([]);
    const [requests,setRequests]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [busy,setBusy]=React.useState('');
    const [message,setMessage]=React.useState('');
    const [packageFocus,setPackageFocus]=React.useState('All');

    const today=todayISOIndia();
    const dateOnly=value=>String(value||'').slice(0,10);
    const dateDiff=(a,b)=>Math.round((new Date(`${dateOnly(a)}T00:00:00`)-new Date(`${dateOnly(b)}T00:00:00`))/86400000);
    const money=value=>`₹${Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    function optionKind(pkg){
      const unit=String(pkg?.duration_unit||'').toLowerCase();
      const value=Number(pkg?.duration_value||0);
      const days=unit.startsWith('week')?value*7:unit.startsWith('month')?value*30:value;
      if((unit.startsWith('week')&&value===1)||days===7)return 'Weekly';
      if((unit.startsWith('week')&&value===2)||days===14||days===15)return 'Fortnightly';
      if((unit.startsWith('month')&&value===1)||days===30||days===31)return 'Monthly';
      return '';
    }
    function packageFee(pkg,row){
      const cls=String(row.package_room_class||'').toLowerCase();
      if(cls.includes('private'))return Number(pkg.private_fee||0);
      if(cls.includes('general'))return Number(pkg.general_fee||0);
      return Number(pkg.twin_fee||0);
    }
    function statusOf(row){
      const diff=dateDiff(row.package_end_date,today);
      if(diff<0)return {label:'Expired',tone:'error',days:diff};
      if(diff===0)return {label:'Expires Today',tone:'warning',days:0};
      if(diff<=3)return {label:`Expires in ${diff} day${diff===1?'':'s'}`,tone:'warning',days:diff};
      return {label:`Active · ${diff} days left`,tone:'success',days:diff};
    }
    function requestOf(row){
      return requests.find(r=>r.patient_id===row.id&&dateOnly(r.package_end_date)===dateOnly(row.package_end_date))||null;
    }

    function renewalOptions(row){
      return ['Weekly','Fortnightly','Monthly'].map(kind=>{
        const pkg=packages.find(item=>optionKind(item)===kind&&item.is_active!==false);
        return {kind,pkg,fee:pkg?packageFee(pkg,row):0};
      });
    }

    async function load(){
      setLoading(true);
      setMessage('');
      const [pat,pkg,req]=await Promise.all([
        client.from('patients')
          .select('id,patient_id,title,full_name,room_no,bed_no,mobile,attendant_name,attendant_phone,billing_package,package_id,package_start_date,package_end_date,package_fee,package_room_class,is_active')
          .eq('is_active',true)
          .not('package_end_date','is',null)
          .order('package_end_date',{ascending:true}),
        client.from('care_packages').select('*').eq('is_active',true).order('package_name'),
        client.from('package_renewal_requests').select('*').order('requested_at',{ascending:false}).limit(500)
      ]);
      if(pat.error){setMessage(pat.error.message);setRows([])}
      else setRows(pat.data||[]);
      if(pkg.error)setMessage(prev=>prev||pkg.error.message);
      else setPackages(pkg.data||[]);
      if(req.error)setMessage(prev=>prev||req.error.message);
      else setRequests(req.data||[]);
      setLoading(false);
    }

    React.useEffect(()=>{
      if(!allowed)return;
      load();
      const channel=client.channel('package-expiry-dashboard-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'patients'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'billing_transactions'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'care_packages'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'package_renewal_requests'},load)
        .subscribe();
      return()=>client.removeChannel(channel);
    },[allowed]);

    async function renew(row,opt){
      if(!opt.pkg)return;
      const label=`${opt.kind} · ${opt.pkg.package_name} · ${money(opt.fee)}`;
      if(!window.confirm(`Renew ${formalName(row)} with ${label}?\n\nCoverage will continue from the day after the current package expiry. Any automatic daily Room/Nursing charges inside the renewed coverage will be safely removed by the package-overlap protection.`))return;
      setBusy(`${row.id}:${opt.kind}`);setMessage('');
      const {data,error}=await client.rpc('renew_patient_package',{
        p_patient_id:row.id,
        p_package_id:opt.pkg.id,
        p_start_date:null
      });
      setBusy('');
      if(error){setMessage(error.message);return}
      setMessage(`✓ ${formalName(row)} renewed: ${data?.package_name||opt.pkg.package_name} · ${formatDateIN(data?.coverage_start)} to ${formatDateIN(data?.coverage_end)} · ${money(data?.package_fee||opt.fee)}.`);
      await load();
    }

    async function keepDaily(row){
      if(!window.confirm(`Continue ${formalName(row)} on Daily Fare after package expiry?\n\nNo new package charge will be created. Daily Room + Nursing billing will continue automatically.`))return;
      setBusy(`${row.id}:daily`);setMessage('');
      const {data,error}=await client.rpc('set_patient_daily_billing',{p_patient_id:row.id});
      setBusy('');
      if(error){setMessage(error.message);return}
      setMessage(`✓ ${formalName(row)} will continue on Daily Fare.`);
      await load();
    }

    async function sendReminder(row){
      setBusy(`${row.id}:wa`);setMessage('');
      try{
        const {data:{session}}=await client.auth.getSession();
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/package-expiry-whatsapp`,{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            ...(session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{})
          },
          body:JSON.stringify({patient_id:row.id,force:true})
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.success===false)throw new Error(result.error||'Unable to send package-expiry WhatsApp.');
        const detail=(result.details||[])[0];
        setMessage(detail?.status==='Sent'
          ?`✓ Package expiry WhatsApp sent to ${detail.recipient||'relative'}.`
          :`Package WhatsApp request completed: ${detail?.status||'No message sent'}.`);
      }catch(error){
        setMessage(error.message||String(error));
      }finally{
        setBusy('');
      }
    }

    if(!allowed)return h(Section,{title:'Package Expiry Dashboard'},h('div',{className:'message error'},'Admin, Manager or Accounts access is required.'));

    const sorted=[...rows].sort((a,b)=>String(a.package_end_date||'').localeCompare(String(b.package_end_date||'')));
    const attention=sorted.filter(row=>dateDiff(row.package_end_date,today)<=3);
    const packageVisible=sorted.filter(row=>{
      const diff=dateDiff(row.package_end_date,today);
      if(packageFocus==='Expired')return diff<0;
      if(packageFocus==='Expires Today')return diff===0;
      if(packageFocus==='Next 3 Days')return diff>0&&diff<=3;
      if(packageFocus==='Attention Required')return diff<=3;
      return true;
    });
    const expired=sorted.filter(row=>dateDiff(row.package_end_date,today)<0).length;
    const todayCount=sorted.filter(row=>dateDiff(row.package_end_date,today)===0).length;
    const soon=sorted.filter(row=>{const d=dateDiff(row.package_end_date,today);return d>0&&d<=3}).length;

    return h(React.Fragment,null,
      h('div',{className:'accounts-hero'},
        h('div',null,
          h('small',null,'PACKAGE CONTROL · RENEWAL · DAILY FARE'),
          h('h3',null,'Package Expiry Dashboard'),
          h('p',null,'Track package expiry, send family WhatsApp options and renew Weekly, Fortnightly or Monthly. If no renewal is selected, Daily Fare continues automatically.')
        ),
        h('div',{className:'accounts-actions'},
          h('button',{className:'btn btn-secondary',onClick:load},loading?'Loading…':'↻ Refresh'),
          h('button',{className:'btn btn-secondary',onClick:()=>onNavigate?.('Care Packages')},'Manage Packages')
        )
      ),
      h('div',{className:'accounts-kpi-grid'},
        [
          ['Expired',expired,'red','Requires renewal decision'],
          ['Expires Today',todayCount,'orange','Family reminder due'],
          ['Next 3 Days',soon,'blue','Upcoming package expiry'],
          ['Attention Required',attention.length,'purple','Expired or expiring soon']
        ].map(([label,value,tone,note])=>h('button',{
          type:'button',
          className:`accounts-kpi ${tone}`,
          key:label,
          onClick:()=>setPackageFocus(current=>current===label?'All':label),
          title:`Show ${label} residents`,
          style:{textAlign:'left',cursor:'pointer',border:packageFocus===label?'2px solid #9f174e':undefined}
        },h('span',null,label),h('strong',null,value),h('small',null,note)))
      ),
      message&&h('div',{className:message.startsWith('✓')?'message success':'message error'},message),
      h(Section,{title:loading?'Loading package residents…':`Package Residents (${packageVisible.length})`,subtitle:packageFocus==='All'?'Renewal starts from the day after the current package expiry; daily fare is the automatic fallback.':`Dashboard filter: ${packageFocus}`},
        packageVisible.length?h('div',{className:'table-wrap'},
          h('table',{className:'table'},
            h('thead',null,h('tr',null,
              ['Resident','Room','Current Package','Expiry','Status','Family Contact','Family Request','Renewal Options','Action'].map(x=>h('th',{key:x},x))
            )),
            h('tbody',null,packageVisible.map(row=>{
              const status=statusOf(row);
              const opts=renewalOptions(row);
              return h('tr',{key:row.id},
                h('td',null,h('strong',null,formalName(row)||row.full_name),h('small',{style:{display:'block'}},row.patient_id||'—')),
                h('td',null,`${row.room_no||'—'}${row.bed_no?`-${row.bed_no}`:''}`,h('small',{style:{display:'block'}},row.package_room_class||'')),
                h('td',null,row.billing_package||'Package',h('small',{style:{display:'block'}},row.package_fee?money(row.package_fee):'')),
                h('td',null,formatDateIN(row.package_end_date)),
                h('td',null,h('span',{className:`badge ${status.tone}`},status.label)),
                h('td',null,row.attendant_name||'Family Member',h('small',{style:{display:'block'}},row.attendant_phone||row.mobile||'No WhatsApp number')),
                h('td',null,(()=>{
                  const req=requestOf(row);
                  return req
                    ?h('div',null,
                        h('span',{className:`badge ${String(req.status||'Pending')==='Pending'?'warning':'success'}`},req.requested_option||'Pending'),
                        h('small',{style:{display:'block',marginTop:'5px'}},req.status||'Pending'),
                        h('small',{style:{display:'block'}},req.requested_at?formatDateTimeIN(req.requested_at):'')
                      )
                    :h('span',{className:'small-note'},'Awaiting family');
                })()),
                h('td',null,h('div',{style:{display:'grid',gap:'6px'}},
                  opts.map(opt=>h('button',{
                    type:'button',
                    className:'btn btn-secondary',
                    key:opt.kind,
                    disabled:busy||!opt.pkg,
                    title:opt.pkg?`${opt.pkg.package_name} · ${money(opt.fee)}`:`Configure a ${opt.kind} package in Care Packages`,
                    onClick:()=>renew(row,opt)
                  },opt.pkg?`${opt.kind} · ${money(opt.fee)}`:`${opt.kind} · Not configured`))
                )),
                h('td',null,h('div',{style:{display:'grid',gap:'6px'}},
                  h('button',{type:'button',className:'btn btn-primary',disabled:busy||!(row.attendant_phone||row.mobile),onClick:()=>sendReminder(row)},busy===`${row.id}:wa`?'Sending…':'WhatsApp Options'),
                  h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>keepDaily(row)},busy===`${row.id}:daily`?'Saving…':'Continue Daily Fare')
                ))
              );
            }))
          )
        ):h('p',{className:'empty'},'No active package residents.')
      )
    );
  }

