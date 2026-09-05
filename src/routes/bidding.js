'use strict';

const express = require('express');
const config = require('../../config');
const { db } = require('../../config/database');
const listingModel = require('../models/listing');
const bidding = require('../services/biddingService');
const engine = require('../services/auctionEngine');
const money = require('../services/money');
const { requireAuth, requireVerified, eligibilityRedirect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { limiters, asyncRoute } = require('../middleware/common');

const router = express.Router();
const B = config.brand;

// ---------------------------------------------------------------------------
// Place a bid
// ---------------------------------------------------------------------------

router.post('/lot/:slug/bid',
  requireAuth, requireVerified, limiters.bid,
  asyncRoute(async (req, res) => {
    const listing = listingModel.findBySlug(req.params.slug);
    if (!listing) {
      req.flash('error', 'That lot no longer exists.');
      return res.redirect('/inventory');
    }

    const amount = money.parse(req.body.amount);
    const useProxy = ['1', 'true', 'on', 'yes'].includes(String(req.body.use_max).toLowerCase());
    const maxAmount = useProxy ? money.parse(req.body.max_amount) : null;

    if (!amount) {
      req.flash('error', 'Enter a bid amount.');
      return res.redirect(`/lot/${listing.slug}`);
    }

    try {
      const result = await bidding.bid({
        listingId: listing.id,
        user: req.user,
        amount,
        maxAmount,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      if (result.isLeader) {
        req.flash('success',
          `Bid placed at ${money.format(result.amount)} — you are the highest bidder. ` +
          'Your purchase agreement has been emailed to you for signature.');
      } else {
        req.flash('warning',
          `Your bid was recorded, but another bidder holds a higher automatic maximum. ` +
          `The bid now stands at ${money.format(result.amount)}.`);
      }
      if (result.extended) {
        req.flash('info',
          `A late bid extended this auction by ${B.auction.antiSnipeExtendMin} minutes.`);
      }

      return res.redirect(`/lot/${listing.slug}#bidding`);
    } catch (err) {
      if (err.name !== 'BidError') throw err;

      if (['signin', 'email', 'kyc', 'kyc_pending', 'kyc_rejected', 'address'].includes(err.code)) {
        req.flash('warning', err.message);
        return res.redirect(eligibilityRedirect(err.code));
      }
      req.flash('error', err.message);
      return res.redirect(`/lot/${listing.slug}#bidding`);
    }
  }));

// ---------------------------------------------------------------------------
// Buy Now
// ---------------------------------------------------------------------------

router.get('/lot/:slug/buy', requireAuth, requireVerified, (req, res, next) => {
  const listing = listingModel.findBySlug(req.params.slug);
  if (!listing) return next();

  return res.render('pages/buy-now', {
    title: `Buy now — ${listing.title}`,
    bodyClass: 'page-checkout',
    listing,
    images: listingModel.images(listing.id),
    shippingFee: B.terms.defaultShippingFee,
    values: {
      name: req.user.full_name,
      phone: req.user.phone,
      email: req.user.email,
      line1: req.user.address_line1,
      line2: req.user.address_line2,
      city: req.user.city,
      state: req.user.state,
      zip: req.user.postal_code,
    },
    errors: {},
  });
});

router.post('/lot/:slug/buy',
  requireAuth, requireVerified, limiters.bid,
  asyncRoute(async (req, res, next) => {
    const listing = listingModel.findBySlug(req.params.slug);
    if (!listing) return next();

    const { values, errors } = validate(req.body, {
      name: { required: true, label: 'Full name', maxLength: 120 },
      phone: { required: true, type: 'phone', label: 'Phone number' },
      email: { required: true, type: 'email', label: 'Email' },
      line1: { required: true, label: 'Delivery address', maxLength: 200 },
      line2: { maxLength: 200 },
      city: { required: true, label: 'City', maxLength: 120 },
      state: { required: true, type: 'state', label: 'State' },
      zip: { required: true, type: 'zip', label: 'ZIP code' },
      notes: { maxLength: 1000 },
      confirm: { required: true, requiredMessage: 'Please confirm you accept the terms of sale.' },
    });

    if (Object.keys(errors).length) {
      return res.status(400).render('pages/buy-now', {
        title: `Buy now — ${listing.title}`,
        bodyClass: 'page-checkout',
        listing,
        images: listingModel.images(listing.id),
        shippingFee: B.terms.defaultShippingFee,
        values, errors,
      });
    }

    try {
      const { order } = await bidding.buyNow({
        listingId: listing.id,
        user: req.user,
        delivery: values,
        ip: req.ip,
      });
      return res.redirect(`/order/${order.order_number}/received`);
    } catch (err) {
      if (err.name !== 'BidError') throw err;
      req.flash('error', err.message);
      return res.redirect(`/lot/${listing.slug}`);
    }
  }));

/** Post-purchase confirmation. */
router.get('/order/:number/received', requireAuth, (req, res, next) => {
  const order = require('../models/order').findByNumber(req.params.number);
  if (!order || order.user_id !== req.user.id) return next();

  const agreement = db.prepare(`
    SELECT * FROM agreements WHERE order_id = ? ORDER BY id DESC LIMIT 1
  `).get(order.id);

  return res.render('pages/order-received', {
    title: `Order received — ${B.name}`,
    bodyClass: 'page-thankyou',
    order,
    agreement,
    signUrl: agreement ? `${config.baseUrl}/sign/${agreement.access_token}` : null,
  });
});

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

router.post('/lot/:slug/watch', requireAuth, (req, res, next) => {
  const listing = listingModel.findBySlug(req.params.slug);
  if (!listing) return next();

  const existing = db.prepare(
    'SELECT id FROM watchlist WHERE user_id = ? AND listing_id = ?'
  ).get(req.user.id, listing.id);

  if (existing) {
    db.prepare('DELETE FROM watchlist WHERE id = ?').run(existing.id);
    req.flash('info', 'Removed from your watchlist.');
  } else {
    db.prepare('INSERT INTO watchlist (user_id, listing_id) VALUES (?, ?)')
      .run(req.user.id, listing.id);
    req.flash('success', 'Added to your watchlist.');
  }

  return res.redirect(req.get('referer') || `/lot/${listing.slug}`);
});

// ---------------------------------------------------------------------------
// Delivery estimate
// ---------------------------------------------------------------------------

/**
 * A transparent, distance-based estimate. Without a paid postal-distance API,
 * ZIP prefixes give a defensible approximation, and the quote is always
 * confirmed in writing before payment.
 */
router.post('/lot/:slug/delivery-estimate', asyncRoute(async (req, res) => {
  const listing = listingModel.findBySlug(req.params.slug);
  if (!listing) return res.status(404).json({ error: 'not_found' });

  const zip = String(req.body.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'bad_zip', message: 'Enter a valid 5-digit ZIP code.' });
  }

  const originZip = listing.location_zip || B.address.postalCode;
  const miles = estimateMiles(originZip, zip);
  const cost = Math.round(miles * B.terms.deliveryRatePerMile) * 100;

  return res.json({
    ok: true,
    zip,
    miles,
    cost,
    costFormatted: money.format(cost),
    ratePerMile: B.terms.deliveryRatePerMile,
    origin: `${listing.location_city || B.address.city}, ${listing.location_state || B.address.state} ${originZip}`,
    note: 'Estimate only. Your final delivery quote is confirmed in writing before payment.',
  });
}));

/**
 * Rough road distance from ZIP prefixes. The first digit is a broad US band and
 * the next two narrow it to a sectional centre, which is enough to produce an
 * honest ballpark for a freight estimate.
 */
function estimateMiles(fromZip, toZip) {
  const a = parseInt(String(fromZip).slice(0, 3), 10);
  const b = parseInt(String(toZip).slice(0, 3), 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1200;

  const bandDelta = Math.abs(Math.floor(a / 100) - Math.floor(b / 100));
  const sectionDelta = Math.abs(a - b);

  const miles = Math.round(bandDelta * 520 + (sectionDelta % 100) * 7.5 + 90);
  return Math.min(3200, Math.max(85, miles));
}

module.exports = router;
