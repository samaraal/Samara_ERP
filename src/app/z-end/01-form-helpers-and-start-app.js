  function textareaSimple(label,value,onChange){return h('div',{className:'field'},h('label',null,label),h('textarea',{className:'textarea',value,onChange:e=>onChange(e.target.value)}))}
  function num(v){return v===''||v==null?null:Number(v)}

  function textareaField(label,key,form,setForm,cls=''){return h('div',{className:`field ${cls}`,key},h('label',null,label),h('textarea',{className:'textarea',value:form[key]||'',onChange:e=>setForm({...form,[key]:e.target.value})}))}
  function miniInput(label,value,onChange,required=false,type='text'){return h('div',{className:'field'},h('label',null,label),h('input',{type,value:value||'',required,onChange:e=>onChange(e.target.value)}))}
  function miniSelect(label,value,options,onChange){return h('div',{className:'field'},h('label',null,label),h('select',{value,onChange:e=>onChange(e.target.value)},options.map(x=>h('option',{key:x,value:x},x))))}

  function field(label,key,form,setForm,required,type='text'){const inputProps={type,value:form[key],required,onChange:e=>setForm({...form,[key]:e.target.value})};if(type==='date'&&key==='admission_date')inputProps.max=todayISOIndia();return h('div',{className:'field',key},h('label',null,label),h('input',inputProps))}
  function selectField(label,key,form,setForm,options){return h('div',{className:'field',key},h('label',null,label),h('select',{value:form[key],onChange:e=>setForm({...form,[key]:e.target.value})},options.map(x=>h('option',{key:x,value:x},x))))}

  ReactDOM.createRoot(document.getElementById('root')).render(h(PageErrorBoundary,{variant:'app',page:'App'},h(App)));
  window.SAMARA_APP_STARTED=true;
})();
