'use strict';
const { db } = require('../../config/database');
const config = require('../../config');
let timer, busy = false;
function ready() {
  const c = config.telegram;
  try { return c.enabled && Boolean(c.botToken && c.chatId) && new URL(c.inboxUrl).protocol === 'https:'; }
  catch { return false; }
}
function enqueue(messageId) {
  if (ready()) db.prepare('INSERT OR IGNORE INTO support_alerts(message_id,next_attempt) VALUES (?,?)').run(messageId, Date.now());
}
async function flush() {
  if (busy || !ready()) return;
  busy = true;
  try {
    const rows = db.prepare('SELECT * FROM support_alerts WHERE sent_at IS NULL AND failed=0 AND next_attempt<=? ORDER BY message_id LIMIT 10').all(Date.now());
    for (const row of rows) {
      let retrySeconds = 0;
      try {
        const response = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: config.telegram.chatId,
            text: `New customer live-chat message (#${row.message_id}).\nOpen your staff inbox to read and reply:\n${config.telegram.inboxUrl}`,
            link_preview_options: { is_disabled: true } }),
          signal: AbortSignal.timeout(8000),
        });
        const result = await response.json();
        if (response.ok && result.ok === true) {
          db.prepare('UPDATE support_alerts SET sent_at=? WHERE message_id=?').run(Date.now(), row.message_id);
          continue;
        }
        retrySeconds = Math.max(0, Number(result.parameters?.retry_after) || 0);
      } catch { /* Never log provider URLs or tokens. Chat remains available. */ }
      const attempts = row.attempts + 1;
      const delay = Math.max(retrySeconds * 1000, Math.min(3600000, 5000 * 2 ** attempts));
      db.prepare('UPDATE support_alerts SET attempts=?,next_attempt=?,failed=? WHERE message_id=?')
        .run(attempts, Date.now() + delay, attempts >= 12 ? 1 : 0, row.message_id);
      console.warn('[telegram] Staff alert delivery delayed; check private bot configuration and connectivity.');
      break;
    }
  } finally { busy = false; }
}
function start() {
  if (timer || !ready()) return;
  const tick = () => flush().catch(() => console.warn('[telegram] Staff alert worker unavailable.'));
  timer = setInterval(tick, 5000); timer.unref(); tick();
}
function stop() { clearInterval(timer); timer = undefined; }
module.exports = { ready, enqueue, flush, start, stop };
