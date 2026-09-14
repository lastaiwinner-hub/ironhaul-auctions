'use strict';
const {test, before, after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'auction-design-test-'));
process.env.NODE_ENV='test';
process.env.DATABASE_FILE=path.join(dir,'test.sqlite');
process.env.SCHEDULER_ENABLED='false';
process.env.MAIL_ENABLED='false';
fs.copyFileSync(path.join(__dirname,'../db/demo.sqlite'),process.env.DATABASE_FILE);
const app=require('../src/app');
const {db}=require('../config/database');
require('../db/refreshDemo').refreshDemoClock(db);
let server,base;
before(async()=>{await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve)});base='http://127.0.0.1:'+server.address().port});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true})});
test('public, auth and credit pages render with the shared redesign',async()=>{
 for(const route of ['/','/inventory','/how-it-works','/about','/faq','/reviews','/contact','/login','/register','/photo-credits']){
 const res=await fetch(base+route);assert.equal(res.status,200,route);const html=await res.text();
 assert.match(html,/\/css\/redesign.css/,route);assert.doesNotMatch(html,/ReferenceError|SyntaxError/,route);
 }
});
test('home search uses real catalogue filters and lot links resolve',async()=>{
 const home=await (await fetch(base)).text();assert.match(home,/name="make"/);assert.match(home,/name="category"/);
 const slug=home.match(/href="(\/lot\/[^\"]+)"/)[1];
 const detail=await fetch(base+slug);assert.equal(detail.status,200);assert.match(await detail.text(),/photo-credits/);
 const listing=db.prepare('SELECT make FROM listings WHERE status = ? LIMIT 1').get('live');
 const filtered=await fetch(base+'/inventory?make='+encodeURIComponent(listing.make));assert.equal(filtered.status,200);assert.match(await filtered.text(),new RegExp(listing.make.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const empty=await fetch(base+'/inventory?q=not-a-real-listing-847283');assert.equal(empty.status,200);
});
test('editorial hero and provenance assets are served',async()=>{
 const res=await fetch(base+'/img/editorial-hero.webp');assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/image\/webp/);
 const credits=await (await fetch(base+'/photo-credits')).text();assert.match(credits,/Wikimedia Commons/);assert.match(credits,/licence/);
});
test('home handles an empty auction catalogue',async()=>{
 const before=db.prepare('SELECT id,status FROM listings').all();
 try {db.prepare("UPDATE listings SET status='draft'").run();const html=await (await fetch(base)).text();assert.match(html,/No live auctions right now/);assert.match(html,/editorial-hero.webp/);}
 finally {const restore=db.prepare('UPDATE listings SET status=? WHERE id=?');db.transaction(()=>before.forEach(l=>restore.run(l.status,l.id)))();}
});
