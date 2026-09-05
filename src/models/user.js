'use strict';

const bcrypt = require('bcryptjs');
const { db } = require('../../config/database');
const config = require('../../config');
const tokens = require('../services/tokens');
const { nowIso, addHours } = require('../services/dates');

const PUBLIC_COLUMNS = `
  id, email, full_name, phone, company,
  address_line1, address_line2, city, state, postal_code, country,
  role, status, email_verified, kyc_status, kyc_rejection_reason,
  kyc_submitted_at, kyc_reviewed_at, bid_limit,
  last_login_at, created_at, updated_at
`;

function findById(id) {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id);
}

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
}

function emailExists(email) {
  return Boolean(
    db.prepare('SELECT 1 FROM users WHERE email = ?').get(String(email || '').trim())
  );
}

async function create({ email, password, fullName, phone, company, address = {} }) {
  const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);
  const verifyToken = tokens.random(24);
  const verifyExpires = addHours(new Date(), config.security.emailVerifyHours).toISOString();

  const info = db.prepare(`
    INSERT INTO users (
      email, password_hash, full_name, phone, company,
      address_line1, address_line2, city, state, postal_code, country,
      email_verify_token, email_verify_expires
    ) VALUES (
      @email, @passwordHash, @fullName, @phone, @company,
      @line1, @line2, @city, @state, @postalCode, @country,
      @verifyToken, @verifyExpires
    )
  `).run({
    email: String(email).trim(),
    passwordHash,
    fullName: String(fullName).trim(),
    phone: phone || null,
    company: company || null,
    line1: address.line1 || null,
    line2: address.line2 || null,
    city: address.city || null,
    state: address.state || null,
    postalCode: address.postalCode || null,
    country: address.country || 'United States',
    verifyToken,
    verifyExpires,
  });

  return { id: Number(info.lastInsertRowid), verifyToken };
}

function verifyPassword(user, password) {
  if (!user || !user.password_hash) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

async function setPassword(userId, password) {
  const hash = await bcrypt.hash(password, config.security.bcryptRounds);
  db.prepare(`
    UPDATE users
       SET password_hash = ?, reset_token = NULL, reset_expires = NULL,
           updated_at = ?
     WHERE id = ?
  `).run(hash, nowIso(), userId);
}

function updateProfile(userId, fields) {
  db.prepare(`
    UPDATE users SET
      full_name     = COALESCE(@fullName, full_name),
      phone         = COALESCE(@phone, phone),
      company       = @company,
      address_line1 = COALESCE(@line1, address_line1),
      address_line2 = @line2,
      city          = COALESCE(@city, city),
      state         = COALESCE(@state, state),
      postal_code   = COALESCE(@postalCode, postal_code),
      country       = COALESCE(@country, country),
      updated_at    = @now
    WHERE id = @id
  `).run({
    id: userId,
    fullName: fields.fullName ?? null,
    phone: fields.phone ?? null,
    company: fields.company ?? null,
    line1: fields.line1 ?? null,
    line2: fields.line2 ?? null,
    city: fields.city ?? null,
    state: fields.state ?? null,
    postalCode: fields.postalCode ?? null,
    country: fields.country ?? null,
    now: nowIso(),
  });
  return findById(userId);
}

// ---- Email verification ---------------------------------------------------

function findByVerifyToken(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT * FROM users
     WHERE email_verify_token = ? AND email_verify_expires > ?
  `).get(token, nowIso());
}

function markEmailVerified(userId) {
  db.prepare(`
    UPDATE users
       SET email_verified = 1, email_verify_token = NULL,
           email_verify_expires = NULL, updated_at = ?
     WHERE id = ?
  `).run(nowIso(), userId);
}

function regenerateVerifyToken(userId) {
  const token = tokens.random(24);
  db.prepare(`
    UPDATE users SET email_verify_token = ?, email_verify_expires = ?, updated_at = ?
     WHERE id = ?
  `).run(token, addHours(new Date(), config.security.emailVerifyHours).toISOString(),
    nowIso(), userId);
  return token;
}

// ---- Password reset -------------------------------------------------------

function createResetToken(userId) {
  const token = tokens.random(24);
  db.prepare(`
    UPDATE users SET reset_token = ?, reset_expires = ?, updated_at = ? WHERE id = ?
  `).run(token, addHours(new Date(), config.security.passwordResetHours).toISOString(),
    nowIso(), userId);
  return token;
}

function findByResetToken(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT * FROM users WHERE reset_token = ? AND reset_expires > ?
  `).get(token, nowIso());
}

// ---- Sessions & auth bookkeeping -----------------------------------------

function recordLogin(userId, ip) {
  db.prepare('UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
    .run(nowIso(), ip || null, userId);
}

// ---- KYC ------------------------------------------------------------------

const REQUIRED_DOCS = ['id_front', 'id_back', 'selfie'];

function getDocuments(userId) {
  return db.prepare('SELECT * FROM kyc_documents WHERE user_id = ?').all(userId);
}

/** Which of the three required documents are still missing. */
function missingDocuments(userId) {
  const have = new Set(getDocuments(userId).map((d) => d.doc_type));
  return REQUIRED_DOCS.filter((t) => !have.has(t));
}

function saveDocument(userId, docType, file) {
  db.prepare(`
    INSERT INTO kyc_documents (user_id, doc_type, file_name, original_name, mime_type, size_bytes)
    VALUES (@userId, @docType, @fileName, @originalName, @mimeType, @sizeBytes)
    ON CONFLICT (user_id, doc_type) DO UPDATE SET
      file_name = excluded.file_name, original_name = excluded.original_name,
      mime_type = excluded.mime_type, size_bytes = excluded.size_bytes,
      uploaded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).run({
    userId, docType,
    fileName: file.fileName,
    originalName: file.originalName || null,
    mimeType: file.mimeType || null,
    sizeBytes: file.sizeBytes || null,
  });
}

function submitKyc(userId) {
  db.prepare(`
    UPDATE users
       SET kyc_status = 'pending', kyc_submitted_at = ?,
           kyc_rejection_reason = NULL, updated_at = ?
     WHERE id = ? AND kyc_status IN ('none','rejected')
  `).run(nowIso(), nowIso(), userId);
}

function reviewKyc(userId, { approved, reason, reviewerId }) {
  db.prepare(`
    UPDATE users
       SET kyc_status = ?, kyc_rejection_reason = ?, kyc_reviewed_at = ?,
           kyc_reviewed_by = ?, updated_at = ?
     WHERE id = ?
  `).run(
    approved ? 'approved' : 'rejected',
    approved ? null : (reason || 'Documents could not be verified.'),
    nowIso(), reviewerId || null, nowIso(), userId
  );
}

/**
 * A buyer may bid or buy only once every gate is clear. Returning the specific
 * blocking reason lets the UI send them straight to the step that unblocks it.
 */
function bidEligibility(user) {
  if (!user) {
    return { eligible: false, reason: 'signin', message: 'Sign in to place a bid.' };
  }
  if (user.status !== 'active') {
    return { eligible: false, reason: 'suspended', message: 'This account is suspended. Contact support.' };
  }
  if (!user.email_verified) {
    return { eligible: false, reason: 'email', message: 'Confirm your email address to start bidding.' };
  }
  if (user.kyc_status === 'none') {
    return { eligible: false, reason: 'kyc', message: 'Upload your ID to unlock bidding.' };
  }
  if (user.kyc_status === 'pending') {
    return { eligible: false, reason: 'kyc_pending', message: 'Your ID is under review — usually within a few hours.' };
  }
  if (user.kyc_status === 'rejected') {
    return { eligible: false, reason: 'kyc_rejected', message: user.kyc_rejection_reason || 'Your ID could not be verified. Please re-upload.' };
  }
  if (!user.address_line1 || !user.city || !user.state || !user.postal_code) {
    return { eligible: false, reason: 'address', message: 'Add your billing address — it is printed on the purchase agreement.' };
  }
  return { eligible: true, reason: null, message: null };
}

// ---- Admin listing --------------------------------------------------------

function list({ search, kycStatus, role, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = {};
  if (search) {
    where.push('(email LIKE @q OR full_name LIKE @q OR phone LIKE @q OR company LIKE @q)');
    params.q = `%${search}%`;
  }
  if (kycStatus) { where.push('kyc_status = @kycStatus'); params.kycStatus = kycStatus; }
  if (role) { where.push('role = @role'); params.role = role; }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT ${PUBLIC_COLUMNS} FROM users ${clause}
     ORDER BY created_at DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM users ${clause}`).get(params);
  return { rows, total };
}

function counts() {
  return db.prepare(`
    SELECT
      COUNT(*)                                              AS total,
      SUM(CASE WHEN kyc_status = 'pending'  THEN 1 ELSE 0 END) AS kyc_pending,
      SUM(CASE WHEN kyc_status = 'approved' THEN 1 ELSE 0 END) AS kyc_approved,
      SUM(CASE WHEN email_verified = 0      THEN 1 ELSE 0 END) AS unverified
    FROM users WHERE role = 'buyer'
  `).get();
}

function setStatus(userId, status) {
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, nowIso(), userId);
}

module.exports = {
  REQUIRED_DOCS,
  findById, findByEmail, emailExists, create, verifyPassword, setPassword,
  updateProfile, findByVerifyToken, markEmailVerified, regenerateVerifyToken,
  createResetToken, findByResetToken, recordLogin,
  getDocuments, missingDocuments, saveDocument, submitKyc, reviewKyc,
  bidEligibility, list, counts, setStatus,
};
