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
    const newPage=()=>{finish();page++;canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);const logo=model.logoImage,ratio=(logo.naturalHeight||logo.height)/(logo.naturalWidth||logo.width),lw=Math.min(180,85/ratio);ctx.drawImage(logo,M,20,lw,lw*ratio);text('Samara Assisted Living',M+200,45,20,true,magenta);ctx.fillStyle=magenta;ctx.fillRect(M,111,W-2*M,3);text(model.title||'Physiotherapy Statement',M,140,16,true,magenta);y=158;for(const line of wrap(model.organisation,W-2*M,15,true)){text(line,M,y,15,true);y+=20;}text(model.period,M,y,11);y+=24;};
    const row=(values,header=false)=>{const lines=values.map((value,i)=>wrap(value,widths[i]-10,11,header));const height=Math.max(...lines.map(x=>x.length))*15+12;let x=M;values.forEach((_,i)=>{ctx.fillStyle=header?magenta:(rowIndex%2?pink:'#fff');ctx.fillRect(x,y,widths[i],height);ctx.strokeStyle='#e3c0d2';ctx.strokeRect(x,y,widths[i],height);lines[i].forEach((line,j)=>text(line,x+5,y+17+j*15,11,header,header?'#fff':'#302330'));x+=widths[i];});y+=height;if(!header)rowIndex++;};
    newPage();if(model.contact&&!/care@samaraassistedliving[.]com|9976735577/.test(model.contact)){for(const line of wrap(model.contact,W-2*M)){text(line,M,y,11);y+=15;}}y+=14;if(model.patient){for(const line of ['Patient: '+(model.patient.full_name||'—'),'Address: '+(model.patient.address||'—'),'Mobile: '+(model.patient.phone||'—')]){for(const part of wrap(line,W-2*M,12)){text(part,M,y,12);y+=17;}}y+=12;}row(model.heads,true);
    for(const values of model.rows){const height=Math.max(...values.map((value,i)=>wrap(value,widths[i]-10).length))*15+12;if(y+height>H-92){newPage();row(model.heads,true);}row(values);}
    for(const note of model.notes){const lines=wrap(note,W-2*M,12);if(y+lines.length*16+20>H-92)newPage();y+=20;const total=/^Invoice total|^Closing balance|^Closing payable/.test(note);if(total){ctx.fillStyle=pink;ctx.fillRect(M,y-16,W-2*M,lines.length*16+12);ctx.fillStyle=magenta;ctx.fillRect(M,y-16,4,lines.length*16+12);}for(const line of lines){text(line,M+(total?12:0),y,12,total,total?magenta:'#302330');y+=16;}}
    finish();if(!window.SamaraFoodCore?.pdfFromJpegs)throw Error('PDF tools are still loading. Refresh and try again.');return window.SamaraFoodCore.pdfFromJpegs(pages);
  }

  function PhysioSessionCounts({profile,filters=null}){
    const [from,setFrom]=React.useState(todayISOIndia().slice(0,8)+'01'),[to,setTo]=React.useState(todayISOIndia());
    const [rows,setRows]=React.useState([]),[error,setError]=React.useState('');
    React.useEffect(()=>{let stopped=false;const load=async()=>{try{const {data,error}=filters?await loadPhysioFilteredCounts(filters):await client.rpc('physio_session_counts',{p_from:from,p_to:to});if(stopped)return;setError(error?.message||'');setRows(error?[]:data||[])}catch(error){if(!stopped)setError(error.message||'Unable to load counts.')}};load();const channel=client.channel('physio-counts-'+profile?.id).on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_sessions'},load).subscribe();const timer=setInterval(load,30000);window.addEventListener('focus',load);return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',load);client.removeChannel(channel)}},[from,to,profile?.id,filters?.key]);
    return h('section',{className:'card panel'},h('h3',null,'Physiotherapy Session Counts'),
      !filters&&h('div',{className:'form-grid'},h('div',{className:'field'},h('label',null,'From'),h('input',{type:'date',value:from,onChange:e=>setFrom(e.target.value)})),h('div',{className:'field'},h('label',null,'To'),h('input',{type:'date',value:to,onChange:e=>setTo(e.target.value)}))),
      error&&h('p',{className:'message error'},error),
      h(LogTable,{title:'Sessions in selected period',heads:['Organisation / Physiotherapy name','Physiotherapist','Completed','Pending','Not Done'],rows:rows.map(row=>[row.organisation_name,row.physiotherapist_name,row.completed,row.pending,row.not_done])}));
  }

  function PhysiotherapistAccounts({profile}){
    const admin=profile?.role==='Admin';
    const [data,setData]=React.useState({organisations:[],practitioners:[],sessions:[],entries:[],opening:0,balance:0});
    const [organisation,setOrganisation]=React.useState(''),[tab,setTab]=React.useState('Organisations');
    const [from,setFrom]=React.useState(todayISOIndia().slice(0,8)+'01'),[to,setTo]=React.useState(todayISOIndia());
    const [supplierPeriod,setSupplierPeriod]=React.useState({mode:'Month',month:todayISOIndia().slice(0,7),from:todayISOIndia().slice(0,8)+'01',to:todayISOIndia()});
    const [form,setForm]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
    const [loading,setLoading]=React.useState(false);const loadVersion=React.useRef(0);const statementFile=React.useRef(null);
    React.useEffect(()=>()=>{if(statementFile.current?.url)URL.revokeObjectURL(statementFile.current.url)},[]);
    const money=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const voucher=row=>'PT-'+String(row.voucher_number||'').padStart(6,'0');
    const org=data.organisations.find(row=>row.id===organisation);
    async function load(){
      if(!admin)return;
      const version=++loadVersion.current;setLoading(true);
      try{
      const {data:result,error}=await client.rpc('physio_accounts',{p_action:'load',p_data:{organisation_id:organisation,from,to}});
      if(version!==loadVersion.current)return;
      if(error){setError(error.message);return;}
      setData(result);if(!organisation&&result.organisations?.length)setOrganisation(result.organisations[0].id);
      }catch(error){if(version===loadVersion.current)setError(error.message||'Unable to load accounts.');}finally{if(version===loadVersion.current)setLoading(false);}
    }
    React.useEffect(()=>{load();return()=>{++loadVersion.current}},[organisation,from,to,admin]);
    const button=(label,onClick,primary=false)=>h('button',{type:'button',className:'btn '+(primary?'btn-primary':'btn-secondary'),disabled:busy||loading,onClick},label);
    function begin(kind,row={}){
      setError('');setNotice('');
      if(kind==='organisation')setForm({kind,id:row.id||crypto.randomUUID(),existing:!!row.id,name:row.name||'',contact_person:row.contact_person||'',phone:row.phone||'',email:row.email||'',address:row.address||'',gst_number:row.gst_number||'',payment_terms:row.payment_terms||'',default_fee:row.default_fee??'',is_active:row.is_active!==false,opening_amount:'0',opening_date:from});
      else if(kind==='practitioner')setForm({kind,id:row.id||crypto.randomUUID(),full_name:row.full_name||'',phone:row.phone||'',qualification:row.qualification||'',default_fee:row.default_fee??'',is_active:row.is_active!==false});
      else if(kind==='post_fee'){const practitioner=data.practitioners.find(p=>p.is_active&&(p.id===row.practitioner_id||p.full_name.trim().toLowerCase()===String(row.physiotherapist_name||'').trim().toLowerCase()));setForm({kind,session:row,practitioner_id:practitioner?.id||'',rate:(practitioner?.default_fee??org?.default_fee)||'',notes:'',request_key:crypto.randomUUID()});}
      else if(kind==='reverse')setForm({kind,entry:row,reason:'',request_key:crypto.randomUUID()});
      else setForm({kind,amount:'',entry_date:todayISOIndia(),method:'Bank transfer',reference:'',recipient:'',notes:'',request_key:crypto.randomUUID()});
    }
    async function submit(e){
      e.preventDefault();if(busy||!admin||!form)return;setBusy(true);setError('');
      try{
        const action=form.kind==='organisation'?'save_organisation':form.kind==='practitioner'?'save_practitioner':form.kind;
        const {kind,session,entry,existing,...fields}=form;
        const payload={...fields,organisation_id:kind==='organisation'?form.id:organisation,...(session?{session_id:session.id}:{}),...(entry?{entry_id:entry.id}:{})};
        const {data:result,error}=await client.rpc('physio_accounts',{p_action:action,p_data:payload});
        if(error)throw error;
        setForm(null);if(kind==='organisation')setOrganisation(result.id);
        setNotice(result.voucher?'Saved '+voucher({voucher_number:result.voucher}):'Details saved.');await load();
      }catch(error){setError(error.code==='23505'?'An organisation, physiotherapist, or active session fee with these details already exists. Refresh before retrying.':error.message||'Unable to save.');}finally{setBusy(false);}
    }
    const field=(label,key,type='text',required=false)=>h('div',{className:'field'},h('label',null,label),h('input',{'aria-label':label,type,required,value:form[key]??'',step:type==='number'?'0.01':undefined,min:form.kind==='practitioner'&&key==='default_fee'?'0.01':undefined,max:type==='date'?todayISOIndia():undefined,onChange:e=>setForm({...form,[key]:e.target.value})}));
    const text=(label,key)=>h('div',{className:'field span-2'},h('label',null,label),h('textarea',{'aria-label':label,rows:2,value:form[key]||'',onChange:e=>setForm({...form,[key]:e.target.value})}));
    const select=(label,key,options)=>h('div',{className:'field'},h('label',null,label),h('select',{'aria-label':label,required:true,value:form[key],onChange:e=>{const value=e.target.value;setForm({...form,[key]:value,...(key==='practitioner_id'?{rate:(data.practitioners.find(row=>row.id===value)?.default_fee??org?.default_fee)||''}:{})})}},h('option',{value:''},'Select…'),options.map(row=>h('option',{key:row.value,value:row.value},row.label))));
    const ledgerRows=()=>{let balance=Number(data.opening||0);return data.entries.map(row=>{balance=Math.round((balance+Number(row.amount))*100)/100;return {...row,balance}})};
    function statementModel(){
      if(!org)throw Error('Select an organisation for the statement.');
      if(loading||busy||!from||!to||from>to)throw Error('Wait for a valid selected period to load.');
      const rows=ledgerRows(),sum=predicate=>rows.filter(predicate).reduce((total,row)=>total+Number(row.amount),0),closing=rows.at(-1)?.balance??Number(data.opening||0);
      return {organisation:org.name,period:formatDateIN(from)+' to '+formatDateIN(to),contact:[org.contact_person,org.phone,org.email,org.address,org.gst_number?'GST: '+org.gst_number:''].filter(Boolean).join(' · '),heads:['Date','Type / Voucher','Session / Reference details','Debit / payments INR','Credit / fees INR','Balance payable INR'],rows:rows.map(row=>[formatDateIN(row.entry_date),row.kind+(row.reversed_at?' (reversed)':'')+'\n'+voucher(row),[row.snapshot?.physiotherapist,row.snapshot?.patient_name,row.snapshot?.resident_id,row.snapshot?.room?'Room '+row.snapshot.room:'',row.snapshot?.session_date?formatDateIN(row.snapshot.session_date):'',row.snapshot?.session_date?'Scheduled: '+(row.snapshot.session_time||'—')+' · Actual: '+(row.snapshot.actual_time||'Not recorded'):'',row.rate?'Fee INR '+money(row.rate):'',row.method,row.reference,row.recipient,row.notes].filter(Boolean).join('\n'),row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',money(row.balance)]),notes:['Opening payable INR '+money(data.opening),'Period credits / charges INR '+money(sum(row=>row.amount>0))+' · Period debits / payments INR '+money(-sum(row=>row.amount<0)),closing<0?'Advance with organisation INR '+money(-closing):'Closing payable INR '+money(closing),'Only posted completed-session fees are included. Unposted sessions are excluded. Reversals remain visible and offset the original entries.']};
    }
    async function getStatementFile(){
      const model=statementModel(),key=JSON.stringify(model);if(statementFile.current?.key===key)return statementFile.current;
      const file=new File([physioStatementPDF({...model,logoImage:await samaraDocumentLogo()})],'Samara-physiotherapy-statement-'+from+'-to-'+to+'.pdf',{type:'application/pdf'});
      if(statementFile.current?.url)URL.revokeObjectURL(statementFile.current.url);statementFile.current={key,file,url:URL.createObjectURL(file)};return statementFile.current;
    }
    async function printPDF(){const popup=window.open('','_blank');try{if(!popup)throw Error('Allow the PDF window to open.');const {url}=await getStatementFile();popup.location.href=url;setNotice('Use the PDF viewer to print or save. WhatsApp shares this same statement PDF.');}catch(error){if(popup)popup.close();setError(error.message);}}
    async function whatsappPDF(){try{const {file,url}=await getStatementFile();if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Samara Physiotherapy Statement'});return;}const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setNotice('Statement PDF downloaded. Attach it as a document in WhatsApp, as in Food Vendor.');}catch(error){if(error.name!=='AbortError')setError(error.message||'Unable to share statement.');}}
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
      h('section',{className:'card panel'},h('h3',null,'Outsourced Physiotherapy Accounts'),h('p',{className:'small-note'},'Admin access. Fees are posted only for completed sessions. Payment entries record money already paid; they do not transfer money.'),
        error&&h('div',{className:'message error'},error),notice&&h('div',{className:'message success'},notice),
        h('div',{className:'actions'},['Organisations','Physiotherapists','Sessions','Payments','Ledger','Statement','Session Counts'].map(name=>button(name,()=>setTab(name),tab===name))),
        h('div',{className:'form-grid'},h('label',null,'Organisation',h('select',{'aria-label':'Organisation',value:organisation,onChange:e=>{setOrganisation(e.target.value);setForm(null)}},h('option',{value:''},'Select organisation'),data.organisations.map(row=>h('option',{key:row.id,value:row.id},row.name+(row.is_active?'':' (inactive)')))))),
        h(PhysioPeriodControls,{value:supplierPeriod,onChange:next=>{setSupplierPeriod(next);const range=physioPeriodRange(next,todayISOIndia());if(range.error){setError(range.error+' Report still shows '+from+' to '+to);return}setError('');setFrom(range.from);setTo(range.to)}}),
        h('p',{className:'small-note'},'Organisation report period: '+formatDateIN(from)+' to '+formatDateIN(to)),
        h('div',{className:'actions'},button('Refresh',load),button('Add organisation',()=>begin('organisation'))),
        org&&h('p',null,h('strong',null,org.name+' · '),data.balance<0?'Advance with organisation ₹'+money(-data.balance):'Total payable ₹'+money(data.balance))),
      tab==='Organisations'&&h(LogTable,{title:'Physiotherapy Organisations',heads:['Organisation','Contact person','Phone','Email','Address','GST','Terms','Fee / session ₹','Active','Action'],rows:data.organisations.map(row=>[row.name,row.contact_person||'—',row.phone||'—',row.email||'—',row.address||'—',row.gst_number||'—',row.payment_terms||'—',money(row.default_fee),row.is_active?'Yes':'No',button('Edit details',()=>begin('organisation',row))])}),
      tab==='Physiotherapists'&&h('section',{className:'card panel'},button('Add physiotherapist',()=>begin('practitioner')),h(LogTable,{title:'Physiotherapists — '+(org?.name||'Select organisation'),heads:['Name','Phone','Qualification','Default fee / session ₹','Active','Action'],rows:data.practitioners.map(row=>[row.full_name,row.phone||'—',row.qualification||'—',row.default_fee==null?'Organisation default':money(row.default_fee),row.is_active?'Yes':'No',button('Edit details',()=>begin('practitioner',row))])})),
      tab==='Sessions'&&h('section',{className:'card panel'},h('p',{className:'small-note'},'Completed sessions not yet posted. Choose the attending physiotherapist and confirm the fee. Posted fees retain their rate and patient details.'),h(LogTable,{title:'Completed sessions awaiting fee posting',heads:['Date','Scheduled time','Actual time (IST)','Patient','Resident ID','Room','Organisation','Recorded physiotherapist','Notes','Action'],rows:data.sessions.map(row=>[formatDateIN(row.date),row.time||'—',row.actual_time||'Not recorded',row.patient_name,row.resident_id,row.room,row.physiotherapy_name,row.physiotherapist_name||'—',row.notes||'—',button('Post session fee',()=>begin('post_fee',row))])})),
      tab==='Payments'&&h('section',{className:'card panel'},h('div',{className:'actions'},button('Record payment',()=>begin('payment')),button('Record refund received',()=>begin('refund'))),h(LogTable,{title:'Payments and refunds',heads:['Date','Voucher','Type','Amount ₹','Method','Reference','Recipient / payer','Notes','Action'],rows:data.entries.filter(row=>['Payment','Refund'].includes(row.kind)).map(row=>[formatDateIN(row.entry_date),voucher(row),row.kind,money(Math.abs(row.amount)),row.method,row.reference||'—',row.recipient||'—',row.notes||'—',h('div',{className:'actions'},button('Print voucher',()=>printStatement(row)),!row.reversed_at&&button('Reverse',()=>begin('reverse',row)))])})),
      tab==='Ledger'&&h('section',{className:'card panel'},h('div',{className:'actions'},button('Export CSV',exportCSV),button('Print / Save PDF',printPDF),button('Send WhatsApp (PDF)',whatsappPDF)),h('p',null,'Period opening payable ₹'+money(data.opening)+' · Closing payable ₹'+money(ledgerRows().at(-1)?.balance??data.opening)),h(LogTable,{title:'Organisation Ledger — '+(org?.name||''),heads:['Date','Voucher','Type','Physiotherapist','Patient / Resident ID','Room','Session date / scheduled time','Actual time (IST)','Rate ₹','Debit / payments ₹','Credit / fees ₹','Balance payable ₹','Reference / notes','Action'],rows:ledgerRows().map(row=>[formatDateIN(row.entry_date),voucher(row),row.kind+(row.reversed_at?' (reversed)':''),row.snapshot?.physiotherapist||'—',[row.snapshot?.patient_name,row.snapshot?.resident_id].filter(Boolean).join(' · ')||'—',row.snapshot?.room||'—',[row.snapshot?.session_date?formatDateIN(row.snapshot.session_date):'',row.snapshot?.session_time].filter(Boolean).join(' · ')||'—',row.snapshot?.actual_time||'Not recorded',row.rate?money(row.rate):'—',row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',money(row.balance),[row.reference,row.notes].filter(Boolean).join(' · ')||'—',row.kind!=='Reversal'&&!row.reversed_at?button('Reverse',()=>begin('reverse',row)):'—'])})),
      tab==='Statement'&&h('section',{className:'card panel'},h('h3',null,'Physiotherapy Statement'),h('p',{className:'small-note'},'Filter by Organisation and From / To above. Print and WhatsApp use the same statement PDF.'),h('div',{className:'actions'},button('Print / Save PDF',printPDF),button('Send WhatsApp (PDF)',whatsappPDF),button('Export CSV',exportCSV)),org?h(React.Fragment,null,h('h4',null,org.name),h('p',null,formatDateIN(from)+' to '+formatDateIN(to)),h('p',null,'Opening payable ₹'+money(data.opening)+' · Closing payable ₹'+money(ledgerRows().at(-1)?.balance??data.opening)),h(LogTable,{title:'Statement entries',heads:['Date','Voucher','Type','Physiotherapist / Patient','Debit ₹','Credit ₹','Balance payable ₹'],rows:ledgerRows().map(row=>[formatDateIN(row.entry_date),voucher(row),row.kind+(row.reversed_at?' (reversed)':''),[row.snapshot?.physiotherapist,row.snapshot?.patient_name,row.snapshot?.resident_id].filter(Boolean).join(' · ')||row.reference||row.notes||'—',row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',money(row.balance)])})):h('p',null,'Choose an organisation to view its statement.')),
      tab==='Session Counts'&&h(PhysioSessionCounts,{profile}),
      form&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:submit},h('div',{className:'panel-head'},h('h3',null,({organisation:'Organisation details',practitioner:'Physiotherapist details',post_fee:'Post completed-session fee',payment:'Record payment made',refund:'Record refund received',reverse:'Reverse ledger entry'})[form.kind]),button('Close',()=>{if(!busy)setForm(null)})),error&&h('div',{className:'message error'},error),
        h('div',{className:'modal-grid'},
          form.kind==='organisation'&&h(React.Fragment,null,field('Physiotherapy organisation name','name','text',true),field('Contact person','contact_person'),field('Phone','phone'),field('Email','email','email'),text('Address','address'),field('GST number (if applicable)','gst_number'),field('Payment terms','payment_terms'),field('Default fee per completed session ₹','default_fee','number',true),!form.existing&&h(React.Fragment,null,field('Opening payable ₹ (negative for advance)','opening_amount','number'),field('Opening date','opening_date','date')),h('label',null,h('input',{type:'checkbox',checked:form.is_active,onChange:e=>setForm({...form,is_active:e.target.checked})}),' Active organisation')),
          form.kind==='practitioner'&&h(React.Fragment,null,field('Physiotherapist name','full_name','text',true),field('Phone','phone'),field('Qualification / registration','qualification'),field('Default fee per completed session ₹ (optional)','default_fee','number'),h('p',{className:'small-note span-2'},'Leave the fee blank to use the organisation default. Changes apply to future postings; posted fees keep their original rate.'),h('label',null,h('input',{type:'checkbox',checked:form.is_active,onChange:e=>setForm({...form,is_active:e.target.checked})}),' Active physiotherapist')),
          form.kind==='post_fee'&&h(React.Fragment,null,h('p',{className:'span-2'},form.session.patient_name+' · '+form.session.resident_id+' · '+formatDateIN(form.session.date)),select('Attending physiotherapist','practitioner_id',data.practitioners.filter(row=>row.is_active).map(row=>({value:row.id,label:row.full_name}))),field('Agreed fee for this session ₹','rate','number',true),h('p',{className:'small-note span-2'},'The attending physiotherapist’s default fee is filled automatically. Admin can override the agreed fee for this session.'),text('Notes / invoice reference','notes')),
          ['payment','refund'].includes(form.kind)&&h(React.Fragment,null,field('Amount ₹','amount','number',true),field('Actual transaction date','entry_date','date',true),select('Payment method','method',['Bank transfer','UPI','Cheque','Cash','Other'].map(value=>({value,label:value}))),field('Transaction reference','reference','text',form.method!=='Cash'),field('Recipient / payer','recipient','text',form.method==='Cash'),text('Notes / invoice reference','notes')),
          form.kind==='reverse'&&h(React.Fragment,null,h('p',{className:'span-2'},voucher(form.entry)+' · '+form.entry.kind+' · ₹'+money(Math.abs(form.entry.amount))),h('div',{className:'field span-2'},h('label',null,'Reason'),h('textarea',{required:true,rows:2,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value})})))),
        h('div',{className:'actions'},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save'),button('Cancel',()=>setForm(null))))));
  }

  function patientPhysioBillingStatus(session,clinicalApproval){
    if(session.request_id)return session.approval_status==='Approved'?'Posted to patient bill':session.approval_status==='Rejected'?'Rejected — Accounts review':session.approval_status||'Pending Accounts approval';
    if(session.manual_charge_exists)return 'Existing charge — reconcile before billing';
    if(clinicalApproval)return 'Clinical approval required';
    return 'Awaiting Admin / Director patient rate';
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
    async function decideSession(session,decision){
      if(profile?.role!=='Accounts'||busy||!session.request_id)return;
      const amount=Number(session.billing_rate||0);
      if(decision==='Approved'&&!(amount>0)){setError('Admin must set the patient rate before approval.');return}
      const remarks=window.prompt(decision==='Approved'?'Approve this session at the patient’s agreed rate of '+money(amount)+'? Enter verification notes:':'Reason for rejecting this session charge:');
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
      open&&h(React.Fragment,null,h('h3',null,'Patient Physiotherapy Billing'),h('p',null,'Admin / Director sets the agreed patient rate and effective date. Completed sessions then go to Accounts for approval before appearing in charges and Collection Breakup. The general Charge Master and therapist supplier fee are separate.'),
        notice&&h('p',{role:'status'},notice),
        h('div',{className:'actions'},!filters&&h('label',null,'Physiotherapy patient ',h('select',{'aria-label':'Physiotherapy patient',value:patient,onChange:e=>{setPatient(e.target.value);setForm(null);setNotice('')}},h('option',{value:''},'Select patient'),data.patients.map(p=>h('option',{key:p.id,value:p.id},p.full_name+' · '+p.patient_id)))),button('Refresh physiotherapy billing',load),
          admin&&billingPatient&&button('Set patient session rate',beginRate),
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
        (patient||filters)&&rates.length===0&&h('p',null,'No patient-specific rate has been approved. No generic tariff will be applied.'),
        (patient||filters)&&h(LogTable,{title:'Completed sessions — patient billing status',heads:['Session date',...(filters?['Patient']:[]),'Physiotherapist','Treatment notes','Patient rate','Billing status',...(profile?.role==='Accounts'?['Accounts decision']:[])],rows:sessions.map(s=>[formatDateIN(s.session_date),...(filters?[data.patients.find(p=>p.id===s.patient_id)?.full_name||'Patient']:[]),s.physiotherapist||'—',s.notes||'—',s.billing_rate==null?'Awaiting rate':money(s.billing_rate),patientPhysioBillingStatus(s,data.clinical_approval_required),...(profile?.role==='Accounts'?[s.request_id&&s.approval_status==='Pending'?h('div',{className:'actions'},button('Approve agreed rate',()=>decideSession(s,'Approved')),button('Reject charge',()=>decideSession(s,'Rejected'))):'—']:[])])})
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
    const [tab,setTab]=React.useState(tabs.includes(initialTab)?initialTab:'Overview');
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
    const cards=[...(access.clinical?[['Sessions','Sessions & Clinical Review','Record completed sessions, review treatment history and handle corrections.']]:[]),...(access.finance?[['Patient Rates & Billing',access.supplier?'Set Patient Rates & Review Billing':'Review Patient Charges','Patient-specific rates, completed sessions and Accounts approval in one place.']]:[]),...(access.supplier?[['Therapist Accounts','Therapist Accounts','Organisation fees, payments and supplier statements.']]:[])];
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
