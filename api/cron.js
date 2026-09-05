'use strict';

/**
 * Auction close, as an HTTP endpoint.
 *
 * On a normal server node-cron runs this every minute in-process. A serverless
 * deployment has no such loop, so the same work is exposed here for Vercel Cron
 * or any external pinger to call. Guarded by CRON_SECRET so it cannot be
 * triggered by anyone who guesses the path.
 */

const config = require('../config');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    || (req.query && req.query.key);

  if (secret && supplied !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    // Required lazily so a failed database boot cannot take the whole
    // function down before the guard above has run.
    const bidding = require('../src/services/biddingService');
    const closed = await bidding.closeDueAuctions();
    res.status(200).json({ ok: true, closed: closed || 0, at: new Date().toISOString() });
  } catch (err) {
    console.error('[cron] close failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

// Keep the linter happy about the unused import in some configurations.
void config;
