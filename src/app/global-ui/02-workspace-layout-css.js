  const ensureCleanWorkspaceLayout = () => {
    if(document.getElementById('samara-clean-workspace-layout'))return;
    const style=document.createElement('style');
    style.id='samara-clean-workspace-layout';
    style.textContent=`
      /* Remove redundant bottom navigation and old fallback navigation rows. */
      .mobile-nav,
      .samara-bottom-actions,
      .legacy-nav,
      .legacy-navigation,
      .fallback-nav,
      .quick-nav,
      .bottom-nav,
      .bottom-navigation,
      .workspace-tabs,
      .role-tabs,
      .module-tabs,
      .old-menu,
      .prototype-nav{
        display:none!important;
      }

      /* Hide plain browser-style button clusters left by the old prototype. */
      .app-shell > main > div:last-child > button,
      .app-main > div:last-child > button,
      .content-area > div:last-child > button{
        display:none!important;
      }

      /* Remove the duplicate compact role/menu panel that appears beneath page content. */
      .app-shell main .legacy-role-panel,
      .app-shell main .legacy-workspace-panel,
      .app-shell main .legacy-user-panel{
        display:none!important;
      }

      /* Keep only the proper application header, sidebar and workspace. */
      .app-main,
      main,
      .content-area{
        padding-bottom:24px!important;
      }

      /* Refine the page header while preserving the existing current-page title. */
      .topbar,
      .app-header,
      .page-header{
        min-height:70px;
      }

      .topbar .brand-mini,
      .app-header .brand-mini{
        display:none!important;
      }

      /* The alert sound remains the only floating action. */
      .alert-sound-button,
      .enable-alert-sound,
      [data-alert-sound]{
        z-index:90!important;
      }

      /* v2.8.22 — iPhone / Android mobile workspace polish */
      .mobile-bottom-nav{display:none!important}

      @media(max-width:760px){
        html,body,#root,.app{max-width:100%;overflow-x:hidden}
        body{padding-bottom:env(safe-area-inset-bottom)}
        input,select,textarea{font-size:16px!important}
        .btn,button,input,select{min-height:44px}
        .main{width:100%;min-width:0!important}

        .topbar{
          height:auto!important;
          min-height:0!important;
          display:grid!important;
          grid-template-columns:48px minmax(0,1fr) auto!important;
          grid-template-rows:auto auto auto!important;
          align-items:center!important;
          gap:8px 10px!important;
          padding:10px 12px 11px!important;
          position:sticky!important;
          top:0!important;
          z-index:80!important;
          background:rgba(255,255,255,.97)!important;
          backdrop-filter:blur(14px)!important;
        }
        .mobile-brand-header{
          display:flex!important;
          grid-column:1 / -1!important;
          grid-row:1!important;
          align-items:center!important;
          justify-content:flex-start!important;
          gap:12px!important;
          min-width:0!important;
        }
        .mobile-header-brand-logo{width:150px!important;height:58px!important}
        .mobile-brand-header strong{
          font-size:18px!important;
          color:#382333!important;
          white-space:nowrap!important;
        }
        .mobile-home-button{
          grid-column:1!important;grid-row:2!important;
          width:46px!important;height:44px!important;
          border:0!important;border-radius:14px!important;
          background:#f6f2f4!important;color:#5d1039!important;
          font-size:20px!important;
        }
        .topbar h2{
          grid-column:2!important;grid-row:2!important;
          margin:0!important;
          font-size:clamp(24px,7vw,31px)!important;
          line-height:1.1!important;
          min-width:0!important;
          overflow:hidden!important;
          text-overflow:ellipsis!important;
          white-space:nowrap!important;
        }
        .topbar>.badge{
          grid-column:3!important;grid-row:2!important;
          justify-self:end!important;
          font-size:12px!important;
          padding:7px 10px!important;
        }
        .global-search{
          grid-column:1 / -1!important;
          grid-row:3!important;
          order:unset!important;
          width:100%!important;
          max-width:none!important;
          margin:2px 0 0!important;
        }
        .global-search input{min-height:48px!important;border-radius:14px!important}

        .mobile-menu{
          position:relative!important;
          top:auto!important;
          z-index:20!important;
          display:flex!important;
          align-items:center!important;
          gap:10px!important;
          padding:10px 12px!important;
          background:linear-gradient(100deg,#5d1039,#8d1452,#b01264)!important;
          color:#fff!important;
        }
        .mobile-menu label{
          flex:0 0 auto!important;
          font-size:13px!important;
          font-weight:900!important;
          letter-spacing:.08em!important;
          color:#fff!important;
        }
        .mobile-menu select{
          min-width:0!important;
          flex:1!important;
          min-height:48px!important;
          padding:9px 12px!important;
          border-radius:13px!important;
          border:1px solid rgba(255,255,255,.24)!important;
          background:rgba(255,255,255,.12)!important;
          color:#fff!important;
          font-weight:800!important;
        }
        .mobile-menu option,.mobile-menu optgroup{background:#fff!important;color:#382333!important}

        .content{
          padding:14px!important;
          padding-bottom:calc(96px + env(safe-area-inset-bottom))!important;
        }
        .panel,.card,.section-card{border-radius:18px!important}
        .stats{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
        .stat{min-width:0!important;padding:16px!important}
        .stat strong{font-size:30px!important}
        .table-wrap{
          max-width:100%!important;
          overflow-x:auto!important;
          -webkit-overflow-scrolling:touch!important;
          border-radius:14px!important;
        }
        .table{min-width:680px!important}

        .modal-backdrop{
          padding:8px!important;
          align-items:stretch!important;
        }
        .modal{
          width:100%!important;
          max-width:none!important;
          max-height:calc(100dvh - 16px)!important;
          margin:0!important;
          padding:18px!important;
          border-radius:20px!important;
          overscroll-behavior:contain!important;
          -webkit-overflow-scrolling:touch!important;
        }
        .modal-grid{grid-template-columns:1fr!important}
        .panel-head{align-items:flex-start!important}
        .actions{flex-wrap:wrap!important}
        .actions>.btn{flex:1 1 140px!important}

        .mobile-bottom-nav{
          display:grid!important;
          position:fixed!important;
          left:0!important;right:0!important;bottom:0!important;
          grid-template-columns:repeat(5,minmax(0,1fr))!important;
          gap:2px!important;
          min-height:68px!important;
          padding:6px 7px calc(6px + env(safe-area-inset-bottom))!important;
          background:rgba(255,255,255,.98)!important;
          border-top:1px solid #ead0de!important;
          box-shadow:0 -10px 30px rgba(93,16,57,.12)!important;
          z-index:110!important;
          backdrop-filter:blur(15px)!important;
        }
        .mobile-bottom-nav button{
          min-width:0!important;
          min-height:54px!important;
          padding:5px 2px!important;
          border:0!important;
          border-radius:12px!important;
          background:transparent!important;
          color:#6d4c60!important;
          display:flex!important;
          flex-direction:column!important;
          align-items:center!important;
          justify-content:center!important;
          gap:2px!important;
          font-size:10.5px!important;
          font-weight:800!important;
        }
        .mobile-bottom-nav button.active{
          background:#fdeaf3!important;
          color:#a30f5a!important;
        }
        .mobile-nav-icon{font-size:20px!important;line-height:1!important}

        .mobile-drawer-layer{
          position:fixed!important;inset:0!important;
          z-index:150!important;
          background:rgba(53,24,42,.42)!important;
          display:flex!important;
          justify-content:flex-end!important;
        }
        .mobile-nav-drawer{
          width:min(88vw,380px)!important;
          height:100dvh!important;
          background:#fff!important;
          display:flex!important;
          flex-direction:column!important;
          box-shadow:-18px 0 40px rgba(53,24,42,.18)!important;
          padding-top:env(safe-area-inset-top)!important;
        }
        .mobile-drawer-head{
          display:flex!important;align-items:center!important;justify-content:space-between!important;
          gap:12px!important;padding:12px 14px!important;border-bottom:1px solid #ead0de!important;
        }
        .mobile-drawer-brand{display:flex!important;align-items:center!important;gap:10px!important}
        .mobile-drawer-brand strong,.mobile-drawer-brand small{display:block!important}
        .mobile-drawer-brand small{font-size:11px!important;color:#7b6673!important}
        .mobile-drawer-close{
          width:44px!important;height:44px!important;border:0!important;border-radius:50%!important;
          background:#f8edf2!important;color:#5d1039!important;font-size:26px!important;
        }
        .mobile-drawer-user{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:12px 16px!important}
        .mobile-drawer-home{margin:0 14px 8px!important}
        .mobile-drawer-scroll{flex:1!important;overflow-y:auto!important;padding:0 12px 10px!important}
        .mobile-drawer-section h4{margin:15px 6px 6px!important;color:#8a124f!important}
        .mobile-drawer-section button{
          width:100%!important;text-align:left!important;border:0!important;
          border-radius:11px!important;background:transparent!important;
          padding:11px 12px!important;color:#493443!important;
        }
        .mobile-drawer-section button.active{background:#fdeaf3!important;color:#9f1057!important;font-weight:850!important}
        .mobile-drawer-footer{
          padding:10px 14px calc(10px + env(safe-area-inset-bottom))!important;
          border-top:1px solid #ead0de!important;
        }
        .mobile-signout-button{
          width:100%!important;border:0!important;border-radius:13px!important;
          background:#f8edf2!important;color:#7a1247!important;font-weight:850!important;
        }
      }

      @media(min-width:761px) and (max-width:1100px){
        .content{padding:20px!important}
        .stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .modal{width:min(900px,96vw)!important}
      }



      /* v2.8.27 — Patient File photo must never expand to the uploaded image's natural size. */
      .patient-master-modal .patient-master-header{
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:16px!important;
      }
      .patient-master-modal .patient-head{
        display:flex!important;
        align-items:center!important;
        gap:14px!important;
        min-width:0!important;
        flex:1 1 auto!important;
      }
      .patient-master-modal .patient-photo{
        width:92px!important;
        height:108px!important;
        min-width:92px!important;
        max-width:92px!important;
        min-height:108px!important;
        max-height:108px!important;
        object-fit:cover!important;
        object-position:center!important;
        border-radius:16px!important;
        border:1px solid #ead0de!important;
        display:block!important;
        flex:0 0 92px!important;
        overflow:hidden!important;
      }
      .patient-master-modal .patient-photo-placeholder{
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        background:linear-gradient(145deg,#fff0f6,#f8dfe9)!important;
        color:#7a1247!important;
        font-weight:900!important;
      }
      .patient-master-modal .patient-head>div:last-child{
        min-width:0!important;
        flex:1 1 auto!important;
      }
      .patient-master-modal .patient-head h3{
        margin:0 0 3px!important;
      }

      @media(max-width:760px){
        .patient-master-modal .patient-master-header{
          align-items:flex-start!important;
          gap:10px!important;
        }
        .patient-master-modal .patient-head{
          gap:10px!important;
        }
        .patient-master-modal .patient-photo{
          width:72px!important;
          height:84px!important;
          min-width:72px!important;
          max-width:72px!important;
          min-height:84px!important;
          max-height:84px!important;
          flex-basis:72px!important;
          border-radius:14px!important;
        }
        .patient-master-modal .patient-head h3{
          font-size:20px!important;
          line-height:1.15!important;
        }
        .patient-master-modal .patient-head small{
          font-size:12px!important;
          line-height:1.35!important;
          display:block!important;
        }
        .patient-master-modal .employee-actions{
          flex:0 0 auto!important;
        }
      }

      /* v2.10.16 — Mobile Patient File must open above the sticky app chrome.
         The previous modal was rendered underneath the topbar/module selector on iPhone,
         hiding the Back button, resident header and first tabs. */
      @media(max-width:760px){
        .patient-file-backdrop{
          position:fixed!important;
          inset:0!important;
          z-index:180!important;
          padding:calc(8px + env(safe-area-inset-top)) 8px calc(8px + env(safe-area-inset-bottom))!important;
          align-items:stretch!important;
          background:rgba(47,26,40,.28)!important;
          overflow:hidden!important;
        }
        .patient-file-backdrop .patient-master-modal{
          position:relative!important;
          width:100%!important;
          height:100%!important;
          max-height:none!important;
          margin:0!important;
          padding:12px 14px calc(18px + env(safe-area-inset-bottom))!important;
          overflow-y:auto!important;
          overflow-x:hidden!important;
          -webkit-overflow-scrolling:touch!important;
          overscroll-behavior:contain!important;
          scroll-padding-top:88px!important;
          border-radius:20px!important;
        }
        .patient-file-backdrop .patient-mobile-back{
          display:inline-flex!important;
          align-items:center!important;
          justify-content:flex-start!important;
          position:sticky!important;
          top:0!important;
          z-index:15!important;
          width:auto!important;
          min-height:44px!important;
          margin:0 0 10px!important;
          padding:8px 12px!important;
          border:1px solid #ead0de!important;
          border-radius:12px!important;
          background:rgba(255,255,255,.97)!important;
          color:#761146!important;
          font-weight:850!important;
          box-shadow:0 4px 12px rgba(93,16,57,.08)!important;
          backdrop-filter:blur(10px)!important;
        }
        .patient-file-backdrop .patient-master-header{
          scroll-margin-top:66px!important;
        }
        .patient-file-backdrop .patient-tab-bar{
          position:sticky!important;
          top:54px!important;
          z-index:12!important;
          margin:8px -14px 12px!important;
          padding:8px 14px!important;
          overflow-x:auto!important;
          overflow-y:hidden!important;
          white-space:nowrap!important;
          -webkit-overflow-scrolling:touch!important;
          background:rgba(255,255,255,.97)!important;
          border-top:1px solid #f3e2e9!important;
          border-bottom:1px solid #ead0de!important;
          box-shadow:0 6px 14px rgba(93,16,57,.06)!important;
          scrollbar-width:none!important;
        }
        .patient-file-backdrop .patient-tab-bar::-webkit-scrollbar{display:none!important}
        .patient-file-backdrop .section-card,
        .patient-file-backdrop .tabs-grid,
        .patient-file-backdrop [id]{scroll-margin-top:122px!important}

        /* v2.10.16 — When a Patient File is open, give it the whole mobile screen.
           Hiding the underlying sticky app chrome avoids iOS stacking-context overlap. */
        .app:has(.patient-file-backdrop) .topbar,
        .app:has(.patient-file-backdrop) .mobile-menu,
        .app:has(.patient-file-backdrop) .mobile-bottom-nav,
        .app:has(.patient-file-backdrop) .alert-sound-button,
        .app:has(.patient-file-backdrop) .enable-alert-sound,
        .app:has(.patient-file-backdrop) [data-alert-sound]{
          display:none!important;
        }
        .app:has(.patient-file-backdrop) .content{
          padding:0!important;
        }
        .patient-file-backdrop{
          z-index:2147483000!important;
          background:#f8f4f6!important;
          padding:calc(6px + env(safe-area-inset-top)) 6px calc(6px + env(safe-area-inset-bottom))!important;
        }
        .patient-file-backdrop .patient-master-modal{
          border-radius:16px!important;
          padding:10px 12px calc(18px + env(safe-area-inset-bottom))!important;
        }
        .patient-file-backdrop .patient-mobile-back{
          top:0!important;
          margin-bottom:8px!important;
        }
        .patient-file-backdrop .patient-tab-bar{
          top:52px!important;
          margin:8px -12px 12px!important;
          padding:8px 12px!important;
        }

        /* Cleaner label : value layout for mobile Patient Overview. */
        .patient-file-backdrop .patient-overview-fields{
          display:grid!important;
          gap:0!important;
        }
        .patient-file-backdrop .patient-overview-field{
          display:grid!important;
          grid-template-columns:minmax(104px,38%) 14px minmax(0,1fr)!important;
          column-gap:8px!important;
          align-items:start!important;
          padding:9px 0!important;
          margin:0!important;
          border-bottom:1px solid #f0e2e8!important;
          line-height:1.4!important;
        }
        .patient-file-backdrop .patient-overview-field:last-child{border-bottom:0!important}
        .patient-file-backdrop .patient-overview-label{
          color:#705a66!important;
          font-weight:700!important;
          min-width:0!important;
        }
        .patient-file-backdrop .patient-overview-colon{
          color:#705a66!important;
          text-align:center!important;
          font-weight:700!important;
        }
        .patient-file-backdrop .patient-overview-value{
          min-width:0!important;
          color:#34232d!important;
          font-weight:500!important;
          overflow-wrap:anywhere!important;
          word-break:normal!important;
        }
        .patient-file-backdrop .patient-overview-field.patient-overview-address .patient-overview-value{
          white-space:normal!important;
        }


        /* v2.10.16 — Consistent clean label : value rows in every Patient File expansion. */
        .patient-file-backdrop .patient-detail-fields{
          display:grid!important;
          gap:0!important;
          width:100%!important;
          margin-top:8px!important;
        }
        .patient-file-backdrop .patient-detail-field{
          display:grid!important;
          grid-template-columns:minmax(118px,38%) 14px minmax(0,1fr)!important;
          column-gap:8px!important;
          align-items:start!important;
          padding:9px 0!important;
          margin:0!important;
          border-bottom:1px solid #f0e2e8!important;
          line-height:1.4!important;
        }
        .patient-file-backdrop .patient-detail-field:last-child{border-bottom:0!important}
        .patient-file-backdrop .patient-detail-label{
          color:#705a66!important;
          font-weight:750!important;
          min-width:0!important;
        }
        .patient-file-backdrop .patient-detail-colon{
          color:#705a66!important;
          text-align:center!important;
          font-weight:750!important;
        }
        .patient-file-backdrop .patient-detail-value{
          min-width:0!important;
          color:#34232d!important;
          font-weight:500!important;
          overflow-wrap:anywhere!important;
          word-break:normal!important;
        }
        .patient-file-backdrop .patient-detail-secondary .patient-detail-label,
        .patient-file-backdrop .patient-detail-secondary .patient-detail-colon,
        .patient-file-backdrop .patient-detail-secondary .patient-detail-value{
          color:#746a70!important;
          font-size:.92em!important;
          font-weight:500!important;
        }
        @media(max-width:640px){
          .patient-file-backdrop .patient-tab-content .section-card{
            padding:14px 16px!important;
          }
          .patient-file-backdrop .patient-tab-content .panel-head{
            gap:10px!important;
            align-items:flex-start!important;
          }
          .patient-file-backdrop .patient-tab-content .panel-head>.actions{
            width:100%!important;
            display:grid!important;
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
            gap:8px!important;
          }
          .patient-file-backdrop .patient-tab-content .panel-head>.actions .btn{
            min-width:0!important;
            width:100%!important;
            white-space:normal!important;
          }
          .patient-file-backdrop .patient-tab-content .section-card>.actions{
            display:grid!important;
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
            gap:8px!important;
          }
          .patient-file-backdrop .patient-tab-content .section-card>.actions .btn{
            width:100%!important;
            min-width:0!important;
            white-space:normal!important;
          }
          .patient-file-backdrop .timeline-item{
            min-width:0!important;
            overflow-wrap:anywhere!important;
          }
        }


        /* v2.10.16 — Family Portal action buttons remain fully visible on mobile. */
        @media(max-width:640px){
          .patient-file-backdrop .family-portal-login-head,
          .patient-file-backdrop .daily-report-whatsapp-head{
            display:flex!important;
            flex-direction:column!important;
            align-items:stretch!important;
            gap:12px!important;
          }
          .patient-file-backdrop .family-portal-login-head>div:first-child,
          .patient-file-backdrop .daily-report-whatsapp-head>div:first-child{
            width:100%!important;
            min-width:0!important;
          }
          .patient-file-backdrop .family-portal-login-actions{
            width:100%!important;
            display:grid!important;
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
            gap:8px!important;
            align-items:stretch!important;
          }
          .patient-file-backdrop .family-portal-login-actions .btn{
            width:100%!important;
            min-width:0!important;
            min-height:48px!important;
            padding:10px 8px!important;
            font-size:14px!important;
            line-height:1.2!important;
            white-space:normal!important;
            overflow:visible!important;
            word-break:normal!important;
            overflow-wrap:normal!important;
            display:flex!important;
            align-items:center!important;
            justify-content:center!important;
            text-align:center!important;
          }
          .patient-file-backdrop .family-portal-login-actions .btn:nth-child(3){
            grid-column:1 / -1!important;
          }
          .patient-file-backdrop .daily-report-whatsapp-actions{
            width:100%!important;
            display:grid!important;
            grid-template-columns:minmax(0,1fr) minmax(110px,auto)!important;
            gap:8px!important;
            align-items:stretch!important;
          }
          .patient-file-backdrop .daily-report-whatsapp-actions .pill{
            width:100%!important;
            min-width:0!important;
            min-height:46px!important;
            padding:10px 12px!important;
            display:flex!important;
            align-items:center!important;
            justify-content:center!important;
            white-space:nowrap!important;
            overflow:visible!important;
            font-size:14px!important;
          }
          .patient-file-backdrop .daily-report-whatsapp-actions .btn{
            width:100%!important;
            min-width:110px!important;
            min-height:46px!important;
            padding:10px 12px!important;
            white-space:nowrap!important;
            font-size:14px!important;
            line-height:1.2!important;
            display:flex!important;
            align-items:center!important;
            justify-content:center!important;
          }
          .patient-file-backdrop .family-portal-login-head small,
          .patient-file-backdrop .daily-report-whatsapp-head small{
            display:block!important;
            margin-top:5px!important;
            line-height:1.45!important;
          }
        }

        /* v2.10.16 — Keep the resident photo and identity fully visible above header actions. */
        .patient-file-backdrop .patient-master-header{
          display:flex!important;
          flex-direction:column!important;
          align-items:stretch!important;
          gap:12px!important;
          width:100%!important;
          overflow:visible!important;
        }
        .patient-file-backdrop .patient-head{
          order:1!important;
          display:grid!important;
          grid-template-columns:84px minmax(0,1fr)!important;
          align-items:center!important;
          gap:12px!important;
          width:100%!important;
          min-height:96px!important;
          overflow:visible!important;
        }
        .patient-file-backdrop .patient-photo,
        .patient-file-backdrop .patient-photo-placeholder{
          width:84px!important;
          height:96px!important;
          min-width:84px!important;
          max-width:84px!important;
          min-height:96px!important;
          max-height:96px!important;
          flex:none!important;
          margin:0!important;
          position:relative!important;
          z-index:1!important;
          object-fit:cover!important;
          object-position:center!important;
        }
        .patient-file-backdrop .patient-head>div:last-child{
          min-width:0!important;
          width:100%!important;
          overflow:visible!important;
        }
        .patient-file-backdrop .patient-head h3{
          display:block!important;
          margin:0 0 4px!important;
          font-size:21px!important;
          line-height:1.18!important;
          white-space:normal!important;
          overflow:visible!important;
        }
        .patient-file-backdrop .patient-head small{
          display:block!important;
          white-space:normal!important;
          overflow:visible!important;
        }
        .patient-file-backdrop .patient-header-badges{
          display:flex!important;
          flex-wrap:wrap!important;
          gap:5px!important;
          margin-top:6px!important;
        }
        .patient-file-backdrop .patient-master-header>.employee-actions{
          order:2!important;
          position:static!important;
          width:100%!important;
          display:grid!important;
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:8px!important;
          margin:0!important;
          padding:0!important;
          transform:none!important;
        }
        .patient-file-backdrop .patient-master-header>.employee-actions .btn{
          width:100%!important;
          min-width:0!important;
          min-height:44px!important;
          margin:0!important;
          white-space:normal!important;
          line-height:1.2!important;
        }
        .patient-file-backdrop .patient-master-header>.employee-actions .btn:nth-of-type(3){
          grid-column:1 / -1!important;
        }
        .patient-file-backdrop .patient-master-header>.employee-actions .close{
          display:none!important;
        }
      }

      /* v2.8.25 — Guaranteed save/failure confirmation.
         Rendered above modals, mobile nav and page navigation. */
      .samara-save-confirmation{
        position:fixed!important;
        inset:0!important;
        z-index:2147483647!important;
        display:flex!important;
        align-items:flex-start!important;
        justify-content:center!important;
        padding:calc(18px + env(safe-area-inset-top)) 14px 18px!important;
        pointer-events:none!important;
        background:transparent!important;
      }
      .samara-save-confirmation-card{
        width:min(560px,calc(100vw - 28px))!important;
        min-height:92px!important;
        display:grid!important;
        grid-template-columns:50px minmax(0,1fr) auto!important;
        gap:13px!important;
        align-items:center!important;
        padding:16px!important;
        border-radius:18px!important;
        color:#fff!important;
        box-shadow:0 18px 48px rgba(0,0,0,.28)!important;
        pointer-events:auto!important;
        animation:samaraConfirmationIn .22s ease-out!important;
      }
      .samara-save-confirmation.success .samara-save-confirmation-card{
        background:linear-gradient(110deg,#087343,#11945a,#22a868)!important;
        border:2px solid rgba(255,255,255,.45)!important;
      }
      .samara-save-confirmation.error .samara-save-confirmation-card{
        background:linear-gradient(110deg,#a7192b,#c9293c,#df4050)!important;
        border:2px solid rgba(255,255,255,.45)!important;
      }
      .samara-save-confirmation-icon{
        width:46px!important;
        height:46px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        border-radius:50%!important;
        background:rgba(255,255,255,.20)!important;
        color:#fff!important;
        font-size:29px!important;
        font-weight:950!important;
      }
      .samara-save-confirmation-copy{
        display:grid!important;
        gap:4px!important;
        min-width:0!important;
      }
      .samara-save-confirmation-copy strong{
        color:#fff!important;
        font-size:18px!important;
        line-height:1.15!important;
        font-weight:950!important;
      }
      .samara-save-confirmation-copy span{
        color:#fff!important;
        font-size:14px!important;
        line-height:1.35!important;
        font-weight:650!important;
      }
      .samara-save-confirmation button{
        min-width:54px!important;
        min-height:42px!important;
        padding:8px 12px!important;
        border:1px solid rgba(255,255,255,.55)!important;
        border-radius:12px!important;
        background:rgba(255,255,255,.16)!important;
        color:#fff!important;
        font-size:14px!important;
        font-weight:900!important;
      }
      @keyframes samaraConfirmationIn{
        from{opacity:0;transform:translateY(-18px) scale(.98)}
        to{opacity:1;transform:translateY(0) scale(1)}
      }
      @media(max-width:650px){
        .samara-save-confirmation{
          padding:calc(10px + env(safe-area-inset-top)) 10px 10px!important;
        }
        .samara-save-confirmation-card{
          width:100%!important;
          grid-template-columns:44px minmax(0,1fr) 48px!important;
          gap:10px!important;
          min-height:88px!important;
          padding:13px!important;
          border-radius:16px!important;
        }
        .samara-save-confirmation-icon{width:42px!important;height:42px!important;font-size:26px!important}
        .samara-save-confirmation-copy strong{font-size:16px!important}
        .samara-save-confirmation-copy span{font-size:13px!important}
      }

      /* =========================================================
         v2.8.23 — TRUE MOBILE-FIRST WORKSPACE
         Designed for bedside nursing on iPhone / Android.
         ========================================================= */
      @media(max-width:760px){
        :root{
          --mobile-samara-plum:#5d1039;
          --mobile-samara-wine:#7a1247;
          --mobile-samara-magenta:#b01264;
          --mobile-samara-rose:#df3d7c;
          --mobile-samara-coral:#f36a4c;
          --mobile-samara-pale:#fff4f8;
          --mobile-samara-ink:#382333;
        }

        html,body,#root{
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          overflow-x:hidden!important;
          background:#fff7fa!important;
        }
        .app{
          display:block!important;
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          margin:0!important;
          padding:0!important;
          overflow-x:hidden!important;
        }
        .sidebar{display:none!important}
        .main{
          display:block!important;
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          margin:0!important;
          padding:0!important;
          flex:1 1 100%!important;
          overflow-x:hidden!important;
        }
        .topbar,.mobile-menu,.nursing-mobile-quick-actions,.content{
          width:100%!important;
          max-width:100%!important;
          box-sizing:border-box!important;
        }

        /* Strict Samara brand palette: remove legacy green/blue dashboard styling. */
        .dashboard-banner,.shift-banner,.hero-banner,.clinical-banner,
        .clinical-welcome,.accounts-hero{
          background:
            radial-gradient(circle at 92% 8%,rgba(246,183,45,.20),transparent 22%),
            linear-gradient(120deg,var(--mobile-samara-plum) 0%,var(--mobile-samara-wine) 34%,var(--mobile-samara-magenta) 68%,var(--mobile-samara-rose) 100%)!important;
          color:#fff!important;
          border-color:rgba(176,18,100,.22)!important;
        }
        .dashboard-banner *,.shift-banner *,.clinical-welcome *{color:#fff!important}
        .dashboard-card,.metric-card,.clinical-metric,.stat{
          background:linear-gradient(145deg,#fff 0%,#fff8fb 100%)!important;
          border-color:#efcfde!important;
          color:var(--mobile-samara-ink)!important;
        }
        .dashboard-card::before,.metric-card::before,.clinical-metric::before,.stat::before{
          background:linear-gradient(90deg,var(--mobile-samara-plum),var(--mobile-samara-magenta),var(--mobile-samara-coral),#f6b72d)!important;
        }
        .dashboard-card a,.dashboard-card button,.metric-card a,.clinical-metric small,
        .mini-link,.text-link,.link{
          color:var(--mobile-samara-magenta)!important;
        }

        /* Compact mobile header: app chrome should not dominate bedside work. */
        .topbar{
          grid-template-columns:44px minmax(0,1fr) auto!important;
          padding:8px 12px 9px!important;
          gap:7px 9px!important;
          border-bottom:1px solid #f0d5e2!important;
          box-shadow:0 5px 18px rgba(93,16,57,.06)!important;
        }
        .mobile-brand-header{
          min-height:36px!important;
          gap:9px!important;
        }
        .mobile-header-brand-logo{width:145px!important;height:56px!important}
        .mobile-brand-header strong{font-size:15px!important}
        .topbar h2{font-size:26px!important}
        .topbar>.badge{
          background:#f9e8f1!important;
          color:var(--mobile-samara-wine)!important;
        }
        .global-search input{min-height:45px!important}

        /* Generic module dropdown stays for management; bedside staff use task shortcuts. */
        .mobile-role-nurse .mobile-menu,
        .mobile-role-caregiver .mobile-menu{
          display:none!important;
        }

        /* Bedside quick actions: always visible, large thumb-friendly controls. */
        .nursing-mobile-quick-actions{
          display:grid!important;
          grid-template-columns:repeat(3,minmax(0,1fr))!important;
          gap:7px!important;
          padding:9px 10px!important;
          position:sticky!important;
          top:132px!important;
          z-index:65!important;
          background:rgba(255,247,250,.97)!important;
          border-bottom:1px solid #efd4e1!important;
          backdrop-filter:blur(12px)!important;
        }
        .nursing-mobile-quick-actions button{
          min-width:0!important;
          min-height:70px!important;
          padding:8px 4px!important;
          border:1px solid #efd0df!important;
          border-radius:16px!important;
          background:#fff!important;
          color:var(--mobile-samara-ink)!important;
          display:flex!important;
          flex-direction:column!important;
          align-items:center!important;
          justify-content:center!important;
          gap:3px!important;
          box-shadow:0 5px 14px rgba(93,16,57,.06)!important;
        }
        .nursing-mobile-quick-actions button.active{
          background:linear-gradient(145deg,#fff0f6,#ffe7f1)!important;
          border-color:#df8bb3!important;
          box-shadow:inset 0 0 0 1px #df8bb3,0 6px 16px rgba(176,18,100,.10)!important;
        }
        .nursing-quick-icon{
          font-size:24px!important;
          line-height:1!important;
          color:var(--mobile-samara-magenta)!important;
        }
        .nursing-quick-copy{min-width:0!important;text-align:center!important}
        .nursing-quick-copy strong{
          display:block!important;
          font-size:11.5px!important;
          line-height:1.15!important;
          color:var(--mobile-samara-wine)!important;
          white-space:nowrap!important;
        }
        .nursing-quick-copy small{
          display:none!important;
        }

        .content{
          padding:12px 10px calc(92px + env(safe-area-inset-bottom))!important;
        }

        /* Dashboard: use the full phone width and reduce wasted whitespace. */
        .stats,.dashboard-grid,.clinical-card-grid{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          gap:10px!important;
          width:100%!important;
        }
        .dashboard-card,.metric-card,.clinical-metric,.stat{
          min-width:0!important;
          min-height:158px!important;
          padding:17px 14px!important;
          border-radius:22px!important;
          overflow:hidden!important;
        }
        .dashboard-card strong,.metric-card strong,.clinical-metric strong,.stat strong{
          font-size:34px!important;
          line-height:1!important;
          color:var(--mobile-samara-plum)!important;
        }
        .dashboard-card span,.metric-card span,.clinical-metric>span:not(.clinical-metric-icon),.stat span{
          font-size:14px!important;
          line-height:1.3!important;
        }
        .dashboard-card small,.metric-card small,.clinical-metric small{
          font-size:11.5px!important;
          line-height:1.3!important;
        }

        .clinical-welcome{
          border-radius:22px!important;
          padding:18px!important;
          margin-bottom:11px!important;
        }
        .clinical-welcome h2{font-size:25px!important;line-height:1.12!important}
        .clinical-welcome p{font-size:14px!important;line-height:1.45!important}
        .clinical-date{font-size:12px!important}

        /* Clinical dashboard is the nurse's home screen, not a desktop dashboard squeezed into a phone. */
        .mobile-role-nurse .clinical-columns,
        .mobile-role-caregiver .clinical-columns{
          grid-template-columns:1fr!important;
          gap:11px!important;
        }
        .clinical-panel{
          padding:14px!important;
          border-radius:20px!important;
        }
        .clinical-work-row{
          display:grid!important;
          grid-template-columns:34px minmax(0,1fr) auto!important;
          gap:9px!important;
          align-items:center!important;
          padding:12px 4px!important;
        }
        .clinical-work-row strong{font-size:14px!important}
        .clinical-work-row small{font-size:12px!important;line-height:1.4!important}
        .clinical-work-row .mini-link{
          min-height:40px!important;
          padding:7px 10px!important;
          border-radius:12px!important;
          background:#fdebf3!important;
          border:0!important;
          font-weight:850!important;
        }

        /* Entry pages: one-column, large fields, sticky action button. */
        .mobile-role-nurse .content form,
        .mobile-role-caregiver .content form{
          width:100%!important;
          max-width:none!important;
        }
        .mobile-role-nurse .form-grid,
        .mobile-role-caregiver .form-grid,
        .mobile-role-nurse .modal-grid,
        .mobile-role-caregiver .modal-grid{
          grid-template-columns:1fr!important;
          gap:11px!important;
        }
        .mobile-role-nurse .field,
        .mobile-role-caregiver .field{
          width:100%!important;
          min-width:0!important;
        }
        .mobile-role-nurse label,
        .mobile-role-caregiver label{
          font-size:14px!important;
          font-weight:800!important;
          color:var(--mobile-samara-ink)!important;
        }
        .mobile-role-nurse input,
        .mobile-role-nurse select,
        .mobile-role-nurse textarea,
        .mobile-role-caregiver input,
        .mobile-role-caregiver select,
        .mobile-role-caregiver textarea{
          width:100%!important;
          min-height:50px!important;
          padding:11px 12px!important;
          border-radius:14px!important;
          border-color:#ddc5d1!important;
          background:#fff!important;
          font-size:16px!important;
        }
        .mobile-role-nurse textarea,
        .mobile-role-caregiver textarea{min-height:92px!important}
        .mobile-role-nurse form>.btn.btn-primary,
        .mobile-role-caregiver form>.btn.btn-primary,
        .mobile-role-nurse .panel form .btn.btn-primary,
        .mobile-role-caregiver .panel form .btn.btn-primary{
          width:100%!important;
          min-height:54px!important;
          margin-top:8px!important;
          border-radius:16px!important;
          background:linear-gradient(100deg,var(--mobile-samara-wine),var(--mobile-samara-magenta),var(--mobile-samara-rose))!important;
          color:#fff!important;
          font-size:16px!important;
          font-weight:900!important;
        }

        /* Patient lists: tables remain usable by touch without shrinking the whole app. */
        .table-wrap{
          width:100%!important;
          max-width:100%!important;
          overflow-x:auto!important;
          border:1px solid #edd1df!important;
          background:#fff!important;
          scrollbar-width:thin;
        }
        .table{min-width:720px!important}
        .table th,.table td{padding:12px 11px!important;font-size:13px!important}
        .table th{
          position:sticky!important;
          top:0!important;
          z-index:2!important;
          background:#fff7fa!important;
          color:var(--mobile-samara-wine)!important;
        }

        /* Bottom navigation: Samara palette and bedside labels. */
        .mobile-bottom-nav{
          background:rgba(255,255,255,.985)!important;
          border-top-color:#ebcddd!important;
        }
        /* MOBILE FULL-SCREEN FORM MODE
           Every real modal / data-entry form gets a clean phone screen.
           App header, search, Module selector, alert-sound bar and bottom nav
           are temporarily hidden until the form is closed. */
        .app:has(.modal-backdrop) .topbar,
        .app:has(.modal-backdrop) .mobile-menu,
        .app:has(.modal-backdrop) .mobile-bottom-nav,
        .app:has(.modal-backdrop) .sound-unlock-button,
        .app:has(.modal-backdrop) .clinical-alert-popup{
          display:none!important;
        }

        /* Do not alter the one intentionally-inline pseudo modal. */
        .modal-backdrop:not([style*="position: static"]){
          position:fixed!important;
          inset:0!important;
          width:100vw!important;
          height:100dvh!important;
          max-width:none!important;
          max-height:none!important;
          z-index:100000!important;
          margin:0!important;
          padding:
            max(8px,env(safe-area-inset-top))
            8px
            max(8px,env(safe-area-inset-bottom))!important;
          background:#fff8fb!important;
          overflow-y:auto!important;
          overflow-x:hidden!important;
          align-items:flex-start!important;
          justify-content:center!important;
          -webkit-overflow-scrolling:touch!important;
        }

        .modal-backdrop:not([style*="position: static"]) > .modal,
        .modal-backdrop:not([style*="position: static"]) > .modal-card,
        .modal-backdrop:not([style*="position: static"]) > form.modal,
        .modal-backdrop:not([style*="position: static"]) > form.card.modal{
          width:100%!important;
          max-width:none!important;
          min-height:calc(100dvh - max(16px,env(safe-area-inset-top)) - max(16px,env(safe-area-inset-bottom)))!important;
          max-height:none!important;
          margin:0!important;
          border-radius:16px!important;
          overflow:visible!important;
          box-shadow:none!important;
        }

        /* Keep the form title and Close button visible while scrolling long forms. */
        .modal-backdrop:not([style*="position: static"]) .panel-head,
        .modal-backdrop:not([style*="position: static"]) .modal-head{
          position:sticky!important;
          top:0!important;
          z-index:15!important;
          margin:-13px -13px 12px!important;
          padding:13px!important;
          background:rgba(255,250,253,.98)!important;
          border-bottom:1px solid #ead1dc!important;
          backdrop-filter:blur(8px)!important;
        }

        .app:has(.modal-backdrop) .content{
          padding-bottom:calc(20px + env(safe-area-inset-bottom))!important;
        }
        .modal{
          padding-bottom:calc(24px + env(safe-area-inset-bottom))!important;
        }
        .modal .actions:last-child,
        .modal > .btn.btn-primary:last-child,
        .modal > button.btn-primary:last-child{
          margin-bottom:calc(8px + env(safe-area-inset-bottom))!important;
        }
        .mobile-bottom-nav button{color:#68485a!important}
        .mobile-bottom-nav button.active{
          background:linear-gradient(145deg,#ffeaf3,#ffdfeC)!important;
          color:var(--mobile-samara-magenta)!important;
        }
        .mobile-nav-icon{color:inherit!important}

        /* Drawer is a mobile app menu, not a desktop sidebar replica. */
        .mobile-nav-drawer{
          width:min(92vw,390px)!important;
          background:linear-gradient(180deg,#fff 0%,#fff7fa 100%)!important;
        }
        .mobile-drawer-head{
          background:linear-gradient(120deg,#fff,#fff3f8)!important;
        }
        .mobile-drawer-section h4{
          padding:7px 8px!important;
          border-radius:10px!important;
          background:#f9e8f1!important;
          color:var(--mobile-samara-wine)!important;
          font-size:12px!important;
          letter-spacing:.06em!important;
          text-transform:uppercase!important;
        }
        .mobile-drawer-section button{
          min-height:46px!important;
          margin:2px 0!important;
          font-size:14px!important;
        }

        /* Remove obsolete alert unlock button from nurse bedside pages; sound can unlock on first interaction. */
        .mobile-role-nurse .sound-unlock-button,
        .mobile-role-caregiver .sound-unlock-button{
          display:none!important;
        }
      }

      @media(max-width:390px){
        .nursing-mobile-quick-actions{gap:5px!important;padding:8px 7px!important}
        .nursing-mobile-quick-actions button{min-height:66px!important;border-radius:14px!important}
        .nursing-quick-copy strong{font-size:10.5px!important}
        .stats,.dashboard-grid,.clinical-card-grid{gap:8px!important}
        .dashboard-card,.metric-card,.clinical-metric,.stat{padding:14px 12px!important}
      }
    `;
    document.head.appendChild(style);
  };


