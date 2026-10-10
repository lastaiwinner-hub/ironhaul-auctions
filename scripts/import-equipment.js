'use strict';
// Run only after the catalogue and commercial terms have been approved.
// Fetches photographs before one atomic insert; reruns never update existing lots.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { db } = require('../config/database');
const listings = require('../src/models/listing');
const engine = require('../src/services/auctionEngine');
const config = require('../config');
const manifest = require('./imports/ebensburg-equipment-2026-10-10.json');
const apply = process.argv.includes('--apply');
const imageDir = path.join(config.dirs.root, 'public/uploads/listings');
const sameSerial = db.prepare('SELECT id, slug FROM listings WHERE serial_number = ? COLLATE NOCASE');
const sameSlug = db.prepare('SELECT id, slug FROM listings WHERE slug = ? OR stock_number = ?');
const pending = [];
for (const item of manifest.listings) {
  const d = item.data;
  const existing = sameSlug.get(d.slug, d.stock_number) || (d.serial_number && sameSerial.get(d.serial_number));
  if (existing) { console.log(`SKIP existing ${d.slug}: ${existing.id}`); continue; }
  const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(item.category);
  if (!cat) throw new Error(`Missing category ${item.category}`);
  if (!Number.isSafeInteger(d.buy_now_price) || d.buy_now_price <= 0 || !Number.isSafeInteger(d.starting_bid) || d.starting_bid <= 0) throw new Error(`Invalid prices: ${d.slug}`);
  if (!item.images.length) throw new Error(`No images: ${d.slug}`);
  pending.push({...item, categoryId:cat.id});
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',newListings:pending.length,auctions:pending.filter(x=>!x.pricing_conflict).length,buyNowOnly:pending.filter(x=>x.pricing_conflict).length,photos:pending.reduce((n,x)=>n+x.images.length,0)}));
if (!apply || !pending.length) { db.close(); process.exit(0); }
async function photo(url) {
  const u = new URL(url);
  if (u.origin !== 'https://ebensburg-auction.com' || !/^\/uploads\/products\/\d+\/[\w-]+\.webp$/.test(u.pathname)) throw new Error(`Unexpected photo URL ${url}`);
  const name = `eba-${crypto.createHash('sha256').update(url).digest('hex').slice(0,24)}.webp`;
  const dest = path.join(imageDir,name);
  if (fs.existsSync(dest)) { await sharp(dest).metadata(); return name; }
  for (let attempt=1;attempt<=3;attempt++) {
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(40000),redirect:'error'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      if (bytes.length>20*1024*1024) throw new Error('Oversized image');
      const meta=await sharp(bytes).metadata();
      if (!meta.width || !meta.height || meta.format!=='webp') throw new Error('Invalid WebP image');
      fs.writeFileSync(dest+'.part',bytes); fs.renameSync(dest+'.part',dest); return name;
    } catch(e) { if(attempt===3) throw new Error(`${url}: ${e.message}`); }
  }
}
async function main() {
  fs.mkdirSync(imageDir,{recursive:true});
  const backupDir=path.join(config.dirs.root,'data/import-backups'); fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backup=path.join(backupDir,`before-ebensburg-${stamp}.sqlite`);
  await db.backup(backup); fs.chmodSync(backup,0o600); console.log(`BACKUP ${backup}`);
  let cursor=0, completed=0;
  const jobs=pending.flatMap(item=>{ item.files=new Array(item.images.length); return item.images.map((url,index)=>({item,url,index})); });
  await Promise.all(Array.from({length:4},async()=>{
    while(cursor<jobs.length){const job=jobs[cursor++]; job.item.files[job.index]=await photo(job.url); completed++; if(completed%100===0) console.log(`PHOTOS ${completed}/${jobs.length}`);}
  }));
  const before=db.prepare('SELECT id,title,bid_count,current_bid,status FROM listings ORDER BY id').all();
  const startsAt=new Date(); const endsAt=new Date(startsAt.getTime()+manifest.auction_hours*3600000);
  const inserted=db.transaction(()=>pending.map(item=>{
    if (sameSlug.get(item.data.slug,item.data.stock_number)) throw new Error('Concurrent import detected');
    const id=listings.create({...item.data,category_id:item.categoryId,status:'live',starting_bid:item.pricing_conflict?item.data.buy_now_price:item.data.starting_bid});
    item.files.forEach((name,index)=>listings.addImage(id,{fileName:name,alt:`${item.data.title} — equipment photo ${index+1}`,sortOrder:index,isPrimary:index===0?1:0}));
    if(!item.pricing_conflict) engine.startCycle(id,{startsAt,endsAt});
    return {id,slug:item.data.slug,mode:item.pricing_conflict?'buy-now':'auction',photos:item.files.length};
  }))();
  const unchanged=before.every(old=>JSON.stringify(db.prepare('SELECT id,title,bid_count,current_bid,status FROM listings WHERE id=?').get(old.id))===JSON.stringify(old));
  if(!unchanged) throw new Error('Existing inventory changed during import; inspect before proceeding');
  const report={backup,startsAt,endsAt,existingListingsUnchanged:unchanged,inserted};
  fs.writeFileSync(path.join(backupDir,`report-${stamp}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2)); db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
