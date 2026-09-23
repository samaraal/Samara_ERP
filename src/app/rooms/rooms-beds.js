function RoomsBeds({profile,onNavigate}){
    const canManage=profile?.role==='Admin'||(profile?.role==='Manager'&&!isNursingManagerProfile(profile));
    const nurseView=profile?.role==='Nurse';
    const empty={
      room_no:'100',bed_no:'A',room_type:'Twin Sharing',status:'Available',
      room_daily_rate:'2000',nursing_daily_rate:'800',special_nurse_daily_rate:'0',
      floor:'',wing:'',notes:'',
      reserved_for_name:'',reserved_for_contact:'',reserved_by_name:'',reserved_by_contact:'',
      expected_admission_date:'',expected_admission_time:'17:00',reservation_notes:''
    };
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [patients,setPatients]=React.useState([]);
    const [history,setHistory]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [show,setShow]=React.useState(false);
    const [showTransfer,setShowTransfer]=React.useState(false);
    const [showReservation,setShowReservation]=React.useState(false);
    const [reservationRow,setReservationRow]=React.useState(null);
    const [reservationMode,setReservationMode]=React.useState('view');
    const [reservationDraft,setReservationDraft]=React.useState({reserved_for_name:'',reserved_for_contact:'',reserved_by_name:'',reserved_by_contact:'',expected_admission_date:'',expected_admission_time:'17:00',reservation_notes:''});
    const [reservationBusy,setReservationBusy]=React.useState(false);
    const [reservationMsg,setReservationMsg]=React.useState('');
    const [reservationClock,setReservationClock]=React.useState(Date.now());
    const [form,setForm]=React.useState(empty);
    const [transfer,setTransfer]=React.useState({patient_id:'',to_room_bed_id:'',reason:'',effective_at:new Date().toISOString().slice(0,16)});
    const [editing,setEditing]=React.useState(null);
    const [busy,setBusy]=React.useState(false);
    const [msg,setMsg]=React.useState('');
    const [toast,setToast]=React.useState(null);
    const [dashboardBedFilter,setDashboardBedFilter]=React.useState(()=>{
      try{
        const requested=sessionStorage.getItem('samara-room-bed-filter')||'';
        sessionStorage.removeItem('samara-room-bed-filter');
        return nurseView?'available':(['available','occupied','reserved','maintenance'].includes(requested)?requested:'');
      }catch(_error){return nurseView?'available':''}
    });
    function showRoomFilter(filter){
      setDashboardBedFilter(filter);
      window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>document.getElementById('room-filter-results')?.scrollIntoView({behavior:'smooth',block:'start'})));
    }

    async function load(){
      setLoading(true);setMsg('');
      const [roomResult,patientResult,historyResult]=await Promise.all([
        client.from('room_beds').select('*').order('room_no',{ascending:true}).order('bed_no',{ascending:true}),
        client.from('patients').select('id,patient_id,title,full_name,gender,room_no,bed_no,patient_category,special_nurse_required,is_active,billing_package,package_end_date').eq('is_active',true).order('full_name'),
        client.from('room_transfer_history').select('*').order('effective_at',{ascending:false}).limit(300)
      ]);
      if(roomResult.error){setMsg(roomResult.error.message||'Unable to load rooms');setRows([])}else setRows(roomResult.data||[]);
      if(patientResult.error){setMsg(patientResult.error.message||'Unable to load active patients');setPatients([])}else setPatients(patientResult.data||[]);
      if(!historyResult.error)setHistory(historyResult.data||[]);
      setLoading(false);
    }

    React.useEffect(()=>{
      load();
      const ch=client.channel('rooms-management-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'room_beds'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'patients'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'room_transfer_history'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[]);
    React.useEffect(()=>{const timer=setInterval(()=>setReservationClock(Date.now()),60000);return()=>clearInterval(timer)},[]);

    function showToast(type,text){
      const savedWithWarning=type==='success'&&/saved for review|warning/i.test(String(text));
      showSamaraActionToast(type,savedWithWarning?'Assignment saved with warning':type==='success'?'Saved successfully':'Action failed',text);
      setToast({type,text});
      setTimeout(()=>setToast(null),4500);
    }
    function patientFor(row){
      return patients.find(p=>p.id===row.patient_id)
        ||patients.find(p=>String(p.room_no||'')===String(row.room_no||'')&&String(p.bed_no||'').toUpperCase()===String(row.bed_no||'').toUpperCase())
        ||null;
    }
    function patientName(id){
      const p=patients.find(x=>x.id===id);
      return p?`${formalName(p)} · ${p.patient_id||'—'}`:'Former / discharged patient';
    }
    const patientUseRows=rows.filter(isPatientBed);
    const operationalSpaceRows=rows.filter(isOperationalRoomSpace);
    const availableRows=patientUseRows.filter(r=>!patientFor(r)&&String(r.status||'').trim().toLowerCase()==='available');
    const occupiedRows=patientUseRows.filter(r=>patientFor(r)||String(r.status||'').trim().toLowerCase()==='occupied');
    const displayedRoomRows=dashboardBedFilter==='reserved'
      ?patientUseRows.filter(r=>!patientFor(r)&&String(r.status||'').trim().toLowerCase()==='reserved')
      :dashboardBedFilter==='maintenance'
        ?patientUseRows.filter(r=>!patientFor(r)&&String(r.status||'').trim().toLowerCase()==='maintenance')
        :dashboardBedFilter==='available'?availableRows:patientUseRows;
    const occupied=occupiedRows.length;
    const reservedRows=patientUseRows.filter(r=>String(r.status||'').trim().toLowerCase()==='reserved');
    const reserved=reservedRows.length;
    const overdueReservations=reservedRows.filter(r=>reservationTiming(r).className==='overdue').length;
    const maintenance=patientUseRows.filter(r=>String(r.status||'').trim().toLowerCase()==='maintenance').length;

    function defaultTariff(type){
      const value=String(type||'').toLowerCase();
      if(value.includes('private')||value.includes('single')||value.includes('separate')||value.includes('deluxe'))return {room:'3000',nursing:'1000'};
      if(value.includes('general')||value.includes('ward')||value.includes('dorm'))return {room:'1800',nursing:'750'};
      return {room:'2000',nursing:'800'};
    }
    function openNew(){
      setEditing(null);
      setForm({
        ...empty,
        reserved_by_name:formalName(profile)||profile?.full_name||'',
        reserved_by_contact:profile?.mobile||profile?.phone||profile?.contact_number||''
      });
      setMsg('');setShow(true);
    }
    function openEdit(row){
      if(row.duty_date<todayISOIndia()){showToast('error','Past duty dates cannot be modified.');return}
      setEditing(row);
      setForm({
        room_no:row.room_no||'',bed_no:row.bed_no||'',room_type:['Private / Single','Private','Single'].includes(row.room_type)?'Single / Private':row.room_type||'Twin Sharing',
        status:patientFor(row)?'Occupied':row.status||'Available',
        room_daily_rate:String(row.room_daily_rate??row.daily_rate??''),
        nursing_daily_rate:String(row.nursing_daily_rate??''),
        special_nurse_daily_rate:String(row.special_nurse_daily_rate??''),
        floor:row.floor||'',wing:row.wing||'',notes:row.notes||'',
        reserved_for_name:row.reserved_for_name||'',
        reserved_for_contact:row.reserved_for_contact||'',
        reserved_by_name:row.reserved_by_name||formalName(profile)||profile?.full_name||'',
        reserved_by_contact:row.reserved_by_contact||profile?.mobile||profile?.phone||profile?.contact_number||'',
        expected_admission_date:row.expected_admission_date||'',expected_admission_time:String(row.expected_admission_time||'17:00').slice(0,5),
        reservation_notes:row.reservation_notes||''
      });
      setShow(true);
    }
    function changeRoomType(value){
      const tariff=defaultTariff(value);
      setForm(current=>({...current,room_type:value,room_daily_rate:tariff.room,nursing_daily_rate:tariff.nursing}));
    }
    function reservationValues(row={}){return {
      reserved_for_name:row.reserved_for_name||'',reserved_for_contact:row.reserved_for_contact||'',
      reserved_by_name:row.reserved_by_name||formalName(profile)||profile?.full_name||'',reserved_by_contact:row.reserved_by_contact||profile?.mobile||profile?.phone||'',
      expected_admission_date:row.expected_admission_date||todayISOIndia(),expected_admission_time:String(row.expected_admission_time||'17:00').slice(0,5),reservation_notes:row.reservation_notes||''
    }}
    function openReserve(row){setReservationRow(row);setReservationDraft(reservationValues(row));setReservationMode('create');setReservationMsg('');setShowReservation(true)}
    function openReservationView(row){
      setReservationRow(row);
      setReservationDraft(reservationValues(row));setReservationMode('view');setReservationMsg('');
      setShowReservation(true);
    }
    function reservationTiming(row){
      if(!row?.expected_admission_date)return {label:'Expected time not entered',className:'reserved'};
      const expected=new Date(`${row.expected_admission_date}T${String(row.expected_admission_time||'17:00').slice(0,5)}:00`);
      const difference=expected.getTime()-reservationClock;
      if(difference<0)return {label:'Reservation Overdue',className:'overdue'};
      if(difference<=60*60*1000)return {label:'Arrival Due',className:'due'};
      return {label:'Reserved',className:'reserved'};
    }
    async function saveReservation(event){
      event.preventDefault();if(!reservationRow||reservationBusy)return;
      if(!reservationDraft.reserved_for_name.trim()||!reservationDraft.reserved_for_contact.trim()||!reservationDraft.expected_admission_date||!reservationDraft.expected_admission_time){setReservationMsg('Name, contact number, expected date and expected time are required.');return}
      const expectedArrival=new Date(`${reservationDraft.expected_admission_date}T${reservationDraft.expected_admission_time}:00`);
      if(Number.isNaN(expectedArrival.getTime())||expectedArrival.getTime()<=Date.now()){setReservationMsg('Expected arrival date and time must be in the future.');return}
      setReservationBusy(true);setReservationMsg('');
      const payload={...reservationDraft,status:'Reserved',reserved_at:reservationRow.reserved_at||new Date().toISOString(),updated_at:new Date().toISOString()};
      const {error}=await client.from('room_beds').update(payload).eq('id',reservationRow.id);
      setReservationBusy(false);
      if(error){setReservationMsg(error.message||'Unable to reserve room.');return}
      await writeAuditEvent(reservationMode==='extend'?'Room Reservation Extended':'Room Reserved','Rooms',reservationRow.id,{room_no:reservationRow.room_no,bed_no:reservationRow.bed_no,...payload},'Success');
      setShowReservation(false);setReservationRow(null);showToast('success',reservationMode==='extend'?'Reservation extended successfully.':'Room reserved successfully.');await load();
    }
    async function releaseReservation(){
      if(!reservationRow||reservationBusy||!confirm(`Cancel reservation and release Room ${reservationRow.room_no}-${reservationRow.bed_no} as Available?`))return;
      setReservationBusy(true);
      const auditDetails={room_no:reservationRow.room_no,bed_no:reservationRow.bed_no,reserved_for_name:reservationRow.reserved_for_name,expected_admission_date:reservationRow.expected_admission_date,expected_admission_time:reservationRow.expected_admission_time};
      const {error}=await client.from('room_beds').update({status:'Available',reserved_for_name:null,reserved_for_contact:null,reserved_by_name:null,reserved_by_contact:null,expected_admission_date:null,expected_admission_time:null,reservation_notes:null,reserved_at:null,updated_at:new Date().toISOString()}).eq('id',reservationRow.id);
      setReservationBusy(false);if(error){setReservationMsg(error.message||'Unable to release bed.');return}
      await writeAuditEvent('Room Reservation Cancelled / Bed Released','Rooms',reservationRow.id,auditDetails,'Success');setShowReservation(false);setReservationRow(null);showToast('success','Reservation cancelled and bed released as Available.');await load();
    }
    function markReservedBedForAdmission(){
      if(!reservationRow)return;
      sessionStorage.setItem('samara-reserved-room-admission',JSON.stringify({room_bed_id:reservationRow.id,room_no:reservationRow.room_no,bed_no:reservationRow.bed_no,reserved_for_name:reservationRow.reserved_for_name,reserved_for_contact:reservationRow.reserved_for_contact}));
      writeAuditEvent('Reserved Bed Sent to Admission','Rooms',reservationRow.id,{room_no:reservationRow.room_no,bed_no:reservationRow.bed_no},'Success');setShowReservation(false);setReservationRow(null);onNavigate?.('Admissions');
    }

    async function saveRoom(e){
      e.preventDefault();
      if(!canManage)return;
      setBusy(true);setMsg('');
      try{
        const payload={
          room_no:String(form.room_no||'').trim().toUpperCase(),
          bed_no:String(form.bed_no||'').trim().toUpperCase(),
          room_type:form.room_type,
          room_daily_rate:Number(form.room_daily_rate||0),
          nursing_daily_rate:Number(form.nursing_daily_rate||0),
          special_nurse_daily_rate:Number(form.special_nurse_daily_rate||0),
          daily_rate:Number(form.room_daily_rate||0),
          status:editing&&patientFor(editing)?'Occupied':form.status,
          floor:form.floor||null,wing:form.wing||null,notes:form.notes||null,
          reserved_for_name:form.status==='Reserved'?String(form.reserved_for_name||'').trim():null,
          reserved_for_contact:form.status==='Reserved'?String(form.reserved_for_contact||'').trim():null,
          reserved_by_name:form.status==='Reserved'?String(form.reserved_by_name||'').trim():null,
          reserved_by_contact:form.status==='Reserved'?String(form.reserved_by_contact||'').trim():null,
          expected_admission_date:form.status==='Reserved'?(form.expected_admission_date||null):null,
          expected_admission_time:form.status==='Reserved'?(form.expected_admission_time||null):null,
          reservation_notes:form.status==='Reserved'?String(form.reservation_notes||'').trim()||null:null,
          reserved_at:form.status==='Reserved'?(editing?.reserved_at||new Date().toISOString()):null,
          updated_at:new Date().toISOString()
        };
        if(!payload.room_no||!payload.bed_no)throw new Error('Room number and bed code are required.');
        const duplicate=rows.find(r=>
          String(r.room_no||'').trim().toUpperCase()===payload.room_no
          &&String(r.bed_no||'').trim().toUpperCase()===payload.bed_no
          &&r.id!==editing?.id
        );
        if(duplicate)throw new Error(`Room ${payload.room_no} / Bed ${payload.bed_no} already exists.`);
        if(payload.room_daily_rate<0||payload.nursing_daily_rate<0||payload.special_nurse_daily_rate<0)throw new Error('Tariff amounts cannot be negative.');
        if(payload.status==='Reserved'){
          if(!payload.reserved_for_name)throw new Error('Reserved for name is required.');
          if(!payload.reserved_for_contact)throw new Error('Reserved person contact number is required.');
          if(!payload.reserved_by_name)throw new Error('Reserved by name is required.');
          if(!payload.expected_admission_date)throw new Error('Expected admission date is required.');
          if(!payload.expected_admission_time)throw new Error('Expected admission time is required.');
        }
        let result;
        if(editing?.id)result=await client.from('room_beds').update(payload).eq('id',editing.id);
        else result=await client.from('room_beds').insert(payload);
        if(result.error)throw result.error;
        setShow(false);showToast('success','Room, bed and tariffs saved successfully.');await load();
      }catch(error){setMsg(error.message||'Unable to save room')}
      setBusy(false);
    }

    function openTransfer(row){
      const p=patientFor(row);
      if(!p)return;
      setTransfer({patient_id:p.id,to_room_bed_id:'',reason:'',effective_at:new Date().toISOString().slice(0,16)});
      setShowTransfer(true);
    }
    function openTransferManager(){
      if(!canManage)return;
      setTransfer({patient_id:'',to_room_bed_id:'',reason:'',effective_at:new Date().toISOString().slice(0,16)});
      setShowTransfer(true);
    }
    function transferFromBed(){
      const p=patients.find(x=>x.id===transfer.patient_id);
      if(!p)return null;
      return rows.find(r=>r.patient_id===p.id)
        ||rows.find(r=>String(r.room_no||'')===String(p.room_no||'')&&String(r.bed_no||'').toUpperCase()===String(p.bed_no||'').toUpperCase())
        ||null;
    }
    function transferToBed(){return rows.find(r=>String(r.id)===String(transfer.to_room_bed_id))||null}
    function roomTariffTotal(r){return Number(r?.room_daily_rate??r?.daily_rate??0)+Number(r?.nursing_daily_rate||0)+Number(r?.special_nurse_daily_rate||0)}
    function roomTariffMoney(value){return `₹${Number(value||0).toLocaleString('en-IN')}`}

    async function transferPatient(e){
      e.preventDefault();
      if(!canManage||busy)return;
      if(!transfer.patient_id){showToast('error','Select the patient to be shifted.');return}
      if(!transfer.to_room_bed_id){showToast('error','Select the new room and bed.');return}
      if(!transfer.reason.trim()){showToast('error','Reason for room shifting is mandatory.');return}
      setBusy(true);
      const {data,error}=await client.rpc('transfer_patient_room',{
        p_patient_id:transfer.patient_id,
        p_to_room_bed_id:transfer.to_room_bed_id,
        p_reason:transfer.reason.trim(),
        p_effective_at:new Date(transfer.effective_at).toISOString()
      });
      setBusy(false);
      if(error){showToast('error',error.message||'Unable to shift patient.');return}
      setShowTransfer(false);
      showToast('success','Patient shifted successfully. Previous room history is preserved and the applicable room/nursing tariff has been synchronised with Accounts from the shift date.');
      await load();
      writeAuditEvent('Patient Room Shifted','Rooms',transfer.patient_id,data||{},'Success');
    }

    async function removeRoom(row){
      if(!canManage)return;
      if(patientFor(row)){showToast('error','Occupied room/bed cannot be deleted. Shift or discharge the patient first.');return}
      if(!confirm(`Delete Room ${row.room_no} / Bed ${row.bed_no}?`))return;
      const {error}=await client.from('room_beds').delete().eq('id',row.id);
      if(error)showToast('error',error.message);else{showToast('success','Room/bed deleted.');load()}
    }

    if(loading)return h('div',{className:'loading'},'Loading Rooms Management…');

    return h(React.Fragment,null,
      h('style',null,`.available-bed-compact-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}.available-bed-compact-row{display:flex;flex-direction:column;gap:7px;padding:12px 14px;border:1px solid #efc7d9;border-radius:12px;background:#fff8fb}.available-bed-compact-main{display:flex;align-items:center;justify-content:space-between;gap:12px}.available-bed-compact-main strong{font-size:15px;color:#382333}.available-bed-compact-main span{font-size:13px;color:#735d69}.available-bed-compact-rates{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:#5d4654}.available-bed-compact-meta{display:flex;align-items:center;justify-content:space-between;gap:10px}.available-bed-compact-meta small{color:#735d69}@media(max-width:640px){.available-bed-compact-list{grid-template-columns:1fr}.available-bed-compact-row{padding:11px 12px}.available-bed-compact-main{align-items:flex-start}.available-bed-compact-rates{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px}}.occupied-bed-panel{margin-top:16px}.occupied-bed-compact-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px}.occupied-bed-compact-row{display:flex;flex-direction:column;gap:8px;padding:13px 14px;border:1px solid #e9b6cc;border-radius:12px;background:#fff3f8}.occupied-bed-compact-main{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.occupied-bed-compact-main>div{display:flex;gap:10px;align-items:baseline}.occupied-bed-compact-main strong{font-size:15px;color:#382333}.occupied-bed-compact-main span{font-size:13px;color:#735d69}.occupied-bed-patient{display:flex;align-items:baseline;gap:8px}.occupied-bed-patient strong{font-size:14px;color:#7a1247}.occupied-bed-patient small{color:#735d69}.occupied-bed-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px}.occupied-bed-meta>div{display:flex;flex-direction:column;gap:2px}.occupied-bed-meta span{font-size:12px;color:#735d69}.occupied-bed-meta strong{font-size:13px;color:#382333}@media(max-width:640px){.occupied-bed-compact-list{grid-template-columns:1fr}.occupied-bed-meta{grid-template-columns:1fr}.occupied-bed-compact-main>div{display:block}.occupied-bed-patient{display:block}}`),
      h('div',{className:'rooms-hero'},
        h('div',null,h('small',null,nurseView?'NURSING · VIEW ONLY':'ADMIN / MANAGER CONTROL'),h('h3',null,nurseView?'Bed Availability':'Rooms Management'),h('p',null,nurseView?'Available and occupied beds for quick reference. No room, tariff, reservation, allotment or room-shift changes are permitted from the Nurse login.':'Room master, tariff fixation, admission allotment and patient room-shifting history.')),
        canManage&&h('button',{className:'btn btn-primary',onClick:openNew},'+ Add Room / Bed')
      ),
      !nurseView&&h('div',{className:'grid stats room-summary'},
        h('button',{type:'button',className:`card stat room-stat-total room-summary-link ${dashboardBedFilter===''?'active':''}`,onClick:()=>showRoomFilter(''),'aria-label':'Show all patient beds'},h('span',null,'Total Patient Beds'),h('strong',null,patientUseRows.length),h('small',null,'Office and Store excluded →')),
        h('button',{type:'button',className:`card stat room-stat-occupied room-summary-link ${dashboardBedFilter==='occupied'?'active':''}`,onClick:()=>showRoomFilter('occupied'),'aria-label':'Show occupied beds'},h('span',null,'Occupied'),h('strong',null,occupied),h('small',null,'View occupied beds →')),
        h('button',{type:'button',className:`card stat room-stat-available room-summary-link ${dashboardBedFilter==='available'?'active':''}`,onClick:()=>showRoomFilter('available'),'aria-label':'Show available beds'},h('span',null,'Available'),h('strong',null,availableRows.length),h('small',null,'View available beds →')),
        h('button',{type:'button',className:`card stat room-stat-reserved room-summary-link ${dashboardBedFilter==='reserved'?'active':''}`,onClick:()=>showRoomFilter('reserved'),'aria-label':'Show reserved beds'},h('span',null,'Reserved'),h('strong',null,reserved),h('small',{className:overdueReservations?'reservation-dashboard-alert':''},overdueReservations?`${overdueReservations} overdue — action required →`:'View reserved beds →')),
        h('button',{type:'button',className:`card stat room-stat-maintenance room-summary-link ${dashboardBedFilter==='maintenance'?'active':''}`,onClick:()=>showRoomFilter('maintenance'),'aria-label':'Show maintenance beds'},h('span',null,'Maintenance'),h('strong',null,maintenance),h('small',null,'View maintenance beds →'))
      ),

      dashboardBedFilter!=='occupied'&&h('div',{id:'room-filter-results',className:`card panel ${dashboardBedFilter==='available'?'bed-availability-panel':''}`},
        h('div',{className:'panel-head'},
          h('div',null,
            h('h3',null,dashboardBedFilter==='available'?'Available Beds Details':dashboardBedFilter==='reserved'?'Reserved Bed Details':dashboardBedFilter==='maintenance'?'Maintenance Bed Details':'Room, Bed & Tariff Master'),
            h('small',null,dashboardBedFilter==='available'
              ?`${availableRows.length} bed${availableRows.length===1?' is':'s are'} currently available for allotment.`
              :dashboardBedFilter==='reserved'
                ?`${reserved} bed${reserved===1?' is':'s are'} currently reserved.`
                :dashboardBedFilter==='maintenance'
                  ?`${maintenance} bed${maintenance===1?' is':'s are'} currently under maintenance.`
                  :'Only Admin/Manager may change tariffs, allot rooms or shift patients.')
          ),
          dashboardBedFilter!==''&&!nurseView&&dashboardBedFilter!=='occupied'&&h('button',{className:'btn btn-secondary',onClick:()=>setDashboardBedFilter('')},'Show All Beds')
        ),
        msg&&h('div',{className:'message error'},msg),
        dashboardBedFilter==='available'
          ?h('div',{className:'available-bed-compact-list'},
              availableRows.length
                ?availableRows.map(row=>h('div',{className:'available-bed-compact-row',key:row.id},
                    h('div',{className:'available-bed-compact-main'},
                      h('strong',null,`Room ${row.room_no}-${row.bed_no}`),
                      h('span',null,row.room_type||'Room')
                    ),
                    h('div',{className:'available-bed-compact-rates'},
                      h('span',null,`Room ₹${Number(row.room_daily_rate??row.daily_rate??0).toLocaleString('en-IN')}/day`),
                      h('span',null,`Nursing ₹${Number(row.nursing_daily_rate||0).toLocaleString('en-IN')}/day`),
                      Number(row.special_nurse_daily_rate||0)>0&&h('span',null,`Special Nurse ₹${Number(row.special_nurse_daily_rate||0).toLocaleString('en-IN')}/day`)
                    ),
                    h('div',{className:'available-bed-compact-meta'},
                      [row.floor,row.wing].filter(Boolean).length?h('small',null,[row.floor,row.wing].filter(Boolean).join(' / ')):null,
                      h('div',{className:'available-bed-actions'},h('span',{className:'room-status room-status-available'},'Available'),canManage&&h('button',{type:'button',className:'btn btn-reserve-room',onClick:()=>openReserve(row)},'Reserve'))
                    )
                  ))
                :h('div',{className:'empty'},'No beds currently available.')
            )
          :h('div',{className:'table-wrap rooms-desktop-table-wrap'},h('table',{className:'table rooms-table'},
              h('thead',null,h('tr',null,['Room','Bed','Type','Floor / Wing','Room Rent / Day','Nursing / Day','Special Nurse / Day','Status','Patient','Action'].map(x=>h('th',{key:x},x)))),
              h('tbody',null,
                displayedRoomRows.map(row=>{
                  const p=patientFor(row),status=p?'Occupied':row.status,timing=status==='Reserved'?reservationTiming(row):null;
                  return h('tr',{key:row.id},
                    h('td',null,h('strong',null,row.room_no)),h('td',null,row.bed_no),h('td',null,row.room_type||'—'),
                    h('td',null,[row.floor,row.wing].filter(Boolean).join(' / ')||'—'),
                    h('td',null,`₹${Number(row.room_daily_rate??row.daily_rate??0).toLocaleString('en-IN')}`),
                    h('td',null,`₹${Number(row.nursing_daily_rate||0).toLocaleString('en-IN')}`),
                    h('td',null,`₹${Number(row.special_nurse_daily_rate||0).toLocaleString('en-IN')}`),
                    h('td',null,h('span',{className:`room-status room-status-${timing?.className||String(status).toLowerCase()}`},timing?.label||status)),
                    h('td',null,
                      p?h('div',null,h('strong',null,formalName(p)),h('small',null,p.patient_id||'—')):
                      status==='Reserved'?h('div',null,h('strong',null,row.reserved_for_name||'Reservation details pending'),h('small',null,row.expected_admission_date?`Expected: ${formatDateIN(row.expected_admission_date)}`:'Expected date not entered')):'—'
                    ),
                    h('td',null,canManage?h('div',{className:'employee-actions'},
                      status==='Reserved'&&h('button',{className:'btn btn-secondary',onClick:()=>openReservationView(row)},'View'),
                      status==='Available'&&h('button',{className:'btn btn-reserve-room',onClick:()=>openReserve(row)},'Reserve'),
                      h('button',{className:'btn btn-secondary',onClick:()=>openEdit(row)},'Edit / Tariff'),
                      p&&h('button',{className:'btn btn-primary',onClick:()=>openTransfer(row)},'Shift Room'),
                      h('button',{className:'btn btn-danger',disabled:!!p,onClick:()=>removeRoom(row)},'Delete')
                    ):status==='Reserved'?h('button',{className:'btn btn-secondary',onClick:()=>openReservationView(row)},'View'):h('span',{className:'small-note'},'View only'))
                  )
                }),
                displayedRoomRows.length===0&&h('tr',null,h('td',{colSpan:10,className:'empty'},'No patient beds configured in this selection.'))
              )
            ))
      ),

      !['available','occupied'].includes(dashboardBedFilter)&&h('div',{className:'rooms-mobile-list'},
        displayedRoomRows.length?displayedRoomRows.map(row=>{
          const p=patientFor(row),status=p?'Occupied':row.status,timing=status==='Reserved'?reservationTiming(row):null;
          return h('article',{className:'room-mobile-card',key:`mobile-room-${row.id}`},
            h('div',{className:'room-mobile-card-head'},
              h('div',null,h('strong',null,`Room ${row.room_no}-${row.bed_no}`),h('span',null,row.room_type||'Room')),
              h('span',{className:`room-status room-status-${timing?.className||String(status).toLowerCase()}`},timing?.label||status)
            ),
            h('div',{className:'room-mobile-card-details'},
              h('span',null,h('small',null,'Floor / Wing'),h('strong',null,[row.floor,row.wing].filter(Boolean).join(' / ')||'—')),
              h('span',null,h('small',null,'Room / Nursing'),h('strong',null,`₹${Number(row.room_daily_rate??row.daily_rate??0).toLocaleString('en-IN')} / ₹${Number(row.nursing_daily_rate||0).toLocaleString('en-IN')}`)),
              p?h('span',{className:'room-mobile-patient'},h('small',null,'Patient'),h('strong',null,formalName(p))):null
            ),
            canManage?h('div',{className:'room-mobile-actions'},
              h('button',{className:'btn btn-primary',onClick:()=>openEdit(row)},'Edit / Tariff'),
              status==='Available'&&h('button',{className:'btn btn-reserve-room',onClick:()=>openReserve(row)},'Reserve'),
              status==='Reserved'&&h('button',{className:'btn btn-secondary',onClick:()=>openReservationView(row)},'View Reservation'),
              p&&h('button',{className:'btn btn-secondary',onClick:()=>openTransfer(row)},'Shift Room'),
              !p&&h('button',{className:'btn btn-danger',onClick:()=>removeRoom(row)},'Delete')
            ):status==='Reserved'?h('button',{className:'btn btn-secondary room-mobile-view',onClick:()=>openReservationView(row)},'View Reservation'):null
          );
        }):h('div',{className:'empty'},'No patient beds configured in this selection.')
      ),

      !nurseView&&dashboardBedFilter===''&&operationalSpaceRows.length>0&&h('div',{className:'card panel operational-spaces-panel'},
        h('div',{className:'panel-head'},h('div',null,
          h('h3',null,'Operational Spaces'),
          h('small',null,'Samara Office and Samara Store are maintained separately and excluded from every patient-bed total.')
        )),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Space','Reference','Status','Action'].map(label=>h('th',{key:label},label)))),
          h('tbody',null,operationalSpaceRows.map(row=>h('tr',{key:`space-${row.id}`},
            h('td',null,h('strong',null,row.status||row.room_type||row.room_no||'Operational Space')),
            h('td',null,[row.room_no,row.bed_no].filter(Boolean).join(' / ')||'—'),
            h('td',null,h('span',{className:'badge'},'Not a Patient Bed')),
            h('td',null,canManage?h('button',{className:'btn btn-secondary',onClick:()=>openEdit(row)},'Edit'):h('span',{className:'small-note'},'View only'))
          )))
        ))
      ),

      (dashboardBedFilter==='available'||dashboardBedFilter==='occupied')&&h('div',{id:dashboardBedFilter==='occupied'?'room-filter-results':undefined,className:'card panel occupied-bed-panel'},
        h('div',{className:'panel-head'},
          h('div',null,
            h('h3',null,'Occupied Bed Details'),
            h('small',null,`${occupiedRows.length} occupied bed${occupiedRows.length===1?'':'s'} · Package expiry is shown for reference. Bed availability is subject to the resident’s confirmed discharge plan.`)
          ),
          dashboardBedFilter==='occupied'&&!nurseView&&h('div',{className:'employee-actions room-shift-actions'},
            canManage&&h('button',{type:'button',className:'btn btn-primary',onClick:openTransferManager},'⇄ Shift Room / Bed'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setDashboardBedFilter('')},'Show All Beds')
          )
        ),
        occupiedRows.length
          ?h('div',{className:'occupied-bed-compact-list'},
              occupiedRows.map(row=>{
                const p=patientFor(row);
                const packageExpiry=p?.package_end_date?formatDateIN(p.package_end_date):'Not Applicable';
                const basePackageName=p?.billing_package||'Daily Billing / No Package';
                const expiryDate=p?.package_end_date?new Date(`${p.package_end_date}T23:59:59`):null;
                const packageExpired=!!(expiryDate&&expiryDate<new Date());
                const hasFixedPackage=!!(p?.package_end_date&&basePackageName!=='No Package / Daily Billing'&&basePackageName!=='Daily Billing / No Package');
                const packageName=packageExpired&&hasFixedPackage
                  ?`${basePackageName} — Expired / Continuing on Daily Billing`
                  :basePackageName;
                const expectedAvailability=expiryDate&&!packageExpired?packageExpiry:'Not Confirmed';
                return h('div',{className:'occupied-bed-compact-row',key:`occupied-${row.id}`},
                  h('div',{className:'occupied-bed-compact-main'},
                    h('div',null,
                      h('strong',null,`Room ${row.room_no}-${row.bed_no}`),
                      h('span',null,row.room_type||'Room')
                    ),
                    h('span',{className:'room-status room-status-occupied'},'Occupied')
                  ),
                  h('div',{className:'occupied-bed-patient'},
                    h('strong',null,p?formalName(p):'Patient details unavailable'),
                    p&&h('small',null,p.patient_id||'—')
                  ),
                  h('div',{className:'occupied-bed-meta'},
                    h('div',null,h('span',null,'Package'),h('strong',null,packageName)),
                    h('div',null,h('span',null,'Package Expiry'),h('strong',{className:packageExpired&&hasFixedPackage?'package-expiry-expired':''},packageExpired&&hasFixedPackage?`${packageExpiry} (Expired)`:packageExpiry)),
                    h('div',null,h('span',null,'Expected Availability'),h('strong',null,expectedAvailability))
                  )
                );
              })
            )
          :h('div',{className:'empty'},'No occupied beds.')
      ),

      !nurseView&&h(LogTable,{
        title:`Room Shift History (${history.length})`,
        subtitle:'Previous room, new room, reason, approving user and effective date/time',
        heads:['Patient','Previous Room / Bed','New Room / Bed','Reason','Effective Date & Time','Shifted By'],
        rows:history.map(x=>[
          x.patient_name||patientName(x.patient_id),
          `${x.from_room_no||'—'}${x.from_bed_no?`-${x.from_bed_no}`:''}`,
          `${x.to_room_no||'—'}${x.to_bed_no?`-${x.to_bed_no}`:''}`,
          x.reason||'—',fmt(x.effective_at),`${x.shifted_by_name||'Authorised user'}${x.shifted_by_role?` · ${x.shifted_by_role}`:''}`
        ])
      }),

      show&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal room-bed-modal',onSubmit:saveRoom},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,editing?'Edit Room / Bed & Tariff':'Add Room / Bed'),h('small',null,'Tariffs entered here drive automatic patient billing')),h('button',{type:'button',className:'close',onClick:()=>setShow(false)},'×')),
        msg&&h('div',{className:'message error'},msg),
        h('div',{className:'modal-grid'},
          h('div',{className:'field'},h('label',null,'Room Number'),h('input',{
            type:'text',
            value:form.room_no,
            onChange:e=>setForm({...form,room_no:e.target.value}),
            placeholder:'Example: 106 / G-01 / ICU-1',
            required:true,
            maxLength:30
          })),
          h('div',{className:'field'},h('label',null,'Bed Code'),h('select',{value:form.bed_no,onChange:e=>setForm({...form,bed_no:e.target.value}),required:true},BED_CODE_OPTIONS.map(n=>h('option',{key:n,value:n},n)))),
          h('div',{className:'field'},h('label',null,'Room Type'),h('select',{value:form.room_type,onChange:e=>changeRoomType(e.target.value)},['Single / Private','Twin Sharing','Triple Sharing'].map(x=>h('option',{key:x,value:x},x)))),
          miniInput('Room Rent per Day',form.room_daily_rate,v=>setForm({...form,room_daily_rate:v}),true,'number'),
          miniInput('Nursing Charge per Day',form.nursing_daily_rate,v=>setForm({...form,nursing_daily_rate:v}),true,'number'),
          miniInput('Special Nurse Charge per Day',form.special_nurse_daily_rate,v=>setForm({...form,special_nurse_daily_rate:v}),false,'number'),
          miniInput('Floor',form.floor,v=>setForm({...form,floor:v})),
          miniInput('Wing',form.wing,v=>setForm({...form,wing:v})),
          h('div',{className:'field'},h('label',null,'Status'),h('select',{value:form.status,onChange:e=>setForm({...form,status:e.target.value}),disabled:editing&&!!patientFor(editing)},['Available','Reserved','Maintenance','Occupied','Samara Office','Samara Store'].map(x=>h('option',{key:x,value:x},x)))),
          form.status==='Reserved'&&h(React.Fragment,null,
            miniInput('Reserved For — Name',form.reserved_for_name,v=>setForm({...form,reserved_for_name:v}),true),
            miniInput('Reserved For — Contact Number',form.reserved_for_contact,v=>setForm({...form,reserved_for_contact:v}),true),
            miniInput('Reserved By — Name',form.reserved_by_name,v=>setForm({...form,reserved_by_name:v}),true),
            miniInput('Reserved By — Contact Number',form.reserved_by_contact,v=>setForm({...form,reserved_by_contact:v})),
            h('div',{className:'field'},h('label',null,'Expected Date of Admission'),h(StrictDateInput,{value:form.expected_admission_date,onChange:e=>setForm({...form,expected_admission_date:e.target.value}),min:todayISOIndia(),required:true})),
            h('div',{className:'field'},h('label',null,'Expected Time of Admission'),h('input',{type:'time',value:form.expected_admission_time||'17:00',onChange:e=>setForm({...form,expected_admission_time:e.target.value}),required:true})),
            h('div',{className:'field span-2'},h('label',null,'Reservation Notes'),h('textarea',{rows:3,value:form.reservation_notes,onChange:e=>setForm({...form,reservation_notes:e.target.value}),placeholder:'Source of request, advance received, special requirements, follow-up instructions, etc.'}))
          ),
          h('div',{className:'field span-2'},h('label',null,'Notes'),h('textarea',{rows:3,value:form.notes,onChange:e=>setForm({...form,notes:e.target.value})}))
        ),
        h('button',{className:'btn btn-primary full',disabled:busy},busy?'Saving…':'Save Room & Tariff')
      )),

      showReservation&&reservationRow&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal room-reservation-modal',onSubmit:saveReservation},
        h('div',{className:'panel-head'},
          h('div',null,h('h3',null,`${reservationMode==='create'?'Reserve':reservationMode==='extend'?'Extend Reservation —':'Reserved Room'} ${reservationRow.room_no}-${reservationRow.bed_no}`),h('small',null,reservationRow.room_type||'Room reservation details')),
          h('button',{type:'button',className:'close',onClick:()=>{setShowReservation(false);setReservationRow(null)}},'×')
        ),
        reservationMsg&&h('div',{className:'message error'},reservationMsg),
        reservationMode==='view'?h(React.Fragment,null,
          h('div',{className:`reservation-timing-banner ${reservationTiming(reservationRow).className}`},reservationTiming(reservationRow).label),
          h('div',{className:'modal-grid reservation-details-grid'},
            h('div',{className:'reservation-detail'},h('span',null,'Reserved For'),h('strong',null,reservationRow.reserved_for_name||'—')),
            h('div',{className:'reservation-detail'},h('span',null,'Contact Number'),h('strong',null,reservationRow.reserved_for_contact||'—')),
            h('div',{className:'reservation-detail'},h('span',null,'Reserved By'),h('strong',null,reservationRow.reserved_by_name||'—')),
            h('div',{className:'reservation-detail'},h('span',null,'Expected Arrival'),h('strong',null,`${reservationRow.expected_admission_date?formatDateIN(reservationRow.expected_admission_date):'—'} · ${medicationTimeLabel(reservationRow.expected_admission_time||'17:00')}`)),
            h('div',{className:'reservation-detail'},h('span',null,'Reserved On'),h('strong',null,reservationRow.reserved_at?fmt(reservationRow.reserved_at):'—')),
            h('div',{className:'reservation-detail span-2'},h('span',null,'Reservation Notes'),h('strong',null,reservationRow.reservation_notes||'—'))
          ),
          h('div',{className:'reservation-workflow-actions'},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setReservationMode('extend')},'Extend Reservation'),
            h('button',{type:'button',className:'btn btn-primary',onClick:markReservedBedForAdmission},'Mark Admitted'),
            h('button',{type:'button',className:'btn btn-danger',disabled:reservationBusy,onClick:releaseReservation},reservationBusy?'Releasing…':'Cancel & Release Bed')
          )
        ):h(React.Fragment,null,
          h('div',{className:'modal-grid'},
            miniInput('Reserved For — Name',reservationDraft.reserved_for_name,v=>setReservationDraft({...reservationDraft,reserved_for_name:v}),true),
            miniInput('Contact Number',reservationDraft.reserved_for_contact,v=>setReservationDraft({...reservationDraft,reserved_for_contact:v}),true),
            miniInput('Reserved By',reservationDraft.reserved_by_name,v=>setReservationDraft({...reservationDraft,reserved_by_name:v}),true),
            miniInput('Reserved By Contact',reservationDraft.reserved_by_contact,v=>setReservationDraft({...reservationDraft,reserved_by_contact:v})),
            h('div',{className:'field'},h('label',null,'Expected Arrival Date'),h(StrictDateInput,{value:reservationDraft.expected_admission_date,onChange:e=>setReservationDraft({...reservationDraft,expected_admission_date:e.target.value}),min:todayISOIndia(),required:true})),
            h('div',{className:'field'},h('label',null,'Expected Arrival Time'),h('input',{type:'time',value:reservationDraft.expected_admission_time,onChange:e=>setReservationDraft({...reservationDraft,expected_admission_time:e.target.value}),required:true})),
            h('div',{className:'field span-2'},h('label',null,'Reservation Notes'),h('textarea',{rows:3,value:reservationDraft.reservation_notes,onChange:e=>setReservationDraft({...reservationDraft,reservation_notes:e.target.value})}))
          ),
          h('div',{className:'reservation-workflow-actions edit'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>reservationMode==='extend'?setReservationMode('view'):(setShowReservation(false),setReservationRow(null))},'Cancel'),h('button',{className:'btn btn-reserve-room',disabled:reservationBusy},reservationBusy?'Saving…':reservationMode==='extend'?'Save Extension':'Confirm Reservation'))
        )
      )),

      showTransfer&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:transferPatient,style:{width:'min(820px,96vw)'}},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,'Shift Room / Bed'),h('small',null,transfer.patient_id?patientName(transfer.patient_id):'Select an occupied resident and available destination bed')),h('button',{type:'button',className:'close',onClick:()=>setShowTransfer(false)},'×')),
        h('div',{className:'field',style:{marginBottom:'12px'}},
          h('label',null,'Patient / Resident'),
          h('select',{required:true,value:transfer.patient_id,onChange:e=>setTransfer({...transfer,patient_id:e.target.value,to_room_bed_id:''})},
            h('option',{value:''},'Select occupied resident'),
            occupiedRows.map(r=>{const p=patientFor(r);return p?h('option',{key:p.id,value:p.id},`${formalName(p)} · ${p.patient_id||''} · Room ${r.room_no}-${r.bed_no}`):null})
          )
        ),
        (()=>{const from=transferFromBed(),to=transferToBed();return h(React.Fragment,null,
          from&&h('div',{style:{padding:'12px 14px',border:'1px solid #efc7d9',borderRadius:'12px',background:'#fff8fb',marginBottom:'12px'}},
            h('small',{style:{display:'block',color:'#806675',marginBottom:'5px'}},'CURRENT ROOM / BED'),
            h('strong',{style:{color:'#5f123c'}},`Room ${from.room_no}-${from.bed_no} · ${from.room_type||'Room'}`),
            h('div',{style:{marginTop:'5px',fontSize:'13px'}},`Room ${roomTariffMoney(from.room_daily_rate??from.daily_rate)}/day · Nursing ${roomTariffMoney(from.nursing_daily_rate)}/day${Number(from.special_nurse_daily_rate||0)>0?` · Special Nurse ${roomTariffMoney(from.special_nurse_daily_rate)}/day`:''}`)),
          h('div',{className:'modal-grid'},
            h('div',{className:'field span-2'},h('label',null,'Shift To — Available Room / Bed'),h('select',{required:true,value:transfer.to_room_bed_id,onChange:e=>setTransfer({...transfer,to_room_bed_id:e.target.value})},h('option',{value:''},'Select available room/bed'),availableRows.map(r=>h('option',{key:r.id,value:r.id},`Room ${r.room_no}-${r.bed_no} · ${r.room_type} · Room ₹${Number(r.room_daily_rate??r.daily_rate??0).toLocaleString('en-IN')} + Nursing ₹${Number(r.nursing_daily_rate||0).toLocaleString('en-IN')}`)))),
            h('div',{className:'field'},h('label',null,'Effective Date & Time'),h(StrictDateTimeInput,{value:transfer.effective_at,onChange:e=>setTransfer({...transfer,effective_at:e.target.value}),max:new Date().toISOString().slice(0,16),required:true})),
            h('div',{className:'field span-2'},h('label',null,'Reason for Shifting'),h('textarea',{required:true,rows:4,value:transfer.reason,onChange:e=>setTransfer({...transfer,reason:e.target.value}),placeholder:'Clinical need, patient/relative request, maintenance, upgrade/downgrade, gender allocation, etc.'}))
          ),
          to&&from&&h('div',{style:{marginTop:'12px',padding:'14px 16px',border:'1px solid #eab6cf',borderRadius:'14px',background:'linear-gradient(135deg,#fff4f8,#fdeaf2)'}},
            h('div',{style:{display:'flex',justifyContent:'space-between',gap:'12px',flexWrap:'wrap',alignItems:'center'}},
              h('div',null,h('small',{style:{color:'#806675'}},'NEW ROOM / BED'),h('strong',{style:{display:'block',fontSize:'16px',color:'#9d0b50'}},`Room ${to.room_no}-${to.bed_no} · ${to.room_type||'Room'}`)),
              h('strong',{style:{color:roomTariffTotal(to)>roomTariffTotal(from)?'#b42318':roomTariffTotal(to)<roomTariffTotal(from)?'#087a36':'#5f123c'}},`${roomTariffTotal(to)>roomTariffTotal(from)?'+':''}${roomTariffMoney(roomTariffTotal(to)-roomTariffTotal(from))}/day`)),
            h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:'8px',marginTop:'10px'}},
              h('div',null,h('small',null,'Room Rent'),h('strong',{style:{display:'block'}},`${roomTariffMoney(from.room_daily_rate??from.daily_rate)} → ${roomTariffMoney(to.room_daily_rate??to.daily_rate)}`)),
              h('div',null,h('small',null,'Routine Nursing'),h('strong',{style:{display:'block'}},`${roomTariffMoney(from.nursing_daily_rate)} → ${roomTariffMoney(to.nursing_daily_rate)}`)),
              h('div',null,h('small',null,'Daily Total'),h('strong',{style:{display:'block'}},`${roomTariffMoney(roomTariffTotal(from))} → ${roomTariffMoney(roomTariffTotal(to))}`))
            ),
            h('p',{style:{margin:'11px 0 0',fontSize:'13px',fontWeight:700,color:'#7d1747'}},'Accounts impact: the new room and nursing tariff will apply from the effective shift date. Earlier billing remains unchanged. Automatic accommodation charges for the affected date(s) will be synchronised in the patient ledger.'))
        )})(),
        h('p',{className:'small-note'},'The patient ID, payments and previous billing history remain unchanged. The room shift and tariff change are recorded in Room Shift History and reflected in Accounts.'),
        h('button',{className:'btn btn-primary full',disabled:busy},busy?'Shifting & Updating Accounts…':'Confirm Room Shift & Update Accounts')
      )),

      toast&&h('div',{className:`samara-toast ${toast.type}`},h('span',{className:'samara-toast-icon'},toast.type==='success'?'✓':'!'),h('div',null,h('strong',null,toast.type==='success'?'Rooms updated':'Update failed'),h('span',null,toast.text)),h('button',{onClick:()=>setToast(null)},'×'))
    );
  }
