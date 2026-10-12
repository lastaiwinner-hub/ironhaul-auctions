'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'auction-engagement-'));
process.env.NODE_ENV='test';process.env.DATABASE_FILE=path.join(dir,'test.sqlite');process.env.SESSION_SECURE='false';process.env.MAIL_ENABLED='false';process.env.SCHEDULER_ENABLED='false';
fs.copyFileSync(path.join(__dirname,'../db/demo.sqlite'),process.env.DATABASE_FILE);
const app=require('../src/app');const {db,migrate}=require('../config/database');const service=require('../src/services/engagement');
let server,base;
before(async()=>{await new Promise(r=>{server=app.listen(0,'127.0.0.1',r);});base='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
async function client(role){
 const r=await fetch(base+'/engagement/state');const cookie=r.headers.getSetCookie()[0].split(';')[0];const state=await r.json();
 if(role){const id=db.prepare("INSERT INTO users(email,password_hash,full_name,role) VALUES (?,?,?,?)").run(Math.random()+'@example.test','not-a-real-hash','Test '+role,role).lastInsertRowid;
 const sid=decodeURIComponent(cookie.split('=').slice(1).join('=')).slice(2).split('.')[0];const row=db.prepare('SELECT data FROM sessions WHERE sid=?').get(sid);const data=JSON.parse(row.data);data.userId=Number(id);db.prepare('UPDATE sessions SET data=? WHERE sid=?').run(JSON.stringify(data),sid);}
 return {state,call:async(url,data,extra={})=>fetch(base+url,{redirect:'manual',method:data?'POST':'GET',headers:{cookie,accept:'application/json',...(data?{'content-type':'application/json','x-csrf-token':state.csrf}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})})};
}
test('attribution distinguishes confirmed social sources and ambiguous Meta clicks',()=>{
 assert.equal(service.attribution({source:'ig'}).source,'Instagram');assert.equal(service.attribution({referrer:'https://l.facebook.com/path?secret=x'}).source,'Facebook');assert.equal(service.attribution({referrer:'https://instagram.com.evil.test/'}).source,'Referral');assert.equal(service.attribution({metaClick:true}).source,'Meta (unspecified)');assert.equal(service.attribution({referrer:'https://example.test/x'},'example.test').source,'Direct / unknown');assert.equal(service.publicPath('/account/reset?token=secret'),'/');assert.equal(service.publicPath('/lot/test?email=secret'),'/lot/test');
});
test('tracking requires consent, deduplicates page heartbeats and preserves first source',async()=>{
 const c=await client();const data={path:'/inventory?private=value',pageKey:'page-12345678',source:'instagram',campaign:'autumn-sale',referrer:'https://instagram.com/private?token=secret'};
 assert.equal((await c.call('/engagement/visit',data)).status,204);assert.equal(db.prepare('SELECT COUNT(*) n FROM audience_visits').get().n,0);
 assert.equal((await c.call('/engagement/consent',{accept:true})).status,200);
 await c.call('/engagement/visit',data);await c.call('/engagement/visit',{...data,source:'facebook'});
 const v=db.prepare('SELECT * FROM audience_visits').get();assert.equal(v.source,'Instagram');assert.equal(v.referrer,'instagram.com');assert.equal(v.landing,'/inventory');assert.equal(db.prepare('SELECT COUNT(*) n FROM audience_pages').get().n,1);
 await c.call('/engagement/visit',{...data,pageKey:'page-22345678',path:'/lot/test'});assert.equal(db.prepare('SELECT COUNT(*) n FROM audience_pages').get().n,2);
 await c.call('/engagement/consent',{accept:false});assert.equal(db.prepare('SELECT COUNT(*) n FROM audience_visits').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM audience_pages').get().n,0);
});
test('privacy signals and administrator sessions do not produce analytics',async()=>{
 const c=await client();assert.equal((await (await c.call('/engagement/consent',{accept:true},{'sec-gpc':'1'})).json()).consent,false);
 const a=await client('admin');await a.call('/engagement/consent',{accept:true});await a.call('/engagement/visit',{path:'/',pageKey:'page-33333333'});assert.equal(db.prepare('SELECT COUNT(*) n FROM audience_visits').get().n,0);
});
test('chat is session-private, CSRF-protected, persistent and supports admin replies',async()=>{
 const a=await client('admin'),v=await client(),stranger=await client(),buyer=await client('buyer');
 assert.equal((await stranger.call('/admin/engagement/threads')).status,302);assert.equal((await buyer.call('/admin/engagement/threads')).status,403);
 const payload={name:'Buyer',email:'buyer@example.test',message:'Question about delivery <script>alert(1)</script>',clientId:'msg-11111111',path:'/lot/test'};
 assert.equal((await v.call('/engagement/message',payload,{'x-csrf-token':'invalid'})).status,403);
 let r=await v.call('/engagement/message',payload);assert.equal(r.status,200);const conversation=await r.json();const id=conversation.thread.id;
 await v.call('/engagement/message',payload);assert.equal(db.prepare('SELECT COUNT(*) n FROM support_messages WHERE thread_id=?').get(id).n,1);
 assert.equal((await (await stranger.call('/engagement/state')).json()).thread,null);
 let threads=await (await a.call('/admin/engagement/threads')).json();assert.equal(threads.threads[0].unread,1);
 assert.equal((await a.call('/admin/engagement/presence',{online:true})).status,200);assert.equal((await (await v.call('/engagement/state')).json()).online,true);
 assert.equal((await a.call('/admin/engagement/threads/'+id+'/reply',{message:'We can help with delivery.',clientId:'reply-11111111'})).status,200);
 assert.equal((await (await v.call('/engagement/state')).json()).messages.at(-1).sender,'team');
 await a.call('/admin/engagement/threads/'+id+'/read',{through:0});assert.equal(db.prepare('SELECT unread FROM support_threads WHERE id=?').get(id).unread,1);
 await a.call('/admin/engagement/threads/'+id+'/read',{through:99999});assert.equal(db.prepare('SELECT unread FROM support_threads WHERE id=?').get(id).unread,0);
 await a.call('/admin/engagement/threads/'+id+'/status',{status:'closed'});await v.call('/engagement/message',{...payload,message:'One more question',clientId:'msg-22222222'});assert.equal(db.prepare('SELECT status FROM support_threads WHERE id=?').get(id).status,'open');
 migrate();assert.equal((await (await v.call('/engagement/state')).json()).messages.length,3);
 await a.call('/admin/engagement/presence',{online:false});assert.equal((await (await v.call('/engagement/state')).json()).online,false);
 for(const url of ['/admin','/admin/inbox','/admin/insights']){r=await a.call(url);assert.equal(r.status,200,url);assert.match(await r.text(),/operations.js/);}
 r=await a.call('/admin/engagement/overview?days=30');assert.equal(r.status,200);assert.equal((await r.json()).days,30);assert.equal(r.headers.get('cache-control'),'no-store');
});

test('recent bids are visible to visitors and buyers while full names remain admin-only',async()=>{
 const engine=require('../src/services/auctionEngine');
 const original=engine.bidHistory;
 const listing=db.prepare('SELECT slug FROM listings WHERE auction_ends_at IS NOT NULL LIMIT 1').get();
 assert.ok(listing);
 engine.bidHistory=()=>[{full_name:'Alexandra Visibilitycheck',city:'Lester',state:'PA',amount:2430000,user_id:-1,created_at:new Date().toISOString(),is_auto:0}];
 try {
  for(const role of [undefined,'buyer','admin']){
   const c=await client(role);
   const api=await c.call('/api/lot/'+listing.slug+'/state');
   assert.equal(api.status,200);assert.match(api.headers.get('cache-control'),/private, no-store/);
   const data=await api.json();assert.equal(data.history.length,1);
   assert.equal(data.history[0].bidder,role==='admin'?'Alexandra Visibilitycheck':'A. Visibilitycheck (Lester, PA)');
   const page=await c.call('/lot/'+listing.slug);assert.equal(page.status,200);
   const html=await page.text();assert.match(html,/Recent bids/);
   assert.ok(html.includes(data.history[0].bidder));
   if(role!=='admin') assert.ok(!html.includes('Alexandra Visibilitycheck'));
  }
 }finally{engine.bidHistory=original;}
});
