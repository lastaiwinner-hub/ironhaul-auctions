'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config();

const brand = require('./brand');

const root = path.resolve(__dirname, '..');
const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

/** Read an env var, falling back to a default. */
const str = (key, fallback = '') =>
  process.env[key] !== undefined && process.env[key] !== ''
    ? process.env[key]
    : fallback;

const int = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
};

const bool = (key, fallback = false) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
};

// A missing SESSION_SECRET in production is a real security hole, not a
// nuisance — refuse to boot rather than silently using a known key.
const sessionSecret = str('SESSION_SECRET', '');
if (isProd && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error(
    'SESSION_SECRET must be set to a random string of at least 32 characters ' +
      'when NODE_ENV=production. Generate one with:\n' +
      "  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

const dirs = {
  root,
  data: path.join(root, 'data'),
  logs: path.join(root, 'logs'),
  public: path.join(root, 'public'),
  uploads: path.join(root, 'public', 'uploads'),
  listings: path.join(root, 'public', 'uploads', 'listings'),
  signatures: path.join(root, 'public', 'uploads', 'signatures'),
  // KYC documents and agreement PDFs hold personal data, so they live outside
  // /public and are only ever served through an authorising route handler.
  kyc: path.join(root, 'data', 'kyc'),
  agreements: path.join(root, 'data', 'agreements'),
  views: path.join(root, 'src', 'views'),
};

for (const dir of Object.values(dirs)) {
  fs.mkdirSync(dir, { recursive: true });
}

const baseUrl = str('BASE_URL', `http://localhost:${int('PORT', 3000)}`).replace(/\/$/, '');

module.exports = {
  env,
  isProd,
  isDev: !isProd,
  brand,
  dirs,

  port: int('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  baseUrl,
  // Behind nginx/Caddy this must be 1 so req.ip, secure cookies and the rate
  // limiter read the X-Forwarded-* headers instead of the proxy's own address.
  trustProxy: int('TRUST_PROXY', isProd ? 1 : 0),

  db: {
    file: str('DATABASE_FILE', path.join(dirs.data, 'ironhaul.sqlite')),
  },

  session: {
    secret: sessionSecret || 'dev-only-insecure-secret-change-me-in-production',
    name: str('SESSION_COOKIE_NAME', 'ironhaul.sid'),
    maxAgeDays: int('SESSION_MAX_AGE_DAYS', 14),
  },

  security: {
    bcryptRounds: int('BCRYPT_ROUNDS', 12),
    maxLoginAttempts: int('MAX_LOGIN_ATTEMPTS', 8),
    loginWindowMinutes: int('LOGIN_WINDOW_MINUTES', 15),
    emailVerifyHours: int('EMAIL_VERIFY_HOURS', 48),
    passwordResetHours: int('PASSWORD_RESET_HOURS', 2),
  },

  uploads: {
    maxFileBytes: int('MAX_UPLOAD_MB', 12) * 1024 * 1024,
    allowedImage: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  },

  mail: {
    // When SMTP_HOST is absent the mailer writes .eml files to /logs/mail
    // instead of sending, so the whole flow is testable with no credentials.
    enabled: bool('MAIL_ENABLED', Boolean(str('SMTP_HOST', ''))),
    host: str('SMTP_HOST', ''),
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', int('SMTP_PORT', 587) === 465),
    user: str('SMTP_USER', ''),
    pass: str('SMTP_PASS', ''),
    fromName: str('MAIL_FROM_NAME', brand.name),
    fromEmail: str('MAIL_FROM_EMAIL', brand.contact.noreplyEmail),
    replyTo: str('MAIL_REPLY_TO', brand.contact.email),
    adminNotify: str('ADMIN_NOTIFY_EMAIL', brand.contact.email),
    outboxDir: path.join(dirs.logs, 'mail'),
  },

  admin: {
    // Used once, by `npm run seed`, to create the first administrator.
    email: str('ADMIN_EMAIL', 'admin@ironhaul-auctions.com'),
    password: str('ADMIN_PASSWORD', 'ChangeMe!2026'),
    name: str('ADMIN_NAME', 'Platform Administrator'),
  },

  scheduler: {
    enabled: bool('SCHEDULER_ENABLED', true),
  },
};
