'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const config = require('../../config');
const money = require('./money');
const { formatContract, formatAuditDate, formatAuditTime } = require('./dates');

const B = config.brand;

// Page geometry
const MARGIN = 56;
const PAGE_W = 595.28;                 // A4 portrait, points
const CONTENT_W = PAGE_W - MARGIN * 2;

// Palette (kept muted — this is a legal document, not a landing page)
const INK = '#141414';
const BODY = '#232323';
const MUTED = '#6B6B6B';
const RULE = '#D8D8D8';
const ACCENT = B.theme.accent;

/**
 * Render the Equipment Purchase Agreement.
 *
 * The same function produces both the unsigned and the executed copy: pass a
 * `signature` and the buyer's mark, name, date and audit page are stamped in.
 * That guarantees the two documents differ only by the signature itself.
 */
function buildAgreementPdf(agreement, { signature = null, outputPath }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `Purchase Agreement #${agreement.agreement_number} - ${agreement.buyer_name}`,
        Author: B.legalName,
        Subject: `Equipment Purchase Agreement for ${agreement.item_title}`,
        Keywords: `purchase agreement, ${agreement.agreement_number}, ${agreement.item_stock || ''}`,
        Creator: B.name,
        Producer: B.name,
      },
    });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);

    // The Doc ID strip must appear on every page, including ones pdfkit adds
    // implicitly when text overflows.
    doc.on('pageAdded', () => stampDocId(doc, agreement));

    renderLetterhead(doc, agreement);
    renderTitle(doc, agreement);
    renderParties(doc, agreement);
    renderObjectOfSale(doc, agreement);
    renderOwnershipTransfer(doc, agreement);
    renderPrice(doc, agreement);
    renderBuyBack(doc);
    renderMiscellaneous(doc);
    renderSignatures(doc, agreement, signature);

    if (signature) renderAuditTrail(doc, agreement);

    stampDocId(doc, agreement);
    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * Print the document reference in the bottom margin of the current page.
 *
 * The write lands below the bottom margin, which pdfkit would normally treat
 * as an overflow and answer by starting a new page — and since this runs from
 * the `pageAdded` hook, that recurses until the stack blows. Dropping the
 * bottom margin for the duration of the write keeps it on the current page.
 */
function stampDocId(doc, agreement) {
  const savedBottom = doc.page.margins.bottom;
  const savedY = doc.y;
  const savedX = doc.x;

  doc.page.margins.bottom = 0;
  try {
    doc.fontSize(6.5).font('Helvetica').fillColor('#9A9A9A')
      .text(`Doc ID: ${agreement.doc_id}`, MARGIN, doc.page.height - 30, {
        width: CONTENT_W, align: 'left', lineBreak: false,
      });
  } finally {
    doc.page.margins.bottom = savedBottom;
    doc.x = savedX;
    doc.y = savedY;
  }
}

/** Start a new page when fewer than `needed` points remain, to avoid orphans. */
function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - MARGIN - 24) doc.addPage();
}

function sectionHeading(doc, number, title) {
  ensureSpace(doc, 60);
  doc.moveDown(0.9);
  const y = doc.y;
  doc.fontSize(10.5).font('Helvetica-Bold').fillColor(INK)
    .text(`${number}. ${title.toUpperCase()}`, MARGIN, y, { width: CONTENT_W });
  doc.moveTo(MARGIN, doc.y + 3).lineTo(MARGIN + CONTENT_W, doc.y + 3)
    .lineWidth(0.75).strokeColor(ACCENT).stroke();
  doc.moveDown(0.7);
}

function body(doc, text, opts = {}) {
  doc.fontSize(9.2).font('Helvetica').fillColor(BODY)
    .text(text, { width: CONTENT_W, align: 'justify', lineGap: 2.2, ...opts });
  doc.moveDown(0.55);
}

/**
 * A paragraph with **bold** runs. pdfkit has no inline markup, so the string is
 * split on the markers and emitted as a continued run.
 */
function richBody(doc, markdown) {
  const parts = String(markdown).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  doc.fontSize(9.2).fillColor(BODY);
  parts.forEach((part, i) => {
    const bold = part.startsWith('**') && part.endsWith('**');
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(bold ? part.slice(2, -2) : part, {
        width: CONTENT_W, align: 'justify', lineGap: 2.2,
        continued: i < parts.length - 1,
      });
  });
  doc.moveDown(0.55);
}

/** Two-column label/value table used for the party and item blocks. */
function dataTable(doc, rows, { labelWidth = 165 } = {}) {
  const valueWidth = CONTENT_W - labelWidth;
  ensureSpace(doc, rows.length * 20 + 14);

  rows.forEach(([label, value], i) => {
    const text = String(value ?? '—');
    const height = Math.max(
      doc.fontSize(9).font('Helvetica').heightOfString(text, { width: valueWidth - 16 }),
      11
    ) + 9;

    const y = doc.y;
    if (i % 2 === 0) {
      doc.rect(MARGIN, y, CONTENT_W, height).fillColor('#F7F7F7').fill();
    }
    doc.rect(MARGIN, y, CONTENT_W, height).lineWidth(0.4).strokeColor(RULE).stroke();
    doc.moveTo(MARGIN + labelWidth, y).lineTo(MARGIN + labelWidth, y + height)
      .lineWidth(0.4).strokeColor(RULE).stroke();

    doc.fontSize(8.4).font('Helvetica-Bold').fillColor(MUTED)
      .text(String(label).toUpperCase(), MARGIN + 8, y + 5,
        { width: labelWidth - 16, lineBreak: false });
    doc.fontSize(9).font('Helvetica').fillColor(INK)
      .text(text, MARGIN + labelWidth + 8, y + 5, { width: valueWidth - 16 });

    doc.y = y + height;
  });
  doc.moveDown(0.7);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderLetterhead(doc, agreement) {
  doc.rect(0, 0, PAGE_W, 4).fillColor(ACCENT).fill();

  doc.fontSize(15).font('Helvetica-Bold').fillColor(INK)
    .text(B.legalName.toUpperCase(), MARGIN, 44, { width: CONTENT_W * 0.55, characterSpacing: 0.4 });
  doc.fontSize(7.6).font('Helvetica').fillColor(ACCENT)
    .text(B.tagline.toUpperCase(), { width: CONTENT_W * 0.55, characterSpacing: 1.2 });

  const rightX = MARGIN + CONTENT_W * 0.55;
  const rightW = CONTENT_W * 0.45;
  doc.fontSize(7.8).font('Helvetica').fillColor(MUTED);
  doc.text(`Email:  ${agreement.seller_email || B.contact.email}`, rightX, 46,
    { width: rightW, align: 'right' });
  doc.text(`Web:    ${B.domain}`, rightX, doc.y, { width: rightW, align: 'right' });
  doc.text(`Phone:  ${agreement.seller_phone || B.contact.phone}`, rightX, doc.y,
    { width: rightW, align: 'right' });
  doc.text(`Address: ${agreement.seller_address || B.address.line1}`, rightX, doc.y,
    { width: rightW, align: 'right' });
  doc.text(agreement.seller_city_line || `${B.address.city}, ${B.address.state} ${B.address.postalCode}`,
    rightX, doc.y, { width: rightW, align: 'right' });

  doc.y = 108;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y)
    .lineWidth(0.8).strokeColor(RULE).stroke();
  doc.moveDown(1.1);
}

function renderTitle(doc, agreement) {
  doc.fontSize(14).font('Helvetica-Bold').fillColor(INK)
    .text(`EQUIPMENT PURCHASE AGREEMENT #${agreement.agreement_number}`,
      MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.moveDown(0.35);
  doc.fontSize(9.4).font('Helvetica-Bold').fillColor(BODY)
    .text(`DATE: ${formatContract(agreement.created_at)}`,
      { width: CONTENT_W, align: 'center' });
  doc.moveDown(0.85);
  body(doc,
    'THIS PURCHASE AGREEMENT is made on the date above between the following parties:',
    { align: 'left' });
}

function renderParties(doc, a) {
  sectionHeading(doc, 1, "Seller's Information");
  dataTable(doc, [
    ['Name', a.seller_name],
    ['Street Address', a.seller_address],
    ['City, State, Zip Code', a.seller_city_line],
    ['Telephone Number', a.seller_phone],
    ['Email Address', a.seller_email],
  ]);

  sectionHeading(doc, 2, "Buyer's Information");
  const buyerCityLine = [
    a.buyer_city, a.buyer_state ? `${a.buyer_state} ${a.buyer_zip || ''}`.trim() : a.buyer_zip,
  ].filter(Boolean).join(', ');
  dataTable(doc, [
    ['Name', a.buyer_name],
    ['Street Address', [a.buyer_line1, a.buyer_line2].filter(Boolean).join(', ')],
    ['City, State, Zip Code', buyerCityLine],
    ['Telephone Number', a.buyer_phone],
    ['Email Address', a.buyer_email],
  ]);
}

function renderObjectOfSale(doc, a) {
  sectionHeading(doc, 3, 'Object of Sale');
  richBody(doc,
    `**${a.seller_name}** hereby agrees to sell, and **${a.buyer_name}** hereby agrees to purchase, the following product:`);
  dataTable(doc, [
    ['Year | Make | Model',
      [a.item_year, a.item_make, a.item_model].filter(Boolean).join(' | ')],
    ['Hour Meter', a.item_meter],
    ['Engine HP', a.item_engine_hp],
    ['Serial Number', a.item_serial],
    ['Inventory Stock Number', a.item_stock],
  ]);
}

function renderOwnershipTransfer(doc, a) {
  sectionHeading(doc, 4, 'Ownership Transfer');
  richBody(doc,
    `**${a.seller_name}** certifies that it is the lawful owner of the above-described Equipment ` +
    'and that it is free of all encumbrances and any and all legal claims. Parties agree to sign ' +
    'all documents necessary to transfer ownership of the Equipment from the Seller to the Buyer ' +
    `within ${B.terms.inspectionDays} days of the date of this Agreement.`);
  body(doc,
    'The Buyer shall be liable for all administrative costs relating to the registration of the ' +
    'Equipment in his/her name and all costs relating to any required roadworthy or inspection ' +
    'certificate.');
}

function renderPrice(doc, a) {
  sectionHeading(doc, 5, 'Purchase Price and Method');
  richBody(doc,
    `The total purchase price to be paid shall be: **${money.format(a.purchase_price)} US Dollars** ` +
    `(${money.toWords(a.purchase_price)}). All applicable taxes — state, local, municipal and/or ` +
    'sales taxes — are the responsibility of the Buyer and are not included in the purchase price.');

  if (a.shipping_fee > 0) {
    richBody(doc,
      `The shipping and handling fee of **${money.format(a.shipping_fee)} US Dollars** is the ` +
      'responsibility of the Buyer and is due upon delivery.');
  }

  richBody(doc,
    `The purchase price is to be paid through **${B.terms.paymentMethods}**. ` +
    'Payment must reference the agreement number shown above so that funds can be matched to ' +
    'this contract on receipt.');

  ensureSpace(doc, 70);
  const y = doc.y + 2;
  doc.rect(MARGIN, y, CONTENT_W, 34).fillColor('#F2F2F2').fill();
  doc.rect(MARGIN, y, 3.5, 34).fillColor(ACCENT).fill();
  doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED)
    .text('TOTAL AMOUNT DUE', MARGIN + 14, y + 11, { width: 200, lineBreak: false });
  doc.fontSize(13).font('Helvetica-Bold').fillColor(INK)
    .text(`${money.format(a.total_amount)} USD`, MARGIN + CONTENT_W - 214, y + 9,
      { width: 200, align: 'right', lineBreak: false });
  doc.y = y + 34;
  doc.moveDown(0.8);
}

function renderBuyBack(doc) {
  const t = B.terms;
  sectionHeading(doc, 6, 'Equipment Buy Back Guarantee');
  richBody(doc,
    `The **${B.legalName}** ${t.inspectionDays} Day Buy Back Guarantee enables the Buyer to return ` +
    'the item/s for a full refund of the purchase price if the product/s was not accurately ' +
    `described and represented. Buyer must directly notify **${B.legalName}** in writing within ` +
    `${t.returnNoticeDays} days of receiving the product, but no longer than ${t.inspectionDays} ` +
    'days after sale date, to initiate the return process. The return notification should be ' +
    'addressed to the Seller by phone, email or registered mail.');

  richBody(doc,
    `The item is covered by a **${t.warrantyMonths}-month warranty**. The warranty does not cover ` +
    'any physical damage that occurs after the inspection process.');

  body(doc,
    'The inspection period begins at 9:00 AM on the weekday following the delivery day, as signed ' +
    'and certified by the Buyer on the delivery receipt.');

  richBody(doc,
    'The purchased product must not be put to work or altered, and must not be used beyond what is ' +
    `required to verify the condition of the Equipment — not more than **${t.maxInspectionHours} ` +
    `hours of use or ${t.maxInspectionMiles} miles** from the reading at time of sale. In the ` +
    'event of a return, the Buyer is NOT responsible for freight and handling charges. In the ' +
    `event of a return, the Seller agrees to refund the Buyer, in full, within ${t.refundWindowHours} hours.`);

  richBody(doc,
    `If the Buyer decides to return the Equipment, the Seller (**${B.legalName}**) agrees to ` +
    'collect the item, covering all the related costs.');
}

function renderMiscellaneous(doc) {
  sectionHeading(doc, 7, 'Miscellaneous Provisions');
  richBody(doc,
    `The Seller (**${B.legalName}**) confirms that it is the owner of the product described in ` +
    'Paragraph 3 (Object of Sale), with the right to sell it to the Buyer for the purchase price ' +
    'and method listed in Paragraph 5 (Purchase Price and Method), that there are no liens or ' +
    'encumbrances on such product, and certifies that the information provided in this Purchase ' +
    'Agreement is true, accurate, and complete to the best of its knowledge.');

  richBody(doc,
    `The Buyer and the Seller (**${B.legalName}**) agree that the product described in Paragraph 3 ` +
    'above shall be sold by the Seller, and purchased by the Buyer, on an "as is" basis and in an ' +
    `"as is" condition, with a ${B.terms.inspectionDays} Day Buy Back guarantee to the described ` +
    'product. The Buyer accepts all liability for the product as of the date of arrival.');

  richBody(doc,
    'This Agreement constitutes the entire understanding between the parties and supersedes all ' +
    'prior discussions. It is governed by the laws of the State of ' +
    `**${B.address.stateFull}**. The parties agree that this Agreement may be executed ` +
    'electronically, and that an electronic signature carries the same legal effect as a ' +
    'handwritten one under the U.S. ESIGN Act and applicable state UETA legislation.');
}

function renderSignatures(doc, a, signature) {
  ensureSpace(doc, 250);
  sectionHeading(doc, 8, 'Signatures');

  const colW = (CONTENT_W - 30) / 2;
  const top = doc.y + 6;

  // ---- Seller (pre-executed) ----
  doc.fontSize(8.4).font('Helvetica-Bold').fillColor(MUTED)
    .text("SELLER'S SIGNATURE", MARGIN, top, { width: colW });

  const sellerLineY = top + 46;
  doc.fontSize(19).font('Helvetica-Oblique').fillColor('#1B3A8C')
    .text(B.signatory.name, MARGIN + 4, top + 18, { width: colW - 8, lineBreak: false });
  doc.moveTo(MARGIN, sellerLineY).lineTo(MARGIN + colW, sellerLineY)
    .lineWidth(0.7).strokeColor('#8A8A8A').stroke();

  doc.fontSize(8.6).font('Helvetica').fillColor(BODY)
    .text(`Printed Name: ${B.signatory.name}, ${B.signatory.title}`,
      MARGIN, sellerLineY + 7, { width: colW });
  doc.text(`${B.legalName}`, MARGIN, doc.y + 1, { width: colW });
  doc.text(`Date: ${formatContract(a.created_at)}`, MARGIN, doc.y + 1, { width: colW });

  // ---- Buyer ----
  const bx = MARGIN + colW + 30;
  doc.fontSize(8.4).font('Helvetica-Bold').fillColor(MUTED)
    .text("BUYER'S SIGNATURE", bx, top, { width: colW });

  const buyerLineY = top + 46;
  if (signature && signature.imagePath && fs.existsSync(signature.imagePath)) {
    try {
      doc.image(signature.imagePath, bx + 4, top + 12, {
        fit: [colW - 20, 32], align: 'left', valign: 'bottom',
      });
    } catch {
      doc.fontSize(19).font('Helvetica-Oblique').fillColor('#1B3A8C')
        .text(signature.name, bx + 4, top + 18, { width: colW - 8, lineBreak: false });
    }
  } else if (signature) {
    doc.fontSize(19).font('Helvetica-Oblique').fillColor('#1B3A8C')
      .text(signature.name, bx + 4, top + 18, { width: colW - 8, lineBreak: false });
  }
  doc.moveTo(bx, buyerLineY).lineTo(bx + colW, buyerLineY)
    .lineWidth(0.7).strokeColor('#8A8A8A').stroke();

  doc.fontSize(8.6).font('Helvetica').fillColor(BODY)
    .text(`Printed Name: ${a.buyer_name}`, bx, buyerLineY + 7, { width: colW });
  doc.text(a.buyer_email, bx, doc.y + 1, { width: colW });
  doc.text(`Date: ${signature ? formatContract(signature.signedAt) : '_________________'}`,
    bx, doc.y + 1, { width: colW });

  doc.y = Math.max(doc.y, buyerLineY + 56);
  doc.moveDown(1.2);

  if (!signature) {
    const y = doc.y;
    doc.rect(MARGIN, y, CONTENT_W, 30).fillColor('#FFF8E6').fill();
    doc.rect(MARGIN, y, 3.5, 30).fillColor(ACCENT).fill();
    doc.fontSize(8.8).font('Helvetica-Bold').fillColor('#6B5000')
      .text('AWAITING BUYER SIGNATURE — this copy is not yet executed.',
        MARGIN + 14, y + 10, { width: CONTENT_W - 28 });
    doc.y = y + 30;
    doc.moveDown(0.7);
  }

  doc.fontSize(8.6).font('Helvetica-Bold').fillColor(B.theme.success)
    .text(`Questions about this agreement? Contact ${B.contact.email.toUpperCase()}`,
      MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
}

/** Certificate page: who signed, when, from where. Mirrors the audit page a
 *  commercial e-signature provider appends to an executed document. */
function renderAuditTrail(doc, a) {
  doc.addPage();

  doc.fontSize(13).font('Helvetica-Bold').fillColor(INK)
    .text('SIGNATURE CERTIFICATE', MARGIN, doc.y, { width: CONTENT_W });
  doc.moveTo(MARGIN, doc.y + 4).lineTo(MARGIN + CONTENT_W, doc.y + 4)
    .lineWidth(1).strokeColor(ACCENT).stroke();
  doc.moveDown(1.1);

  dataTable(doc, [
    ['Document', `Purchase Agreement #${a.agreement_number} — ${a.buyer_name}`],
    ['Document ID', a.doc_id],
    ['Status', 'Signed'],
    ['Equipment', a.item_title],
    ['Total amount', `${money.format(a.total_amount)} USD`],
    ['Signature method', a.signature_method === 'typed' ? 'Typed signature' : 'Drawn signature'],
  ], { labelWidth: 140 });

  doc.moveDown(0.4);
  doc.fontSize(9.6).font('Helvetica-Bold').fillColor(INK)
    .text('AUDIT TRAIL', MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.6);

  let events = [];
  try { events = JSON.parse(a.audit_trail || '[]'); } catch { events = []; }

  const headerY = doc.y;
  doc.rect(MARGIN, headerY, CONTENT_W, 20).fillColor('#F0F0F0').fill();
  doc.fontSize(7.8).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('DATE', MARGIN + 8, headerY + 6, { width: 80, lineBreak: false });
  doc.text('TIME (UTC)', MARGIN + 92, headerY + 6, { width: 68, lineBreak: false });
  doc.text('EVENT', MARGIN + 164, headerY + 6, { width: 190, lineBreak: false });
  doc.text('IP ADDRESS', MARGIN + 358, headerY + 6, { width: 120, lineBreak: false });
  doc.y = headerY + 20;

  events.forEach((ev, i) => {
    ensureSpace(doc, 30);
    const y = doc.y;
    const label = String(ev.label || ev.event || '');
    const h = Math.max(
      doc.fontSize(8).font('Helvetica').heightOfString(label, { width: 186 }), 10
    ) + 9;

    if (i % 2 === 1) doc.rect(MARGIN, y, CONTENT_W, h).fillColor('#FAFAFA').fill();
    doc.rect(MARGIN, y, CONTENT_W, h).lineWidth(0.35).strokeColor(RULE).stroke();

    doc.fontSize(8).font('Helvetica').fillColor(BODY);
    doc.text(formatAuditDate(ev.at), MARGIN + 8, y + 4, { width: 80, lineBreak: false });
    doc.text(formatAuditTime(ev.at), MARGIN + 92, y + 4, { width: 68, lineBreak: false });
    doc.text(label, MARGIN + 164, y + 4, { width: 186 });
    doc.fontSize(8).fillColor(MUTED)
      .text(ev.ip || '—', MARGIN + 358, y + 4, { width: 120, lineBreak: false });

    doc.y = y + h;
  });

  doc.moveDown(1.4);
  doc.fontSize(7.8).font('Helvetica').fillColor(MUTED)
    .text(
      'This certificate is generated automatically and forms part of the executed agreement. ' +
      'The electronic signature recorded above was applied under the U.S. Electronic Signatures ' +
      'in Global and National Commerce Act (ESIGN) and applicable state UETA legislation, and ' +
      'carries the same legal effect as a handwritten signature.',
      MARGIN, doc.y, { width: CONTENT_W, align: 'justify', lineGap: 1.6 }
    );
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

function buildInvoicePdf({ order, listing, user, wire }, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: { Title: `Invoice ${order.order_number}`, Author: B.legalName },
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);

    doc.rect(0, 0, PAGE_W, 4).fillColor(ACCENT).fill();
    doc.fontSize(15).font('Helvetica-Bold').fillColor(INK)
      .text(B.legalName.toUpperCase(), MARGIN, 44, { width: CONTENT_W * 0.6 });
    doc.fontSize(8).font('Helvetica').fillColor(MUTED)
      .text(`${B.address.oneLine}\n${B.contact.phone} · ${B.contact.email}`,
        MARGIN, doc.y + 2, { width: CONTENT_W * 0.6 });

    doc.fontSize(22).font('Helvetica-Bold').fillColor(ACCENT)
      .text('INVOICE', MARGIN + CONTENT_W * 0.6, 44,
        { width: CONTENT_W * 0.4, align: 'right' });
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text(order.order_number, MARGIN + CONTENT_W * 0.6, doc.y,
        { width: CONTENT_W * 0.4, align: 'right' });
    doc.text(formatContract(order.created_at), MARGIN + CONTENT_W * 0.6, doc.y,
      { width: CONTENT_W * 0.4, align: 'right' });

    doc.y = 132;
    doc.fontSize(8.4).font('Helvetica-Bold').fillColor(MUTED)
      .text('BILL TO', MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(INK).text(order.delivery_name || user.full_name);
    doc.fontSize(9).font('Helvetica').fillColor(BODY)
      .text([order.delivery_line1, order.delivery_line2].filter(Boolean).join(', '))
      .text(`${order.delivery_city || ''}, ${order.delivery_state || ''} ${order.delivery_zip || ''}`)
      .text(order.delivery_email || user.email)
      .text(order.delivery_phone || user.phone || '');

    doc.moveDown(1.4);
    dataTable(doc, [
      ['Description', listing.title],
      ['Stock number', listing.stock_number || '—'],
      ['Serial number', listing.serial_number || 'On request'],
      ['Purchase price', money.format(order.amount)],
      ['Delivery & handling', money.format(order.shipping_fee)],
    ]);

    const y = doc.y;
    doc.rect(MARGIN, y, CONTENT_W, 38).fillColor(INK).fill();
    doc.fontSize(9.4).font('Helvetica-Bold').fillColor('#FFFFFF')
      .text('TOTAL DUE', MARGIN + 16, y + 13, { width: 200, lineBreak: false });
    doc.fontSize(15).font('Helvetica-Bold').fillColor(ACCENT)
      .text(`${money.format(order.total)} USD`, MARGIN + CONTENT_W - 216, y + 10,
        { width: 200, align: 'right', lineBreak: false });
    doc.y = y + 38;
    doc.moveDown(1.2);

    doc.fontSize(9.6).font('Helvetica-Bold').fillColor(INK)
      .text('BANK WIRE INSTRUCTIONS', MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.5);
    dataTable(doc, [
      ['Beneficiary', wire.beneficiary],
      ['Bank', wire.bank],
      ['Account number', wire.account],
      ['Routing (ABA)', wire.routing],
      ['SWIFT/BIC', wire.swift],
      ['Payment reference', order.order_number],
    ]);

    const wy = doc.y;
    doc.rect(MARGIN, wy, CONTENT_W, 44).fillColor('#FDF0F0').fill();
    doc.rect(MARGIN, wy, 3.5, 44).fillColor(B.theme.danger).fill();
    doc.fontSize(8.4).font('Helvetica-Bold').fillColor('#7A1C1C')
      .text(
        `Always quote ${order.order_number} as the wire reference. We will never email you a ` +
        `change of banking details. If you receive such a message, call ${B.contact.phone} ` +
        'before sending any funds.',
        MARGIN + 14, wy + 9, { width: CONTENT_W - 28, lineGap: 1.5 }
      );

    doc.end();
  });
}

module.exports = { buildAgreementPdf, buildInvoicePdf };
