  function App(){
    React.useEffect(()=>{ensureCleanWorkspaceLayout();ensureCompactDataEntryStyle();ensureSmartHoverStyles()},[]);
    const LAST_OPEN_PAGE_KEY='samara_last_open_page_v1';
    const readLastOpenPage=()=>{
      try{
        return sessionStorage.getItem(LAST_OPEN_PAGE_KEY)||
          localStorage.getItem(LAST_OPEN_PAGE_KEY)||
          'Dashboard';
      }catch(_error){
        return 'Dashboard';
      }
    };
    const [session,setSession]=React.useState(null);
    const [profile,setProfile]=React.useState(null);
    const dutyContext=window.SamaraDutySwap.useContext({client,profile,setProfile,onChanged:next=>setPage(homePageForProfile(next))});
    const dutyNotice=window.SamaraDutySwap.useDailyNotice({client,profile,ready:dutyContext.ready});
    const [loading,setLoading]=React.useState(true);
    const [manualRefreshing,setManualRefreshing]=React.useState(false);
    const [lastOfficeRefresh,setLastOfficeRefresh]=React.useState(null);
    const [page,setPage]=React.useState(readLastOpenPage);
    const [pageRefreshKey,setPageRefreshKey]=React.useState(0);
    const pageEditedRef=React.useRef(false);
    React.useEffect(()=>{pageEditedRef.current=false},[page]);
    function refreshCurrentPage(){
      if(pageEditedRef.current&&!window.confirm('Refresh this page? Current selections and any unsaved entries will be cleared.'))return;
      pageEditedRef.current=false;
      setPageRefreshKey(value=>value+1);
      alertEngine.refresh().catch(error=>console.warn('Page alert refresh:',error));
      window.dispatchEvent(new Event('samara-discharge-workflow-changed'));
    }
    const previousPageRef=React.useRef(readLastOpenPage());
    const currentPageRef=React.useRef(readLastOpenPage());
    const workspaceInitialisedForUserRef=React.useRef(null);
    const [mobileDrawerOpen,setMobileDrawerOpen]=React.useState(false);
    const [authMessage,setAuthMessage]=React.useState('');
    const [recoveryMode,setRecoveryMode]=React.useState(false);
    const [clinicalPopupSnooze,setClinicalPopupSnooze]=React.useState({key:'',until:0});
    const alertEngine=useClinicalAlertEngine(profile,setPage);
    const topClinicalAlert=alertEngine.alerts[0]||null;
    const topClinicalAlertKey=topClinicalAlert?.key||topClinicalAlert?.id||topClinicalAlert?.source_id||'';
    const clinicalPopupVisible=profile?.role!=='STD'&&Boolean(topClinicalAlert)&&!(
      clinicalPopupSnooze.key===topClinicalAlertKey&&clinicalPopupSnooze.until>Date.now()
    );
    React.useEffect(()=>{
      if(!clinicalPopupSnooze.until)return;
      const delay=Math.max(0,clinicalPopupSnooze.until-Date.now());
      const timer=window.setTimeout(()=>setClinicalPopupSnooze({key:'',until:0}),delay+50);
      return()=>window.clearTimeout(timer);
    },[clinicalPopupSnooze.key,clinicalPopupSnooze.until]);

    // v2.9.69: Management escalation popups are advisory, not workflow-blocking.
    // Admin/Manager see the escalation prominently for 8 seconds, after which the
    // popup auto-hides until the configured repeat interval. The escalation itself
    // remains unresolved and visible in the bell / Clinical Escalations register.
    // Nurses/Caregivers retain the persistent clinical-task popup behaviour.
    React.useEffect(()=>{
      if(!topClinicalAlert||!['Admin','Manager'].includes(profile?.role))return;
      const key=topClinicalAlertKey;
      if(!key)return;
      if(clinicalPopupSnooze.key===key&&clinicalPopupSnooze.until>Date.now())return;
      const timer=window.setTimeout(()=>{
        const repeatMinutes=Math.max(1,Number(alertEngine.settings?.repeat_minutes||5));
        setClinicalPopupSnooze({key,until:Date.now()+repeatMinutes*60000});
      },8000);
      return()=>window.clearTimeout(timer);
    },[topClinicalAlertKey,profile?.role,clinicalPopupSnooze.key,clinicalPopupSnooze.until,alertEngine.settings?.repeat_minutes]);

    React.useEffect(()=>{
      if(!session||!profile)return;
      const timer=window.setTimeout(()=>{
        window.showSamaraInaugurationInvitation?.();
      },900);
      return()=>window.clearTimeout(timer);
    },[session?.user?.id,profile?.id]);

    React.useEffect(()=>{
      if(currentPageRef.current!==page){
        previousPageRef.current=currentPageRef.current;
        currentPageRef.current=page;
        try{
          sessionStorage.setItem('samara_previous_page',previousPageRef.current);
          sessionStorage.setItem(LAST_OPEN_PAGE_KEY,page);
          localStorage.setItem(LAST_OPEN_PAGE_KEY,page);
        }catch(_error){}
      }
    },[page]);
    // v2.14.36: Global Back navigation. Every page change is remembered, so the
    // on-screen Back button, the Android back button and the iPhone back swipe
    // all return to the previous ERP page instead of leaving staff stuck.
    const navHistoryRef=React.useRef({stack:[],prev:null,fromBack:false,ready:false});
    const [navDepth,setNavDepth]=React.useState(0);
    React.useEffect(()=>{
      // Start remembering pages only after the signed-in workspace has opened, so the
      // automatic "restore last page" step is not recorded as a step to go back to.
      const nav=navHistoryRef.current;
      nav.ready=false;nav.stack=[];setNavDepth(0);
      if(!profile?.id)return;
      const timer=setTimeout(()=>{nav.ready=true},800);
      return()=>clearTimeout(timer);
    },[profile?.id]);
    React.useEffect(()=>{
      const nav=navHistoryRef.current;
      if(nav.ready&&nav.prev&&nav.prev!==page&&!nav.fromBack){
        nav.stack.push(nav.prev);
        if(nav.stack.length>40)nav.stack.shift();
        try{history.pushState({samaraNav:nav.stack.length},'')}catch(_){}
      }
      nav.fromBack=false;
      nav.prev=page;
      setNavDepth(nav.stack.length);
    },[page]);
    React.useEffect(()=>{
      const onPop=()=>{
        const nav=navHistoryRef.current;
        if(!nav.stack.length)return;
        if(pageEditedRef.current&&!window.confirm('Go back? Any entries you have not saved on this page will be lost.')){
          try{history.pushState({samaraNav:nav.stack.length},'')}catch(_){}
          return;
        }
        const target=nav.stack.pop();
        nav.fromBack=true;
        pageEditedRef.current=false;
        setNavDepth(nav.stack.length);
        setPage(target);
        window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}});
      };
      window.addEventListener('popstate',onPop);
      return()=>window.removeEventListener('popstate',onPop);
    },[]);
    // v2.14.39: Phone safety net. If the header / bottom bar are hidden but no pop-up is
    // actually visible on screen, bring them back so staff are never left stuck.
    React.useEffect(()=>{
      if(!profile?.id)return;
      const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect();return r.width>20&&r.height>20&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'};
      const check=()=>{
        try{
          const app=document.querySelector('#root > .app, .app');if(!app)return;
          if(!window.matchMedia('(max-width: 760px)').matches){app.classList.remove('samara-chrome-restore');return}
          const topbar=app.querySelector('.topbar');
          const hidden=topbar&&getComputedStyle(topbar).display==='none';
          const popupOpen=[...document.querySelectorAll('.modal-backdrop .modal,.modal-backdrop .card,.modal-backdrop .modal-card,.patient-file-backdrop > *,.samara-workflow-popup-card')].filter(el=>!el.closest('.topbar,.mobile-menu,.mobile-bottom-nav')).some(visible);
          const want=Boolean(hidden&&!popupOpen)||(app.classList.contains('samara-chrome-restore')&&!popupOpen);
          if(app.classList.contains('samara-chrome-restore')!==want)app.classList.toggle('samara-chrome-restore',want);
        }catch(_){}
      };
      check();
      const timer=setInterval(check,1500);
      return()=>clearInterval(timer);
    },[profile?.id]);

    function goBackPage(){
      if(navHistoryRef.current.stack.length){history.back();return}
      const homePage=profile?homePageForProfile(profile):'';
      if(homePage&&page!==homePage){
        if(pageEditedRef.current&&!window.confirm('Go back? Any entries you have not saved on this page will be lost.'))return;
        setPage(homePage);
      }
    }

    // v2.8.18: Pop-up windows remain open until the user explicitly closes them.
    // Automatic modal closing after success messages has been disabled.

    const [chargeApprovalPatientId,setChargeApprovalPatientId]=React.useState('');
    React.useEffect(()=>{
      const handler=event=>{
        const patientId=event.detail?.patientId;
        if(typeof patientId!=='string'||!patientId)return;
        setChargeApprovalPatientId(patientId);
        setPage('Charge Approvals');
      };
      window.addEventListener('samara-open-patient-charges',handler);
      return()=>window.removeEventListener('samara-open-patient-charges',handler);
    },[]);
    React.useEffect(()=>{if(page!=='Charge Approvals')setChargeApprovalPatientId('')},[page]);

    React.useEffect(()=>{
      const handler=()=>setPage('Discharge Clearance');
      window.addEventListener('samara-return-discharge-clearance',handler);
      return()=>window.removeEventListener('samara-return-discharge-clearance',handler);
    },[]);

    React.useEffect(()=>{
      const root=document.getElementById('root');
      if(!root)return;
      normaliseVisibleIndianDates(root);
      let queued=false;
      const observer=new MutationObserver(()=>{
        if(queued)return;
        queued=true;
        requestAnimationFrame(()=>{
          queued=false;
          normaliseVisibleIndianDates(root);
        });
      });
      observer.observe(root,{childList:true,subtree:true,characterData:true});
      return()=>observer.disconnect();
    },[]);



    React.useEffect(()=>{
      const root=document.getElementById('root');
      if(!root)return;
      const handled=new WeakSet();

      const promote=(element)=>{
        if(!(element instanceof Element)||handled.has(element))return;
        if(element.closest('.samara-save-confirmation'))return;

        const success=element.matches(
          '.message.success,.samara-toast.success,.toast.success,[data-toast-type="success"]'
        );
        const error=element.matches(
          '.message.error,.samara-toast.error,.toast.error,[data-toast-type="error"]'
        );
        if(!success&&!error)return;

        handled.add(element);
        const type=success?'success':'error';
        const strong=element.querySelector('strong');
        const title=(strong?.textContent||'').trim()||
          (success?'Saved successfully':'Action failed');
        const raw=(element.textContent||'').replace(/[×✕]/g,' ').replace(/\s+/g,' ').trim();
        const text=raw.replace(title,'').trim()||
          (success?'The procedure has been completed successfully.':'The procedure could not be completed.');
        showSamaraActionToast(type,title,text);
      };

      const scan=(node)=>{
        if(!(node instanceof Element))return;
        promote(node);
        node.querySelectorAll?.(
          '.message.success,.message.error,.samara-toast.success,.samara-toast.error,.toast.success,.toast.error,[data-toast-type="success"],[data-toast-type="error"]'
        ).forEach(promote);
      };

      scan(root);
      const observer=new MutationObserver(mutations=>{
        mutations.forEach(mutation=>mutation.addedNodes.forEach(scan));
      });
      observer.observe(root,{childList:true,subtree:true});
      return()=>observer.disconnect();
    },[]);

    React.useEffect(()=>{
      ensureSmoothRefreshStyle();
      updateSplashStatus('Checking secure session…');
      let active=true;
      const minimumVisible=new Promise(resolve=>setTimeout(resolve,420));
      // v2.9.52: startup must never hang forever while Supabase restores a cached session.
      // Some browsers/PWA states can leave auth.getSession() pending indefinitely.
      const startupTimeoutMs=8000;
      const sessionReady=(async()=>{
        let timer;
        try{
          const timeout=new Promise((_,reject)=>{
            timer=setTimeout(()=>reject(new Error('Session restore timed out')),startupTimeoutMs);
          });
          const result=await Promise.race([client.auth.getSession(),timeout]);
          if(!active)return;
          const restoredSession=result?.data?.session||null;
          updateSplashStatus(restoredSession?'Loading your workspace…':'Preparing sign-in…');
          setSession(restoredSession);
        }catch(error){
          console.warn('Session restore fallback:',error?.message||error);
          if(!active)return;
          // Show the sign-in screen instead of trapping the user on Loading Samara Care.
          updateSplashStatus('Preparing sign-in…');
          setSession(null);
          setAuthMessage('Secure session check took too long. Please sign in again.');
        }finally{
          clearTimeout(timer);
          if(active)setLoading(false);
        }
      })();

      const revealFailsafe=setTimeout(()=>{
        if(active)finishSmoothRefresh();
      },5000);

      Promise.allSettled([minimumVisible,sessionReady]).then(()=>{
        if(!active)return;
        clearTimeout(revealFailsafe);
        requestAnimationFrame(()=>requestAnimationFrame(finishSmoothRefresh));
      });

      const {data:{subscription}}=client.auth.onAuthStateChange((event,next)=>{
        if(event==='PASSWORD_RECOVERY') setRecoveryMode(true);
        setSession(next);
      });
      if('serviceWorker' in navigator){
        let updatePromptShown=false;
        let remoteUpdateVersion='';
        let lastUpdateCheckAt=0;
        const UPDATE_ACK_KEY='samara_acknowledged_app_version';
        let acknowledgedVersion='';
        try{acknowledgedVersion=localStorage.getItem(UPDATE_ACK_KEY)||''}catch(_error){}

        const isRemoteVersionNewer=(remote,current)=>{
          const parse=value=>String(value||'0').split('.').map(part=>Number.parseInt(part,10)||0);
          const a=parse(remote), b=parse(current);
          const length=Math.max(a.length,b.length);
          for(let i=0;i<length;i++){
            const av=a[i]||0, bv=b[i]||0;
            if(av>bv)return true;
            if(av<bv)return false;
          }
          return false;
        };

        const showUpdatePrompt=()=>{
          // The acknowledgement is stored on each device/browser separately.
          // This means accepting an update on Windows never suppresses the notice on an iPhone/PWA.
          const trulyNewRemote=isRemoteVersionNewer(remoteUpdateVersion,APP_VERSION);
          const alreadyAcknowledged=acknowledgedVersion===remoteUpdateVersion;
          if(updatePromptShown||!remoteUpdateVersion||!trulyNewRemote||alreadyAcknowledged)return;
          updatePromptShown=true;

          const existing=document.getElementById('samara-update-refresh-prompt');
          if(existing)existing.remove();

          const overlay=document.createElement('div');
          overlay.id='samara-update-refresh-prompt';
          Object.assign(overlay.style,{
            position:'fixed',inset:'0',zIndex:'999999',display:'flex',alignItems:'center',justifyContent:'center',
            padding:'22px',background:'rgba(40,0,22,.46)',backdropFilter:'blur(5px)',WebkitBackdropFilter:'blur(5px)'
          });
          const card=document.createElement('div');
          Object.assign(card.style,{
            width:'min(440px, calc(100vw - 36px))',background:'#fff',borderRadius:'22px',padding:'24px 22px 20px',
            boxShadow:'0 18px 55px rgba(74,0,39,.30)',textAlign:'center',fontFamily:'inherit',color:'#2f1022'
          });
          const title=document.createElement('div');
          title.textContent='New version of Samara Care is available';
          Object.assign(title.style,{fontSize:'21px',fontWeight:'800',lineHeight:'1.3',marginBottom:'8px'});
          const message=document.createElement('div');
          message.textContent=`Version ${remoteUpdateVersion} is ready. Update now to use the latest Samara Care.`;
          Object.assign(message.style,{fontSize:'17px',lineHeight:'1.45',marginBottom:'20px',color:'#5d4450'});
          const ok=document.createElement('button');
          ok.type='button'; ok.textContent='Update Now';
          Object.assign(ok.style,{width:'100%',minHeight:'52px',border:'0',borderRadius:'14px',background:'#c2185b',color:'#fff',fontSize:'18px',fontWeight:'800',cursor:'pointer',WebkitTapHighlightColor:'transparent'});
          ok.addEventListener('click',async()=>{
            ok.disabled=true; ok.textContent='Updating…';
            overlay.style.pointerEvents='none'; overlay.style.opacity='0'; setTimeout(()=>overlay.remove(),180);
            try{
              localStorage.setItem(UPDATE_ACK_KEY,remoteUpdateVersion);
              acknowledgedVersion=remoteUpdateVersion;
            }catch(_error){}
            try{ const registration=await navigator.serviceWorker.getRegistration(); await registration?.update(); }catch(_error){}
            const url=new URL(window.location.href);
            url.searchParams.set('samara_refresh',remoteUpdateVersion);
            window.location.replace(url.toString());
          });
          card.append(title,message,ok); overlay.appendChild(card); document.body.appendChild(overlay);
          setTimeout(()=>{try{ok.focus({preventScroll:true})}catch(_){ok.focus()}},50);
        };

        const checkRemoteVersion=async(force=false)=>{
          const now=Date.now();
          if(!force&&now-lastUpdateCheckAt<45000)return false;
          lastUpdateCheckAt=now;
          try{
            const response=await fetch(`./service-worker.js?samara_check=${now}`,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
            if(!response.ok)return false;
            const text=await response.text();
            const match=text.match(/samara-erp-(\d+\.\d+\.\d+)/i);
            const remote=match?.[1]||'';
            if(remote&&isRemoteVersionNewer(remote,APP_VERSION)){
              remoteUpdateVersion=remote;
              showUpdatePrompt();
              return true;
            }
          }catch(_error){}
          return false;
        };

        // Service-worker lifecycle events never show the update dialog by themselves.
        // This prevents same-version install/activate/controllerchange loops.
        navigator.serviceWorker.addEventListener('message',event=>{
          const remote=event.data?.type==='SAMARA_UPDATE_AVAILABLE'?event.data?.version:'';
          if(remote&&isRemoteVersionNewer(remote,APP_VERSION)){
            remoteUpdateVersion=remote;
            showUpdatePrompt();
          }
        });

        navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'}).then(registration=>{
          registration.update().catch(()=>{});
          setTimeout(()=>checkRemoteVersion(true),900);
        }).catch(()=>{setTimeout(()=>checkRemoteVersion(true),900)});

        const onResume=()=>{if(document.visibilityState==='visible')checkRemoteVersion(true)};
        document.addEventListener('visibilitychange',onResume);
        window.addEventListener('focus',onResume);
        const updateTimer=setInterval(()=>checkRemoteVersion(false),60000);
        window.samaraCheckForUpdate=()=>checkRemoteVersion(true);

        window.addEventListener('beforeunload',()=>{
          clearInterval(updateTimer);
          document.removeEventListener('visibilitychange',onResume);
          window.removeEventListener('focus',onResume);
        },{once:true});
      }
      return()=>{
        active=false;
        clearTimeout(revealFailsafe);
        subscription.unsubscribe();
      };
    },[]);

    React.useEffect(()=>{
      if(!session){
        setProfile(null);
        workspaceInitialisedForUserRef.current=null;
        return;
      }
      (async()=>{
        let data=null;
        const profileTimeout=(promise,ms,label)=>{
          let timer;
          const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out`)),ms)});
          return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
        };
        try{
          // SECURITY v2.10.58:
          // Load ONLY the profile whose primary key is the authenticated Supabase user UUID.
          // No OR matching, no name/mobile/login enrichment, and no automatic profile repair.
          // This prevents a valid Auth session from ever being replaced by another employee row.
          const direct=await profileTimeout(
            client.from('profiles').select('*').eq('id',session.user.id).maybeSingle(),
            10000,
            'Employee profile lookup'
          );
          if(direct.error) throw direct.error;
          data=direct.data||null;

          if(!data){
            console.error('SECURITY: No exact profile row for authenticated user',session.user.id);
          }
        }catch(error){
          console.error('Employee profile startup failed:',error);
          setAuthMessage('Unable to load your employee profile. Please sign in again.');
          setProfile(null);
          setSession(null);
          await client.auth.signOut().catch(()=>{});
          return;
        }

        if(!data){
          setAuthMessage('Your employee profile is not linked to this Login ID. Please contact the Administrator.');
          setProfile(null);
          setSession(null);
          await client.auth.signOut().catch(()=>{});
          return;
        }
        if(data.is_active===false||data.active===false){
          setAuthMessage('This employee account is inactive. Please contact the Administrator.');
          setProfile(null);
          setSession(null);
          await client.auth.signOut().catch(()=>{});
          return;
        }

        // SECURITY v2.10.57 — fail closed on any identity mismatch.
        const authenticatedUid=String(session.user?.id||'');
        const profileId=String(data?.id||'');
        const linkedAuthId=String(data?.auth_user_id||'');
        const explicitUidMatch=profileId===authenticatedUid || linkedAuthId===authenticatedUid;
        const authMetaLogin=normalizeLogin(String(session.user?.user_metadata?.login_id||''));
        const profileLogin=normalizeLogin(String(data?.login_id||''));
        const authEmail=String(session.user?.email||'').trim().toLowerCase();
        const profileAuthEmail=String(data?.auth_email||'').trim().toLowerCase();

        const loginMismatch=Boolean(authMetaLogin && profileLogin && authMetaLogin!==profileLogin);
        const emailMismatch=Boolean(profileAuthEmail && authEmail && profileAuthEmail!==authEmail);

        if(!explicitUidMatch || loginMismatch || emailMismatch){
          console.error('SECURITY IDENTITY MISMATCH',{
            authenticatedUid,
            authenticatedEmail:authEmail,
            authMetaLogin,
            profileId,
            linkedAuthId,
            profileLogin,
            profileAuthEmail
          });
          setProfile(null);
          setAuthMessage('Security check failed: this login does not match the linked employee profile. Access has been blocked. Please contact the Administrator.');
          setSession(null);
          await client.auth.signOut().catch(()=>{});
          return;
        }

        // Recovery for accounts whose Auth password was already changed but whose
        // profile flag remained set because an older deployment/RLS blocked the update.
        const authCompleted = session.user?.user_metadata?.must_change_password === false;
        if(data.must_change_password && authCompleted){
          data={...data,must_change_password:false};
          client.rpc('complete_my_first_login').then(()=>{}).catch(()=>{});
        }
        try{const access=await profileTimeout(client.rpc('op_trial_access'),5000,'Outgoing access check');data={...data,__paymentsTrial:!access.error?access.data:null};}catch(_error){data={...data,__paymentsTrial:null};}
        setProfile(data);

        // Audit a restored authenticated session once per browser/app lifecycle.
        // sessionStorage survives ordinary refreshes, preventing Audit Trail flooding,
        // but is cleared when the tab/app lifecycle ends so a later restored session is visible.
        try{
          const accessKey=`samara_session_access_logged_v1:${session.user.id}`;
          if(!sessionStorage.getItem(accessKey)){
            const {data:accessAudit,error:accessAuditError}=await client.functions.invoke('admin-users',{body:{action:'session_access'}});
            if(accessAuditError||!accessAudit?.audit_recorded)throw accessAuditError||new Error('Session access audit was not confirmed');
            sessionStorage.setItem(accessKey,'1');
          }
        }catch(accessAuditError){
          console.warn('Session access audit could not be recorded:',accessAuditError);
        }

        const allowedPages=allowedPagesForProfile(data);
        const storedPage=readLastOpenPage();
        const savedPage=storedPage==='Outgoing Payments'?'Payments & Vouchers':storedPage;
        const firstWorkspaceLoad=workspaceInitialisedForUserRef.current!==session.user.id;

        if(firstWorkspaceLoad){
          workspaceInitialisedForUserRef.current=session.user.id;
          let pushPage='';
          try{pushPage=new URLSearchParams(window.location.search).get('push_page')||''}catch(_){}
          const pageToRestore=(pushPage&&allowedPages.includes(pushPage))
            ?pushPage
            :(allowedPages.includes(savedPage)?savedPage:(homePageForProfile(data)||allowedPages[0]||'Notifications'));
          setPage(pageToRestore);
          if(pushPage){try{history.replaceState(null,'',window.location.pathname+window.location.hash)}catch(_){}}
        }else if(!allowedPages.includes(currentPageRef.current)){
          setPage(homePageForProfile(data)||allowedPages[0]||'Notifications');
        }

        client.from('profiles').update({last_sign_in_at:new Date().toISOString()}).eq('id',data.id).then(()=>{});
        // Automatic daily room and nursing billing. Duplicate-safe and silent.
        client.rpc('run_daily_billing_automation',{p_charge_date:todayISOIndia(),p_force:false})
          .then(({error})=>{if(error)console.warn('Automatic daily billing unavailable:',error.message)})
          .catch(error=>console.warn('Automatic daily billing unavailable:',error));
      })();
    // Keep profile validation bound to the authenticated USER, not the rotating
    // access-token/session object. Supabase periodically emits TOKEN_REFRESHED
    // with a new session object; re-running a network profile lookup on every
    // token refresh could sign an actively working user out on a transient
    // connection delay. A different login still changes user.id and therefore
    // re-runs the exact UUID-linked security validation above.
    },[session?.user?.id]);

    React.useEffect(()=>{
      if(!session||recoveryMode)return;
      let timer;
      let signingOut=false;
      const INACTIVITY_MS=30*60*1000;
      let lastActivityAt=Date.now();
      const signOutForInactivity=async()=>{
        if(signingOut)return;
        signingOut=true;
        clearTimeout(timer);
        await client.auth.signOut().catch(()=>{});
        setAuthMessage('You were signed out after 30 minutes of inactivity for security.');
      };
      const schedule=()=>{
        if(signingOut)return;
        clearTimeout(timer);
        const remaining=INACTIVITY_MS-(Date.now()-lastActivityAt);
        if(remaining<=0){signOutForInactivity();return}
        timer=setTimeout(()=>{
          if(Date.now()-lastActivityAt>=INACTIVITY_MS)signOutForInactivity();
          else schedule();
        },remaining);
      };
      const recordActivity=()=>{
        if(signingOut)return;
        lastActivityAt=Date.now();
        schedule();
      };
      const events=['click','keydown','touchstart','pointerdown','input','change','scroll','wheel'];
      events.forEach(name=>window.addEventListener(name,recordActivity,{passive:true,capture:true}));
      const onVisibility=()=>{
        if(document.visibilityState!=='visible')return;
        if(Date.now()-lastActivityAt>=INACTIVITY_MS)signOutForInactivity();
        else schedule();
      };
      document.addEventListener('visibilitychange',onVisibility);
      schedule();
      return()=>{
        clearTimeout(timer);
        events.forEach(name=>window.removeEventListener(name,recordActivity,true));
        document.removeEventListener('visibilitychange',onVisibility);
      };
    },[session?.user?.id,recoveryMode]);

    if(loading) return h('div',{className:'loading'},'Loading Samara Care…');
    if(recoveryMode&&session) return h(RecoveryPasswordChange,{onComplete:async()=>{setRecoveryMode(false);await client.auth.signOut();setAuthMessage('Password changed successfully. Please sign in with your new password.')}});
    if(!session) return h(Login,{externalMessage:authMessage,onClearMessage:()=>setAuthMessage('')});
    if(!profile) return h('div',{className:'loading'},'Loading your employee profile…');
    if(!dutyContext.ready)return h('div',{className:'loading'},
      dutyContext.error||'Verifying your current department duties…',
      dutyContext.error&&h('button',{className:'btn btn-primary',onClick:dutyContext.refresh},'Retry duty check'));
    if(profile.must_change_password) return h(FirstLoginPasswordChange,{profile,onComplete:()=>setProfile({...profile,must_change_password:false})});

    const allowed = allowedPagesForProfile(profile);
    if(!allowed.includes(page)) setTimeout(()=>setPage(homePageForProfile(profile)||allowed[0]||'Notifications'),0);
    return h('div',{className:`app mobile-role-${String(profile.role||'user').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`},
      h(GlobalSmartHover),
      h(GlobalNavigableSurfaces),
      h(GlobalMobileTableAdapter),
      h(GlobalFormRequirementManager,{page,profile}),
      h(GlobalNursingVoiceInput,{profile,page}),
      h(Sidebar,{profile,page,setPage,allowed}),
      h('main',{className:'main'},
        h('header',{className:'topbar'},
          h('div',{className:'mobile-brand-header'},
            h(BrandLogo,{className:'mobile-header-brand-logo'}),
            h('strong',null,'Samara Care ERP')
          ),
          h('button',{type:'button',className:'mobile-home-button','aria-label':'Go to dashboard',title:'Dashboard',onClick:()=>setPage(homePageForProfile(profile)||allowed[0])},'⌂'),
          h('h2',null,displayNavLabel(page,profile.role)),
          h(GlobalSearch,{onNavigate:setPage,profile}),
          h(StoreIndentAlerts,{profile,onNavigate:setPage}),
          profile?.role!=='STD'&&h(ClinicalAlertBell,{engine:alertEngine,onOpen:setPage}),
          h('span',{className:'badge'},profile.role)
        ),
        h(MobileMenu,{page,profile,onOpenMenu:()=>setMobileDrawerOpen(true)}),
        h('div',{className:'global-page-tools'},
          (navDepth>0||page!==(homePageForProfile(profile)||allowed[0]))&&h('button',{type:'button',className:'btn btn-secondary global-back-button',onClick:goBackPage,title:'Go back to the previous page','aria-label':'Go back'},'‹ Back'),
          h('button',{type:'button',className:'btn btn-secondary mobile-global-home',onClick:()=>{pageEditedRef.current=false;setPage(homePageForProfile(profile)||allowed[0]);window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}})},title:'Go to Home','aria-label':'Go to Home'},'⌂ Home'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:refreshCurrentPage,title:'Reload the current page data','aria-label':'Refresh current page'},'↻ Refresh'),
          h('button',{type:'button',className:'btn btn-secondary mobile-global-signout',onClick:async()=>{if(!window.confirm('Are you sure you want to sign out?'))return;await writeAuditEvent('User Logout','Authentication',profile.id,{login_id:profile.login_id},'Success');await client.auth.signOut()},title:'Sign out of Samara Care','aria-label':'Sign out'},'⇥ Sign Out')),
        h(NursingMobileQuickActions,{profile,page,onNavigate:setPage}),
        h(window.SamaraDutySwap.DailyNotice,dutyNotice),
        h(window.SamaraDischargeWorkflow.Banner,{client,profile,onNavigate:setPage}),
        h(PageErrorBoundary,{page,resetKey:page+':'+pageRefreshKey,onHome:()=>setPage(homePageForProfile(profile)||allowed[0])},h('section',{className:'content',key:window.SamaraDutySwap.signature(profile)+':'+pageRefreshKey,onChangeCapture:()=>{pageEditedRef.current=true},onInputCapture:()=>{pageEditedRef.current=true}},
          profile.__dutyContext?.assignment&&h('div',{className:'message warning',role:'status'},
            `Temporary assignment: ${profile.__dutyContext.assignment.acting_as} duties until ${formatDateTimeIN(profile.__dutyContext.assignment.ends_at)}. Regular duties return automatically.`),
          h(AccountsWorkflowNavigation,{page,allowed,onNavigate:setPage}),
          page==='Temporary Duty Swap'&&h(window.SamaraDutySwap.Page,{client}),
          page==='Additional Duty Assignment'&&h(window.SamaraDutySwap.AdditionalDutyPage,{client}),
          page==='Leave Cover'&&h(React.Fragment,null,h(window.SamaraDutySwap.LeaveCoverPage,{client}),profile.__dutyContext?.can_manage&&h(StaffReturnToDuty,{profile,reviewOnly:true})),
          h(DirectorTodayTicker,{key:profile.id,profile,page,onNavigate:setPage}),
          page==='Dashboard'&&h(Dashboard,{profile,onNavigate:setPage,alertEngine}),
          page==='HR Dashboard'&&h(HRDashboard,{profile,onNavigate:setPage}),
          page==='Employees'&&h(Employees,{profile,onNavigate:setPage}),
          page==='My Profile'&&h(MyProfile,{profile:window.SamaraDutySwap.regularProfile(profile),onProfileUpdate:p=>{setProfile({...p,...(profile.__dutyContext?{role:profile.role,designation:profile.designation,department:profile.department,__dutyContext:profile.__dutyContext}:{})});dutyContext.refresh()}}),
          page==='My To-Do List'&&h(NursePersonalTodoList,{profile}),
          page==="Director's Office"&&h(DirectorOfficeDashboard,{profile,onNavigate:setPage}),
          page==='Enquiries & Feedback'&&h(DirectorEnquiries,{profile,onNavigate:setPage}),
          page==='Staff Leave Calendar'&&h(LeavePermission,{profile,mode:'approvals',calendar:true}),
          page==='My Leave & Permission'&&h(LeavePermission,{profile,mode:'mine'}),
          page==='Leave Approvals'&&h(LeavePermission,{profile,mode:'approvals'}),
          page==='Career Applications'&&h(CareerApplications,{profile,onNavigate:setPage}),
          page==='Interviews'&&h(HRInterviews,{profile,onNavigate:setPage}),
          page==='Enquiries'&&h(Enquiries,{profile}),
          page==='Spot Assessment'&&h(window.SamaraSpotAssessment,{profile,client}),
          page==='Admissions'&&h(Admissions,{profile,onNavigate:setPage}),
          page==='Clinical Dashboard'&&h(ClinicalDashboard,{profile,onNavigate:setPage,alertEngine}),
          page==='Clinical Alerts'&&h(ClinicalAlertsPage,{engine:alertEngine,setPage}),
          page==='My To-Do & Follow-up'&&h(ManagerPersonalTodo,{profile}),
          page==='Clinical Escalations'&&h(ClinicalEscalationsDashboard,{profile,onNavigate:setPage}),
          page==='Shift Tasks'&&h(ShiftTasks,{profile,onNavigate:setPage}),
          page==='Patients'&&h(Patients,{profile,onNavigate:setPage}),
          page==='Discharge'&&h(DischargeManagement,{profile}),
          page==='Rooms'&&h(RoomsBeds,{profile,onNavigate:setPage}),
          page==='Shift Management'&&h(ShiftManagement,{profile}),
          page==='Care Packages'&&h(CarePackages,{profile}),
          page==='Stores Master'&&h(StoreItemMaster,{profile}),
          page==='Charge Master'&&h(ChargeMasterPage,{profile}),
          page==='Form Field Settings'&&h(FormFieldSettings,{profile}),
          page==='Daily Care'&&h(DailyCare,{profile,onNavigate:setPage}),
          page==='Vital Signs'&&h(VitalSigns,{profile,onNavigate:setPage}),
          page==='Medicines'&&h(Medicines,{profile,onNavigate:setPage}),
          page==='Patient Consumables'&&h(PatientConsumables,{profile}),
          page==='Raise Indent'&&h(PatientConsumables,{profile,initialView:'raise'}),
          page==='Received Indents / Used Balance'&&h(PatientConsumables,{profile,initialView:'balance'}),
          page==='Stores'&&h(ConsumablesStores,{profile}),
          page==='Consumables'&&h(React.Fragment,null,h(ConsumablesStores,{profile,categoryFilter:'Consumables'}),h(PatientConsumables,{profile,categoryFilter:'Consumables'})),
          page==='Pharmacy'&&h(ConsumablesStores,{profile,categoryFilter:'Pharmacy'}),
          page==='Stores In-charge Assignment'&&h(StoresInchargeAssignmentPage,{profile}),
          page==='Food & Diet'&&h(FoodDiet,{profile}),
          ['Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements'].includes(page)&&allowed.includes(page)&&window.SamaraOutgoingPayments&&h(window.SamaraOutgoingPayments,{key:page,client,profile,CameraCaptureModal,initialView:page==='Payment Statements'?'Statements':page==='Payment Vouchers'?'Vouchers':page==='Approved—Ready to Pay'?'Ready':'Requests'}),
          page==='Physiotherapy'&&h(Physiotherapy,{profile,onNavigate:setPage}),
          page==='Duty Assignment'&&h(DutyAssignment,{profile,viewMode:'assignment'}),
          page==='Duty Calendar'&&h(DutyAssignment,{profile,viewMode:'team'}),
          page==='Staff Duty Assignment'&&h(DutyAssignment,{profile,viewMode:'team'}),
          page==='Special Nurse'&&h(SpecialNurseManagement,{profile}),
          page==='Shift Handover'&&h(ShiftHandover,{profile,onNavigate:setPage}),
          page==='Incidents'&&h(Incidents,{profile,onNavigate:setPage}),
          page==='Documents'&&h(Documents,{profile}),
          page==='Accounts Dashboard'&&h(AccountsDashboard,{profile,onNavigate:setPage}),
          page==='Package Expiry Dashboard'&&h(PackageExpiryDashboard,{profile,onNavigate:setPage}),
          page==='Charge Approvals'&&h(ClinicalCharges,{profile,initialPatientId:chargeApprovalPatientId,key:chargeApprovalPatientId||'all'}),
          page==='Payments'&&h(BillingPayments,{profile}),
          page==='Patient Ledger'&&h(PatientLedgerView,{profile,onNavigate:setPage}),
          page==='Final Billing'&&h(FinalBillingView,{profile,onNavigate:setPage}),
          page==='Discharge Clearance'&&h(DischargeManagement,{profile,mode:'accounts',onNavigate:setPage}),
          page==='Refunds'&&h(RefundsView,{profile,onNavigate:setPage}),
          page==='Accounts Reports'&&h(Reports,{profile,onNavigate:setPage}),
          page==='WhatsApp Inbox'&&h(WhatsAppInbox,{profile}),
          page==='WhatsApp Logs'&&h(WhatsAppDeliveryLogs,{profile}),
          page==='Family Communication'&&h(FamilyCommunicationDashboard,{profile}),
          page==='Feedback'&&h(FeedbackDashboard,{profile}),
          page==='Mail Dashboard'&&h(TitanMail,{profile}),
          page==='Recovery Timeline'&&h(RecoveryTimeline,{profile}),
          page==='Reports'&&h(Reports,{profile,onNavigate:setPage}),
          page==='Intelligent Reports'&&h(IntelligentReports,{profile}),
          page==='Medication Errors'&&h(MedicationErrors,{profile,onNavigate:setPage}),
          page==='Notifications'&&h(Notifications,{profile,onNavigate:setPage,engine:alertEngine}),
          page==='Audit Trail'&&h(AuditTrail),
          page==='Alert Settings'&&h(AlertSettings,{profile,engine:alertEngine}),
          ['Dashboard','HR Dashboard','Clinical Dashboard','Accounts Dashboard',"Director's Office"].includes(page)&&h(GeneralHandoverWorklist,{profile}),
          page==='System Maintenance'&&h(SystemMaintenance,{profile})
        )),
        clinicalPopupVisible&&topClinicalAlert&&h('div',{className:`clinical-alert-popup ${String(topClinicalAlert.priority||'Routine').toLowerCase()}`},
          h('div',{className:'clinical-alert-popup-head'},h('strong',null,topClinicalAlert.priority==='Critical'?'🔴 ':topClinicalAlert.priority==='Urgent'?'🟠 ':'🔵 ',topClinicalAlert.title)),
          h('strong',null,topClinicalAlert.patient_name||'Patient'),
          h('span',null,topClinicalAlert.room_label||''),
          h('p',null,topClinicalAlert.description||''),
          h('div',{className:'clinical-alert-popup-actions'},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{
              setClinicalPopupSnooze({key:topClinicalAlertKey,until:Date.now()+5*60*1000});
            }},page==='Admissions'?'Continue Admission · Remind in 5 min':'Remind in 5 min'),
            h('button',{type:'button',className:'btn btn-primary',onClick:()=>{
              const liveAlert=topClinicalAlert;
              if(!liveAlert)return;
              // Hide the popup before navigating on mobile/frontline screens so it cannot
              // cover the task form and make the tap appear unresponsive. This does NOT
              // resolve or acknowledge the alert; it only suppresses the popup temporarily.
              setClinicalPopupSnooze({key:topClinicalAlertKey,until:Date.now()+5*60*1000});
              // Manager/Admin escalations must open the Clinical Escalations register,
              // where management can review the source task and close the escalation with remarks.
              if(liveAlert.isEscalated && ['Admin','Manager'].includes(profile?.role)){
                setPage('Clinical Escalations');
                window.requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'smooth'}));
                return;
              }
              const target=liveAlert.target_page||'Clinical Alerts';
              if(target!=='Clinical Alerts'){
                const context={
                  page:target,return_page:'Clinical Alerts',patient_id:liveAlert.patient_id||'',source_id:liveAlert.source_id||'',
                  alert_key:liveAlert.key||'',alert_type:liveAlert.alert_type||'',from_escalation:Boolean(liveAlert.isEscalated)
                };
                if(target==='Medicines'){
                  context.order_id=liveAlert.source_id||'';
                  const due=new Date(liveAlert.due_at);
                  if(!Number.isNaN(due.getTime()))context.scheduled_time=`${String(due.getHours()).padStart(2,'0')}:${String(due.getMinutes()).padStart(2,'0')}`;
                }else if(target==='Daily Care'){
                  context.care_order_id=liveAlert.source_id||'';
                  context.care_type=String(liveAlert.title||'').replace(/^Daily Care Due:\s*/i,'')||'Daily Care';
                }else if(target==='Physiotherapy'){
                  context.plan_id=liveAlert.source_id||'';
                }
                saveTaskNavigationContext(context);
              }
              setPage(target);
              window.requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'smooth'}));
            }},'Open to Resolve')
          )
        ),
        profile&&profile.role!=='STD'&&page!=='HR Dashboard'&&!alertEngine.soundUnlocked&&h('button',{type:'button',className:'sound-unlock-button',onClick:alertEngine.unlockSound},'🔊 Enable Alert Sound'),
        (navDepth>0||page!==(homePageForProfile(profile)||allowed[0]))&&h('div',{className:'samara-float-nav','aria-label':'Back and Home'},
          h('button',{type:'button',className:'samara-float-back',onClick:goBackPage,'aria-label':'Go back',title:'Back'},'‹ Back'),
          h('button',{type:'button',className:'samara-float-home',onClick:()=>{if(pageEditedRef.current&&!window.confirm('Go to Home? Any entries you have not saved on this page will be lost.'))return;pageEditedRef.current=false;setPage(homePageForProfile(profile)||allowed[0]);window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}})},'aria-label':'Go to Home',title:'Home'},'⌂')),
        // v2.14.38: workflow pop-ups (charge requests, discharge approvals) must render OUTSIDE the
        // header. On phones the header is hidden while any pop-up is open, which previously hid
        // this pop-up together with the header, menu and bottom bar (Accounts login froze).
        h(WorkflowActionPopups,{profile,onNavigate:setPage}),
        h(MobileBottomNav,{page,setPage,allowed,profile,onOpenMenu:()=>setMobileDrawerOpen(true)}),
        mobileDrawerOpen&&h(MobileNavigationDrawer,{profile,allowed,page,onNavigate:(next)=>{setPage(next);setMobileDrawerOpen(false)},onClose:()=>setMobileDrawerOpen(false)})
      )
    );
  }

