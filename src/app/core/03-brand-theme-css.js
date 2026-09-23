  (()=>{
    if(document.getElementById('samara-final-brand-theme'))return;
    const style=document.createElement('style');
    style.id='samara-final-brand-theme';
    style.textContent=`
      :root{
        --samara-plum:#5d1039;
        --samara-wine:#7a1247;
        --samara-magenta:#b01264;
        --samara-rose:#e03a7c;
        --samara-coral:#f36a4c;
        --samara-gold:#f6b72d;
        --samara-pale:#fff3f8;
        --samara-border:#ead0de;
        --samara-ink:#382333;
      }
      html,body,#root,.app-shell,.app-main,main,.content,.content-area{
        background:linear-gradient(145deg,#fffafd 0%,#fff3f8 52%,#fffaf2 100%)!important;
        color:var(--samara-ink)!important;
      }
      #app-splash,.app-splash,
      .sidebar,.side-nav,.app-sidebar,
      .login-v3-hero,.login-v3-left,.login-brand-panel{
        background:
          radial-gradient(circle at 91% 8%,rgba(246,183,45,.24),transparent 24%),
          radial-gradient(circle at 8% 92%,rgba(224,58,124,.29),transparent 34%),
          linear-gradient(150deg,#5d1039 0%,#811248 31%,#b01264 66%,#df3d7c 100%)!important;
      }
      .samara-brand-logo{display:block;object-fit:contain;max-width:100%}
      .side-brand-logo{width:215px;height:82px;object-fit:contain;object-position:left center}
      .mobile-header-brand-logo{width:150px;height:58px;object-fit:contain;object-position:left center}
      .mobile-drawer-brand-logo{width:175px;height:66px;object-fit:contain;object-position:left center}
      .login-main-brand-logo{width:min(410px,88%);max-height:205px;object-fit:contain;margin:0 auto 18px}
      .auth-brand-logo{width:210px;height:82px;object-fit:contain}
      .side-brand{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:2px!important}
      .side-brand>div:last-child{display:block!important;width:100%!important}
      .side-brand>div:last-child strong{display:none!important}
      .side-brand>div:last-child small{display:block!important;color:#ffe8f2!important;font-size:11px!important;font-weight:800!important;padding-left:4px!important}
      .sidebar,.side-nav,.app-sidebar,.sidebar *{color:#fff}
      .nav-item.active,.sidebar .active,.side-nav .active{
        background:linear-gradient(90deg,#c3166d 0%,#e23e80 100%)!important;
        box-shadow:inset 3px 0 0 #f6b72d!important;color:#fff!important;
      }
      .sidebar button:hover,.sidebar a:hover,.side-nav button:hover{background:rgba(255,255,255,.12)!important}
      .dashboard-banner,.shift-banner,.hero-banner,.accounts-hero,.clinical-banner{
        background:linear-gradient(110deg,#741243 0%,#a91360 44%,#dc397a 77%,#ef8054 100%)!important;
        color:#fff!important;
      }
      .btn-primary,.button-primary,button.primary,.login-v3-button,.primary-action{
        background:linear-gradient(100deg,#7a1247 0%,#b01264 54%,#e03a7c 100%)!important;
        border-color:#9f1459!important;color:#fff!important;
        box-shadow:0 7px 18px rgba(176,18,100,.20)!important;
      }
      .btn-primary:hover,.button-primary:hover,button.primary:hover{
        background:linear-gradient(100deg,#64103b 0%,#961151 54%,#cb2a70 100%)!important;
      }
      .btn-secondary{background:#f8e7ef!important;border-color:#e4bfd2!important;color:#751243!important}
      .card,.panel,.section-card,.dashboard-card,.metric-card,.accounts-workflow-card{
        background:linear-gradient(145deg,#fff 0%,#fffafd 100%)!important;
        border-color:var(--samara-border)!important;
      }
      .dashboard-card::before,.metric-card::before,.accounts-workflow-card::before{
        background:linear-gradient(90deg,#7a1247 0%,#b01264 42%,#f36a4c 76%,#f6b72d 100%)!important;
      }
      input:focus,select:focus,textarea:focus{border-color:#c21872!important;box-shadow:0 0 0 3px rgba(194,24,114,.14)!important}
      a,.link,.text-link{color:#a50e5b!important}
      .message.success,.samara-toast.success,.toast.success,[data-toast-type='success']{
        background:linear-gradient(100deg,#087f5b,#0b9b73 56%,#17b978)!important;color:#fff!important;border-color:#087f5b!important;
      }
      .badge.success,.status-badge.success,.pill.success{background:#fae7f0!important;color:#781345!important;border-color:#e2adc7!important}
      .field-toggle-button.make-required{background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c)!important;color:#fff!important}
      .medication-declaration{display:grid;grid-template-columns:minmax(320px,520px) 1fr;gap:14px;align-items:end;margin:10px 0 14px;padding:14px;border:1px solid #ead0de;border-radius:14px;background:linear-gradient(135deg,#fffafd,#fff1f7)}
      .medicine-order-row{grid-template-columns:repeat(5,minmax(155px,1fr))!important}
      @media(max-width:1250px){.medication-declaration{grid-template-columns:1fr}.medicine-order-row{grid-template-columns:repeat(3,minmax(160px,1fr))!important}}
      @media(max-width:760px){.medicine-order-row{grid-template-columns:1fr!important}}
      .field-setting-status.optional{background:#fae7f0!important;color:#781345!important}
      .field-settings-autosave{color:#ffe5f1!important}
      .app-splash-progress span,.login-v3-progress span,
      #app-splash .splash-progress::after,#app-splash [class*='progress']::after{
        background:linear-gradient(90deg,transparent,#b01264,#f36a4c,#f6b72d,transparent)!important;
      }
      @media(max-width:720px){
        .side-brand-logo{width:190px;height:72px}.login-main-brand-logo{width:min(325px,92%);max-height:160px}
      }
      @media print{
        h1,h2,h3,h4{color:#791345!important}
        table th{background:#f9e4ee!important;color:#5d1039!important}
        table,th,td{border-color:#c99caf!important}
      }

      /* Prevent legacy green from returning on click, focus or expanded states */
      .sidebar .nav-heading-button,
      .sidebar .nav-heading-button:link,
      .sidebar .nav-heading-button:visited,
      .sidebar .nav-heading-button:hover,
      .sidebar .nav-heading-button:focus,
      .sidebar .nav-heading-button:focus-visible,
      .sidebar .nav-heading-button:active,
      .sidebar .nav-section.expanded > .nav-heading-button,
      .sidebar .nav-section.expanded > .nav-heading-button:hover,
      .sidebar .nav-section.expanded > .nav-heading-button:focus,
      .sidebar .nav-section.expanded > .nav-heading-button:active{
        background:transparent!important;
        color:#ffffff!important;
        border-color:transparent!important;
        outline:none!important;
        box-shadow:none!important;
        -webkit-tap-highlight-color:transparent!important;
      }
      .sidebar .nav-section.expanded > .nav-heading-button{
        background:linear-gradient(90deg,rgba(195,22,109,.96),rgba(226,62,128,.96))!important;
        box-shadow:inset 3px 0 0 #f6b72d!important;
      }
      .sidebar .nav-heading-button .nav-chevron,
      .sidebar .nav-heading-button:hover .nav-chevron,
      .sidebar .nav-heading-button:focus .nav-chevron,
      .sidebar .nav-heading-button:active .nav-chevron{
        background:rgba(255,255,255,.15)!important;
        color:#ffffff!important;
        border-color:rgba(255,255,255,.12)!important;
      }

      .sidebar .nav-submenu button,
      .sidebar .nav-submenu button:hover,
      .sidebar .nav-submenu button:focus,
      .sidebar .nav-submenu button:focus-visible,
      .sidebar .nav-submenu button:active{
        color:#ffffff!important;
        outline:none!important;
        -webkit-tap-highlight-color:transparent!important;
      }
      .sidebar .nav-submenu button:not(.active):hover,
      .sidebar .nav-submenu button:not(.active):focus,
      .sidebar .nav-submenu button:not(.active):active{
        background:rgba(255,255,255,.11)!important;
      }
      .sidebar .nav-submenu button.active,
      .sidebar .nav-submenu button.active:hover,
      .sidebar .nav-submenu button.active:focus,
      .sidebar .nav-submenu button.active:active{
        background:linear-gradient(90deg,#c3166d 0%,#e23e80 100%)!important;
        color:#ffffff!important;
        box-shadow:inset 3px 0 0 #f6b72d!important;
      }

      .sidebar-footer .btn.btn-secondary.full,
      .sidebar-footer .btn.btn-secondary.full:hover,
      .sidebar-footer .btn.btn-secondary.full:focus,
      .sidebar-footer .btn.btn-secondary.full:focus-visible,
      .sidebar-footer .btn.btn-secondary.full:active{
        background:linear-gradient(100deg,#fff5fa 0%,#ffe3ef 100%)!important;
        color:#7a1247!important;
        border:1px solid rgba(255,255,255,.75)!important;
        outline:none!important;
        box-shadow:none!important;
        -webkit-tap-highlight-color:transparent!important;
      }
      .sidebar-footer .user-chip,
      .sidebar-footer .user-chip:hover,
      .sidebar-footer .user-chip:focus,
      .sidebar-footer .user-chip:active{
        background:linear-gradient(120deg,rgba(93,16,57,.82),rgba(176,18,100,.76))!important;
        border-color:rgba(255,255,255,.15)!important;
        color:#ffffff!important;
      }


      /* Login hero: white at the logo, gradually flowing into Samara magenta */
      .login-v3-hero{
        position:relative!important;
        overflow:hidden!important;
        isolation:isolate!important;
        background:
          radial-gradient(circle at 84% 5%,rgba(246,183,45,.16),transparent 22%),
          linear-gradient(
            180deg,
            #ffffff 0%,
            #fffdfd 20%,
            #fff6fa 32%,
            #fce3ef 43%,
            #f3aacb 55%,
            #df4b91 69%,
            #bc176c 84%,
            #8a124f 100%
          )!important;
        color:#ffffff!important;
      }
      .login-v3-hero::before{
        content:'';
        position:absolute;
        left:-12%;right:-12%;top:31%;height:28%;
        z-index:-1;
        background:
          linear-gradient(168deg,transparent 0 27%,rgba(255,255,255,.30) 28% 43%,transparent 44%),
          linear-gradient(192deg,transparent 0 35%,rgba(255,255,255,.18) 36% 50%,transparent 51%);
        transform:rotate(-1deg);
        pointer-events:none;
      }
      .login-v3-hero::after{
        content:'';
        position:absolute;
        width:430px;height:430px;
        right:-165px;bottom:-205px;
        z-index:-1;
        border-radius:48% 52% 40% 60%;
        border:2px solid rgba(255,255,255,.10);
        box-shadow:
          -55px -28px 0 -1px rgba(255,255,255,.035),
          -110px -58px 0 -2px rgba(255,255,255,.025);
        transform:rotate(28deg);
        pointer-events:none;
      }
      .login-v3-hero .login-main-brand-logo{
        width:min(430px,90%)!important;
        max-height:215px!important;
        margin:0 auto 22px!important;
        filter:drop-shadow(0 7px 14px rgba(118,18,70,.10))!important;
      }
      .login-v3-hero .login-v3-kicker{
        color:#7a1247!important;
        text-shadow:none!important;
        margin-top:2px!important;
      }
      .login-v3-hero h1{
        color:#7a1247!important;
        text-shadow:none!important;
        width:100%!important;
        text-align:center!important;
      }
      .login-v3-hero .login-v3-description{
        color:#4b293d!important;
        text-shadow:none!important;
      }
      .login-v3-hero .login-v3-features{
        margin-top:22px!important;
        padding:18px 20px!important;
        border-radius:16px!important;
        background:rgba(111,15,61,.19)!important;
        border:1px solid rgba(255,255,255,.20)!important;
        backdrop-filter:blur(3px)!important;
      }
      .login-v3-hero .login-v3-features>div{
        color:#ffffff!important;
        text-shadow:0 1px 3px rgba(72,8,38,.28)!important;
      }
      .login-v3-hero .login-v3-features span{
        background:rgba(255,255,255,.20)!important;
        color:#ffffff!important;
      }
      @media(max-width:760px){
        .login-v3-hero{
          background:linear-gradient(180deg,#fff 0%,#fff7fb 34%,#ed83b4 67%,#a91460 100%)!important;
        }
        .login-v3-hero .login-v3-kicker,
        .login-v3-hero h1,
        .login-v3-hero .login-v3-description{color:#6f123f!important}
      }


      /* Left panel: white at top, flowing into Samara magenta */
      .sidebar,.side-nav,.app-sidebar{
        background:
          radial-gradient(circle at 82% 4%,rgba(246,183,45,.12),transparent 18%),
          linear-gradient(180deg,#ffffff 0%,#fffdfd 14%,#fff6fa 25%,#fce2ee 38%,#f4b2cf 52%,#e568a3 68%,#c62a79 84%,#9a1558 100%)!important;
        color:#6f123f!important;
      }
      .sidebar .side-brand>div:last-child small{color:#7a1247!important}
      .sidebar .nav-heading-button,
      .sidebar .nav-heading-button *{color:#8a124f!important}
      .sidebar .nav-submenu button{color:#5f334b!important}
      .sidebar .nav-heading-button:hover,
      .sidebar .nav-heading-button:focus,
      .sidebar .nav-heading-button:active{background:rgba(176,18,100,.08)!important;color:#8a124f!important}
      .sidebar .nav-section.expanded>.nav-heading-button,
      .sidebar .nav-section.expanded>.nav-heading-button:hover,
      .sidebar .nav-section.expanded>.nav-heading-button:focus,
      .sidebar .nav-section.expanded>.nav-heading-button:active{
        background:linear-gradient(90deg,#b01264 0%,#e03a7c 100%)!important;
        color:#fff!important;box-shadow:inset 3px 0 0 #f6b72d!important;
      }
      .sidebar .nav-section.expanded>.nav-heading-button *{color:#fff!important}
      .sidebar .nav-submenu button.active,
      .sidebar .nav-submenu button.active:hover,
      .sidebar .nav-submenu button.active:focus,
      .sidebar .nav-submenu button.active:active{
        background:linear-gradient(90deg,#e36d9f 0%,#ed8bb6 100%)!important;
        color:#7a1247!important;box-shadow:inset 3px 0 0 #f6b72d!important;
      }

      /* Spacious meaningful submenu icons */
      .sidebar .nav-submenu button{
        position:relative!important;padding-left:46px!important;min-height:40px!important;
        display:flex!important;align-items:center!important;gap:10px!important;
      }
      .sidebar .nav-submenu button::before{
        position:absolute!important;left:15px!important;top:50%!important;transform:translateY(-50%)!important;
        width:23px!important;height:23px!important;display:grid!important;place-items:center!important;
        font-size:18px!important;line-height:1!important;color:#c21872!important;font-weight:800!important;
      }
      .sidebar .nav-submenu button[data-nav='Dashboard']::before{content:'⌂'}
      .sidebar .nav-submenu button[data-nav='Notifications']::before{content:'♧'}
      .sidebar .nav-submenu button[data-nav='Enquiries']::before{content:'▣'}
      .sidebar .nav-submenu button[data-nav='Admissions']::before{content:'♥'}
      .sidebar .nav-submenu button[data-nav='Patients']::before{content:'♙'}
      .sidebar .nav-submenu button[data-nav='Discharge']::before{content:'↪'}
      .sidebar .nav-submenu button[data-nav='Documents']::before{content:'▤'}
      .sidebar .nav-submenu button[data-nav='Reports']::before,
      .sidebar .nav-submenu button[data-nav='Intelligent Reports']::before{content:'▦'}
      .sidebar .nav-submenu button[data-nav='Clinical Dashboard']::before,
      .sidebar .nav-submenu button[data-nav='Clinical Alerts']::before,
      .sidebar .nav-submenu button[data-nav='Shift Tasks']::before,
      .sidebar .nav-submenu button[data-nav='Daily Care']::before,
      .sidebar .nav-submenu button[data-nav='Vital Signs']::before,
      .sidebar .nav-submenu button[data-nav='Medicines']::before,
      .sidebar .nav-submenu button[data-nav='Physiotherapy']::before,
      .sidebar .nav-submenu button[data-nav='Special Nurse']::before,
      .sidebar .nav-submenu button[data-nav='Shift Handover']::before,
      .sidebar .nav-submenu button[data-nav='Incidents']::before{content:'♥'}
      .sidebar .nav-submenu button[data-nav='Food & Diet']::before{content:'♨'}
      .sidebar .nav-submenu button[data-nav='Accounts Dashboard']::before,
      .sidebar .nav-submenu button[data-nav='Charge Approvals']::before,
      .sidebar .nav-submenu button[data-nav='Payments']::before,
      .sidebar .nav-submenu button[data-nav='Patient Ledger']::before,
      .sidebar .nav-submenu button[data-nav='Final Billing']::before,
      .sidebar .nav-submenu button[data-nav='Discharge Clearance']::before,
      .sidebar .nav-submenu button[data-nav='Refunds']::before,
      .sidebar .nav-submenu button[data-nav='Accounts Reports']::before{content:'₹'}

      /* Samara sidebar icon normalization: vector icons only, no emoji/square fallbacks */
      .sidebar .nav-submenu button::before{font-family:inherit!important;width:22px!important;height:22px!important;min-width:22px!important;font-size:0!important;background-color:currentColor!important;-webkit-mask-repeat:no-repeat!important;mask-repeat:no-repeat!important;-webkit-mask-position:center!important;mask-position:center!important;-webkit-mask-size:21px 21px!important;mask-size:21px 21px!important}
      .sidebar .nav-submenu button[data-nav='Shift Management']::before{content:''!important;color:#7b61d1!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7v5l3 2'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7v5l3 2'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Stores Master']::before{content:''!important;color:#d08a19!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7l9-4 9 4-9 4-9-4Z'/%3E%3Cpath d='M3 7v10l9 4 9-4V7M12 11v10'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7l9-4 9 4-9 4-9-4Z'/%3E%3Cpath d='M3 7v10l9 4 9-4V7M12 11v10'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Charge Master']::before{content:''!important;color:#2eaa72!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='14' rx='2'/%3E%3Cpath d='M3 10h18M7 15h4'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='14' rx='2'/%3E%3Cpath d='M3 10h18M7 15h4'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Temporary Duty Swap']::before{content:''!important;color:#5d78d6!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 7h11l-3-3M17 17H6l3 3M18 7v4M6 17v-4'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 7h11l-3-3M17 17H6l3 3M18 7v4M6 17v-4'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Additional Duty Assignment']::before{content:''!important;color:#7b61c9!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 5v14M5 12h14'/%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 5v14M5 12h14'/%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Leave Cover']::before{content:''!important;color:#e07a2f!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M8 3v4M16 3v4M3 10h18M8 15l2 2 5-5'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M8 3v4M16 3v4M3 10h18M8 15l2 2 5-5'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Consumables']::before{content:''!important;color:#9b59d0!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 21V10a2 2 0 0 1 4 0v4-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v7c0 3-2 5-5 5H8Z'/%3E%3Cpath d='M8 13 5 9a2 2 0 0 0-3 2l4 7'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 21V10a2 2 0 0 1 4 0v4-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v7c0 3-2 5-5 5H8Z'/%3E%3Cpath d='M8 13 5 9a2 2 0 0 0-3 2l4 7'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Pharmacy']::before{content:''!important;color:#25a98b!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m10.5 20.5 10-10a4.24 4.24 0 0 0-6-6l-10 10a4.24 4.24 0 0 0 6 6Z'/%3E%3Cpath d='m8.5 8.5 7 7'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m10.5 20.5 10-10a4.24 4.24 0 0 0-6-6l-10 10a4.24 4.24 0 0 0 6 6Z'/%3E%3Cpath d='m8.5 8.5 7 7'/%3E%3C/svg%3E")!important}
      .sidebar .nav-heading-button::before{content:''!important;width:22px!important;height:22px!important;min-width:22px!important;background-color:currentColor!important;-webkit-mask-repeat:no-repeat!important;mask-repeat:no-repeat!important;-webkit-mask-position:center!important;mask-position:center!important;-webkit-mask-size:21px 21px!important;mask-size:21px 21px!important}
      .sidebar .nav-section:nth-of-type(1)>.nav-heading-button::before{color:#d62b78!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 11 12 3l9 8'/%3E%3Cpath d='M5 10v10h14V10M9 20v-6h6v6'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 11 12 3l9 8'/%3E%3Cpath d='M5 10v10h14V10M9 20v-6h6v6'/%3E%3C/svg%3E")!important}
      .sidebar .nav-section:nth-of-type(2)>.nav-heading-button::before{color:#b41461!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.6v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2.4V9.6h.09A1.7 1.7 0 0 0 4 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.4 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2.4h4v.09A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.4a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.09v4h-.09a1.7 1.7 0 0 0-1.6 1.2Z'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.6v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2.4V9.6h.09A1.7 1.7 0 0 0 4 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.4 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2.4h4v.09A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.4a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.09v4h-.09a1.7 1.7 0 0 0-1.6 1.2Z'/%3E%3C/svg%3E")!important}
      .sidebar .nav-section:nth-of-type(3)>.nav-heading-button::before{color:#8c58c9!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='9' cy='8' r='3'/%3E%3Cpath d='M3 20a6 6 0 0 1 12 0M17 8a3 3 0 1 0 0-6M17 13a5 5 0 0 1 5 5'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='9' cy='8' r='3'/%3E%3Cpath d='M3 20a6 6 0 0 1 12 0M17 8a3 3 0 1 0 0-6M17 13a5 5 0 0 1 5 5'/%3E%3C/svg%3E")!important}
      .sidebar .nav-section:nth-of-type(4)>.nav-heading-button::before{color:#e43a77!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z'/%3E%3C/svg%3E")!important}
      .sidebar .nav-section:nth-of-type(5)>.nav-heading-button::before{color:#3aa6c8!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='3' width='16' height='18' rx='2'/%3E%3Cpath d='M9 3V1h6v2M12 8v6M9 11h6'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='3' width='16' height='18' rx='2'/%3E%3Cpath d='M9 3V1h6v2M12 8v6M9 11h6'/%3E%3C/svg%3E")!important}
      .sidebar .nav-section:nth-of-type(6)>.nav-heading-button::before{color:#d24a88!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z'/%3E%3C/svg%3E")!important}
      .sidebar .nav-section:nth-of-type(7)>.nav-heading-button::before{color:#28a88a!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 7h16v10H4zM9 7V5h6v2M12 10v4M10 12h4'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 7h16v10H4zM9 7V5h6v2M12 10v4M10 12h4'/%3E%3C/svg%3E")!important}
      .sidebar .nav-section:nth-of-type(8)>.nav-heading-button::before{color:#f0a126!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 3v18M17 3v18M4 8h16M4 16h16'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 3v18M17 3v18M4 8h16M4 16h16'/%3E%3C/svg%3E")!important}
      .sidebar .nav-section.expanded>.nav-heading-button::before{background-color:#fff!important;color:#fff!important}

      /* Approved colourful sidebar icon set: stable by section name, not menu position */
      .sidebar .nav-heading-button[data-section]::before{content:''!important;width:24px!important;height:24px!important;min-width:24px!important;background-color:var(--section-icon,#b41461)!important;-webkit-mask-repeat:no-repeat!important;mask-repeat:no-repeat!important;-webkit-mask-position:center!important;mask-position:center!important;-webkit-mask-size:22px 22px!important;mask-size:22px 22px!important}
      .sidebar .nav-heading-button[data-section="OVERVIEW"]::before{--section-icon:#d62b78;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M3%2011%2012%203l9%208%27%2F%3E%3Cpath%20d%3D%27M5%2010v10h14V10M9%2020v-6h6v6%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M3%2011%2012%203l9%208%27%2F%3E%3Cpath%20d%3D%27M5%2010v10h14V10M9%2020v-6h6v6%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="ADMIN"]::before{--section-icon:#b41461;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%2712%27%20cy%3D%2712%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M19%2012a7%207%200%200%200-.1-1l2-1.5-2-3.4-2.4%201A7%207%200%200%200%2015%206l-.3-2.6h-4L10.4%206A7%207%200%200%200%209%207.1l-2.4-1-2%203.4%202%201.5a7%207%200%200%200%200%202L4.6%2014.5l2%203.4%202.4-1A7%207%200%200%200%2010.4%2018l.3%202.6h4L15%2018a7%207%200%200%200%201.5-1.1l2.4%201%202-3.4-2-1.5a7%207%200%200%200%20.1-1Z%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%2712%27%20cy%3D%2712%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M19%2012a7%207%200%200%200-.1-1l2-1.5-2-3.4-2.4%201A7%207%200%200%200%2015%206l-.3-2.6h-4L10.4%206A7%207%200%200%200%209%207.1l-2.4-1-2%203.4%202%201.5a7%207%200%200%200%200%202L4.6%2014.5l2%203.4%202.4-1A7%207%200%200%200%2010.4%2018l.3%202.6h4L15%2018a7%207%200%200%200%201.5-1.1l2.4%201%202-3.4-2-1.5a7%207%200%200%200%20.1-1Z%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="HR"]::before{--section-icon:#8c58c9;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%279%27%20cy%3D%278%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M3%2020a6%206%200%200%201%2012%200M17%208a3%203%200%201%200%200-6M17%2013a5%205%200%200%201%205%205%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%279%27%20cy%3D%278%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M3%2020a6%206%200%200%201%2012%200M17%208a3%203%200%201%200%200-6M17%2013a5%205%200%200%201%205%205%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="DIRECTOR'S OFFICE"]::before{--section-icon:#c1276b;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%2712%27%20cy%3D%276%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M5%2021v-3a7%207%200%200%201%2014%200v3M3%2021h18M8%2014h8%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%2712%27%20cy%3D%276%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M5%2021v-3a7%207%200%200%201%2014%200v3M3%2021h18M8%2014h8%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="ADMISSION"]::before{--section-icon:#3aa6c8;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M6%203h9l3%203v15H6z%27%2F%3E%3Cpath%20d%3D%27M15%203v4h4M12%2010v6M9%2013h6%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M6%203h9l3%203v15H6z%27%2F%3E%3Cpath%20d%3D%27M15%203v4h4M12%2010v6M9%2013h6%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="MANAGER"]::before{--section-icon:#d24a88;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%2712%27%20cy%3D%277%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M5%2021v-3a7%207%200%200%201%2014%200v3M8%2013h8%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%2712%27%20cy%3D%277%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M5%2021v-3a7%207%200%200%201%2014%200v3M8%2013h8%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="NURSING"]::before{--section-icon:#e43a77;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M7%208c0-3%202-5%205-5s5%202%205%205v3H7zM6%2011h12l-1%2010H7z%27%2F%3E%3Cpath%20d%3D%27M12%205v4M10%207h4%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M7%208c0-3%202-5%205-5s5%202%205%205v3H7zM6%2011h12l-1%2010H7z%27%2F%3E%3Cpath%20d%3D%27M12%205v4M10%207h4%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="PHARMACY & STORES"]::before{--section-icon:#f0a126;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27m10.5%2020.5%2010-10a4.24%204.24%200%200%200-6-6l-10%2010a4.24%204.24%200%200%200%206%206Z%27%2F%3E%3Cpath%20d%3D%27m8.5%208.5%207%207%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27m10.5%2020.5%2010-10a4.24%204.24%200%200%200-6-6l-10%2010a4.24%204.24%200%200%200%206%206Z%27%2F%3E%3Cpath%20d%3D%27m8.5%208.5%207%207%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="FOOD & DIET"]::before{--section-icon:#ef6c23;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M6%203v8M3%203v5a3%203%200%200%200%206%200V3M6%2011v10M15%203v18M15%203c4%202%205%206%205%209h-5%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M6%203v8M3%203v5a3%203%200%200%200%206%200V3M6%2011v10M15%203v18M15%203c4%202%205%206%205%209h-5%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="ACCOUNTS / BILLING"]::before{--section-icon:#2687d9;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Crect%20x%3D%274%27%20y%3D%272%27%20width%3D%2716%27%20height%3D%2720%27%20rx%3D%272%27%2F%3E%3Cpath%20d%3D%27M7%206h10v4H7zM8%2014h1M12%2014h1M16%2014h1M8%2018h1M12%2018h1M16%2018h1%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Crect%20x%3D%274%27%20y%3D%272%27%20width%3D%2716%27%20height%3D%2720%27%20rx%3D%272%27%2F%3E%3Cpath%20d%3D%27M7%206h10v4H7zM8%2014h1M12%2014h1M16%2014h1M8%2018h1M12%2018h1M16%2018h1%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="COMMUNICATION"]::before{--section-icon:#16a36a;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M21%2012a8%208%200%200%201-8%208H7l-4%202%201.5-4A8%208%200%201%201%2021%2012Z%27%2F%3E%3Cpath%20d%3D%27M8%2012h.01M12%2012h.01M16%2012h.01%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M21%2012a8%208%200%200%201-8%208H7l-4%202%201.5-4A8%208%200%201%201%2021%2012Z%27%2F%3E%3Cpath%20d%3D%27M8%2012h.01M12%2012h.01M16%2012h.01%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-heading-button[data-section="MY ACCOUNT"]::before{--section-icon:#2468c4;-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%2712%27%20cy%3D%278%27%20r%3D%274%27%2F%3E%3Cpath%20d%3D%27M4%2022a8%208%200%200%201%2016%200%27%2F%3E%3C%2Fsvg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Ccircle%20cx%3D%2712%27%20cy%3D%278%27%20r%3D%274%27%2F%3E%3Cpath%20d%3D%27M4%2022a8%208%200%200%201%2016%200%27%2F%3E%3C%2Fsvg%3E")!important}
      .sidebar .nav-section.expanded>.nav-heading-button[data-section]::before{background-color:#fff!important}
      .sidebar .nav-submenu button::before{width:22px!important;height:22px!important;min-width:22px!important;-webkit-mask-size:20px 20px!important;mask-size:20px 20px!important}
      .login-app-help{margin:15px 0 3px;padding:12px;border:1px solid #ead6df;border-radius:14px;background:#fffafd;text-align:center}
      .login-app-help>span{display:block;font-size:13px;color:#75616c;margin-bottom:8px}
      .login-app-help-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
      .login-app-help-actions button{border:0;background:transparent;color:#087667;font-weight:800;font-size:13px;padding:7px 9px;border-radius:9px;cursor:pointer}
      .login-app-help-actions button:hover,.login-app-help-actions button:focus{background:#eef8f6}
      .sidebar-footer{display:grid!important;gap:8px!important}
      .mobile-update-button{width:100%!important;min-height:45px!important;margin-bottom:7px!important;border:1px solid #dfc7d3!important;border-radius:13px!important;background:#fff!important;color:#7a1247!important;font-weight:850!important}

      .clinical-list-field{position:relative}
      .clinical-numbered-list{margin:0 0 8px 22px;padding:0;display:grid;gap:6px}
      .clinical-numbered-list li{padding:7px 8px;border:1px solid #ead3de;border-radius:9px;background:#fffafd}
      .clinical-numbered-list li span{display:inline}
      .clinical-list-remove{float:right;border:0;background:transparent;color:#a20f55;font-size:20px;font-weight:800;line-height:1;cursor:pointer}
      .clinical-add-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}
      .clinical-add-button{min-width:68px;min-height:40px}
      .clinical-empty{margin:0 0 7px}
      @media(max-width:700px){.clinical-add-row{grid-template-columns:minmax(0,1fr) auto}.clinical-add-button{min-width:62px;padding-left:10px!important;padding-right:10px!important}}

      .sidebar .nav-submenu button[data-nav='WhatsApp Inbox']::before{content:'◉'!important;color:#169b67!important}
      .sidebar .nav-submenu button[data-nav='Mail Dashboard']::before{content:'✉'!important;color:#b01264!important}

      .mail-shell{display:grid;gap:18px}
      .mail-hero{
        display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;
        padding:22px;border:1px solid #ecd0dd;border-radius:22px;
        background:linear-gradient(135deg,#fff 0%,#fff5f9 55%,#f5fbf9 100%);
      }
      .mail-hero h3{margin:0 0 5px;color:#49142f;font-size:26px}
      .mail-hero p{margin:0;color:#667a75}
      .mail-actions{display:flex;gap:8px;flex-wrap:wrap}
      .mailbox-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .mailbox-card{
        border:1px solid #ecd0dd;border-radius:20px;padding:18px;background:#fff;
        text-align:left;cursor:pointer;transition:.18s ease;min-height:150px
      }
      .mailbox-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(93,16,57,.09)}
      .mailbox-card.active{border-color:#b01264;box-shadow:0 0 0 2px rgba(176,18,100,.08)}
      .mailbox-card small{color:#71827d}
      .mailbox-card strong{display:block;color:#5d1039;font-size:18px;margin:5px 0}
      .mailbox-card .count{font-size:34px;line-height:1;color:#0c6f5c;font-weight:900}
      .mail-workspace{
        display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;
        border:1px solid #ecd0dd;border-radius:22px;background:#fff;padding:14px
      }
      .mail-folders{display:grid;align-content:start;gap:7px}
      .mail-folder-btn{
        border:0;border-radius:13px;padding:12px 13px;background:#faf3f7;text-align:left;
        font-weight:800;color:#5d1039;cursor:pointer
      }
      .mail-folder-btn.active{background:#7c1049;color:#fff}
      .mail-content{min-width:0}
      .mail-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
      .mail-toolbar input{flex:1 1 240px;min-width:0}
      .mail-list{border:1px solid #edf0ef;border-radius:16px;overflow:hidden}
      .mail-row{
        display:grid;grid-template-columns:34px minmax(150px,230px) minmax(220px,1fr) 150px;
        gap:10px;align-items:center;padding:12px 13px;border-bottom:1px solid #eef1f0;cursor:pointer
      }
      .mail-row:last-child{border-bottom:0}
      .mail-row.unread{background:#fff8fb;font-weight:800}
      .mail-row:hover{background:#f8fbfa}
      .mail-from,.mail-subject{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mail-date{font-size:12px;color:#6c7d78;text-align:right}
      .mail-message{padding:18px;border:1px solid #ecd0dd;border-radius:18px;background:#fff}
      .mail-message-head{display:grid;gap:5px;padding-bottom:14px;border-bottom:1px solid #eee}
      .mail-message-head h3{margin:0;color:#4f1733}
      .mail-message-body{padding:18px 0;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.mail-html-frame-wrap{padding:14px 0}.mail-html-frame{display:block;width:100%;min-height:620px;border:1px solid #ead6df;border-radius:14px;background:#fff}.mail-plain-note{padding:10px 12px;margin:10px 0;background:#fff8fb;border:1px solid #f0dce5;border-radius:10px;color:#715263;font-size:13px}
      
      /* Titan Mail Compose modal - solid Samara card */
      .modal-backdrop .modal-card.employee-modal{
        background:#fffafd!important;
        opacity:1!important;
        border:1px solid #e7bfd2!important;
        border-radius:22px!important;
        box-shadow:0 24px 70px rgba(65,18,44,.28)!important;
        overflow:hidden!important;
      }
      .modal-backdrop .modal-card.employee-modal .modal-head,
      .modal-backdrop .modal-card.employee-modal form{background:#fffafd!important}
      .modal-backdrop .modal-card.employee-modal .mail-compose-grid{padding:18px 20px 6px!important}
      .modal-backdrop .modal-card.employee-modal .modal-actions{padding:12px 20px 20px!important;background:#fffafd!important}
.mail-compose-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .mail-compose-grid .span-2{grid-column:1/-1}
      .mail-security-note{padding:12px 14px;border-radius:14px;background:#edf8f5;color:#0d6757;font-size:13px}
      @media(max-width:900px){
        .mailbox-grid{grid-template-columns:1fr}
        .mail-workspace{grid-template-columns:1fr}
        .mail-folders{grid-template-columns:repeat(4,minmax(0,1fr))}
        .mail-folder-btn{text-align:center}
      }
      @media(max-width:650px){
        .mail-hero{padding:16px}
        .mail-hero h3{font-size:22px}
        .mail-folders{grid-template-columns:repeat(2,minmax(0,1fr))}
        .mail-row{grid-template-columns:30px 1fr 100px}
        .mail-row .mail-subject{grid-column:2/-1}
        .mail-compose-grid{grid-template-columns:1fr}
        .mail-compose-grid .span-2{grid-column:auto}
      }

      /* Main section symbols */
      .sidebar .nav-heading-button{position:relative!important;padding-left:43px!important}
      .sidebar .nav-heading-button::before{
        position:absolute!important;left:14px!important;top:50%!important;transform:translateY(-50%)!important;
        width:22px!important;text-align:center!important;font-size:18px!important;color:#c21872!important;
      }
      .sidebar .nav-section:nth-of-type(1)>.nav-heading-button::before{content:'⌂'}
      .sidebar .nav-section:nth-of-type(2)>.nav-heading-button::before{content:'⚙'}
      .sidebar .nav-section:nth-of-type(3)>.nav-heading-button::before{content:'♙'}
      .sidebar .nav-section:nth-of-type(4)>.nav-heading-button::before{content:'♥'}
      .sidebar .nav-section:nth-of-type(5)>.nav-heading-button::before{content:'▦'}
      .sidebar .nav-section:nth-of-type(6)>.nav-heading-button::before{content:'♥'}
      .sidebar .nav-section:nth-of-type(7)>.nav-heading-button::before{content:'♨'}
      .sidebar .nav-section:nth-of-type(8)>.nav-heading-button::before{content:'₹'}
      .sidebar .nav-section.expanded>.nav-heading-button::before{color:#fff!important}

      /* Number badge on a dedicated strip, away from all labels */
      .admission-numbered-row{padding-top:60px!important;overflow:visible!important}
      .admission-numbered-row::before{
        content:'';position:absolute!important;left:0!important;right:0!important;top:0!important;height:48px!important;
        border-bottom:1px solid #f0d7e3!important;background:linear-gradient(90deg,#fffafd 0%,#fff2f8 100%)!important;
        border-radius:14px 14px 0 0!important;z-index:0!important;
      }
      .admission-row-number{
        left:14px!important;top:9px!important;z-index:4!important;
        box-shadow:0 4px 10px rgba(176,18,100,.18)!important;
      }
      .admission-numbered-row>.field,
      .admission-numbered-row>.medication-time-field,
      .admission-numbered-row>.btn{position:relative!important;z-index:1!important}
      .admission-numbered-row label{padding-left:0!important;margin-left:0!important}

      .sidebar-footer .user-chip{background:linear-gradient(120deg,#b01264,#d93679)!important;color:#fff!important}
      .sidebar-footer .btn.btn-secondary.full{background:rgba(255,255,255,.94)!important;color:#7a1247!important}


      /* Adaptive sidebar contrast and clinical icon system */
      .sidebar{
        --sidebar-dark-text:#3f2a38;
        --sidebar-mid-text:#67143f;
        --sidebar-light-text:#ffffff;
      }

      /* Top/light gradient area: dark text */
      .sidebar .nav-section:nth-of-type(-n+4)>.nav-heading-button,
      .sidebar .nav-section:nth-of-type(-n+4)>.nav-heading-button *{
        color:var(--sidebar-dark-text)!important;
      }
      .sidebar .nav-section:nth-of-type(-n+4)>.nav-heading-button::before{
        color:#c21872!important;
      }

      /* Lower/darker gradient area: white text */
      .sidebar .nav-section:nth-of-type(n+5)>.nav-heading-button,
      .sidebar .nav-section:nth-of-type(n+5)>.nav-heading-button *{
        color:var(--sidebar-light-text)!important;
        text-shadow:0 1px 2px rgba(83,10,46,.26)!important;
      }
      .sidebar .nav-section:nth-of-type(n+5)>.nav-heading-button::before{
        color:#ffffff!important;
      }

      /* Expanded section always uses white text for contrast */
      .sidebar .nav-section.expanded>.nav-heading-button,
      .sidebar .nav-section.expanded>.nav-heading-button *,
      .sidebar .nav-section.expanded>.nav-heading-button::before{
        color:#ffffff!important;
      }

      /* Remove every legacy bullet/circle from submenu rows */
      .sidebar .nav-submenu button::after,
      .sidebar .nav-submenu button span::before,
      .sidebar .nav-submenu button span::after{
        display:none!important;
        content:none!important;
      }
      .sidebar .nav-submenu button::before{
        content:'•'!important;
        background:transparent!important;
        border:0!important;
        border-radius:0!important;
        box-shadow:none!important;
        font-family:'Segoe UI Symbol','Arial Unicode MS',sans-serif!important;
      }

      /* Innovative submenu icons */
      .sidebar .nav-submenu button[data-nav='Dashboard']::before{content:'⌂'!important;color:#d81b72!important}
      .sidebar .nav-submenu button[data-nav='Notifications']::before{content:'🔔'!important;color:#f59b23!important}
      .sidebar .nav-submenu button[data-nav='Enquiries']::before{content:'☎'!important;color:#b01264!important}
      .sidebar .nav-submenu button[data-nav='Admissions']::before{content:'✚'!important;color:#e03a7c!important}
      .sidebar .nav-submenu button[data-nav='Patients']::before{content:'♟'!important;color:#b01264!important}
      .sidebar .nav-submenu button[data-nav='Discharge']::before{content:'⇥'!important;color:#f36a4c!important}
      .sidebar .nav-submenu button[data-nav='Documents']::before{content:'□'!important;color:#8f4bc1!important}
      .sidebar .nav-submenu button[data-nav='Reports']::before,
      .sidebar .nav-submenu button[data-nav='Intelligent Reports']::before{content:'▦'!important;color:#8f4bc1!important}
      .sidebar .nav-submenu button[data-nav='Medication Errors']::before{content:'⚠'!important;color:#f36a4c!important}
      .sidebar .nav-submenu button[data-nav='Recovery Timeline']::before{content:'↺'!important;color:#1da1a8!important}

      .sidebar .nav-submenu button[data-nav='Clinical Dashboard']::before{content:'♩'!important;color:#28b9a5!important}
      .sidebar .nav-submenu button[data-nav='Clinical Alerts']::before{content:'🔔'!important;color:#f6b72d!important}
      .sidebar .nav-submenu button[data-nav='Shift Tasks']::before{content:'☷'!important;color:#7967d8!important}
      .sidebar .nav-submenu button[data-nav='Daily Care']::before{content:'♡'!important;color:#ff8aac!important}
      .sidebar .nav-submenu button[data-nav='Vital Signs']::before{content:'∿'!important;color:#6ab7ff!important;font-size:25px!important}
      .sidebar .nav-submenu button[data-nav='Medicines']::before{content:'◐'!important;color:#23c6ae!important}
      .sidebar .nav-submenu button[data-nav='Physiotherapy']::before{content:'⚘'!important;color:#26c7b2!important}
      .sidebar .nav-submenu button[data-nav='Special Nurse']::before{content:'✥'!important;color:#00b9e8!important}
      .sidebar .nav-submenu button[data-nav='Shift Handover']::before{content:'⇄'!important;color:#9b7ee8!important}
      .sidebar .nav-submenu button[data-nav='Incidents']::before{content:'⚠'!important;color:#ff7a45!important}

      .sidebar .nav-submenu button[data-nav='Food & Diet']::before{content:'♨'!important;color:#f6b72d!important}
      .sidebar .nav-submenu button[data-nav='Accounts Dashboard']::before{content:'₹'!important;color:#f6b72d!important}
      .sidebar .nav-submenu button[data-nav='Charge Approvals']::before{content:'✓'!important;color:#43c59e!important}
      .sidebar .nav-submenu button[data-nav='Payments']::before{content:'₹'!important;color:#f6b72d!important}
      .sidebar .nav-submenu button[data-nav='Patient Ledger']::before{content:'≡'!important;color:#d21f70!important}
      .sidebar .nav-submenu button[data-nav='Final Billing']::before{content:'▧'!important;color:#f59b23!important}
      .sidebar .nav-submenu button[data-nav='Discharge Clearance']::before{content:'⇥'!important;color:#f36a4c!important}
      .sidebar .nav-submenu button[data-nav='Refunds']::before{content:'↶'!important;color:#37b3c8!important}
      .sidebar .nav-submenu button[data-nav='Accounts Reports']::before{content:'▦'!important;color:#8f4bc1!important}

      /* Expanded submenu sits over a darker translucent panel */
      .sidebar .nav-section.expanded .nav-submenu{
        margin:7px 7px 10px!important;
        padding:8px 5px!important;
        border-radius:16px!important;
        background:linear-gradient(180deg,rgba(189,31,106,.18),rgba(124,17,72,.36))!important;
        border:1px solid rgba(255,255,255,.15)!important;
        backdrop-filter:blur(4px)!important;
      }
      .sidebar .nav-section.expanded .nav-submenu button{
        color:#ffffff!important;
        font-weight:700!important;
        text-shadow:0 1px 2px rgba(70,8,38,.28)!important;
        border-bottom:1px solid rgba(255,255,255,.12)!important;
      }
      .sidebar .nav-section.expanded .nav-submenu button:last-child{
        border-bottom:0!important;
      }
      .sidebar .nav-section.expanded .nav-submenu button:hover,
      .sidebar .nav-section.expanded .nav-submenu button:focus{
        background:rgba(255,255,255,.12)!important;
      }
      .sidebar .nav-section.expanded .nav-submenu button.active{
        background:rgba(255,255,255,.38)!important;
        color:#5d1039!important;
        text-shadow:none!important;
        box-shadow:inset 3px 0 0 #f6b72d!important;
      }

      /* Admission submenu is on a light pink panel, therefore use dark text. */
      .sidebar .nav-section:nth-of-type(-n+4).expanded .nav-submenu button{
        color:#3f2a38!important;
        text-shadow:none!important;
      }
      .sidebar .nav-section:nth-of-type(-n+4).expanded .nav-submenu button:hover,
      .sidebar .nav-section:nth-of-type(-n+4).expanded .nav-submenu button:focus{
        background:rgba(255,255,255,.34)!important;
      }


      /* Final distinct icon palette matching the approved sidebar design */
      .sidebar .nav-submenu button::before{
        opacity:1!important;
        filter:none!important;
        text-shadow:none!important;
        font-weight:900!important;
      }

      .sidebar .nav-submenu button[data-nav='Clinical Dashboard']::before{
        content:'⚕'!important;
        color:#1fc7b6!important;
      }
      .sidebar .nav-submenu button[data-nav='Clinical Alerts']::before{
        content:'●'!important;
        color:#f6b72d!important;
        font-size:17px!important;
        box-shadow:0 0 0 3px rgba(246,183,45,.12)!important;
        border-radius:50%!important;
      }
      .sidebar .nav-submenu button[data-nav='Shift Tasks']::before{
        content:'☷'!important;
        color:#6f63d9!important;
      }
      .sidebar .nav-submenu button[data-nav='Daily Care']::before{
        content:'♡'!important;
        color:#f58bb0!important;
      }
      .sidebar .nav-submenu button[data-nav='Vital Signs']::before{
        content:'∿'!important;
        color:#67b8ff!important;
        font-size:25px!important;
      }
      .sidebar .nav-submenu button[data-nav='Medicines']::before{
        content:'◐'!important;
        color:#2bc7b0!important;
      }
      .sidebar .nav-submenu button[data-nav='Physiotherapy']::before{
        content:'⚘'!important;
        color:#21c6b0!important;
      }
      .sidebar .nav-submenu button[data-nav='Special Nurse']::before{
        content:'✣'!important;
        color:#08b9e8!important;
      }
      .sidebar .nav-submenu button[data-nav='Shift Handover']::before{
        content:'⇄'!important;
        color:#9b7ce8!important;
      }
      .sidebar .nav-submenu button[data-nav='Incidents']::before{
        content:'⚠'!important;
        color:#ff8a48!important;
      }

      .sidebar .nav-submenu button[data-nav='Enquiries']::before{
        content:'☎'!important;
        color:#e81f77!important;
      }
      .sidebar .nav-submenu button[data-nav='Admissions']::before{
        content:'✚'!important;
        color:#df1d73!important;
      }
      .sidebar .nav-submenu button[data-nav='Patients']::before{
        content:'♟'!important;
        color:#d61a70!important;
      }
      .sidebar .nav-submenu button[data-nav='Discharge']::before{
        content:'⇥'!important;
        color:#ee4e70!important;
      }
      .sidebar .nav-submenu button[data-nav='Documents']::before{
        content:'□'!important;
        color:#d61a70!important;
      }

      .sidebar .nav-submenu button[data-nav='Accounts Dashboard']::before{
        content:'₹'!important;
        color:#3bcf85!important;
      }
      .sidebar .nav-submenu button[data-nav='Charge Approvals']::before{
        content:'✓'!important;
        color:#3bcf85!important;
      }
      .sidebar .nav-submenu button[data-nav='Payments']::before{
        content:'₹'!important;
        color:#f6b72d!important;
      }
      .sidebar .nav-submenu button[data-nav='Final Billing']::before{
        content:'▧'!important;
        color:#f59b23!important;
      }
      .sidebar .nav-submenu button[data-nav='Discharge Clearance']::before{
        content:'⇥'!important;
        color:#f36a4c!important;
      }
      .sidebar .nav-submenu button[data-nav='Refunds']::before{
        content:'↶'!important;
        color:#31b8cd!important;
      }
      .sidebar .nav-submenu button[data-nav='Accounts Reports']::before{
        content:'▦'!important;
        color:#8e62d8!important;
      }

      /* Keep icon colours visible even when row is active or hovered */
      .sidebar .nav-submenu button.active::before,
      .sidebar .nav-submenu button:hover::before,
      .sidebar .nav-submenu button:focus::before{
        opacity:1!important;
        filter:none!important;
      }


      /* Replace font glyphs with clean line-art SVG icons */
      .sidebar .nav-submenu button::before{
        content:''!important;
        width:24px!important;
        height:24px!important;
        background-color:currentColor!important;
        -webkit-mask-repeat:no-repeat!important;
        mask-repeat:no-repeat!important;
        -webkit-mask-position:center!important;
        mask-position:center!important;
        -webkit-mask-size:22px 22px!important;
        mask-size:22px 22px!important;
        border:0!important;
        box-shadow:none!important;
      }

      .sidebar .nav-submenu button[data-nav='Clinical Dashboard']::before{
        color:#21c6b3!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3v5a6 6 0 0 0 12 0V3'/%3E%3Cpath d='M8 3h-2M18 3h-2'/%3E%3Ccircle cx='18' cy='14' r='3'/%3E%3Cpath d='M18 17v4'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3v5a6 6 0 0 0 12 0V3'/%3E%3Cpath d='M8 3h-2M18 3h-2'/%3E%3Ccircle cx='18' cy='14' r='3'/%3E%3Cpath d='M18 17v4'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Clinical Alerts']::before{
        color:#f6b72d!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'/%3E%3Cpath d='M13.73 21a2 2 0 0 1-3.46 0'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'/%3E%3Cpath d='M13.73 21a2 2 0 0 1-3.46 0'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Shift Tasks']::before{
        color:#7769dc!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='4' width='14' height='17' rx='2'/%3E%3Cpath d='M9 4V2h6v2M8 9h8M8 13h8M8 17h5'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='4' width='14' height='17' rx='2'/%3E%3Cpath d='M9 4V2h6v2M8 9h8M8 13h8M8 17h5'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Daily Care']::before{
        color:#ff8eb2!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z'/%3E%3Cpath d='M4 19c2-1 3-1 5 0M20 19c-2-1-3-1-5 0'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z'/%3E%3Cpath d='M4 19c2-1 3-1 5 0M20 19c-2-1-3-1-5 0'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Vital Signs']::before{
        color:#6ab8ff!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12h4l2-5 4 10 2-5h6'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12h4l2-5 4 10 2-5h6'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Medicines']::before{
        color:#27c5ad!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m10.5 20.5 10-10a4.24 4.24 0 0 0-6-6l-10 10a4.24 4.24 0 0 0 6 6Z'/%3E%3Cpath d='m8.5 8.5 7 7'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m10.5 20.5 10-10a4.24 4.24 0 0 0-6-6l-10 10a4.24 4.24 0 0 0 6 6Z'/%3E%3Cpath d='m8.5 8.5 7 7'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Physiotherapy']::before{
        color:#24c8b3!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='4' r='2'/%3E%3Cpath d='m7 21 3-7-2-3M17 21l-3-7 2-3M8 11l4-3 4 3'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='4' r='2'/%3E%3Cpath d='m7 21 3-7-2-3M17 21l-3-7 2-3M8 11l4-3 4 3'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Special Nurse']::before{
        color:#08bae8!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 7h16v10H4z'/%3E%3Cpath d='M9 7V5h6v2M12 10v4M10 12h4'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 7h16v10H4z'/%3E%3Cpath d='M9 7V5h6v2M12 10v4M10 12h4'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Shift Handover']::before{
        color:#9b7ce8!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 7h11l-3-3M17 17H6l3 3M18 7v4M6 17v-4'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 7h11l-3-3M17 17H6l3 3M18 7v4M6 17v-4'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Incidents']::before{
        color:#ff8748!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3 9 16H3L12 3Z'/%3E%3Cpath d='M12 9v4M12 16h.01'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3 9 16H3L12 3Z'/%3E%3Cpath d='M12 9v4M12 16h.01'/%3E%3C/svg%3E")!important;
      }

      /* Replace the remaining green scrollbar with the Samara gradient */
      .sidebar-scrollbar,
      .sidebar .custom-scrollbar,
      .sidebar::-webkit-scrollbar-thumb,
      .side-nav::-webkit-scrollbar-thumb{
        background:linear-gradient(180deg,#7a1247 0%,#b01264 55%,#e03a7c 100%)!important;
        border-color:transparent!important;
      }
      .sidebar::-webkit-scrollbar-track,
      .side-nav::-webkit-scrollbar-track{
        background:rgba(176,18,100,.08)!important;
      }


      /* Complete SVG icon coverage for every remaining sidebar submenu item */
      .sidebar .nav-submenu button[data-nav='Dashboard']::before{
        color:#d91b72!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 11 12 3l9 8'/%3E%3Cpath d='M5 10v10h14V10M9 20v-6h6v6'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 11 12 3l9 8'/%3E%3Cpath d='M5 10v10h14V10M9 20v-6h6v6'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Notifications']::before{
        color:#f59b23!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'/%3E%3Cpath d='M13.73 21a2 2 0 0 1-3.46 0'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'/%3E%3Cpath d='M13.73 21a2 2 0 0 1-3.46 0'/%3E%3C/svg%3E")!important;
      }

      .sidebar .nav-submenu button[data-nav='HR Dashboard']::before{content:''!important;color:#a20f59!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='7' height='7' rx='1'/%3E%3Crect x='14' y='3' width='7' height='7' rx='1'/%3E%3Crect x='3' y='14' width='7' height='7' rx='1'/%3E%3Crect x='14' y='14' width='7' height='7' rx='1'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='7' height='7' rx='1'/%3E%3Crect x='14' y='3' width='7' height='7' rx='1'/%3E%3Crect x='3' y='14' width='7' height='7' rx='1'/%3E%3Crect x='14' y='14' width='7' height='7' rx='1'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Duty Assignment']::before{content:''!important;color:#c21872!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 11l2 2 4-4'/%3E%3Crect x='4' y='4' width='16' height='16' rx='2'/%3E%3Cpath d='M8 2v4M16 2v4M4 8h16'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 11l2 2 4-4'/%3E%3Crect x='4' y='4' width='16' height='16' rx='2'/%3E%3Cpath d='M8 2v4M16 2v4M4 8h16'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Duty Calendar']::before{content:''!important;color:#9b4bc1!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M8 3v4M16 3v4M3 10h18M8 14h2M14 14h2M8 18h2M14 18h2'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M8 3v4M16 3v4M3 10h18M8 14h2M14 14h2M8 18h2M14 18h2'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Staff Leave Calendar']::before{content:''!important;color:#e06a9f!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M8 3v4M16 3v4M3 10h18M8 15l2 2 5-5'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M8 3v4M16 3v4M3 10h18M8 15l2 2 5-5'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='My Leave & Permission']::before{content:''!important;color:#d38a24!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z'/%3E%3Cpath d='M4 21a8 8 0 0 1 16 0M17 7h5M19.5 4.5v5'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z'/%3E%3Cpath d='M4 21a8 8 0 0 1 16 0M17 7h5M19.5 4.5v5'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Leave Approvals']::before{content:''!important;color:#2eaa72!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 11l2 2 5-5'/%3E%3Cpath d='M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 11l2 2 5-5'/%3E%3Cpath d='M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Career Applications']::before{content:''!important;color:#c31c67!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='3' width='16' height='18' rx='2'/%3E%3Cpath d='M8 8h8M8 12h8M8 16h5'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='3' width='16' height='18' rx='2'/%3E%3Cpath d='M8 8h8M8 12h8M8 16h5'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Interviews']::before{content:''!important;color:#7d1748!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 3h8M9 3v3h6V3M5 8h14v12H5zM9 12h6M9 16h4'/%3E%3C/svg%3E")!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 3h8M9 3v3h6V3M5 8h14v12H5zM9 12h6M9 16h4'/%3E%3C/svg%3E")!important}
      .sidebar .nav-submenu button[data-nav='Employees']::before{
        color:#c21872!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='9' cy='8' r='4'/%3E%3Cpath d='M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M17 13a6 6 0 0 1 5 6'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='9' cy='8' r='4'/%3E%3Cpath d='M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M17 13a6 6 0 0 1 5 6'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Rooms']::before{
        color:#b91668!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 21V4h12v17M15 9h6v12M7 8h4M7 12h4M7 16h4M18 13v4'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 21V4h12v17M15 9h6v12M7 8h4M7 12h4M7 16h4M18 13v4'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Care Packages']::before{
        color:#ca176f!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='6' width='18' height='14' rx='2'/%3E%3Cpath d='M8 6V4h8v2M12 10v6M9 13h6'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='6' width='18' height='14' rx='2'/%3E%3Cpath d='M8 6V4h8v2M12 10v6M9 13h6'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Form Field Settings']::before{
        color:#b81263!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6h16M4 12h16M4 18h16'/%3E%3Ccircle cx='8' cy='6' r='2'/%3E%3Ccircle cx='15' cy='12' r='2'/%3E%3Ccircle cx='10' cy='18' r='2'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6h16M4 12h16M4 18h16'/%3E%3Ccircle cx='8' cy='6' r='2'/%3E%3Ccircle cx='15' cy='12' r='2'/%3E%3Ccircle cx='10' cy='18' r='2'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Audit Trail']::before{
        color:#9b1459!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7v5l3 2M4 4l3 1-1 3'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7v5l3 2M4 4l3 1-1 3'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Alert Settings']::before{
        color:#e24c7f!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'/%3E%3Cpath d='M10 21h4M12 4V2'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'/%3E%3Cpath d='M10 21h4M12 4V2'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='System Maintenance']::before{
        color:#7f164b!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-3-3 3-3Z'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-3-3 3-3Z'/%3E%3C/svg%3E")!important;
      }

      .sidebar .nav-submenu button[data-nav='Enquiries']::before{
        color:#e51d73!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.45 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92Z'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.45 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92Z'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav="Director's Office"]::before{
        color:#b01264!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='M3 9h18M9 21V9'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='M3 9h18M9 21V9'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Enquiries & Feedback']::before{
        color:#e51d73!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Admissions']::before{
        color:#d91b72!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='3' width='16' height='18' rx='2'/%3E%3Cpath d='M9 3V1h6v2M12 8v6M9 11h6'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='3' width='16' height='18' rx='2'/%3E%3Cpath d='M9 3V1h6v2M12 8v6M9 11h6'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Patients']::before{
        color:#d4186c!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='8' cy='8' r='4'/%3E%3Cpath d='M2 21a6 6 0 0 1 12 0M16 11a4 4 0 1 0 0-8M17 14a5 5 0 0 1 5 5'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='8' cy='8' r='4'/%3E%3Cpath d='M2 21a6 6 0 0 1 12 0M16 11a4 4 0 1 0 0-8M17 14a5 5 0 0 1 5 5'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Discharge']::before{
        color:#ef4e72!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 17l5-5-5-5M15 12H3M14 3h7v18h-7'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 17l5-5-5-5M15 12H3M14 3h7v18h-7'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Documents']::before{
        color:#c71667!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7h6l2 2h10v10H3z'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7h6l2 2h10v10H3z'/%3E%3C/svg%3E")!important;
      }

      .sidebar .nav-submenu button[data-nav='Reports']::before{
        color:#9a4cc5!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20V10M10 20V4M16 20v-7M22 20V7'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20V10M10 20V4M16 20v-7M22 20V7'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Intelligent Reports']::before{
        color:#8d4bc2!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20V10M10 20V4M16 20v-7M22 20V7'/%3E%3Cpath d='m3 5 2 2 3-4'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20V10M10 20V4M16 20v-7M22 20V7'/%3E%3Cpath d='m3 5 2 2 3-4'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Medication Errors']::before{
        color:#f36a4c!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m10.5 20.5 10-10a4.24 4.24 0 0 0-6-6l-10 10a4.24 4.24 0 0 0 6 6Z'/%3E%3Cpath d='m8.5 8.5 7 7M18 17l3 3M21 17l-3 3'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m10.5 20.5 10-10a4.24 4.24 0 0 0-6-6l-10 10a4.24 4.24 0 0 0 6 6Z'/%3E%3Cpath d='m8.5 8.5 7 7M18 17l3 3M21 17l-3 3'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Recovery Timeline']::before{
        color:#2ab6b8!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12a9 9 0 1 0 3-6.7L3 8'/%3E%3Cpath d='M3 3v5h5M12 7v5l3 2'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12a9 9 0 1 0 3-6.7L3 8'/%3E%3Cpath d='M3 3v5h5M12 7v5l3 2'/%3E%3C/svg%3E")!important;
      }

      .sidebar .nav-submenu button[data-nav='Accounts Dashboard']::before{
        color:#39c981!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20V10M10 20V4M16 20v-7M22 20V7'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20V10M10 20V4M16 20v-7M22 20V7'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Charge Approvals']::before{
        color:#43c59e!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='16' rx='2'/%3E%3Cpath d='m8 12 3 3 5-6'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='16' rx='2'/%3E%3Cpath d='m8 12 3 3 5-6'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Payments']::before{
        color:#f6b72d!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='5' width='20' height='14' rx='2'/%3E%3Cpath d='M2 10h20M6 15h4'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='5' width='20' height='14' rx='2'/%3E%3Cpath d='M2 10h20M6 15h4'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Final Billing']::before{
        color:#f59b23!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 2h12v20l-3-2-3 2-3-2-3 2V2Z'/%3E%3Cpath d='M9 7h6M9 11h6M9 15h4'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 2h12v20l-3-2-3 2-3-2-3 2V2Z'/%3E%3Cpath d='M9 7h6M9 11h6M9 15h4'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Discharge Clearance']::before{
        color:#f36a4c!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='14' height='16' rx='2'/%3E%3Cpath d='m8 12 2 2 4-4M17 12h4M19 10l2 2-2 2'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='14' height='16' rx='2'/%3E%3Cpath d='m8 12 2 2 4-4M17 12h4M19 10l2 2-2 2'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Refunds']::before{
        color:#31b8cd!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7v6h6M21 17v-6h-6M20 8a8 8 0 0 0-13-3L3 9M4 16a8 8 0 0 0 13 3l4-4'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7v6h6M21 17v-6h-6M20 8a8 8 0 0 0-13-3L3 9M4 16a8 8 0 0 0 13 3l4-4'/%3E%3C/svg%3E")!important;
      }
      .sidebar .nav-submenu button[data-nav='Accounts Reports']::before{
        color:#8f62d8!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20V10M10 20V4M16 20v-7M22 20V7'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 20V10M10 20V4M16 20v-7M22 20V7'/%3E%3C/svg%3E")!important;
      }

      /* Footer contrast adapts to the darkest gradient */
      .sidebar-footer .user-chip,
      .sidebar-footer .user-chip *{
        color:#ffffff!important;
      }
      .sidebar-footer .btn.btn-secondary.full,
      .sidebar-footer .btn.btn-secondary.full *{
        color:#7a1247!important;
      }
    `;
    document.head.appendChild(style);
  })();
