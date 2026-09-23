  function FamilyCommunicationDashboard({profile}){
    const [visits,setVisits]=React.useState([]),[messages,setMessages]=React.useState([]),[loading,setLoading]=React.useState(false),[error,setError]=React.useState('');
    const [dashboardVisitFilter,setDashboardVisitFilter]=React.useState(()=>{
      try{
        const value=sessionStorage.getItem('samara-visit-filter')||'';
        sessionStorage.removeItem('samara-visit-filter');
        return value==='pending'?'pending':'';
      }catch(_error){return ''}
    });
    const canManage=['Admin','Manager'].includes(profile?.role);
    async function load(){setLoading(true);setError('');try{const [v,m]=await Promise.all([client.from('family_visit_requests').select('*').order('created_at',{ascending:false}).limit(200),client.from('family_messages').select('*').order('created_at',{ascending:false}).limit(300)]);if(v.error)throw v.error;if(m.error)throw m.error;setVisits(v.data||[]);setMessages(m.data||[]);}catch(e){setError(e.message||'Unable to load family communication.');}finally{setLoading(false)}}
    React.useEffect(()=>{load()},[]);
    async function visitStatus(row,status){if(!canManage)return;const note=prompt(status==='Rejected'?'Reason / remarks for rejection:':'Confirmation / visit timing remarks (optional):','');if(note===null)return;const {error}=await client.from('family_visit_requests').update({status,management_remarks:note||null,reviewed_at:new Date().toISOString(),reviewed_by:profile?.id||null}).eq('id',row.id);if(error)return showSamaraActionToast('error','Unable to update visit',error.message);showSamaraActionToast('success','Visit request updated',`Status: ${status}`);load()}
    async function reply(row){if(!canManage)return;const text=prompt(`Reply to ${row.sender_name||'family member'}:`,'');if(!text?.trim())return;const {error}=await client.from('family_messages').insert({patient_id:row.patient_id,patient_code:row.patient_code,patient_name:row.patient_name,access_id:row.access_id,direction:'ERP_TO_FAMILY',sender_type:'Samara Team',sender_name:formalName(profile)||profile?.full_name||'Samara Team',message:text.trim(),reply_to_id:row.id});if(error)return showSamaraActionToast('error','Unable to send reply',error.message);await client.from('family_messages').update({status:'Replied',read_at:new Date().toISOString()}).eq('id',row.id);showSamaraActionToast('success','Reply sent','The reply is now visible in the Family Portal.');load()}
    const visibleVisits=dashboardVisitFilter==='pending'
      ?visits.filter(r=>String(r.status||'Pending')==='Pending')
      :visits;
    const visitRows=visibleVisits.length?visibleVisits.map(r=>h('tr',{key:r.id},h('td',null,formatDateTimeIN(r.created_at)),h('td',null,h('span',{className:'badge'},r.source||'Family Portal')),h('td',null,`${r.patient_name||'Public visitor'}${r.patient_code?` · ${r.patient_code}`:''}`),h('td',null,`${r.visitor_name||'—'}${r.visitor_mobile?` · ${r.visitor_mobile}`:''}`),h('td',null,`${formatDateIN(r.visit_date)} · ${r.visit_time||'—'}`),h('td',null,r.message||'—'),h('td',null,h('span',{className:'badge'},r.status||'Pending')),h('td',null,canManage?h('div',{className:'actions'},h('button',{className:'btn btn-primary',onClick:()=>visitStatus(r,'Approved')},'Approve'),h('button',{className:'btn btn-secondary',onClick:()=>visitStatus(r,'Rejected')},'Reject')):'—'))):[h('tr',{key:'empty'},h('td',{colSpan:8},'No visit requests found.'))];
    const messageRows=messages.length?messages.map(r=>h('tr',{key:r.id},h('td',null,formatDateTimeIN(r.created_at)),h('td',null,`${r.patient_name||'—'}${r.patient_code?` · ${r.patient_code}`:''}`),h('td',null,r.direction==='ERP_TO_FAMILY'?(r.sender_name||'Samara Team'):(r.sender_name||'Family')),h('td',null,r.message||'—'),h('td',null,h('span',{className:'badge'},r.status||'Sent')),h('td',null,canManage&&r.direction==='FAMILY_TO_ERP'?h('button',{className:'btn btn-primary',onClick:()=>reply(r)},'Reply'):'—'))):[h('tr',{key:'empty'},h('td',{colSpan:6},'No secure messages found.'))];
    return h('div',{className:'feedback-admin-shell'},
      h('div',{className:'section-heading'},h('div',null,h('small',null,'FAMILY PORTAL · ERP'),h('h3',null,'Family Communication'),h('p',null,'Visit requests and secure family messages in one management workspace.')),h('button',{className:'btn btn-secondary',onClick:load},loading?'Refreshing…':'↻ Refresh')),
      error&&h('div',{className:'message error'},error),
      h('div',{className:'card'},h('div',{className:'panel-head'},h('h3',null,dashboardVisitFilter==='pending'?`Pending Visit Requests (${visibleVisits.length})`:'Visit Requests'),dashboardVisitFilter&&h('button',{className:'btn btn-secondary',onClick:()=>setDashboardVisitFilter('')},'Show All Visits')),h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Received','Source','Resident','Visitor','Requested Visit','Message','Status','Action'].map(x=>h('th',{key:x},x)))),h('tbody',null,visitRows)))),
      h('div',{className:'card',style:{marginTop:'18px'}},h('h3',null,'Secure Messages'),h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Time','Resident','From','Message','Status','Action'].map(x=>h('th',{key:x},x)))),h('tbody',null,messageRows))))
    );
  }

  function FeedbackDashboard({profile}){
    React.useEffect(()=>{ensureCleanWorkspaceLayout()},[]);
    const [rows,setRows]=React.useState([]),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(''),[filter,setFilter]=React.useState('All'),[selected,setSelected]=React.useState(null),[reply,setReply]=React.useState(''),[status,setStatus]=React.useState('Under Review'),[saving,setSaving]=React.useState(false);

    async function load(){
      setLoading(true);setError('');
      try{
        let q=client.from('feedback').select('*').order('created_at',{ascending:false}).limit(250);
        if(filter!=='All')q=q.eq('status',filter);
        const {data,error}=await q;if(error)throw error;setRows(data||[]);
      }catch(err){setError(err.message||'Unable to load feedback.');}
      finally{setLoading(false)}
    }

    React.useEffect(()=>{load()},[filter]);

    function open(row){
      setSelected(row);
      setReply(row.admin_reply||'');
      setStatus(row.status==='New'?'Under Review':row.status||'Under Review');
    }

    const cleanMobile=value=>{
      const digits=String(value||'').replace(/\D/g,'');
      if(digits.length===10)return `91${digits}`;
      if(digits.length===12&&digits.startsWith('91'))return digits;
      return digits;
    };

    function whatsappReplyUrl(){
      if(!selected)return '';
      const number=cleanMobile(selected.mobile);
      if(!number)return '';
      const text=[
        `Dear ${selected.respondent_name||'Sir/Madam'},`,
        '',
        `Thank you for your feedback to Samara Assisted Living${selected.feedback_reference?` (${selected.feedback_reference})`:''}.`,
        '',
        reply.trim()||'',
        '',
        'Regards,',
        'Samara Management'
      ].join('\n');
      return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    }

    async function saveReply(closeAfter=true){
      if(!selected)return;
      if(!reply.trim()&&status==='Replied'){
        showSamaraActionToast('error','Reply required','Please enter the reply before marking this feedback as Replied.');
        return;
      }
      setSaving(true);
      try{
        const payload={
          status,
          admin_reply:reply.trim()||null,
          updated_at:new Date().toISOString()
        };
        if(reply.trim()){
          payload.replied_by=profile.id;
          payload.replied_at=new Date().toISOString();
          if(status==='Under Review')payload.status='Replied';
        }
        const {error}=await client.from('feedback').update(payload).eq('id',selected.id);
        if(error)throw error;
        showSamaraActionToast('success','Feedback updated',reply.trim()?'Reply and status saved successfully.':'Feedback status updated successfully.');
        if(closeAfter)setSelected(null);
        await load();
      }catch(err){
        showSamaraActionToast('error','Unable to update feedback',err.message||'Please try again.');
      }finally{setSaving(false)}
    }

    async function openWhatsAppReply(){
      if(!selected?.mobile){
        showSamaraActionToast('error','No WhatsApp number','This feedback does not contain a WhatsApp reply number.');
        return;
      }
      if(selected.reply_requested && !selected.mobile_verified){
        showSamaraActionToast('error','Number not verified','This website visitor did not complete WhatsApp verification.');
        return;
      }
      if(!reply.trim()){
        showSamaraActionToast('error','Reply required','Please enter the management reply first.');
        return;
      }
      await saveReply(false);
      const url=whatsappReplyUrl();
      if(url)window.open(url,'_blank','noopener,noreferrer');
    }

    async function markWhatsAppSent(){
      if(!selected)return;
      setSaving(true);
      try{
        const now=new Date().toISOString();
        const {error}=await client.from('feedback').update({
          status:'Replied',
          admin_reply:reply.trim()||selected.admin_reply||null,
          replied_by:profile.id,
          replied_at:now,
          reply_delivery_status:'Opened in WhatsApp / Confirmed Sent',
          reply_sent_at:now,
          updated_at:now
        }).eq('id',selected.id);
        if(error)throw error;
        showSamaraActionToast('success','Reply marked sent','The feedback is now recorded as Replied.');
        setSelected(null);await load();
      }catch(err){
        showSamaraActionToast('error','Unable to update feedback',err.message||'Please try again.');
      }finally{setSaving(false)}
    }

    const all=rows;
    const avg=all.filter(x=>x.rating).length?(all.filter(x=>x.rating).reduce((a,x)=>a+Number(x.rating),0)/all.filter(x=>x.rating).length).toFixed(1):'—';
    const count=s=>all.filter(x=>x.status===s).length;

    return h('div',{className:'feedback-admin-shell'},
      h('div',{className:'mail-hero'},
        h('div',null,h('small',null,'SAMARA EXPERIENCE & QUALITY'),h('h3',null,'Feedback Dashboard'),h('p',null,'Website, Family Portal and resident feedback in one management workspace.')),
        h('div',{className:'mail-actions'},h('button',{className:'btn btn-secondary',onClick:load},loading?'Refreshing…':'↻ Refresh'))
      ),
      h('div',{className:'feedback-stat-grid'},
        h('div',{className:'feedback-stat'},h('small',null,'Total Feedback'),h('strong',null,all.length)),
        h('div',{className:'feedback-stat'},h('small',null,'Average Rating'),h('strong',null,avg==='—'?'—':`${avg} ★`)),
        h('div',{className:'feedback-stat'},h('small',null,'New'),h('strong',null,count('New'))),
        h('div',{className:'feedback-stat'},h('small',null,'Replied'),h('strong',null,count('Replied')))
      ),
      h('div',{className:'feedback-filter-row'},['All','New','Under Review','Replied','Closed'].map(x=>h('button',{key:x,className:`btn ${filter===x?'btn-primary':'btn-secondary'}`,onClick:()=>setFilter(x)},x))),
      error&&h('div',{className:'message error'},error),
      h('div',{className:'table-card'},h('table',null,
        h('thead',null,h('tr',null,h('th',null,'Date'),h('th',null,'Reference'),h('th',null,'Source'),h('th',null,'From'),h('th',null,'Patient'),h('th',null,'Category'),h('th',null,'Rating'),h('th',null,'Status'),h('th',null,'Action'))),
        h('tbody',null,
          loading?h('tr',null,h('td',{colSpan:9},'Loading feedback…')):
          rows.length?rows.map(row=>h('tr',{key:row.id},
            h('td',null,formatDateTimeIN(row.created_at)),
            h('td',null,row.feedback_reference||'—'),
            h('td',null,row.source||'—'),
            h('td',null,row.respondent_name||row.respondent_type||'Anonymous'),
            h('td',null,row.patient_name||row.patient_code||'—'),
            h('td',null,row.category||'General'),
            h('td',null,row.rating?`${row.rating} ★`:'—'),
            h('td',null,h('span',{className:'badge'},row.status||'New')),
            h('td',null,h('button',{className:'btn btn-secondary',onClick:()=>open(row)},row.admin_reply?'View / Reply':'Review / Reply'))
          )):h('tr',null,h('td',{colSpan:9},'No feedback found.'))
        )
      )),
      selected&&h('div',{className:'modal-backdrop'},h('div',{className:'modal-card employee-modal feedback-reply-modal'},
        h('div',{className:'modal-head feedback-reply-head'},
          h('div',null,
            h('h3',null,'Feedback Review & Reply'),
            h('small',null,`${selected.feedback_reference||'Feedback'} · ${selected.source||'Source'} · ${formatDateTimeIN(selected.created_at)}`)
          ),
          h('button',{className:'icon-btn',onClick:()=>setSelected(null)},'×')
        ),
        h('div',{className:'feedback-reply-scroll'},
          h('div',{className:'feedback-detail-grid'},
            h('div',null,h('small',null,'From'),h('strong',null,selected.respondent_name||selected.respondent_type||'Anonymous')),
            h('div',null,h('small',null,'Patient'),h('strong',null,selected.patient_name||selected.patient_code||'—')),
            h('div',null,h('small',null,'Category'),h('strong',null,selected.category||'General')),
            h('div',null,h('small',null,'Rating'),h('strong',null,selected.rating?`${selected.rating} / 5 ★`:'Not rated')),
            h('div',null,h('small',null,'WhatsApp'),h('strong',null,selected.mobile?`${selected.mobile}${selected.mobile_verified?' ✓ Verified':''}`:'—')),
            h('div',null,h('small',null,'Reply Through'),h('strong',null,selected.source==='Family Portal'?'Family Portal':selected.reply_requested?'WhatsApp':'No reply requested'))
          ),
          h('div',{className:'feedback-original'},h('strong',null,selected.subject||'Feedback'),h('p',null,selected.message||'—')),
          h('div',{className:'feedback-reply-fields'},
            h('div',{className:'field'},h('label',null,'Status'),h('select',{value:status,onChange:e=>setStatus(e.target.value)},['New','Under Review','Replied','Closed'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field feedback-reply-text'},h('label',null,'Reply / Management Response'),h('textarea',{rows:4,value:reply,onChange:e=>setReply(e.target.value),placeholder:'Enter Samara management reply, acknowledgement or action taken…'}))
          ),
          selected.source==='Family Portal'
            ?h('div',{className:'feedback-reply-note'},'This management response will be visible to the authorised family member inside Family Portal → Feedback.')
            :selected.reply_requested
              ?h('div',{className:'feedback-reply-note'},selected.mobile_verified?'The visitor verified this WhatsApp number before submitting feedback.':'Warning: this visitor requested a reply, but the WhatsApp number is not verified.')
              :h('div',{className:'feedback-reply-note'},'The sender did not request a reply. You may still save an internal management response.')
        ),
        h('div',{className:'modal-actions feedback-sticky-actions'},
          h('button',{className:'btn btn-secondary',onClick:()=>setSelected(null)},'Cancel'),
          h('button',{className:'btn btn-secondary',disabled:saving,onClick:()=>saveReply(true)},saving?'Saving…':'Save Reply'),
          selected.source!=='Family Portal'&&selected.reply_requested&&selected.mobile
            ?h('button',{className:'btn btn-primary',disabled:saving||!selected.mobile_verified,onClick:openWhatsAppReply},'Open WhatsApp Reply')
            :null,
          selected.source!=='Family Portal'&&selected.reply_requested&&selected.mobile
            ?h('button',{className:'btn btn-primary',disabled:saving||!selected.mobile_verified,onClick:markWhatsAppSent},'Confirm Sent')
            :h('button',{className:'btn btn-primary',disabled:saving,onClick:async()=>{setStatus('Replied');await saveReply(true);}},'Save & Mark Replied')
        )
      ))
    );
  }

