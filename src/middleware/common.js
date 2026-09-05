'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../../config');
const money = require('../services/money');
const dates = require('../services/dates');
const listingModel = require('../models/listing');

/**
 * Minimal flash messaging. Messages are stashed on the session and drained on
 * the next render, which is all the redirect-then-show pattern needs.
 */
function flash(req, res, next) {
  if (!req.session.flash) req.session.flash = [];

  req.flash = (type, message) => {
    req.session.flash.push({ type, message });
  };

  res.locals.flashes = req.session.flash;
  req.session.flash = [];

  next();
}

/** Values every template can rely on being present. */
function locals(req, res, next) {
  res.locals.brand = config.brand;
  res.locals.baseUrl = config.baseUrl;
  res.locals.money = money;
  res.locals.dates = dates;
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  res.locals.title = null;
  res.locals.metaDescription = config.brand.description;
  res.locals.bodyClass = '';
  res.locals.categories = listingModel.categoriesWithCounts();
  res.locals.liveCount = listingModel.liveCount();
  res.locals.auctionCount = listingModel.activeAuctionCount();
  // Condition banding lives in the model so the sheet, the lot page and the
  // admin all colour a grade the same way.
  res.locals.gradeBand = listingModel.gradeBand;
  res.locals.wearBand = listingModel.wearBand;
  res.locals.isActive = (prefix) =>
    req.path === prefix || (prefix !== '/' && req.path.startsWith(prefix));
  next();
}

const limiters = {
  // Credential endpoints: slow down guessing without punishing real users.
  auth: rateLimit({
    windowMs: config.security.loginWindowMinutes * 60 * 1000,
    max: config.security.maxLoginAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: 'Too many attempts. Please wait a few minutes and try again.',
  }),

  // Bidding is deliberately generous — a live auction is bursty by nature.
  bid: rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'You are bidding very quickly. Please slow down.',
  }),

  // Anything that sends an email on behalf of an anonymous visitor.
  contact: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many messages sent from this address. Please try again later.',
  }),

  api: rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
};

/** 404 handler — reached only when no route matched. */
function notFound(req, res) {
  res.status(404);
  if (req.path.startsWith('/api/')) {
    return res.json({ error: 'not_found', message: 'No such endpoint.' });
  }
  return res.render('pages/error', {
    title: 'Page not found',
    status: 404,
    message: 'We could not find that page. It may have been moved, or the lot may have closed.',
  });
}

/** Final error handler. Never leaks a stack trace to a visitor in production. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = `That file is too large. The limit is ${Math.round(config.uploads.maxFileBytes / 1024 / 1024)} MB.`;
    if (req.path.startsWith('/api/')) {
      return res.status(413).json({ error: 'file_too_large', message });
    }
    req.flash('error', message);
    return res.redirect(req.get('referer') || '/account/verification');
  }

  res.status(status);
  if (req.path.startsWith('/api/')) {
    return res.json({
      error: err.code || 'server_error',
      message: status >= 500 && config.isProd
        ? 'Something went wrong on our side.'
        : err.message,
    });
  }
  return res.render('pages/error', {
    title: status === 404 ? 'Page not found' : 'Something went wrong',
    status,
    message: status >= 500 && config.isProd
      ? 'Something went wrong on our side. Our team has been notified.'
      : err.message,
    stack: config.isProd ? null : err.stack,
  });
}

/** Wrap an async route so a rejected promise reaches the error handler. */
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { flash, locals, limiters, notFound, errorHandler, asyncRoute };
