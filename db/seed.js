'use strict';

/**
 * Populate the database with categories, listings, photos, an administrator
 * and a demonstration buyer. Safe to re-run: existing rows are updated rather
 * than duplicated, so it can be used to refresh the catalogue in place.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { db, migrate } = require('../config/database');
const { CATEGORIES, LISTINGS } = require('./catalog');
const engine = require('../src/services/auctionEngine');
const { addHours, addMinutes, nowIso } = require('../src/services/dates');

async function main() {
  migrate();

  console.log('[seed] categories');
  const insertCategory = db.prepare(`
    INSERT INTO categories (slug, name, description, icon, sort_order)
    VALUES (@slug, @name, @description, @icon, @sort_order)
    ON CONFLICT (slug) DO UPDATE SET
      name = excluded.name, description = excluded.description,
      icon = excluded.icon, sort_order = excluded.sort_order
  `);
  CATEGORIES.forEach((c) => insertCategory.run(c));

  const categoryIds = Object.fromEntries(
    db.prepare('SELECT slug, id FROM categories').all().map((r) => [r.slug, r.id])
  );

  // ---- Administrator ------------------------------------------------------
  console.log('[seed] administrator');
  const adminHash = await bcrypt.hash(config.admin.password, config.security.bcryptRounds);
  db.prepare(`
    INSERT INTO users (
      email, password_hash, full_name, phone, role, status, email_verified,
      kyc_status, address_line1, city, state, postal_code
    ) VALUES (
      @email, @hash, @name, @phone, 'admin', 'active', 1, 'approved',
      @line1, @city, @state, @zip
    )
    ON CONFLICT (email) DO UPDATE SET
      password_hash = excluded.password_hash, role = 'admin',
      email_verified = 1, kyc_status = 'approved'
  `).run({
    email: config.admin.email,
    hash: adminHash,
    name: config.admin.name,
    phone: config.brand.contact.phone,
    line1: config.brand.address.line1,
    city: config.brand.address.city,
    state: config.brand.address.state,
    zip: config.brand.address.postalCode,
  });

  // ---- Demonstration buyer -----------------------------------------------
  // Fully verified so the bidding, agreement and signing flow can be walked
  // end to end immediately after setup.
  console.log('[seed] demo buyer');
  const buyerHash = await bcrypt.hash('DemoBuyer!2026', config.security.bcryptRounds);
  db.prepare(`
    INSERT INTO users (
      email, password_hash, full_name, phone, company, role, status,
      email_verified, kyc_status, kyc_submitted_at, kyc_reviewed_at,
      address_line1, city, state, postal_code
    ) VALUES (
      @email, @hash, @name, @phone, @company, 'buyer', 'active',
      1, 'approved', @now, @now, @line1, @city, @state, @zip
    )
    ON CONFLICT (email) DO UPDATE SET
      password_hash = excluded.password_hash, email_verified = 1,
      kyc_status = 'approved', address_line1 = excluded.address_line1,
      city = excluded.city, state = excluded.state, postal_code = excluded.postal_code
  `).run({
    email: 'buyer@example.com',
    hash: buyerHash,
    name: 'Daniel Okafor',
    phone: '(406) 555-0188',
    company: 'Okafor Earthworks LLC',
    now: nowIso(),
    line1: '1420 Ridgeway Drive',
    city: 'Bozeman',
    state: 'MT',
    zip: '59715',
  });

  // ---- Listings -----------------------------------------------------------
  console.log('[seed] listings');
  const upsertListing = db.prepare(`
    INSERT INTO listings (
      slug, title, category_id, year, make, model, condition,
      hours, serial_number, engine_hp, engine_type, operating_weight, fuel_type,
      emissions_tier, stock_number, lot_number,
      inspection_grade, inspected_at, inspected_by, condition_scores,
      included_items, service_notes, known_faults,
      transport_length, transport_width, transport_height, requires_permit,
      description, highlights, specs,
      location_city, location_state, location_zip,
      buy_now_price, starting_bid, reserve_price, bid_increment,
      status, quantity, keep_selling, is_featured, current_bid
    ) VALUES (
      @slug, @title, @category_id, @year, @make, @model, 'used',
      @hours, @serial_number, @engine_hp, @engine_type, @operating_weight, @fuel_type,
      @emissions_tier, @stock_number, @lot_number,
      @inspection_grade, @inspected_at, @inspected_by, @condition_scores,
      @included_items, @service_notes, @known_faults,
      @transport_length, @transport_width, @transport_height, @requires_permit,
      @description, @highlights, @specs,
      @city, @state, @zip,
      @buy_now_price, @starting_bid, @reserve_price, @bid_increment,
      'live', @quantity, 1, @is_featured, 0
    )
    ON CONFLICT (slug) DO UPDATE SET
      title = excluded.title, category_id = excluded.category_id,
      year = excluded.year, make = excluded.make, model = excluded.model,
      hours = excluded.hours, serial_number = excluded.serial_number,
      engine_hp = excluded.engine_hp, engine_type = excluded.engine_type,
      operating_weight = excluded.operating_weight, fuel_type = excluded.fuel_type,
      emissions_tier = excluded.emissions_tier, stock_number = excluded.stock_number,
      lot_number = excluded.lot_number,
      inspection_grade = excluded.inspection_grade, inspected_at = excluded.inspected_at,
      inspected_by = excluded.inspected_by, condition_scores = excluded.condition_scores,
      included_items = excluded.included_items, service_notes = excluded.service_notes,
      known_faults = excluded.known_faults,
      transport_length = excluded.transport_length, transport_width = excluded.transport_width,
      transport_height = excluded.transport_height, requires_permit = excluded.requires_permit,
      description = excluded.description,
      highlights = excluded.highlights, specs = excluded.specs,
      buy_now_price = excluded.buy_now_price, starting_bid = excluded.starting_bid,
      reserve_price = excluded.reserve_price, bid_increment = excluded.bid_increment,
      quantity = excluded.quantity, is_featured = excluded.is_featured
  `);

  const listingIdBySlug = new Map();

  for (const item of LISTINGS) {
    upsertListing.run({
      slug: item.slug,
      title: item.title,
      category_id: categoryIds[item.category] || null,
      year: item.year,
      make: item.make,
      model: item.model,
      hours: item.hours,
      serial_number: item.serial_number,
      engine_hp: item.engine_hp,
      engine_type: item.engine_type,
      operating_weight: item.operating_weight,
      fuel_type: item.fuel_type,
      emissions_tier: item.emissions_tier || null,
      stock_number: item.stock_number,
      lot_number: item.lot_number ?? null,
      inspection_grade: item.inspection_grade ?? null,
      inspected_at: item.inspected_at || null,
      inspected_by: item.inspected_by || null,
      condition_scores: JSON.stringify(item.condition_scores || []),
      included_items: item.included_items || null,
      service_notes: item.service_notes || null,
      known_faults: item.known_faults || null,
      transport_length: item.transport_length || null,
      transport_width: item.transport_width || null,
      transport_height: item.transport_height || null,
      requires_permit: item.requires_permit ? 1 : 0,
      description: item.description,
      highlights: JSON.stringify(item.highlights || []),
      specs: JSON.stringify(item.specs || []),
      city: config.brand.address.city,
      state: config.brand.address.state,
      zip: config.brand.address.postalCode,
      buy_now_price: item.buy_now_price,
      starting_bid: item.starting_bid,
      reserve_price: item.reserve_price ?? null,
      bid_increment: item.bid_increment,
      quantity: item.quantity ?? 1,
      is_featured: item.featured ? 1 : 0,
    });

    const row = db.prepare('SELECT id FROM listings WHERE slug = ?').get(item.slug);
    listingIdBySlug.set(item.slug, row.id);
  }

  // ---- Photos -------------------------------------------------------------
  console.log('[seed] photos');
  let photoCount = 0;
  for (const item of LISTINGS) {
    const listingId = listingIdBySlug.get(item.slug);
    db.prepare('DELETE FROM listing_images WHERE listing_id = ?').run(listingId);

    for (let i = 1; i <= 8; i += 1) {
      const fileName = `${item.slug}-${i}.jpg`;
      if (!fs.existsSync(path.join(config.dirs.listings, fileName))) continue;

      db.prepare(`
        INSERT INTO listing_images (listing_id, file_name, alt, sort_order, is_primary)
        VALUES (?, ?, ?, ?, ?)
      `).run(listingId, fileName, `${item.title} — photo ${i}`, i - 1, i === 1 ? 1 : 0);
      photoCount += 1;
    }
  }
  if (photoCount === 0) {
    console.warn('[seed] no photos found — run `npm run seed:images` first');
  }

  // ---- Auction cycles -----------------------------------------------------
  // Stagger the closing times so the "ending soonest" ordering is meaningful
  // and the homepage has lots at genuinely different stages.
  console.log('[seed] auction cycles');
  const durations = [5, 11, 20, 27, 38, 46, 54, 63, 71, 80, 92, 108];

  for (const [index, item] of LISTINGS.entries()) {
    const listingId = listingIdBySlug.get(item.slug);

    const startsAt = addMinutes(new Date(), -60).toISOString();
    const endsAt = addHours(new Date(), durations[index % durations.length]).toISOString();

    const open = engine.openCycle(listingId);
    if (open) {
      // Refresh the existing cycle rather than stacking a second one on top.
      // starts_at is pulled back too: a cycle relisted by the auction engine
      // opens after a deliberate delay, and re-seeding should make every lot
      // immediately biddable rather than leaving some not-yet-open.
      db.prepare('UPDATE auction_cycles SET starts_at = ?, ends_at = ? WHERE id = ?')
        .run(startsAt, endsAt, open.id);
      db.prepare(`
        UPDATE listings SET auction_starts_at = ?, auction_ends_at = ?, status = 'live'
         WHERE id = ?
      `).run(startsAt, endsAt, listingId);
      continue;
    }

    engine.startCycle(listingId, { startsAt, endsAt });
  }

  // ---- Settings -----------------------------------------------------------
  console.log('[seed] settings');
  const settings = require('../src/models/settings');
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('agreement_trigger')) {
    Object.entries(settings.DEFAULTS).forEach(([key, value]) => settings.set(key, value));
  }

  // ---- Summary ------------------------------------------------------------
  const counts = {
    categories: db.prepare('SELECT COUNT(*) AS n FROM categories').get().n,
    listings: db.prepare('SELECT COUNT(*) AS n FROM listings').get().n,
    photos: db.prepare('SELECT COUNT(*) AS n FROM listing_images').get().n,
    cycles: db.prepare("SELECT COUNT(*) AS n FROM auction_cycles WHERE status = 'open'").get().n,
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
  };

  console.log('');
  console.log('  Seed complete');
  console.log('  -------------');
  console.log(`  categories     ${counts.categories}`);
  console.log(`  listings       ${counts.listings}`);
  console.log(`  photos         ${counts.photos}`);
  console.log(`  open auctions  ${counts.cycles}`);
  console.log(`  users          ${counts.users}`);
  console.log('');
  console.log('  Sign in as administrator:');
  console.log(`    ${config.admin.email}  /  ${config.admin.password}`);
  console.log('  Sign in as a verified demo buyer:');
  console.log('    buyer@example.com  /  DemoBuyer!2026');
  console.log('');
  console.log('  Change both passwords before this is reachable from the internet.');
  console.log('');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exitCode = 1;
});
