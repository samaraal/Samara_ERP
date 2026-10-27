  // 2.18.169: ACCOUNTS / BILLING → Net Profit Statement + Monthly Expenses (Admin / Directors only).
  // Income = charges RAISED in the period (less discounts; Trial Guests excluded) — collections shown below it.
  // Expenses = every ERP source (stock receipts, food vendor, kitchen, petty cash, outsourced physio, outside bills)
  // + Monthly Expenses entered here (salaries paid, rent, electricity …). Equipment purchases count in full
  // in the month bought, on their own line: Operating Profit (before equipment) and Net Profit (after).
  const NP_HEADS=['Salaries','Rent','Electricity','Water','Internet & Phone','Maintenance & Repairs','Housekeeping & Cleaning','Laundry','Marketing & Advertising','Professional Fees (CA / Legal)','Licences & Fees','Transport & Fuel','Insurance','Bank Charges','Office & Stationery','Other'];
  const NP_MODES=['Cash','UPI','Bank Transfer','Cheque','Card'];
  const npMoney=v=>`₹${(Number(v)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const npMonthStart=iso=>`${String(iso).slice(0,7)}-01`;
  const npMonthEnd=iso=>{const [y,m]=String(iso).slice(0,7).split('-').map(Number);const d=new Date(Date.UTC(y,m,0));return d.toISOString().slice(0,10)};
  const npShiftMonth=(iso,n)=>{const [y,m]=String(iso).slice(0,7).split('-').map(Number);const d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,10)};
  const npMonthLabel=iso=>new Date(`${npMonthStart(iso)}T00:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const NP_FIRST_MONTH='2026-08-01'; // Samara inaugurated 27-08-2026
  function npMonthOptions(){const out=[];let m=npMonthStart(todayISOIndia());while(m>=NP_FIRST_MONTH){out.push(m);m=npShiftMonth(m,-1)}return out}
  function npStatementTotals(s){
    if(!s)return null;
    const gross=(s.income||[]).reduce((t,x)=>t+Number(x.amount||0),0);
    const netIncome=gross-Number(s.discounts||0);
    const erp=(s.erp_expenses||[]).reduce((t,x)=>t+Number(x.amount||0),0);
    const opex=erp+Number(s.outgoing_total||0)+Number(s.manual_total||0);
    const operating=netIncome-opex;
    const net=operating-Number(s.equipment||0);
    return {gross,netIncome,erp,opex,operating,net,margin:netIncome?net/netIncome*100:0};
  }

  function NetProfitStatement({profile,onNavigate}){
    const isAdmin=profile?.role==='Admin';
    const today=todayISOIndia();
    const [mode,setMode]=React.useState('month'); // month | custom
    const [month,setMonth]=React.useState(npMonthStart(today));
    const [draft,setDraft]=React.useState({from:'',to:''}),[custom,setCustom]=React.useState({from:'',to:''});
    const [cur,setCur]=React.useState(null),[prev,setPrev]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const range=mode==='month'?[month,npMonthEnd(month)>today?today:npMonthEnd(month)]:[custom.from,custom.to];
    const prevRange=mode==='month'?[npShiftMonth(month,-1),npMonthEnd(npShiftMonth(month,-1))]:null;
    const periodName=mode==='month'?npMonthLabel(month)+(npMonthEnd(month)>today?` (to ${formatDateIN(today)})`:''):`${formatDateIN(custom.from)} – ${formatDateIN(custom.to)}`;
    async function load(){
      if(!isAdmin||!range[0]||!range[1])return;
      setBusy(true);setError('');
      try{
        const a=await client.rpc('get_net_profit_statement',{p_from:range[0],p_to:range[1]});if(a.error)throw a.error;setCur(a.data);
        if(prevRange&&prevRange[1]>=NP_FIRST_MONTH){const b=await client.rpc('get_net_profit_statement',{p_from:prevRange[0]<'2026-08-27'?'2026-08-27':prevRange[0],p_to:prevRange[1]});setPrev(b.error?null:b.data);}else setPrev(null);
      }catch(e){setError(/get_net_profit_statement|function/i.test(e.message||'')&&/not find|does not exist/i.test(e.message||'')?'The Net Profit database update (SQL 305) has not been run yet.':(e.message||'Unable to load the statement.'));setCur(null)}
      finally{setBusy(false)}
    }
    React.useEffect(()=>{load()},[mode,month,custom.from,custom.to]);
    if(!isAdmin)return h(Section,{title:'Net Profit Statement'},h('p',null,'Admin / Directors only.'));
    const T=npStatementTotals(cur),P=npStatementTotals(prev);
    const prevName=prevRange?npMonthLabel(prevRange[0]):'';
    // statement lines: [label, current, previous, kind]
    const lines=[];
    if(cur){
      lines.push(['INCOME — charges raised (Trial Guests excluded)',null,null,'head']);
      const cats=[...new Set([...(cur.income||[]).map(x=>x.category),...((prev&&prev.income)||[]).map(x=>x.category)])];
      const amt=(s,c)=>Number(((s&&s.income)||[]).find(x=>x.category===c)?.amount||0);
      cats.forEach(c=>lines.push([c,amt(cur,c),prev?amt(prev,c):null,'row']));
      lines.push(['Gross charges',T.gross,P?P.gross:null,'sub']);
      lines.push(['Less: discounts given',-Number(cur.discounts||0),prev?-Number(prev.discounts||0):null,'row']);
      lines.push(['NET INCOME',T.netIncome,P?P.netIncome:null,'total']);
      lines.push(['EXPENSES — from ERP records',null,null,'head']);
      (cur.erp_expenses||[]).forEach((x,i)=>lines.push([x.head+(x.note?` ⚠ ${x.note}`:''),Number(x.amount||0),prev?Number(prev.erp_expenses?.[i]?.amount||0):null,'row']));
      const oHeads=[...new Set([...(cur.outgoing_expenses||[]).map(x=>x.head),...((prev&&prev.outgoing_expenses)||[]).map(x=>x.head)])];
      if(oHeads.length){lines.push(['EXPENSES — paid through Outgoing Payments',null,null,'head']);
        const oAmt=(s,hd)=>Number(((s&&s.outgoing_expenses)||[]).find(x=>x.head===hd)?.amount||0);
        oHeads.forEach(hd=>lines.push([hd,oAmt(cur,hd),prev?oAmt(prev,hd):null,'row']));}
      lines.push(['EXPENSES — Monthly Expenses entered',null,null,'head']);
      const heads=[...new Set([...(cur.manual_expenses||[]).map(x=>x.head),...((prev&&prev.manual_expenses)||[]).map(x=>x.head)])];
      const mAmt=(s,hd)=>Number(((s&&s.manual_expenses)||[]).find(x=>x.head===hd)?.amount||0);
      if(!heads.length)lines.push(['No monthly expenses entered for this period (salaries, rent, electricity …)',0,prev?0:null,'note']);
      heads.forEach(hd=>lines.push([hd,mAmt(cur,hd),prev?mAmt(prev,hd):null,'row']));
      lines.push(['TOTAL OPERATING EXPENSES',T.opex,P?P.opex:null,'total']);
      lines.push(['OPERATING PROFIT (before equipment)',T.operating,P?P.operating:null,'profit']);
      lines.push(['Less: equipment purchases (counted in full when bought)',-Number(cur.equipment||0),prev?-Number(prev.equipment||0):null,'row']);
      lines.push(['NET PROFIT',T.net,P?P.net:null,'profit']);
    }
    const colour=v=>({color:Number(v)<0?'#b42336':'#087f5b'});
    const cell=(v,kind)=>v==null?'':(['profit','total'].includes(kind)?h('strong',{style:kind==='profit'?colour(v):null},npMoney(v)):npMoney(v));
    function exportRows(){return lines.map(([l,c,p,k])=>[l,k==='head'?'':(c==null?'':Math.round(c*100)/100),k==='head'||p==null?'':Math.round(p*100)/100])}
    function printIt(){
      const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const w=samaraPrintBar(window.open('','_blank'));if(!w){alert('Please allow pop-ups to print.');return;}
      const body=lines.map(([l,c,p,k])=>`<tr class="${k}"><td>${esc(l)}</td><td class="n">${k==='head'||c==null?'':esc(npMoney(c))}</td>${prev?`<td class="n">${k==='head'||p==null?'':esc(npMoney(p))}</td>`:''}</tr>`).join('');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Net Profit Statement</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:22px;color:#222}h2{margin:0;color:#8f1d5a}p{margin:2px 0 12px;color:#555}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #edd5e0;padding:6px 8px;text-align:left}th{background:#fbe3ee}.n{text-align:right;white-space:nowrap}tr.head td{background:#fdf0f5;font-weight:700;color:#7d1748;padding-top:12px}tr.total td,tr.sub td{font-weight:700}tr.profit td{font-weight:800;font-size:13.5px;border-top:2px solid #b44a7d}small{color:#666}</style></head><body><h2>Samara Health Care — Net Profit Statement</h2><p>${esc(periodName)} · prepared ${esc(formatDateIN(new Date()))} by ${esc(cur?.generated_by||'')}</p><table><thead><tr><th>Particulars</th><th class="n">${esc(periodName)}</th>${prev?`<th class="n">${esc(prevName)}</th>`:''}</tr></thead><tbody>${body}</tbody></table><p style="margin-top:14px"><b>Cash view:</b> collected ${esc(npMoney(cur?.collected))}${Number(cur?.refunds||0)?` · refunds ${esc(npMoney(cur.refunds))}`:''} · outstanding from Guests today ${esc(npMoney(cur?.outstanding_now))}</p><small>Income = charges raised in the period, less discounts; Trial Guests excluded. Purchases are at stock-receipt cost. Equipment is counted in full in the month bought.</small></body></html>`);
      w.document.close();w.focus();setTimeout(()=>w.print(),300);
    }
    async function excel(){
      try{
        if(!window.XLSX)await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';sc.async=true;sc.onload=resolve;sc.onerror=()=>reject(new Error('Excel library could not be loaded — check the internet connection.'));document.head.appendChild(sc);});
        const ws=window.XLSX.utils.aoa_to_sheet([['Samara Health Care — Net Profit Statement'],[periodName],[],['Particulars',periodName,prev?prevName:''],...exportRows(),[],['Collected (payments + advances)',Number(cur.collected||0)],['Outstanding from Guests today',Number(cur.outstanding_now||0)]]);
        ws['!cols']=[{wch:62},{wch:18},{wch:18}];
        const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,'Net Profit');
        window.XLSX.writeFile(wb,`Samara_Net_Profit_${range[0]}_${range[1]}.xlsx`);
      }catch(e){alert(e.message||'Unable to download the Excel file.')}
    }
    const stat=(label,value,sub,good)=>h('div',{className:'card stat samara-pink-stat',style:{padding:'14px 16px',display:'grid',gap:'4px'}},
      h('span',{style:{fontWeight:800,color:'#7d1748'}},label),h('strong',{style:{fontSize:'26px',...(good==null?{}:colour(good))}},value),sub?h('small',{style:{color:'#8a6a78',fontWeight:600}},sub):null);
    return h(React.Fragment,null,
      h(Section,{title:'Net Profit Statement',subtitle:'Admin / Directors only · income earned in the period minus all expenses',actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate&&onNavigate('Monthly Expenses')},'＋ Monthly Expenses'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!cur,onClick:printIt},'Print / PDF'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!cur,onClick:excel},'Excel'))},
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},
          h('button',{type:'button',className:`btn ${mode==='month'&&month===npMonthStart(today)?'btn-primary':'btn-secondary'}`,onClick:()=>{setMode('month');setMonth(npMonthStart(today))}},'This Month'),
          h('button',{type:'button',className:`btn ${mode==='month'&&month===npShiftMonth(today,-1)?'btn-primary':'btn-secondary'}`,onClick:()=>{setMode('month');setMonth(npShiftMonth(today,-1))}},'Last Month'),
          h('label',{style:{display:'flex',gap:'6px',alignItems:'center',margin:0}},'Month',h('select',{value:mode==='month'?month:'',onChange:e=>{setMode('month');setMonth(e.target.value)}},mode!=='month'?h('option',{value:''},'—'):null,npMonthOptions().map(m=>h('option',{key:m,value:m},npMonthLabel(m))))),
          h('span',{style:{fontWeight:700,color:'#7b6871',marginLeft:'6px'}},'Period'),
          h(StrictDateInput,{value:draft.from,min:'2026-08-27',max:draft.to||today,onChange:e=>setDraft(d=>({...d,from:e.target.value}))}),
          h(StrictDateInput,{value:draft.to,min:draft.from||'2026-08-27',max:today,onChange:e=>setDraft(d=>({...d,to:e.target.value}))}),
          h(ApplyFilterButton,{dirty:Boolean(draft.from&&draft.to)&&(mode!=='custom'||draft.from!==custom.from||draft.to!==custom.to),onApply:()=>{if(!draft.from||!draft.to){alert('Choose both From and To dates.');return}setCustom(draft);setMode('custom')}}))),
      error?h('div',{className:'message error'},error):null,
      busy&&!cur?h('p',{className:'empty'},'Preparing the statement…'):null,
      cur&&T?h(React.Fragment,null,
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:'12px',margin:'0 0 14px'}},
          stat('Net Income',npMoney(T.netIncome),`Charges ${npMoney(T.gross)} − discounts ${npMoney(cur.discounts)}`),
          stat('Operating Expenses',npMoney(T.opex),`ERP ${npMoney(T.erp)}${Number(cur.outgoing_total)?` · paid out ${npMoney(cur.outgoing_total)}`:''} · entered ${npMoney(cur.manual_total)}`),
          stat('Operating Profit',npMoney(T.operating),'before equipment',T.operating),
          stat('Net Profit',npMoney(T.net),`Margin ${T.margin.toFixed(1)}%${P?` · ${prevName}: ${npMoney(P.net)}`:''}`,T.net),
          stat('Cash Collected',npMoney(cur.collected),`Outstanding from Guests today ${npMoney(cur.outstanding_now)}`)),
        h(Section,{title:`Statement · ${periodName}`,subtitle:prev?`Compared with ${prevName}`:null},
          h('div',{className:'table-wrap'},h('table',{className:'table np-statement'},
            h('thead',null,h('tr',null,h('th',null,'Particulars'),h('th',{style:{textAlign:'right'}},periodName),prev?h('th',{style:{textAlign:'right'}},prevName):null)),
            h('tbody',null,lines.map(([l,c,p,k],i)=>h('tr',{key:i,style:k==='head'?{background:'#fdf0f5'}:k==='profit'?{borderTop:'2px solid #d97aa3'}:null},
              h('td',{style:{fontWeight:k==='head'?800:['total','profit','sub'].includes(k)?800:500,color:k==='head'?'#7d1748':k==='note'?'#8a6a78':undefined,paddingLeft:k==='row'||k==='note'?'22px':undefined,fontStyle:k==='note'?'italic':undefined}},l),
              h('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},k==='head'||k==='note'?'':cell(c,k)),
              prev?h('td',{style:{textAlign:'right',whiteSpace:'nowrap',color:'#7b6871'}},k==='head'||k==='note'?'':cell(p,k)):null))))),
          h('p',{className:'small-note',style:{marginTop:'10px'}},'Income = charges raised in the period, less discounts (Trial Guests excluded); collections are shown separately. Purchases are at stock-receipt cost — receipts whose price looks per box / pack are left out and listed; receipts entered at MRP still overstate cost. Petty-cash payments of outside bills are counted once (under outside bills). Equipment is counted in full in the month bought. Salaries, rent and other overheads come from Outgoing Payments (Food vendor / Purchase payments excluded — already counted from receipts) and Monthly Expenses.'))
      ):null
    );
  }

  // 2.18.178: Expenses — recorded the moment they are spent (Admin / Directors), bill photo compulsory or "No bill" + reason,
  // Tamil / English voice fills the form. Page opens on boxes; each box opens its section with "← Back".
  const EXP_BILL_TYPES=['image/jpeg','image/png','image/webp','application/pdf'];
  const EXP_HEAD_WORDS=[
    ['Electricity',/(electric|current|eb bill|tneb|power bill|கரண்ட்|மின்)/i],['Water',/(water|tanker|can water|தண்ணீர்)/i],
    ['Rent',/(rent|வாடகை)/i],['Internet & Phone',/(internet|wifi|wi-fi|broadband|phone bill|recharge|mobile bill|airtel|jio)/i],
    ['Maintenance & Repairs',/(repair|maintenance|plumb|electrician|carpenter|paint|ac service|fix)/i],
    ['Housekeeping & Cleaning',/(housekeep|clean|phenyl|mop|broom|detergent)/i],['Laundry',/(laundry|wash|dhobi|iron)/i],
    ['Marketing & Advertising',/(advert|marketing|google ads|facebook|instagram|banner|flex|pamphlet|notice)/i],
    ['Professional Fees (CA / Legal)',/(auditor|\bca\b|chartered|lawyer|legal|advocate|consultant fee)/i],['Licences & Fees',/(licen[cs]e|registration|permit|renewal|govt fee)/i],
    ['Transport & Fuel',/(petrol|diesel|fuel|auto|taxi|cab|uber|ola|transport|travel|bus fare)/i],['Insurance',/(insurance)/i],
    ['Bank Charges',/(bank charge|gst on bank|service charge bank)/i],['Office & Stationery',/(stationery|xerox|print|paper|pen|office)/i]];
  function expParseVoice(text){
    const t=String(text||'');const out={description:t.trim().slice(0,200)};
    const num=t.replace(/,/g,'').match(/(\d+(?:\.\d{1,2})?)\s*(?:rupees|rs\.?|inr|₹)?/i);if(num)out.amount=num[1];
    const hd=EXP_HEAD_WORDS.find(([,re])=>re.test(t));out.head=hd?hd[0]:'Other';
    out.mode=/\bupi|gpay|google pay|phonepe|paytm/i.test(t)?'UPI':/\bcheque|check\b/i.test(t)?'Cheque':/\bcard\b/i.test(t)?'Card':/(bank transfer|neft|imps|rtgs|net banking)/i.test(t)?'Bank Transfer':/\bcash\b/i.test(t)?'Cash':'';
    const to=t.match(/\b(?:paid to|to|for)\s+([A-Z][\w&.' -]{1,40}?)(?:\s+(?:by|via|through|using|for|on)\b|[.,]|$)/);if(to)out.paid_to=to[1].trim();
    return out;
  }
  function ExpenseVoice({onResult}){
    const [state,setState]=React.useState('idle'),[msg,setMsg]=React.useState(''),[lang,setLang]=React.useState('ta-IN');
    const rec=React.useRef(null),chunks=React.useRef([]),stream=React.useRef(null);
    React.useEffect(()=>()=>{try{rec.current&&rec.current.state!=='inactive'&&rec.current.stop()}catch(_){}try{stream.current&&stream.current.getTracks().forEach(t=>t.stop())}catch(_){}},[]);
    const mime=()=>{for(const x of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']){try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(x))return x}catch(_){}}return ''};
    async function start(){
      setMsg('');
      try{
        stream.current=await navigator.mediaDevices.getUserMedia({audio:true});
        const m=mime();const r=new MediaRecorder(stream.current,m?{mimeType:m}:undefined);chunks.current=[];
        r.ondataavailable=e=>{if(e.data&&e.data.size)chunks.current.push(e.data)};
        r.onstop=()=>{try{stream.current.getTracks().forEach(t=>t.stop())}catch(_){}process(new Blob(chunks.current,{type:r.mimeType||m||'audio/webm'}))};
        rec.current=r;r.start();setState('recording');
      }catch(e){setMsg('Microphone not available: '+(e.message||e))}
    }
    async function process(blob){
      setState('processing');setMsg('Listening to your voice…');
      try{
        const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
        const ext=(blob.type||'').includes('mp4')?'m4a':(blob.type||'').includes('ogg')?'ogg':'webm';
        const fd=new FormData();fd.append('audio',blob,`expense.${ext}`);fd.append('spoken_language',lang);fd.append('current_form_type','Expense');fd.append('current_task_kind','Expense entry');fd.append('provider_preference','auto');fd.append('now_iso',new Date().toISOString());fd.append('timezone','Asia/Kolkata');
        const r=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},body:fd});
        const j=await r.json().catch(()=>({error:'Voice service did not answer.'}));if(!r.ok||j.error)throw new Error(j.error||'Voice service error.');
        const f=j.fields||{};const text=String(j.translated_text||j.translation||f.details||f.notes||j.transcript||'').trim();
        if(!text)throw new Error('Nothing was heard. Please try again.');
        onResult(expParseVoice(text),text);setMsg('✓ Filled from your voice: “'+text.slice(0,120)+'”. Check each field, then Save.');
      }catch(e){setMsg('Voice not filled: '+(e.message||e)+' — please type instead.')}finally{setState('idle')}
    }
    return h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',gridColumn:'1/-1',background:'#fff5fa',border:'1px dashed #f3c2d8',borderRadius:'12px',padding:'8px 10px'}},
      h('select',{value:lang,onChange:e=>setLang(e.target.value),disabled:state!=='idle',style:{maxWidth:'120px'}},h('option',{value:'ta-IN'},'தமிழ்'),h('option',{value:'en-IN'},'English')),
      state==='recording'?h('button',{type:'button',className:'btn btn-primary',onClick:()=>{try{rec.current.stop()}catch(_){}}},'■ Stop & fill')
        :h('button',{type:'button',className:'btn btn-secondary',disabled:state!=='idle',onClick:start},state==='processing'?'Filling…':'🎤 Speak the expense'),
      h('small',{style:{color:msg.startsWith('✓')?'#2e7d4f':'#7a1247',flex:'1 1 220px'}},msg||'e.g. “Electricity bill 4500 rupees paid to TNEB by UPI”'));
  }
  function MonthlyExpenses({profile,onNavigate}){
    const isAdmin=profile?.role==='Admin';
    const today=todayISOIndia();
    const [panel,setPanel]=React.useState('');
    const [month,setMonth]=React.useState(npMonthStart(today));
    const [rows,setRows]=React.useState([]),[staff,setStaff]=React.useState([]),[msg,setMsg]=React.useState(''),[busy,setBusy]=React.useState(false);
    const blank=()=>({date:today,head:'Electricity',description:'',amount:'',mode:'UPI',paid_to:'',reference:'',no_bill:false,no_bill_reason:''});
    const [form,setForm]=React.useState(blank);
    const [bill,setBill]=React.useState(null),[billPreview,setBillPreview]=React.useState('');
    const upload=React.useRef(null);
    const [salary,setSalary]=React.useState({});
    const [salaryDate,setSalaryDate]=React.useState('');
    const [range,setRange]=React.useState({from:npMonthStart(today),to:today}),[rangeDraft,setRangeDraft]=React.useState({from:npMonthStart(today),to:today});
    const [detail,setDetail]=React.useState(null);
    const end=npMonthEnd(month);
    const lo=[month,range.from].sort()[0];const hi=[end<today?end:today,range.to,today].sort().reverse()[0];
    async function load(){
      if(!isAdmin)return;
      const [a,b]=await Promise.all([client.rpc('samara_expense_rpc',{p_action:'list',p:{from:lo<'2026-08-27'?'2026-08-27':lo,to:hi}}),client.rpc('samara_expense_rpc',{p_action:'salary_prefill',p:{}})]);
      if(a.error){setMsg(/samara_expense_rpc/i.test(a.error.message)?'The Net Profit database update (SQL 305) has not been run yet.':a.error.message);return}
      setRows(a.data||[]);setStaff(b.data||[]);
      setSalary(Object.fromEntries((b.data||[]).map(s=>[s.id,s.salary!=null?String(s.salary):''])));
    }
    React.useEffect(()=>{setSalaryDate(end<today?end:today);load()},[month,range.from,range.to]);
    React.useEffect(()=>()=>{if(billPreview)URL.revokeObjectURL(billPreview)},[billPreview]);
    if(!isAdmin)return h(Section,{title:'Expenses'},h('p',null,'Admin / Directors only.'));
    async function add(payload){const r=await client.rpc('samara_expense_rpc',{p_action:'add',p:payload});if(r.error)throw r.error;}
    function pickBill(file){
      if(!file)return;
      if(file.size>10485760||!EXP_BILL_TYPES.includes(file.type)){setMsg('Use a JPG, PNG, WebP photo or a PDF, up to 10 MB.');return}
      setBill(file);upload.current=null;setForm(f=>({...f,no_bill:false}));
      setBillPreview(file.type.startsWith('image/')?URL.createObjectURL(file):'');setMsg('');
    }
    async function save(e){
      e.preventDefault();if(busy)return;setBusy(true);setMsg('');
      try{
        if(!form.date||form.date<'2026-08-27'||form.date>today)throw new Error('Choose a date between 27-08-2026 and today.');
        if(!(Number(form.amount)>0))throw new Error('Enter the amount spent.');
        if(!bill&&!form.no_bill)throw new Error('Add a photo of the bill, or tick "No bill" and give the reason.');
        if(form.no_bill&&String(form.no_bill_reason).trim().length<3)throw new Error('Give the reason there is no bill (e.g. auto fare, small shop without bill).');
        let path='';
        if(bill){
          if(upload.current?.file!==bill){
            const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[bill.type];
            const p=`${form.date.slice(0,7)}/${crypto.randomUUID()}.${ext}`;
            const r=await client.storage.from('expense-bills').upload(p,bill,{contentType:bill.type,upsert:false});
            if(r.error)throw new Error(/bucket/i.test(r.error.message)?'Bill photo storage is not ready (SQL 309 not run).':r.error.message);
            upload.current={file:bill,path:p};
          }
          path=upload.current.path;
        }
        await add({date:form.date,head:form.head,description:form.description,amount:Number(form.amount),mode:form.mode,paid_to:form.paid_to,reference:form.reference,bill_path:path,no_bill_reason:form.no_bill?form.no_bill_reason:''});
        showSamaraActionToast('success','Expense saved',`${form.head} · ${npMoney(form.amount)} — counted in Net Profit.`);
        setForm(blank());setBill(null);setBillPreview('');upload.current=null;setMsg('✓ Expense saved. Record the next one, or tap Back.');await load();
      }catch(err){setMsg(err.message||'Unable to save.')}finally{setBusy(false)}
    }
    const paidIds=new Set(rows.filter(r=>r.head==='Salaries'&&r.employee_profile_id&&r.expense_date>=month&&r.expense_date<=end).map(r=>String(r.employee_profile_id)));
    async function recordSalary(list){
      setBusy(true);setMsg('');
      try{
        if(!salaryDate||salaryDate<month||salaryDate>end)throw new Error(`Choose the salary paid date in ${npMonthLabel(month)}.`);
        let n=0;
        for(const s of list){const amt=Number(salary[s.id]);if(!(amt>0)||paidIds.has(String(s.id)))continue;
          await add({date:salaryDate,head:'Salaries',description:`Salary — ${s.name} (${s.designation||''}) · ${npMonthLabel(month)}`,amount:amt,mode:'Bank Transfer',paid_to:s.name,employee_id:s.id});n++;}
        setMsg(n?`✓ ${n} salar${n===1?'y':'ies'} recorded.`:'Nothing to record — enter the amount paid, or it is already recorded.');await load();
      }catch(err){setMsg(err.message||'Unable to record salaries.')}finally{setBusy(false)}
    }
    async function remove(r){
      const reason=window.prompt(`Remove “${r.head} · ${npMoney(r.amount)}”? Give the reason:`);if(reason==null)return;
      const x=await client.rpc('samara_expense_rpc',{p_action:'void',p:{id:r.id,reason}});
      if(x.error)setMsg(x.error.message);else{setMsg('✓ Expense removed (kept in the audit with the reason).');setDetail(null);load()}
    }
    async function viewBill(path){const r=await client.storage.from('expense-bills').createSignedUrl(path,300);if(r.error){setMsg(r.error.message);return}window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}
    const sum=list=>list.reduce((t,r)=>t+Number(r.amount||0),0);
    const todayRows=rows.filter(r=>r.expense_date===today);
    const monthRows=rows.filter(r=>r.expense_date>=month&&r.expense_date<=end);
    const rangeRows=rows.filter(r=>r.expense_date>=range.from&&r.expense_date<=range.to);
    const f=(label,node,span)=>h('div',{className:'field',style:{margin:0,...(span?{gridColumn:'1/-1'}:{})}},h('label',null,label),node);
    const open=key=>{setPanel(key);setDetail(null);setMsg('');window.scrollTo({top:0,behavior:'smooth'})};
    const back=()=>{if(detail){setDetail(null);return}setPanel('');setMsg('')};
    const title={record:'＋ Record Expense',today:`Today · ${formatDateIN(today)}`,month:npMonthLabel(month),salaries:`Salaries · ${npMonthLabel(month)}`,all:'All Expenses'}[panel]||'';
    const list=(items,emptyText)=>detail?h('div',{className:'section-card'},
        h('h3',{style:{marginTop:0}},`${detail.head} · ${npMoney(detail.amount)}`),
        h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'14px'}},h('tbody',null,
          ...[['Date',formatDateIN(detail.expense_date)],['Paid to',detail.paid_to||'—'],['Paid by',detail.paid_mode||'—'],['Details',detail.description||'—'],['Bill / Reference No.',detail.reference||'—'],
            ['Bill',detail.bill_path?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>viewBill(detail.bill_path)},'🧾 View bill'):detail.no_bill_reason?`No bill — ${detail.no_bill_reason}`:'—'],
            ['Recorded by',`${detail.created_by_name||'—'} · ${fmt(detail.created_at)}`]].map(([k,v])=>h('tr',{key:k},h('td',{style:{padding:'7px 0',color:'#8a5a70',width:'170px',verticalAlign:'top'}},k),h('td',{style:{padding:'7px 0',fontWeight:600}},v))))),
        h('div',{style:{display:'flex',gap:'8px',marginTop:'12px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setDetail(null)},'← Back'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>remove(detail)},'Remove (with reason)')))
      :h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,['S.No','Date','Head','Paid To','Amount','Bill'].map((x,i)=>h('th',{key:x,style:i===4?{textAlign:'right'}:{}},x)))),
        h('tbody',null,items.length?items.map((r,i)=>h('tr',{key:r.id,style:{cursor:'pointer'},onClick:()=>setDetail(r)},
          h('td',null,String(i+1)),h('td',{style:{whiteSpace:'nowrap'}},formatDateIN(r.expense_date)),h('td',null,r.head,r.description?h('small',{style:{display:'block',color:'#8a5a70'}},String(r.description).slice(0,60)):null),
          h('td',null,r.paid_to||'—'),h('td',{style:{textAlign:'right',whiteSpace:'nowrap',fontWeight:700}},npMoney(r.amount)),h('td',null,r.bill_path?'🧾':r.no_bill_reason?'No bill':r.head==='Salaries'?'—':'—'))):h('tr',null,h('td',{colSpan:6,className:'empty'},emptyText)),
          items.length?h('tr',null,h('td',{colSpan:4,style:{fontWeight:800}},'Total'),h('td',{style:{textAlign:'right',fontWeight:800}},npMoney(sum(items))),h('td',null)):null)));
    const boxes=[
      ['record','＋ Record Expense','Spent now?','Bill photo · voice · 30 seconds','#b01867'],
      ['today','Today',npMoney(sum(todayRows)),`${todayRows.length} entr${todayRows.length===1?'y':'ies'}`,'#7a1247'],
      ['month','This Month',npMoney(sum(monthRows)),`${monthRows.length} entries · ${npMonthLabel(month)}`,'#5d1740'],
      ['salaries','Salaries',`${paidIds.size} / ${staff.length}`,`recorded for ${npMonthLabel(month)}`,'#2e7d4f'],
      ['all','All Expenses','By period','filter, view bills','#9a6700']];
    return h(React.Fragment,null,
      !panel&&h(Section,{title:'Expenses',subtitle:'Admin / Directors only · record each expense when it is spent — it counts in the Net Profit Statement at once',actions:h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate&&onNavigate('Net Profit Statement')},'Net Profit Statement →')},
        h('div',{className:'notice',style:{marginBottom:'12px'}},'Already counted automatically — do not enter again: Payment Requests → Payment Vouchers (Outgoing Payments), stock bills, food vendor, kitchen stores, Nursing Manager petty cash, outsourced physio, outside bills paid for Guests.'),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'14px'}},
          boxes.map(([key,label,value,sub,color])=>h('button',{key,type:'button',onClick:()=>open(key),style:{textAlign:'left',cursor:'pointer',border:'1px solid #f3c2d8',borderTop:`4px solid ${color}`,borderRadius:'16px',padding:'16px 18px',background:'linear-gradient(135deg,#fff 0%,#fde7f1 100%)',boxShadow:'0 6px 18px rgba(176,24,103,.08)',display:'flex',flexDirection:'column',gap:'6px',minHeight:'112px'}},
            h('span',{style:{color:'#5d1740',fontWeight:800,fontSize:'15px'}},label),h('strong',{style:{fontSize:'22px',color}},value),h('small',{style:{color:'#8a5a70'}},sub),h('small',{style:{color:'#b01867',fontWeight:700,marginTop:'auto'}},'Open →'))))),
      panel&&h('div',{style:{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap',margin:'0 0 12px',padding:'10px 14px',borderRadius:'14px',background:'linear-gradient(90deg,#fde7f1,#fff5fa)'}},
        h('button',{type:'button',className:'btn btn-secondary',onClick:back},'← Back'),h('strong',{style:{color:'#5d1740',fontSize:'17px'}},detail?`${title} · entry`:title),
        (panel==='month'||panel==='salaries')&&h('select',{value:month,onChange:e=>setMonth(e.target.value),style:{marginLeft:'auto',maxWidth:'200px'}},npMonthOptions().map(m=>h('option',{key:m,value:m},npMonthLabel(m))))),
      msg?h('div',{className:`message ${msg.startsWith('✓')?'success':'error'}`},msg):null,
      panel==='record'&&h(Section,{title:'Record an expense',subtitle:'Fill it the moment you spend. A bill photo is needed — or tick "No bill" and say why.'},
        h('form',{onSubmit:save,style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:'12px',alignItems:'end'}},
          h(ExpenseVoice,{onResult:v=>setForm(fm=>({...fm,...Object.fromEntries(Object.entries(v).filter(([,x])=>x))}))}),
          f('Amount (₹) *',h('input',{type:'number',inputMode:'decimal',min:'0.01',step:'0.01',value:form.amount,onChange:e=>setForm({...form,amount:e.target.value}),required:true,style:{fontSize:'18px',fontWeight:700}})),
          f('Expense Head *',h('select',{value:form.head,onChange:e=>setForm({...form,head:e.target.value})},NP_HEADS.filter(x=>x!=='Salaries').map(x=>h('option',{key:x},x)))),
          f('Date *',h(StrictDateInput,{value:form.date,min:'2026-08-27',max:today,onChange:e=>setForm({...form,date:e.target.value}),required:true})),
          f('Paid By',h('select',{value:form.mode,onChange:e=>setForm({...form,mode:e.target.value})},NP_MODES.map(x=>h('option',{key:x},x)))),
          f('Paid To',h('input',{value:form.paid_to,onChange:e=>setForm({...form,paid_to:e.target.value}),placeholder:'e.g. TNEB, plumber, shop name'})),
          f('Bill / Reference No.',h('input',{value:form.reference,onChange:e=>setForm({...form,reference:e.target.value}),placeholder:'optional'})),
          f('What was it for?',h('input',{value:form.description,onChange:e=>setForm({...form,description:e.target.value}),placeholder:'e.g. October electricity bill'}),true),
          h('div',{style:{gridColumn:'1/-1',border:'1px solid #f3c2d8',borderRadius:'12px',padding:'12px',background:'#fff'}},
            h('strong',{style:{color:'#5d1740'}},'Bill photo *'),
            h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'8px',alignItems:'center'}},
              h('label',{className:'btn btn-primary',style:{cursor:'pointer',margin:0}},'📷 Take photo',h('input',{type:'file',accept:'image/*',capture:'environment',style:{display:'none'},onChange:e=>{pickBill(e.target.files&&e.target.files[0]);e.target.value=''}})),
              h('label',{className:'btn btn-secondary',style:{cursor:'pointer',margin:0}},'🖼 Choose photo / PDF',h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,application/pdf',style:{display:'none'},onChange:e=>{pickBill(e.target.files&&e.target.files[0]);e.target.value=''}})),
              bill?h('span',{style:{color:'#2e7d4f',fontWeight:700}},`✓ ${bill.name}`):null,
              bill?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setBill(null);setBillPreview('');upload.current=null}},'Remove'):null),
            billPreview?h('img',{src:billPreview,alt:'Bill preview',style:{marginTop:'10px',maxWidth:'220px',maxHeight:'220px',borderRadius:'10px',border:'1px solid #f3c2d8'}}):null,
            !bill&&h('label',{style:{display:'flex',gap:'8px',alignItems:'center',marginTop:'10px',fontWeight:600}},h('input',{type:'checkbox',checked:form.no_bill,onChange:e=>setForm({...form,no_bill:e.target.checked})}),'No bill for this expense'),
            !bill&&form.no_bill&&h('input',{value:form.no_bill_reason,onChange:e=>setForm({...form,no_bill_reason:e.target.value}),placeholder:'Why no bill? e.g. auto fare, small shop without bill',style:{marginTop:'8px',width:'100%'}})),
          h('button',{type:'submit',className:'btn btn-primary',disabled:busy,style:{gridColumn:'1/-1',padding:'14px',fontSize:'16px'}},busy?'Saving…':'Save Expense'))),
      panel==='today'&&h(Section,{title:`Expenses today · ${npMoney(sum(todayRows))}`},list(todayRows,'Nothing recorded today.')),
      panel==='month'&&h(Section,{title:`${npMonthLabel(month)} · ${npMoney(sum(monthRows))}`,subtitle:NP_HEADS.map(hd=>[hd,sum(monthRows.filter(r=>r.head===hd))]).filter(([,v])=>v>0).map(([hd,v])=>`${hd} ${npMoney(v)}`).join(' · ')||null},list(monthRows,'No expenses recorded for this month yet.')),
      panel==='all'&&h(Section,{title:`Expenses ${formatDateIN(range.from)} to ${formatDateIN(range.to)} · ${npMoney(sum(rangeRows))}`},
        !detail&&h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'end',marginBottom:'10px'}},
          f('From',h(StrictDateInput,{value:rangeDraft.from,min:'2026-08-27',max:today,onChange:e=>setRangeDraft({...rangeDraft,from:e.target.value})})),
          f('To',h(StrictDateInput,{value:rangeDraft.to,min:'2026-08-27',max:today,onChange:e=>setRangeDraft({...rangeDraft,to:e.target.value})})),
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>{if(rangeDraft.from&&rangeDraft.to&&rangeDraft.from<=rangeDraft.to)setRange(rangeDraft);else setMsg('Choose a valid From and To date.')}},'Apply')),
        list(rangeRows,'No expenses in this period.')),
      panel==='salaries'&&h(Section,{title:`Salaries paid · ${npMonthLabel(month)}`,subtitle:'Pre-filled from HR (current salary) — change for leave, advances, overtime or part-month, then Record. If a salary was already paid through Outgoing Payments (Salaries), do not record it here too.',actions:h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
          h('span',{style:{fontWeight:700,color:'#7b6871'}},'Paid on'),h(StrictDateInput,{value:salaryDate,min:month<'2026-08-27'?'2026-08-27':month,max:end<today?end:today,onChange:e=>setSalaryDate(e.target.value)}),
          h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>recordSalary(staff)},'Record all entered'))},
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Employee','Designation','HR Salary','Amount Paid (₹)','Status',''].map(x=>h('th',{key:x},x)))),
          h('tbody',null,staff.length?staff.map(s=>{const done=paidIds.has(String(s.id));return h('tr',{key:s.id},
            h('td',null,s.name),h('td',null,`${s.designation||'—'}${s.department?` · ${s.department}`:''}`),h('td',null,s.salary!=null?`${npMoney(s.salary)} ${s.frequency||''}`:'Not set in HR'),
            h('td',null,h('input',{type:'number',min:'0',step:'0.01',value:salary[s.id]||'',disabled:done,onChange:e=>setSalary(v=>({...v,[s.id]:e.target.value})),style:{maxWidth:'140px'}})),
            h('td',null,done?h('span',{className:'badge success'},'Recorded'):h('span',{className:'badge'},'Not recorded')),
            h('td',null,done?null:h('button',{type:'button',className:'btn btn-secondary',disabled:busy||!(Number(salary[s.id])>0),onClick:()=>recordSalary([s])},'Record')))}):h('tr',null,h('td',{colSpan:6,className:'empty'},'No active employees found.'))))))
    );
  }
