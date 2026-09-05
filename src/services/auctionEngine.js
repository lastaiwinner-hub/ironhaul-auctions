'use strict';

const { db } = require('../../config/database');
const config = require('../../config');
const { nowIso, addMinutes, addHours } = require('./dates');
const money = require('./money');

const { auction: AUCTION } = config.brand;

/**
 * A bid was refused. Carries a machine-readable `code` so routes can decide
 * between a redirect (sign in, verify ID) and an inline form error.
 */
class BidError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'BidError';
    this.code = code;
    Object.assign(this, extra);
  }
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

function openCycle(listingId) {
  return db.prepare(`
    SELECT * FROM auction_cycles
     WHERE listing_id = ? AND status = 'open'
     ORDER BY cycle_number DESC LIMIT 1
  `).get(listingId);
}

function cycleById(id) {
  return db.prepare('SELECT * FROM auction_cycles WHERE id = ?').get(id);
}

/**
 * Start a fresh auction cycle for a listing and reset its live bid state.
 * Called when a listing is created, and again each time a cycle closes while
 * `keep_selling` is on — which is what keeps stock on sale after a win.
 */
function startCycle(listingId, { startsAt, endsAt, startingBid, reservePrice } = {}) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) throw new Error(`Listing ${listingId} not found`);

  const previous = db.prepare(`
    SELECT MAX(cycle_number) AS n FROM auction_cycles WHERE listing_id = ?
  `).get(listingId).n || 0;

  const start = startsAt ? new Date(startsAt) : new Date();
  const end = endsAt
    ? new Date(endsAt)
    : addHours(start, AUCTION.defaultDurationHours);

  const opening = startingBid ?? listing.starting_bid;
  const reserve = reservePrice !== undefined ? reservePrice : listing.reserve_price;

  const info = db.prepare(`
    INSERT INTO auction_cycles
      (listing_id, cycle_number, starts_at, ends_at, starting_bid, reserve_price)
    VALUES (@listingId, @cycleNumber, @startsAt, @endsAt, @startingBid, @reservePrice)
  `).run({
    listingId,
    cycleNumber: previous + 1,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    startingBid: opening,
    reservePrice: reserve ?? null,
  });

  db.prepare(`
    UPDATE listings
       SET current_bid = 0, bid_count = 0, high_bidder_id = NULL,
           auction_starts_at = @startsAt, auction_ends_at = @endsAt,
           starting_bid = @startingBid, status = 'live', updated_at = @now
     WHERE id = @listingId
  `).run({
    listingId,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    startingBid: opening,
    now: nowIso(),
  });

  return cycleById(Number(info.lastInsertRowid));
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

function minimumBid(listing) {
  return money.nextMinimumBid({
    currentBid: listing.current_bid,
    startingBid: listing.starting_bid,
    increment: listing.bid_increment || AUCTION.defaultIncrement,
  });
}

function highestBid(cycleId) {
  return db.prepare(`
    SELECT b.*, u.full_name, u.email
      FROM bids b JOIN users u ON u.id = b.user_id
     WHERE b.cycle_id = ? AND b.status IN ('active','won')
     ORDER BY b.amount DESC, b.created_at ASC LIMIT 1
  `).get(cycleId);
}

function bidHistory(listingId, { cycleId, limit = 30 } = {}) {
  const params = { listingId, limit };
  let clause = 'b.listing_id = @listingId';
  if (cycleId) { clause += ' AND b.cycle_id = @cycleId'; params.cycleId = cycleId; }
  return db.prepare(`
    SELECT b.*, u.full_name, u.city, u.state
      FROM bids b JOIN users u ON u.id = b.user_id
     WHERE ${clause} AND b.status != 'retracted'
     ORDER BY b.created_at DESC, b.amount DESC LIMIT @limit
  `).all(params);
}

/** "J. Harrington (Valdosta, GA)" — bidders are never fully named in public. */
function maskBidder(bid) {
  const parts = String(bid.full_name || '').trim().split(/\s+/);
  const initial = parts[0] ? `${parts[0][0].toUpperCase()}.` : 'B.';
  const surname = parts.length > 1 ? parts[parts.length - 1] : '';
  const name = surname ? `${initial} ${surname}` : initial;
  const place = [bid.city, bid.state].filter(Boolean).join(', ');
  return place ? `${name} (${place})` : name;
}

/**
 * Place a bid.
 *
 * Runs as a single transaction so two bids arriving together cannot both read
 * the same "current bid" and settle at the same amount. Proxy bidding is
 * resolved here too: a bidder may leave a maximum, and the engine raises them
 * automatically — by the smallest step needed — until they are outbid or their
 * ceiling is reached.
 */
const placeBid = db.transaction(({ listingId, userId, amount, maxAmount, ip, userAgent }) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) throw new BidError('not_found', 'This listing no longer exists.');
  if (listing.status !== 'live') {
    throw new BidError('closed', 'Bidding on this lot has closed.');
  }

  const cycle = openCycle(listingId);
  if (!cycle) throw new BidError('closed', 'There is no auction running on this lot right now.');

  const now = new Date();
  if (new Date(cycle.starts_at) > now) {
    throw new BidError('not_started', 'This auction has not opened yet.');
  }
  if (new Date(cycle.ends_at) <= now) {
    throw new BidError('ended', 'This auction has already ended.');
  }

  const increment = listing.bid_increment || AUCTION.defaultIncrement;
  const floor = minimumBid(listing);

  // A proxy bid is defined by its ceiling; the visible amount is derived.
  const ceiling = AUCTION.proxyBidding && maxAmount ? maxAmount : null;
  const offered = ceiling ? Math.max(amount || floor, floor) : amount;

  if (!Number.isInteger(offered) || offered <= 0) {
    throw new BidError('invalid', 'Enter a valid bid amount.');
  }
  if (offered < floor) {
    throw new BidError('too_low',
      `The minimum bid is ${money.format(floor)}.`, { minimum: floor });
  }
  if (ceiling && ceiling < offered) {
    throw new BidError('invalid',
      'Your maximum must be at least as high as your opening bid.');
  }

  const existingHigh = highestBid(cycle.id);
  if (existingHigh && existingHigh.user_id === userId && !ceiling) {
    throw new BidError('already_high', 'You are already the highest bidder on this lot.');
  }

  const user = db.prepare('SELECT bid_limit FROM users WHERE id = ?').get(userId);
  const cap = ceiling || offered;
  if (user && user.bid_limit && cap > user.bid_limit) {
    throw new BidError('over_limit',
      `Your account bidding limit is ${money.format(user.bid_limit)}. Contact us to raise it.`);
  }

  // Settle against any standing proxy from another bidder.
  let settledAmount = offered;
  let outbidByProxy = false;
  const standingProxy = existingHigh && existingHigh.max_amount
    && existingHigh.user_id !== userId ? existingHigh : null;

  if (standingProxy) {
    const rivalCeiling = standingProxy.max_amount;
    if (cap <= rivalCeiling) {
      // The rival's ceiling covers this bid: they stay in front, one step up
      // but never above their own maximum.
      settledAmount = Math.min(rivalCeiling, cap + increment);
      outbidByProxy = true;
    } else {
      // This bidder clears the rival's ceiling and takes the lead.
      settledAmount = Math.min(cap, rivalCeiling + increment);
    }
  }

  db.prepare(`
    UPDATE bids SET status = 'outbid' WHERE cycle_id = ? AND status = 'active'
  `).run(cycle.id);

  let leaderBidId;
  let bidId;

  if (outbidByProxy) {
    // Record the challenger as outbid, then re-record the defender's raise.
    bidId = Number(db.prepare(`
      INSERT INTO bids (listing_id, cycle_id, user_id, amount, max_amount, status, ip_address, user_agent)
      VALUES (@listingId, @cycleId, @userId, @amount, @maxAmount, 'outbid', @ip, @userAgent)
    `).run({
      listingId, cycleId: cycle.id, userId,
      amount: cap, maxAmount: ceiling, ip: ip || null, userAgent: userAgent || null,
    }).lastInsertRowid);

    leaderBidId = Number(db.prepare(`
      INSERT INTO bids (listing_id, cycle_id, user_id, amount, max_amount, is_auto, status, ip_address, user_agent)
      VALUES (@listingId, @cycleId, @userId, @amount, @maxAmount, 1, 'active', @ip, @userAgent)
    `).run({
      listingId, cycleId: cycle.id,
      userId: standingProxy.user_id,
      amount: settledAmount,
      maxAmount: standingProxy.max_amount,
      ip: standingProxy.ip_address, userAgent: standingProxy.user_agent,
    }).lastInsertRowid);
  } else {
    bidId = Number(db.prepare(`
      INSERT INTO bids (listing_id, cycle_id, user_id, amount, max_amount, status, ip_address, user_agent)
      VALUES (@listingId, @cycleId, @userId, @amount, @maxAmount, 'active', @ip, @userAgent)
    `).run({
      listingId, cycleId: cycle.id, userId,
      amount: settledAmount, maxAmount: ceiling,
      ip: ip || null, userAgent: userAgent || null,
    }).lastInsertRowid);
    leaderBidId = bidId;
  }

  const leader = db.prepare('SELECT * FROM bids WHERE id = ?').get(leaderBidId);

  // Anti-sniping: a late bid pushes the deadline out so the lot cannot be
  // stolen in the final seconds.
  let endsAt = cycle.ends_at;
  let extended = false;
  const msLeft = new Date(cycle.ends_at).getTime() - now.getTime();
  if (msLeft <= AUCTION.antiSnipeWindowMin * 60_000) {
    endsAt = addMinutes(now, AUCTION.antiSnipeExtendMin).toISOString();
    extended = true;
    db.prepare('UPDATE auction_cycles SET ends_at = ? WHERE id = ?').run(endsAt, cycle.id);
  }

  db.prepare(`
    UPDATE listings
       SET current_bid = @amount, high_bidder_id = @leaderId,
           bid_count = bid_count + 1, auction_ends_at = @endsAt, updated_at = @now
     WHERE id = @listingId
  `).run({
    listingId, amount: leader.amount, leaderId: leader.user_id,
    endsAt, now: nowIso(),
  });

  const outbidUserId = existingHigh && existingHigh.user_id !== leader.user_id
    ? existingHigh.user_id
    : null;

  return {
    bidId,
    cycleId: cycle.id,
    amount: settledAmount,
    leaderUserId: leader.user_id,
    isLeader: leader.user_id === userId,
    outbidByProxy,
    outbidUserId,
    extended,
    endsAt,
    nextMinimum: leader.amount + increment,
  };
});

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

/** Cycles whose deadline has passed but which are still marked open. */
function dueCycles() {
  return db.prepare(`
    SELECT * FROM auction_cycles WHERE status = 'open' AND ends_at <= ?
  `).all(nowIso());
}

/**
 * Settle one cycle: mark the winner, mark everyone else, and — when the
 * operator keeps stock on sale — immediately open the next cycle so the
 * machine is never off the market.
 *
 * Returns a summary the caller uses to fire the winner/loser emails and to
 * raise the winner's order. Nothing is emailed from inside the transaction.
 */
const closeCycle = db.transaction((cycleId) => {
  const cycle = cycleById(cycleId);
  if (!cycle || cycle.status !== 'open') return null;

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(cycle.listing_id);
  const winning = highestBid(cycleId);
  const reserveMet = !cycle.reserve_price
    || (winning && winning.amount >= cycle.reserve_price);

  const settled = winning && reserveMet ? winning : null;

  if (settled) {
    db.prepare("UPDATE bids SET status = 'won' WHERE id = ?").run(settled.id);
    db.prepare(`
      UPDATE bids SET status = 'lost'
       WHERE cycle_id = ? AND id != ? AND status != 'retracted'
    `).run(cycleId, settled.id);
  } else {
    db.prepare(`
      UPDATE bids SET status = 'lost' WHERE cycle_id = ? AND status != 'retracted'
    `).run(cycleId);
  }

  db.prepare(`
    UPDATE auction_cycles
       SET status = 'closed', closed_at = @now, final_amount = @finalAmount,
           winning_bid_id = @winningBidId, winning_user_id = @winningUserId,
           reserve_met = @reserveMet
     WHERE id = @cycleId
  `).run({
    cycleId, now: nowIso(),
    finalAmount: settled ? settled.amount : null,
    winningBidId: settled ? settled.id : null,
    winningUserId: settled ? settled.user_id : null,
    reserveMet: reserveMet ? 1 : 0,
  });

  // Everyone who bid this cycle and did not win, de-duplicated.
  const losers = db.prepare(`
    SELECT DISTINCT b.user_id, u.email, u.full_name
      FROM bids b JOIN users u ON u.id = b.user_id
     WHERE b.cycle_id = ? AND b.status = 'lost'
       AND (@winnerId IS NULL OR b.user_id != @winnerId)
  `).all(cycleId, { winnerId: settled ? settled.user_id : null });

  let nextCycle = null;
  if (listing.keep_selling && listing.quantity > 0) {
    const startsAt = addMinutes(new Date(), AUCTION.relistDelayMinutes);
    nextCycle = startCycle(listing.id, {
      startsAt,
      endsAt: addHours(startsAt, AUCTION.defaultDurationHours),
    });
  } else {
    db.prepare(`
      UPDATE listings SET status = ?, updated_at = ? WHERE id = ?
    `).run(settled ? 'sold' : 'ended', nowIso(), listing.id);
  }

  return {
    cycle: cycleById(cycleId),
    listing,
    winner: settled
      ? { userId: settled.user_id, bidId: settled.id, amount: settled.amount,
          email: settled.email, name: settled.full_name }
      : null,
    reserveMet,
    losers,
    nextCycle,
  };
});

module.exports = {
  BidError,
  openCycle, cycleById, startCycle,
  minimumBid, highestBid, bidHistory, maskBidder,
  placeBid, dueCycles, closeCycle,
};
