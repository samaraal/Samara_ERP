  const ensureAccountsWorkspaceStyle = () => {
    if(document.getElementById('samara-accounts-workspace-style'))return;
    const style=document.createElement('style');
    style.id='samara-accounts-workspace-style';
    style.textContent=`
      .accounts-hero{
        display:flex;align-items:center;justify-content:space-between;gap:18px;
        padding:22px;border-radius:20px;
        background:linear-gradient(135deg,#7a1247,#148973);
        color:#fff;box-shadow:0 14px 32px rgba(7,92,77,.18);
      }
      .accounts-hero small{font-weight:800;letter-spacing:.12em;opacity:.78}
      .accounts-hero h3{margin:5px 0 4px;font-size:28px}
      .accounts-hero p{margin:0;opacity:.9}
      .accounts-actions{display:flex;gap:9px;flex-wrap:wrap}
      .accounts-actions .btn{min-height:42px}
      .accounts-kpi-grid{
        display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
        gap:13px;margin:16px 0;
      }
      .accounts-kpi{
        position:relative;overflow:hidden;display:grid;gap:8px;min-height:112px;
        padding:17px;border:1px solid #ead0de;border-radius:17px;background:#fff;
        text-align:left;font:inherit;cursor:pointer;
        transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
      }
      .accounts-kpi:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(7,75,60,.12);border-color:#94cbbb}
      .accounts-kpi span{font-size:13px;color:#68758a}
      .accounts-kpi strong{font-size:27px;line-height:1;color:#102f29}
      .accounts-kpi small{font-size:12px;color:#62736e}
      .accounts-kpi::after{
        content:'';position:absolute;right:-22px;top:-26px;width:92px;height:92px;
        border-radius:50%;background:var(--soft,#edf7f4)
      }
      .accounts-kpi.green{--soft:#e8f8ef;border-top:4px solid #12a05c}
      .accounts-kpi.blue{--soft:#eaf3ff;border-top:4px solid #2d7dd2}
      .accounts-kpi.orange{--soft:#fff4df;border-top:4px solid #e99a16}
      .accounts-kpi.pink{--soft:#fff0f7;border-top:4px solid #e83e8c}
      .accounts-kpi.red{--soft:#ffeded;border-top:4px solid #df493f}
      .accounts-kpi.purple{--soft:#f3ecff;border-top:4px solid #8655cf}
      .accounts-kpi.teal{--soft:#e6f7f5;border-top:4px solid #168f83}
      .accounts-kpi.blue span,.accounts-kpi.blue strong{color:#123f8c}
      .accounts-kpi.green span,.accounts-kpi.green strong{color:#087c39}
      .accounts-kpi.pink span,.accounts-kpi.pink strong{color:#c2185b}
      .accounts-kpi.red span,.accounts-kpi.red strong{color:#c62828}
      .accounts-dashboard-grid{
        display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);
        gap:14px;margin-top:14px
      }
      .accounts-panel{
        padding:18px;border:1px solid #ead0de;border-radius:18px;background:#fff
      }
      .accounts-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
      .accounts-panel-head h3{margin:0;font-size:20px}
      .accounts-panel-head small{color:#68758a}
      .accounts-bars{display:grid;gap:12px}
      .accounts-bar-row{display:grid;grid-template-columns:125px 1fr 110px;gap:10px;align-items:center}
      .accounts-bar-row span{font-size:13px;color:#53645f}
      .accounts-bar-track{height:13px;border-radius:20px;background:#f7e7ef;overflow:hidden}
      .accounts-bar-fill{height:100%;min-width:3px;border-radius:inherit;background:linear-gradient(90deg,#b01264,#20a786)}
      .accounts-bar-row strong{text-align:right;font-size:13px}
      .accounts-workflow-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:14px;
      }
      .accounts-workflow-card{
        position:relative;
        overflow:hidden;
        display:flex;
        flex-direction:column;
        align-items:flex-start;
        justify-content:space-between;
        min-height:178px;
        padding:18px;
        border:1px solid #ead0de;
        border-top:4px solid var(--workflow-accent,#0f8b73);
        border-radius:18px;
        background:linear-gradient(155deg,#ffffff 0%,var(--workflow-soft,#f2faf7) 100%);
        text-align:left;
        font:inherit;
        cursor:pointer;
        box-shadow:0 8px 20px rgba(12,75,62,.08);
        transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
      }
      .accounts-workflow-card::after{
        content:'';
        position:absolute;
        width:120px;
        height:120px;
        right:-42px;
        top:-46px;
        border-radius:50%;
        background:var(--workflow-orb,rgba(15,139,115,.10));
      }
      .accounts-workflow-card:hover{
        transform:translateY(-3px);
        border-color:var(--workflow-accent,#0f8b73);
        box-shadow:0 15px 30px rgba(12,75,62,.14);
      }
      .accounts-workflow-card.approvals{--workflow-accent:#8756cf;--workflow-soft:#f7f2ff;--workflow-orb:rgba(135,86,207,.12)}
      .accounts-workflow-card.payments{--workflow-accent:#2c7ed3;--workflow-soft:#f1f7ff;--workflow-orb:rgba(44,126,211,.12)}
      .accounts-workflow-card.final-billing{--workflow-accent:#d94c72;--workflow-soft:#fff3f6;--workflow-orb:rgba(217,76,114,.12)}
      .accounts-workflow-card.clearance{--workflow-accent:#e39216;--workflow-soft:#fff8ec;--workflow-orb:rgba(227,146,22,.14)}
      .accounts-workflow-card.refunds{--workflow-accent:#15996a;--workflow-soft:#f0fbf6;--workflow-orb:rgba(21,153,106,.12)}
      .accounts-workflow-card.reports{--workflow-accent:#138d87;--workflow-soft:#eefaf9;--workflow-orb:rgba(19,141,135,.12)}
      .accounts-workflow-top{
        position:relative;
        z-index:1;
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        width:100%;
      }
      .accounts-workflow-icon{
        display:grid;
        place-items:center;
        width:48px;
        height:48px;
        flex:0 0 48px;
        border-radius:14px;
        background:rgba(255,255,255,.78);
        border:1px solid rgba(16,78,65,.08);
        box-shadow:0 7px 16px rgba(9,74,60,.09);
        font-size:23px;
      }
      .accounts-workflow-value{
        position:relative;
        z-index:1;
        display:grid;
        place-items:center;
        min-width:44px;
        min-height:36px;
        padding:5px 10px;
        border-radius:12px;
        background:rgba(255,255,255,.82);
        color:#173d34;
        font-size:19px;
        font-weight:900;
        box-shadow:0 5px 12px rgba(9,74,60,.07);
      }
      .accounts-workflow-body{
        position:relative;
        z-index:1;
        margin-top:18px;
      }
      .accounts-workflow-card strong{
        display:block;
        color:#123d34;
        font-size:18px;
        line-height:1.2;
      }
      .accounts-workflow-card small{
        display:block;
        margin-top:7px;
        color:#64746f;
        line-height:1.45;
        font-size:13px;
      }
      .accounts-workflow-open{
        position:relative;
        z-index:1;
        display:flex;
        align-items:center;
        justify-content:space-between;
        width:100%;
        margin-top:18px;
        padding-top:12px;
        border-top:1px solid rgba(16,78,65,.10);
        color:var(--workflow-accent,#0f8b73);
        font-size:12px;
        font-weight:900;
        letter-spacing:.03em;
        text-transform:uppercase;
      }
      .accounts-status-list{display:grid;gap:9px}
      .accounts-status-item{
        display:flex;justify-content:space-between;gap:12px;padding:11px 12px;
        border-radius:12px;background:#f5f8f7
      }
      .accounts-status-item span{color:#64736f;font-size:13px}
      .accounts-status-item strong{color:#183c34}
      .accounts-report-filters{
        display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px
      }
      .accounts-report-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
      .accounts-report-table{overflow:auto}
      .accounts-report-table table{min-width:920px}
      .accounts-mode-grid{
        display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px
      }
      .accounts-mode-card{padding:13px;border-radius:14px;border:1px solid #ead0de;background:#fff}
      .accounts-mode-card span{display:block;color:#7b6571;font-size:12px}
      .accounts-mode-card strong{display:block;margin-top:7px;font-size:20px}
      @media(max-width:1150px){
        .accounts-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .accounts-dashboard-grid{grid-template-columns:1fr}
        .accounts-workflow-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .accounts-report-filters{grid-template-columns:repeat(2,minmax(0,1fr))}
        .accounts-mode-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
      @media(max-width:700px){
        .accounts-hero{align-items:flex-start;flex-direction:column}
        .accounts-kpi-grid,.accounts-workflow-grid,.accounts-report-filters,.accounts-mode-grid{grid-template-columns:1fr}
        .accounts-bar-row{grid-template-columns:95px 1fr 84px}
      }
      .complete-bill-toolbar{
        display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;
        padding:14px 16px;border:1px solid #ead0de;border-radius:16px;background:#fff
      }
      .complete-bill-toolbar strong{font-size:18px;color:#0b5d4b}
      .complete-bill-toolbar small{display:block;margin-top:4px;color:#6a7975}
      .complete-bill-status{
        display:inline-flex;align-items:center;justify-content:center;padding:7px 12px;
        border-radius:999px;font-size:12px;font-weight:900
      }
      .complete-bill-status.paid{background:#fae7f0;color:#7a1247}
      .complete-bill-status.partial{background:#fff4df;color:#9a6700}
      .complete-bill-status.pending{background:#ffeded;color:#b42318}
      @media print{
        .sidebar,.topbar,.mobile-menu,.sound-unlock-button,.accounts-report-actions,.btn{display:none!important}
        .main,.content{margin:0!important;padding:0!important}
        .accounts-panel,.card{box-shadow:none!important;break-inside:avoid}
      }
    `;
    document.head.appendChild(style);
  };


