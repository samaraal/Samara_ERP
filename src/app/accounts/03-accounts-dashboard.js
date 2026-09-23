  function AccountsDashboard({profile,onNavigate}){
    React.useEffect(()=>{ensureAccountsWorkspaceStyle()},[]);
    const [state,setState]=React.useState({
      loading:true,transactions:[],requests:[],discharges:[],patients:[]
    });

    const money=value=>`₹${Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    const dateKey=value=>String(value||'').slice(0,10);
    const monthKey=value=>dateKey(value).slice(0,7);

    async function load(){
      const [transactions,requests,discharges,patients]=await Promise.all([
        client.from('billing_transactions')
          .select('id,patient_id,transaction_type,category,amount,payment_mode,transaction_date,description')
          .order('transaction_date',{ascending:false}).limit(3000),
        client.from('bill_charge_requests')
          .select('id,patient_id,approval_status,requested_amount,approved_amount,final_amount,created_at'),
        client.from('patient_discharges')
          .select('id,status,management_status,accounts_status,created_at'),
        client.from('patients')
          .select('id,full_name,title,patient_id,is_active,admission_date,room_no,bed_no,package_id,package_end_date')
      ]);
      setState({
        loading:false,
        transactions:transactions.data||[],
        requests:requests.data||[],
        discharges:discharges.data||[],
        patients:patients.data||[]
      });
    }

    React.useEffect(()=>{
      load();
      const channel=client.channel('accounts-dashboard-live-v230')
        .on('postgres_changes',{event:'*',schema:'public',table:'billing_transactions'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'bill_charge_requests'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'patient_discharges'},load)
        .subscribe();
      return()=>client.removeChannel(channel);
    },[]);

    const today=todayISOIndia();
    const month=today.slice(0,7);
    const rows=state.transactions;
    const sum=(list,types)=>list
      .filter(row=>types.includes(row.transaction_type))
      .reduce((total,row)=>total+Number(row.amount||0),0);

    const charges=sum(rows,['Charge']);
    const collections=sum(rows,['Payment','Advance']);
    const discounts=sum(rows,['Discount']);
    const refunds=sum(rows,['Refund']);
    const outstanding=Math.max(0,charges-collections-discounts+refunds);
    const todayCollections=sum(rows.filter(row=>dateKey(row.transaction_date)===today),['Payment','Advance']);
    const monthCollections=sum(rows.filter(row=>monthKey(row.transaction_date)===month),['Payment','Advance']);
    const monthRows=rows.filter(row=>monthKey(row.transaction_date)===month);
    const monthGrossCharges=sum(monthRows,['Charge']);
    const monthDiscounts=sum(monthRows,['Discount']);
    const monthRevenue=Math.max(0,monthGrossCharges-monthDiscounts);
    const pendingApprovals=state.requests.filter(row=>(row.approval_status||'Pending')==='Pending').length;
    const finalBills=state.patients.filter(row=>row.is_active!==false).filter(patient=>{
      const patientRows=rows.filter(row=>row.patient_id===patient.id);
      return sum(patientRows,['Charge'])-sum(patientRows,['Payment','Advance','Discount'])+sum(patientRows,['Refund'])>0.009;
    }).length;
    const dischargeClearance=state.discharges.filter(row=>
      String(row.management_status||'').toLowerCase()==='approved' &&
      String(row.accounts_status||'').toLowerCase()!=='cleared' &&
      String(row.status||'').toLowerCase()!=='completed'
    ).length;
    const packageExpiry=state.patients.filter(row=>{
      if(row.is_active===false||!row.package_id||!row.package_end_date)return false;
      const end=new Date(`${String(row.package_end_date).slice(0,10)}T00:00:00`);
      const limit=new Date(`${today}T00:00:00`);limit.setDate(limit.getDate()+3);
      return end<=limit;
    }).length;
    const refundValue=refunds;
    const netRevenue=Math.max(0,charges-discounts);
    const averageDailyRevenue=(()=>{
      const revenueDates=[...new Set(rows.filter(row=>['Charge','Discount'].includes(row.transaction_type)).map(row=>dateKey(row.transaction_date)).filter(Boolean))];
      return revenueDates.length?netRevenue/revenueDates.length:0;
    })();

    const modeTotals=['Cash','UPI','RTGS','Card Payment'].map(mode=>[
      mode,
      sum(rows.filter(row=>String(row.payment_mode||'').toLowerCase()===mode.toLowerCase()),['Payment','Advance'])
    ]);
    const maxMode=Math.max(1,...modeTotals.map(([,value])=>value));

    const kpis=[
      ['Collections Today',todayCollections,'Payments','green','Received today'],
      ['Collections This Month',monthCollections,'Payments','blue','Payment and advance receipts'],
      ['Net Revenue This Month',monthRevenue,'Accounts Reports','teal','Gross charges less approved discounts'],
      ['Outstanding Receivables',outstanding,'Final Billing','red','Net pending across patients'],
      ['Pending Approvals',pendingApprovals,'Charge Approvals','orange','Clinical charges awaiting decision',true],
      ['Pending Final Bills',finalBills,'Final Billing','purple','Active patients with balance',true],
      ['Discharge Clearance',dischargeClearance,'Discharge Clearance','orange','Management-approved cases',true],
      ['Package Expiry',packageExpiry,'Package Expiry Dashboard','orange','Expired / expiring within 3 days',true],
      ['Average Daily Net Revenue',averageDailyRevenue,'Accounts Reports','blue','Net revenue across charge / discount posting days']
    ];

    return h(React.Fragment,null,
      h('div',{className:'accounts-hero'},
        h('div',null,
          h('small',null,'FINANCE · BILLING · COLLECTIONS'),
          h('h3',null,'Accounts Command Centre'),
          h('p',null,profile?.role==='Admin'
            ?'Administrator and Accounts operations in one live financial workspace.'
            :'Live billing, collection, settlement and discharge-clearance workspace.'
          )
        ),
        h('div',{className:'accounts-actions'},
          h('button',{className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Payments','New Payment',{source:'Accounts Dashboard'})},'＋ New Payment'),
          h('button',{className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Accounts Reports','Accounts Reports',{source:'Accounts Dashboard'})},'▥ Reports'),
          h('button',{className:'btn btn-secondary',onClick:load},state.loading?'Loading…':'↻ Refresh')
        )
      ),

      h('div',{className:'accounts-kpi-grid'},
        kpis.map(([label,value,page,tone,note,isCount])=>h('button',{
          type:'button',className:`accounts-kpi ${tone}`,key:label,onClick:()=>dashboardNavigate(onNavigate,page,label,{source:'Accounts Dashboard'})
        },
          h('span',null,label),
          h('strong',null,isCount?Number(value||0):money(value)),
          h('small',null,note)
        ))
      ),

      h('div',{className:'accounts-dashboard-grid'},
        h('div',{className:'accounts-panel'},
          h('div',{className:'accounts-panel-head'},
            h('div',null,h('h3',null,'Collection by Payment Mode'),h('small',null,'All recorded payments and advances')),
            h('strong',null,money(collections))
          ),
          h('div',{className:'accounts-bars'},
            modeTotals.map(([mode,value])=>h('div',{className:'accounts-bar-row',key:mode},
              h('span',null,mode),
              h('div',{className:'accounts-bar-track'},
                h('div',{className:'accounts-bar-fill',style:{width:`${Math.max(0,value/maxMode*100)}%`}})
              ),
              h('strong',null,money(value))
            ))
          )
        ),

        h('div',{className:'accounts-panel'},
          h('div',{className:'accounts-panel-head'},
            h('div',null,h('h3',null,'Financial Position'),h('small',null,'Live consolidated totals'))
          ),
          h('div',{className:'accounts-status-list'},
            [
              ['Gross Charges',money(charges)],
              ['Discounts',money(discounts)],
              ['Net Revenue',money(netRevenue)],
              ['Collections',money(collections)],
              ['Refunds',money(refundValue)],
              ['Net Outstanding',money(outstanding)]
            ].map(([label,value])=>h('div',{className:'accounts-status-item',key:label},h('span',null,label),h('strong',null,value)))
          )
        )
      ),

      h(Section,{title:'Pending Charges by Patient',subtitle:'Select a patient to review only their pending charge requests'},
        state.requests.some(row=>(row.approval_status||'Pending')==='Pending')
          ?h('div',{className:'accounts-workflow-grid'},
            [...new Set(state.requests.filter(row=>(row.approval_status||'Pending')==='Pending').map(row=>row.patient_id).filter(Boolean))].map(patientId=>{
              const patient=state.patients.find(row=>row.id===patientId)||{};
              const count=state.requests.filter(row=>row.patient_id===patientId&&(row.approval_status||'Pending')==='Pending').length;
              return h('button',{key:patientId,type:'button',className:'btn btn-secondary',onClick:()=>openPatientChargeApprovals(patientId),style:{textAlign:'left',whiteSpace:'normal'}},
                `${formalName(patient)||patient.full_name||'Patient'} · ${patient.patient_id||''} · Room ${patient.room_no||'—'}-${patient.bed_no||'—'} · ${count} pending`);
            }))
          :h('p',null,state.loading?'Loading pending charges…':'No pending charge requests.')
      ),

      h(Section,{title:'Accounts Workflow',subtitle:'Open the required financial stage directly'},
        h('div',{className:'accounts-workflow-grid'},
          [
            ['🧾','Charge Approvals','Approve, partially approve or reject Nurse-raised charges.',pendingApprovals,'approvals'],
            ['💳','Payments','Receive Cash, UPI, RTGS or Card payments.',todayCollections?money(todayCollections):'Open','payments'],
            ['📑','Final Billing','Resident-wise ledger, discounts and net payable.',finalBills,'final-billing'],
            ['🚪','Discharge Clearance','Financially clear Management-approved discharges.',dischargeClearance,'clearance'],
            ['↩','Refunds','View and record payment or advance refunds.',money(refundValue),'refunds'],
            ['📊','Accounts Reports','Revenue, collection, ageing and patient-ledger reports.','Open','reports']
          ].map(([icon,title,text,value,tone])=>h('button',{
            type:'button',
            className:`accounts-workflow-card ${tone}`,
            key:title,
            onClick:()=>dashboardNavigate(onNavigate,title,title,{source:'Accounts Dashboard'})
          },
            h('div',{className:'accounts-workflow-top'},
              h('span',{className:'accounts-workflow-icon'},icon),
              h('span',{className:'accounts-workflow-value'},value)
            ),
            h('div',{className:'accounts-workflow-body'},
              h('strong',null,title),
              h('small',null,text)
            ),
            h('span',{className:'accounts-workflow-open'},h('span',null,'Open Module'),h('span',null,'→'))
          ))
        )
      )
    );
  }


