'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../../config');
const { db } = require('../../config/database');
const userModel = require('../models/user');
const orderModel = require('../models/order');
const agreements = require('../services/agreementService');
const mailer = require('../services/mailer');
const { templates } = require('../services/emailTemplates');
const { requireAuth, csrfMultipart, assertCsrfChecked } = require('../middleware/auth');
const { validate, passwordProblems } = require('../middleware/validate');
const { asyncRoute, limiters } = require('../middleware/common');
const { kycUpload, processImage } = require('../middleware/upload');

const router = express.Router();
const B = config.brand;

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get('/', (req, res) => {
  const activeBids = db.prepare(`
    SELECT b.*, l.title, l.slug, l.current_bid, l.auction_ends_at, l.status AS listing_status,
           l.bid_increment, l.high_bidder_id,
           (SELECT file_name FROM listing_images i WHERE i.listing_id = l.id
             ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS primary_image
      FROM bids b JOIN listings l ON l.id = b.listing_id
     WHERE b.user_id = ? AND b.status IN ('active','outbid')
       AND l.status = 'live'
     GROUP BY b.listing_id
     ORDER BY l.auction_ends_at ASC
  `).all(req.user.id);

  const watching = db.prepare(`
    SELECT l.*, (SELECT file_name FROM listing_images i WHERE i.listing_id = l.id
                  ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS primary_image
      FROM watchlist w JOIN listings l ON l.id = w.listing_id
     WHERE w.user_id = ? ORDER BY w.created_at DESC LIMIT 8
  `).all(req.user.id);

  const orders = orderModel.forUser(req.user.id).slice(0, 5);
  const myAgreements = agreements.forUser(req.user.id);

  res.render('pages/account/dashboard', {
    title: `Your account — ${B.name}`,
    bodyClass: 'page-account',
    eligibility: userModel.bidEligibility(req.user),
    activeBids, watching, orders,
    agreements: myAgreements.slice(0, 5),
    pendingSignature: myAgreements.filter((a) => ['sent', 'viewed', 'draft'].includes(a.status)),
    stats: {
      bids: db.prepare('SELECT COUNT(*) AS n FROM bids WHERE user_id = ?').get(req.user.id).n,
      won: db.prepare("SELECT COUNT(*) AS n FROM bids WHERE user_id = ? AND status = 'won'").get(req.user.id).n,
      orders: orderModel.forUser(req.user.id).length,
      watching: db.prepare('SELECT COUNT(*) AS n FROM watchlist WHERE user_id = ?').get(req.user.id).n,
    },
  });
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

router.get('/profile', (req, res) => {
  res.render('pages/account/profile', {
    title: `Your details — ${B.name}`,
    bodyClass: 'page-account',
    values: {
      full_name: req.user.full_name,
      phone: req.user.phone,
      company: req.user.company,
      address_line1: req.user.address_line1,
      address_line2: req.user.address_line2,
      city: req.user.city,
      state: req.user.state,
      postal_code: req.user.postal_code,
    },
    errors: {},
  });
});

router.post('/profile', asyncRoute(async (req, res) => {
  const { values, errors } = validate(req.body, {
    full_name: { required: true, label: 'Full name', minLength: 2, maxLength: 120 },
    phone: { required: true, type: 'phone', label: 'Phone number' },
    company: { maxLength: 160 },
    address_line1: { required: true, label: 'Street address', maxLength: 200 },
    address_line2: { maxLength: 200 },
    city: { required: true, label: 'City', maxLength: 120 },
    state: { required: true, type: 'state', label: 'State' },
    postal_code: { required: true, type: 'zip', label: 'ZIP code' },
  });

  if (Object.keys(errors).length) {
    return res.status(400).render('pages/account/profile', {
      title: `Your details — ${B.name}`,
      bodyClass: 'page-account', values, errors,
    });
  }

  userModel.updateProfile(req.user.id, {
    fullName: values.full_name,
    phone: values.phone,
    company: values.company || null,
    line1: values.address_line1,
    line2: values.address_line2 || null,
    city: values.city,
    state: values.state,
    postalCode: values.postal_code,
  });

  req.flash('success', 'Your details are saved. These are the details printed on your purchase agreements.');
  return res.redirect('/account/profile');
}));

router.get('/password', (req, res) => {
  res.render('pages/account/password', {
    title: `Change your password — ${B.name}`,
    bodyClass: 'page-account', errors: {},
  });
});

router.post('/password', asyncRoute(async (req, res) => {
  const errors = {};
  const full = userModel.findByEmail(req.user.email);

  if (!userModel.verifyPassword(full, req.body.current_password)) {
    errors.current_password = 'That is not your current password.';
  }
  const problems = passwordProblems(req.body.password);
  if (problems.length) errors.password = `Your new password needs ${problems.join(', ')}.`;
  if (req.body.password !== req.body.password_confirm) {
    errors.password_confirm = 'The two passwords do not match.';
  }

  if (Object.keys(errors).length) {
    return res.status(400).render('pages/account/password', {
      title: `Change your password — ${B.name}`,
      bodyClass: 'page-account', errors,
    });
  }

  await userModel.setPassword(req.user.id, req.body.password);
  req.flash('success', 'Password changed.');
  return res.redirect('/account/profile');
}));

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

router.get('/verify-email', (req, res) => {
  if (req.user.email_verified) return res.redirect('/account/verification');

  // With no SMTP configured the confirmation mail goes to a file outbox that
  // the buyer cannot read, which leaves them stuck. Hand them their own link
  // instead. This is their address and their account, and the panel vanishes
  // as soon as real mail is configured.
  const canSendMail = Boolean(config.mail.enabled && config.mail.host);
  let selfServeUrl = null;
  if (config.mail.showVerifyLink) {
    const token = userModel.regenerateVerifyToken(req.user.id);
    selfServeUrl = `${config.baseUrl}/verify-email/${token}`;
  }

  return res.render('pages/account/verify-email', {
    title: `Confirm your email — ${B.name}`,
    bodyClass: 'page-account',
    canSendMail,
    selfServeUrl,
  });
});

router.post('/verify-email/resend', limiters.auth, asyncRoute(async (req, res) => {
  if (req.user.email_verified) return res.redirect('/account');

  const token = userModel.regenerateVerifyToken(req.user.id);
  const mail = templates.welcome({
    user: req.user, verifyUrl: `${config.baseUrl}/verify-email/${token}`,
  });
  await mailer.send({
    to: req.user.email, subject: mail.subject, html: mail.html,
    template: mail.template, relatedType: 'user', relatedId: req.user.id,
  });

  req.flash('success', `Confirmation email sent again to ${req.user.email}.`);
  return res.redirect('/account/verify-email');
}));

// ---------------------------------------------------------------------------
// Identity verification (KYC)
// ---------------------------------------------------------------------------

router.get('/verification', (req, res) => {
  const documents = userModel.getDocuments(req.user.id);
  const byType = Object.fromEntries(documents.map((d) => [d.doc_type, d]));

  res.render('pages/account/verification', {
    title: `Verify your identity — ${B.name}`,
    bodyClass: 'page-account',
    documents: byType,
    missing: userModel.missingDocuments(req.user.id),
    requiredDocs: userModel.REQUIRED_DOCS,
    eligibility: userModel.bidEligibility(req.user),
  });
});

router.post('/verification',
  kycUpload, csrfMultipart, assertCsrfChecked,
  asyncRoute(async (req, res) => {
  if (['pending', 'approved'].includes(req.user.kyc_status)) {
    req.flash('info', req.user.kyc_status === 'approved'
      ? 'Your identity is already verified.'
      : 'Your documents are already under review.');
    return res.redirect('/account/verification');
  }

  const files = req.files || {};
  const accepted = [];

  for (const docType of ['id_front', 'id_back', 'selfie', 'proof_of_address']) {
    const file = files[docType] && files[docType][0];
    if (!file) continue;

    const processed = await processImage(file.buffer, {
      dir: config.dirs.kyc,
      prefix: `u${req.user.id}-${docType}`,
      maxWidth: 1800,
      quality: 88,
    });

    // Replace rather than accumulate: a re-upload should leave one file behind.
    const previous = db.prepare(
      'SELECT file_name FROM kyc_documents WHERE user_id = ? AND doc_type = ?'
    ).get(req.user.id, docType);
    if (previous) {
      const old = path.join(config.dirs.kyc, previous.file_name);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }

    userModel.saveDocument(req.user.id, docType, {
      fileName: processed.fileName,
      originalName: file.originalname,
      mimeType: 'image/jpeg',
      sizeBytes: processed.sizeBytes,
    });
    accepted.push(docType);
  }

  if (!accepted.length) {
    req.flash('error', 'Choose at least one document to upload.');
    return res.redirect('/account/verification');
  }

  const missing = userModel.missingDocuments(req.user.id);
  if (missing.length) {
    req.flash('success',
      `Uploaded. Still needed: ${missing.map(labelFor).join(', ')}.`);
    return res.redirect('/account/verification');
  }

  userModel.submitKyc(req.user.id);

  const mail = templates.kycSubmitted({ user: req.user });
  await mailer.send({
    to: req.user.email, subject: mail.subject, html: mail.html,
    template: mail.template, relatedType: 'user', relatedId: req.user.id,
  });

  const alert = templates.adminAlert({
    title: `Identity verification submitted — ${req.user.full_name}`,
    lines: [
      ['Buyer', `${req.user.full_name} (${req.user.email})`],
      ['Phone', req.user.phone || '—'],
      ['Documents', 'ID front, ID back, selfie'],
    ],
    url: `${config.baseUrl}/admin/users/${req.user.id}`,
    label: 'Review documents',
  });
  await mailer.send({
    to: config.mail.adminNotify, subject: alert.subject, html: alert.html,
    template: alert.template, relatedType: 'user', relatedId: req.user.id,
  });

  req.flash('success', 'Documents submitted. We review during business hours — usually within a few hours.');
  return res.redirect('/account/verification');
}));

function labelFor(docType) {
  return {
    id_front: 'front of ID', id_back: 'back of ID',
    selfie: 'selfie', proof_of_address: 'proof of address',
  }[docType] || docType;
}

/**
 * Serve a KYC image. These live outside /public precisely so that this handler
 * is the only way to reach them — the owner, or an administrator.
 */
router.get('/verification/:docType/preview', (req, res, next) => {
  const doc = db.prepare(
    'SELECT * FROM kyc_documents WHERE user_id = ? AND doc_type = ?'
  ).get(req.user.id, req.params.docType);

  if (!doc) return next();
  const filePath = path.join(config.dirs.kyc, doc.file_name);
  if (!fs.existsSync(filePath)) return next();

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.type('image/jpeg').sendFile(filePath);
});

// ---------------------------------------------------------------------------
// Bids, orders, agreements, watchlist
// ---------------------------------------------------------------------------

router.get('/bids', (req, res) => {
  const bids = db.prepare(`
    SELECT b.*, l.title, l.slug, l.current_bid, l.auction_ends_at,
           l.status AS listing_status,
           (SELECT file_name FROM listing_images i WHERE i.listing_id = l.id
             ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS primary_image
      FROM bids b JOIN listings l ON l.id = b.listing_id
     WHERE b.user_id = ? ORDER BY b.created_at DESC
  `).all(req.user.id);

  res.render('pages/account/bids', {
    title: `Your bids — ${B.name}`, bodyClass: 'page-account', bids,
  });
});

router.get('/orders', (req, res) => {
  res.render('pages/account/orders', {
    title: `Your orders — ${B.name}`,
    bodyClass: 'page-account',
    orders: orderModel.forUser(req.user.id),
  });
});

router.get('/orders/:id', (req, res, next) => {
  const order = orderModel.findById(req.params.id);
  if (!order || order.user_id !== req.user.id) return next();

  const agreement = db.prepare(`
    SELECT * FROM agreements WHERE order_id = ? ORDER BY id DESC LIMIT 1
  `).get(order.id);

  return res.render('pages/account/order-detail', {
    title: `Order ${order.order_number} — ${B.name}`,
    bodyClass: 'page-account',
    order, agreement,
    signUrl: agreement ? agreements.signUrl(agreement) : null,
  });
});

router.get('/agreements', (req, res) => {
  res.render('pages/account/agreements', {
    title: `Your agreements — ${B.name}`,
    bodyClass: 'page-account',
    agreements: agreements.forUser(req.user.id),
    signUrlFor: (a) => `${config.baseUrl}/sign/${a.access_token}`,
  });
});

router.get('/agreements/:id/download', (req, res, next) => {
  const agreement = agreements.findById(req.params.id);
  if (!agreement || agreement.user_id !== req.user.id) return next();

  const fileName = agreement.pdf_signed || agreement.pdf_unsigned;
  if (!fileName) return next();

  const filePath = path.join(config.dirs.agreements, fileName);
  if (!fs.existsSync(filePath)) return next();

  res.setHeader('Cache-Control', 'private, no-store');
  return res.download(
    filePath,
    `Purchase_Agreement_${agreement.agreement_number}${agreement.pdf_signed ? '_signed' : ''}.pdf`
  );
});

router.get('/watchlist', (req, res) => {
  const items = db.prepare(`
    SELECT l.*, w.created_at AS watched_at,
           (SELECT file_name FROM listing_images i WHERE i.listing_id = l.id
             ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS primary_image
      FROM watchlist w JOIN listings l ON l.id = w.listing_id
     WHERE w.user_id = ? ORDER BY w.created_at DESC
  `).all(req.user.id);

  res.render('pages/account/watchlist', {
    title: `Your watchlist — ${B.name}`, bodyClass: 'page-account', items,
  });
});

module.exports = router;
