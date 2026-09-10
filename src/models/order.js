'use strict';

const { db } = require('../../config/database');
const tokens = require('../services/tokens');
const { nowIso } = require('../services/dates');

const SELECT = `
  SELECT o.*, l.title AS listing_title, l.slug AS listing_slug,
         l.stock_number, l.serial_number,
         u.full_name AS buyer_name, u.email AS buyer_email,
         (SELECT file_name FROM listing_images i WHERE i.listing_id = l.id
           ORDER BY i.is_primary DESC, i.sort_order LIMIT 1) AS primary_image,
         (SELECT a.id FROM agreements a WHERE a.order_id = o.id
           ORDER BY a.id DESC LIMIT 1) AS agreement_id,
         (SELECT a.status FROM agreements a WHERE a.order_id = o.id
           ORDER BY a.id DESC LIMIT 1) AS agreement_status,
         (SELECT a.agreement_number FROM agreements a WHERE a.order_id = o.id
           ORDER BY a.id DESC LIMIT 1) AS agreement_number
    FROM orders o
    JOIN listings l ON l.id = o.listing_id
    JOIN users u    ON u.id = o.user_id
`;

function findById(id) {
  return db.prepare(`${SELECT} WHERE o.id = ?`).get(id);
}

function findByNumber(number) {
  return db.prepare(`${SELECT} WHERE o.order_number = ?`).get(number);
}

function forUser(userId) {
  return db.prepare(`${SELECT} WHERE o.user_id = ? ORDER BY o.created_at DESC`).all(userId);
}

function create({
  userId, listingId, cycleId = null, type,
  amount, shippingFee = 0, delivery = {}, notes = null,
}) {
  const orderNumber = tokens.reference('ORD');
  const info = db.prepare(`
    INSERT INTO orders (
      order_number, user_id, listing_id, cycle_id, type,
      amount, shipping_fee, total,
      delivery_name, delivery_phone, delivery_email,
      delivery_line1, delivery_line2, delivery_city, delivery_state,
      delivery_zip, delivery_country, notes
    ) VALUES (
      @orderNumber, @userId, @listingId, @cycleId, @type,
      @amount, @shippingFee, @total,
      @name, @phone, @email, @line1, @line2, @city, @state, @zip, @country, @notes
    )
  `).run({
    orderNumber, userId, listingId, cycleId, type,
    amount, shippingFee, total: amount + shippingFee,
    name: delivery.name || null,
    phone: delivery.phone || null,
    email: delivery.email || null,
    line1: delivery.line1 || null,
    line2: delivery.line2 || null,
    city: delivery.city || null,
    state: delivery.state || null,
    zip: delivery.zip || null,
    country: delivery.country || 'United States',
    notes,
  });
  return findById(Number(info.lastInsertRowid));
}

/**
 * Stages an order may not reach until its purchase agreement is signed.
 * Everything from invoicing onward commits the buyer to money changing hands,
 * so the executed contract is the gate in front of all of it.
 */
const SIGNATURE_REQUIRED_FROM = ['invoiced', 'paid', 'in_transit', 'delivered'];

/**
 * Returns null when the order may move to `status`, or a reason string when the
 * missing signature blocks it. Cancelling is always allowed — a deal that never
 * gets signed still has to be closable.
 */
function signatureBlocks(order, status) {
  if (!SIGNATURE_REQUIRED_FROM.includes(status)) return null;

  const agreement = db.prepare(`
    SELECT status, agreement_number FROM agreements
     WHERE order_id = ? ORDER BY id DESC LIMIT 1
  `).get(order.id);

  if (!agreement) return 'no purchase agreement has been issued for this order yet';
  if (agreement.status !== 'signed') {
    return `purchase agreement ${agreement.agreement_number} is ${agreement.status}, not signed`;
  }
  return null;
}

function setStatus(orderId, status) {
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, nowIso(), orderId);
  return findById(orderId);
}

function setTracking(orderId, { carrier, trackingNumber }) {
  db.prepare(`
    UPDATE orders SET carrier = ?, tracking_number = ?, updated_at = ? WHERE id = ?
  `).run(carrier || null, trackingNumber || null, nowIso(), orderId);
  return findById(orderId);
}

function list({ status, type, search, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = { limit, offset };
  if (status) { where.push('o.status = @status'); params.status = status; }
  if (type) { where.push('o.type = @type'); params.type = type; }
  if (search) {
    where.push('(o.order_number LIKE @q OR u.full_name LIKE @q OR u.email LIKE @q OR l.title LIKE @q)');
    params.q = `%${search}%`;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`${SELECT} ${clause} ORDER BY o.created_at DESC LIMIT @limit OFFSET @offset`).all(params);
  const { total } = db.prepare(`
    SELECT COUNT(*) AS total FROM orders o
      JOIN listings l ON l.id = o.listing_id
      JOIN users u ON u.id = o.user_id ${clause}
  `).get(params);
  return { rows, total };
}

function counts() {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN ('pending_agreement','agreement_sent') THEN 1 ELSE 0 END) AS awaiting_signature,
      SUM(CASE WHEN status = 'agreement_signed' THEN 1 ELSE 0 END) AS awaiting_payment,
      SUM(CASE WHEN status = 'paid'      THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
      COALESCE(SUM(CASE WHEN status NOT IN ('cancelled') THEN total ELSE 0 END), 0) AS gross_value
    FROM orders
  `).get();
}

module.exports = {
  signatureBlocks, SIGNATURE_REQUIRED_FROM,
  findById, findByNumber, forUser, create,
  setStatus, setTracking, list, counts,
};
