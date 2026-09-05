'use strict';

/** Small, dependency-free form validation. Returns { values, errors }. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

function validate(body, rules) {
  const values = {};
  const errors = {};

  for (const [field, rule] of Object.entries(rules)) {
    const raw = clean(body[field]);
    values[field] = raw;

    if (rule.required && !raw) {
      errors[field] = rule.requiredMessage || `${rule.label || field} is required.`;
      continue;
    }
    if (!raw) {
      if (rule.default !== undefined) values[field] = rule.default;
      continue;
    }

    if (rule.type === 'email' && !EMAIL_RE.test(raw)) {
      errors[field] = 'Enter a valid email address.';
      continue;
    }
    if (rule.type === 'phone') {
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        errors[field] = 'Enter a valid phone number.';
        continue;
      }
    }
    if (rule.type === 'state') {
      const upper = raw.toUpperCase();
      if (!US_STATES.includes(upper)) {
        errors[field] = 'Enter a valid two-letter state code.';
        continue;
      }
      values[field] = upper;
    }
    if (rule.type === 'zip' && !/^\d{5}(-\d{4})?$/.test(raw)) {
      errors[field] = 'Enter a valid ZIP code.';
      continue;
    }
    if (rule.type === 'int') {
      const n = Number.parseInt(raw, 10);
      if (Number.isNaN(n)) { errors[field] = 'Enter a whole number.'; continue; }
      if (rule.min !== undefined && n < rule.min) {
        errors[field] = `Must be at least ${rule.min}.`; continue;
      }
      if (rule.max !== undefined && n > rule.max) {
        errors[field] = `Must be no more than ${rule.max}.`; continue;
      }
      values[field] = n;
    }

    if (rule.minLength && raw.length < rule.minLength) {
      errors[field] = `${rule.label || field} must be at least ${rule.minLength} characters.`;
      continue;
    }
    if (rule.maxLength && raw.length > rule.maxLength) {
      errors[field] = `${rule.label || field} must be ${rule.maxLength} characters or fewer.`;
      continue;
    }
    if (rule.oneOf && !rule.oneOf.includes(values[field])) {
      errors[field] = 'Choose one of the available options.';
      continue;
    }
    if (rule.pattern && !rule.pattern.test(raw)) {
      errors[field] = rule.patternMessage || `${rule.label || field} is not in the expected format.`;
      continue;
    }
    if (rule.matches && raw !== clean(body[rule.matches])) {
      errors[field] = rule.matchMessage || 'The two values do not match.';
    }
  }

  return { values, errors, valid: Object.keys(errors).length === 0 };
}

/**
 * Password policy. Deliberately length-first: a long passphrase beats a short
 * string with a symbol bolted on, and the rule people actually follow is the
 * one that protects accounts.
 */
function passwordProblems(password) {
  const problems = [];
  if (!password || password.length < 10) problems.push('at least 10 characters');
  if (!/[a-zA-Z]/.test(password || '')) problems.push('one letter');
  if (!/\d/.test(password || '')) problems.push('one number');
  return problems;
}

module.exports = { validate, passwordProblems, clean, EMAIL_RE, US_STATES };
