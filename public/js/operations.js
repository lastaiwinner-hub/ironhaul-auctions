(() => {
  'use strict';
  const $=s=>document.querySelector(s), csrf=$('meta[name="csrf-token"]')?.content;
  $('.ops-menu-toggle')?.addEventListener('click',()=>{const open=$('#admin-navigation').classList.toggle('is-open');$('.ops-menu-toggle').setAttribute('aria-expanded',String(open));});
  async function api(path,data){
    const r=await fetch('/admin/engagement/'+path,{method:data?'POST':'GET',headers:{Accept:'application/json',...(data?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},...(data?{body:JSON.stringify(data)}:{})});
    const value=await r.json().catch(()=>({message:'Your session expired. Refresh and sign in again.'}));if(!r.ok || r.redirected)throw Error(value.message||'Unable to load. Please try again.');return value;
  }
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const stamp=t=>new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  function empty(node,message){node.replaceChildren(el('div',message,'ops-empty'));}
  function table(node,headers,rows){if(!node)return;if(!rows.length){empty(node,'No data yet. New activity will appear here.');return;}const t=el('table'),h=el('tr');headers.forEach(x=>h.append(el('th',x)));const head=el('thead');head.append(h);t.append(head);const body=el('tbody');rows.forEach(row=>{const tr=el('tr');row.forEach(x=>tr.append(el('td',String(x??'—'))));body.append(tr);});t.append(body);node.replaceChildren(t);}
  function bars(node,rows,key){node.replaceChildren();if(!rows.length){empty(node,'No visits recorded yet.');return;}const max=Math.max(...rows.map(r=>r.n),1);rows.forEach(r=>{const row=el('div',undefined,'ops-bar-row'),label=el('div'),track=el('div',undefined,'ops-bar-track'),fill=el('div',undefined,'ops-bar-fill');label.append(el('span',r[key]),el('strong',r.n));fill.style.width=(r.n/max*100)+'%';track.append(fill);row.append(label,track);node.append(row);});}
  if($('[data-overview]')){
    let loading=false, generation=0;
    async function refresh(){if(document.hidden || loading)return;loading=true;const run=++generation;try{
      const d=await api('overview?days='+$('[data-period]').value);if(run!==generation)return;
      document.querySelectorAll('[data-metric]').forEach(n=>n.textContent=Number(d[n.dataset.metric]).toLocaleString());
      $('[data-overview-status]').textContent='Updated '+new Date(d.updatedAt).toLocaleTimeString();
      bars($('[data-sources]'),d.sources,'source');bars($('[data-pages]'),d.pages,'path');
      table($('[data-visitors]'),['Visitor','Source','Current page','Device','Arrived'],d.live.map(v=>['Visitor '+v.id.slice(0,6),v.source,v.current_path,v.device,stamp(v.started_at)]));
      table($('[data-campaigns]'),['Campaign','Source','Medium','Visits'],d.campaigns.map(c=>[c.campaign,c.source,c.medium||'Unspecified',c.n]));
      const trend=$('[data-trend]');trend.replaceChildren();const map=new Map(d.trend.map(t=>[t.day,t.n])),days=[];
      // Include the partial first UTC date in the rolling reporting window.
      for(let i=d.days;i>=0;i--){const date=new Date(d.updatedAt-i*86400000).toISOString().slice(0,10);days.push({day:date,n:map.get(date)||0});}
      const max=Math.max(...days.map(t=>t.n),1);days.forEach(t=>{const n=el('div');n.style.height=(t.n/max*140)+'px';n.title=t.day+': '+t.n+' visits';n.setAttribute('aria-label',n.title);n.tabIndex=0;trend.append(n);});$('[data-trend-start]').textContent=days[0].day;
      const activity=$('[data-activity]');activity.replaceChildren();if(!d.activity.length)empty(activity,'No business activity yet.');d.activity.forEach(a=>{const row=el('div');row.append(el('span',a.action.replace(/[._]/g,' ')),el('time',stamp(a.created_at)));activity.append(row);});
    }catch(err){$('[data-overview-status]').textContent='Update failed · '+err.message;}finally{loading=false;}}
    $('[data-period]').addEventListener('change',()=>{generation++;loading=false;refresh();});refresh();setInterval(refresh,15000);
    const builder=$('[data-campaign-builder]');
    if(builder){builder.addEventListener('submit',ev=>{ev.preventDefault();try{const url=new URL(builder.elements.path.value,location.origin);if(url.origin!==location.origin || !/^\/(?:inventory|auctions|lot\/[a-z0-9-]+)?$/.test(url.pathname))throw Error('Use a public inventory, auction or lot page on this site.');url.searchParams.set('utm_source',builder.elements.source.value);url.searchParams.set('utm_medium',builder.elements.medium.value);url.searchParams.set('utm_campaign',builder.elements.campaign.value);$('[data-campaign-link]').value=url.href;$('[data-link-status]').textContent='Ready to use in your campaign.';}catch(err){$('[data-link-status]').textContent=err.message;}});$('[data-copy-link]').addEventListener('click',async()=>{try{if(!$('[data-campaign-link]').value)throw Error();await navigator.clipboard.writeText($('[data-campaign-link]').value);$('[data-link-status]').textContent='Link copied.';}catch{$('[data-link-status]').textContent='Create a link, then select it and copy it manually.';}});}
  }
  if($('[data-inbox]')){
    let listSignature='',selected=null,last=0,listBusy=false,threadBusy=false,replyBusy=false,replyRetry=null,selectionVersion=0;
    const drafts=new Map();
    async function presence(){try{await api('presence',{online:$('[data-available]').checked && !document.hidden});}catch{$('[data-inbox-status]').textContent='Connection lost. Availability may expire.';}}
    $('[data-available]').addEventListener('change',presence);document.addEventListener('visibilitychange',presence);setInterval(()=>{if(!document.hidden && $('[data-available]').checked)presence();},25000);
    function renderMessages(messages){const list=$('[data-chat-messages]');let added=false;const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<70;messages.forEach(m=>{if(m.id<=last)return;const b=el('div',undefined,'ops-bubble '+m.sender);b.append(document.createTextNode(m.body),el('small',(m.sender==='team'?'Team':'Visitor')+' · '+stamp(m.created_at)));list.append(b);last=m.id;added=true;});if(added && (nearBottom||replyBusy))list.scrollTop=list.scrollHeight;}
    async function readThread(){if(!selected || threadBusy || document.hidden)return;threadBusy=true;const id=selected,version=selectionVersion;try{const data=await api('threads/'+id);if(id!==selected || version!==selectionVersion)return;
      $('[data-contact-name]').textContent=data.thread.name;
      $('[data-contact-meta]').textContent=[data.thread.email || 'No email provided',data.thread.source,data.thread.page].join(' · ');
      $('[data-thread-toggle]').textContent=data.thread.status==='open'?'Close conversation':'Reopen conversation';$('[data-thread-toggle]').dataset.status=data.thread.status;
      renderMessages(data.messages);if(data.thread.unread)await api('threads/'+id+'/read',{through:last});
    }catch(err){$('[data-reply-status]').textContent=err.message;}finally{threadBusy=false;}}
    async function loadList(){if(listBusy || document.hidden)return;listBusy=true;try{const data=await api('threads?status='+$('[data-thread-status]').value+'&q='+encodeURIComponent($('[data-thread-search]').value));const list=$('[data-thread-list]');$('[data-inbox-status]').textContent=data.threads.length+' conversations · updated '+new Date().toLocaleTimeString();const signature=JSON.stringify(data.threads);if(signature===listSignature)return;listSignature=signature;list.replaceChildren();if(!data.threads.length)empty(list,'No conversations in this view.');
      data.threads.forEach(t=>{const b=el('button',undefined,'ops-thread');b.type='button';b.setAttribute('aria-pressed',String(t.id===selected));b.append(el('strong',t.name));if(t.unread)b.append(el('span',t.unread,'ops-unread'));b.append(el('p',t.preview||'New conversation'),el('small',t.source+' · '+stamp(t.updated_at)));b.addEventListener('click',()=>{if(selected)drafts.set(selected,$('[data-reply-form]').elements.message.value);selected=t.id;selectionVersion++;last=0;threadBusy=false;$('[data-chat-messages]').replaceChildren();$('[data-reply-form]').elements.message.value=drafts.get(t.id)||'';$('[data-reply-status]').textContent='';$('[data-conversation-empty]').hidden=true;$('[data-conversation]').hidden=false;list.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));readThread();});list.append(b);});
    }catch(err){$('[data-inbox-status]').textContent=err.message;}finally{listBusy=false;}}
    $('[data-thread-status]').addEventListener('change',loadList);let searchTimer;$('[data-thread-search]').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadList,300);});
    $('[data-thread-toggle]').addEventListener('click',async()=>{if(!selected)return;try{await api('threads/'+selected+'/status',{status:$('[data-thread-toggle]').dataset.status==='open'?'closed':'open'});await readThread();await loadList();}catch(err){$('[data-reply-status]').textContent=err.message;}});
    $('[data-reply-form]').addEventListener('submit',async ev=>{ev.preventDefault();if(replyBusy||!selected)return;replyBusy=true;const id=selected,form=ev.currentTarget,message=form.elements.message.value,button=form.querySelector('button');button.disabled=true;$('[data-reply-status]').textContent='';if(!replyRetry || replyRetry.id!==id || replyRetry.message!==message)replyRetry={id,message,key:crypto.randomUUID()};
      try{const d=await api('threads/'+id+'/reply',{message,clientId:replyRetry.key});drafts.delete(id);if(selected===id){renderMessages(d.messages);form.elements.message.value='';$('[data-reply-status]').textContent='Reply sent.';}replyRetry=null;await loadList();}catch(err){$('[data-reply-status]').textContent=err.message;}finally{replyBusy=false;button.disabled=false;}});
    loadList();setInterval(()=>{loadList();readThread();},5000);
  }
})();
