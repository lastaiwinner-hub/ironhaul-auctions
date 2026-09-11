'use strict';

const { db } = require('../../config/database');
const { nowIso } = require('../services/dates');

const DEFAULTS = {
  agreement_trigger: 'on_bid',
  auto_send_agreement: '1',
  require_kyc_to_bid: '1',
  // Clear a buyer to bid the moment their documents arrive. The review
  // still happens, it just no longer blocks them.
  kyc_auto_approve: '1',
  require_kyc_to_buy: '1',
  wire_beneficiary: require('../../config/brand').legalName,
  wire_bank: 'First Interstate Bank',
  wire_account: '•••• •••• 4471',
  wire_routing: '092901683',
  wire_swift: 'FIBMUS44',
  maintenance_mode: '0',
};

function get(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) return row.value;
  if (key in DEFAULTS) return DEFAULTS[key];
  return fallback;
}

function getBool(key, fallback = false) {
  const value = get(key, fallback ? '1' : '0');
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function set(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), nowIso());
}

function all() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...stored };
}

/** Bank details block used by invoices and the invoice email. */
function wire() {
  return {
    beneficiary: get('wire_beneficiary'),
    bank: get('wire_bank'),
    account: get('wire_account'),
    routing: get('wire_routing'),
    swift: get('wire_swift'),
  };
}

module.exports = { DEFAULTS, get, getBool, set, all, wire };
