'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../../config');
const agreements = require('../services/agreementService');
const listingModel = require('../models/listing');
const { asyncRoute } = require('../middleware/common');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const B = config.brand;

// Signing links are unguessable, but throttle anyway so a leaked token cannot
// be hammered and so a bot cannot brute-force the token space.
const signLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please wait a few minutes.',
});

router.use(signLimiter);

/** Resolve the agreement from its token for every route below. */
function loadAgreement(req, res, next) {
  const agreement = agreements.findByToken(req.params.token);
  if (!agreement) {
    return res.status(404).render('pages/sign/invalid', {
      title: 'Document not found',
      bodyClass: 'page-sign',
      layout: 'layouts/bare',
    });
  }
  req.agreement = agreement;
  return next();
}

// ---------------------------------------------------------------------------
// Review & sign
// ---------------------------------------------------------------------------

router.get('/:token', loadAgreement, (req, res) => {
  const agreement = req.agreement;

  if (['signed', 'declined', 'voided'].includes(agreement.status)) {
    return res.redirect(`/sign/${agreement.access_token}/complete`);
  }

  agreements.markViewed(agreement, req.ip);
  const listing = listingModel.findById(agreement.listing_id);

  return res.render('pages/sign/review', {
    title: `Review & sign — Purchase Agreement #${agreement.agreement_number}`,
    bodyClass: 'page-sign',
    layout: 'layouts/bare',
    agreement: agreements.findById(agreement.id),
    listing,
    images: listing ? listingModel.images(listing.id).slice(0, 1) : [],
    terms: require('../content/agreementClauses')(B, agreement),
    pdfUrl: `/sign/${agreement.access_token}/document.pdf`,
  });
});

/** Inline PDF preview of the document being signed. */
router.get('/:token/document.pdf', loadAgreement, (req, res, next) => {
  const agreement = req.agreement;
  const fileName = agreement.pdf_signed || agreement.pdf_unsigned;
  if (!fileName) return next();

  const filePath = path.join(config.dirs.agreements, fileName);
  if (!fs.existsSync(filePath)) return next();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `inline; filename="Purchase_Agreement_${agreement.agreement_number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(filePath);
});

router.post('/:token/sign', loadAgreement, asyncRoute(async (req, res) => {
  const agreement = req.agreement;

  const result = await agreements.sign(agreement, {
    signatureDataUrl: req.body.signature_data,
    typedName: req.body.signature_name,
    method: req.body.signature_method === 'drawn' ? 'drawn' : 'typed',
    consent: ['1', 'true', 'on', 'yes'].includes(String(req.body.consent).toLowerCase()),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  if (!result.ok) {
    const messages = {
      already_signed: 'This document has already been signed.',
      not_signable: 'This document is no longer available for signature.',
      consent_required: 'You must agree to sign electronically before continuing.',
      name_required: 'Please enter your full legal name.',
      name_mismatch: 'The name you signed does not match the name on this '
        + 'agreement. Sign exactly as the contract names you, or contact us '
        + 'if the name is wrong.',
      bad_signature: 'We could not read your signature. Please draw it again.',
      signature_too_large: 'That signature image is too large. Please draw it again.',
    };
    req.flash('error', messages[result.error] || 'We could not record your signature.');
    return res.redirect(`/sign/${agreement.access_token}`);
  }

  return res.redirect(`/sign/${agreement.access_token}/complete`);
}));

router.post('/:token/decline', loadAgreement, asyncRoute(async (req, res) => {
  if (['signed', 'voided'].includes(req.agreement.status)) {
    return res.redirect(`/sign/${req.agreement.access_token}/complete`);
  }
  agreements.decline(req.agreement, {
    reason: String(req.body.reason || '').slice(0, 500),
    ip: req.ip,
  });
  return res.redirect(`/sign/${req.agreement.access_token}/complete`);
}));

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

router.get('/:token/complete', loadAgreement, (req, res) => {
  const agreement = req.agreement;
  let auditTrail = [];
  try { auditTrail = JSON.parse(agreement.audit_trail || '[]'); } catch { auditTrail = []; }

  res.render('pages/sign/complete', {
    title: agreement.status === 'signed'
      ? `Signed — Purchase Agreement #${agreement.agreement_number}`
      : `Purchase Agreement #${agreement.agreement_number}`,
    bodyClass: 'page-sign',
    layout: 'layouts/bare',
    agreement,
    auditTrail,
    downloadUrl: `/sign/${agreement.access_token}/download`,
  });
});

router.get('/:token/download', loadAgreement, (req, res, next) => {
  const agreement = req.agreement;
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

module.exports = router;
