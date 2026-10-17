  // ---------------------------------------------------------------------------------------------
  // 2.17.1 Guest Bill with Breakup (PDF download) — on the Complete Patient Bill page.
  //   Choose Guest (page's own selector) → choose period (Whole stay / This month / Month / Period)
  //   → Apply → preview the category breakup → Download PDF with the Samara logo.
  //   Breakup: Room Rent, Nursing, Pharmacy, Consumables … each with item lines (Qty × Rate = Amount).
  //   Uses the same simple bill lines as the Final Bill and Family Portal (billChargeLines /
  //   billLineLabel) — no Accounts names, approvals or internal remarks.
  // ---------------------------------------------------------------------------------------------
  const BREAKUP_CATEGORY_ORDER=['Room Charges','Nursing Charges','Pharmacy','Consumables','Nursing Procedures','Biomedical Equipment','Oxygen Cylinders','Doctor Services'];
  function breakupCategoryLabel(category){
    const c=String(category||'').trim()||'Other Charges';
    if(c==='Room Charges')return 'Room Rent';
    return c;
  }
  function breakupCategorySort(a,b){
    const ia=BREAKUP_CATEGORY_ORDER.indexOf(a),ib=BREAKUP_CATEGORY_ORDER.indexOf(b);
    return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b);
  }
  function breakupDMY(iso){const v=String(iso||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(v)?`${v.slice(8,10)}-${v.slice(5,7)}-${v.slice(0,4)}`:'—';}
  function breakupIstDay(value){
    if(!value)return '';
    const raw=String(value);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const d=new Date(raw);if(Number.isNaN(d.getTime()))return raw.slice(0,10);
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  }
  // The day a bill row belongs to: service day (source_date), tariff adjustment day, else the entry day.
  function breakupRowDay(row){
    const m=String(row?.description||'').match(/^Tariff adjustment for (\d{2})-(\d{2})-(\d{4})/i);
    if(m)return `${m[3]}-${m[2]}-${m[1]}`;
    return breakupIstDay(row?.source_date)||breakupIstDay(row?.transaction_date);
  }
  function breakupMoney(v){return '₹'+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}

  // Builds every number of the bill for one Guest and one period.
  function buildGuestBreakupBill(rows,from,to){
    const kind=row=>billIsAdvance(row)?'Advance':(row.transaction_type||'Charge');
    const prior={Charge:0,Payment:0,Advance:0,Discount:0,Refund:0},period={Charge:0,Payment:0,Advance:0,Discount:0,Refund:0};
    const charges=[],receipts=[];
    for(const row of rows||[]){
      const day=breakupRowDay(row),type=kind(row),amt=Number(row.amount||0);
      if(!(type in prior))continue;
      if(day&&day<from){prior[type]+=amt;continue;}
      if(!day||day>to)continue;
      period[type]+=amt;
      if(type==='Charge')charges.push(row);else receipts.push({...row,_day:day,_type:type});
    }
    const groups=new Map();
    for(const row of charges){const key=row.category||'Other Charges';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    const categories=[...groups.keys()].sort(breakupCategorySort).map(key=>{
      const lines=billChargeLines(groups.get(key));
      return {key,label:breakupCategoryLabel(key),lines,amount:groups.get(key).reduce((s,r)=>s+Number(r.amount||0),0)};
    });
    receipts.sort((a,b)=>a._day.localeCompare(b._day)||String(a.transaction_date||'').localeCompare(String(b.transaction_date||'')));
    const previous=prior.Charge+prior.Refund-prior.Payment-prior.Advance-prior.Discount;
    const closing=previous+period.Charge+period.Refund-period.Payment-period.Advance-period.Discount;
    return {categories,receipts,period,previous,closing,from,to};
  }

  // A4 PDF drawn on canvas (same engine and look as the other Samara PDF bills).
  function guestBreakupBillPDF(model){
    if(!model.logoImage)throw Error('The Samara logo is required for this bill.');
    const pages=[],W=794,H=1123,M=45,scale=2,CW=W-2*M,BOTTOM=H-92;
    const magenta='#a00050',deep='#7a1247',pink='#fce8f1',soft='#fff7fb',line='#e3c0d2',ink='#302330',muted='#7b6571';
    let canvas,ctx,y=0,page=0,stripe=0,tableHead=null;
    const font=(size,bold=false)=>{ctx.font=(bold?'bold ':'')+size+'px Arial'};
    const text=(value,x,top,size=11,bold=false,color=ink,align='left')=>{font(size,bold);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(value??''),x,top);ctx.textAlign='left'};
    const wrap=(value,width,size=11,bold=false)=>{
      font(size,bold);const out=[];
      for(const para of String(value??'—').split('\n')){
        let cur='';
        for(const word of para.split(' ')){
          const next=cur?cur+' '+word:word;
          if(ctx.measureText(next).width<=width){cur=next;continue;}
          if(cur)out.push(cur);
          if(ctx.measureText(word).width<=width){cur=word;continue;}
          cur='';for(const ch of word){if(ctx.measureText(cur+ch).width>width){out.push(cur);cur=ch}else cur+=ch;}
        }
        out.push(cur);
      }
      return out;
    };
    const contactIcon=(kind,x,baseline)=>{ctx.save();ctx.strokeStyle=magenta;ctx.lineWidth=1.15;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();if(kind==='phone'){[[1,-10],[3,-12],[6,-8],[4,-6],[7,-3],[9,-5],[12,-2],[10,0],[7,-1],[3,-5],[1,-8],[1,-10]].forEach(([dx,dy],i)=>i?ctx.lineTo(x+dx,baseline+dy):ctx.moveTo(x+dx,baseline+dy));}else{ctx.rect(x,baseline-9,12,8);ctx.moveTo(x,baseline-9);ctx.lineTo(x+6,baseline-4);ctx.lineTo(x+12,baseline-9);}ctx.stroke();ctx.restore();};
    const finish=()=>{
      if(!canvas)return;
      ctx.fillStyle=magenta;ctx.fillRect(M,H-78,CW,2);
      const address='RBK VILLA, 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037';
      let size=10;font(size);while(ctx.measureText(address).width>CW&&size>7){size-=0.25;font(size);}text(address,M,H-62,size);
      const phone='9976735577 / 7395961616',email='care@samaraassistedliving.com';
      contactIcon('phone',M,H-46);text(phone,M+17,H-46,10);font(10);const ex=M+17+ctx.measureText(phone).width+20;contactIcon('email',ex,H-46);text(email,ex+17,H-46,10);
      text('Samara Health Care LLP · Computer-generated bill',M,H-24,9,false,muted);
      text('Page '+page,W-M,H-24,10,false,ink,'right');
      const bytes=atob(canvas.toDataURL('image/jpeg',0.94).split(',')[1]);
      pages.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(bytes,c=>c.charCodeAt(0))});
    };
    const newPage=()=>{
      finish();page++;stripe=0;
      canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;ctx=canvas.getContext('2d');ctx.scale(scale,scale);
      ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
      const logo=model.logoImage,ratio=(logo.naturalHeight||logo.height)/(logo.naturalWidth||logo.width),lw=Math.min(180,85/ratio);
      ctx.drawImage(logo,M,20,lw,lw*ratio);
      text('GUEST BILL',W-M,44,20,true,magenta,'right');
      text('With Breakup',W-M,62,11,true,deep,'right');
      text('Bill No: '+model.billNo,W-M,80,10.5,false,ink,'right');
      text('Bill Date: '+model.billDate+'   ·   Period: '+model.periodText,W-M,96,10.5,false,ink,'right');
      ctx.fillStyle=magenta;ctx.fillRect(M,111,CW,3);
      y=136;
      if(page>1&&tableHead)drawRow(tableHead.cells,tableHead.widths,{header:true});
    };
    const ensure=height=>{if(y+height>BOTTOM)newPage();};
    // cells: [{t, align, bold, color}] ; widths: px per column
    function drawRow(cells,widths,opt={}){
      const size=opt.header?10.5:(opt.size||10.5);
      const lines=cells.map((c,i)=>wrap(c.t??'',widths[i]-12,size,opt.header||c.bold||opt.bold));
      const height=Math.max(...lines.map(l=>l.length))*14+11;
      if(!opt.header&&y+height>BOTTOM)newPage();
      let x=M;
      cells.forEach((c,i)=>{
        ctx.fillStyle=opt.header?magenta:(opt.fill||(stripe%2?soft:'#fff'));ctx.fillRect(x,y,widths[i],height);
        ctx.strokeStyle=line;ctx.lineWidth=1;ctx.strokeRect(x,y,widths[i],height);
        const align=c.align||'left',tx=align==='right'?x+widths[i]-6:x+6;
        lines[i].forEach((ln,j)=>text(ln,tx,y+16+j*14,size,opt.header||c.bold||opt.bold,opt.header?'#fff':(c.color||opt.color||ink),align));
        x+=widths[i];
      });
      y+=height;if(!opt.header&&!opt.fill)stripe++;
    }
    const startTable=(cells,widths)=>{ensure(70);tableHead={cells,widths};stripe=0;drawRow(cells,widths,{header:true});};
    const endTable=()=>{tableHead=null;y+=6;};
    const heading=label=>{ensure(120);y+=16;text(label,M,y,14,true,deep);y+=10;};

    newPage();
    // Guest details box
    const g=model.guest,fields=[['Guest Name',g.name],['Guest ID',g.id],['Room / Bed',g.room],['Admission Date',g.admission],['Bill Period',model.periodText],['Status',g.status],['Attendant',g.attendant],['Mobile',g.mobile]];
    const half=(CW-24)/2,rowsNeeded=Math.ceil(fields.length/2),boxH=rowsNeeded*20+16;
    ctx.fillStyle=soft;ctx.fillRect(M,y,CW,boxH);ctx.strokeStyle=line;ctx.strokeRect(M,y,CW,boxH);
    fields.forEach(([k,v],i)=>{const col=i%2,row=Math.floor(i/2),x=M+12+col*(half+12),top=y+22+row*20;text(k,x,top,10.5,true,muted);const value=wrap(v||'—',half-118,11)[0];text(value,x+112,top,11,false,ink);});
    y+=boxH+6;

    // 1. Summary breakup
    heading('1. Bill Summary (Breakup)');
    const sw=[46,CW-46-170,170];
    startTable([{t:'Sl.'},{t:'Particulars'},{t:'Amount',align:'right'}],sw);
    if(model.bill.categories.length)model.bill.categories.forEach((c,i)=>drawRow([{t:String(i+1)},{t:c.label},{t:breakupMoney(c.amount),align:'right'}],sw));
    else drawRow([{t:''},{t:'No charges recorded in this period'},{t:breakupMoney(0),align:'right'}],sw);
    drawRow([{t:''},{t:'Total charges for the period'},{t:breakupMoney(model.bill.period.Charge),align:'right'}],sw,{fill:pink,bold:true,color:deep});
    endTable();

    // 2. Detailed breakup
    if(model.bill.categories.length){
      heading('2. Detailed Breakup');
      const dw=[46,CW-46-80-105-120,80,105,120];
      startTable([{t:'Sl.'},{t:'Particulars'},{t:'Qty',align:'right'},{t:'Rate',align:'right'},{t:'Amount',align:'right'}],dw);
      model.bill.categories.forEach((c,ci)=>{
        drawRow([{t:String(ci+1)},{t:c.label},{t:''},{t:''},{t:''}],dw,{fill:pink,bold:true,color:deep});
        c.lines.forEach(l=>drawRow([{t:''},{t:l.label},{t:billQty(l.qty)+(l.unit?' '+l.unit:''),align:'right'},{t:breakupMoney(l.rate),align:'right'},{t:breakupMoney(l.amount),align:'right'}],dw));
        drawRow([{t:''},{t:c.label+' — Sub-total'},{t:''},{t:''},{t:breakupMoney(c.amount),align:'right'}],dw,{fill:'#fff',bold:true});
      });
      endTable();
    }

    // 3. Payments & adjustments
    heading((model.bill.categories.length?'3':'2')+'. Payments, Advances, Discounts and Refunds (this period)');
    const pw=[46,92,82,86,CW-46-92-82-86-120,120];
    startTable([{t:'Sl.'},{t:'Date'},{t:'Type'},{t:'Mode'},{t:'Reference / Description'},{t:'Amount',align:'right'}],pw);
    if(model.bill.receipts.length)model.bill.receipts.forEach((r,i)=>{
      const mode=String(r.payment_mode||'').trim();
      drawRow([{t:String(i+1)},{t:breakupDMY(r._day)},{t:r._type},{t:!mode||/not applicable/i.test(mode)?'—':mode},{t:billLineLabel(r)},{t:breakupMoney(r.amount),align:'right'}],pw);
    });
    else drawRow([{t:''},{t:''},{t:''},{t:''},{t:'No payments, advances, discounts or refunds in this period'},{t:'—',align:'right'}],pw);
    endTable();

    // 4. Account summary
    const b=model.bill,p=b.period;
    const summary=[
      [b.previous>=0?'Previous balance brought forward':'Advance brought forward (credit)',b.previous>=0?breakupMoney(b.previous):'(−) '+breakupMoney(-b.previous)],
      ['Add: Charges for the period',breakupMoney(p.Charge)],
      ['Less: Advance received',breakupMoney(p.Advance)],
      ['Less: Payments received',breakupMoney(p.Payment)],
      ['Less: Discount',breakupMoney(p.Discount)],
      ['Add: Refunds',breakupMoney(p.Refund)]
    ];
    const payable=b.closing>0.009,closingLabel=payable?'BALANCE PAYABLE':'ADVANCE BALANCE (CREDIT)',closingAmt=Math.abs(b.closing)<0.005?0:Math.abs(b.closing);
    ensure(summary.length*24+40+80);
    y+=18;
    const bw=360,bx=W-M-bw;
    summary.forEach(([k,v],i)=>{ctx.fillStyle=i%2?soft:'#fff';ctx.fillRect(bx,y,bw,24);ctx.strokeStyle=line;ctx.strokeRect(bx,y,bw,24);text(k,bx+10,y+16,11);text(v,bx+bw-10,y+16,11,true,ink,'right');y+=24;});
    ctx.fillStyle=deep;ctx.fillRect(bx,y,bw,32);text(closingLabel,bx+10,y+21,12.5,true,'#fff');text(breakupMoney(closingAmt),bx+bw-10,y+21,13,true,'#fff','right');y+=32;
    y+=14;
    const words=wrap((payable?'Balance payable':'Advance balance')+' (in words): '+billAmountInWords(closingAmt),CW-24,11,true);
    ensure(words.length*15+20);
    ctx.fillStyle=soft;ctx.fillRect(M,y,CW,words.length*15+14);ctx.strokeStyle=line;ctx.strokeRect(M,y,CW,words.length*15+14);
    ctx.fillStyle=magenta;ctx.fillRect(M,y,4,words.length*15+14);
    words.forEach((w,i)=>text(w,M+14,y+18+i*15,11,true,deep));y+=words.length*15+14;
    y+=16;
    for(const note of wrap('This bill shows entries recorded in Samara Care ERP for '+model.periodText+' as on '+model.generatedAt+'. Charges are grouped by category; item lines show Qty × Rate = Amount.',CW,9.5)){ensure(14);text(note,M,y,9.5,false,muted);y+=13;}
    ensure(60);y+=40;
    ctx.fillStyle=muted;ctx.fillRect(W-M-180,y,180,1);text('Authorised Signatory',W-M-90,y+15,10,false,muted,'center');
    finish();
    if(!window.SamaraFoodCore?.pdfFromJpegs)throw Error('PDF tools are still loading. Refresh and try again.');
    return window.SamaraFoodCore.pdfFromJpegs(pages);
  }

  function GuestBreakupBillPanel({patient,profile,patients}){
    const today=todayISOIndia();
    const [mode,setMode]=React.useState('stay');
    const [month,setMonth]=React.useState(today.slice(0,7));
    const [from,setFrom]=React.useState(today.slice(0,8)+'01');
    const [to,setTo]=React.useState(today);
    const {applied,apply,dirty}=useAppliedFilters({mode,month,from,to,pid:patient?.id||''});
    const [rows,setRows]=React.useState(null);
    const [error,setError]=React.useState('');
    const [busy,setBusy]=React.useState(false);

    React.useEffect(()=>{
      let stop=false;setRows(null);setError('');
      if(!patient?.id)return;
      (async()=>{
        const {data,error:e}=await client.from('billing_transactions').select('*').eq('patient_id',patient.id).order('transaction_date',{ascending:true});
        if(stop)return;
        if(e){setError(e.message||'Bill entries could not be loaded.');setRows([]);return;}
        const withUnits=await attachBillUnits((data||[]).map(r=>({...r,description:residentTariffDescription(r,patient.admission_date)})),patient.id);
        if(!stop)setRows(withUnits);
      })();
      return()=>{stop=true};
    },[patient?.id]);

    // Resolve the applied period into from / to (ISO).
    const range=React.useMemo(()=>{
      const a=applied;
      if(a.mode==='stay'){
        const days=(rows||[]).map(breakupRowDay).filter(Boolean).sort();
        const start=[String(patient?.admission_date||'').slice(0,10),days[0]].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')).sort()[0]||today;
        const end=[today,days[days.length-1]].filter(Boolean).sort().pop();
        return {from:start,to:end,label:'Whole stay'};
      }
      if(a.mode==='month'||a.mode==='thismonth'){
        const ym=a.mode==='thismonth'?today.slice(0,7):a.month;
        if(!/^\d{4}-\d{2}$/.test(ym||''))return {error:'Choose a month.'};
        const [yy,mm]=ym.split('-').map(Number);const last=new Date(Date.UTC(yy,mm,0)).getUTCDate();
        return {from:`${ym}-01`,to:`${ym}-${String(last).padStart(2,'0')}`,label:new Date(Date.UTC(yy,mm-1,1)).toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'})};
      }
      if(!a.from||!a.to)return {error:'Choose both From and To dates.'};
      if(a.from>a.to)return {error:'From date must be on or before To date.'};
      return {from:a.from,to:a.to,label:'Selected period'};
    },[applied,rows,patient?.admission_date,today]);

    const bill=React.useMemo(()=>rows&&!range.error&&applied.pid===patient?.id?buildGuestBreakupBill(rows,range.from,range.to):null,[rows,range,applied.pid,patient?.id]);
    const periodText=range.error?'':`${breakupDMY(range.from)} to ${breakupDMY(range.to)}`;

    async function download(){
      if(!patient||!bill)return;
      setBusy(true);setError('');
      try{
        const name=formalName(patient)||patient.full_name||'Guest';
        const billNo=`SB-${patient.patient_id||String(patient.id).slice(0,8)}-${range.from.replaceAll('-','').slice(2)}-${range.to.replaceAll('-','').slice(2)}`;
        const blob=guestBreakupBillPDF({
          logoImage:await samaraDocumentLogo(),
          billNo,billDate:formatDateIN(today),periodText,
          generatedAt:formatDateTimeIN(new Date()),
          guest:{
            name,id:patient.patient_id||'—',
            room:patient.room_no?`${patient.room_no}${patient.bed_no?` / Bed ${patient.bed_no}`:''}`:'—',
            admission:formatDateIN(patient.admission_date)||'—',
            status:patient.is_active===false?'Discharged':'In stay',
            attendant:patient.attendant_name||'—',
            mobile:patient.attendant_phone||patient.mobile||'—'
          },
          bill
        });
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=`${name} - Bill ${breakupDMY(range.from)} to ${breakupDMY(range.to)}.pdf`.replace(/[\\/:*?"<>|]/g,'-');
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
        try{await writeAuditEvent('Guest bill with breakup downloaded','Billing',patient.id,{period_from:range.from,period_to:range.to,bill_no:billNo})}catch(_e){}
      }catch(e){setError(e.message||String(e));}
      setBusy(false);
    }

    const modeBtn=(value,label)=>h('button',{type:'button',className:`btn ${mode===value?'btn-primary':'btn-secondary'}`,onClick:()=>setMode(value)},label);
    return h(Section,{title:'Bill with Breakup (PDF)',subtitle:'Choose a period → Apply → Download the Samara bill with Room Rent, Nursing, Pharmacy, Consumables and other charges shown separately'},
      !patient?h('p',{className:'small-note'},'Select a Guest above first.'):h(React.Fragment,null,
        h('div',{className:'actions',style:{flexWrap:'wrap',gap:'8px'}},modeBtn('stay','Whole Stay'),modeBtn('thismonth','This Month'),modeBtn('month','Month'),modeBtn('period','Period')),
        (mode==='month'||mode==='period')&&h('div',{className:'payment-filter-grid',style:{marginTop:'10px'}},
          mode==='month'&&h('div',{className:'field'},h('label',{htmlFor:'breakup-month'},'Month'),h('input',{id:'breakup-month',type:'month',value:month,max:today.slice(0,7),onChange:e=>setMonth(e.target.value)})),
          mode==='period'&&h('div',{className:'field'},h('label',{htmlFor:'breakup-from'},'From'),h('input',{id:'breakup-from',type:'date',value:from,onChange:e=>setFrom(e.target.value)})),
          mode==='period'&&h('div',{className:'field'},h('label',{htmlFor:'breakup-to'},'To'),h('input',{id:'breakup-to',type:'date',value:to,onChange:e=>setTo(e.target.value)}))),
        h(ApplyFilterButton,{dirty,onApply:apply,style:{marginTop:'10px'}}),
        error&&h('div',{className:'message error'},error),
        range.error&&h('div',{className:'message warning'},range.error),
        rows===null&&h('p',{className:'small-note'},'Loading bill entries…'),
        bill&&h(React.Fragment,null,
          h('p',{className:'small-note',style:{margin:'12px 0 6px'}},`${range.label} · ${periodText}`),
          h(LogTable,{
            title:'Breakup for this period',
            heads:['Sl.','Particulars','Amount'],
            rows:[...bill.categories.map((c,i)=>[i+1,c.label,breakupMoney(c.amount)]),['','Total charges for the period',breakupMoney(bill.period.Charge)],
              ['',bill.previous>=0?'Previous balance brought forward':'Advance brought forward (credit)',breakupMoney(Math.abs(bill.previous))],
              ['','Less: Advance + Payments + Discount',breakupMoney(bill.period.Advance+bill.period.Payment+bill.period.Discount)],
              ...(bill.period.Refund?[['','Add: Refunds',breakupMoney(bill.period.Refund)]]:[]),
              ['',bill.closing>0.009?'Balance payable':'Advance balance (credit)',breakupMoney(Math.abs(bill.closing))]]
          }),
          h('div',{className:'actions',style:{marginTop:'10px'}},
            h('button',{type:'button',className:'btn btn-primary',disabled:busy||dirty,onClick:download,title:dirty?'Press Apply first':''},busy?'Preparing PDF…':'⬇ Download Bill PDF'),
            dirty&&h('small',{className:'small-note'},'Period changed — press Apply first'))
        )
      )
    );
  }
