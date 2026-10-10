(() => {
  'use strict';
  const root=document.querySelector('[data-support]'); if(!root)return;
  const panel=root.querySelector('.support-panel'), launch=root.querySelector('.support-launch'), form=root.querySelector('form'), transcript=root.querySelector('.support-transcript'), error=root.querySelector('.support-error');
  const consentBox=document.querySelector('[data-audience-consent]');
  const privatePath=/^\/(admin|account|sign|login|register|reset|verify)/.test(location.pathname);
  const signal=navigator.globalPrivacyControl===true || navigator.doNotTrack==='1';
  let csrf='',consent=null,hasThread=false,busy=false,seen=0,lastRead=0,ready=false,polling=false,retryKey=null;
  let marketing=false,pixelId=null,pixelStarted=false,metaTracked=false;
  const analyticsChoice=consentBox.querySelector('[data-analytics-choice]'),marketingChoice=consentBox.querySelector('[data-marketing-choice]');
  const pageKey=crypto.randomUUID();
  const params=new URLSearchParams(location.search);
  const visit={path:location.pathname,pageKey,source:params.get('utm_source'),medium:params.get('utm_medium'),campaign:params.get('utm_campaign'),referrer:document.referrer,metaClick:params.has('fbclid')};
  async function request(path,data){
    const res=await fetch('/engagement/'+path,{method:data?'POST':'GET',credentials:'same-origin',headers:{Accept:'application/json',...(data?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},...(data?{body:JSON.stringify(data)}:{})});
    if(res.status===204)return {};
    const result=await res.json().catch(()=>({message:'Connection interrupted. Please refresh and try again.'}));
    if(!res.ok)throw new Error(result.message || 'Unable to connect. Please try again.');return result;
  }
  function clearAdCookies(){
    if(window.fbq)window.fbq('consent','revoke');
    for(const name of ['_fbp','_fbc'])for(const domain of ['',location.hostname,'.'+location.hostname])document.cookie=name+'=; Max-Age=0; Path=/; SameSite=Lax'+(domain?'; Domain='+domain:'');
  }
  async function trackMeta(){
    if(!marketing || signal || metaTracked || !pixelId)return;
    const publicPage=/^\/lot\/[a-z0-9-]+$/.test(location.pathname) || ['/', '/inventory','/auctions','/about','/contact','/how-it-works','/financing','/shipping','/reviews'].includes(location.pathname);
    if(!publicPage)return;
    metaTracked=true;
    // Disable automatic event discovery and automatic advanced matching.
    // Never load Meta on account, checkout, signing, or admin screens.
    const safeQuery=[...params.keys()].every(key=>['fbclid','utm_source','utm_medium','utm_campaign','utm_content','utm_term','filter','category','page','sort','preview'].includes(key));
    if(safeQuery && !pixelStarted){
      const fbq=window.fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments);};
      window._fbq=fbq;fbq.push=fbq;fbq.loaded=true;fbq.version='2.0';fbq.queue=[];
      fbq('consent','grant');fbq('set','autoConfig',false,pixelId);fbq('init',pixelId);pixelStarted=true;
      const script=document.createElement('script');script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';document.head.append(script);
    }
    const cookies=Object.fromEntries(document.cookie.split(';').map(v=>v.trim().split('=')));
    const click=params.get('fbclid');
    const fbp=cookies._fbp || 'fb.1.'+Date.now()+'.'+String(crypto.getRandomValues(new Uint32Array(1))[0]);
    const fbc=cookies._fbc || (click && /^[\w.-]{1,400}$/.test(click)?'fb.1.'+Date.now()+'.'+click:undefined);
    for(const [key,value] of Object.entries({_fbp:fbp,_fbc:fbc}))if(value)document.cookie=key+'='+value+'; Path=/; Max-Age=2592000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
    try{
      const result=await request('meta-page',{path:location.pathname,pageKey,fbp,fbc});
      if(marketing && pixelStarted)for(const event of result.events || [])window.fbq('track',event.name,event.custom,{eventID:event.id});
    }catch{metaTracked=false;}
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
  document.querySelector('[data-audience-settings]').addEventListener('click',()=>{analyticsChoice.checked=consent===true;marketingChoice.checked=marketing;consentBox.hidden=false;consentBox.querySelector('button').focus();});
  consentBox.querySelectorAll('[data-consent]').forEach(button=>button.addEventListener('click',async()=>{
    try{const save=button.dataset.consent==='yes';const data=await request('consent',{accept:save&&analyticsChoice.checked&&!signal,marketing:save&&marketingChoice.checked&&!signal});consent=data.consent;marketing=data.marketing;consentBox.hidden=true;if(!marketing){clearAdCookies();if(pixelStarted){location.reload();return;}}await track();await trackMeta();}
    catch(err){consentBox.querySelector('[data-consent-error]').textContent=err.message;}
  }));
  request('state').then(data=>{csrf=data.csrf;consent=data.consent;marketing=data.marketing;pixelId=data.pixelId;analyticsChoice.checked=consent===true;marketingChoice.checked=marketing;consentBox.querySelector('[data-marketing-option]').hidden=!pixelId;analyticsChoice.disabled=signal;marketingChoice.disabled=signal;ready=true;render(data);consentBox.hidden=(consent!==null&&(!pixelId||data.marketingConsent!==null)) || signal || privatePath;if(!marketing)clearAdCookies();track();trackMeta();}).catch(()=>{root.querySelector('[data-support-status]').textContent='Unable to connect · refresh to retry';});
  setInterval(poll,5000);setInterval(track,25000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){poll();track();}});
})();
