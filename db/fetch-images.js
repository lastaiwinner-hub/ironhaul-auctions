'use strict';

/**
 * Seed photography fetcher.
 *
 * Pulls freely-licensed machine photographs from Wikimedia Commons, resizes
 * them and writes them into public/uploads/listings so the seeded catalogue
 * has real pictures rather than placeholders.
 *
 * Commons imagery is freely licensed but attribution terms vary by file. The
 * licence and author of every downloaded photo are recorded in
 * public/uploads/listings/CREDITS.json — review it before going to production,
 * and replace these with your own yard photography when you have it.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { LISTINGS } = require('./catalog');

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'IronHaulAuctionsSeed/1.0 (equipment auction platform seed script)';
const OUT = config.dirs.listings;
const PER_LISTING = 4;

/** Search terms per catalogue photo key, ordered best-first. */
// Commons holds a great deal of military and museum machinery that matches
// these words. EXCLUDE strips the worst of it so the catalogue shows civilian
// working plant rather than armoured engineering vehicles.
const EXCLUDE = '-military -army -armoured -armored -tank -IDF -war -museum -memorial -toy -model -diecast';

const QUERIES = {
  'excavator': ['Caterpillar excavator', 'hydraulic excavator construction site', 'excavator digging earthworks'],
  'excavator construction site': ['excavator construction site', 'Komatsu excavator', 'excavator earthmoving'],
  'bulldozer': ['Caterpillar D6 bulldozer', 'crawler tractor dozer construction', 'bulldozer earthmoving site'],
  'skid steer loader': ['Bobcat skid steer loader', 'compact track loader construction', 'skid loader'],
  'skid steer': ['skid steer loader construction', 'Bobcat loader', 'compact wheel loader'],
  'track loader construction': ['compact track loader', 'John Deere skid steer', 'track loader construction'],
  'mini excavator': ['mini excavator', 'compact excavator digging', 'Kubota mini excavator'],
  'compact excavator': ['compact excavator', 'mini excavator construction', 'Bobcat mini excavator'],
  'backhoe loader': ['backhoe loader', 'JCB 3CX backhoe', 'tractor loader backhoe construction'],
  'telehandler': ['telehandler', 'telescopic handler construction', 'JCB Loadall telehandler'],
  'wheel loader': ['wheel loader construction', 'front end loader quarry', 'Caterpillar wheel loader'],
  'tractor farm': ['farm tractor field', 'Kubota tractor agriculture', 'agricultural tractor loader'],
};

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  return res.json();
}

/** Search Commons for landscape photographs matching a term. */
async function search(term, limit = 12) {
  const data = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${term} ${EXCLUDE}`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1600',
  });

  const pages = (data.query && data.query.pages) || {};
  return Object.values(pages)
    .map((page) => {
      const info = page.imageinfo && page.imageinfo[0];
      if (!info) return null;
      const meta = info.extmetadata || {};
      return {
        title: page.title,
        url: info.thumburl || info.url,
        width: info.thumbwidth || info.width,
        height: info.thumbheight || info.height,
        licence: strip(meta.LicenseShortName && meta.LicenseShortName.value),
        author: strip(meta.Artist && meta.Artist.value),
        credit: page.title.replace(/^File:/, ''),
        descriptionUrl: info.descriptionurl,
      };
    })
    // Landscape only, and large enough to survive a 1600px resize.
    .filter((img) => img && img.url && img.width >= 900 && img.width > img.height);
}

/**
 * Rank candidates against the model year of the listing.
 *
 * Commons is full of well-photographed vintage and preserved machinery, and a
 * search for "Caterpillar dozer" happily returns a 1960s D8 for a 2019 D3K2
 * listing. Filenames usually carry the make and a year, so scoring on both
 * keeps a modern listing showing a modern machine.
 */
function rankCandidates(images, listing) {
  const targetYear = listing.year;
  const make = (listing.make || '').split(/[\s-]/)[0].toLowerCase();
  const model = (listing.model || '').split(/\s/)[0].toLowerCase();

  return images
    .map((img) => {
      const title = img.title;
      const lower = title.toLowerCase();
      let score = 0;

      // Relevance first. Commons full-text search happily returns a photo whose
      // *description* mentions the make; the filename is a far better signal.
      if (make && lower.includes(make)) score += 6;
      if (model && model.length > 2 && lower.includes(model)) score += 4;
      if (make && !lower.includes(make)) score -= 10;   // almost certainly wrong

      // Strip YYYYMMDD-style filename prefixes before reading model years,
      // otherwise "20200705_..." reads as a 2020 vehicle.
      const cleaned = title.replace(/\b(19|20)\d{6}\b/g, ' ');
      const years = (cleaned.match(/\b(19|20)\d{2}\b/g) || []).map(Number)
        .filter((y) => y >= 1950 && y <= new Date().getFullYear() + 1);

      if (targetYear && years.length) {
        const closest = years.reduce(
          (best, y) => (Math.abs(y - targetYear) < Math.abs(best - targetYear) ? y : best)
        );
        const gap = Math.abs(closest - targetYear);
        if (gap <= 2) score += 4;
        else if (gap <= 5) score += 1;
        else score -= 5;              // a different generation entirely
      }

      // "Classic" almost always means a previous generation.
      if (/\bclassic\b|\bvintage\b|\boldtimer\b|\bhistoric\b|\bmuseum\b/i.test(title)) score -= 6;
      // Detail shots make poor catalogue photography.
      if (/\binterior\b|\bengine bay\b|\bdashboard\b|\bwheel\b|\bbadge\b|\blogo\b/i.test(title)) score -= 4;

      return { ...img, score };
    })
    .sort((a, b) => b.score - a.score);
}

function strip(html) {
  if (!html) return null;
  return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const credits = [];
  const seen = new Set();
  let total = 0;

  for (const listing of LISTINGS) {
    const terms = QUERIES[listing.photo] || [listing.photo];

    // Gather across every term first, then rank once, so a good match from the
    // third query still beats a poor one from the first.
    const pool = [];
    for (const term of terms) {
      let results = [];
      try {
        results = await search(term);
      } catch (err) {
        console.warn(`  ! search failed for "${term}": ${err.message}`);
        continue;
      }
      for (const img of results) {
        if (seen.has(img.title)) continue;      // no duplicate photo across lots
        if (pool.some((p) => p.title === img.title)) continue;
        pool.push(img);
      }
    }

    const chosen = rankCandidates(pool, listing).slice(0, PER_LISTING);
    chosen.forEach((img) => seen.add(img.title));

    if (!chosen.length) {
      console.warn(`  ! no photos found for ${listing.slug}`);
      continue;
    }

    console.log(`${listing.slug} — ${chosen.length} photo(s)`);

    for (const [i, img] of chosen.entries()) {
      const fileName = `${listing.slug}-${i + 1}.jpg`;
      const outPath = path.join(OUT, fileName);

      if (fs.existsSync(outPath)) {
        console.log(`  · ${fileName} (already present)`);
        credits.push({ file: fileName, ...creditFor(img) });
        total += 1;
        continue;
      }

      try {
        const buffer = await download(img.url);
        await sharp(buffer)
          .rotate()
          .resize(1600, 1200, { fit: 'cover', position: 'centre' })
          .jpeg({ quality: 84, progressive: true, mozjpeg: true })
          .toFile(outPath);

        credits.push({ file: fileName, ...creditFor(img) });
        total += 1;
        console.log(`  ✓ ${fileName}`);
      } catch (err) {
        console.warn(`  ! failed ${fileName}: ${err.message}`);
      }

      // Be a considerate API client.
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  fs.writeFileSync(
    path.join(OUT, 'CREDITS.json'),
    JSON.stringify({
      note:
        'Seed photography sourced from Wikimedia Commons. Licences vary per file — ' +
        'review each entry and comply with its attribution terms, or replace these ' +
        'images with your own photography before going to production.',
      generatedAt: new Date().toISOString(),
      images: credits,
    }, null, 2)
  );

  console.log(`\n[images] ${total} photo(s) ready in ${OUT}`);
  console.log('[images] attribution recorded in CREDITS.json');
}

function creditFor(img) {
  return {
    source: 'Wikimedia Commons',
    title: img.credit,
    author: img.author || 'Unknown',
    licence: img.licence || 'See description page',
    descriptionUrl: img.descriptionUrl,
  };
}

main().catch((err) => {
  console.error('[images] failed:', err);
  process.exitCode = 1;
});
