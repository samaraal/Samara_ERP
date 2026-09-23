  function h(type,props,...children){
    // Shared semantic button colours; selected controls always remain pink.
    if(type==='button'&&props){
      const text=children.flat(Infinity).filter(x=>typeof x==='string').join(' ').replace(/^[^A-Za-z]+/,'').trim();
      let tone='';
      if(props['aria-pressed']===true||props['aria-selected']===true)tone='samara-action-selected';
      else if(/^(cancel|close)$/i.test(text))tone='samara-action-neutral';
      else if(/^(delete|remove|reject|revoke|cancel assignment|cancel duty)\b/i.test(text))tone='samara-action-danger';
      else if(/^(save|saving|create|creating|add|assign|update|updating|confirm copy|copy previous week|approve|submit)\b/i.test(text))tone='samara-action-save';
      if(tone)props={...props,className:`${props.className||''} ${tone}`.trim()};
    }
    return React.createElement(type,props,...children);
  }
  const ACCOUNTS_WORKFLOW_PAGES = ['Accounts Dashboard','Charge Approvals','Payments','Patient Ledger','Final Billing','Discharge Clearance','Refunds','Accounts Reports','Package Expiry Dashboard'];
  function AccountsWorkflowNavigation({page,allowed,onNavigate}){
    if(!ACCOUNTS_WORKFLOW_PAGES.includes(page))return null;
    return h('nav',{className:'accounts-workflow-nav','aria-label':'Accounts workflow'},
      ACCOUNTS_WORKFLOW_PAGES.filter(item=>allowed.includes(item)).map(item=>
        h('button',{key:item,type:'button',className:`btn ${item===page?'btn-primary samara-action-selected':'btn-secondary'}`,
          'aria-current':item===page?'page':undefined,onClick:()=>{if(item!==page)onNavigate(item)}},
          item==='Accounts Dashboard'?'Accounts Home':item==='Package Expiry Dashboard'?'Package Expiry':item)));
  }
  const BRAND_LOGO_SRC='./assets/samara-logo.png?v=20260814-final';
  const BRAND_LOGO_URL=new URL(BRAND_LOGO_SRC,window.location.href).href;
  const BrandLogo=({className='samara-brand-logo',alt='Samara Assisted Living'})=>
    h('img',{src:BRAND_LOGO_SRC,className,alt,decoding:'async'});

