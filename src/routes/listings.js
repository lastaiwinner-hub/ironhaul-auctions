'use strict';

const express = require('express');
const config = require('../../config');
const { db } = require('../../config/database');
const listingModel = require('../models/listing');
const engine = require('../services/auctionEngine');
const userModel = require('../models/user');
const money = require('../services/money');

const router = express.Router();
const B = config.brand;
const PER_PAGE = 12;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

router.get('/inventory', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const filters = {
    q: req.query.q || '',
    category: req.query.category || '',
    make: req.query.make || '',
    model: req.query.model || '',
    yearMin: req.query.year_min || '',
    yearMax: req.query.year_max || '',
    priceMin: money.parse(req.query.price_min),
    priceMax: money.parse(req.query.price_max),
    condition: req.query.condition || '',
    gradeMin: req.query.grade_min || '',
    hoursMax: req.query.hours_max || '',
    onlyAuctions: req.query.filter === 'auction',
    sort: listingModel.SORTS[req.query.sort] ? req.query.sort : 'ending_soon',
  };

  const { rows, total } = listingModel.search({
    ...filters, limit: PER_PAGE, offset: (page - 1) * PER_PAGE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const activeCategory = filters.category
    ? listingModel.categoriesWithCounts().find((c) => c.slug === filters.category)
    : null;

  res.render('pages/inventory', {
    title: activeCategory
      ? `${activeCategory.name} for sale — ${B.name}`
      : `Equipment inventory — ${B.name}`,
    metaDescription: activeCategory
      ? `Browse ${activeCategory.listing_count} ${activeCategory.name.toLowerCase()} available now at auction or Buy Now pricing.`
      : `Browse ${total} machines available now. Filter by make, model, year and price.`,
    bodyClass: 'page-inventory',
    listings: rows,
    thumbsBy: listingModel.thumbsFor(rows.map((r) => r.id)),
    total, page, totalPages,
    filters: { ...filters, priceMin: req.query.price_min || '', priceMax: req.query.price_max || '' },
    facets: listingModel.facets(),
    activeCategory,
    sortOptions: [
      ['ending_soon', 'Ending soonest'],
      ['grade_high', 'Condition: best first'],
      ['hours_low', 'Hours: fewest first'],
      ['newest', 'Newly listed'],
      ['price_low', 'Price: low to high'],
      ['price_high', 'Price: high to low'],
      ['most_bids', 'Most bids'],
      ['year_new', 'Year: newest first'],
    ],
    buildQuery: (overrides = {}) => buildQuery(req.query, overrides),
  });
});

/** Preserve the current filters while changing one of them. */
function buildQuery(current, overrides) {
  const params = new URLSearchParams();
  const merged = { ...current, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// Lot detail
// ---------------------------------------------------------------------------

router.get('/lot/:slug', (req, res, next) => {
  const listing = listingModel.findBySlug(req.params.slug);
  if (!listing) return next();

  listingModel.incrementViews(listing.id);

  const cycle = engine.openCycle(listing.id);
  const history = engine.bidHistory(listing.id, {
    cycleId: cycle ? cycle.id : undefined, limit: 20,
  });

  const eligibility = userModel.bidEligibility(req.user);
  const minimum = engine.minimumBid(listing);

  const myMaxBid = req.user && cycle
    ? db.prepare(`
        SELECT MAX(max_amount) AS max_amount FROM bids
         WHERE cycle_id = ? AND user_id = ?
      `).get(cycle.id, req.user.id).max_amount
    : null;

  const watching = req.user
    ? Boolean(db.prepare('SELECT 1 FROM watchlist WHERE user_id = ? AND listing_id = ?')
        .get(req.user.id, listing.id))
    : false;

  const previousCycles = db.prepare(`
    SELECT c.*, u.full_name AS winner_name
      FROM auction_cycles c
      LEFT JOIN users u ON u.id = c.winning_user_id
     WHERE c.listing_id = ? AND c.status = 'closed'
     ORDER BY c.cycle_number DESC LIMIT 5
  `).all(listing.id);

  return res.render('pages/lot', {
    title: `${listing.title} — ${B.name}`,
    metaDescription: (listing.description || '')
      .replace(/\s+/g, ' ').trim().slice(0, 160)
      || `${listing.title} available now at auction or ${money.formatShort(listing.buy_now_price)} Buy Now.`,
    bodyClass: 'page-lot',
    listing,
    images: listingModel.images(listing.id),
    band: listingModel.gradeBand(listing.inspection_grade),
    cycle,
    history,
    maskBidder: engine.maskBidder,
    eligibility,
    minimum,
    myMaxBid,
    watching,
    previousCycles,
    isHighBidder: Boolean(req.user && listing.high_bidder_id === req.user.id),
    related: listingModel.related(listing, 3),
    meterLabel: listingModel.meterLabel(listing),
    countdown: listing.auction_ends_at
      ? require('../services/dates').countdown(listing.auction_ends_at)
      : null,
  });
});

// Legacy/alternate URL shape, kept so shared links never break.
router.get('/product/:slug', (req, res) => res.redirect(301, `/lot/${req.params.slug}`));

module.exports = router;
