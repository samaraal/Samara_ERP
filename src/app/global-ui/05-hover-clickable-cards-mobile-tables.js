  function GlobalSmartHover(){
    React.useEffect(()=>{
      if(!window.matchMedia||!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return;
      const tip=document.createElement('div');
      tip.className='samara-smart-hover';
      tip.setAttribute('role','tooltip');
      document.body.appendChild(tip);
      let active=null;
      const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
      const detailsFor=el=>{
        if(!el||el.classList?.contains('topbar-clinical-alert-badge'))return '';
        const explicitRaw=String(el.getAttribute?.('data-hover-info')||'').trim();
        if(explicitRaw)return explicitRaw;
        const aria=clean(el.getAttribute?.('aria-label'));
        const title=clean(el.getAttribute?.('title'));
        if(title&&title!==clean(el.textContent))return title;
        if(aria&&aria!==clean(el.textContent))return aria;
        const nav=clean(el.getAttribute?.('data-nav'));
        if(nav)return `Open ${nav} for full information`;
        const secondary=el.querySelector?.('small,p,.sub,.subtitle,.card-subtitle,.metric-label');
        const text=clean(el.textContent);
        if(secondary&&text.length>12)return text.slice(0,260);
        return '';
      };
      const position=(el)=>{
        const r=el.getBoundingClientRect();
        const w=Math.min(390,window.innerWidth-28);
        tip.style.maxWidth=`${w}px`;
        tip.style.left=`${Math.max(12,Math.min(window.innerWidth-w-12,r.left+r.width/2-w/2))}px`;
        const above=r.top>150;
        tip.style.top=above?'auto':`${Math.min(window.innerHeight-80,r.bottom+10)}px`;
        tip.style.bottom=above?`${Math.max(12,window.innerHeight-r.top+10)}px`:'auto';
      };
      const show=(el)=>{
        const info=detailsFor(el);if(!info)return;
        active=el;
        tip.textContent='';
        const lines=info.split(/\n/).map(line=>line.trim()).filter(Boolean);
        if(lines.length>1){
          lines.forEach(line=>{
            const match=line.match(/^([^:]+):\s*(.*)$/);
            const item=document.createElement('div');item.className='samara-smart-hover-line';
            if(match){
              const label=document.createElement('span');label.className='samara-smart-hover-label';label.textContent=match[1].trim();
              const colon=document.createElement('span');colon.className='samara-smart-hover-colon';colon.textContent=':';
              const value=document.createElement('span');value.className='samara-smart-hover-value';value.textContent=match[2];
              item.append(label,colon,value);
            }else item.textContent=line;
            tip.appendChild(item);
          });
        }else tip.textContent=info;
        tip.classList.add('show');position(el);
      };
      const hide=()=>{active=null;tip.classList.remove('show')};
      const targetFrom=e=>e.target?.closest?.('[data-hover-info],[data-nav],button[aria-label],button[title],a[aria-label],a[title],button:has(small),button:has(p),[role="button"][aria-label]');
      const over=e=>{const el=targetFrom(e);if(el&&el!==active)show(el)};
      const out=e=>{if(active&&!active.contains(e.relatedTarget))hide()};
      const focus=e=>{const el=targetFrom(e);if(el)show(el)};
      const blur=e=>{if(active&&!active.contains(e.relatedTarget))hide()};
      document.addEventListener('mouseover',over,true);document.addEventListener('mouseout',out,true);
      document.addEventListener('focusin',focus,true);document.addEventListener('focusout',blur,true);
      return()=>{document.removeEventListener('mouseover',over,true);document.removeEventListener('mouseout',out,true);document.removeEventListener('focusin',focus,true);document.removeEventListener('focusout',blur,true);tip.remove()};
    },[]);
    return null;
  }

  function GlobalNavigableSurfaces(){
    React.useEffect(()=>{
      if(document.getElementById('samara-global-navigation-style'))return;
      const style=document.createElement('style');style.id='samara-global-navigation-style';style.textContent=`
        tr.samara-row-navigable,.card.samara-card-navigable{cursor:pointer!important;touch-action:manipulation}
        tr.samara-row-navigable:hover,.card.samara-card-navigable:hover{background:#fff7fb!important}
        tr.samara-row-navigable:active,.card.samara-card-navigable:active{background:#fdeaf3!important}
      `;document.head.appendChild(style);
      const interactive='button,a,input,select,textarea,label,[role="button"],[contenteditable="true"]';
      const actionsIn=container=>[...container.querySelectorAll('button:not([disabled]),a[href]')].filter(node=>node.offsetParent!==null);
      const enhance=()=>{
        document.querySelectorAll('table tbody tr').forEach(row=>{
          if(row.matches('[role="button"]'))return;
          if(actionsIn(row).length===1)row.classList.add('samara-row-navigable');else row.classList.remove('samara-row-navigable');
        });
        document.querySelectorAll('.card:not(button):not(a)').forEach(card=>{
          if(card.closest('.modal,.modal-backdrop,form')||card.querySelector('input,select,textarea'))return;
          if(actionsIn(card).length===1)card.classList.add('samara-card-navigable');else card.classList.remove('samara-card-navigable');
        });
      };
      const activate=e=>{
        if(e.target.closest(interactive))return;
        const row=e.target.closest('tr.samara-row-navigable');
        const card=!row&&e.target.closest('.card.samara-card-navigable');
        const target=row||card;if(!target)return;
        const action=actionsIn(target)[0];if(action){e.preventDefault();action.click()}
      };
      const observer=new MutationObserver(()=>window.requestAnimationFrame(enhance));observer.observe(document.body,{childList:true,subtree:true});
      document.addEventListener('click',activate);enhance();
      return()=>{observer.disconnect();document.removeEventListener('click',activate)};
    },[]);
    return null;
  }

  function GlobalMobileTableAdapter(){
    React.useEffect(()=>{
      if(!document.getElementById('samara-mobile-card-table-style')){
        const style=document.createElement('style');style.id='samara-mobile-card-table-style';style.textContent=`
          @media (max-width:760px){
            .samara-mobile-card-wrap{overflow-x:hidden!important;width:100%!important;max-width:100%!important;border:0!important;background:transparent!important}
            table.samara-mobile-card-table{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;border:0!important;background:transparent!important}
            table.samara-mobile-card-table thead{display:none!important}
            table.samara-mobile-card-table tbody{display:block!important;width:100%!important}
            table.samara-mobile-card-table tr.samara-mobile-card-row{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:8px 12px!important;width:100%!important;max-width:100%!important;margin:0 0 12px!important;padding:12px!important;box-sizing:border-box!important;border:1px solid #ead2dd!important;border-radius:14px!important;background:#fff!important;box-shadow:0 3px 10px rgba(109,24,61,.05)!important}
            table.samara-mobile-card-table tr.samara-mobile-card-row>td{display:block!important;width:auto!important;min-width:0!important;max-width:100%!important;padding:0!important;border:0!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important;box-sizing:border-box!important}
            table.samara-mobile-card-table tr.samara-mobile-card-row>td::before{content:attr(data-mobile-label);display:block!important;margin-bottom:2px!important;color:#856675!important;font-size:11px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.02em!important}
            table.samara-mobile-card-table tr.samara-mobile-card-row>td.samara-mobile-wide-cell{grid-column:1/-1!important}
            table.samara-mobile-card-table tr.samara-mobile-card-row>td.empty{grid-column:1/-1!important;text-align:center!important;padding:12px!important}
            table.samara-mobile-card-table .employee-actions{min-width:0!important;width:100%!important;max-width:100%!important}
            table.samara-mobile-card-table button{max-width:100%!important}
          }
        `;document.head.appendChild(style);
      }
      const media=window.matchMedia?.('(max-width:760px)');
      let frame=0;
      const excluded='table.fv-history-table,table.rooms-table,table.patient-master-table,table.employee-master-table,table.medication-log-table,table.vitals-log-table';
      const wideLabels=/action|details|description|remarks|instruction|patient|resident|employee|applicant|medicine|item|service|address|message|reason|particular|source|reference|request|decision/i;
      const enhanceTable=table=>{
        if(!table?.matches?.('table')||table.matches(excluded)||table.closest('.rooms-desktop-table-wrap'))return;
        const headRows=table.tHead?.rows||[];
        const headerRow=headRows.length?headRows[headRows.length-1]:null;
        const headers=headerRow?[...headerRow.cells].map(th=>String(th.textContent||'').replace(/\s+/g,' ').trim()):[];
        if(!headers.length)return;
        table.classList.add('samara-mobile-card-table');
        table.closest('.table-wrap,.report-detail-table-wrap,.ledger-table-wrap,.patient-med-table-wrap')?.classList.add('samara-mobile-card-wrap');
        [...table.tBodies].flatMap(body=>[...body.rows]).forEach(row=>{
          const cells=[...row.children].filter(cell=>cell.tagName==='TD');
          if(!cells.length)return;
          row.classList.add('samara-mobile-card-row');
          cells.forEach((cell,index)=>{
            const existing=cell.getAttribute('data-label');
            const label=String(existing||headers[index]||'Details').replace(/\s+/g,' ').trim();
            cell.setAttribute('data-mobile-label',label);
            if(wideLabels.test(label)||Number(cell.getAttribute('colspan')||1)>1)cell.classList.add('samara-mobile-wide-cell');
            else cell.classList.remove('samara-mobile-wide-cell');
          });
        });
      };
      const scan=()=>{
        cancelAnimationFrame(frame);
        frame=requestAnimationFrame(()=>{
          if(media&&!media.matches)return;
          document.querySelectorAll('.content table,.modal table,.patient-file-backdrop table').forEach(enhanceTable);
        });
      };
      const observer=new MutationObserver(scan);
      observer.observe(document.body,{childList:true,subtree:true});
      window.addEventListener('resize',scan,{passive:true});
      scan();
      return()=>{observer.disconnect();window.removeEventListener('resize',scan);cancelAnimationFrame(frame)};
    },[]);
    return null;
  }

