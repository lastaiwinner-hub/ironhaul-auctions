'use strict';

const crypto = require('crypto');

/** URL-safe random string, used for signing links and email tokens. */
function random(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Short uppercase alphanumeric code, e.g. for human-readable references. */
function code(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Doc ID in the style of the e-signature providers: 40 hex characters. */
function docId() {
  return crypto.randomBytes(20).toString('hex');
}

/**
 * Sequential-looking public reference, e.g. PA26090412345.
 * prefix + 2-digit year + 2-digit month + 2-digit day + 5 random digits.
 */
function reference(prefix) {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const rand = String(crypto.randomInt(0, 100000)).padStart(5, '0');
  return `${prefix}${yy}${mm}${dd}${rand}`;
}

/** Timing-safe comparison for secrets arriving from a URL or form. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { random, code, docId, reference, safeEqual };
