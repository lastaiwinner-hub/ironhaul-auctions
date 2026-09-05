'use strict';

/**
 * The orchestration layer between a user action and everything that must
 * happen because of it: the bid itself, the outbid notice, the pre-filled
 * purchase agreement, the order, the emails.
 *
 * The auction engine stays purely transactional; all side effects live here so
 * that a slow SMTP server can never hold a database write open.
 */

const { db } = require('../../config/database');
const config = require('../../config');
const engine = require('./auctionEngine');
const agreements = require('./agreementService');
const mailer = require('./mailer');
const money = require('./money');
const { templates } = require('./emailTemplates');
const listingModel = require('../models/listing');
const orderModel = require('../models/order');
const userModel = require('../models/user');
const settings = require('../models/settings');

const B = config.brand;

/**
 * Place a bid and run every downstream automation.
 *
 * The bid is committed first and on its own. Email and PDF work happens after,
 * wrapped so that a failure there is logged but never loses the bid.
 */
async function bid({ listingId, user, amount, maxAmount, ip, userAgent }) {
  const eligibility = userModel.bidEligibility(user);
  if (!eligibility.eligible) {
    throw new engine.BidError(eligibility.reason, eligibility.message);
  }

  const result = engine.placeBid({
    listingId, userId: user.id, amount, maxAmount, ip, userAgent,
  });

  const listing = listingModel.findById(listingId);
  const bidRow = db.prepare('SELECT * FROM bids WHERE id = ?').get(result.bidId);

  const side = { agreement: null, emails: [] };

  try {
    // ---- The core automation: bidding produces a ready-to-sign contract ----
    let agreement = null;
    if (agreements.trigger() === 'on_bid') {
      agreement = await agreements.issue({
        user, listing,
        amount: result.amount,
        triggerType: 'bid',
        bidId: result.bidId,
      });
      side.agreement = agreement;
    }

    // ---- Confirmation to the bidder ----
    if (agreement) {
      const mail = templates.bidPlaced({
        user, listing, bid: bidRow, agreement,
        signUrl: agreements.signUrl(agreement),
        isLeader: result.isLeader,
      });
      await mailer.send({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        template: mail.template,
        relatedType: 'bid',
        relatedId: result.bidId,
        attachments: agreement.pdf_unsigned
          ? [{
              filename: `Purchase_Agreement_${agreement.agreement_number}.pdf`,
              path: require('path').join(config.dirs.agreements, agreement.pdf_unsigned),
            }]
          : [],
      });
      side.emails.push('bid_placed');

      if (settings.getBool('auto_send_agreement', true) && agreement.status === 'draft') {
        db.prepare(`
          UPDATE agreements SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?
        `).run(new Date().toISOString(), new Date().toISOString(), agreement.id);
        agreements.appendAudit(agreement.id, {
          event: 'sent',
          label: `Sent for signature to ${user.email}`,
          ip,
        });
      }
    }

    // ---- Outbid notice to whoever just lost the lead ----
    if (result.outbidUserId) {
      const outbidUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.outbidUserId);
      const theirBid = db.prepare(`
        SELECT MAX(amount) AS amount FROM bids
         WHERE cycle_id = ? AND user_id = ?
      `).get(result.cycleId, result.outbidUserId);

      if (outbidUser) {
        const mail = templates.outbid({
          user: outbidUser, listing,
          yourBid: theirBid.amount,
          currentBid: result.amount,
          minimumNext: result.nextMinimum,
        });
        await mailer.send({
          to: outbidUser.email,
          subject: mail.subject,
          html: mail.html,
          template: mail.template,
          relatedType: 'listing',
          relatedId: listing.id,
        });
        side.emails.push('outbid');
      }
    }
  } catch (err) {
    console.error('[bidding] post-bid automation failed:', err);
    side.error = err.message;
  }

  return { ...result, listing, bid: bidRow, ...side };
}

/**
 * Instant purchase. Always raises an order and always issues an agreement,
 * regardless of the auction agreement trigger.
 */
async function buyNow({ listingId, user, delivery, ip }) {
  const eligibility = userModel.bidEligibility(user);
  if (!eligibility.eligible && settings.getBool('require_kyc_to_buy', true)) {
    throw new engine.BidError(eligibility.reason, eligibility.message);
  }

  const listing = listingModel.findById(listingId);
  if (!listing) throw new engine.BidError('not_found', 'This listing no longer exists.');
  if (!['live', 'ended'].includes(listing.status) || listing.quantity < 1) {
    throw new engine.BidError('unavailable', 'This machine is no longer available.');
  }

  const shippingFee = B.terms.defaultShippingFee;

  const order = orderModel.create({
    userId: user.id,
    listingId: listing.id,
    cycleId: null,
    type: 'buy_now',
    amount: listing.buy_now_price,
    shippingFee,
    delivery,
  });

  const agreement = await agreements.issue({
    user, listing,
    amount: listing.buy_now_price,
    shippingFee,
    triggerType: 'buy_now',
    orderId: order.id,
  });

  const mail = templates.buyNowReceived({
    user, listing, order, agreement, signUrl: agreements.signUrl(agreement),
  });
  await mailer.send({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    template: mail.template,
    relatedType: 'order',
    relatedId: order.id,
    attachments: agreement.pdf_unsigned
      ? [{
          filename: `Purchase_Agreement_${agreement.agreement_number}.pdf`,
          path: require('path').join(config.dirs.agreements, agreement.pdf_unsigned),
        }]
      : [],
  });

  db.prepare(`
    UPDATE agreements SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'
  `).run(new Date().toISOString(), new Date().toISOString(), agreement.id);
  agreements.appendAudit(agreement.id, {
    event: 'sent', label: `Sent for signature to ${user.email}`, ip,
  });

  orderModel.setStatus(order.id, 'agreement_sent');

  const alert = templates.adminAlert({
    title: `Buy Now order — ${order.order_number}`,
    lines: [
      ['Buyer', `${user.full_name} (${user.email})`],
      ['Equipment', listing.title],
      ['Amount', money.format(order.total)],
      ['Deliver to', `${delivery.city || ''}, ${delivery.state || ''} ${delivery.zip || ''}`],
    ],
    url: `${config.baseUrl}/admin/orders/${order.id}`,
    label: 'Open order',
  });
  await mailer.send({
    to: config.mail.adminNotify,
    subject: alert.subject,
    html: alert.html,
    template: alert.template,
    relatedType: 'order',
    relatedId: order.id,
  });

  return { order: orderModel.findById(order.id), agreement, listing };
}

/**
 * Settle every auction whose clock has run out. Called by the scheduler each
 * minute, and safe to call concurrently — closeCycle is transactional and a
 * cycle already closed is skipped.
 */
async function closeDueAuctions() {
  const due = engine.dueCycles();
  const settled = [];

  for (const cycle of due) {
    let outcome;
    try {
      outcome = engine.closeCycle(cycle.id);
    } catch (err) {
      console.error(`[auction] failed to close cycle ${cycle.id}:`, err);
      continue;
    }
    if (!outcome) continue;

    try {
      await notifyCycleOutcome(outcome);
    } catch (err) {
      console.error(`[auction] notification failed for cycle ${cycle.id}:`, err);
    }
    settled.push(outcome);
  }

  return settled;
}

/** Winner gets an order plus their agreement; everyone else gets a close-out. */
async function notifyCycleOutcome(outcome) {
  const { listing, winner, losers, nextCycle } = outcome;
  const fresh = listingModel.findById(listing.id);

  if (winner) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(winner.userId);
    const shippingFee = B.terms.defaultShippingFee;

    const order = orderModel.create({
      userId: user.id,
      listingId: listing.id,
      cycleId: outcome.cycle.id,
      type: 'auction_win',
      amount: winner.amount,
      shippingFee,
      delivery: {
        name: user.full_name,
        phone: user.phone,
        email: user.email,
        line1: user.address_line1,
        line2: user.address_line2,
        city: user.city,
        state: user.state,
        zip: user.postal_code,
        country: user.country,
      },
    });

    // Reuse the contract the bidder already holds where possible, so a buyer
    // who signed at bid time is not asked to sign a second time.
    const existing = agreements.findOpenFor(user.id, listing.id);
    let agreement;

    if (existing) {
      agreement = await agreements.issue({
        user, listing, amount: winner.amount, shippingFee,
        triggerType: 'auction_win', orderId: order.id, bidId: winner.bidId,
      });
    } else {
      const alreadySigned = db.prepare(`
        SELECT * FROM agreements
         WHERE user_id = ? AND listing_id = ? AND status = 'signed'
         ORDER BY id DESC LIMIT 1
      `).get(user.id, listing.id);

      if (alreadySigned) {
        db.prepare('UPDATE agreements SET order_id = ? WHERE id = ?')
          .run(order.id, alreadySigned.id);
        agreement = agreements.findById(alreadySigned.id);
        orderModel.setStatus(order.id, 'agreement_signed');
      } else {
        agreement = await agreements.issue({
          user, listing, amount: winner.amount, shippingFee,
          triggerType: 'auction_win', orderId: order.id, bidId: winner.bidId,
        });
      }
    }

    const mail = templates.auctionWon({
      user, listing: fresh, amount: winner.amount, order, agreement,
      signUrl: agreements.signUrl(agreement),
      shippingFee, total: order.total,
    });
    await mailer.send({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      template: mail.template,
      relatedType: 'order',
      relatedId: order.id,
      attachments: agreement.pdf_unsigned && agreement.status !== 'signed'
        ? [{
            filename: `Purchase_Agreement_${agreement.agreement_number}.pdf`,
            path: require('path').join(config.dirs.agreements, agreement.pdf_unsigned),
          }]
        : [],
    });

    if (agreement.status === 'draft') {
      db.prepare(`
        UPDATE agreements SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), new Date().toISOString(), agreement.id);
      agreements.appendAudit(agreement.id, {
        event: 'sent', label: `Sent for signature to ${user.email}`,
      });
    }
    if (agreement.status !== 'signed') {
      orderModel.setStatus(order.id, 'agreement_sent');
    }

    const alert = templates.adminAlert({
      title: `Auction won — ${listing.title}`,
      lines: [
        ['Order', order.order_number],
        ['Winner', `${user.full_name} (${user.email})`],
        ['Hammer price', money.format(winner.amount)],
        ['Agreement', `${agreement.agreement_number} (${agreement.status})`],
        ['Relisted', nextCycle ? `Yes — cycle #${nextCycle.cycle_number}` : 'No'],
      ],
      url: `${config.baseUrl}/admin/orders/${order.id}`,
      label: 'Open order',
    });
    await mailer.send({
      to: config.mail.adminNotify,
      subject: alert.subject,
      html: alert.html,
      template: alert.template,
      relatedType: 'order',
      relatedId: order.id,
    });
  }

  for (const loser of losers) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(loser.user_id);
    if (!user) continue;
    const theirBid = db.prepare(`
      SELECT MAX(amount) AS amount FROM bids WHERE cycle_id = ? AND user_id = ?
    `).get(outcome.cycle.id, loser.user_id);

    const mail = templates.auctionLost({
      user, listing: fresh,
      yourBid: theirBid.amount || 0,
      winningBid: winner ? winner.amount : null,
      relisted: Boolean(nextCycle),
    });
    await mailer.send({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      template: mail.template,
      relatedType: 'listing',
      relatedId: listing.id,
    });
  }
}

module.exports = { bid, buyNow, closeDueAuctions, notifyCycleOutcome };
