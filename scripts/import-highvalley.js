'use strict';
// Prepared supplier catalogue. Dry-run is the default; --photos caches galleries.
// Use --apply only after the owner approves the supplier and Buy Now terms.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const manifest = require('./imports/highvalley-equipment-2026-10-10.json');
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function existingMatch(item, inventory) {
  const d = item.data;
  return inventory.find(row => row.slug === d.slug || row.stock_number === d.stock_number
    || (d.serial_number && normalize(row.serial_number) === normalize(d.serial_number))
    || (Number(row.year) === d.year && normalize(row.make) === normalize(d.make)
      && normalize(row.model) === normalize(d.model)));
}

function imageName(url) {
  const u = new URL(url);
  if (u.origin !== 'https://images.imagingprocessing.com' || u.search || u.hash
    || !/^\/cdn\/[0-9a-f-]{36}$/.test(u.pathname)) throw new Error('Unexpected supplier image URL');
  return `hv-${crypto.createHash('sha256').update(url).digest('hex').slice(0, 24)}.webp`;
}

async function cachePhoto(url, imageDir) {
  const name = imageName(url), dest = path.join(imageDir, name);
  if (fs.existsSync(dest)) {
    const meta = await sharp(dest).metadata();
    if (meta.format === 'webp' && meta.width && meta.height) return name;
    throw new Error(`Invalid cached photo: ${name}`);
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(40000), redirect: 'error' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const chunks = []; let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) throw new Error('Oversized supplier photo');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks), meta = await sharp(bytes).metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format) || !meta.width || !meta.height) throw new Error('Invalid image');
      await sharp(bytes).rotate().webp({ quality: 88 }).toFile(dest + '.part');
      fs.renameSync(dest + '.part', dest);
      return name;
    } catch (error) {
      if (attempt === 3) throw new Error(`${name}: ${error.message}`);
    }
  }
}

async function main() {
  const config = require('../config');
  const { db } = require('../config/database');
  const listings = require('../src/models/listing');
  const apply = process.argv.includes('--apply'), drafts = process.argv.includes('--draft');
  try {
    const inventory = db.prepare('SELECT id,slug,stock_number,serial_number,year,make,model FROM listings').all();
    const pending = [], skipped = [];
    for (const item of manifest.listings) {
      const found = existingMatch(item, inventory);
      if (found) { skipped.push({ slug: item.data.slug, existingId: found.id }); continue; }
      const cat = db.prepare('SELECT id FROM categories WHERE slug=?').get(item.category);
      if (!cat) throw new Error(`Missing category: ${item.category}`);
      if (!Number.isSafeInteger(item.data.buy_now_price) || item.data.buy_now_price <= 0) throw new Error('Invalid Buy Now price');
      if (!item.images.length || new Set(item.images).size !== item.images.length) throw new Error('Empty or duplicate gallery');
      item.images.forEach(imageName);
      pending.push({ ...item, categoryId: cat.id });
    }
    console.log(JSON.stringify({ mode: apply ? (drafts ? 'draft' : 'live-buy-now') : 'dry-run', newListings: pending.length, photos: pending.reduce((n, x) => n + x.images.length, 0), skipped, excluded: manifest.excluded }));
    if (!pending.length || (!apply && !process.argv.includes('--photos'))) return;
    const imageDir = path.join(config.dirs.root, 'public/uploads/listings');
    fs.mkdirSync(imageDir, { recursive: true });
    const jobs = pending.flatMap(item => {
      item.files = new Array(item.images.length);
      return item.images.map((url, index) => ({ item, url, index }));
    });
    let cursor = 0, completed = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < jobs.length) {
        const { item, url, index } = jobs[cursor++];
        item.files[index] = await cachePhoto(url, imageDir);
        if (++completed % 25 === 0) console.log(`PHOTOS ${completed}/${jobs.length}`);
      }
    }));
    console.log(`PHOTOS_READY ${completed}`);
    if (!apply) return;
    const backupDir = path.join(config.dirs.root, 'data/import-backups');
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(backupDir, `before-highvalley-${stamp}.sqlite`);
    await db.backup(backup); fs.chmodSync(backup, 0o600);
    const inserted = db.transaction(() => {
      const current = db.prepare('SELECT * FROM listings ORDER BY id').all();
      const result = [];
      for (const item of pending) {
        if (existingMatch(item, current)) continue;
        const id = listings.create({ ...item.data, category_id: item.categoryId, status: drafts ? 'draft' : 'live', starting_bid: item.data.buy_now_price });
        item.files.forEach((fileName, index) => listings.addImage(id, { fileName, alt: `${item.data.title} — photo ${index + 1}`, sortOrder: index, isPrimary: index === 0 }));
        current.push(listings.findById(id));
        result.push({ id, slug: item.data.slug, price: item.data.buy_now_price / 100, photos: item.files.length });
      }
      // No auction cycle is started and no activity counters are manufactured.
      return result;
    }).immediate();
    const report = { backup, mode: drafts ? 'draft' : 'live-buy-now', inserted };
    fs.writeFileSync(path.join(backupDir, `highvalley-report-${stamp}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { db.close(); }
}
module.exports = { existingMatch, imageName };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
