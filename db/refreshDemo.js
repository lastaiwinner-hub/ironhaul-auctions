'use strict';

/**
 * Rebase the demo catalogue's clock onto "now".
 *
 * The seeded database is a snapshot: its auctions were given end times a few
 * hours out from whenever the seed ran. On a normal server that stays true
 * because node-cron closes lots and relists them. A serverless deployment has
 * no such loop, so within a day or two every seeded auction has notionally
 * ended and the board goes permanently empty.
 *
 * So on each cold start we slide every open cycle forward: opened an hour ago,
 * closing on the same staggered ladder the seed used. The catalogue is then
 * always live no matter how old the snapshot is, and the staggering keeps
 * "ending soonest" meaningful.
 */

const HOURS_OUT = [5, 11, 20, 27, 38, 46, 54, 63, 71, 80, 92, 108];

function refreshDemoClock(db) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const openedAt = iso(now - 60 * 60 * 1000);

  const cycles = db.prepare(`
    SELECT id, listing_id FROM auction_cycles
     WHERE status = 'open' ORDER BY id
  `).all();

  if (!cycles.length) return 0;

  const setCycle = db.prepare(
    'UPDATE auction_cycles SET starts_at = ?, ends_at = ? WHERE id = ?'
  );
  const setListing = db.prepare(`
    UPDATE listings SET auction_starts_at = ?, auction_ends_at = ?, status = 'live'
     WHERE id = ?
  `);

  const rebase = db.transaction((rows) => {
    rows.forEach((cycle, i) => {
      const endsAt = iso(now + HOURS_OUT[i % HOURS_OUT.length] * 60 * 60 * 1000);
      setCycle.run(openedAt, endsAt, cycle.id);
      setListing.run(openedAt, endsAt, cycle.listing_id);
    });
  });

  rebase(cycles);
  return cycles.length;
}

module.exports = { refreshDemoClock };
