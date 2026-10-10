(() => {
  'use strict';
  const root=document.querySelector('[data-support]'); if(!root)return;
  const panel=root.querySelector('.support-panel'), launch=root.querySelector('.support-launch'), form=root.querySelector('form'), transcript=root.querySelector('.support-transcript'), error=root.querySelector('.support-error');
  const consentBox=document.querySelector('[data-audience-consent]');
  const privatePath=/^\/(admin|account|sign|login|register|reset|verify)/.test(location.pathname);
  const signal=navigator.globalPrivacyControl===true || navigator.doNotTrack==='1';
  let csrf='',consent=null,hasThread=false,busy=false,seen=0,lastRead=0,ready=false,polling=false,retryKey=null;
  const pageKey=crypto.randomUUID();
  const params=new URLSearchParams(location.search);
  const visit={path:location.pathname,pageKey,source:params.get('utm_source'),medium:params.get('utm_medium'),campaign:params.get('utm_campaign'),referrer:document.referrer,metaClick:params.has('fbclid')};
  async function request(path,data){
    const res=await fetch('/engagement/'+path,{method:data?'POST':'GET',credentials:'same-origin',headers:{Accept:'application/json',...(data?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},...(data?{body:JSON.stringify(data)}:{})});
    if(res.status===204)return {};
    const result=await res.json().catch(()=>({message:'Connection interrupted. Please refresh and try again.'}));
    if(!res.ok)throw new Error(result.message || 'Unable to connect. Please try again.');return result;
  }
  function render(data){
    root.querySelector('[data-support-status]').textContent=data.online?'Team online · replies appear here':'Team away · leave us a message';
    if(data.thread){hasThread=true;root.querySelector('[data-support-identity]').hidden=true;form.elements.name.required=false;}
    for(const m of data.messages || []){
      if(m.id<=seen)continue;
      const bubble=document.createElement('div');bubble.className='support-message '+m.sender;
      bubble.append(document.createTextNode(m.body));const time=document.createElement('small');time.textContent=(m.sender==='team'?'Support':'You')+' · '+new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});bubble.append(time);transcript.append(bubble);seen=m.id;
      if(m.sender==='team' && panel.hidden && m.id>lastRead)root.querySelector('[data-support-unread]').hidden=false;
    }
    if(!panel.hidden){transcript.scrollTop=transcript.scrollHeight;lastRead=seen;}
  }
  async function track(){if(consent!==true || signal || privatePath || document.hidden)return;try{await request('visit',visit);}catch{}}
  async function poll(){if(polling || document.hidden || (!hasThread && panel.hidden))return;polling=true;try{const data=await request('state');csrf=data.csrf;render(data);}catch{root.querySelector('[data-support-status]').textContent='Connection interrupted · retrying…';}finally{polling=false;}}
  launch.addEventListener('click',()=>{panel.hidden=!panel.hidden;launch.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){root.querySelector('[data-support-unread]').hidden=true;lastRead=seen;poll();(hasThread?form.elements.message:form.elements.name).focus();}});
  function close(){panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus();}
  root.querySelector('[data-support-close]').addEventListener('click',close);
  root.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!panel.hidden)close();});
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(busy)return;if(!ready){error.textContent='Connecting. Please try again in a moment.';return;}
    busy=true;error.textContent='';const button=form.querySelector('[type=submit]');button.disabled=true;
    const message=form.elements.message.value;
    if(!retryKey || retryKey.message!==message)retryKey={message,id:crypto.randomUUID()};
    try{render(await request('message',{name:form.elements.name.value,email:form.elements.email.value,message,clientId:retryKey.id,path:location.pathname}));form.elements.message.value='';retryKey=null;}
    catch(err){error.textContent=err.message;}finally{busy=false;button.disabled=false;}
  });
  document.querySelector('[data-audience-settings]').addEventListener('click',()=>{consentBox.hidden=false;consentBox.querySelector('button').focus();});
  consentBox.querySelectorAll('[data-consent]').forEach(button=>button.addEventListener('click',async()=>{
    try{const data=await request('consent',{accept:button.dataset.consent==='yes'&&!signal});consent=data.consent;consentBox.hidden=true;await track();}
    catch(err){consentBox.querySelector('[data-consent-error]').textContent=err.message;}
  }));
  request('state').then(data=>{csrf=data.csrf;consent=data.consent;ready=true;render(data);consentBox.hidden=consent!==null || signal || privatePath;track();}).catch(()=>{root.querySelector('[data-support-status]').textContent='Unable to connect · refresh to retry';});
  setInterval(poll,5000);setInterval(track,25000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){poll();track();}});
})();
