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

    `;
    document.head.appendChild(style);
  };

