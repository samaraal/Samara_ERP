  function usePatients(){
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const load=React.useCallback(async()=>{const {data,error}=await client.from('patients').select('*').eq('is_active',true).order('full_name');if(error)console.error(error);setRows(data||[])},[]);
    React.useEffect(()=>{load();const ch=client.channel(`active-patients-${Math.random()}`).on('postgres_changes',{event:'*',schema:'public',table:'patients'},load).subscribe();return()=>client.removeChannel(ch)},[load]);
    return [rows,load];
  }
  function patientSelect(rows,value,onChange,label='Patient'){return h('div',{className:'field'},h('label',null,label),h('select',{value,onChange:e=>onChange(e.target.value),required:true},h('option',{value:''},'Select patient'),rows.map(p=>h('option',{key:p.id,value:p.id},`${p.patient_id||'NO-ID'} · ${formalName(p)} · ${p.room_no&&p.bed_no?`Room ${p.room_no}-${p.bed_no}`:'Room unassigned'}`))))}
  function roomBedSelect(rows,roomNo,bedNo,onChange,required=false,currentPatientId=''){
    const value=roomNo&&bedNo?`${roomNo}|||${bedNo}`:'';
    const sorted=[...(rows||[])].filter(isPatientBed).sort((a,b)=>
      String(a.room_no||'').localeCompare(String(b.room_no||''),undefined,{numeric:true})
      ||String(a.bed_no||'').localeCompare(String(b.bed_no||''),undefined,{numeric:true})
    );

    const availableCount=sorted.filter(r=>{
      const occupied=!!r.occupant_id&&String(r.occupant_id)!==String(currentPatientId||'');
      const status=occupied?'Occupied':String(r.status||'Available');
      return status==='Available';
    }).length;

    function tariffText(r){
      const roomRate=Number(r.room_daily_rate??r.daily_rate??0);
      const nursingRate=Number(r.nursing_daily_rate??0);
      const specialRate=Number(r.special_nurse_daily_rate??0);
      return [
        roomRate?`Room ₹${roomRate.toLocaleString('en-IN')}`:'',
        nursingRate?`Nursing ₹${nursingRate.toLocaleString('en-IN')}`:'',
        specialRate?`Special Nurse ₹${specialRate.toLocaleString('en-IN')}`:''
      ].filter(Boolean).join(' + ');
    }

    function optionDetails(r){
      const occupantId=r.occupant_id;
      const isCurrent=Boolean(
        currentPatientId&&String(occupantId||'')===String(currentPatientId)
      );
      const occupied=!!occupantId&&!isCurrent;
      const status=isCurrent?'Current':occupied?'Occupied':String(r.status||'Available');
      const type=String(r.room_type||'Room').replace(/\s+/g,' ').trim();
      const occupant=occupied
        ?` · Occupied by ${r.occupant_name||'Patient'}${r.occupant_patient_id?` (${r.occupant_patient_id})`:''}`
        :status==='Reserved'
          ?` · Reserved${r.reserved_for_name?` for ${r.reserved_for_name}`:''}`
          :'';
      const tariff=tariffText(r);
      return {
        status,
        disabled:!isCurrent&&status!=='Available',
        text:`Room ${r.room_no}-${r.bed_no} · ${type} · ${status}${occupant}${tariff?` · ${tariff}/day`:''}`,
        background:status==='Available'?'#dff7e8':status==='Occupied'?'#ffe1e1':status==='Reserved'?'#e3eeff':status==='Current'?'#e8f7ee':'#f1f1f1',
        color:status==='Available'||status==='Current'?'#a91360':status==='Occupied'?'#b42318':status==='Reserved'?'#175cd3':'#555'
      };
    }

    return h('div',{className:'field span-2 compact-room-select'},
      h('label',null,'Room / Bed'),
      h('select',{
        className:'room-bed-select available-room-select',
        value,
        required,
        onChange:e=>{
          const [r,b]=String(e.target.value||'').split('|||');
          onChange(r||'',b||'');
        },
        style:{backgroundColor:value?'#e8f7ee':'#ffffff',color:value?'#a91360':'#344054',fontWeight:'700'}
      },
        h('option',{value:''},availableCount?`Select available room / bed (${availableCount})`:'No available rooms / beds'),
        sorted.map(r=>{
          const info=optionDetails(r);
          return h('option',{
            key:r.id,
            value:`${r.room_no}|||${r.bed_no}`,
            disabled:info.disabled,
            style:{backgroundColor:info.background,color:info.color,fontWeight:'700'}
          },info.text);
        })
      ),
      h('div',{className:'room-status-legend'},
        h('span',{className:'legend-item available'},'● Available'),
        h('span',{className:'legend-item occupied'},'● Occupied'),
        h('span',{className:'legend-item reserved'},'● Reserved'),
        h('span',{className:'legend-item maintenance'},'● Maintenance')
      ),
      h('small',{className:availableCount?'room-availability-note available':'room-availability-note none'},
        availableCount
          ?`${availableCount} available room/bed option(s). Occupied and reserved rooms are shown for information but cannot be selected.`
          :'No room or bed is currently available. Occupied and reserved rooms are shown for information only.'
      )
    );
  }

  function fileInput(label,files,setFiles,accept='image/*,.pdf',camera=false){return h('div',{className:'field'},h('label',null,label),h('input',{type:'file',accept,multiple:true,capture:camera?'environment':undefined,onChange:e=>setFiles(Array.from(e.target.files||[]))}),files?.length?h('small',null,`${files.length} file(s) selected`):null)}

  function Section({title,subtitle,actions,children,className=''}){return h('div',{className:`card panel ${className}`.trim()},h('div',{className:'panel-head'},h('div',null,h('h3',null,title),subtitle&&h('small',null,subtitle)),actions),children)}

  
