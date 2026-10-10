'use strict';
const crypto = require('crypto');
const { db } = require('../../config/database');
const config = require('../../config');
const DAY = 86400000;
const enabled = () => /^\d{5,30}$/.test(config.meta.pixelId);
const signal = req => req.get('sec-gpc') === '1' || req.get('dnt') === '1';
const hash = value => crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
function subject(req) {
  return db.prepare('SELECT * FROM meta_subjects WHERE id=?').get(req.session.metaSubject || '');
}
function revoke(req) {
  const row = subject(req);
  if (row) {
    const rows = row.user_id ? db.prepare('SELECT id FROM meta_subjects WHERE user_id=?').all(row.user_id) : [row];
    for (const item of rows) {
      db.prepare("UPDATE meta_subjects SET consent=0,context='{}' WHERE id=?").run(item.id);
      db.prepare("UPDATE meta_events SET status='revoked',payload=NULL WHERE subject_id=? AND status='pending'").run(item.id);
    }
  }
  req.session.marketingConsent = false;
}
function allowed(req) {
  if (signal(req)) { revoke(req); return false; }
  const row = subject(req);
  return enabled() && req.user?.role !== 'admin' && req.session.marketingConsent === true && row?.consent === 1 && row.updated_at > Date.now()-30*DAY;
}
function consent(req, accept) {
  if (!accept || signal(req) || req.user?.role === 'admin' || !enabled()) { revoke(req); return false; }
  req.session.marketingConsent = true;
  req.session.metaSubject ||= crypto.randomUUID();
  db.prepare(`INSERT INTO meta_subjects(id,user_id,consent,context,updated_at) VALUES (?,?,1,'{}',?)
    ON CONFLICT(id) DO UPDATE SET consent=1,updated_at=excluded.updated_at`).run(req.session.metaSubject,req.user?.id || null,Date.now());
  capture(req);
  return true;
}
function capture(req, data={}) {
  if (!allowed(req)) return null;
  const row=subject(req), context=JSON.parse(row.context);
  context.client_user_agent=String(req.get('user-agent') || '').slice(0,500);
  context.client_ip_address=req.ip;
  for (const key of ['fbp','fbc']) {
    const value=data[key] || req.cookies?.['_'+key];
    if (typeof value==='string' && /^fb\.\d\.\d{10,13}\.[\w.-]{1,400}$/.test(value)) context[key]=value;
  }
  const user=req.user || (req.session.userId ? db.prepare('SELECT id,email,role FROM users WHERE id=?').get(req.session.userId) : null);
  if (user?.role==='admin') return null;
  if(user) { context.em=[hash(user.email)]; context.external_id=[hash('heavyline:'+user.id)]; }
  db.prepare('UPDATE meta_subjects SET context=?,user_id=COALESCE(?,user_id),updated_at=? WHERE id=?').run(JSON.stringify(context),user?.id || null,Date.now(),row.id);
  return {...row,context, user_id:user?.id || row.user_id};
}
function enqueue(row,name,id,path,custom={}) {
  if (!row || !enabled()) return null;
  const payload={event_name:name,event_id:id,event_time:Math.floor(Date.now()/1000),action_source:'website',
    event_source_url:config.baseUrl+path,user_data:typeof row.context==='string'?JSON.parse(row.context):row.context,custom_data:custom};
  db.prepare('INSERT OR IGNORE INTO meta_events(id,subject_id,name,payload,created_at,next_attempt) VALUES (?,?,?,?,?,?)')
    .run(id,row.id,name,JSON.stringify(payload),Date.now(),Date.now());
  return {name,id,custom};
}
function record(req,name,id,path='/',custom={}) {
  return enqueue(capture(req),name,id,path,custom);
}
function purchase(order) {
  if (!enabled() || order.status!=='paid') return;
  const row=db.prepare('SELECT * FROM meta_subjects WHERE user_id=? AND consent=1 AND updated_at>? ORDER BY updated_at DESC LIMIT 1').get(order.user_id,Date.now()-30*DAY);
  return enqueue(row,'Purchase','purchase-'+order.id,'/lot/'+order.listing_slug,{currency:'USD',value:order.total/100,content_ids:[String(order.listing_id)],content_type:'product',order_id:order.order_number});
}
function page(req) {
  if (!allowed(req)) return [];
  const path=String(req.body.path || ''), key=String(req.body.pageKey || '');
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(key)) return [];
  const lot=path.match(/^\/lot\/([a-z0-9-]+)$/);
  const listing=lot && db.prepare("SELECT id,title FROM listings WHERE slug=? AND status IN ('live','ended','sold')").get(lot[1]);
  if (!(listing || ['/', '/inventory','/auctions','/about','/contact','/how-it-works','/financing','/shipping','/reviews'].includes(path))) return [];
  const row=capture(req,req.body);
  const events=[enqueue(row,'PageView',`page-${row.id}-${key}`,path)];
  if(listing) events.push(enqueue(row,'ViewContent',`view-${row.id}-${key}`,path,{content_ids:[String(listing.id)],content_type:'product',content_name:listing.title}));
  return events.filter(Boolean);
}
let running=false,timer;
async function flush(fetcher=fetch) {
  if(running || !enabled() || !config.meta.accessToken)return;
  running=true;
  try {
    db.prepare("UPDATE meta_events SET status='expired',payload=NULL WHERE status='pending' AND created_at<?").run(Date.now()-6*DAY);
    db.prepare("UPDATE meta_subjects SET consent=0,context='{}' WHERE updated_at<?").run(Date.now()-30*DAY);
    // Keep only event IDs/status for deduplication after successful delivery.
    for(const event of db.prepare("SELECT * FROM meta_events WHERE status='pending' AND next_attempt<=? LIMIT 25").all(Date.now())) {
      const row=db.prepare('SELECT consent FROM meta_subjects WHERE id=?').get(event.subject_id);
      if(!row?.consent){db.prepare("UPDATE meta_events SET status='revoked',payload=NULL WHERE id=?").run(event.id);continue;}
      try {
        const response=await fetcher(`https://graph.facebook.com/v25.0/${config.meta.pixelId}/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.meta.accessToken}`},body:JSON.stringify({data:[JSON.parse(event.payload)],...(config.meta.testCode?{test_event_code:config.meta.testCode}:{})}),signal:AbortSignal.timeout(8000)});
        const result=await response.json();
        if(!response.ok || result.events_received!==1) {
          const error=new Error('Meta rejected event');error.code=String(result.error?.code || response.status);throw error;
        }
        db.prepare("UPDATE meta_events SET status='sent',payload=NULL,error_code=NULL,attempts=attempts+1 WHERE id=?").run(event.id);
      } catch(err) {
        const attempts=event.attempts+1;
        db.prepare('UPDATE meta_events SET attempts=?,next_attempt=?,error_code=? WHERE id=?').run(attempts,Date.now()+Math.min(3600000,30000*2**Math.min(attempts,7)),String(err.code || 'network').slice(0,40),event.id);
        // Never log API bodies, tokens, or customer identifiers.
      }
    }
  } finally {running=false;}
}
function start(){timer=setInterval(()=>flush().catch(()=>console.error('[meta] queue processing failed')),15000);timer.unref();}
function stop(){clearInterval(timer);}
module.exports={enabled,allowed,consent,capture,record,purchase,page,flush,start,stop,revoke};
