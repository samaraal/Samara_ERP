
  // v2.14.15: Error safety.
  // 1) reportClientError() saves an error to the client_errors table (never throws, rate-limited).
  // 2) PageErrorBoundary: if ONE page crashes, only that page shows "This page had a problem";
  //    the menu, header and every other page keep working. Used around the page area in
  //    shell/01-app-main.js and around the whole app in z-end/01-form-helpers-and-start-app.js.
  let samaraLastKnownPage='';
  let samaraErrorLogCount=0;
  const SAMARA_ERROR_LOG_LIMIT=25;
  const samaraRecentErrorKeys=new Map();

  function reportClientError(kind,error,extra={}){
    try{
      const message=String(error?.message||error||'Unknown error').slice(0,1000);
      const page=String(extra.page||samaraLastKnownPage||'').slice(0,120);
      const key=`${kind}|${page}|${message}`;
      const now=Date.now();
      if(now-(samaraRecentErrorKeys.get(key)||0)<60000)return;
      samaraRecentErrorKeys.set(key,now);
      if(samaraErrorLogCount>=SAMARA_ERROR_LOG_LIMIT)return;
      samaraErrorLogCount+=1;
      const componentStack=extra.componentStack?`\n--- screen ---\n${String(extra.componentStack).slice(0,1500)}`:'';
      const row={
        app_version:APP_VERSION,
        page,
        kind:String(kind||'error').slice(0,40),
        message,
        stack:(String(error?.stack||'')+componentStack).slice(0,6000),
        url:String(window.location.pathname+window.location.search).slice(0,300),
        user_agent:String(navigator.userAgent||'').slice(0,300)
      };
      Promise.resolve(client.from('client_errors').insert(row))
        .then(result=>{if(result?.error)console.warn('[Samara] Error log not saved:',result.error.message)})
        .catch(()=>{});
    }catch(_){}
  }
  window.SamaraReportError=reportClientError;

  class PageErrorBoundary extends React.Component{
    constructor(props){
      super(props);
      this.state={error:null,showDetails:false};
    }
    static getDerivedStateFromError(error){
      return {error};
    }
    componentDidMount(){
      if(this.props.variant!=='app'&&this.props.page)samaraLastKnownPage=this.props.page;
    }
    componentDidCatch(error,info){
      reportClientError(this.props.variant==='app'?'app-crash':'page-crash',error,{page:this.props.page,componentStack:info?.componentStack});
      try{console.error('[Samara] Screen crashed:',this.props.page||'',error)}catch(_){}
    }
    componentDidUpdate(prevProps){
      if(this.props.variant!=='app'&&this.props.page)samaraLastKnownPage=this.props.page;
      if(this.state.error&&prevProps.resetKey!==this.props.resetKey)this.setState({error:null,showDetails:false});
    }
    render(){
      if(!this.state.error)return this.props.children;
      const isApp=this.props.variant==='app';
      const btn=(label,onClick,primary)=>h('button',{type:'button',onClick,style:{
        minHeight:'46px',padding:'0 18px',borderRadius:'12px',fontSize:'16px',fontWeight:'700',cursor:'pointer',
        border:primary?'0':'1px solid #e3b7cc',background:primary?'#b01264':'#fff',color:primary?'#fff':'#7a1247'
      }},label);
      const details=this.state.showDetails&&h('pre',{style:{
        whiteSpace:'pre-wrap',wordBreak:'break-word',background:'#fff4f8',border:'1px solid #f0cadb',borderRadius:'10px',
        padding:'12px',fontSize:'12px',color:'#7a1247',marginTop:'14px',maxHeight:'220px',overflow:'auto'
      }},String(this.state.error?.message||this.state.error));
      const box=h('div',{role:'alert',className:'samara-page-error',style:{
        maxWidth:'560px',margin:isApp?'0':'24px auto',background:'#fff',border:'1px solid #f0cadb',borderRadius:'18px',
        padding:'24px',boxShadow:'0 12px 32px rgba(74,0,39,.10)',color:'#2f1022',fontFamily:'inherit'
      }},
        h('h3',{style:{margin:'0 0 10px',fontSize:'21px',color:'#7a1247'}},isApp?'Samara Care had a problem':'This page had a problem'),
        h('p',{style:{margin:'0 0 16px',fontSize:'16px',lineHeight:'1.5'}},
          isApp
            ?'Please reload Samara Care. Records that were already saved are safe.'
            :'The rest of Samara Care is still working. Records that were already saved are safe; anything typed on this page but not yet saved may need to be entered again. If this keeps happening, please tell the administrator.'),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'10px'}},
          isApp
            ?btn('Reload Samara Care',()=>window.location.reload(),true)
            :btn('Reload this page',()=>this.setState({error:null,showDetails:false}),true),
          !isApp&&this.props.onHome&&btn('Go to Dashboard',()=>{this.setState({error:null,showDetails:false});this.props.onHome()},false),
          btn(this.state.showDetails?'Hide details':'Show details',()=>this.setState(s=>({showDetails:!s.showDetails})),false)
        ),
        details
      );
      if(isApp)return h('div',{style:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',background:'#fbf2f6'}},box);
      return h('section',{className:'content'},box);
    }
  }
