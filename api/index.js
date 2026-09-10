'use strict';

/**
 * Vercel entry point.
 *
 * Vercel runs the app as a serverless function rather than a long-lived
 * server, so there is no `app.listen` here and no in-process scheduler. Two
 * things have to happen before the app is required, because `config/database`
 * opens the database the moment it loads:
 *
 *   1. config resolves every writable path under /tmp (see config/index.js) —
 *      the rest of the deployment is read-only.
 *   2. the seeded demo database shipped in db/demo.sqlite is laid down there.
 *
 * The copy is unconditional. This module is evaluated once per container, so
 * it costs a 260 KB file copy per cold start, and in exchange a container can
 * never come up serving an empty catalogue because a half-initialised database
 * was left behind by an earlier invocation.
 *
 * Each container is therefore self-contained: browsing, bidding, signing and
 * the admin all work against its own copy. What it cannot do is share those
 * writes with other containers or keep them — see README-VERCEL.md.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

const seed = path.join(__dirname, '..', 'db', 'demo.sqlite');

try {
  if (!fs.existsSync(seed)) {
    throw new Error(`seed database missing from the bundle at ${seed}`);
  }
  // Drop any WAL/shm left by an earlier invocation, or SQLite will try to
  // replay them against the file we have just replaced.
  for (const suffix of ['-wal', '-shm']) {
    const stale = config.db.file + suffix;
    if (fs.existsSync(stale)) fs.rmSync(stale, { force: true });
  }
  fs.copyFileSync(seed, config.db.file);
  console.log('[boot] demo database laid down at', config.db.file);
} catch (err) {
  console.error('[boot] could not lay down the demo database:', err.message);
}

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
