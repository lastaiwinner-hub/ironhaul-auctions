'use strict';

const crypto = require('crypto');
const userModel = require('../models/user');

/** Hydrate req.user from the session on every request. */
function loadUser(req, res, next) {
  req.user = null;
  if (req.session && req.session.userId) {
    const user = userModel.findById(req.session.userId);
    if (user && user.status !== 'closed') {
      req.user = user;
    } else {
      req.session.userId = null;
    }
  }
  res.locals.currentUser = req.user;
  next();
}

/** Gate a page behind sign-in, remembering where the visitor was headed. */
function requireAuth(req, res, next) {
  if (req.user) return next();

  if (wantsJson(req)) {
    return res.status(401).json({ error: 'auth_required', message: 'Please sign in.' });
  }
  req.session.returnTo = req.originalUrl;
  req.flash('info', 'Please sign in to continue.');
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  return res.status(403).render('pages/error', {
    title: 'Not authorised',
    status: 403,
    message: 'You do not have access to this area.',
  });
}

/** Signed in, email confirmed, ID approved and address on file. */
function requireVerified(req, res, next) {
  const eligibility = userModel.bidEligibility(req.user);
  if (eligibility.eligible) return next();

  if (wantsJson(req)) {
    return res.status(403).json({
      error: eligibility.reason,
      message: eligibility.message,
      redirect: eligibilityRedirect(eligibility.reason),
    });
  }
  req.flash('warning', eligibility.message);
  return res.redirect(eligibilityRedirect(eligibility.reason));
}

function eligibilityRedirect(reason) {
  switch (reason) {
    case 'signin': return '/login';
    case 'email': return '/account/verify-email';
    case 'address': return '/account/profile';
    case 'kyc':
    case 'kyc_pending':
    case 'kyc_rejected': return '/account/verification';
    default: return '/account';
  }
}

function wantsJson(req) {
  return req.xhr
    || req.path.startsWith('/api/')
    || (req.get('accept') || '').includes('application/json');
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

/**
 * Double-submit CSRF token. Every state-changing form carries it as a hidden
 * field; fetch() calls send it as the X-CSRF-Token header.
 *
 * Multipart requests are the exception: their body is parsed by multer inside
 * the route, so `req.body._csrf` does not exist yet at this point. Those are
 * deferred and must be checked with `csrfMultipart` immediately after the
 * upload middleware — `assertCsrfChecked` catches any route that forgets.
 */
function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('base64url');
  }
  res.locals.csrfToken = req.session.csrfToken;

  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();

  if ((req.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) {
    req.csrfDeferred = true;
    return next();
  }

  return verifyToken(req, res, next);
}

/** Run this straight after multer on any route that accepts a file upload. */
function csrfMultipart(req, res, next) {
  if (!req.csrfDeferred) return next();
  req.csrfDeferred = false;
  req.csrfChecked = true;
  return verifyToken(req, res, next);
}

function verifyToken(req, res, next) {
  const supplied = (req.body && req.body._csrf)
    || req.get('x-csrf-token')
    || req.get('x-xsrf-token');

  const expected = req.session.csrfToken;
  const ok = supplied
    && typeof supplied === 'string'
    && supplied.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));

  if (ok) {
    req.csrfChecked = true;
    return next();
  }

  if (wantsJson(req)) {
    return res.status(403).json({
      error: 'csrf', message: 'Your session expired. Refresh the page and try again.',
    });
  }
  req.flash('error', 'Your session expired. Please try again.');
  return res.redirect(req.get('referer') || '/');
}

/**
 * Safety net: refuse any state-changing request that reached a handler without
 * its token being verified, so a forgotten `csrfMultipart` fails closed rather
 * than leaving an upload route unprotected.
 */
function assertCsrfChecked(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();
  if (req.csrfChecked) return next();

  console.error(`[csrf] ${req.method} ${req.originalUrl} ran without a CSRF check`);
  if (wantsJson(req)) {
    return res.status(403).json({ error: 'csrf', message: 'Request could not be verified.' });
  }
  req.flash('error', 'That request could not be verified. Please try again.');
  return res.redirect(req.get('referer') || '/');
}

module.exports = {
  loadUser, requireAuth, requireAdmin, requireVerified,
  csrf, csrfMultipart, assertCsrfChecked, wantsJson, eligibilityRedirect,
};
