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
 *   2. a container that has just cold-started has an empty /tmp, so the
 *      seeded demo database shipped in db/demo.sqlite is copied into place.
 *
 * That makes each container self-contained: browsing, bidding, signing and the
 * admin all work against its own copy. What it cannot do is share writes
 * between containers or keep them — see README-VERCEL.md.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

const seed = path.join(__dirname, '..', 'db', 'demo.sqlite');

try {
  if (!fs.existsSync(config.db.file) && fs.existsSync(seed)) {
    fs.copyFileSync(seed, config.db.file);
  }
} catch (err) {
  console.error('[boot] could not lay down the demo database:', err.message);
}

const { migrate } = require('../config/database');

// Belt and braces: if the copy above failed, at least stand the schema up so
// the app serves an empty catalogue instead of throwing on every query.
try {
  migrate();
} catch (err) {
  console.error('[boot] migrate failed:', err.message);
}

module.exports = require('../src/app');
