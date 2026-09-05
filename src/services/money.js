'use strict';

/**
 * Money is stored and moved around the app as integer cents. These helpers are
 * the only place that converts to and from the human-facing decimal form.
 */

const SYMBOL = require('../../config/brand').terms.currencySymbol;

/** 2260000 -> "$22,600.00" */
function format(cents, { decimals = 2, symbol = true } = {}) {
  const n = Number(cents || 0) / 100;
  const s = n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return symbol ? `${SYMBOL}${s}` : s;
}

/** 2260000 -> "$22,600" — for headlines and cards where cents are noise. */
function formatShort(cents) {
  return format(cents, { decimals: 0 });
}

/** "22,600.00" / "$22600" / 22600 -> 2260000. Returns null if unparseable. */
function parse(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Math.round(input * 100);
  const cleaned = String(input).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Words form used on the contract: "Twenty-Two Thousand Six Hundred and 00/100". */
function toWords(cents) {
  const dollars = Math.floor(Math.abs(cents) / 100);
  const remainder = Math.abs(cents) % 100;
  const words = intToWords(dollars);
  return `${words} and ${String(remainder).padStart(2, '0')}/100`;
}

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
  'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy',
  'Eighty', 'Ninety'];
const SCALES = [
  [1_000_000_000, 'Billion'],
  [1_000_000, 'Million'],
  [1_000, 'Thousand'],
  [100, 'Hundred'],
];

function intToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    return o ? `${t}-${ONES[o]}` : t;
  }
  for (const [value, name] of SCALES) {
    if (n >= value) {
      const head = intToWords(Math.floor(n / value));
      const tail = n % value;
      return tail ? `${head} ${name} ${intToWords(tail)}` : `${head} ${name}`;
    }
  }
  return String(n);
}

/**
 * The smallest bid the platform will accept next.
 * With no bids yet the starting bid itself is acceptable; after that a bidder
 * must clear the current bid by at least one full increment.
 */
function nextMinimumBid({ currentBid, startingBid, increment }) {
  if (!currentBid || currentBid <= 0) return startingBid;
  return currentBid + increment;
}

module.exports = { format, formatShort, parse, toWords, nextMinimumBid, SYMBOL };
