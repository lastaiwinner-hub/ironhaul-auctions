'use strict';

const { Store } = require('express-session');
const { db } = require('../../config/database');

/**
 * Session store backed by the app's own SQLite file.
 *
 * Using the existing better-sqlite3 handle means the VPS compiles exactly one
 * native module, and sessions survive a restart — which matters when a buyer
 * is halfway through signing an agreement during a deploy.
 */
class SqliteStore extends Store {
  constructor() {
    super();
    this.stmts = {
      get: db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?'),
      set: db.prepare(`
        INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
        ON CONFLICT (sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at
      `),
      destroy: db.prepare('DELETE FROM sessions WHERE sid = ?'),
      touch: db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?'),
      clear: db.prepare('DELETE FROM sessions'),
      length: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?'),
      all: db.prepare('SELECT sid, data FROM sessions WHERE expires_at > ?'),
    };
  }

  get(sid, callback) {
    try {
      const row = this.stmts.get.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at < Date.now()) {
        this.stmts.destroy.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.data));
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, session, callback) {
    try {
      this.stmts.set.run(sid, JSON.stringify(session), this.expiry(session));
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.stmts.destroy.run(sid);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  touch(sid, session, callback) {
    try {
      this.stmts.touch.run(this.expiry(session), sid);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  clear(callback) {
    try {
      this.stmts.clear.run();
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  length(callback) {
    try {
      return callback(null, this.stmts.length.get(Date.now()).n);
    } catch (err) {
      return callback(err);
    }
  }

  all(callback) {
    try {
      const rows = this.stmts.all.all(Date.now());
      return callback(null, rows.map((r) => JSON.parse(r.data)));
    } catch (err) {
      return callback(err);
    }
  }

  expiry(session) {
    if (session && session.cookie && session.cookie.expires) {
      return new Date(session.cookie.expires).getTime();
    }
    const maxAge = (session && session.cookie && session.cookie.originalMaxAge) || 86_400_000;
    return Date.now() + maxAge;
  }
}

module.exports = SqliteStore;
