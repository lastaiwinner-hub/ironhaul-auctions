'use strict';

/**
 * Vercel entry point.
 *
 * Vercel runs the app as a serverless function rather than a long-lived
 * server, so there is no `app.listen` here and no in-process scheduler.
 *
 * Laying the seeded database down happens in config/index.js, not here — it
 * has to be in place before anything opens a connection to it. Copying it from
 * this module was too late: a code path that had already resolved
 * config/database kept reading the file we replaced, which is how one route
 * could render the full catalogue while another rendered none.
 *
 * Each container is self-contained: browsing, bidding, signing and the admin
 * all work against its own copy. What it cannot do is share those writes with
 * other containers or keep them — see README-VERCEL.md.
 */

// config lays the seeded database down before anything opens it; see
// config/index.js. All that is left here is the schema check and the clock.
const { db, migrate } = require('../config/database');

// Belt and braces: if the copy above failed, at least stand the schema up so
// the app serves an empty catalogue instead of throwing on every query.
try {
  migrate();
} catch (err) {
  console.error('[boot] migrate failed:', err.message);
}

// The snapshot ages, and there is no cron here to close and relist lots, so
// slide the catalogue's auction clock onto now. Without this the board is
// empty a couple of days after the seed was taken.
try {
  const { refreshDemoClock } = require('../db/refreshDemo');
  const n = refreshDemoClock(db);
  console.log(`[boot] rebased ${n} auction cycle(s) onto now`);
} catch (err) {
  console.error('[boot] could not rebase the demo clock:', err.message);
}

module.exports = require('../src/app');
