  function TitanMail({profile}){
    React.useEffect(()=>{ensureCleanWorkspaceLayout()},[]);
    const [mailbox,setMailbox]=React.useState(profile?.role==='Admin'?'admin':'care');
    const [folder,setFolder]=React.useState('INBOX');
    const [messages,setMessages]=React.useState([]);
    const [counts,setCounts]=React.useState({});
    const [selected,setSelected]=React.useState(null);
    const [loading,setLoading]=React.useState(false);
    const [error,setError]=React.useState('');
    const [search,setSearch]=React.useState('');
    const [composeOpen,setComposeOpen]=React.useState(false);
    const [compose,setCompose]=React.useState({to:'',cc:'',subject:'',body:''});
    const [sending,setSending]=React.useState(false);
    const [syncing,setSyncing]=React.useState(false);
    const [lastSynced,setLastSynced]=React.useState(null);
    const mailCache=window.__SAMARA_TITAN_MAIL_CACHE__||(window.__SAMARA_TITAN_MAIL_CACHE__={lists:{},messages:{}});
    const MAIL_LIST_CACHE_MS=60000;

    const mailboxDefs=[
      {key:'chellaboomi',label:'Director Mail',email:'chellaboomi@samaraassistedliving.com',adminOnly:true,desc:'Private Director mailbox'},
      {key:'care',label:'Care Mail',email:'care@samaraassistedliving.com',desc:'Resident care and operational communication'},
      {key:'admin',label:'Admin Mail',email:'admin@samaraassistedliving.com',desc:'Administration and official communication'}
    ].filter(item=>!item.adminOnly||profile?.role==='Admin');

    React.useEffect(()=>{
      if(!mailboxDefs.some(item=>item.key===mailbox)){
        setMailbox(mailboxDefs[0]?.key||'care');
      }
    },[profile?.role]);

    async function invoke(action,payload={}){
      const {data,error}=await client.functions.invoke('titan-mail',{
        body:{action,mailbox,...payload}
      });
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      return data;
    }

    async function loadCounts(){
      try{
        const results=await Promise.all(mailboxDefs.map(async item=>{
          try{
            const result=await invoke('cache-counts',{mailbox:item.key});
            return [item.key,result];
          }catch(err){
            console.warn(`Cached counts unavailable for ${item.key}`,err);
            return [item.key,null];
          }
        }));
        setCounts(current=>{
          const next={...current};
          results.forEach(([key,result])=>{if(result)next[key]=result});
          return next;
        });
        const selectedResult=results.find(([key])=>key===mailbox)?.[1];
        if(selectedResult?.last_synced_at)setLastSynced(selectedResult.last_synced_at);
      }catch(err){
        console.warn('Cached mail counts unavailable',err);
      }
    }

    const backgroundMailboxSyncRef=React.useRef(false);
    async function syncOtherMailboxCountsInBackground(){
      if(backgroundMailboxSyncRef.current)return;
      const others=mailboxDefs.filter(item=>item.key!==mailbox);
      if(!others.length)return;
      backgroundMailboxSyncRef.current=true;
      try{
        // Keep the dashboard responsive: each other Titan mailbox is synchronised
        // independently in the background while the selected mailbox stays usable.
        await Promise.allSettled(others.map(item=>invoke('sync',{mailbox:item.key,folder:'INBOX'})));
        await loadCounts();
      }catch(err){
        console.warn('Background mailbox count refresh failed',err);
      }finally{
        backgroundMailboxSyncRef.current=false;
      }
    }

    async function loadMessages(){
      setLoading(true);setError('');setSelected(null);
      try{
        const result=await invoke('cache-list',{folder,search:search.trim(),limit:10});
        setMessages(result.messages||[]);
        setCounts(current=>({...current,[mailbox]:result.counts||current[mailbox]||{}}));
        if(result?.last_synced_at)setLastSynced(result.last_synced_at);
      }catch(err){
        setError(err.message||'Unable to load cached mailbox.');
      }finally{
        setLoading(false);
      }
    }

    async function syncMail({showToast=false}={}){
      if(syncing)return;
      setSyncing(true);
      try{
        const result=await invoke('sync',{folder});
        if(result?.last_synced_at)setLastSynced(result.last_synced_at);
        await loadMessages();
        await loadCounts();
        if(showToast)showSamaraActionToast('success','Mail refreshed',`Latest ${result?.synced??0} messages synchronised from Titan.`);
      }catch(err){
        const text=err.message||'Titan synchronisation failed.';
        setError(text);
        if(showToast)showSamaraActionToast('error','Mail refresh failed',text);
      }finally{
        setSyncing(false);
      }
    }

    React.useEffect(()=>{
      if(!mailbox)return;
      let cancelled=false;
      (async()=>{
        await loadMessages();
        await loadCounts();
        if(cancelled)return;
        // Never block the inbox on Titan IMAP. Refresh the selected mailbox in the background.
        syncMail({showToast:false});
        // Also populate/update the dashboard cards for the other authorised mailboxes.
        // This runs independently, so Director/Care/Admin unread counts do not remain at zero
        // simply because that mailbox has not been opened during this browser session.
        syncOtherMailboxCountsInBackground();
      })();
      const timer=setInterval(()=>{
        if(cancelled)return;
        syncMail({showToast:false});
        syncOtherMailboxCountsInBackground();
      },5*60*1000);
      return()=>{cancelled=true;clearInterval(timer)};
    },[mailbox,folder]);

    async function openMessage(row){
      setLoading(true);setError('');
      try{
        const result=await invoke('cache-read',{folder,uid:row.uid});
        setSelected(result.message||null);
        setMessages(current=>current.map(item=>item.uid===row.uid?{...item,seen:true}:item));
        if(!row.seen&&folder==='INBOX'){
          setCounts(current=>{
            const existing=current[mailbox]||{};
            return {...current,[mailbox]:{...existing,unread:Math.max(0,Number(existing.unread||0)-1)}};
          });
        }
      }catch(err){
        setError(err.message||'Unable to open message.');
      }finally{
        setLoading(false);
      }
    }

    function replyTo(message,replyAll=false){
      if(!message)return;
      const to=replyAll
        ?[message.from?.address,...(message.to||[]).map(x=>x.address)].filter(Boolean).join(', ')
        :(message.from?.address||'');
      setCompose({
        to,
        cc:replyAll?(message.cc||[]).map(x=>x.address).filter(Boolean).join(', '):'',
        subject:String(message.subject||'').startsWith('Re:')?message.subject:`Re: ${message.subject||''}`,
        body:`\n\n--- Original Message ---\nFrom: ${message.from?.name||''} <${message.from?.address||''}>\nDate: ${formatDateTimeIN(message.date)}\nSubject: ${message.subject||''}\n\n${message.text||''}`
      });
      setComposeOpen(true);
    }

    async function sendMail(event){
      event.preventDefault();
      if(!compose.to.trim()||!compose.subject.trim()){
        showSamaraActionToast('error','Email incomplete','Recipient and Subject are required.');
        return;
      }
      setSending(true);setError('');
      try{
        await invoke('send',compose);
        showSamaraActionToast('success','Email sent',`Message sent successfully from ${mailboxDefs.find(x=>x.key===mailbox)?.email||'Samara Mail'}.`);
        setCompose({to:'',cc:'',subject:'',body:''});
        setComposeOpen(false);
        // The Edge Function archives the sent copy into Titan IMAP and refreshes
        // the Sent cache. Reload immediately when the Sent folder is already open.
        if(folder==='Sent')await loadMessages();
      }catch(err){
        const text=err.message||'Email could not be sent.';
        setError(text);
        showSamaraActionToast('error','Email send failed',text);
      }finally{
        setSending(false);
      }
    }

    const selectedDef=mailboxDefs.find(x=>x.key===mailbox)||mailboxDefs[0];
    const currentCounts=counts[mailbox]||{};
    const mailSignatureName=String(profile?.full_name||'').trim()||'Samara Team';
    const mailSignatureRole=String(profile?.role||'').trim()||'Staff';

    return h('div',{className:'mail-shell'},
      h('div',{className:'mail-hero'},
        h('div',null,
          h('small',null,'SAMARA COMMUNICATION CENTRE'),
          h('h3',null,'Mail Dashboard'),
          h('p',null,'Secure access to official Samara Titan mailboxes from the ERP.')
        ),
        h('div',{className:'mail-actions'},
          h('button',{className:'btn btn-primary',onClick:()=>setComposeOpen(true)},'✉ Compose'),
          h('button',{className:'btn btn-secondary',disabled:syncing,onClick:()=>syncMail({showToast:true})},syncing?'Syncing Titan…':'↻ Refresh Mail')
        )
      ),

      h('div',{className:'mail-security-note'},
        h('div',null,'Mailbox passwords are not stored in this browser or app.js. Titan credentials remain server-side as Supabase secrets.'),
        h('div',{style:{marginTop:'5px',fontWeight:700}},lastSynced?`Cached Inbox · Last synced ${formatDateTimeIN(lastSynced)}`:'Cached Inbox · Initial Titan sync is running in the background')
      ),

      h('div',{className:'mailbox-grid'},
        mailboxDefs.map(item=>{
          const c=counts[item.key]||{};
          return h('button',{
            type:'button',key:item.key,className:`mailbox-card ${mailbox===item.key?'active':''}`,
            onClick:()=>{setMailbox(item.key);setFolder('INBOX');setSelected(null)}
          },
            h('small',null,item.label),
            h('strong',null,item.email),
            h('div',{className:'count'},c.unread??'—'),
            h('small',null,`Unread · ${item.desc}`)
          );
        })
      ),

      h('div',{className:'mail-workspace'},
        h('div',{className:'mail-folders'},
          ['INBOX','Sent','Drafts','Trash'].map(name=>h('button',{
            type:'button',key:name,className:`mail-folder-btn ${folder===name?'active':''}`,
            onClick:()=>{setFolder(name);setSelected(null)}
          },name==='INBOX'?`Inbox ${currentCounts.total!=null?`(${currentCounts.total})`:''}`:name))
        ),

        h('div',{className:'mail-content'},
          error&&h('div',{className:'message error'},error),

          selected
            ?h('div',{className:'mail-message'},
                h('div',{className:'mail-toolbar'},
                  h('button',{className:'btn btn-secondary',onClick:()=>setSelected(null)},'← Back'),
                  h('button',{className:'btn btn-secondary',onClick:()=>replyTo(selected,false)},'Reply'),
                  h('button',{className:'btn btn-secondary',onClick:()=>replyTo(selected,true)},'Reply All'),
                  h('button',{className:'btn btn-secondary',onClick:()=>setCompose({
                    to:'',cc:'',subject:`Fwd: ${selected.subject||''}`,
                    body:`\n\n--- Forwarded Message ---\nFrom: ${selected.from?.name||''} <${selected.from?.address||''}>\nDate: ${formatDateTimeIN(selected.date)}\nSubject: ${selected.subject||''}\n\n${selected.text||''}`
                  })||setComposeOpen(true)},'Forward')
                ),
                h('div',{className:'mail-message-head'},
                  h('h3',null,selected.subject||'(No subject)'),
                  h('div',null,h('strong',null,'From: '),`${selected.from?.name||''} <${selected.from?.address||''}>`),
                  h('div',null,h('strong',null,'To: '),(selected.to||[]).map(x=>x.address).join(', ')||'—'),
                  selected.cc?.length?h('div',null,h('strong',null,'CC: '),selected.cc.map(x=>x.address).join(', ')):null,
                  h('small',null,formatDateTimeIN(selected.date))
                ),
                selected.htmlText
                  ?h('div',{className:'mail-html-frame-wrap'},
                      h('iframe',{
                        className:'mail-html-frame',
                        title:`Email: ${selected.subject||'(No subject)'}`,
                        sandbox:'allow-popups allow-popups-to-escape-sandbox',
                        referrerPolicy:'no-referrer',
                        srcDoc:selected.htmlText
                      })
                    )
                  :h(React.Fragment,null,
                      h('div',{className:'mail-plain-note'},'This message has no HTML version. Showing the plain-text email.'),
                      h('div',{className:'mail-message-body'},selected.text||'(No readable text body)')
                    ),
                selected.attachments?.length?h('div',null,
                  h('strong',null,'Attachments: '),
                  selected.attachments.map((a,i)=>h('span',{className:'badge',key:i},a.filename||'Attachment'))
                ):null
              )
            :h(React.Fragment,null,
                h('div',{className:'mail-toolbar'},
                  h('input',{
                    value:search,placeholder:`Search ${selectedDef?.label||'mailbox'}…`,
                    onChange:e=>setSearch(e.target.value),
                    onKeyDown:e=>{if(e.key==='Enter')loadMessages(true)}
                  }),
                  h('button',{className:'btn btn-secondary',onClick:()=>loadMessages(true)},'Search')
                ),
                loading?h('div',{className:'loading'},'Loading mail…'):
                h('div',{className:'mail-list'},
                  messages.length?messages.map(row=>h('div',{
                    key:row.uid,className:`mail-row ${row.seen?'':'unread'}`,onClick:()=>openMessage(row)
                  },
                    h('div',null,row.flagged?'★':row.seen?'○':'●'),
                    h('div',{className:'mail-from'},row.from?.name||row.from?.address||'Unknown sender'),
                    h('div',{className:'mail-subject'},row.subject||'(No subject)'),
                    h('div',{className:'mail-date'},formatDateTimeIN(row.date))
                  )):h('div',{className:'empty',style:{padding:'28px'}},'No messages found.')
                )
              )
        )
      ),

      composeOpen&&h('div',{className:'modal-backdrop'},
        h('div',{className:'modal-card employee-modal',style:{maxWidth:'820px'}},
          h('div',{className:'modal-head'},
            h('div',null,h('h3',null,`Compose · ${selectedDef?.email||''}`),h('small',null,'Official Samara email')),
            h('button',{className:'icon-btn',onClick:()=>setComposeOpen(false)},'×')
          ),
          h('form',{onSubmit:sendMail},
            h('div',{className:'mail-compose-grid'},
              h('div',{className:'field span-2'},h('label',null,'To *'),h('input',{value:compose.to,onChange:e=>setCompose({...compose,to:e.target.value}),placeholder:'recipient@example.com'})),
              h('div',{className:'field span-2'},h('label',null,'CC'),h('input',{value:compose.cc,onChange:e=>setCompose({...compose,cc:e.target.value}),placeholder:'Optional; separate multiple addresses with commas'})),
              h('div',{className:'field span-2'},h('label',null,'Subject *'),h('input',{value:compose.subject,onChange:e=>setCompose({...compose,subject:e.target.value})})),
              h('div',{className:'field span-2'},h('label',null,'Message'),h('textarea',{rows:12,value:compose.body,onChange:e=>setCompose({...compose,body:e.target.value}),placeholder:'Type your message…'})),
              h('div',{className:'field span-2'},
                h('label',null,'Automatic Samara Footer'),
                h('div',{style:{border:'1px solid #ead7df',borderRadius:'14px',padding:'14px',background:'#fffafc',display:'flex',gap:'14px',alignItems:'center',flexWrap:'wrap'}},
                  h('img',{src:'./assets/samara-mail-logo.png',alt:'Samara Assisted Living',style:{width:'150px',maxWidth:'42%',height:'auto'}}),
                  h('div',{style:{fontSize:'13px',lineHeight:'1.55',color:'#4b3540'}},
                    h('strong',{style:{fontSize:'14px',color:'#7b0b45'}},mailSignatureName),
                    h('div',null,mailSignatureRole),
                    h('div',null,'Samara Assisted Living'),
                    h('div',null,'RBK VILLA, No: 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037.'),
                    h('div',null,`Email: ${selectedDef?.email||''}`),
                    h('div',null,'Website: www.samaraassistedliving.com')
                  )
                ),
                h('small',{className:'small-note'},'This footer is added automatically to every email sent from the ERP and cannot be accidentally deleted from the message body.')
              )
            ),
            h('div',{className:'modal-actions'},
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setComposeOpen(false)},'Cancel'),
              h('button',{type:'submit',className:'btn btn-primary',disabled:sending},sending?'Sending…':'Send Email')
            )
          )
        )
      )
    );
  }

  
