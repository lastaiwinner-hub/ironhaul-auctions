'use strict';

const express = require('express');
const { db } = require('../../config/database');
const listingModel = require('../models/listing');
const engine = require('../services/auctionEngine');
const money = require('../services/money');
const dates = require('../services/dates');

const router = express.Router();

/**
 * Live state for one lot. The lot page polls this so the current bid, the
 * countdown and the bid history stay accurate without a full page reload.
 */
router.get('/lot/:slug/state', (req, res) => {
  const listing = listingModel.findBySlug(req.params.slug);
  if (!listing) return res.status(404).json({ error: 'not_found' });

  const cycle = engine.openCycle(listing.id);
  const countdown = listing.auction_ends_at
    ? dates.countdown(listing.auction_ends_at)
    : { ended: true, label: 'No auction running' };

  const history = engine.bidHistory(listing.id, {
    cycleId: cycle ? cycle.id : undefined, limit: 10,
  }).map((b) => ({
    bidder: engine.maskBidder(b),
    amount: b.amount,
    amountFormatted: money.format(b.amount),
    isAuto: Boolean(b.is_auto),
    at: b.created_at,
    ago: dates.relative(b.created_at),
    isYou: Boolean(req.user && b.user_id === req.user.id),
  }));

  return res.json({
    ok: true,
    status: listing.status,
    currentBid: listing.current_bid,
    currentBidFormatted: listing.current_bid
      ? money.format(listing.current_bid)
      : money.format(listing.starting_bid),
    hasBids: listing.bid_count > 0,
    bidCount: listing.bid_count,
    minimumBid: engine.minimumBid(listing),
    minimumBidFormatted: money.format(engine.minimumBid(listing)),
    increment: listing.bid_increment,
    buyNowPrice: listing.buy_now_price,
    buyNowFormatted: money.format(listing.buy_now_price),
    endsAt: listing.auction_ends_at,
    countdown,
    isHighBidder: Boolean(req.user && listing.high_bidder_id === req.user.id),
    cycleNumber: cycle ? cycle.cycle_number : null,
    history,
  });
});

/** Countdown data for every lot rendered on the current page. */
router.get('/lots/state', (req, res) => {
  const slugs = String(req.query.slugs || '')
    .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40);

  if (!slugs.length) return res.json({ ok: true, lots: [] });

  const placeholders = slugs.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT slug, current_bid, starting_bid, bid_count, auction_ends_at, status
      FROM listings WHERE slug IN (${placeholders})
  `).all(...slugs);

  return res.json({
    ok: true,
    lots: rows.map((l) => ({
      slug: l.slug,
      status: l.status,
      currentBid: l.current_bid || l.starting_bid,
      currentBidFormatted: money.format(l.current_bid || l.starting_bid),
      bidCount: l.bid_count,
      endsAt: l.auction_ends_at,
      countdown: l.auction_ends_at ? dates.countdown(l.auction_ends_at) : null,
    })),
  });
});

/** Typeahead for the catalogue search box. */
router.get('/search/suggest', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ ok: true, results: [] });

  const rows = db.prepare(`
    SELECT slug, title, make, model, year, buy_now_price, current_bid,
           (SELECT file_name FROM listing_images i WHERE i.listing_id = listings.id
             ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS primary_image
      FROM listings
     WHERE status = 'live'
       AND (title LIKE @q OR make LIKE @q OR model LIKE @q OR stock_number LIKE @q)
     ORDER BY is_featured DESC, auction_ends_at ASC LIMIT 8
  `).all({ q: `%${q}%` });

  return res.json({
    ok: true,
    results: rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      price: money.format(r.current_bid || r.buy_now_price),
      image: r.primary_image ? `/uploads/listings/${r.primary_image}` : null,
    })),
  });
});

module.exports = router;
