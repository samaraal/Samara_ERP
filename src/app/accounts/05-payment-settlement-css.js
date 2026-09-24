  const ensurePaymentSettlementStyle = () => {
    if(document.getElementById('samara-payment-settlement-style'))return;
    const style=document.createElement('style');
    style.id='samara-payment-settlement-style';
    style.textContent=`
      .payment-filter-grid,
      .payment-entry-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
      }
      .payment-quick-buttons{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
        margin-top:10px;
      }
      .payment-summary-grid{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:12px;
        margin:0 0 14px;
      }
      .payment-summary-card{
        min-height:84px;
        display:grid;
        align-content:center;
        gap:7px;
        padding:15px;
        border:1px solid #ead0de;
        border-radius:15px;
        background:#fff;
      }
      .payment-summary-card span{font-size:13px;color:#68758a}
      .payment-summary-card strong{font-size:25px;line-height:1}
      .payment-summary-card.summary-red{
        background:#fff0f0;border-color:#f3b2b2;color:#b42318
      }
      .payment-summary-card.summary-green{
        background:#eaf8ef;border-color:#a8dfbb;color:#087c39
      }
      .payment-summary-card.summary-orange{
        background:#fff6e7;border-color:#f4c475;color:#b54708
      }
      .payment-summary-card.summary-pink{
        background:#fff0f7;border-color:#f3a6c9;color:#c2185b
      }
      .payment-summary-card.summary-blue{
        background:#eef5ff;border-color:#adcbf8;color:#175cd3
      }
      .payment-entry-grid .field{margin:0}
      .payment-submit{min-height:48px}
      @media(max-width:1000px){
        .payment-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:700px){
        .payment-filter-grid,
        .payment-entry-grid,
        .payment-quick-buttons,
        .payment-summary-grid{grid-template-columns:1fr}
      }

      /* Compact Samara online payment UI, aligned with Family Portal payment modal */
      .online-payment-actions{grid-column:2;display:grid;grid-template-columns:1fr;gap:9px;width:min(100%,520px);justify-self:end}.online-payment-actions .btn{min-height:42px;padding:9px 14px}
      .samara-pay-main{background:linear-gradient(100deg,#8d0648,#d91d70)!important;border-color:#b70e5c!important;color:#fff!important}
      .samara-pay-advance{background:#fff0f6!important;border:1px solid #e7a8c5!important;color:#8c174d!important}
      .samara-payment-workspace{margin:14px 0;padding:22px;border:1px solid #efc8da;border-radius:20px;background:linear-gradient(145deg,#fff 0%,#fff8fb 100%);box-shadow:0 10px 30px rgba(107,18,66,.08)}.samara-payment-page{max-width:1040px;margin:18px auto;padding:26px;border:1px solid #efc8da;border-radius:22px;background:linear-gradient(145deg,#fff 0%,#fff8fb 100%);box-shadow:0 12px 34px rgba(107,18,66,.09)}.samara-payment-page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}.samara-payment-page-head h2{margin:3px 0 5px;color:#7f1045;font-size:26px}.samara-payment-page-head p{margin:0;color:#6d5964}
      .samara-payment-workspace-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.samara-payment-workspace-head h2{margin:2px 0 4px;color:#7f1045;font-size:24px}.samara-payment-workspace-head p{margin:0;color:#6d5964}.samara-payment-eyebrow{font-size:11px;font-weight:900;letter-spacing:.12em;color:#c2185b}.samara-payment-back{background:#fff0f6!important;color:#8c174d!important;border:1px solid #efbfd4!important;white-space:nowrap}
      .samara-payment-request-card{max-width:920px;margin:0 auto;border:1px solid #edc5d7;border-radius:18px;background:#fff;padding:20px}.samara-payment-request-summary{display:grid;grid-template-columns:1.4fr 1fr .8fr;gap:12px}.samara-payment-request-summary>div{padding:13px 15px;border-radius:13px;background:#fff5f9}.samara-payment-request-summary span,.samara-payment-link-box span{display:block;font-size:12px;color:#7b6872;margin-bottom:5px}.samara-payment-request-summary strong{color:#432331;font-size:16px}.samara-payment-request-amount{font-size:24px!important;color:#a10c52!important}.samara-payment-link-box{margin:14px 0;padding:12px 15px;border:1px dashed #e2a7c1;border-radius:12px;background:#fffafd}.samara-payment-link-box code{font-family:inherit;color:#6d2146;word-break:break-all}.samara-payment-action-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.samara-payment-request-foot{margin-top:12px;font-size:12px;color:#76636d}.samara-payment-preparing{max-width:620px;margin:20px auto;text-align:center;padding:30px;border:1px solid #efc8da;border-radius:18px;background:#fff}.samara-payment-preparing strong,.samara-payment-preparing span{display:block}.samara-payment-preparing strong{color:#9d0c52;font-size:18px}.samara-payment-preparing span{margin-top:7px;color:#6d5964}
      .samara-payment-modal{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;padding:18px}.samara-payment-backdrop{position:absolute;inset:0;background:rgba(43,24,35,.62);backdrop-filter:blur(3px)}.samara-payment-card{position:relative;z-index:1;width:min(620px,100%);background:linear-gradient(145deg,#fff 0%,#fff9fc 100%);border:1px solid #f0c8da;border-radius:24px;box-shadow:0 28px 80px rgba(71,18,48,.28);padding:26px 30px 28px;color:#402434}.samara-payment-close{position:absolute;right:18px;top:18px;width:42px;height:42px;border:0;border-radius:50%;background:#f2edf0;color:#4b3742;font-size:27px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer}.samara-payment-brand img{width:150px;max-height:70px;object-fit:contain;object-position:left center;margin:0 0 18px}.samara-payment-heading{display:flex;gap:18px;align-items:center;padding-right:38px}.samara-payment-heading h2{margin:0;color:#9d0c52;font-size:1.65rem;line-height:1.15}.samara-payment-heading p{margin:7px 0 0;color:#65515d;font-size:1.05rem;line-height:1.45}.samara-payment-icon{flex:0 0 68px;width:68px;height:68px;border-radius:20px;background:#fde3ee;color:#9d0c52;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:900}.samara-payment-label{display:block;margin:22px 0 8px;font-weight:900;color:#6f143f}.samara-amount-field{display:grid;grid-template-columns:58px 1fr;align-items:center;border:2px solid #e8549b;border-radius:13px;background:#fff;overflow:hidden}.samara-amount-field span{height:58px;display:flex;align-items:center;justify-content:center;background:#fff2f7;color:#6f143f;font-size:1.45rem;font-weight:900}.samara-amount-field input{height:58px;border:0!important;outline:0!important;padding:0 16px!important;font-size:1.65rem!important;font-weight:800;color:#301d27;background:#fff}.samara-payment-note{color:#5f4b56;font-size:1rem;line-height:1.5;margin:14px 0 0}.samara-payment-actions{display:flex;justify-content:space-between;gap:16px;margin-top:26px}.samara-btn{min-height:52px;border-radius:12px;padding:12px 24px;font-size:1.05rem;font-weight:900;cursor:pointer;border:1px solid #efbfd4}.samara-btn.secondary{background:#fff0f6;color:#8c174d}.samara-btn.primary{margin-left:auto;min-width:210px;color:#fff;border-color:#b70e5c;background:linear-gradient(100deg,#8d0648,#e11170);box-shadow:0 10px 22px rgba(177,13,91,.18)}.samara-payment-spinner{width:48px;height:48px;border:5px solid #f2cadc;border-top-color:#c51664;border-radius:50%;margin:0 auto 18px;animation:samara-payment-spin .8s linear infinite}@keyframes samara-payment-spin{to{transform:rotate(360deg)}}
      @media(max-width:800px){.online-payment-actions{grid-column:1;width:100%;grid-template-columns:1fr}.samara-payment-page{margin:10px 0;padding:16px}.samara-payment-page-head{display:block}.samara-payment-request-summary{grid-template-columns:1fr}.samara-payment-action-grid{grid-template-columns:1fr 1fr}.samara-payment-workspace-head{display:block}.samara-payment-back{margin-top:12px}.samara-payment-card{padding:22px 18px 20px}.samara-payment-actions{display:grid;grid-template-columns:1fr 1.35fr}.samara-btn{min-width:0!important;padding:11px 12px}}

      /* v2.8.31 — PRINT/PDF: never print scrollable report containers */
      @media print{
        @page{
          size:A4 landscape;
          margin:10mm;
        }

        html,body,#root,.app,.main,.content{
          width:auto!important;
          max-width:none!important;
          min-width:0!important;
          height:auto!important;
          overflow:visible!important;
          background:#fff!important;
        }

        .sidebar,.topbar,.mobile-menu,.mobile-bottom-nav,.nursing-mobile-quick-actions,
        .accounts-report-actions,.btn,.floating,.sound-unlock-button{
          display:none!important;
        }

        .content{
          padding:0!important;
          margin:0!important;
        }

        .accounts-hero,
        .accounts-panel,
        .panel,
        .section-card{
          box-shadow:none!important;
          break-inside:auto!important;
          page-break-inside:auto!important;
          overflow:visible!important;
          max-height:none!important;
        }

        .table-wrap,
        .accounts-table-wrap,
        .scroll-table,
        .payment-table-wrap{
          width:100%!important;
          max-width:none!important;
          height:auto!important;
          max-height:none!important;
          overflow:visible!important;
          overflow-x:visible!important;
          overflow-y:visible!important;
          border:0!important;
          box-shadow:none!important;
        }

        .table,
        table{
          width:100%!important;
          min-width:0!important;
          max-width:none!important;
          table-layout:auto!important;
          border-collapse:collapse!important;
          font-size:9px!important;
        }

        .table thead,
        table thead{
          display:table-header-group!important;
        }

        .table tfoot,
        table tfoot{
          display:table-footer-group!important;
        }

        .table tr,
        table tr{
          break-inside:avoid!important;
          page-break-inside:avoid!important;
        }

        .table th,
        .table td,
        table th,
        table td{
          white-space:normal!important;
          overflow:visible!important;
          text-overflow:clip!important;
          word-break:break-word!important;
          padding:4px 5px!important;
          vertical-align:top!important;
          position:static!important;
        }

        .accounts-dashboard-grid,
        .accounts-kpi-grid,
        .payment-report-kpis,
        .accounts-mode-grid{
          display:grid!important;
          grid-template-columns:repeat(4,minmax(0,1fr))!important;
          gap:6px!important;
        }

        .accounts-kpi{
          min-height:0!important;
          padding:8px!important;
          break-inside:avoid!important;
        }

        .accounts-kpi strong{
          font-size:16px!important;
        }

        .accounts-panel-head{
          break-after:avoid!important;
          page-break-after:avoid!important;
        }

        .accounts-panel h3,
        .panel h3,
        .section-card h3{
          font-size:14px!important;
        }

        /* Ensure each major report section starts cleanly when required */
        .accounts-dashboard-grid + .accounts-dashboard-grid,
        .accounts-dashboard-grid + .accounts-panel,
        .accounts-panel + .accounts-panel{
          margin-top:8px!important;
        }

        /* Payment report and detailed register can flow across multiple PDF pages */
        .accounts-panel:has(table),
        .panel:has(table){
          page-break-inside:auto!important;
          break-inside:auto!important;
        }
      }

      .payment-report-kpis{
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
      }
      @media(max-width:1100px){
        .payment-report-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      }
      @media(max-width:700px){
        .payment-report-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .accounts-report-actions{display:flex!important;flex-wrap:wrap!important;gap:8px!important}
        .accounts-report-actions .btn{flex:1 1 145px!important}
      }

    
/* Samara payment WhatsApp send status */
.samara-payment-send-status{display:flex;align-items:flex-start;gap:8px;margin:4px 0 12px;padding:11px 14px;border-radius:12px;background:#fff4f8;border:1px solid #f3bfd3;color:#6f1743;font-size:13px;line-height:1.35}
.samara-payment-send-status strong{white-space:nowrap;color:#a20f57}.samara-payment-send-status span{color:#5e4a55}
.samara-payment-send-status.progress{background:#fff8e8;border-color:#f1d58c}.samara-payment-send-status.progress strong{color:#8a5b00}
.samara-payment-send-status.success{background:#edf9f2;border-color:#b9e4ca}.samara-payment-send-status.success strong{color:#137a45}
.samara-payment-send-status.error{background:#fff0f1;border-color:#efc0c5}.samara-payment-send-status.error strong{color:#b42334}
`;
    document.head.appendChild(style);
  };

