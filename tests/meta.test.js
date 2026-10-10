'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'auction-meta-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'test.sqlite'),SESSION_SECURE:'false',MAIL_ENABLED:'false',SCHEDULER_ENABLED:'false',META_PIXEL_ID:'123456789',META_ACCESS_TOKEN:'test-secret-never-in-html'});
fs.copyFileSync(path.join(__dirname,'../db/demo.sqlite'),process.env.DATABASE_FILE);
const app=require('../src/app'),{db}=require('../config/database'),meta=require('../src/services/meta');
let server,base;
before(async()=>{await new Promise(r=>{server=app.listen(0,'127.0.0.1',r);});base='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});});
async function client(){
 const r=await fetch(base+'/engagement/state'),cookie=r.headers.getSetCookie()[0].split(';')[0],state=await r.json();
 return {state,cookie,call:async(url,data,headers={})=>fetch(base+url,{method:data?'POST':'GET',headers:{cookie,accept:'application/json',...(data?{'content-type':'application/json','x-csrf-token':state.csrf}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})})};
}
test('old analytics consent never grants advertising consent; explicit opt-in, CSRF, GPC and private path controls',async()=>{
 const c=await client(),payload={path:'/',pageKey:'page-11111111'};
 assert.deepEqual((await (await c.call('/engagement/meta-page',payload)).json()).events,[]);
 await c.call('/engagement/consent',{accept:true});
 assert.deepEqual((await (await c.call('/engagement/meta-page',payload)).json()).events,[]);
 assert.equal((await c.call('/engagement/consent',{marketing:true},{'x-csrf-token':'wrong'})).status,403);
 await c.call('/engagement/consent',{marketing:true});
 assert.equal((await (await c.call('/engagement/meta-page',payload)).json()).events.length,1);
 for(const p of ['/sign/private-token','/account','/admin','/lot/test/buy','/?email=private'])assert.equal((await (await c.call('/engagement/meta-page',{...payload,path:p})).json()).events.length,0);
 await c.call('/engagement/meta-page',payload,{'sec-gpc':'1'});
 assert.equal(db.prepare("SELECT count(*) n FROM meta_events WHERE status='pending'").get().n,0);
 const html=await (await c.call('/')).text();assert.ok(!html.includes(process.env.META_ACCESS_TOKEN));assert.ok(!html.includes('fbevents.js'));assert.match(html,/Meta advertising/);
});
test('browser and server share event IDs, amounts use dollars, confirmed paid purchases are idempotent and use buyer context',async()=>{
 const id=Number(db.prepare("INSERT INTO users(email,password_hash,full_name,role) VALUES ('meta-buyer@example.test','none','Buyer','buyer')").run().lastInsertRowid);
 const req={session:{userId:id},user:{id,email:'meta-buyer@example.test',role:'buyer'},cookies:{},ip:'192.0.2.1',get:k=>k==='user-agent'?'Buyer browser':undefined};
 meta.consent(req,true);
 const registration=meta.record(req,'CompleteRegistration','registration-test');assert.equal(registration.name,'CompleteRegistration');
 req.body={path:'/',pageKey:'page-22222222',fbc:'fb.1.1790000000000.real-click'};
 const event=meta.page(req)[0];meta.page(req);
 assert.equal(db.prepare('SELECT count(*) n FROM meta_events WHERE id=?').get(event.id).n,1);
 const order=require('../src/models/order');const listing=db.prepare('SELECT id FROM listings LIMIT 1').get();
 const o=order.create({userId:id,listingId:listing.id,type:'buy_now',amount:2430000,shippingFee:50000});
 order.setStatus(o.id,'agreement_signed');assert.equal(db.prepare("SELECT count(*) n FROM meta_events WHERE name='Purchase'").get().n,0);
 order.setStatus(o.id,'paid');order.setStatus(o.id,'paid');
 const purchase=db.prepare("SELECT * FROM meta_events WHERE name='Purchase'").all();assert.equal(purchase.length,1);
 const p=JSON.parse(purchase[0].payload);assert.equal(p.custom_data.value,24800);assert.equal(p.user_data.client_user_agent,'Buyer browser');assert.equal(p.user_data.client_ip_address,'192.0.2.1');assert.match(p.user_data.em[0],/^[a-f0-9]{64}$/);assert.ok(!purchase[0].payload.includes('meta-buyer@example.test'));assert.ok(!p.event_source_url.includes('/admin'));
 const calls=[];await meta.flush(async(url,options)=>{calls.push(JSON.parse(options.body));assert.ok(options.headers.Authorization.endsWith(process.env.META_ACCESS_TOKEN));return {ok:true,json:async()=>({events_received:1})};});
 assert.ok(calls.some(c=>c.data[0].event_id===event.id));assert.equal(db.prepare('SELECT payload FROM meta_events WHERE id=?').get(purchase[0].id).payload,null);
 assert.equal(db.prepare('SELECT status FROM meta_events WHERE id=?').get(purchase[0].id).status,'sent');
 const n=calls.length;await meta.flush(async()=>{calls.push(1)});assert.equal(calls.length,n);
 meta.record(req,'BidPlaced','pending-bid');meta.revoke(req);assert.equal(db.prepare("SELECT status FROM meta_events WHERE id='pending-bid'").get().status,'revoked');
});
test('failed deliveries retry without exposing API body and administrators cannot opt in',async()=>{
 const req={session:{},cookies:{},ip:'192.0.2.2',get:k=>k==='user-agent'?'Browser':undefined};meta.consent(req,true);meta.record(req,'Lead','retry-test');
 await meta.flush(async()=>({ok:false,status:400,json:async()=>({error:{code:190,message:'sensitive body'}})}));
 const row=db.prepare("SELECT * FROM meta_events WHERE id='retry-test'").get();assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.equal(row.error_code,'190');assert.ok(row.next_attempt>Date.now());
 meta.revoke(req);req.user={role:'admin'};assert.equal(meta.consent(req,true),false);
});
