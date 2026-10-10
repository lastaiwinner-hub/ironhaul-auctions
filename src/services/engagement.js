'use strict';
const { db } = require('../../config/database');
const crypto = require('crypto');
const DAY = 86400000;
const text = (v, n = 100) => typeof v === 'string' ? v.trim().slice(0, n) : '';
function publicPath(value) {
  const p = text(value, 220).split(/[?#]/)[0];
  return /^\/(?:$|inventory$|auctions$|compare$|about$|contact$|faq$|how-it-works$|reviews$|lot\/[a-z0-9-]+$)/.test(p) ? p : '/';
}
function attribution(input = {}, ownHost = '') {
  const source = text(input.source, 60).toLowerCase();
  let host = '';
  try { const u = new URL(text(input.referrer, 2048)); if (/^https?:$/.test(u.protocol)) host = u.hostname.toLowerCase(); } catch {}
  if (host === ownHost) host = '';
  const is = domain => host === domain || host.endsWith('.' + domain);
  let label = 'Direct / unknown';
  if (['facebook','fb'].includes(source)) label = 'Facebook';
  else if (['instagram','ig'].includes(source)) label = 'Instagram';
  else if (['meta','facebook_instagram'].includes(source)) label = 'Meta (unspecified)';
  else if (source) label = source;
  else if (is('instagram.com')) label = 'Instagram';
  else if (is('facebook.com') || is('fb.com')) label = 'Facebook';
  else if (input.metaClick === true) label = 'Meta (unspecified)';
  else if (is('google.com')) label = 'Google';
  else if (is('bing.com')) label = 'Bing';
  else if (is('tiktok.com')) label = 'TikTok';
  else if (host) label = 'Referral';
  const tag = v => text(v, 100).replace(/[^\w .:/-]/g, '');
  return { source: label, medium: tag(input.medium), campaign: tag(input.campaign), referrer: host };
}
let lastCleanup = 0;
function cleanup() {
  if (Date.now() - lastCleanup < 3600000) return;
  db.prepare('DELETE FROM audience_visits WHERE last_seen < ?').run(Date.now() - 90 * DAY);
  db.prepare('DELETE FROM support_messages WHERE created_at < ?').run(Date.now() - 180 * DAY);
  db.prepare('DELETE FROM support_threads WHERE updated_at < ?').run(Date.now() - 180 * DAY);
  db.prepare('DELETE FROM support_presence WHERE last_seen < ?').run(Date.now() - DAY);
  lastCleanup = Date.now();
}
function track(req) {
  cleanup();
  const now = Date.now(), input = req.body || {};
  // Never count private or unknown routes as homepage visits.
  if (publicPath(input.path) !== text(input.path, 220).split(/[?#]/)[0]) return;
  let v = db.prepare('SELECT * FROM audience_visits WHERE id=?').get(req.session.audienceId || '');
  if (!v || now - v.last_seen > 30 * 60000) {
    const id = crypto.randomUUID(), a = attribution(input, req.hostname);
    const path = publicPath(input.path);
    const device = /mobile|android|iphone/i.test(req.get('user-agent') || '') ? 'Mobile' : 'Desktop / tablet';
    db.prepare('INSERT INTO audience_visits VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, a.source, a.medium, a.campaign, a.referrer, path, path, device, now, now);
    req.session.audienceId = id;
  }
  const id = req.session.audienceId, path = publicPath(input.path);
  db.prepare('UPDATE audience_visits SET last_seen=?,current_path=? WHERE id=?').run(now,path,id);
  const key = text(input.pageKey, 80);
  if (/^[a-zA-Z0-9-]{8,80}$/.test(key)) {
    db.prepare('INSERT OR IGNORE INTO audience_pages(visit_id,page_key,path,created_at) VALUES (?,?,?,?)').run(id,key,path,now);
  }
}
function online() { return !!db.prepare('SELECT 1 FROM support_presence WHERE last_seen > ? LIMIT 1').get(Date.now()-75000); }
function messages(id) { return db.prepare('SELECT id,sender,body,created_at FROM support_messages WHERE thread_id=? ORDER BY id DESC LIMIT 200').all(id).reverse(); }
function addMessage(id, sender, body, key) {
  return db.transaction(() => {
    const result = db.prepare('INSERT OR IGNORE INTO support_messages(thread_id,sender,body,client_id,created_at) VALUES (?,?,?,?,?)').run(id,sender,body,key,Date.now());
    if (result.changes) db.prepare("UPDATE support_threads SET updated_at=?,status='open',unread=unread+? WHERE id=?").run(Date.now(),sender === 'visitor' ? 1 : 0,id);
    return result.changes;
  })();
}
function snapshot(days = 7) {
  cleanup();
  const now = Date.now(), since = now - days * DAY;
  return {
    updatedAt: now, days,
    visits: db.prepare('SELECT COUNT(*) n FROM audience_visits WHERE started_at>=?').get(since).n,
    pageviews: db.prepare('SELECT COUNT(*) n FROM audience_pages WHERE created_at>=?').get(since).n,
    live: db.prepare('SELECT id,source,medium,campaign,device,current_path,landing,started_at,last_seen FROM audience_visits WHERE last_seen>? ORDER BY last_seen DESC LIMIT 100').all(now-75000),
    liveCount: db.prepare('SELECT COUNT(*) n FROM audience_visits WHERE last_seen>?').get(now-75000).n,
    sources: db.prepare('SELECT source,COUNT(*) n FROM audience_visits WHERE started_at>=? GROUP BY source ORDER BY n DESC LIMIT 15').all(since),
    campaigns: db.prepare("SELECT source,campaign,medium,COUNT(*) n FROM audience_visits WHERE started_at>=? AND campaign<>'' GROUP BY source,campaign,medium ORDER BY n DESC LIMIT 20").all(since),
    pages: db.prepare('SELECT path,COUNT(*) n FROM audience_pages WHERE created_at>=? GROUP BY path ORDER BY n DESC LIMIT 10').all(since),
    trend: db.prepare("SELECT strftime('%Y-%m-%d',started_at/1000,'unixepoch') day,COUNT(*) n FROM audience_visits WHERE started_at>=? GROUP BY day ORDER BY day").all(since),
    unread: db.prepare('SELECT COALESCE(SUM(unread),0) n FROM support_threads').get().n,
    openChats: db.prepare("SELECT COUNT(*) n FROM support_threads WHERE status='open'").get().n,
    activity: db.prepare('SELECT action,entity_type,created_at FROM activity_log ORDER BY id DESC LIMIT 12').all(),
  };
}
module.exports = { text, publicPath, attribution, track, online, messages, addMessage, snapshot, cleanup };
