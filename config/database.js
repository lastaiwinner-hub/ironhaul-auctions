'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./index');

const db = new Database(config.db.file);

// WAL lets readers run while a write is in flight — the difference between a
// responsive listing page and one that blocks every time a bid lands.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

/**
 * Columns added to `listings` after the first release.
 *
 * schema.sql only runs CREATE TABLE IF NOT EXISTS, so a table that already
 * exists never picks up new columns from it. Each entry here is applied with
 * ALTER TABLE when missing, which keeps an existing database upgradable
 * without a destructive rebuild.
 */
const ADDED_COLUMNS = [
  ['listings', 'emissions_tier',   'TEXT'],
  ['listings', 'lot_number',       'INTEGER'],
  ['listings', 'inspection_grade', 'REAL'],
  ['listings', 'inspected_at',     'TEXT'],
  ['listings', 'inspected_by',     'TEXT'],
  ['listings', 'condition_scores', 'TEXT'],
  ['listings', 'included_items',   'TEXT'],
  ['listings', 'service_notes',    'TEXT'],
  ['listings', 'known_faults',     'TEXT'],
  ['listings', 'lien_status',      "TEXT DEFAULT 'Title clear, no liens'"],
  ['listings', 'transport_length', 'TEXT'],
  ['listings', 'transport_width',  'TEXT'],
  ['listings', 'transport_height', 'TEXT'],
  ['listings', 'requires_permit',  'INTEGER NOT NULL DEFAULT 0'],
];

/** Apply schema.sql, then any column additions the existing tables lack.
 *  Safe to run on every boot as well as from `npm run migrate`. */
function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  db.exec(sql);

  for (const [table, column, definition] of ADDED_COLUMNS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all()
      .some((c) => c.name === column);
    if (exists) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[migrate] added ${table}.${column}`);
  }
}

/** Run a function inside a transaction, rolling back on any throw. */
function transaction(fn) {
  return db.transaction(fn);
}

module.exports = { db, migrate, transaction };
