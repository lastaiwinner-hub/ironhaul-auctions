'use strict';

const fs = require('fs');
const path = require('path');
const { db } = require('../../config/database');
const config = require('../../config');
const tokens = require('./tokens');
const money = require('./money');
const mailer = require('./mailer');
const { templates } = require('./emailTemplates');
const { buildAgreementPdf } = require('./pdfService');
const { nowIso } = require('./dates');
const listingModel = require('../models/listing');
const settings = require('../models/settings');

const B = config.brand;

/**
 * When a purchase agreement is issued.
 *   on_bid     — the moment any bid is placed (the configured default: the
 *                bidder gets their contract immediately, pre-filled)
 *   on_win     — only when a bidder wins a cycle
 *   never      — auctions issue nothing; Buy Now still always issues
 * Buy Now always produces an agreement regardless of this setting.
 */
const TRIGGERS = ['on_bid', 'on_win', 'never'];

function trigger() {
  const value = settings.get('agreement_trigger', 'on_bid');
  return TRIGGERS.includes(value) ? value : 'on_bid';
}

function findById(id) {
  return db.prepare('SELECT * FROM agreements WHERE id = ?').get(id);
}

function findByToken(token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM agreements WHERE access_token = ?').get(token);
}

function findByNumber(number) {
  return db.prepare('SELECT * FROM agreements WHERE agreement_number = ?').get(number);
}

/** The buyer's still-open contract for a listing, if any. */
function findOpenFor(userId, listingId) {
  return db.prepare(`
    SELECT * FROM agreements
     WHERE user_id = ? AND listing_id = ?
       AND status IN ('draft','sent','viewed')
     ORDER BY id DESC LIMIT 1
  `).get(userId, listingId);
}

function forUser(userId) {
  return db.prepare(`
    SELECT a.*, l.slug AS listing_slug,
           (SELECT file_name FROM listing_images i WHERE i.listing_id = l.id
             ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS primary_image
      FROM agreements a JOIN listings l ON l.id = a.listing_id
     WHERE a.user_id = ? ORDER BY a.created_at DESC
  `).all(userId);
}

function signUrl(agreement) {
  return `${config.baseUrl}/sign/${agreement.access_token}`;
}

function appendAudit(agreementId, event) {
  const row = db.prepare('SELECT audit_trail FROM agreements WHERE id = ?').get(agreementId);
  let trail = [];
  try { trail = JSON.parse(row.audit_trail || '[]'); } catch { trail = []; }
  trail.push({ at: nowIso(), ...event });
  db.prepare('UPDATE agreements SET audit_trail = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(trail), nowIso(), agreementId);
  return trail;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Create (or refresh) a buyer's purchase agreement for a listing.
 *
 * Re-bidding does not spawn a second contract: the still-open one is updated
 * with the new amount and its PDF regenerated, so the buyer always holds a
 * single document that reflects their current position.
 */
async function issue({
  user, listing, amount, shippingFee = null, triggerType = 'bid',
  orderId = null, bidId = null,
}) {
  const shipping = shippingFee === null ? estimateShipping(user) : shippingFee;
  const existing = findOpenFor(user.id, listing.id);

  const snapshot = {
    buyer_name: user.full_name,
    buyer_email: user.email,
    buyer_phone: user.phone || null,
    buyer_line1: user.address_line1 || null,
    buyer_line2: user.address_line2 || null,
    buyer_city: user.city || null,
    buyer_state: user.state || null,
    buyer_zip: user.postal_code || null,
    buyer_country: user.country || 'United States',

    seller_name: B.legalName,
    seller_address: B.address.line1,
    seller_city_line: `${B.address.city}, ${B.address.state} ${B.address.postalCode}`,
    seller_phone: B.contact.phone,
    seller_email: B.contact.email,

    item_title: listing.title,
    item_year: listing.year || null,
    item_make: listing.make || null,
    item_model: listing.model || null,
    item_meter: listingModel.meterLabel(listing),
    item_engine_hp: listing.engine_hp ? String(listing.engine_hp) : null,
    item_serial: listing.serial_number || 'On request',
    item_stock: listing.stock_number || null,

    purchase_price: amount,
    shipping_fee: shipping,
    total_amount: amount + shipping,
  };

  let agreement;

  if (existing) {
    db.prepare(`
      UPDATE agreements SET
        buyer_name = @buyer_name, buyer_email = @buyer_email, buyer_phone = @buyer_phone,
        buyer_line1 = @buyer_line1, buyer_line2 = @buyer_line2, buyer_city = @buyer_city,
        buyer_state = @buyer_state, buyer_zip = @buyer_zip, buyer_country = @buyer_country,
        item_meter = @item_meter,
        purchase_price = @purchase_price, shipping_fee = @shipping_fee,
        total_amount = @total_amount,
        trigger = @trigger, order_id = COALESCE(@orderId, order_id),
        bid_id = COALESCE(@bidId, bid_id), updated_at = @now
      WHERE id = @id
    `).run({
      ...snapshot, id: existing.id, trigger: triggerType,
      orderId, bidId, now: nowIso(),
    });
    agreement = findById(existing.id);
    appendAudit(agreement.id, {
      event: 'updated',
      label: `Amount updated to ${money.format(amount)}`,
    });
  } else {
    const info = db.prepare(`
      INSERT INTO agreements (
        agreement_number, order_id, bid_id, user_id, listing_id, trigger,
        buyer_name, buyer_email, buyer_phone, buyer_line1, buyer_line2,
        buyer_city, buyer_state, buyer_zip, buyer_country,
        seller_name, seller_address, seller_city_line, seller_phone, seller_email,
        item_title, item_year, item_make, item_model, item_meter,
        item_engine_hp, item_serial, item_stock,
        purchase_price, shipping_fee, total_amount,
        access_token, doc_id, status
      ) VALUES (
        @agreement_number, @orderId, @bidId, @userId, @listingId, @trigger,
        @buyer_name, @buyer_email, @buyer_phone, @buyer_line1, @buyer_line2,
        @buyer_city, @buyer_state, @buyer_zip, @buyer_country,
        @seller_name, @seller_address, @seller_city_line, @seller_phone, @seller_email,
        @item_title, @item_year, @item_make, @item_model, @item_meter,
        @item_engine_hp, @item_serial, @item_stock,
        @purchase_price, @shipping_fee, @total_amount,
        @access_token, @doc_id, 'draft'
      )
    `).run({
      ...snapshot,
      agreement_number: tokens.reference('PA'),
      orderId, bidId,
      userId: user.id, listingId: listing.id, trigger: triggerType,
      access_token: tokens.random(32),
      doc_id: tokens.docId(),
    });
    agreement = findById(Number(info.lastInsertRowid));
    appendAudit(agreement.id, {
      event: 'created',
      label: `Agreement created (${triggerType})`,
    });
  }

  await renderPdf(agreement);
  return findById(agreement.id);
}

/** Generate the unsigned PDF and record its filename against the agreement. */
async function renderPdf(agreement) {
  const fileName = `PA-${agreement.agreement_number}-unsigned.pdf`;
  const outputPath = path.join(config.dirs.agreements, fileName);
  await buildAgreementPdf(agreement, { outputPath });
  db.prepare('UPDATE agreements SET pdf_unsigned = ?, updated_at = ? WHERE id = ?')
    .run(fileName, nowIso(), agreement.id);
  return outputPath;
}

/** Fall back to a flat fee until the buyer supplies a delivery ZIP. */
function estimateShipping() {
  return B.terms.defaultShippingFee;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function send(agreementId, { templateName = 'agreementRequest', extra = {} } = {}) {
  const agreement = findById(agreementId);
  if (!agreement) return { ok: false, error: 'not_found' };

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(agreement.user_id);
  const pdfPath = agreement.pdf_unsigned
    ? path.join(config.dirs.agreements, agreement.pdf_unsigned)
    : null;

  const builder = templates[templateName];
  const mail = builder({ user, agreement, signUrl: signUrl(agreement), ...extra });

  const result = await mailer.send({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    template: mail.template,
    relatedType: 'agreement',
    relatedId: agreement.id,
    attachments: pdfPath && fs.existsSync(pdfPath)
      ? [{ filename: `Purchase_Agreement_${agreement.agreement_number}.pdf`, path: pdfPath }]
      : [],
  });

  if (result.ok && agreement.status === 'draft') {
    db.prepare(`
      UPDATE agreements SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?
    `).run(nowIso(), nowIso(), agreement.id);
    appendAudit(agreement.id, {
      event: 'sent',
      label: `Sent for signature to ${user.email}`,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Viewing & signing
// ---------------------------------------------------------------------------

function markViewed(agreement, ip) {
  if (agreement.status === 'sent') {
    db.prepare(`
      UPDATE agreements SET status = 'viewed', viewed_at = ?, updated_at = ? WHERE id = ?
    `).run(nowIso(), nowIso(), agreement.id);
    appendAudit(agreement.id, { event: 'viewed', label: 'Document viewed by buyer', ip });
  } else if (agreement.status === 'draft') {
    db.prepare(`
      UPDATE agreements SET status = 'viewed', viewed_at = COALESCE(viewed_at, ?),
             updated_at = ? WHERE id = ?
    `).run(nowIso(), nowIso(), agreement.id);
    appendAudit(agreement.id, { event: 'viewed', label: 'Document viewed by buyer', ip });
  }
}

/**
 * Apply the buyer's signature, stamp the executed PDF and email both parties.
 *
 * `signatureDataUrl` is the PNG produced by the canvas signature pad; a typed
 * signature arrives without one and is rendered as script text instead.
 */
/**
 * Do two names refer to the same person for signing purposes?
 *
 * Deliberately forgiving about how a name is written — "José  García",
 * "Jose Garcia" and "Garcia, Jose" are the same signature — and deliberately
 * strict about who it is. A middle name present on one side only is accepted,
 * since people sign both ways.
 */
function namesMatch(signed, onContract) {
  const parts = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);

  const a = parts(signed);
  const b = parts(onContract);
  if (!a.length || !b.length) return false;

  // Every word in the shorter name must appear in the longer one.
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.every((word) => longer.includes(word));
}

async function sign(agreement, {
  signatureDataUrl, typedName, method, ip, userAgent, consent,
}) {
  if (agreement.status === 'signed') {
    return { ok: false, error: 'already_signed' };
  }
  if (agreement.status === 'voided' || agreement.status === 'declined') {
    return { ok: false, error: 'not_signable' };
  }
  if (!consent) {
    return { ok: false, error: 'consent_required' };
  }

  const name = String(typedName || agreement.buyer_name).trim();
  if (name.length < 2) return { ok: false, error: 'name_required' };

  // The signature has to be the name the contract was drawn up in. Accents,
  // double spaces, middle names and word order are all forgiven; a different
  // person is not.
  if (!namesMatch(name, agreement.buyer_name)) {
    return { ok: false, error: 'name_mismatch', expected: agreement.buyer_name };
  }

  let signatureFile = null;
  let imagePath = null;

  if (method === 'drawn' && signatureDataUrl) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
      String(signatureDataUrl).trim()
    );
    if (!match) return { ok: false, error: 'bad_signature' };

    const buffer = Buffer.from(match[1], 'base64');
    // A sane ceiling: a 1MB canvas PNG is already far larger than any real
    // signature, and the cap keeps a hostile payload out of the filesystem.
    if (buffer.length > 1_000_000) return { ok: false, error: 'signature_too_large' };

    signatureFile = `sig-${agreement.agreement_number}-${Date.now()}.png`;
    imagePath = path.join(config.dirs.signatures, signatureFile);
    fs.writeFileSync(imagePath, buffer);
  }

  const signedAt = nowIso();

  db.prepare(`
    UPDATE agreements SET
      status = 'signed', signed_at = @signedAt,
      signature_image = @signatureFile, signature_name = @name,
      signature_ip = @ip, signature_agent = @userAgent,
      signature_method = @method, updated_at = @signedAt
    WHERE id = @id
  `).run({
    id: agreement.id, signedAt, signatureFile, name,
    ip: ip || null, userAgent: (userAgent || '').slice(0, 300),
    method: method === 'drawn' ? 'drawn' : 'typed',
  });

  appendAudit(agreement.id, {
    event: 'signed',
    label: `Signed by ${name} (${method === 'drawn' ? 'drawn' : 'typed'})`,
    ip,
  });
  appendAudit(agreement.id, { event: 'completed', label: 'The document has been completed.', ip });

  const signed = findById(agreement.id);

  const signedFileName = `PA-${signed.agreement_number}-signed.pdf`;
  const signedPath = path.join(config.dirs.agreements, signedFileName);
  await buildAgreementPdf(signed, {
    signature: { name, imagePath, signedAt },
    outputPath: signedPath,
  });
  db.prepare('UPDATE agreements SET pdf_signed = ?, updated_at = ? WHERE id = ?')
    .run(signedFileName, nowIso(), signed.id);

  // Advance any attached order past the paperwork stage.
  if (signed.order_id) {
    db.prepare(`
      UPDATE orders SET status = 'agreement_signed', updated_at = ?
       WHERE id = ? AND status IN ('pending_agreement','agreement_sent')
    `).run(nowIso(), signed.order_id);
  }

  const final = findById(signed.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(final.user_id);

  const mail = templates.agreementSigned({
    user, agreement: final,
    downloadUrl: `${config.baseUrl}/account/agreements/${final.id}/download`,
  });
  await mailer.send({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    template: mail.template,
    relatedType: 'agreement',
    relatedId: final.id,
    attachments: [{
      filename: `Purchase_Agreement_${final.agreement_number}_signed.pdf`,
      path: signedPath,
    }],
  });

  const alert = templates.adminAlert({
    title: `Agreement signed — ${final.agreement_number}`,
    lines: [
      ['Buyer', `${final.buyer_name} (${final.buyer_email})`],
      ['Equipment', final.item_title],
      ['Total', money.format(final.total_amount)],
      ['Signed at', signedAt],
      ['IP address', ip || 'unknown'],
    ],
    url: `${config.baseUrl}/admin/agreements/${final.id}`,
    label: 'Open agreement',
  });
  await mailer.send({
    to: config.mail.adminNotify,
    subject: alert.subject,
    html: alert.html,
    template: alert.template,
    relatedType: 'agreement',
    relatedId: final.id,
  });

  return { ok: true, agreement: final, signedPath };
}

function decline(agreement, { reason, ip }) {
  db.prepare(`
    UPDATE agreements SET status = 'declined', declined_at = ?, decline_reason = ?,
           updated_at = ? WHERE id = ?
  `).run(nowIso(), reason || null, nowIso(), agreement.id);
  appendAudit(agreement.id, {
    event: 'declined',
    label: `Declined by buyer${reason ? `: ${reason}` : ''}`,
    ip,
  });
  return findById(agreement.id);
}

function voidAgreement(agreementId, reason) {
  db.prepare(`
    UPDATE agreements SET status = 'voided', updated_at = ? WHERE id = ?
  `).run(nowIso(), agreementId);
  appendAudit(agreementId, { event: 'voided', label: `Voided by operator${reason ? `: ${reason}` : ''}` });
  return findById(agreementId);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

function list({ status, search, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = { limit, offset };
  if (status) { where.push('a.status = @status'); params.status = status; }
  if (search) {
    where.push('(a.agreement_number LIKE @q OR a.buyer_name LIKE @q OR a.buyer_email LIKE @q OR a.item_title LIKE @q)');
    params.q = `%${search}%`;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT a.*, l.slug AS listing_slug
      FROM agreements a JOIN listings l ON l.id = a.listing_id
     ${clause} ORDER BY a.created_at DESC LIMIT @limit OFFSET @offset
  `).all(params);
  const { total } = db.prepare(`
    SELECT COUNT(*) AS total FROM agreements a ${clause}
  `).get(params);
  return { rows, total };
}

function counts() {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN ('sent','viewed') THEN 1 ELSE 0 END) AS awaiting,
      SUM(CASE WHEN status = 'signed'           THEN 1 ELSE 0 END) AS signed,
      SUM(CASE WHEN status = 'declined'         THEN 1 ELSE 0 END) AS declined
    FROM agreements
  `).get();
}

module.exports = {
  namesMatch,
  TRIGGERS, trigger,
  findById, findByToken, findByNumber, findOpenFor, forUser,
  signUrl, appendAudit, issue, renderPdf, send,
  markViewed, sign, decline, voidAgreement, list, counts,
};
