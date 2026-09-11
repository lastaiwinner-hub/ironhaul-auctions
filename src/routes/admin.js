'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../../config');
const { db } = require('../../config/database');
const userModel = require('../models/user');
const listingModel = require('../models/listing');
const orderModel = require('../models/order');
const settings = require('../models/settings');
const agreements = require('../services/agreementService');
const engine = require('../services/auctionEngine');
const bidding = require('../services/biddingService');
const mailer = require('../services/mailer');
const money = require('../services/money');
const { templates } = require('../services/emailTemplates');
const { buildInvoicePdf } = require('../services/pdfService');
const { requireAdmin, csrfMultipart, assertCsrfChecked } = require('../middleware/auth');
const { asyncRoute } = require('../middleware/common');
const { listingUpload, processImage } = require('../middleware/upload');
const { nowIso, addHours } = require('../services/dates');

const router = express.Router();
const B = config.brand;

router.use(requireAdmin);
router.use((req, res, next) => {
  res.locals.layout = 'layouts/admin';
  res.locals.bodyClass = 'page-admin';
  res.locals.adminNav = req.path;
  next();
});

function audit(req, action, entityType, entityId, detail) {
  db.prepare(`
    INSERT INTO activity_log (user_id, action, entity_type, entity_id, detail, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, action, entityType || null, entityId || null, detail || null, req.ip);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get('/', (req, res) => {
  const users = userModel.counts();
  const orders = orderModel.counts();
  const agr = agreements.counts();

  const recentBids = db.prepare(`
    SELECT b.*, u.full_name, l.title, l.slug
      FROM bids b JOIN users u ON u.id = b.user_id JOIN listings l ON l.id = b.listing_id
     ORDER BY b.created_at DESC LIMIT 10
  `).all();

  const closingSoon = db.prepare(`
    SELECT l.*, (SELECT file_name FROM listing_images i WHERE i.listing_id = l.id
                  ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS primary_image
      FROM listings l
     WHERE l.status = 'live' AND l.auction_ends_at > ?
     ORDER BY l.auction_ends_at ASC LIMIT 8
  `).all(nowIso());

  res.render('admin/dashboard', {
    title: 'Dashboard',
    users, orders, agreements: agr,
    listings: {
      live: listingModel.liveCount(),
      auctions: listingModel.activeAuctionCount(),
      draft: db.prepare("SELECT COUNT(*) AS n FROM listings WHERE status = 'draft'").get().n,
    },
    mail: db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'sent'   THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM email_log
    `).get(),
    messages: db.prepare("SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'new'").get().n,
    recentBids, closingSoon,
  });
});

// ---------------------------------------------------------------------------
// Users & KYC review
// ---------------------------------------------------------------------------

router.get('/users', (req, res) => {
  const { rows, total } = userModel.list({
    search: req.query.q, kycStatus: req.query.kyc, role: req.query.role, limit: 100,
  });
  res.render('admin/users', {
    title: 'Buyers', users: rows, total,
    filters: { q: req.query.q || '', kyc: req.query.kyc || '', role: req.query.role || '' },
  });
});

router.get('/users/:id', (req, res, next) => {
  const user = userModel.findById(req.params.id);
  if (!user) return next();

  return res.render('admin/user-detail', {
    title: user.full_name,
    subject: user,
    documents: Object.fromEntries(
      userModel.getDocuments(user.id).map((d) => [d.doc_type, d])
    ),
    bids: db.prepare(`
      SELECT b.*, l.title, l.slug FROM bids b JOIN listings l ON l.id = b.listing_id
       WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 25
    `).all(user.id),
    orders: orderModel.forUser(user.id),
    agreements: agreements.forUser(user.id),
  });
});

/** KYC document images — administrators only, never a public URL. */
router.get('/users/:id/document/:docType', (req, res, next) => {
  const doc = db.prepare(
    'SELECT * FROM kyc_documents WHERE user_id = ? AND doc_type = ?'
  ).get(req.params.id, req.params.docType);
  if (!doc) return next();

  const filePath = path.join(config.dirs.kyc, doc.file_name);
  if (!fs.existsSync(filePath)) return next();

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.type('image/jpeg').sendFile(filePath);
});

router.post('/users/:id/kyc', asyncRoute(async (req, res, next) => {
  const user = userModel.findById(req.params.id);
  if (!user) return next();

  const approved = req.body.decision === 'approve';
  const reason = String(req.body.reason || '').slice(0, 500);

  userModel.reviewKyc(user.id, { approved, reason, reviewerId: req.user.id });
  audit(req, approved ? 'kyc.approve' : 'kyc.reject', 'user', user.id, reason);

  const mail = approved
    ? templates.kycApproved({ user })
    : templates.kycRejected({ user, reason });
  await mailer.send({
    to: user.email, subject: mail.subject, html: mail.html,
    template: mail.template, relatedType: 'user', relatedId: user.id,
  });

  req.flash('success', approved
    ? `${user.full_name} is verified and can now bid.`
    : `${user.full_name} has been asked to re-upload their documents.`);
  return res.redirect(`/admin/users/${user.id}`);
}));

router.post('/users/:id/status', (req, res, next) => {
  const user = userModel.findById(req.params.id);
  if (!user) return next();

  const status = ['active', 'suspended', 'closed'].includes(req.body.status)
    ? req.body.status : 'active';
  userModel.setStatus(user.id, status);
  audit(req, 'user.status', 'user', user.id, status);

  req.flash('success', `${user.full_name} is now ${status}.`);
  return res.redirect(`/admin/users/${user.id}`);
});

router.post('/users/:id/bid-limit', (req, res, next) => {
  const user = userModel.findById(req.params.id);
  if (!user) return next();

  const limit = money.parse(req.body.bid_limit);
  db.prepare('UPDATE users SET bid_limit = ?, updated_at = ? WHERE id = ?')
    .run(limit || null, nowIso(), user.id);
  audit(req, 'user.bid_limit', 'user', user.id, limit ? money.format(limit) : 'removed');

  req.flash('success', limit
    ? `Bidding limit set to ${money.format(limit)}.`
    : 'Bidding limit removed.');
  return res.redirect(`/admin/users/${user.id}`);
});

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

router.get('/listings', (req, res) => {
  const { rows, total } = listingModel.search({
    q: req.query.q, status: req.query.status || null,
    sort: 'newest', limit: 100,
  });
  res.render('admin/listings', {
    title: 'Inventory', listings: rows, total,
    filters: { q: req.query.q || '', status: req.query.status || '' },
  });
});

router.get('/listings/new', (req, res) => {
  res.render('admin/listing-form', {
    title: 'Add a machine',
    listing: null, images: [],
    categories: listingModel.categoriesWithCounts(),
    errors: {},
  });
});

router.get('/listings/:id/edit', (req, res, next) => {
  const listing = listingModel.findById(req.params.id);
  if (!listing) return next();

  return res.render('admin/listing-form', {
    title: listing.title,
    listing,
    images: listingModel.images(listing.id),
    categories: listingModel.categoriesWithCounts(),
    cycles: db.prepare(`
      SELECT c.*, u.full_name AS winner_name FROM auction_cycles c
        LEFT JOIN users u ON u.id = c.winning_user_id
       WHERE c.listing_id = ? ORDER BY c.cycle_number DESC
    `).all(listing.id),
    errors: {},
  });
});

router.post('/listings',
  listingUpload, csrfMultipart, assertCsrfChecked,
  asyncRoute(async (req, res) => {
  const data = parseListingForm(req.body);
  const errors = validateListing(data);

  if (Object.keys(errors).length) {
    return res.status(400).render('admin/listing-form', {
      title: 'Add a machine',
      listing: req.body, images: [],
      categories: listingModel.categoriesWithCounts(),
      errors,
    });
  }

  const id = listingModel.create(data);
  await saveImages(id, req.files);

  engine.startCycle(id, {
    endsAt: data.auction_ends_at || addHours(new Date(), B.auction.defaultDurationHours),
  });
  audit(req, 'listing.create', 'listing', id, data.title);

  req.flash('success', `${data.title} is live, with its first auction cycle open.`);
  return res.redirect(`/admin/listings/${id}/edit`);
}));

router.post('/listings/:id',
  listingUpload, csrfMultipart, assertCsrfChecked,
  asyncRoute(async (req, res, next) => {
  const listing = listingModel.findById(req.params.id);
  if (!listing) return next();

  const data = parseListingForm(req.body);
  const errors = validateListing(data, listing.id);

  if (Object.keys(errors).length) {
    return res.status(400).render('admin/listing-form', {
      title: listing.title,
      listing: { ...listing, ...req.body },
      images: listingModel.images(listing.id),
      categories: listingModel.categoriesWithCounts(),
      errors,
    });
  }

  listingModel.update(listing.id, data);
  await saveImages(listing.id, req.files);
  audit(req, 'listing.update', 'listing', listing.id, data.title);

  req.flash('success', 'Listing saved.');
  return res.redirect(`/admin/listings/${listing.id}/edit`);
}));

router.post('/listings/:id/images/:imageId/delete', (req, res, next) => {
  const image = db.prepare('SELECT * FROM listing_images WHERE id = ? AND listing_id = ?')
    .get(req.params.imageId, req.params.id);
  if (!image) return next();

  const filePath = path.join(config.dirs.listings, image.file_name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  listingModel.removeImage(image.id);

  req.flash('success', 'Photo removed.');
  return res.redirect(`/admin/listings/${req.params.id}/edit`);
});

router.post('/listings/:id/images/:imageId/primary', (req, res) => {
  db.prepare('UPDATE listing_images SET is_primary = 0 WHERE listing_id = ?').run(req.params.id);
  db.prepare('UPDATE listing_images SET is_primary = 1 WHERE id = ?').run(req.params.imageId);
  req.flash('success', 'Main photo updated.');
  return res.redirect(`/admin/listings/${req.params.id}/edit`);
});

/** Open a fresh auction cycle by hand — used to relist early or after a pause. */
router.post('/listings/:id/cycle', (req, res, next) => {
  const listing = listingModel.findById(req.params.id);
  if (!listing) return next();

  const hours = parseInt(req.body.hours, 10) || B.auction.defaultDurationHours;
  const open = engine.openCycle(listing.id);
  if (open) {
    db.prepare("UPDATE auction_cycles SET status = 'cancelled', closed_at = ? WHERE id = ?")
      .run(nowIso(), open.id);
    db.prepare("UPDATE bids SET status = 'lost' WHERE cycle_id = ? AND status = 'active'")
      .run(open.id);
  }

  const cycle = engine.startCycle(listing.id, {
    endsAt: addHours(new Date(), hours),
  });
  audit(req, 'listing.cycle', 'listing', listing.id, `cycle #${cycle.cycle_number}`);

  req.flash('success', `Auction cycle #${cycle.cycle_number} is open for ${hours} hours.`);
  return res.redirect(`/admin/listings/${listing.id}/edit`);
});

router.post('/listings/:id/close', asyncRoute(async (req, res, next) => {
  const listing = listingModel.findById(req.params.id);
  if (!listing) return next();

  const open = engine.openCycle(listing.id);
  if (!open) {
    req.flash('warning', 'There is no open cycle on this lot.');
    return res.redirect(`/admin/listings/${listing.id}/edit`);
  }

  // Bring the deadline forward and settle immediately.
  db.prepare('UPDATE auction_cycles SET ends_at = ? WHERE id = ?').run(nowIso(), open.id);
  const outcome = engine.closeCycle(open.id);
  if (outcome) await bidding.notifyCycleOutcome(outcome);
  audit(req, 'listing.close', 'listing', listing.id, `cycle #${open.cycle_number}`);

  req.flash('success', outcome && outcome.winner
    ? `Closed — won at ${money.format(outcome.winner.amount)}. Winner has been emailed.`
    : 'Closed with no winning bid.');
  return res.redirect(`/admin/listings/${listing.id}/edit`);
}));

router.post('/listings/:id/delete', (req, res, next) => {
  const listing = listingModel.findById(req.params.id);
  if (!listing) return next();

  for (const image of listingModel.images(listing.id)) {
    const filePath = path.join(config.dirs.listings, image.file_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  listingModel.remove(listing.id);
  audit(req, 'listing.delete', 'listing', listing.id, listing.title);

  req.flash('success', `${listing.title} deleted.`);
  return res.redirect('/admin/listings');
});

function parseListingForm(body) {
  const highlights = String(body.highlights || '')
    .split('\n').map((s) => s.trim()).filter(Boolean);

  let specs = [];
  if (body.specs) {
    try { specs = JSON.parse(body.specs); } catch { specs = []; }
  }

  // Wear meters come in as "Undercarriage 85" per line — one system, one score.
  const scores = String(body.condition_scores || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)[\s:]+(\d{1,3})\s*%?$/);
      if (!match) return null;
      return { label: match[1].trim(), pct: Math.max(0, Math.min(100, Number(match[2]))) };
    })
    .filter(Boolean);

  return {
    title: String(body.title || '').trim(),
    slug: slugify(body.slug || body.title),
    category_id: body.category_id ? Number(body.category_id) : null,
    year: body.year ? Number(body.year) : null,
    make: String(body.make || '').trim() || null,
    model: String(body.model || '').trim() || null,
    condition: ['new', 'used', 'certified'].includes(body.condition) ? body.condition : 'used',
    hours: body.hours === '' || body.hours === undefined ? null : Number(body.hours),
    serial_number: String(body.serial_number || '').trim() || null,
    engine_hp: body.engine_hp ? Number(body.engine_hp) : null,
    engine_type: String(body.engine_type || '').trim() || null,
    operating_weight: body.operating_weight ? Number(body.operating_weight) : null,
    fuel_type: String(body.fuel_type || '').trim() || null,
    stock_number: String(body.stock_number || '').trim() || null,
    emissions_tier: String(body.emissions_tier || '').trim() || null,
    lot_number: body.lot_number ? Number(body.lot_number) : null,
    inspection_grade: body.inspection_grade === '' || body.inspection_grade === undefined
      ? null : Math.max(0, Math.min(5, Number(body.inspection_grade))),
    inspected_at: String(body.inspected_at || '').trim() || null,
    inspected_by: String(body.inspected_by || '').trim() || null,
    condition_scores: JSON.stringify(scores),
    included_items: String(body.included_items || '').trim() || null,
    service_notes: String(body.service_notes || '').trim() || null,
    known_faults: String(body.known_faults || '').trim() || null,
    lien_status: String(body.lien_status || '').trim() || 'Title clear, no liens',
    transport_length: String(body.transport_length || '').trim() || null,
    transport_width: String(body.transport_width || '').trim() || null,
    transport_height: String(body.transport_height || '').trim() || null,
    requires_permit: body.requires_permit ? 1 : 0,
    description: String(body.description || '').trim() || null,
    highlights: JSON.stringify(highlights),
    specs: JSON.stringify(specs),
    location_city: String(body.location_city || B.address.city).trim(),
    location_state: String(body.location_state || B.address.state).trim(),
    location_zip: String(body.location_zip || B.address.postalCode).trim(),
    buy_now_price: money.parse(body.buy_now_price) || 0,
    starting_bid: money.parse(body.starting_bid) || 0,
    reserve_price: money.parse(body.reserve_price),
    bid_increment: money.parse(body.bid_increment) || B.auction.defaultIncrement,
    auction_ends_at: body.auction_ends_at
      ? new Date(body.auction_ends_at).toISOString() : null,
    status: ['draft', 'live', 'ended', 'sold', 'archived'].includes(body.status)
      ? body.status : 'live',
    quantity: body.quantity === '' || body.quantity === undefined ? 1 : Number(body.quantity),
    keep_selling: body.keep_selling ? 1 : 0,
    is_featured: body.is_featured ? 1 : 0,
  };
}

function validateListing(data, excludeId = null) {
  const errors = {};
  if (!data.title) errors.title = 'A title is required.';
  if (!data.slug) errors.slug = 'A URL slug is required.';
  if (!data.buy_now_price) errors.buy_now_price = 'Set a Buy Now price.';
  if (!data.starting_bid) errors.starting_bid = 'Set an opening bid.';
  if (data.starting_bid && data.buy_now_price && data.starting_bid > data.buy_now_price) {
    errors.starting_bid = 'The opening bid cannot exceed the Buy Now price.';
  }
  if (data.reserve_price && data.buy_now_price && data.reserve_price > data.buy_now_price) {
    errors.reserve_price = 'The reserve cannot exceed the Buy Now price.';
  }

  if (data.slug) {
    const clash = excludeId
      ? db.prepare('SELECT 1 FROM listings WHERE slug = ? AND id != ?').get(data.slug, excludeId)
      : db.prepare('SELECT 1 FROM listings WHERE slug = ?').get(data.slug);
    if (clash) errors.slug = 'That URL slug is already used by another listing.';
  }
  return errors;
}

function slugify(value) {
  return String(value || '').toLowerCase().trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function saveImages(listingId, files) {
  if (!files || !files.length) return;
  const existing = listingModel.images(listingId).length;

  for (const [i, file] of files.entries()) {
    const processed = await processImage(file.buffer, {
      dir: config.dirs.listings,
      prefix: `lot${listingId}`,
      maxWidth: 1800,
      quality: 84,
    });
    listingModel.addImage(listingId, {
      fileName: processed.fileName,
      sortOrder: existing + i,
      isPrimary: existing === 0 && i === 0 ? 1 : 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

router.get('/orders', (req, res) => {
  const { rows, total } = orderModel.list({
    status: req.query.status, type: req.query.type, search: req.query.q, limit: 100,
  });
  res.render('admin/orders', {
    title: 'Orders', orders: rows, total,
    filters: { status: req.query.status || '', type: req.query.type || '', q: req.query.q || '' },
  });
});

router.get('/orders/:id', (req, res, next) => {
  const order = orderModel.findById(req.params.id);
  if (!order) return next();

  return res.render('admin/order-detail', {
    title: order.order_number,
    order,
    listing: listingModel.findById(order.listing_id),
    buyer: userModel.findById(order.user_id),
    agreement: db.prepare('SELECT * FROM agreements WHERE order_id = ? ORDER BY id DESC LIMIT 1')
      .get(order.id),
  });
});

router.post('/orders/:id/status', asyncRoute(async (req, res, next) => {
  const order = orderModel.findById(req.params.id);
  if (!order) return next();

  const status = req.body.status;
  const allowed = ['pending_agreement', 'agreement_sent', 'agreement_signed',
    'invoiced', 'paid', 'in_transit', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    req.flash('error', 'Unknown order status.');
    return res.redirect(`/admin/orders/${order.id}`);
  }

  // The executed contract gates everything from invoicing onward.
  const blocked = orderModel.signatureBlocks(order, status);
  if (blocked) {
    req.flash('error',
      `Cannot move ${order.order_number} to ${status} — ${blocked}. ` +
      'Send the agreement and wait for the buyer to sign it first.');
    return res.redirect(`/admin/orders/${order.id}`);
  }

  orderModel.setStatus(order.id, status);
  audit(req, 'order.status', 'order', order.id, status);

  // Status changes the buyer needs to hear about.
  const buyer = userModel.findById(order.user_id);
  const listing = listingModel.findById(order.listing_id);

  if (status === 'invoiced') {
    const mail = templates.invoice({
      user: buyer, order: orderModel.findById(order.id), listing, wire: settings.wire(),
    });
    const invoicePath = path.join(config.dirs.agreements, `INV-${order.order_number}.pdf`);
    await buildInvoicePdf(
      { order: orderModel.findById(order.id), listing, user: buyer, wire: settings.wire() },
      invoicePath
    );
    await mailer.send({
      to: buyer.email, subject: mail.subject, html: mail.html, template: mail.template,
      relatedType: 'order', relatedId: order.id,
      attachments: [{ filename: `Invoice_${order.order_number}.pdf`, path: invoicePath }],
    });
    req.flash('success', 'Invoice generated and emailed with wire instructions.');
  } else if (status === 'in_transit') {
    const mail = templates.orderShipped({
      user: buyer, order: orderModel.findById(order.id), listing,
    });
    await mailer.send({
      to: buyer.email, subject: mail.subject, html: mail.html, template: mail.template,
      relatedType: 'order', relatedId: order.id,
    });
    req.flash('success', 'Buyer notified that the machine is in transit.');
  } else {
    req.flash('success', `Order marked ${status.replace(/_/g, ' ')}.`);
  }

  return res.redirect(`/admin/orders/${order.id}`);
}));

router.post('/orders/:id/tracking', (req, res, next) => {
  const order = orderModel.findById(req.params.id);
  if (!order) return next();

  orderModel.setTracking(order.id, {
    carrier: String(req.body.carrier || '').trim(),
    trackingNumber: String(req.body.tracking_number || '').trim(),
  });
  audit(req, 'order.tracking', 'order', order.id, req.body.tracking_number);

  req.flash('success', 'Tracking details saved.');
  return res.redirect(`/admin/orders/${order.id}`);
});

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

router.get('/agreements', (req, res) => {
  const { rows, total } = agreements.list({
    status: req.query.status, search: req.query.q, limit: 100,
  });
  res.render('admin/agreements', {
    title: 'Agreements', agreements: rows, total,
    filters: { status: req.query.status || '', q: req.query.q || '' },
  });
});

router.get('/agreements/:id', (req, res, next) => {
  const agreement = agreements.findById(req.params.id);
  if (!agreement) return next();

  let auditTrail = [];
  try { auditTrail = JSON.parse(agreement.audit_trail || '[]'); } catch { auditTrail = []; }

  return res.render('admin/agreement-detail', {
    title: `Agreement ${agreement.agreement_number}`,
    agreement, auditTrail,
    buyer: userModel.findById(agreement.user_id),
    listing: listingModel.findById(agreement.listing_id),
    signUrl: agreements.signUrl(agreement),
  });
});

router.get('/agreements/:id/pdf', (req, res, next) => {
  const agreement = agreements.findById(req.params.id);
  if (!agreement) return next();

  const fileName = agreement.pdf_signed || agreement.pdf_unsigned;
  if (!fileName) return next();
  const filePath = path.join(config.dirs.agreements, fileName);
  if (!fs.existsSync(filePath)) return next();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  return res.sendFile(filePath);
});

router.post('/agreements/:id/resend', asyncRoute(async (req, res, next) => {
  const agreement = agreements.findById(req.params.id);
  if (!agreement) return next();

  await agreements.send(agreement.id);
  audit(req, 'agreement.resend', 'agreement', agreement.id, agreement.buyer_email);

  req.flash('success', `Signature request re-sent to ${agreement.buyer_email}.`);
  return res.redirect(`/admin/agreements/${agreement.id}`);
}));

/**
 * Approve a signed agreement and send the buyer their payment details.
 *
 * Signing commits the buyer; this is where we commit. It is deliberately a
 * button someone presses rather than an automatic consequence of signing,
 * because a bid worth five figures deserves a human looking at it first.
 */
router.post('/agreements/:id/payment', asyncRoute(async (req, res, next) => {
  const agreement = agreements.findById(req.params.id);
  if (!agreement) return next();

  if (agreement.status !== 'signed') {
    req.flash('error',
      `${agreement.agreement_number} has not been signed yet, so there is `
      + 'nothing to invoice. Payment details only go out against a signed contract.');
    return res.redirect(`/admin/agreements/${agreement.id}`);
  }

  const buyer = userModel.findById(agreement.user_id);
  const listing = listingModel.findById(agreement.listing_id);

  // Attach an order if one does not exist yet, so the payment has something to
  // hang off and the buyer can see it in their account.
  let order = db.prepare('SELECT * FROM orders WHERE id = ?').get(agreement.order_id || 0);
  if (!order) {
    const orderId = orderModel.create({
      userId: agreement.user_id,
      listingId: agreement.listing_id,
      cycleId: null,
      type: 'auction_win',
      amount: agreement.purchase_price,
      shippingFee: agreement.shipping_fee || 0,
      total: agreement.total_amount,
      delivery: {
        name: agreement.buyer_name,
        phone: agreement.buyer_phone,
        email: agreement.buyer_email,
        line1: agreement.buyer_line1,
        line2: agreement.buyer_line2,
        city: agreement.buyer_city,
        state: agreement.buyer_state,
        zip: agreement.buyer_zip,
      },
    });
    db.prepare('UPDATE agreements SET order_id = ? WHERE id = ?').run(orderId, agreement.id);
    order = orderModel.findById(orderId);
  }

  orderModel.setStatus(order.id, 'invoiced');

  const mail = templates.invoice({
    user: buyer,
    order: orderModel.findById(order.id),
    listing,
    wire: settings.wire(),
  });
  await mailer.send({
    to: agreement.buyer_email || buyer.email,
    subject: mail.subject,
    html: mail.html,
    template: mail.template,
    relatedType: 'order',
    relatedId: order.id,
  });

  audit(req, 'agreement.payment_sent', 'agreement', agreement.id, order.order_number);
  req.flash('success',
    `Payment details sent to ${agreement.buyer_email || buyer.email} for ${order.order_number}.`);
  return res.redirect(`/admin/agreements/${agreement.id}`);
}));

router.post('/agreements/:id/void', (req, res, next) => {
  const agreement = agreements.findById(req.params.id);
  if (!agreement) return next();

  agreements.voidAgreement(agreement.id, String(req.body.reason || '').slice(0, 300));
  audit(req, 'agreement.void', 'agreement', agreement.id, req.body.reason);

  req.flash('success', 'Agreement voided.');
  return res.redirect(`/admin/agreements/${agreement.id}`);
});

// ---------------------------------------------------------------------------
// Messages, email log, settings
// ---------------------------------------------------------------------------

router.get('/messages', (req, res) => {
  const messages = db.prepare(
    'SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200'
  ).all();
  db.prepare("UPDATE contact_messages SET status = 'read' WHERE status = 'new'").run();
  res.render('admin/messages', { title: 'Messages', messages });
});

router.get('/email-log', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM email_log
     ${req.query.status ? 'WHERE status = @status' : ''}
     ORDER BY created_at DESC LIMIT 200
  `).all({ status: req.query.status });

  res.render('admin/email-log', {
    title: 'Email log', rows,
    filters: { status: req.query.status || '' },
    outboxDir: config.mail.outboxDir,
    mailMode: config.mail.enabled && config.mail.host ? 'smtp' : 'file-outbox',
  });
});

router.get('/settings', asyncRoute(async (req, res) => {
  res.render('admin/settings', {
    title: 'Settings',
    values: settings.all(),
    triggers: agreements.TRIGGERS,
    mailStatus: await mailer.verifyConnection(),
  });
}));

router.post('/settings', (req, res) => {
  const keys = [
    'agreement_trigger', 'auto_send_agreement', 'require_kyc_to_bid',
    'require_kyc_to_buy', 'wire_beneficiary', 'wire_bank', 'wire_account',
    'wire_routing', 'wire_swift', 'maintenance_mode',
  ];
  const checkboxes = ['auto_send_agreement', 'require_kyc_to_bid',
    'require_kyc_to_buy', 'maintenance_mode'];

  for (const key of keys) {
    if (checkboxes.includes(key)) {
      settings.set(key, req.body[key] ? '1' : '0');
    } else if (req.body[key] !== undefined) {
      settings.set(key, req.body[key]);
    }
  }
  audit(req, 'settings.update', 'settings', null, null);

  req.flash('success', 'Settings saved.');
  return res.redirect('/admin/settings');
});

router.get('/activity', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.full_name FROM activity_log a
      LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 300
  `).all();
  res.render('admin/activity', { title: 'Activity log', rows });
});

module.exports = router;
