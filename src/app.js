'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');

const config = require('../config');
const { migrate } = require('../config/database');
const SqliteStore = require('./middleware/sessionStore');
const auth = require('./middleware/auth');
const common = require('./middleware/common');

migrate();

const app = express();

app.set('view engine', 'ejs');
app.set('views', config.dirs.views);
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// Views declare their own shell via `layout`; most inherit the public one.
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // The signature pad and countdown timers are small inline scripts, and
      // a handful of components set inline styles; both are same-origin only.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  // PDFs are served inline to the same origin; the default would block that.
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: config.isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
}));

app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use(express.static(config.dirs.public, {
  maxAge: config.isProd ? '7d' : 0,
  etag: true,
  // Uploaded user content must never be sniffed into something executable.
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}uploads${path.sep}`)) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
    }
  },
}));

app.use(session({
  store: new SqliteStore(),
  secret: config.session.secret,
  name: config.session.name,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.session.maxAgeDays * 24 * 60 * 60 * 1000,
  },
}));

app.use(common.flash);
app.use(auth.loadUser);
app.use(common.locals);
app.use(auth.csrf);

// ---- Routes ---------------------------------------------------------------
app.use('/', require('./routes/public'));
app.use('/', require('./routes/auth'));
app.use('/account', require('./routes/account'));
app.use('/', require('./routes/listings'));
app.use('/', require('./routes/bidding'));
app.use('/sign', require('./routes/sign'));
app.use('/admin', require('./routes/admin'));
app.use('/api', common.limiters.api, require('./routes/api'));

app.use(common.notFound);
app.use(common.errorHandler);

module.exports = app;
