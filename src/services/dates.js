'use strict';

/** ISO-8601 UTC string, the single storage format for every timestamp. */
function nowIso() {
  return new Date().toISOString();
}

function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60_000);
}

function addHours(date, hours) {
  return addMinutes(date, hours * 60);
}

function addDays(date, days) {
  return addMinutes(date, days * 24 * 60);
}

/** "September 1, 2026" */
function formatLong(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

/** "09-01-2026" — the format used on the printed agreement. */
function formatContract(value) {
  if (!value) return '';
  const d = new Date(value);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}-${d.getUTCFullYear()}`;
}

/** "01 / 09 / 2026" and "13:30:19 UTC" — the audit-trail pairing. */
function formatAuditDate(value) {
  const d = new Date(value);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd} / ${mm} / ${d.getUTCFullYear()}`;
}

function formatAuditTime(value) {
  const d = new Date(value);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mi}:${ss} UTC`;
}

/** "Sep 1, 2026, 2:03 PM UTC" — for dashboards and admin tables. */
function formatDateTime(value) {
  if (!value) return '';
  return `${new Date(value).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  })} UTC`;
}

/**
 * Countdown parts for an auction end time.
 * `ended` is true once the deadline has passed, which is what the templates
 * branch on rather than testing the numbers themselves.
 */
function countdown(endsAt, from = Date.now()) {
  const ms = new Date(endsAt).getTime() - from;
  if (Number.isNaN(ms)) return { ended: true, ms: 0, label: '--' };
  if (ms <= 0) return { ended: true, ms: 0, label: 'Auction ended' };

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let label;
  if (days > 0) label = `${days}d ${hours}h remaining`;
  else if (hours > 0) label = `${hours}h ${minutes}m remaining`;
  else if (minutes > 0) label = `${minutes}m ${seconds}s remaining`;
  else label = `${seconds}s remaining`;

  return { ended: false, ms, days, hours, minutes, seconds, label };
}

/** "2 hours ago" / "in 3 days" */
function relative(value) {
  const diff = new Date(value).getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [
    ['day', 86_400_000], ['hour', 3_600_000],
    ['minute', 60_000], ['second', 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return '';
}

module.exports = {
  nowIso, addMinutes, addHours, addDays,
  formatLong, formatContract, formatDateTime,
  formatAuditDate, formatAuditTime, countdown, relative,
};
