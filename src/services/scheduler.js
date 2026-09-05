'use strict';

const cron = require('node-cron');
const config = require('../../config');
const { db } = require('../../config/database');
const bidding = require('./biddingService');

const jobs = [];
let closing = false;

/**
 * Background automation.
 *
 * Auction closing is the time-critical one: it runs every minute, and a guard
 * flag stops a slow run (many lots ending together, each sending email) from
 * overlapping with the next tick and settling a cycle twice.
 */
function start() {
  if (!config.scheduler.enabled) {
    console.log('[scheduler] disabled by configuration');
    return;
  }

  jobs.push(cron.schedule('* * * * *', async () => {
    if (closing) return;
    closing = true;
    try {
      const settled = await bidding.closeDueAuctions();
      if (settled.length) {
        console.log(`[scheduler] closed ${settled.length} auction cycle(s)`);
      }
    } catch (err) {
      console.error('[scheduler] auction close failed:', err);
    } finally {
      closing = false;
    }
  }));

  // Expired sessions accumulate forever otherwise.
  jobs.push(cron.schedule('0 * * * *', () => {
    try {
      const info = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
      if (info.changes) console.log(`[scheduler] pruned ${info.changes} expired session(s)`);
    } catch (err) {
      console.error('[scheduler] session prune failed:', err);
    }
  }));

  // Daily: surface anything stuck so an operator sees it in the logs.
  jobs.push(cron.schedule('0 7 * * *', () => {
    try {
      const stuck = db.prepare(`
        SELECT COUNT(*) AS n FROM agreements
         WHERE status IN ('sent','viewed')
           AND sent_at < datetime('now', '-3 days')
      `).get().n;
      const failedMail = db.prepare(`
        SELECT COUNT(*) AS n FROM email_log WHERE status = 'failed'
      `).get().n;
      const pendingKyc = db.prepare(`
        SELECT COUNT(*) AS n FROM users WHERE kyc_status = 'pending'
      `).get().n;
      console.log(
        `[scheduler] daily digest — unsigned agreements >3d: ${stuck}, ` +
        `failed emails: ${failedMail}, KYC awaiting review: ${pendingKyc}`
      );
    } catch (err) {
      console.error('[scheduler] digest failed:', err);
    }
  }));

  console.log(`[scheduler] started ${jobs.length} job(s)`);
}

function stop() {
  jobs.forEach((job) => job.stop());
  jobs.length = 0;
}

module.exports = { start, stop };
