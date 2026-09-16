/* Food vendor template payload builder. No network calls; server must authorise
   the actor and load the immutable order/receipt snapshot before using this. */
(function(root){
  'use strict';
  const LOGO='https://samaraassistedliving.com/assets/samara-logo.png';
  const TEMPLATES={order:{name:'samara_food_order',count:8},modification:{name:'samara_food_modification',count:9},receipt:{name:'samara_food_receipt',count:9}};
  function payload(kind,recipient,values){
    const spec=TEMPLATES[kind];
    if(!spec)throw new Error('Unknown food message type');
    const to=String(recipient||'').replace(/[^0-9]/g,'');
    if(!/^[1-9][0-9]{7,14}$/.test(to))throw new Error('Valid international recipient required');
    if(!Array.isArray(values)||values.length!==spec.count)throw new Error('Incorrect template parameter count');
    const params=values.map(value=>{
      const text=String(value??'').replace(/\s+/g,' ').trim();
      if(!text)throw new Error('All template parameters are required; use None where appropriate');
      return text;
    });
    if(params.join(' ').length>2500)throw new Error('Order message is too long; shorten the item summary and instructions');
    return {messaging_product:'whatsapp',to,type:'template',template:{name:spec.name,language:{code:'en'},components:[{type:'header',parameters:[{type:'image',image:{link:LOGO}}]},{type:'body',parameters:params.map(text=>({type:'text',text}))}]}};
  }
  const api=Object.freeze({LOGO,TEMPLATES,payload});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SamaraFoodTemplates=api;
})(typeof globalThis!=='undefined'?globalThis:this);
