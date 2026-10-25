  let samaraDocumentLogoPromise;
  function samaraDocumentLogo(){
    if(!samaraDocumentLogoPromise)samaraDocumentLogoPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{samaraDocumentLogoPromise=null;reject(Error('Samara logo could not load. Please retry before generating the document.'));};image.src='assets/samara-logo.png';});
    return samaraDocumentLogoPromise;
  }
  function physioStatementPDF(model){
    if(!model.logoImage)throw Error('The Samara logo is required for this document.');
    const pages=[],W=794,H=1123,M=45,scale=2,widths=model.columnWidths||[76,106,252,84,84,102];let canvas,ctx,y,page=0,rowIndex=0;const magenta='#a00050',pink='#fce8f1';
    const font=(size,bold=false)=>{ctx.font=(bold?'bold ':'')+size+'px Arial';ctx.fillStyle='#302330'};
    // Shared screen/document formatter: display DD-MM-YYYY without changing stored ISO values.
    const display=value=>{if(!window.SamaraDateTime?.text)throw Error('Date formatting tools are still loading. Refresh and retry.');return window.SamaraDateTime.text(String(value??''));};
    const wrap=(value,width,size=11,bold=false)=>{font(size,bold);const lines=[];let line='';for(const char of display(value??'—')){if(char==='\n'||(line&&ctx.measureText(line+char).width>width)){lines.push(line);line=char==='\n'?'':char;}else line+=char;}lines.push(line);return lines;};
    const text=(value,x,top,size=11,bold=false,color='#302330')=>{font(size,bold);ctx.fillStyle=color;ctx.fillText(display(value),x,top)};
    const contactIcon=(kind,x,baseline)=>{ctx.save();ctx.strokeStyle=magenta;ctx.lineWidth=1.15;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();if(kind==='phone'){const points=[[1,-10],[3,-12],[6,-8],[4,-6],[7,-3],[9,-5],[12,-2],[10,0],[7,-1],[3,-5],[1,-8],[1,-10]];points.forEach(([dx,dy],i)=>i?ctx.lineTo(x+dx,baseline+dy):ctx.moveTo(x+dx,baseline+dy));}else{ctx.rect(x,baseline-9,12,8);ctx.moveTo(x,baseline-9);ctx.lineTo(x+6,baseline-4);ctx.lineTo(x+12,baseline-9);}ctx.stroke();ctx.restore();};
    const finish=()=>{if(!canvas)return;ctx.fillStyle=magenta;ctx.fillRect(M,H-78,W-2*M,2);const footerAddress=model.footerAddress||'RBK VILLA, 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037';if(footerAddress){let size=10;font(size);while(ctx.measureText(footerAddress).width>W-2*M&&size>7){size-=0.25;font(size);}text(footerAddress,M,H-62,size);}const footerContact=model.footerContact||'9976735577 / 7395961616 · care@samaraassistedliving.com';const [phone,...other]=footerContact.split('·'),email=other.join('·').trim();let contactSize=10;font(contactSize);while(ctx.measureText(phone.trim()).width+ctx.measureText(email).width+(email?52:16)>W-2*M&&contactSize>7){contactSize-=0.25;font(contactSize);}contactIcon('phone',M,H-46);text(phone.trim(),M+17,H-46,contactSize);if(email){font(contactSize);const emailX=M+17+ctx.measureText(phone.trim()).width+20;contactIcon('email',emailX,H-46);text(email,emailX+17,H-46,contactSize);}text('Page '+page,M,H-24,10);const bytes=atob(canvas.toDataURL('image/jpeg',0.94).split(',')[1]);pages.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(bytes,c=>c.charCodeAt(0))});};
    const newPage=()=>{finish();page++;canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);const logo=model.logoImage,ratio=(logo.naturalHeight||logo.height)/(logo.naturalWidth||logo.width),lw=Math.min(180,85/ratio);ctx.drawImage(logo,M,20,lw,lw*ratio);font(20,true);text('Samara Assisted Living',Math.max(M+lw+16,(W-ctx.measureText('Samara Assisted Living').width)/2),45,20,true,magenta);ctx.fillStyle=magenta;ctx.fillRect(M,111,W-2*M,3);text(model.title||'Physiotherapy Statement',M,140,16,true,magenta);y=158;for(const line of wrap(model.organisation,W-2*M,15,true)){text(line,M,y,15,true);y+=20;}text(model.period,M,y,11);y+=24;};
    const row=(values,header=false)=>{const lines=values.map((value,i)=>wrap(value,widths[i]-10,11,header));const height=Math.max(...lines.map(x=>x.length))*15+12;let x=M;values.forEach((_,i)=>{ctx.fillStyle=header?magenta:(rowIndex%2?pink:'#fff');ctx.fillRect(x,y,widths[i],height);ctx.strokeStyle='#e3c0d2';ctx.strokeRect(x,y,widths[i],height);lines[i].forEach((line,j)=>text(line,x+5,y+17+j*15,11,header,header?'#fff':'#302330'));x+=widths[i];});y+=height;if(!header)rowIndex++;};
    newPage();if(model.contact&&!/care@samaraassistedliving[.]com|9976735577/.test(model.contact)){for(const line of wrap(model.contact,W-2*M)){text(line,M,y,11);y+=15;}}y+=14;if(model.patient){for(const line of ['Patient: '+(model.patient.full_name||'—'),'Address: '+(model.patient.address||'—'),'Mobile: '+(model.patient.phone||'—')]){for(const part of wrap(line,W-2*M,12)){text(part,M,y,12);y+=17;}}y+=12;}row(model.heads,true);
    for(const values of model.rows){const height=Math.max(...values.map((value,i)=>wrap(value,widths[i]-10).length))*15+12;if(y+height>H-92){newPage();row(model.heads,true);}row(values);}
    for(const note of model.notes){const lines=wrap(note,W-2*M,12);if(y+lines.length*16+20>H-92)newPage();y+=20;const total=/^Invoice total|^Closing balance|^Closing payable/.test(note);if(total){ctx.fillStyle=pink;ctx.fillRect(M,y-16,W-2*M,lines.length*16+12);ctx.fillStyle=magenta;ctx.fillRect(M,y-16,4,lines.length*16+12);}for(const line of lines){text(line,M+(total?12:0),y,12,total,total?magenta:'#302330');y+=16;}}
    finish();if(!window.SamaraFoodCore?.pdfFromJpegs)throw Error('PDF tools are still loading. Refresh and try again.');return window.SamaraFoodCore.pdfFromJpegs(pages);
  }

  // 2.18.107 (SQL 285): counts are grouped from the full session list, so tapping a row shows exactly those sessions.
  function PhysioSessionCounts({profile,filters=null}){
    const [from,setFrom]=React.useState(todayISOIndia().slice(0,8)+'01'),[to,setTo]=React.useState(todayISOIndia());
    const [rows,setRows]=React.useState([]),[details,setDetails]=React.useState(null),[error,setError]=React.useState(''),[open,setOpen]=React.useState(null);
    const money=['Admin','Accounts'].includes(profile?.role);
    const period=filters?{from:filters.from,to:filters.to}:{from,to};
    React.useEffect(()=>{let stopped=false;const load=async()=>{try{
        if(filters?.error){setRows([]);setDetails(null);setError(filters.error);return;}
        const res=await client.rpc('physio_session_details',{p_from:period.from,p_to:period.to});
        if(stopped)return;
        if(res.error){ // before SQL 285: the old summary, without details
          const {data,error}=filters?await loadPhysioFilteredCounts(filters):await client.rpc('physio_session_counts',{p_from:from,p_to:to});
          if(stopped)return;setDetails(null);setError(error?.message||'');setRows(error?[]:data||[]);return;}
        const list=(res.data||[]).filter(r=>!filters||filters.patientIds===null||filters.patientIds.includes(r.patient_id));
        const groups=new Map();list.forEach(r=>{const key=r.organisation+'\0'+r.physiotherapist;if(!groups.has(key))groups.set(key,{organisation_name:r.organisation,physiotherapist_name:r.physiotherapist,pay_basis:r.pay_basis,completed:0,pending:0,not_done:0,key});const g=groups.get(key);if(r.status==='Completed')g.completed++;else if(r.status==='Pending')g.pending++;else if(r.status==='Not Done')g.not_done++;});
        setDetails(list);setError('');setRows([...groups.values()].sort((a,b)=>a.organisation_name.localeCompare(b.organisation_name)||a.physiotherapist_name.localeCompare(b.physiotherapist_name)));
      }catch(error){if(!stopped)setError(error.message||'Unable to load counts.')}};
      load();const channel=client.channel('physio-counts-'+profile?.id).on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_sessions'},load).subscribe();const timer=setInterval(load,30000);window.addEventListener('focus',load);return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',load);client.removeChannel(channel)}},[from,to,profile?.id,filters?.key]);
    const rupee=v=>v==null?'—':'₹'+Number(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const clock=v=>{if(!v)return '—';const [hh,mm]=String(v).slice(0,5).split(':').map(Number);return `${hh%12||12}:${String(mm).padStart(2,'0')} ${hh<12?'AM':'PM'}`};
    const total=rows.reduce((t,r)=>({completed:t.completed+Number(r.completed||0),pending:t.pending+Number(r.pending||0),not_done:t.not_done+Number(r.not_done||0)}),{completed:0,pending:0,not_done:0});
    const sessionsOf=g=>(details||[]).filter(r=>r.organisation+'\0'+r.physiotherapist===g.key);
    const fee=r=>r.pay_basis==='Salary'?'Salary':r.org_type==='Samara'&&!r.pay_basis?'—':r.fee_amount!=null?rupee(r.fee_amount)+' posted':r.status==='Completed'?'Not posted':'—';
    return h('section',{className:'card panel'},h('h3',null,'Physiotherapy Session Counts'),
      !filters&&h('div',{className:'form-grid'},h('div',{className:'field'},h('label',null,'From'),h('input',{type:'date',value:from,onChange:e=>setFrom(e.target.value)})),h('div',{className:'field'},h('label',null,'To'),h('input',{type:'date',value:to,onChange:e=>setTo(e.target.value)}))),
      error&&h('p',{className:'message error'},error),
      details&&rows.length>0&&h('p',{className:'small-note'},'Tap a row to see every session with Guest, times, status'+(money?', Guest charge and physiotherapist fee.':'.')),
      h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,['Organisation / Physiotherapy name','Physiotherapist','Completed','Pending','Not Done'].map(x=>h('th',{key:x},x)))),
        h('tbody',null,rows.map((r,i)=>h('tr',{key:i,tabIndex:details?0:undefined,role:details?'button':undefined,style:details?{cursor:'pointer'}:undefined,onClick:()=>details&&setOpen(r),onKeyDown:e=>{if(details&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setOpen(r)}}},
            h('td',null,r.organisation_name),h('td',null,r.physiotherapist_name,r.pay_basis==='Salary'?h('small',{style:{marginLeft:6,color:'#8a5a73'}},'(salary)'):null,details?h('span',{style:{color:'#a91653',marginLeft:6}},'▸'):null),h('td',null,r.completed),h('td',null,r.pending),h('td',null,r.not_done))),
          !rows.length&&h('tr',null,h('td',{colSpan:5,className:'empty'},'No sessions in this period.')),
          rows.length>0&&h('tr',null,h('th',{colSpan:2},'Total'),h('th',null,total.completed),h('th',null,total.pending),h('th',null,total.not_done))))),
      open&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setOpen(null)}},
        h('div',{className:'card modal',role:'dialog','aria-modal':'true',style:{width:'min(1100px,100%)'}},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,open.physiotherapist_name+' · '+open.organisation_name),h('small',null,formatDateIN(period.from)+' to '+formatDateIN(period.to)+' · '+open.completed+' completed, '+open.pending+' pending, '+open.not_done+' not done')),h('button',{type:'button',className:'close',onClick:()=>setOpen(null),'aria-label':'Close'},'×')),
          h('div',{className:'table-wrap'},h('table',{className:'table'},
            h('thead',null,h('tr',null,['Date','Guest','Room','Scheduled','Actual','Status','Notes / Reason','Recorded by',...(money?['Guest charge','Physiotherapist fee']:[])].map(x=>h('th',{key:x},x)))),
            h('tbody',null,sessionsOf(open).map(r=>h('tr',{key:r.session_id},
              h('td',null,formatDateIN(r.session_date)),h('td',null,r.guest_name,h('small',{style:{display:'block'}},r.guest_id||'')),h('td',null,r.room||'—'),h('td',null,clock(r.scheduled_time)),h('td',null,clock(r.actual_time)),h('td',null,r.status),h('td',{style:{whiteSpace:'normal',minWidth:180}},r.notes||r.reason||'—'),h('td',null,r.recorded_by||'—',h('small',{style:{display:'block'}},r.recorded_at?formatDateIN(r.recorded_at):'')),
              ...(money?[h('td',null,r.guest_charge!=null?rupee(r.guest_charge)+' · '+(r.guest_charge_status||''):r.status==='Completed'?'Not billed yet':'—'),h('td',null,fee(r))]:[])))))),
          h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setOpen(null)},'Close')))));
  }

  function PhysiotherapistAccounts({profile}){
    const admin=profile?.role==='Admin';
    const [data,setData]=React.useState({organisations:[],practitioners:[],sessions:[],entries:[],opening:0,balance:0});
    const [organisation,setOrganisation]=React.useState(''),[tab,setTab]=React.useState('Organisations');
    const [from,setFrom]=React.useState(todayISOIndia().slice(0,8)+'01'),[to,setTo]=React.useState(todayISOIndia());
    const [statementFor,setStatementFor]=React.useState(''); // 2.18.107: '' = whole organisation, else physiotherapist id
    const [workRows,setWorkRows]=React.useState([]),[detail,setDetail]=React.useState(null); // 2.18.117: sessions done + row details
    const [supplierPeriod,setSupplierPeriod]=React.useState({mode:'Month',month:todayISOIndia().slice(0,7),from:todayISOIndia().slice(0,8)+'01',to:todayISOIndia()});
    const [form,setForm]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
    const [loading,setLoading]=React.useState(false);const loadVersion=React.useRef(0);const statementFile=React.useRef(null);
    React.useEffect(()=>()=>{if(statementFile.current?.url)URL.revokeObjectURL(statementFile.current.url)},[]);
    const money=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const voucher=row=>'PT-'+String(row.voucher_number||'').padStart(6,'0');
    const org=data.organisations.find(row=>row.id===organisation);
    const orgType=row=>row?.org_type==='Samara'?'Samara':'Outsourced';
    const statementPhysio=data.practitioners.find(p=>p.id===statementFor);
    const feePhysios=data.practitioners.filter(p=>(p.pay_basis||'Session fee')==='Session fee');
    async function load(){
      if(!admin)return;
      const version=++loadVersion.current;setLoading(true);
      try{
      const {data:result,error}=await client.rpc('physio_accounts',{p_action:'load',p_data:{organisation_id:organisation,from,to,...(statementFor?{practitioner_id:statementFor}:{})}});
      if(version!==loadVersion.current)return;
      if(error){setError(error.message);return;}
      setData(result);if(!organisation&&result.organisations?.length)setOrganisation(result.organisations[0].id);
      }catch(error){if(version===loadVersion.current)setError(error.message||'Unable to load accounts.');}finally{if(version===loadVersion.current)setLoading(false);}
    }
    React.useEffect(()=>{load();return()=>{++loadVersion.current}},[organisation,from,to,admin,statementFor]);
    React.useEffect(()=>{setStatementFor('')},[organisation]);
    React.useEffect(()=>{if(!admin||!from||!to)return;let stop=false;client.rpc('physio_session_details',{p_from:from,p_to:to}).then(({data:rows,error})=>{if(!stop)setWorkRows(error?[]:rows||[])}).catch(()=>{});return()=>{stop=true}},[from,to,admin,data.entries]);
    const button=(label,onClick,primary=false)=>h('button',{type:'button',className:'btn '+(primary?'btn-primary':'btn-secondary'),disabled:busy||loading,onClick},label);
    function begin(kind,row={}){
      setError('');setNotice('');
      if(kind==='organisation')setForm({kind,id:row.id||crypto.randomUUID(),existing:!!row.id,name:row.name||'',contact_person:row.contact_person||'',phone:row.phone||'',email:row.email||'',address:row.address||'',gst_number:row.gst_number||'',payment_terms:row.payment_terms||'',default_fee:row.default_fee??'',org_type:row.org_type||'Outsourced',guest_fee:'',is_active:row.is_active!==false,opening_amount:'0',opening_date:from});
      else if(kind==='practitioner')setForm({kind,id:row.id||crypto.randomUUID(),full_name:row.full_name||'',phone:row.phone||'',qualification:row.qualification||'',default_fee:row.default_fee??'',pay_basis:row.pay_basis||(orgType(org)==='Samara'&&row.default_fee==null&&row.id?'Salary':'Session fee'),monthly_salary:row.monthly_salary??'',is_active:row.is_active!==false});
      else if(kind==='post_fee'){const practitioner=data.practitioners.find(p=>p.is_active&&(p.id===row.practitioner_id||p.full_name.trim().toLowerCase()===String(row.physiotherapist_name||'').trim().toLowerCase()));const agreed=Number((data.last_rates||[]).find(r=>r.practitioner_id===practitioner?.id&&String(r.patient_id)===String(row.patient_id))?.rate||0);setForm({kind,session:row,practitioner_id:practitioner?.id||'',rate:agreed||Number(practitioner?.default_fee??org?.default_fee??0)||'',notes:'',request_key:crypto.randomUUID()});}
      else if(kind==='reverse')setForm({kind,entry:row,reason:'',request_key:crypto.randomUUID()});
      else setForm({kind,practitioner_id:statementFor||'',amount:'',entry_date:todayISOIndia(),method:'Bank transfer',reference:'',recipient:'',notes:'',request_key:crypto.randomUUID()});
    }
    async function changePayBasis(row,basis){
      if(busy)return;const fee=row.default_fee; // 2.18.118: no fixed fee — agreed per Guest when posting
      setBusy(true);setError('');
      try{const {error}=await client.rpc('physio_accounts',{p_action:'save_practitioner',p_data:{organisation_id:organisation,id:row.id,full_name:row.full_name,phone:row.phone||'',qualification:row.qualification||'',is_active:row.is_active!==false,pay_basis:basis,default_fee:basis==='Session fee'&&fee!=null?String(fee):'',monthly_salary:row.monthly_salary??''}});if(error)throw error;setNotice(`${row.full_name}: paid by ${basis}.`);await load()}
      catch(e){setError(e.message||'Unable to change.')}finally{setBusy(false)}
    }
    async function submit(e){
      e.preventDefault();if(busy||!admin||!form)return;setBusy(true);setError('');
      try{
        const action=form.kind==='organisation'?'save_organisation':form.kind==='practitioner'?'save_practitioner':form.kind;
        const {kind,session,entry,existing,...fields}=form;
        if((kind==='organisation'||kind==='practitioner')&&String(fields.phone||'').trim()){ // 2.18.124: staff call / WhatsApp this number
          const digits=physioPhoneDigits(fields.phone);if(!digits)throw new Error('Phone: enter a 10-digit mobile number (e.g. 9840115962).');fields.phone=digits;}
        const payload={...fields,organisation_id:kind==='organisation'?form.id:organisation,...(session?{session_id:session.id}:{}),...(entry?{entry_id:entry.id}:{})};
        const {data:result,error}=await client.rpc('physio_accounts',{p_action:action,p_data:payload});
        if(error)throw error;
        if(kind==='organisation'||kind==='practitioner')physioContactCache=null; // 2.18.124: staff see the new number at once
        setForm(null);if(kind==='organisation')setOrganisation(result.id);
        setNotice(result.voucher?'Saved '+voucher({voucher_number:result.voucher}):'Details saved.');await load();
      }catch(error){setError(error.code==='23505'?'An organisation, physiotherapist, or active session fee with these details already exists. Refresh before retrying.':error.message||'Unable to save.');}finally{setBusy(false);}
    }
    const field=(label,key,type='text',required=false)=>h('div',{className:'field'},h('label',null,label),h('input',{'aria-label':label,type,required,value:form[key]??'',step:type==='number'?'0.01':undefined,min:form.kind==='practitioner'&&key==='default_fee'?'0.01':undefined,max:type==='date'?todayISOIndia():undefined,onChange:e=>setForm({...form,[key]:e.target.value})}));
    const text=(label,key)=>h('div',{className:'field span-2'},h('label',null,label),h('textarea',{'aria-label':label,rows:2,value:form[key]||'',onChange:e=>setForm({...form,[key]:e.target.value})}));
    const select=(label,key,options)=>h('div',{className:'field'},h('label',null,label),h('select',{'aria-label':label,required:true,value:form[key],onChange:e=>{const value=e.target.value;setForm({...form,[key]:value,...(key==='practitioner_id'?{rate:(data.practitioners.find(row=>row.id===value)?.default_fee??org?.default_fee)||''}:{})})}},h('option',{value:''},'Select…'),options.map(row=>h('option',{key:row.value,value:row.value},row.label))));
    // 2.18.106: Samara own physiotherapists (salaried) vs Outsourced organisations (paid per session).
    const isSamaraOrg=orgType(org)==='Samara';
    const samaraNote=()=>h('div',{className:'message info'},h('strong',null,org?.name+' is Samara’s own physiotherapy team. '),'All its physiotherapists are on salary, so there are no session fees, payments or statements here. To pay someone per session, open Physiotherapist Panel → Edit and choose “Session fee”.');
    const samaraNoFees=isSamaraOrg&&feePhysios.length===0;
    // 2.18.117: salaried physiotherapists (and an all-salaried organisation) get a WORK statement — sessions done, no money.
    const workScope=!!org&&(statementPhysio?(statementPhysio.pay_basis||'Session fee')==='Salary':samaraNoFees);
    const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
    const workList=workRows.filter(r=>org&&r.organisation===org.name&&(!statementPhysio||norm(r.physiotherapist)===norm(statementPhysio.full_name)));
    const clock=v=>{if(!v)return '—';const [hh,mm]=String(v).slice(0,5).split(':').map(Number);return `${hh%12||12}:${String(mm).padStart(2,'0')} ${hh<12?'AM':'PM'}`};
    const workCount=st=>workList.filter(r=>r.status===st).length;
    const workFields=r=>[['Date',formatDateIN(r.session_date)],['Guest',r.guest_name],['Guest ID',r.guest_id],['Room',r.room],['Organisation',r.organisation],['Physiotherapist',r.physiotherapist],['Paid by',r.pay_basis||'—'],['Scheduled / window start',clock(r.scheduled_time)],['Actual time',clock(r.actual_time)],['Status',r.status],['Reason',r.reason],['Notes',r.notes],['Recorded by',r.recorded_by],['Recorded at',r.recorded_at?formatDateTimeIN(r.recorded_at):''],['Guest charge',r.guest_charge!=null?'₹'+money(r.guest_charge)+' · '+(r.guest_charge_status||''):'Not billed yet'],['Physiotherapist fee',r.pay_basis==='Salary'?'Salary — no session fee':r.fee_amount!=null?'₹'+money(r.fee_amount)+' posted':'Not posted']];
    const ledgerFields=row=>[['Date',formatDateIN(row.entry_date)],['Voucher',voucher(row)],['Type',row.kind+(row.reversed_at?' (reversed)':'')],['Physiotherapist',row.snapshot?.physiotherapist],['Guest',row.snapshot?.patient_name],['Guest ID',row.snapshot?.resident_id],['Room',row.snapshot?.room],['Session date',row.snapshot?.session_date?formatDateIN(row.snapshot.session_date):''],['Scheduled time',row.snapshot?.session_time],['Actual time',row.snapshot?.actual_time],['Rate','₹'+money(row.rate||0)],['Amount',row.amount<0?'Paid ₹'+money(-row.amount):'Fee ₹'+money(row.amount)],['Balance after','₹'+money(row.balance)],['Method',row.method],['Reference',row.reference],['Recipient / payer',row.recipient],['Notes',row.notes],['Session notes',row.snapshot?.notes]];
    const clickTable=(title,heads,rows,onRow)=>h('div',{className:'card panel',style:{marginTop:12}},h('h4',null,title),h('div',{className:'table-wrap'},h('table',{className:'table'},
      h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),
      h('tbody',null,rows.length?rows.map((r,i)=>h('tr',{key:i,role:'button',tabIndex:0,style:{cursor:'pointer'},onClick:()=>onRow(i),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onRow(i)}}},r.map((c,j)=>h('td',{key:j},c)))):h('tr',null,h('td',{colSpan:heads.length,className:'empty'},'No records for this period.'))))),rows.length>0&&h('small',{className:'small-note'},'Tap a row for full details.'));
    const practitionerFor=row=>data.practitioners.find(p=>p.is_active&&(p.pay_basis||'Session fee')==='Session fee'&&(p.id===row.practitioner_id||p.full_name.trim().toLowerCase()===String(row.physiotherapist_name||'').trim().toLowerCase()));
    // 2.18.118: the fee is agreed case by case per Guest — prefer the last fee for this physiotherapist + Guest.
    const lastRate=(practitionerId,patientId)=>Number((data.last_rates||[]).find(r=>r.practitioner_id===practitionerId&&String(r.patient_id)===String(patientId))?.rate||0);
    const feeFor=row=>{const p=practitionerFor(row);return lastRate(p?.id,row.patient_id)||Number(p?.default_fee??org?.default_fee??0)};
    async function postAllAtDefault(){
      if(busy||!admin||samaraNoFees)return;
      const ready=data.sessions.filter(row=>practitionerFor(row)&&feeFor(row)>0),skipped=data.sessions.length-ready.length;
      if(!ready.length){setError('No agreed fee is known yet for these Guests. Use “Post session fee” on each session to enter the fee agreed for that Guest.');return;}
      const total=ready.reduce((n,row)=>n+feeFor(row),0);
      if(!window.confirm(`Post ${ready.length} completed session fee(s) for ${org.name}, total ₹${money(total)}, at the fee already agreed for each Guest?${skipped?`\n${skipped} session(s) without an agreed fee will be left for “Post session fee”.`:''}`))return;
      setBusy(true);setError('');let done=0;const failed=[];
      for(const row of ready){
        try{const {error}=await client.rpc('physio_accounts',{p_action:'post_fee',p_data:{organisation_id:organisation,session_id:row.id,practitioner_id:practitionerFor(row).id,rate:String(feeFor(row)),notes:'Posted with “Post all at default fee”',request_key:crypto.randomUUID()}});if(error)throw error;done++;}
        catch(e){failed.push(`${formatDateIN(row.date)} ${row.patient_name}: ${e.message}`);}
      }
      setBusy(false);setNotice(`${done} session fee(s) posted at the agreed fee.${skipped?` ${skipped} left for “Post session fee” (fee for that Guest not agreed yet).`:''}`);if(failed.length)setError('Not posted: '+failed.join(' · '));await load();
    }
    const ledgerRows=()=>{let balance=Number(data.opening||0);return data.entries.map(row=>{balance=Math.round((balance+Number(row.amount))*100)/100;return {...row,balance}})};
    // Session fees per physiotherapist in the period (reversed fees excluded).
    function physioSummary(rows){
      const map=new Map();rows.filter(r=>r.kind==='Session fee'&&!r.reversed_at).forEach(r=>{const k=r.snapshot?.physiotherapist||'Not recorded';const x=map.get(k)||{name:k,sessions:0,amount:0};x.sessions++;x.amount+=Number(r.amount||0);map.set(k,x)});
      return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
    }
    function physioSummaryNotes(rows){const list=physioSummary(rows);return list.length?['Sessions by physiotherapist: '+list.map(x=>x.name+' — '+x.sessions+' session(s), INR '+money(x.amount)).join(' · ')]:[]}
    function statementModel(){
      if(!org)throw Error('Select an organisation for the statement.');
      if(workScope)return {organisation:org.name+(statementPhysio?' — '+statementPhysio.full_name+' (salary)':' — sessions done'),period:formatDateIN(from)+' to '+formatDateIN(to),contact:[org.contact_person,org.phone,org.email,org.address].filter(Boolean).join(' · '),columnWidths:[76,180,60,128,100,160],
        heads:['Date','Guest / ID','Room','Scheduled / Actual','Physiotherapist','Status / Notes'],
        rows:workList.slice().sort((a,b)=>String(a.session_date).localeCompare(String(b.session_date))).map(r=>[formatDateIN(r.session_date),r.guest_name+'\n'+(r.guest_id||''),r.room||'—',clock(r.scheduled_time)+'\nActual: '+clock(r.actual_time),r.physiotherapist,r.status+(r.notes||r.reason?'\n'+(r.notes||r.reason):'')]),
        notes:['Sessions in period: '+workList.length+' · Completed '+workCount('Completed')+' · Pending '+workCount('Pending')+' · Not done '+workCount('Not Done'),'Salaried physiotherapist — work statement only; no per-session fee is payable.']};
      if(loading||busy||!from||!to||from>to)throw Error('Wait for a valid selected period to load.');
      const rows=ledgerRows(),sum=predicate=>rows.filter(predicate).reduce((total,row)=>total+Number(row.amount),0),closing=rows.at(-1)?.balance??Number(data.opening||0);
      return {organisation:org.name+(statementPhysio?' — '+statementPhysio.full_name:''),period:formatDateIN(from)+' to '+formatDateIN(to),contact:[org.contact_person,org.phone,org.email,org.address,org.gst_number?'GST: '+org.gst_number:''].filter(Boolean).join(' · '),heads:['Date','Type / Voucher','Session / Reference details','Debit / payments INR','Credit / fees INR','Balance payable INR'],rows:rows.map(row=>[formatDateIN(row.entry_date),row.kind+(row.reversed_at?' (reversed)':'')+'\n'+voucher(row),[row.snapshot?.physiotherapist,row.snapshot?.patient_name,row.snapshot?.resident_id,row.snapshot?.room?'Room '+row.snapshot.room:'',row.snapshot?.session_date?formatDateIN(row.snapshot.session_date):'',row.snapshot?.session_date?'Scheduled: '+(row.snapshot.session_time||'—')+' · Actual: '+(row.snapshot.actual_time||'Not recorded'):'',row.rate?'Fee INR '+money(row.rate):'',row.method,row.reference,row.recipient,row.notes].filter(Boolean).join('\n'),row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',money(row.balance)]),notes:['Opening payable INR '+money(data.opening),'Period credits / charges INR '+money(sum(row=>row.amount>0))+' · Period debits / payments INR '+money(-sum(row=>row.amount<0)),...physioSummaryNotes(rows),closing<0?'Advance with organisation INR '+money(-closing):'Closing payable INR '+money(closing),Number(data.unposted||0)>0?Number(data.unposted)+' completed session(s) up to '+formatDateIN(to)+' are not yet posted and are NOT in this statement.':'All completed sessions up to '+formatDateIN(to)+' are posted.','Only posted completed-session fees are included. Reversals remain visible and offset the original entries.']};
    }
    async function getStatementFile(){
      const model=statementModel(),key=JSON.stringify(model);if(statementFile.current?.key===key)return statementFile.current;
      const file=new File([physioStatementPDF({...model,logoImage:await samaraDocumentLogo()})],'Samara-physiotherapy-statement-'+(statementPhysio?statementPhysio.full_name.replace(/[^A-Za-z0-9]+/g,'-')+'-':'')+from+'-to-'+to+'.pdf',{type:'application/pdf'});
      if(statementFile.current?.url)URL.revokeObjectURL(statementFile.current.url);statementFile.current={key,file,url:URL.createObjectURL(file)};return statementFile.current;
    }
    async function printPDF(){const popup=window.open('','_blank');try{if(!popup)throw Error('Allow the PDF window to open.');const {url}=await getStatementFile();popup.location.href=url;setNotice('Use the PDF viewer to print or save. WhatsApp shares this same statement PDF.');}catch(error){if(popup)popup.close();setError(error.message);}}
    async function whatsappPDF(){try{const {file,url}=await getStatementFile();if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Samara Physiotherapy Statement'});return;}const a=document.createElement('a');a.href=url;a.download=file.name;a.click();
      // 2.18.120: on a computer, also open the WhatsApp chat of the physiotherapist / organisation with a short message.
      const digits=String(statementPhysio?.phone||org?.phone||'').replace(/\D/g,'');const waTo=digits.length===10?'91'+digits:digits;
      const msg=`Samara Assisted Living — Physiotherapy statement${statementPhysio?' for '+statementPhysio.full_name:''} (${org?.name||''}), ${formatDateIN(from)} to ${formatDateIN(to)}. PDF attached.`;
      if(waTo.length>=11)window.open('https://wa.me/'+waTo+'?text='+encodeURIComponent(msg),'_blank');
      setNotice(waTo.length>=11?'Statement PDF downloaded and WhatsApp opened — attach the downloaded PDF in the chat and send.':'Statement PDF downloaded. Add a phone number to the physiotherapist / organisation to open their WhatsApp chat directly; for now attach the PDF in WhatsApp.');}catch(error){if(error.name!=='AbortError')setError(error.message||'Unable to share statement.');}}
    function exportCSV(){
      const safe=value=>'"'+String(value??'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';
      const rows=[['SAMARA ASSISTED LIVING — PHYSIOTHERAPY LEDGER'],['Organisation',org?.name],['Contact',org?.contact_person,org?.phone,org?.email],['Address',org?.address],['Period',from,to],['Opening payable',data.opening],['Date','Voucher','Type','Organisation','Physiotherapist','Patient','Resident ID','Room','Session date','Scheduled time','Actual time (IST)','Fee rate','Debit / payments','Credit / fees','Balance payable','Method','Reference','Recipient / payer','Notes'],...ledgerRows().map(row=>[row.entry_date,voucher(row),row.kind,row.snapshot?.organisation||org?.name,row.snapshot?.physiotherapist,row.snapshot?.patient_name,row.snapshot?.resident_id,row.snapshot?.room,row.snapshot?.session_date,row.snapshot?.session_time,row.snapshot?.actual_time,row.rate,row.amount<0?-Number(row.amount):'',row.amount>0?Number(row.amount):'',row.balance,row.method,row.reference,row.recipient,row.notes]),['Closing payable',ledgerRows().at(-1)?.balance??data.opening]];
      const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Physiotherapy-ledger-'+from+'-'+to+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);
    }
    function printStatement(entry){
      const popup=window.open('','_blank');if(!popup){setError('Allow the print window to open.');return;}
      const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const rows=entry?[entry]:ledgerRows();
      const heads=['Date','Voucher','Type','Physiotherapist / Patient','Debit ₹','Credit ₹',...(entry?[]:['Balance payable ₹'])];
      const body=rows.map(row=>'<tr>'+[formatDateIN(row.entry_date),voucher(row),row.kind,[row.snapshot?.physiotherapist,row.snapshot?.patient_name,row.snapshot?.resident_id,row.snapshot?.room].filter(Boolean).join(' · '),row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',...(entry?[]:[money(row.balance)])].map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('');
      popup.document.write('<!doctype html><html><head><meta charset="UTF-8"><title>Physiotherapy '+(entry?'Voucher':'Ledger')+'</title><style>body{font:13px Arial;color:#382734;margin:30px}h1{color:#8e1350;font-size:22px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f9ecf3}@media print{button{display:none}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><button onclick="window.print()">Print / Save PDF</button><img src="assets/samara-logo.png" alt="Samara logo" style="width:180px;height:auto"><h1>Samara Assisted Living</h1><h2>Physiotherapy '+(entry?'Voucher '+esc(voucher(entry)):'Organisation Ledger')+'</h2><h3>'+esc(org?.name)+'</h3><p>'+esc([org?.contact_person,org?.phone,org?.email,org?.address].filter(Boolean).join(' · '))+'</p><p>'+esc(entry?'Date: '+formatDateIN(entry.entry_date):'Period: '+formatDateIN(from)+' to '+formatDateIN(to)+' · Opening payable ₹'+money(data.opening))+'</p><table><thead><tr>'+heads.map(head=>'<th>'+esc(head)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table><p>'+esc(entry?[entry.method,entry.reference,entry.recipient,entry.notes].filter(Boolean).join(' · '):'Closing payable ₹'+money(rows.at(-1)?.balance??data.opening))+'</p></body></html>');popup.document.close();
    }
    if(!admin)return h(PhysioSessionCounts,{profile});
    return h('div',null,
      h('section',{className:'card panel'},h('h3',null,'Physiotherapist Accounts & Fees'),h('p',{className:'small-note'},'Admin access. Samara own team (salary or per-session physiotherapists) and Outsourced organisations (paid per completed session). What the Guest pays is set per Guest by Admin / Director in Patient Rates & Billing. Payment entries record money already paid; they do not transfer money.'),
        error&&h('div',{className:'message error'},error),notice&&h('div',{className:'message success'},notice),
        h('div',{className:'actions'},['Organisations','Physiotherapists','Sessions','Payments','Ledger','Statement','Session Counts'].map(name=>button(name==='Physiotherapists'?'Physiotherapist Panel':name,()=>setTab(name),tab===name))),
        h('div',{className:'form-grid'},h('label',null,'Organisation',h('select',{'aria-label':'Organisation',value:organisation,onChange:e=>{setOrganisation(e.target.value);setForm(null)}},h('option',{value:''},'Select organisation'),data.organisations.map(row=>h('option',{key:row.id,value:row.id},row.name+' · '+(orgType(row)==='Samara'?'Samara own':'Outsourced')+(row.is_active?'':' (inactive)')))))),
        h(PhysioPeriodControls,{value:supplierPeriod,onChange:next=>{setSupplierPeriod(next);const range=physioPeriodRange(next,todayISOIndia());if(range.error){setError(range.error+' Report still shows '+from+' to '+to);return}setError('');setFrom(range.from);setTo(range.to)}}),
        h('p',{className:'small-note'},'Organisation report period: '+formatDateIN(from)+' to '+formatDateIN(to)),
        h('div',{className:'actions'},button('Refresh',load),button('Add organisation',()=>begin('organisation')),org&&button('🖨 Print Statement (PDF)',printPDF,true),org&&button('📲 Send Statement on WhatsApp (PDF)',whatsappPDF,true)),
        org&&h('div',{className:'samara-filter-row'},h('div',{className:'field'},h('label',null,'Statement for'),h('select',{'aria-label':'Statement for',value:statementFor,onChange:e=>setStatementFor(e.target.value)},h('option',{value:''},'Whole organisation — '+org.name),data.practitioners.map(p=>h('option',{key:p.id,value:p.id},'Physiotherapist — '+p.full_name+((p.pay_basis||'Session fee')==='Salary'?' (salary)':' (per session)')))))),
        org&&(workScope?h('p',null,h('strong',null,org.name+(statementPhysio?' — '+statementPhysio.full_name:'')),' · on salary · '+workList.length+' session(s) in period'):h('p',null,h('strong',null,org.name+(statementPhysio?' — '+statementPhysio.full_name:'')+' · '),data.balance<0?'Advance with organisation ₹'+money(-data.balance):'Total payable ₹'+money(data.balance),(()=>{ // 2.18.119: count for the selected physiotherapist, or the whole organisation
          const n=statementPhysio?data.sessions.filter(r=>r.practitioner_id===statementPhysio.id||norm(r.physiotherapist_name)===norm(statementPhysio.full_name)).length:Number(data.unposted||0);
          return n>0&&h('span',{style:{color:'#b42318',fontWeight:700}},` · ${n} completed session(s) of ${statementPhysio?statementPhysio.full_name:'this organisation'} not yet posted — Sessions tab`);})()))),
      tab==='Organisations'&&h(LogTable,{title:'Physiotherapy Organisations',heads:['Organisation','Type','Fee paid / session ₹','Contact person','Phone','GST','Terms','Active','Action'],rows:data.organisations.map(row=>[row.name,orgType(row)==='Samara'?'Samara own team':'Outsourced',orgType(row)==='Samara'?'Per physiotherapist (Panel)':money(row.default_fee),row.contact_person||'—',row.phone||'—',row.gst_number||'—',row.payment_terms||'—',row.is_active?'Yes':'No',button('Edit details',()=>begin('organisation',row))])}),
      tab==='Physiotherapists'&&h('section',{className:'card panel'},button('Add physiotherapist',()=>begin('practitioner')),
        h(LogTable,{title:'Physiotherapist Panel — '+(org?.name||'Select organisation')+(org?(isSamaraOrg?' (Samara own team)':' (Outsourced)'):''),
          heads:['Name','Phone','Qualification','Paid by','Session fee','Monthly salary ₹','Balance payable ₹','Active','Action'],
          rows:data.practitioners.map(row=>{const salary=(row.pay_basis||'Session fee')==='Salary';const bal=(data.practitioner_balances||[]).find(b=>b.practitioner_id===row.id)?.balance;
            return [row.full_name,row.phone||'—',row.qualification||'—',isSamaraOrg?h('select',{'aria-label':'Paid by '+row.full_name,value:salary?'Salary':'Session fee',disabled:busy,onChange:e=>changePayBasis(row,e.target.value)},h('option',{value:'Salary'},'Salary'),h('option',{value:'Session fee'},'Session fee')):'Session fee',salary?'—':row.default_fee==null?(isSamaraOrg||!(Number(org?.default_fee)>0)?'Per Guest (at posting)':'Org. default ₹'+money(org?.default_fee)):'Usual ₹'+money(row.default_fee),salary?(row.monthly_salary!=null?money(row.monthly_salary):'—'):'—',salary?'—':bal==null?'—':money(bal),row.is_active?'Yes':'No',
              h('div',{className:'actions'},button('Edit',()=>begin('practitioner',row)),button('Statement',()=>{setStatementFor(row.id);setTab('Statement')}))]})})),
      ['Sessions','Payments','Ledger'].includes(tab)&&samaraNoFees&&samaraNote(),
      // 2.18.116: before SQL 285 the server lists only outsourced sessions — say so instead of an empty list.
      org&&isSamaraOrg&&!('practitioner_balances' in data)&&h('div',{className:'message error',role:'alert'},h('strong',null,'Samara physiotherapist sessions cannot be listed yet. '),'Run supabase/sql/285_physio_panel_salary_session_fee.sql once in Supabase SQL Editor, then set each Samara physiotherapist to Salary or Session fee in Physiotherapist Panel.'),
      tab==='Sessions'&&!samaraNoFees&&h('section',{className:'card panel'},h('p',{className:'small-note'},'Completed sessions not yet posted. “Post session fee” lets Admin / Director enter the fee agreed for that Guest. “Post all at agreed fee” posts only sessions whose fee is already known (last agreed fee for that physiotherapist and Guest). Posted fees keep their rate.'),data.sessions.length>0&&h('div',{className:'actions'},button(`✓ Post all at agreed fee (${data.sessions.filter(row=>practitionerFor(row)&&feeFor(row)>0).length})`,postAllAtDefault,true)),h(LogTable,{title:'Completed sessions awaiting fee posting',heads:['Date','Scheduled time','Actual time (IST)','Patient','Resident ID','Room','Organisation','Recorded physiotherapist','Notes','Action'],rows:data.sessions.map(row=>[formatDateIN(row.date),row.time||'—',row.actual_time||'Not recorded',row.patient_name,row.resident_id,row.room,row.physiotherapy_name,row.physiotherapist_name||'—',row.notes||'—',h('div',null,practitionerFor(row)?(feeFor(row)>0?h('small',{style:{display:'block'}},'Agreed ₹'+money(feeFor(row))):h('small',{style:{display:'block',color:'#a91653'}},'Enter fee for this Guest')):h('small',{style:{display:'block',color:'#b42318'}},'Choose physiotherapist'),button('Post session fee',()=>begin('post_fee',row)))])})),
      tab==='Payments'&&!samaraNoFees&&h('section',{className:'card panel'},h('div',{className:'actions'},button('Record payment',()=>begin('payment')),button('Record refund received',()=>begin('refund'))),h(LogTable,{title:'Payments and refunds',heads:['Date','Voucher','Type','Amount ₹','Method','Reference','Recipient / payer','Notes','Action'],rows:data.entries.filter(row=>['Payment','Refund'].includes(row.kind)).map(row=>[formatDateIN(row.entry_date),voucher(row),row.kind,money(Math.abs(row.amount)),row.method,row.reference||'—',row.recipient||'—',row.notes||'—',h('div',{className:'actions'},button('Print voucher',()=>printStatement(row)),!row.reversed_at&&button('Reverse',()=>begin('reverse',row)))])})),
      tab==='Ledger'&&!samaraNoFees&&h('section',{className:'card panel'},h('div',{className:'actions'},button('Export CSV',exportCSV),button('Print / Save PDF',printPDF),button('Send WhatsApp (PDF)',whatsappPDF)),h('p',null,'Period opening payable ₹'+money(data.opening)+' · Closing payable ₹'+money(ledgerRows().at(-1)?.balance??data.opening)),h(LogTable,{title:'Organisation Ledger — '+(org?.name||''),heads:['Date','Voucher','Type','Physiotherapist','Patient / Resident ID','Room','Session date / scheduled time','Actual time (IST)','Rate ₹','Debit / payments ₹','Credit / fees ₹','Balance payable ₹','Reference / notes','Action'],rows:ledgerRows().map(row=>[formatDateIN(row.entry_date),voucher(row),row.kind+(row.reversed_at?' (reversed)':''),row.snapshot?.physiotherapist||'—',[row.snapshot?.patient_name,row.snapshot?.resident_id].filter(Boolean).join(' · ')||'—',row.snapshot?.room||'—',[row.snapshot?.session_date?formatDateIN(row.snapshot.session_date):'',row.snapshot?.session_time].filter(Boolean).join(' · ')||'—',row.snapshot?.actual_time||'Not recorded',row.rate?money(row.rate):'—',row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',money(row.balance),[row.reference,row.notes].filter(Boolean).join(' · ')||'—',row.kind!=='Reversal'&&!row.reversed_at?button('Reverse',()=>begin('reverse',row)):'—'])})),
      tab==='Statement'&&h('section',{className:'card panel'},h('h3',null,workScope?'Physiotherapist Work Statement':'Physiotherapy Statement'),
        h('p',{className:'small-note'},workScope?'Sessions done in the period — salaried, so no fees. Print and WhatsApp use the same PDF.':'Fees, payments and balance for the period. Print and WhatsApp use the same statement PDF.'),
        h('div',{className:'actions'},button('Print / Save PDF',printPDF),button('Send WhatsApp (PDF)',whatsappPDF),!workScope&&button('Export CSV',exportCSV)),
        !org?h('p',null,'Choose an organisation to view its statement.'):workScope?h(React.Fragment,null,
          h('p',null,h('strong',null,'Sessions: '+workList.length),' · Completed '+workCount('Completed')+' · Pending '+workCount('Pending')+' · Not done '+workCount('Not Done')),
          clickTable('Sessions done — '+(statementPhysio?statementPhysio.full_name:org.name),['Date','Guest','Room','Scheduled','Actual','Physiotherapist','Status'],workList.map(r=>[formatDateIN(r.session_date),r.guest_name,r.room||'—',clock(r.scheduled_time),clock(r.actual_time),r.physiotherapist,r.status]),i=>setDetail({title:'Session details',fields:workFields(workList[i])}))
        ):h(React.Fragment,null,
          h('p',null,'Opening payable ₹'+money(data.opening)+' · Closing payable ₹'+money(ledgerRows().at(-1)?.balance??data.opening)),
          physioSummary(ledgerRows()).length>0&&h(LogTable,{title:'Sessions by physiotherapist',heads:['Physiotherapist','Sessions','Fees ₹'],rows:physioSummary(ledgerRows()).map(x=>[x.name,x.sessions,money(x.amount)])}),
          clickTable('Statement entries',['Date','Voucher','Type','Physiotherapist / Guest','Debit ₹','Credit ₹','Balance payable ₹'],ledgerRows().map(row=>[formatDateIN(row.entry_date),voucher(row),row.kind+(row.reversed_at?' (reversed)':''),[row.snapshot?.physiotherapist,row.snapshot?.patient_name].filter(Boolean).join(' · ')||row.reference||row.notes||'—',row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',money(row.balance)]),i=>setDetail({title:'Statement entry',fields:ledgerFields(ledgerRows()[i])})),
          workList.length>0&&clickTable('Sessions done in the period',['Date','Guest','Room','Scheduled','Actual','Physiotherapist','Status','Fee'],workList.map(r=>[formatDateIN(r.session_date),r.guest_name,r.room||'—',clock(r.scheduled_time),clock(r.actual_time),r.physiotherapist,r.status,r.pay_basis==='Salary'?'Salary':r.fee_amount!=null?'₹'+money(r.fee_amount):'Not posted']),i=>setDetail({title:'Session details',fields:workFields(workList[i])})))),
      detail&&h(RowDetailModal,{title:detail.title,fields:detail.fields,onClose:()=>setDetail(null)}),
      tab==='Session Counts'&&h(PhysioSessionCounts,{profile}),
      form&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:submit},h('div',{className:'panel-head'},h('h3',null,({organisation:'Organisation details',practitioner:'Physiotherapist details',post_fee:'Post completed-session fee',payment:'Record payment made',refund:'Record refund received',reverse:'Reverse ledger entry'})[form.kind]),button('Close',()=>{if(!busy)setForm(null)})),error&&h('div',{className:'message error'},error),
        h('div',{className:'modal-grid'},
          form.kind==='organisation'&&h(React.Fragment,null,field('Physiotherapy organisation name','name','text',true),field('Contact person','contact_person'),field('Phone','phone'),field('Email','email','email'),text('Address','address'),field('GST number (if applicable)','gst_number'),field('Payment terms','payment_terms'),
            h('div',{className:'field'},h('label',null,'Type'),h('select',{'aria-label':'Organisation type',value:form.org_type,onChange:e=>setForm({...form,org_type:e.target.value,default_fee:e.target.value==='Samara'?'0':form.default_fee})},h('option',{value:'Outsourced'},'Outsourced (paid per session)'),h('option',{value:'Samara'},'Samara own team (staff)'))),
            form.org_type!=='Samara'&&field('Fee paid to physiotherapist per completed session ₹','default_fee','number',true),
            h('p',{className:'small-note span-2'},'What the Guest pays is not set here — Admin / Director sets it per Guest in Patient Rates & Billing.'),!form.existing&&h(React.Fragment,null,field('Opening payable ₹ (negative for advance)','opening_amount','number'),field('Opening date','opening_date','date')),h('label',null,h('input',{type:'checkbox',checked:form.is_active,onChange:e=>setForm({...form,is_active:e.target.checked})}),' Active organisation')),
          form.kind==='practitioner'&&h(React.Fragment,null,field('Physiotherapist name','full_name','text',true),field('Phone','phone'),field('Qualification / registration','qualification'),isSamaraOrg?h('div',{className:'field'},h('label',null,'Paid by'),h('select',{'aria-label':'Paid by',value:form.pay_basis,onChange:e=>setForm({...form,pay_basis:e.target.value})},h('option',{value:'Salary'},'Salary (monthly)'),h('option',{value:'Session fee'},'Session fee (per completed session)'))):h('p',{className:'small-note span-2'},'Outsourced physiotherapists are paid per completed session through '+(org?.name||'the organisation')+'.'),
            form.pay_basis==='Salary'?field('Monthly salary ₹ (for records)','monthly_salary','number'):field('Usual session fee ₹ (optional)','default_fee','number',false),
            h('p',{className:'small-note span-2'},form.pay_basis==='Salary'?'Salaried physiotherapists get no per-session fee or ledger. Salary itself is paid through Payroll.':'The fee is agreed by Admin / Director case by case for each Guest and entered when posting the session (the last agreed fee for that Guest is suggested). A usual fee here is only a starting suggestion.'),h('label',null,h('input',{type:'checkbox',checked:form.is_active,onChange:e=>setForm({...form,is_active:e.target.checked})}),' Active physiotherapist')),
          form.kind==='post_fee'&&h(React.Fragment,null,h('p',{className:'span-2'},form.session.patient_name+' · '+form.session.resident_id+' · '+formatDateIN(form.session.date)),select('Attending physiotherapist','practitioner_id',data.practitioners.filter(row=>row.is_active&&(row.pay_basis||'Session fee')==='Session fee').map(row=>({value:row.id,label:row.full_name}))),field('Fee agreed for this Guest (this session) ₹','rate','number',true),h('p',{className:'small-note span-2'},'Fee agreed by Admin / Director for this Guest. The last fee agreed for this physiotherapist and Guest is filled in — change it if the agreement differs.'),text('Notes / invoice reference','notes')),
          ['payment','refund'].includes(form.kind)&&h(React.Fragment,null,
            h('div',{className:'field'},h('label',null,isSamaraOrg?'Physiotherapist *':'Physiotherapist (optional)'),h('select',{'aria-label':'Payment physiotherapist',required:isSamaraOrg,value:form.practitioner_id||'',onChange:e=>setForm({...form,practitioner_id:e.target.value})},h('option',{value:''},isSamaraOrg?'Choose physiotherapist':'Whole organisation'),feePhysios.map(p=>h('option',{key:p.id,value:p.id},p.full_name)))),
            field('Amount ₹','amount','number',true),field('Actual transaction date','entry_date','date',true),select('Payment method','method',['Bank transfer','UPI','Cheque','Cash','Other'].map(value=>({value,label:value}))),field('Transaction reference','reference','text',form.method!=='Cash'),field('Recipient / payer','recipient','text',form.method==='Cash'),text('Notes / invoice reference','notes')),
          form.kind==='reverse'&&h(React.Fragment,null,h('p',{className:'span-2'},voucher(form.entry)+' · '+form.entry.kind+' · ₹'+money(Math.abs(form.entry.amount))),h('div',{className:'field span-2'},h('label',null,'Reason'),h('textarea',{required:true,rows:2,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value})})))),
        h('div',{className:'actions'},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save'),button('Cancel',()=>setForm(null))))));
  }

  function patientPhysioBillingStatus(session,clinicalApproval){
    if(session.request_id)return session.approval_status==='Approved'?'Posted to patient bill':session.approval_status==='Rejected'?'Rejected — Accounts review':session.approval_status||'Pending Accounts approval';
    if(session.manual_charge_exists)return 'Existing charge — reconcile before billing';
    if(clinicalApproval)return 'Clinical approval required';
    return 'Waiting — Admin / Director to set this Guest’s rate'+(session.overdue?' (over 24 h)':'');
  }
  function PatientPhysioBilling({profile,onNavigate,embedded=false,filters=null}){
    const admin=profile?.role==='Admin',finance=admin||profile?.role==='Accounts';
    const [open,setOpen]=React.useState(embedded),[data,setData]=React.useState({patients:[],rates:[],sessions:[]});
    const [patient,setPatient]=React.useState(''),[form,setForm]=React.useState(null),[busy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(true),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
    const loadVersion=React.useRef(0);
    async function load(){
      if(!finance)return;const version=++loadVersion.current;setLoading(true);setError('');
      try{const result=await client.rpc('patient_physio_billing',{p_action:'load'});if(version!==loadVersion.current)return;if(result.error)throw result.error;setData(result.data);setPatient(current=>current||result.data.patients[0]?.id||'')}
      catch(e){if(version===loadVersion.current)setError(e.message||'Unable to load patient physiotherapy billing')}
      finally{if(version===loadVersion.current)setLoading(false)}
    }
    React.useEffect(()=>{load();if(!finance)return;const channel=client.channel('patient-physio-billing-'+profile.id).on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_sessions'},load).on('postgres_changes',{event:'*',schema:'public',table:'bill_charge_requests'},load).subscribe();return()=>{++loadVersion.current;client.removeChannel(channel)}},[finance,profile?.id]);
    const money=v=>'₹'+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const pending=data.sessions.filter(s=>!s.request_id).length;
    const billingPatient=filters?filters.patientId:patient;
    const sessions=data.sessions.filter(s=>filters?physioMatchesFilter(s,filters):s.patient_id===patient),rates=data.rates.filter(r=>billingPatient?r.patient_id===billingPatient:!filters||filters.patientIds===null||filters.patientIds.includes(r.patient_id));
    React.useEffect(()=>{setForm(null);setNotice('')},[filters?.patientId]);
    function beginRate(){setNotice('');setForm({amount:'',effective_from:sessions.filter(s=>!s.request_id).map(s=>s.session_date).sort()[0]||todayISOIndia(),notes:''})}
    async function save(e){
      e.preventDefault();if(!admin||busy)return;setBusy(true);setError('');
      try{const result=await client.rpc('patient_physio_billing',{p_action:'save_rate',p_data:{patient_id:billingPatient,...form}});if(result.error)throw result.error;setNotice('Patient rate saved. '+result.data.queued+' completed session(s) sent to Accounts for approval.');setForm(null);await load()}
      catch(e){setError(e.message||'Unable to save patient rate')}finally{setBusy(false)}
    }
    const orgName=id=>(data.organisations||[]).find(o=>o.id===id)?.name;
    const overdue=data.sessions.filter(s=>!s.request_id&&s.overdue&&(!filters||physioMatchesFilter(s,filters)));
    async function decideSession(session,decision){
      if(profile?.role!=='Accounts'||busy||!session.request_id)return;
      const amount=Number(session.billing_rate||0);
      if(decision==='Approved'&&!(amount>0)){setError('Admin must set the Guest rate or Guest fee before approval.');return}
      const remarks=window.prompt(decision==='Approved'?'Approve this session at '+(session.fee_source==='Organisation Guest fee'?'the physiotherapy Guest fee':'the Guest’s agreed rate')+' of '+money(amount)+'? Enter verification notes:':'Reason for rejecting this session charge:');
      if(remarks===null)return;if(!remarks.trim()){setError('Enter decision notes.');return}
      setBusy(true);setError('');
      try{const result=await client.rpc('decide_bill_charge_request_v5',{p_request_id:session.request_id,p_decision:decision,p_approved_amount:decision==='Approved'?amount:0,p_remarks:remarks.trim()});if(result.error)throw result.error;setNotice(decision==='Approved'?'Session charge posted to the patient bill.':'Session charge rejected for Accounts review.');await load()}
      catch(e){setError(e.message||'Unable to decide the session charge')}finally{setBusy(false)}
    }
    if(!finance)return null;
    const button=(text,fn)=>h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:fn},text);
    return h('section',{className:'accounts-panel',style:{margin:'16px 0'}},
      !embedded&&h('button',{type:'button',className:'btn btn-secondary','aria-expanded':open,onClick:()=>setOpen(v=>!v)},'Patient Physiotherapy Billing'+(loading?' — loading…':error?' — needs attention':' · '+pending+' completed session(s) awaiting billing')),
      error&&h('p',{role:'alert'},error),
      open&&h(React.Fragment,null,h('h3',null,'Patient Physiotherapy Billing'),h('p',null,'Admin / Director fixes each Guest’s physiotherapy rate case by case, with an effective date. Completed sessions on or after that date then go to Accounts for approval before appearing in the bill and Collection Breakup. The fee paid to physiotherapists is separate (Therapist Accounts).'),
        overdue.length>0&&h('div',{className:'message error',role:'alert'},h('strong',null,`${overdue.length} completed session(s) not billed for over 24 hours. `),'Admin / Director: select the Guest and press “Set Guest rate” — waiting sessions are sent to Accounts automatically.'),
        notice&&h('p',{role:'status'},notice),
        h('div',{className:'actions'},!filters&&h('label',null,'Physiotherapy patient ',h('select',{'aria-label':'Physiotherapy patient',value:patient,onChange:e=>{setPatient(e.target.value);setForm(null);setNotice('')}},h('option',{value:''},'Select patient'),data.patients.map(p=>h('option',{key:p.id,value:p.id},p.full_name+' · '+p.patient_id)))),button('Refresh physiotherapy billing',load),
          admin&&billingPatient&&button('Set Guest rate',beginRate),
          !admin&&h('small',null,'Patient rates can be set only by Admin / Director.'),
          onNavigate&&button('Open Accounts charge approvals',()=>onNavigate('Charge Approvals'))),
        filters&&admin&&!billingPatient&&h('p',null,'Select one patient above to set an agreed rate. The session list follows your patient search and period.'),
        filters&&h('p',null,'Approved rate history is shown in full for the selected patients; the period filters completed sessions.'),
        data.clinical_approval_required&&h('p',{role:'alert'},'Physiotherapy requires clinical approval. Use Nursing Approval Requests; automatic billing requests are paused.'),
        !loading&&data.patients.length===0&&h('p',null,'No active patient has a physiotherapy plan or session.'),
        form&&h('form',{onSubmit:save,className:'form-grid'},
          h('label',null,'Agreed patient rate per session ₹',h('input',{'aria-label':'Agreed patient rate per session',type:'number',min:'0.01',step:'0.01',required:true,value:form.amount,onChange:e=>setForm({...form,amount:e.target.value})})),
          h('label',null,'Effective from',h('input',{'aria-label':'Patient rate effective from',type:'date',required:true,max:todayISOIndia(),value:form.effective_from,onChange:e=>setForm({...form,effective_from:e.target.value})})),
          h('label',null,'Approval notes / agreed terms',h('textarea',{'aria-label':'Patient rate approval notes',required:true,minLength:5,value:form.notes,onChange:e=>setForm({...form,notes:e.target.value})})),
          h('p',null,'Saving queues unbilled completed sessions on or after this date at this rate. Existing requests keep their original rate. Enter a new later effective date for future changes.'),
          h('div',{className:'actions'},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save patient rate & queue sessions'),button('Cancel patient rate',()=>setForm(null)))),
        (patient||filters)&&h(LogTable,{title:'Approved patient rate history',heads:[...(filters?['Patient']:[]),'Effective from','Rate per session','Approval notes'],rows:rates.map(r=>[...(filters?[data.patients.find(p=>p.id===r.patient_id)?.full_name||'Patient']:[]),formatDateIN(r.effective_from),money(r.amount),r.notes])}),
        (patient||filters)&&rates.length===0&&h('p',null,'No rate set for this Guest yet. Admin / Director must set it — completed sessions wait until then (nothing is charged automatically).'),
        (patient||filters)&&h(LogTable,{title:'Completed sessions — patient billing status',heads:['Session date',...(filters?['Patient']:[]),'Physiotherapist','Treatment notes','Charge to Guest','Price from','Billing status',...(profile?.role==='Accounts'?['Accounts decision']:[])],rows:sessions.map(s=>[formatDateIN(s.session_date),...(filters?[data.patients.find(p=>p.id===s.patient_id)?.full_name||'Patient']:[]),s.physiotherapist||'—',s.notes||'—',s.billing_rate==null?'Awaiting rate':money(s.billing_rate),s.fee_source||(s.request_id?'Guest rate':'—'),patientPhysioBillingStatus(s,data.clinical_approval_required),...(profile?.role==='Accounts'?[s.request_id&&s.approval_status==='Pending'?h('div',{className:'actions'},button('Approve agreed rate',()=>decideSession(s,'Approved')),button('Reject charge',()=>decideSession(s,'Rejected'))):'—']:[])])})
      )
    );
  }
  function physiotherapyDashboardAccess(profile){
    const pages=allowedPagesForProfile(profile),admin=profile?.role==='Admin';
    return {allowed:pages.includes('Physiotherapy Dashboard'),clinical:pages.includes('Physiotherapy')&&profile?.role!=='Kitchen',finance:admin||profile?.role==='Accounts',supplier:admin,counts:['Admin','Manager','Nurse','Caregiver'].includes(profile?.role)};
  }
  function PhysiotherapyDashboard({profile,onNavigate,initialTab='Overview'}){
    React.useEffect(()=>{ensureAccountsWorkspaceStyle()},[]);
    const access=physiotherapyDashboardAccess(profile);
    const tabs=['Overview',...(access.clinical?['Sessions']:[]),...(access.finance?['Patient Rates & Billing']:[]),...(access.supplier?['Therapist Accounts']:[])];
    const [tab,setTab]=React.useState(()=>{const intent=typeof readDashboardIntent==='function'?readDashboardIntent('Physiotherapy Dashboard'):null;const want=intent?.extra?.tab||initialTab;return tabs.includes(want)?want:'Overview'});
    const selected=tabs.includes(tab)?tab:'Overview';
    const [summary,setSummary]=React.useState(null),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(false);
    const [selection,setSelection]=React.useState({patientId:'',search:'',mode:'Month',month:todayISOIndia().slice(0,7),from:todayISOIndia().slice(0,8)+'01',to:todayISOIndia()});
    const [patientOptions,setPatientOptions]=React.useState([]),[patientError,setPatientError]=React.useState('');
    const matchingPatients=physioPatientOptions(patientOptions,selection.search);
    const computedFilters=physioMakeFilters(selection,patientOptions,todayISOIndia());
    const filters={...computedFilters,error:computedFilters.error||patientError,key:computedFilters.key+'|'+patientError};
    React.useEffect(()=>{if(!access.allowed)return;let stopped=false;client.from('patients').select('id,full_name,patient_id,room_no,bed_no,is_active').eq('is_active',true).order('full_name').then(result=>{if(stopped)return;if(result.error)setPatientError(result.error.message);else{setPatientOptions(result.data||[]);setPatientError('')}}).catch(e=>{if(!stopped)setPatientError(e.message)});return()=>{stopped=true}},[access.allowed,profile?.id]);
    React.useEffect(()=>{
      if(!access.allowed||!access.finance||selected!=='Overview')return;
      let stopped=false;
      async function load(){setLoading(true);setError('');try{const result=await client.rpc('patient_physio_billing',{p_action:'load'});if(stopped)return;if(result.error)throw result.error;setSummary(result.data)}catch(e){if(!stopped){setError(e.message||'Unable to load physiotherapy billing overview');setSummary(null)}}finally{if(!stopped)setLoading(false)}}
      load();const channel=client.channel('physio-dashboard-summary-'+profile.id).on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_sessions'},load).on('postgres_changes',{event:'*',schema:'public',table:'bill_charge_requests'},load).subscribe();
      return()=>{stopped=true;client.removeChannel(channel)};
    },[access.allowed,access.finance,selected,profile?.id]);
    if(!access.allowed)return h('p',null,'Physiotherapy access is not assigned to this role.');
    const money=v=>'₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
    const sessions=(summary?.sessions||[]).filter(s=>physioMatchesFilter(s,filters)),unbilled=sessions.filter(s=>!s.request_id),pending=sessions.filter(s=>s.request_id&&s.approval_status==='Pending'),posted=sessions.filter(s=>s.approval_status==='Approved');
    const cards=[...(access.clinical?[['Sessions','Sessions & Clinical Review','Record completed sessions, review treatment history and handle corrections.']]:[]),...(access.finance?[['Patient Rates & Billing',access.supplier?'Guest Rates, Guest Fees & Billing':'Review Guest Charges','Guest rates and Guest fees, completed sessions and Accounts approval in one place.']]:[]),...(access.supplier?[['Therapist Accounts','Therapist Accounts','Samara own team & outsourced organisations: fees, Guest fees, payments and Print Statement (PDF).']]:[])];
    return h('div',null,
      h('div',{className:'accounts-hero'},h('div',null,h('small',null,'PHYSIOTHERAPY · CARE · BILLING'),h('h3',null,'Physiotherapy Dashboard'),h('p',null,'One workspace for physiotherapy sessions, patient billing and therapist accounts.'))),
      h('nav',{className:'actions','aria-label':'Physiotherapy workspace',style:{margin:'16px 0'}},tabs.map(name=>h('button',{type:'button',key:name,className:'btn '+(selected===name?'btn-primary':'btn-secondary'),'aria-pressed':selected===name,onClick:()=>setTab(name)},name==='Sessions'?'Sessions & Clinical Review':name))),
      selected!=='Therapist Accounts'&&h('section',{className:'accounts-panel',style:{margin:'16px 0'}},
        h('div',{className:'form-grid'},
          h('label',null,'Search patients (3 characters)',h('input',{'aria-label':'Search physiotherapy patients',type:'search',placeholder:'Name, patient ID or room — type 3 characters',value:selection.search,onChange:e=>setSelection({...selection,search:e.target.value,patientId:''})})),
          h('label',null,'Patient',h('select',{'aria-label':'Dashboard patient',value:selection.patientId,onChange:e=>setSelection({...selection,patientId:e.target.value,search:''})},h('option',{value:''},'All patients'),matchingPatients.map(p=>h('option',{key:p.id,value:p.id},p.full_name+' · '+p.patient_id+(p.room_no?' · Room '+p.room_no+(p.bed_no?'-'+p.bed_no:''):'')))))),
        selection.search.trim().length>0&&selection.search.trim().length<3&&h('small',null,'Enter at least 3 characters to search.'),
        selection.search.trim().length>=3&&!matchingPatients.length&&h('p',null,'No patients match this search.'),
        h(PhysioPeriodControls,{value:selection,onChange:setSelection}),
        patientError&&h('p',{role:'alert'},patientError),filters.error&&h('p',{role:'alert'},filters.error)),
      selected==='Overview'&&h(React.Fragment,null,
        h('div',{className:'accounts-workflow-grid'},cards.map(([target,title,note])=>h('button',{type:'button',key:target,className:'accounts-workflow-card',onClick:()=>setTab(target)},h('strong',null,title),h('p',null,note),h('span',null,'Open →')))),
        access.finance&&h('section',{className:'accounts-panel',style:{margin:'16px 0'}},h('h3',null,'Active Patient Billing Overview'),h('p',null,'Completed sessions for selected patients and period. Charges appear in Accounts and Collection Breakup only after Accounts approval.'),
          error||filters.error?h('p',{role:'alert'},error||filters.error):loading||!summary?h('p',null,'Loading physiotherapy billing…'):
          h('div',{className:'accounts-kpi-grid'},[['Completed Sessions',sessions.length],['Awaiting Patient Rate / Billing Review',unbilled.length],['Pending Accounts Approval',pending.length],['Posted Patient Charges',money(posted.reduce((n,s)=>n+Number(s.amount||0),0))]].map(([label,value])=>h('button',{type:'button',key:label,className:'accounts-kpi teal',onClick:()=>setTab('Patient Rates & Billing')},h('span',null,label),h('strong',null,value),h('small',null,'Open Patient Rates & Billing →'))))),
        access.counts&&h(PhysioSessionCounts,{profile,filters})
      ),
      selected==='Sessions'&&access.clinical&&h(Physiotherapy,{profile,onNavigate,filters}),
      selected==='Patient Rates & Billing'&&access.finance&&h(PatientPhysioBilling,{profile,embedded:true,filters}),
      selected==='Therapist Accounts'&&access.supplier&&h(PhysiotherapistAccounts,{profile})
    );
  }
  function physioPatientOptions(rows,search=''){
    const q=String(search).trim().toLowerCase();return (rows||[]).filter(p=>q.length<3||[p.full_name,p.patient_id,p.room_no,p.bed_no].join(' ').toLowerCase().includes(q));
  }
  function physioPeriodRange(value,today){
    const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
    let from,to;
    if(value.mode==='Today')from=to=today;
    else if(value.mode==='This Week'){const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));from=d.toISOString().slice(0,10);to=today}
    else if(value.mode==='Month'){const m=value.month||today.slice(0,7);if(!/^\d{4}-\d{2}$/.test(m)||m>today.slice(0,7))return {error:'Choose a valid month up to this month.'};from=m+'-01';if(!valid(from))return {error:'Choose a valid month.'};const d=new Date(from+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);to=d.toISOString().slice(0,10);if(to>today)to=today}
    else {from=value.from;to=value.to}
    return !valid(from)||!valid(to)||from>to||to>today?{from,to,error:'Choose valid From and To dates, with From before To and no future dates.'}:{from,to,error:''};
  }
  function physioMakeFilters(selection,patients,today){
    const q=String(selection.search||'').trim(),patientIds=selection.patientId?[selection.patientId]:q.length>=3?physioPatientOptions(patients,q).map(p=>p.id):null;
    const range=physioPeriodRange(selection,today);return {...range,patientId:selection.patientId,patientIds,key:JSON.stringify([patientIds,range.from,range.to,range.error])};
  }
  function physioMatchesFilter(row,filters,dateKey='session_date'){
    if(!filters)return true;if(filters.error)return false;
    const d=String(row[dateKey]||'').slice(0,10);return (filters.patientIds===null||filters.patientIds.includes(row.patient_id))&&d>=filters.from&&d<=filters.to;
  }
  function PhysioPeriodControls({value,onChange}){
    return h('div',null,h('div',{className:'actions',role:'group','aria-label':'Physiotherapy period'},['Today','This Week','Month','Period'].map(mode=>h('button',{type:'button',key:mode,className:'btn '+(value.mode===mode?'btn-primary':'btn-secondary'),'aria-pressed':value.mode===mode,onClick:()=>onChange({...value,mode})},mode))),
      value.mode==='Month'&&h('label',null,'Month ',h('input',{'aria-label':'Physiotherapy month',type:'month',value:value.month,max:todayISOIndia().slice(0,7),onChange:e=>onChange({...value,month:e.target.value})})),
      value.mode==='Period'&&h('div',{className:'form-grid'},h('label',null,'From',h('input',{'aria-label':'Physiotherapy period from',type:'date',value:value.from,max:todayISOIndia(),onChange:e=>onChange({...value,from:e.target.value})})),h('label',null,'To',h('input',{'aria-label':'Physiotherapy period to',type:'date',value:value.to,max:todayISOIndia(),onChange:e=>onChange({...value,to:e.target.value})}))));
  }
  async function loadPhysioFilteredSessions(filters){
    if(filters.error)return {data:[],error:{message:filters.error}};
    if(filters.patientIds!==null&&!filters.patientIds.length)return {data:[],error:null};
    const data=[];for(let offset=0;;offset+=1000){let query=client.from('physiotherapy_sessions').select('*').gte('session_date',filters.from).lte('session_date',filters.to).order('session_date',{ascending:false}).order('id',{ascending:true}).range(offset,offset+999);if(filters.patientIds!==null)query=query.in('patient_id',filters.patientIds);const result=await query;if(result.error)return {data:[],error:result.error};data.push(...(result.data||[]));if((result.data||[]).length<1000)return {data,error:null}}
  }
  async function loadPhysioFilteredCounts(filters){
    const result=await loadPhysioFilteredSessions(filters);if(result.error)return result;
    const organisations=await client.rpc('physio_organisation_options');if(organisations.error)return {data:[],error:organisations.error};
    const groups=new Map();for(const s of result.data){const organisation_name=(organisations.data||[]).find(o=>o.id===s.organisation_id)?.name||'Unassigned',physiotherapist_name=s.physiotherapist_name||'Not recorded',key=organisation_name+'\0'+physiotherapist_name;if(!groups.has(key))groups.set(key,{organisation_name,physiotherapist_name,completed:0,pending:0,not_done:0});const r=groups.get(key);if(s.status==='Completed')r.completed++;else if(s.status==='Pending')r.pending++;else if(s.status==='Not Done')r.not_done++}
    return {data:[...groups.values()].sort((a,b)=>a.organisation_name.localeCompare(b.organisation_name)||a.physiotherapist_name.localeCompare(b.physiotherapist_name)),error:null};
  }
