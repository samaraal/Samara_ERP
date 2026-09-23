  function FirstLoginPasswordChange({profile,onComplete}){
    const [password,setPassword]=React.useState(''),[confirm,setConfirm]=React.useState(''),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
    async function submit(e){
      e.preventDefault();setMessage('');
      if(password.length<8){setMessage('Please choose a password containing at least 8 characters.');return}
      if(password!==confirm){setMessage('The two passwords do not match.');return}
      setBusy(true);
      const currentMeta=(await client.auth.getUser()).data?.user?.user_metadata||{};
      const {error:authError}=await client.auth.updateUser({
        password,
        data:{...currentMeta,must_change_password:false,password_changed_at:new Date().toISOString()}
      });
      if(authError){
        const msg=String(authError.message||'');
        setMessage(msg.toLowerCase().includes('different from the old')
          ? 'Please enter a completely new password. Do not use the temporary password again.'
          : msg);
        setBusy(false);return;
      }
      // Primary database completion. Authentication metadata above is also kept as
      // a safe recovery marker, preventing a repeated onboarding loop.
      const {error:profileError}=await client.rpc('complete_my_first_login');
      if(profileError){
        console.warn('Profile completion RPC unavailable; continuing with secure Auth completion marker.',profileError);
      }
      await client.auth.refreshSession();
      setBusy(false);onComplete();
    }
    return h('div',{className:'login-shell'},h('form',{className:'card login-card first-login-card',onSubmit:submit},
      h('div',{className:'brand'},h(BrandLogo,{className:'auth-brand-logo'}),h('div',null,h('h1',null,`Welcome to the Samara Family, ${displayName(profile)} 👋`),h('p',null,'We are delighted that you are joining our Assisted Living Team.'))),
      h('p',null,'Before you begin, please create your own secure password. This protects resident information and ensures that only you can access your account.'),
      message&&h('div',{className:'message error'},message),
      h('div',{className:'field'},h('label',null,'Create New Password'),h('input',{type:'password',value:password,onChange:e=>setPassword(e.target.value),minLength:8,required:true,autoComplete:'new-password',name:'samara-new-secure-password'})),
      h('div',{className:'field'},h('label',null,'Confirm New Password'),h('input',{type:'password',value:confirm,onChange:e=>setConfirm(e.target.value),minLength:8,required:true,autoComplete:'new-password',name:'samara-confirm-secure-password'})),
      h('p',{className:'small-note'},'Use a completely new password. Do not repeat the temporary password.'),
      h('button',{className:'btn btn-primary full',disabled:busy},busy?'Activating your account…':'Create Password & Enter Samara ERP'),
      h('p',{className:'small-note'},'Caring with Compassion. Living with Dignity.')
    ));
  }

  function Login({externalMessage,onClearMessage}){
    const [login,setLogin]=React.useState('');
    const [password,setPassword]=React.useState('');
    const [showPassword,setShowPassword]=React.useState(false);
    const [busy,setBusy]=React.useState(false);
    const [message,setMessage]=React.useState(externalMessage||'');
    const [forgot,setForgot]=React.useState(false);
    const [recoveryLogin,setRecoveryLogin]=React.useState('');
    const [recoveryBusy,setRecoveryBusy]=React.useState(false);
    const [recoveryMessage,setRecoveryMessage]=React.useState('');
    React.useEffect(()=>{if(externalMessage)setMessage(externalMessage)},[externalMessage]);
    async function securityRequest(payload){
      // The login_precheck / audit Edge Function is helpful, but it must never
      // leave the whole ERP stuck on "Signing in…" if the function is slow.
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),6000);
      try{
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/admin-users`,{
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey},
          body:JSON.stringify(payload),
          signal:controller.signal
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to complete the security request');
        return result;
      }finally{
        clearTimeout(timer);
      }
    }
    async function withLoginTimeout(promise,ms,label){
      let timer;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out. Please try again.`)),ms)});
      try{return await Promise.race([promise,timeout])}finally{clearTimeout(timer)}
    }
    async function submit(e){
      e.preventDefault();setBusy(true);setMessage('');if(onClearMessage)onClearMessage();
      const normalized=normalizeLogin(login);
      try{
        const check=await securityRequest({action:'login_precheck',login_id:normalized});
        if(check.locked){setMessage('This account is temporarily locked after repeated unsuccessful attempts. Please try again later or contact the Administrator.');setBusy(false);return}
      }catch(_error){/* Sign-in remains available if the optional security check is temporarily unavailable. */}
      try{
      let email='';
      if(login.includes('@')){
        email=login.trim().toLowerCase();
      }else{
        const {data:resolved,error:resolveError}=await withLoginTimeout(client.rpc('resolve_employee_login',{p_login_id:normalized}),12000,'Login verification');
        if(resolveError){setMessage('Unable to verify the Login ID. Please contact the Administrator.');setBusy(false);return}
        email=String(resolved||'').trim().toLowerCase();
        if(!email){setMessage('Incorrect Login ID or password.');setBusy(false);return}
      }
      const {data:signInData,error}=await withLoginTimeout(client.auth.signInWithPassword({email,password}),15000,'Sign in');
      if(error){
        try{await securityRequest({action:'login_failure',login_id:normalized})}catch(_error){}
        setMessage(error.message==='Invalid login credentials'?'Incorrect Login ID or password.':error.message);
      }else{
        // SECURITY v2.10.57:
        // The account returned by Supabase must match the Login ID the user entered.
        // Never continue into the ERP under another employee identity.
        const signedUser=signInData?.user||null;
        const signedUid=String(signedUser?.id||'');
        const signedMetaLogin=normalizeLogin(String(signedUser?.user_metadata?.login_id||''));

        const {data:linkedProfile,error:linkedProfileError}=await withLoginTimeout(
          client.from('profiles')
            .select('id,auth_user_id,login_id,full_name,role,auth_email,is_active,active')
            .eq('id',signedUid)
            .maybeSingle(),
          10000,
          'Identity verification'
        );

        const linkedLogin=normalizeLogin(String(linkedProfile?.login_id||''));
        const requestedLogin=normalizeLogin(normalized);
        const uidIsLinked=Boolean(linkedProfile && String(linkedProfile.id||'')===signedUid);
        const requestedMatchesProfile=Boolean(linkedLogin && requestedLogin===linkedLogin);
        const metadataMatches=Boolean(!signedMetaLogin || signedMetaLogin===requestedLogin);

        if(linkedProfileError || !uidIsLinked || !requestedMatchesProfile || !metadataMatches){
          console.error('SECURITY LOGIN IDENTITY MISMATCH',{
            requestedLogin,
            signedUid,
            signedEmail:signedUser?.email||'',
            signedMetaLogin,
            linkedProfile,
            linkedProfileError
          });
          await client.auth.signOut().catch(()=>{});
          try{await securityRequest({action:'login_failure',login_id:normalized})}catch(_error){}
          setMessage('Security check failed: the authenticated account does not match this Login ID. Access has been blocked. Please contact the Administrator.');
          setBusy(false);
          return;
        }

        // Successful authentication may proceed only after strict identity verification.
        securityRequest({action:'login_success',login_id:normalized}).catch(()=>{});
        Promise.resolve(writeAuditEvent('User Login','Authentication',normalized,{login_id:normalized,auth_user_id:signedUid},'Success')).catch(()=>{});
      }
      }catch(error){
        setMessage(error?.message||'Unable to sign in. Please check the connection and try again.');
      }finally{
        setBusy(false);
      }
    }
    async function requestRecovery(e){
      e.preventDefault();setRecoveryBusy(true);setRecoveryMessage('');
      try{
        const redirectTo=new URL(window.location.href);redirectTo.hash='';redirectTo.search='';
        await securityRequest({action:'request_password_recovery',login_id:recoveryLogin.trim(),redirect_to:redirectTo.toString()});
        setRecoveryMessage('If a registered employee email is available, a secure password-reset link has been sent. Please check Inbox and Spam.');
      }catch(error){
        setRecoveryMessage(error.message||'Unable to request a password reset. Please contact the Administrator.');
      }
      setRecoveryBusy(false);
    }
    return h('div',{className:'login-shell login-v3-shell'},
      h('style',null,`
        @media(max-width:760px){
          .login-v3-shell{padding:0!important;min-height:100dvh!important;background:radial-gradient(circle at 88% 5%,rgba(255,193,72,.22),transparent 22%),linear-gradient(180deg,#fff9fc 0%,#f9cade 27%,#e45b9a 58%,#b31564 80%,#750b43 100%)!important}
          .login-v3-frame{min-height:100dvh!important;display:flex!important;flex-direction:column!important;border:0!important;box-shadow:none!important;background:transparent!important}
          .login-v3-hero{flex:0 0 auto!important;min-height:0!important;padding:8px 22px 12px!important;justify-content:flex-start!important;align-items:center!important;text-align:center!important;background:transparent!important}
          .login-v3-hero::before,.login-v3-hero::after{display:block!important}
          .login-v3-hero .login-main-brand-logo{width:min(350px,78vw)!important;height:135px!important;max-height:135px!important;margin:0 auto 0!important;object-fit:contain!important}
          .login-v3-hero .login-v3-kicker{margin:0 0 3px!important;font-size:11px!important;line-height:1.15!important;letter-spacing:.12em!important}
          .login-v3-hero h1{font-size:27px!important;line-height:1.05!important;margin:0!important}
          .login-v3-form{flex:0 0 auto!important;margin:0 14px 8px!important;padding:13px 20px 9px!important;justify-content:flex-start!important;border:1px solid rgba(255,255,255,.68)!important;border-radius:24px!important;background:linear-gradient(145deg,rgba(255,255,255,.91),rgba(255,239,247,.84))!important;box-shadow:0 18px 42px rgba(91,8,50,.22)!important;backdrop-filter:blur(12px)!important;-webkit-backdrop-filter:blur(12px)!important}
          .login-v3-form .login-v3-kicker{font-size:11px!important;margin-bottom:2px!important}.login-v3-form h2{font-size:26px!important;margin:0 0 1px!important}.login-v3-subtitle{font-size:15px!important;margin:0 0 8px!important}
          .login-v3-form .field{gap:3px!important;margin-bottom:7px!important}.login-v3-form .field label{font-size:15px!important}.login-v3-form .field input{min-height:45px!important;padding:8px 13px!important;font-size:16px!important}
          .forgot-password-link{margin:-2px 0 5px!important}.login-v3-button{min-height:46px!important;margin:0!important}
          .login-app-help{margin:7px 0 0!important;padding:7px 10px!important}.login-app-help>span{font-size:13px!important}.login-app-help-actions{gap:6px!important;margin-top:3px!important}.login-app-help-actions button{min-height:35px!important;font-size:13px!important}
          .login-v3-version{margin-top:5px!important;font-size:12px!important}
          .login-v3-frame>a[href^="tel:"]{margin:auto 0 10px!important;font-size:14px!important;color:#fff!important;text-shadow:0 2px 7px rgba(58,3,31,.42)!important}
        }
      `),
      h('div',{className:'login-v3-frame'},
        h('section',{className:'login-v3-hero'},
          h(BrandLogo,{className:'login-main-brand-logo'}),
          h('h1',null,'Samara ERP')
        ),
        forgot?h('form',{className:'login-v3-form',onSubmit:requestRecovery},
          h('div',{className:'login-v3-kicker login-v3-kicker-dark'},'PASSWORD RECOVERY'),
          h('h2',null,'Forgot your password?'),
          h('p',{className:'login-v3-subtitle'},'Enter your employee Login ID or registered employee email.'),
          recoveryMessage&&h('div',{className:`message ${recoveryMessage.startsWith('If a registered')?'success':'error'}`},recoveryMessage),
          h('div',{className:'field'},h('label',null,'Login ID or Email'),h('input',{value:recoveryLogin,onChange:e=>setRecoveryLogin(e.target.value),required:true,autoCapitalize:'none',placeholder:'Enter Login ID or email'})),
          h('button',{className:'btn btn-primary full login-v3-button',disabled:recoveryBusy},recoveryBusy?'Sending secure link…':'Send Password Reset Link'),
          h('button',{type:'button',className:'login-link-button',onClick:()=>{setForgot(false);setRecoveryMessage('')}},'← Back to Sign in'),
          h('p',{className:'small-note'},'No email access? Ask the Administrator to use Reset Password in Employee Master.'),
          h('div',{className:'login-v3-version'},`Samara ERP ${APP_VERSION}`)
        ):h('form',{className:'login-v3-form',onSubmit:submit},
          h('div',{className:'login-v3-kicker login-v3-kicker-dark'},'SECURE STAFF ACCESS'),
          h('h2',null,'Welcome back'),
          h('p',{className:'login-v3-subtitle'},'Sign in with your employee Login ID.'),
          message&&h('div',{className:'message error'},message),
          h('div',{className:'field'},h('label',null,'Login ID'),h('input',{value:login,onChange:e=>setLogin(e.target.value),required:true,autoCapitalize:'none',placeholder:'Enter login ID'})),
          h('div',{className:'field'},h('label',null,'Password'),h('div',{style:{position:'relative'}},h('input',{type:showPassword?'text':'password',value:password,onChange:e=>setPassword(e.target.value),required:true,placeholder:'Enter password',autoComplete:'current-password',style:{paddingRight:'52px'}}),h('button',{type:'button','aria-label':showPassword?'Hide password':'Show password',title:showPassword?'Hide password':'Show password',onClick:()=>setShowPassword(v=>!v),style:{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',width:'38px',height:'38px',border:'0',background:'transparent',fontSize:'20px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#7a1247',padding:0}},showPassword?'🙈':'👁'))),
          h('button',{type:'button',className:'login-link-button forgot-password-link',onClick:()=>{setForgot(true);setRecoveryLogin(login);setMessage('')}},'Forgot Password?'),
          h('button',{className:'btn btn-primary full login-v3-button',disabled:busy},busy?'Signing in…':'Sign in'),
          h('div',{className:'login-app-help'},
            h('span',null,'Having trouble opening Samara ERP?'),
            h('div',{className:'login-app-help-actions'},
              h('button',{type:'button',onClick:samaraReloadApp},'Reload App'),
              h('button',{type:'button',onClick:samaraOpenAppHelp},'App Help / Repair')
            )
          ),
          h('div',{className:'login-v3-version'},`Samara ERP ${APP_VERSION}`)
        ),
        h('a',{href:'tel:+919176735577',style:{display:'block',gridColumn:'1 / -1',marginTop:'14px',textAlign:'center',color:'#7a1247',fontWeight:'800',textDecoration:'none'}},'Developed by Boomi R - 9176735577')
      )
    );
  }

  function RecoveryPasswordChange({onComplete}){
    const [password,setPassword]=React.useState(''),[confirm,setConfirm]=React.useState(''),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
    async function submit(e){
      e.preventDefault();setMessage('');
      if(password.length<8){setMessage('Please choose a password containing at least 8 characters.');return}
      if(password!==confirm){setMessage('The two passwords do not match.');return}
      setBusy(true);
      const {error}=await client.auth.updateUser({password,data:{must_change_password:false,password_changed_at:new Date().toISOString(),password_recovered_at:new Date().toISOString()}});
      if(error){setMessage(error.message||'Unable to change password.');setBusy(false);return}
      try{await client.rpc('complete_my_first_login')}catch(_error){}
      setBusy(false);await onComplete();
    }
    return h('div',{className:'login-shell'},h('form',{className:'card login-card first-login-card',onSubmit:submit},
      h('div',{className:'brand'},h(BrandLogo,{className:'auth-brand-logo'}),h('div',null,h('h1',null,'Create a New Password'),h('p',null,'Your secure recovery link has been verified.'))),
      h('p',null,'Enter a new password for your Samara Care ERP account.'),
      message&&h('div',{className:'message error'},message),
      h('div',{className:'field'},h('label',null,'New Password'),h('input',{type:'password',value:password,onChange:e=>setPassword(e.target.value),minLength:8,required:true,autoComplete:'new-password'})),
      h('div',{className:'field'},h('label',null,'Confirm New Password'),h('input',{type:'password',value:confirm,onChange:e=>setConfirm(e.target.value),minLength:8,required:true,autoComplete:'new-password'})),
      h('button',{className:'btn btn-primary full',disabled:busy},busy?'Saving new password…':'Save New Password'),
      h('p',{className:'small-note'},'After saving, sign in with your new password.')
    ));
  }


