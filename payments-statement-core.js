(function(root){
'use strict';
const key=v=>String(v||'').trim().toLocaleLowerCase('en-IN');
const cents=v=>Math.round(Number(v||0)*100);
const amount=v=>(v/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const ref=(kind,n)=>'TRIAL-'+kind+'-'+String(n).padStart(5,'0');
function date(v){if(!v)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const d=new Date(v);if(Number.isNaN(d.getTime()))return '';return d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});}
function dateLabel(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('-'):String(v||'');}
function build(data,options){
 const {from,to,mode='payee',payee='',account=''}=options;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)throw Error('Choose a valid From–To period.');
 const requests=data.requests||[],payments=data.payments||[],events=data.events||[];
 const all=[];const included=r=>!payee||key(r.payee)===key(payee);
 function add(row){if(row.date)all.push(row);}
 for(const r of requests){
  if(!included(r))continue;
  const base={requestId:r.id,payee:r.payee,category:r.category,purpose:r.purpose,requestRef:ref('REQ',r.number),billRef:r.bill_ref||'',documents:r.documents||[]};
  if(mode==='payee'){
   const approvals=events.filter(e=>e.request_id===r.id&&e.action==='approve').sort((a,b)=>String(a.at).localeCompare(String(b.at))||Number(a.id)-Number(b.id));
   let previous=0;
   const source=approvals.length?approvals.map(e=>({id:e.id,at:e.at,amount:e.details?.amount??e.details?.request?.approved_amount,actor:e.actor_name,remarks:e.details?.reason})):r.approved_at&&r.approved_amount!=null?[{id:r.id,at:r.approved_at,amount:r.approved_amount,actor:r.approved_name}]:[];
   for(const a of source){const next=cents(a.amount),delta=next-previous;previous=next;if(!delta)continue;
    add({...base,id:'approval-'+a.id,date:date(a.at),sort:String(a.at),type:delta>0?'Approved request':'Approval adjustment',reference:base.requestRef,debit:delta<0?-delta:0,credit:delta>0?delta:0,actor:a.actor,remarks:a.remarks||'',approval:r.approved_name,verification:r.verified_name});}
  }
  for(const p of payments.filter(p=>p.request_id===r.id&&(!account||mode!=='bank'||key(p.account)===key(account)))){
   const paid=cents(p.amount);const common={...base,paymentId:p.id,reference:p.reference||ref('PV',p.number),voucherRef:ref('PV',p.number),bankReference:p.bank_reference||'',method:p.method,account:p.account,actor:p.recorded_name,recordedAt:p.recorded_at,reconciled:!!p.reconciled_at,reconciledBy:p.reconciled_name||'',reversed:!!p.reversed_at,documents:p.proof||[],billDocuments:r.documents||[]};
   add({...common,id:'payment-'+p.id,date:date(p.paid_on),sort:String(p.recorded_at||p.paid_on),type:'Payment',debit:paid,credit:0,remarks:events.find(e=>e.action==='pay'&&e.details?.payment_id===p.id)?.details?.reason||''});
   if(p.reversed_at)add({...common,id:'reversal-'+p.id,date:date(p.reversed_at),sort:String(p.reversed_at),type:'Voucher reversal',debit:0,credit:paid,actor:p.reversed_name,remarks:p.reversal_reason||''});
  }
 }
 all.sort((a,b)=>a.date.localeCompare(b.date)||a.sort.localeCompare(b.sort)||a.id.localeCompare(b.id));
 const opening=all.filter(r=>r.date<from).reduce((n,r)=>n+r.credit-r.debit,0);let running=opening;
 const rows=all.filter(r=>r.date>=from&&r.date<=to).map(r=>({...r,balance:(running+=r.credit-r.debit)}));
 const debit=rows.reduce((n,r)=>n+r.debit,0),credit=rows.reduce((n,r)=>n+r.credit,0);
 return {mode,from,to,payee,account:mode==='bank'?account:'',opening,debit,credit,closing:running,rows,
  title:mode==='payee'?'Payee Ledger Statement':'Bank / Cash Movement Statement',
  balanceLabel:mode==='payee'?'Outstanding':'Net movement',
  scope:[payee||'All payees',mode==='bank'?(account||'All bank / cash accounts'):'Approved requests and settlements'].join(' · '),
  notes:mode==='payee'?['Credit = approved amount payable or voucher reversal. Debit = payment or approval reduction.','Opening / closing = outstanding from authorized trial entries. Not an official general ledger.']:['Debit = recorded payment out. Credit = voucher reversal (book correction, not a confirmed bank receipt).','Opening / closing = cumulative trial net movement. Deposits and opening bank balances are not included; this is not a bank-issued statement.']};
}
function description(r){return [r.type,r.payee,r.category,r.purpose,r.method&&r.method+' / '+r.account,r.bankReference&&'Bank ref: '+r.bankReference,r.remarks].filter(Boolean).join(' | ');}
function csv(s){const esc=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';const rows=[['Samara Assisted Living - '+s.title],['TRIAL - NOT OFFICIAL ACCOUNTS'],['Period',s.from,s.to],['Scope',s.scope],['Date','Reference','Type','Payee','Category','Details','Account','Method','Bank reference','Debit INR','Credit INR',s.balanceLabel+' INR','Reconciliation','Bill reference','Recorded / action by','Remarks'],[s.from,'Opening','','','','','','','',0,0,(s.opening/100).toFixed(2)],...s.rows.map(r=>[r.date,r.reference,r.type,r.payee,r.category,r.purpose,r.account||'',r.method||'',r.bankReference||'',(r.debit/100).toFixed(2),(r.credit/100).toFixed(2),(r.balance/100).toFixed(2),r.paymentId?(r.reversed?'Reversed':r.reconciled?'Reconciled':'Awaiting reconciliation'):'',r.billRef||'',r.actor||'',r.remarks||'']),[s.to,'Closing','','','','','','','',(s.debit/100).toFixed(2),(s.credit/100).toFixed(2),(s.closing/100).toFixed(2)],...s.notes.map(n=>[n])];return '\ufeff'+rows.map(r=>r.map(esc).join(',')).join('\r\n');}
// Canvas preserves Tamil and other Unicode text using the device's installed fonts.
// Repeat headers and split very long rows across pages instead of clipping text.
function pdf(s,logo){
 if(!root.SamaraFoodCore?.pdfFromJpegs)throw Error('PDF tools are not loaded. Refresh the ERP.');
 const W=794,H=1123,M=40,BOTTOM=1068,widths=[86,112,218,92,92,114],pages=[];let canvas,ctx,y,page=0;
 function font(size=11,bold=false){ctx.font=(bold?'bold ':'')+size+'px Arial, sans-serif';}
 function wrap(value,width,size=11,bold=false){font(size,bold);const lines=[];for(const para of String(value??'').split('\n')){let line='';for(const word of para.split(/\s+/)){if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line='';}if(ctx.measureText(word).width>width){for(const char of Array.from(word)){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}}else line+=(line?' ':'')+word;}lines.push(line);}return lines.length?lines:[''];}
 function text(v,x,top,size=11,bold=false,color='#30232a'){font(size,bold);ctx.fillStyle=color;ctx.fillText(String(v),x,top);}
 function finish(){if(!canvas)return;text('Samara Assisted Living | Trial statement',M,H-25,10);text('Page '+page,W-88,H-25,10);const raw=atob(canvas.toDataURL('image/jpeg',.96).split(',')[1]);pages.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
 function newPage(){finish();page++;canvas=document.createElement('canvas');canvas.width=W*2;canvas.height=H*2;ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);if(logo?.naturalWidth){const ratio=logo.naturalWidth/logo.naturalHeight;ctx.drawImage(logo,M,25,Math.min(150,80*ratio),Math.min(80,150/ratio));}text('SAMARA ASSISTED LIVING',220,49,18,true,'#980b52');text(s.title,220,74,15,true);text('TRIAL - NOT OFFICIAL ACCOUNTS',220,95,10,true);y=128;const scope=wrap(s.scope.slice(0,180),W-2*M,12,true);scope.forEach(l=>{text(l,M,y,12,true);y+=16;});text('Period: '+dateLabel(s.from)+' to '+dateLabel(s.to)+' | All amounts in INR',M,y+4,11);y+=28;}
 function block(lines,bg,bold=false){const count=Math.max(...lines.map(l=>l.length));let offset=0;while(offset<count){if(y+30>BOTTOM){newPage();header();}const take=Math.min(count-offset,Math.floor((BOTTOM-y-12)/15));const height=take*15+12;let x=M;lines.forEach((cell,i)=>{ctx.fillStyle=bg;ctx.fillRect(x,y,widths[i],height);ctx.strokeStyle='#dccdd4';ctx.strokeRect(x,y,widths[i],height);for(let j=0;j<take;j++){const continuation=offset>0&&i<2?wrap(cell.join(' ')+(i===1?' (continued)':''),widths[i]-12):null;const str=(continuation?continuation[j]:cell[offset+j])||'';font(11,bold);const left=i>=3?x+widths[i]-7-ctx.measureText(str).width:x+6;text(str,left,y+17+j*15,11,bold);}x+=widths[i];});y+=height;offset+=take;if(offset<count){newPage();header();}}}
 function row(cells,bg='#fff',bold=false){block(cells.map((v,i)=>wrap(v,widths[i]-12,11,bold)),bg,bold);}
 function header(){row(['Date','Reference','Particulars','Debit','Credit',s.balanceLabel],'#f3e5ec',true);}
 newPage();header();row([dateLabel(s.from),'Opening','Balance brought forward','','',amount(s.opening)],'#faf4f7',true);
 for(const r of s.rows)row([dateLabel(r.date),r.reference,description(r),r.debit?amount(r.debit):'',r.credit?amount(r.credit):'',amount(r.balance)]);
 if(!s.rows)row(['','','No transactions in this period.','','','']);
 row([dateLabel(s.to),'Closing','Period totals / closing balance',amount(s.debit),amount(s.credit),amount(s.closing)],'#f3e5ec',true);
 for(const note of s.notes){y+=16;for(const line of wrap(note,W-2*M,11)){if(y+18>BOTTOM)newPage();text(line,M,y,11);y+=16;}}
 finish();return root.SamaraFoodCore.pdfFromJpegs(pages);
}
const api={build,csv,pdf,amount,date,dateLabel,key,description};root.SamaraPaymentStatementCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
