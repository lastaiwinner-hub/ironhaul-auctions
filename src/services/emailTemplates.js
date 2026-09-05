'use strict';

const config = require('../../config');
const money = require('./money');
const { formatDateTime, formatLong } = require('./dates');

const B = config.brand;
const BASE = config.baseUrl;
const A = B.theme.accent;
const INK = B.theme.ink;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * One shell for every message. Table-based and inline-styled because that is
 * still the only layout Outlook and Gmail both render predictably.
 */
function shell({ preheader = '', body, footerNote = '' }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(B.name)}</title>
</head>
<body style="margin:0;padding:0;background:#EEF0F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;color:#EEF0F3;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F3;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(20,23,28,.08);">

      <tr><td style="background:${INK};padding:22px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:800;letter-spacing:.06em;color:#ffffff;text-transform:uppercase;">
            ${esc(B.shortName)}<span style="color:${A};">.</span>
          </td>
          <td align="right" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${A};font-weight:700;">
            ${esc(B.name.replace(B.shortName, '').trim() || 'Auctions')}
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="height:3px;background:${A};font-size:0;line-height:0;">&nbsp;</td></tr>

      <tr><td style="padding:34px 32px 30px;color:${INK};font-size:15px;line-height:1.62;">
        ${body}
      </td></tr>

      <tr><td style="padding:0 32px 30px;">
        <div style="border-top:1px solid #E4E7EB;padding-top:20px;font-size:12px;line-height:1.7;color:#6B7480;">
          ${footerNote ? `<p style="margin:0 0 12px;">${footerNote}</p>` : ''}
          <strong style="color:${INK};">${esc(B.legalName)}</strong><br>
          ${esc(B.address.line1)}, ${esc(B.address.city)}, ${esc(B.address.state)} ${esc(B.address.postalCode)}<br>
          <a href="tel:${esc(B.contact.phoneHref)}" style="color:#6B7480;text-decoration:none;">${esc(B.contact.phone)}</a>
          &nbsp;·&nbsp;
          <a href="mailto:${esc(B.contact.email)}" style="color:${A};text-decoration:none;">${esc(B.contact.email)}</a><br>
          <span style="color:#98A0AA;">${esc(B.contact.hours)}</span>
        </div>
      </td></tr>
    </table>

    <div style="max-width:600px;margin:16px auto 0;font-size:11px;color:#98A0AA;text-align:center;line-height:1.6;">
      This message was sent by ${esc(B.legalName)} regarding your account activity.<br>
      <a href="${BASE}" style="color:#98A0AA;">${esc(B.domain)}</a>
    </div>
  </td></tr>
</table>
</body></html>`;
}

const button = (href, label, color = A, textColor = '#14171C') => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
  <td style="background:${color};border-radius:6px;">
    <a href="${href}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;letter-spacing:.04em;color:${textColor};text-decoration:none;text-transform:uppercase;">${esc(label)}</a>
  </td>
</tr></table>`;

const h1 = (t) => `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.28;font-weight:800;color:${INK};">${esc(t)}</h1>`;
const eyebrow = (t) => `<div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${A};margin:0 0 10px;">${esc(t)}</div>`;
const p = (t) => `<p style="margin:0 0 14px;">${t}</p>`;

/** Key/value block used for lot details, money and order summaries. */
function factTable(rows) {
  const cells = rows.filter(Boolean).map(([label, value], i) => `
    <tr>
      <td style="padding:11px 14px;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#6B7480;background:#F6F7F9;width:44%;${i ? 'border-top:1px solid #E4E7EB;' : ''}">${esc(label)}</td>
      <td style="padding:11px 14px;font-size:14px;font-weight:600;color:${INK};${i ? 'border-top:1px solid #E4E7EB;' : ''}">${value}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E4E7EB;border-radius:8px;overflow:hidden;margin:0 0 20px;">${cells}</table>`;
}

const callout = (text, tone = 'accent') => {
  const tones = {
    accent: { bg: '#FEF7E6', border: A, color: '#5A4206' },
    success: { bg: '#EDF7F1', border: B.theme.success, color: '#0E4A2C' },
    danger: { bg: '#FDF0F0', border: B.theme.danger, color: '#7A1C1C' },
    info: { bg: '#EEF4FB', border: B.theme.info, color: '#123E6E' },
  };
  const t = tones[tone] || tones.accent;
  return `<div style="background:${t.bg};border-left:4px solid ${t.border};padding:14px 16px;border-radius:0 6px 6px 0;margin:0 0 20px;font-size:14px;line-height:1.6;color:${t.color};">${text}</div>`;
};

const lotLine = (listing) =>
  `<a href="${BASE}/lot/${esc(listing.slug)}" style="color:${INK};font-weight:700;text-decoration:none;">${esc(listing.title)}</a>`;

// ===========================================================================
//  Templates
// ===========================================================================

const templates = {

  // ---- Account ------------------------------------------------------------

  welcome: ({ user, verifyUrl }) => ({
    subject: `Confirm your email — ${B.name}`,
    template: 'welcome',
    html: shell({
      preheader: 'Confirm your email address to activate your bidding account.',
      body: `
        ${eyebrow('Welcome aboard')}
        ${h1(`Confirm your email, ${esc(user.full_name.split(' ')[0])}`)}
        ${p(`Your ${esc(B.name)} account is created. Confirm this address and you are one step from bidding.`)}
        ${button(verifyUrl, 'Confirm my email')}
        ${p(`<span style="font-size:13px;color:#6B7480;">This link expires in ${config.security.emailVerifyHours} hours. If the button does not work, paste this into your browser:<br><span style="word-break:break-all;color:${A};">${esc(verifyUrl)}</span></span>`)}
        <div style="border-top:1px solid #E4E7EB;margin:26px 0 20px;"></div>
        ${eyebrow('What happens next')}
        ${p(`<strong>1. Verify your identity.</strong> Upload the front and back of a government-issued ID plus a selfie. It takes about two minutes.`)}
        ${p(`<strong>2. Get approved.</strong> Our team reviews documents during business hours, usually within a few hours.`)}
        ${p(`<strong>3. Bid or buy.</strong> Place bids on live lots or take any machine at its Buy Now price.`)}
      `,
      footerNote: 'You are receiving this because an account was created with this email address. If that was not you, ignore this message and the account stays unverified.',
    }),
  }),

  passwordReset: ({ user, resetUrl }) => ({
    subject: `Reset your password — ${B.name}`,
    template: 'password_reset',
    html: shell({
      preheader: 'A password reset was requested for your account.',
      body: `
        ${eyebrow('Security')}
        ${h1('Reset your password')}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])} — we received a request to reset the password on your ${esc(B.name)} account.`)}
        ${button(resetUrl, 'Choose a new password')}
        ${p(`<span style="font-size:13px;color:#6B7480;">This link expires in ${config.security.passwordResetHours} hours and can be used once.</span>`)}
        ${callout('If you did not request this, no action is needed — your password has not changed.', 'info')}
      `,
    }),
  }),

  // ---- Identity verification ---------------------------------------------

  kycSubmitted: ({ user }) => ({
    subject: `Your documents are in review — ${B.name}`,
    template: 'kyc_submitted',
    html: shell({
      preheader: 'We received your identity documents and are reviewing them now.',
      body: `
        ${eyebrow('Identity verification')}
        ${h1('Documents received')}
        ${p(`Thanks ${esc(user.full_name.split(' ')[0])} — we have your ID front, ID back and selfie, and our team is reviewing them.`)}
        ${callout('Reviews are completed during business hours and usually finish within a few hours. We will email you the moment your account is cleared.', 'info')}
        ${p(`In the meantime you can browse every live lot and add machines to your watchlist.`)}
        ${button(`${BASE}/inventory`, 'Browse inventory')}
      `,
    }),
  }),

  kycApproved: ({ user }) => ({
    subject: `You are verified — bidding is open`,
    template: 'kyc_approved',
    html: shell({
      preheader: 'Your identity is verified. You can now place bids and buy instantly.',
      body: `
        ${eyebrow('Approved')}
        ${h1('You are cleared to bid')}
        ${p(`Good news ${esc(user.full_name.split(' ')[0])} — your identity has been verified and your ${esc(B.name)} account is fully active.`)}
        ${callout('<strong>You can now place bids on any live lot and use Buy Now on any machine in stock.</strong>', 'success')}
        ${button(`${BASE}/inventory?filter=auction`, 'See live auctions')}
        ${p(`<span style="font-size:13px;color:#6B7480;">Every purchase includes a ${B.terms.inspectionDays}-day inspection period and a ${B.terms.warrantyMonths}-month warranty.</span>`)}
      `,
    }),
  }),

  kycRejected: ({ user, reason }) => ({
    subject: `Action needed on your identity documents`,
    template: 'kyc_rejected',
    html: shell({
      preheader: 'We could not verify your documents — please upload them again.',
      body: `
        ${eyebrow('Action required')}
        ${h1('We could not verify your documents')}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])} — our team reviewed your submission and was unable to complete verification.`)}
        ${callout(`<strong>Reason:</strong> ${esc(reason || 'The documents could not be read clearly.')}`, 'danger')}
        ${eyebrow('What usually fixes it')}
        ${p(`• All four corners of the ID visible, no crop<br>• Sharp focus, no glare across the photo or text<br>• Selfie taken in good light with your face unobstructed<br>• Document still valid and not expired`)}
        ${button(`${BASE}/account/verification`, 'Upload again')}
      `,
    }),
  }),

  // ---- Bidding ------------------------------------------------------------

  /**
   * The automation the operator asked for: the moment a bid lands, the bidder
   * receives their pre-filled purchase agreement to review and sign.
   */
  bidPlaced: ({ user, listing, bid, agreement, signUrl, isLeader }) => ({
    subject: `Bid confirmed — ${listing.title} (${money.format(bid.amount)})`,
    template: 'bid_placed',
    html: shell({
      preheader: `Your bid of ${money.format(bid.amount)} is recorded. Your purchase agreement is ready to sign.`,
      body: `
        ${eyebrow('Bid confirmed')}
        ${h1(isLeader ? 'You are the highest bidder' : 'Your bid was recorded')}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])}, your bid on ${lotLine(listing)} has been placed.`)}
        ${factTable([
          ['Lot', esc(listing.title)],
          ['Stock number', esc(listing.stock_number || '—')],
          ['Your bid', `<span style="color:${A};font-size:17px;font-weight:800;">${money.format(bid.amount)}</span>`],
          ['Standing', isLeader
            ? '<span style="color:#177245;font-weight:700;">Highest bidder</span>'
            : '<span style="color:#C62828;font-weight:700;">Outbid — a higher maximum is in place</span>'],
          ['Auction ends', formatDateTime(listing.auction_ends_at)],
        ])}
        ${!isLeader ? callout('Another bidder has an automatic maximum above yours. Raise your bid to take the lead.', 'danger') : ''}

        <div style="border-top:1px solid #E4E7EB;margin:28px 0 22px;"></div>

        ${eyebrow('Action requested')}
        ${h1('Your purchase agreement is ready')}
        ${p(`We have prepared <strong>Purchase Agreement #${esc(agreement.agreement_number)}</strong>, pre-filled with your name, address and the lot details. Reviewing and signing it now means that if you win, delivery is arranged immediately with no further paperwork.`)}
        ${button(signUrl, 'Review & sign')}
        ${callout(`Signing does not commit you to pay unless you win this lot or complete a Buy Now purchase. The agreement carries a <strong>${B.terms.inspectionDays}-day inspection period</strong> and a <strong>${B.terms.warrantyMonths}-month warranty</strong>.`, 'info')}
        ${p(`<span style="font-size:12px;color:#6B7480;">Document ID: ${esc(agreement.doc_id)}</span>`)}
      `,
      footerNote: 'To keep your document private, do not forward this email — the signing link is unique to you.',
    }),
  }),

  outbid: ({ user, listing, yourBid, currentBid, minimumNext }) => ({
    subject: `You have been outbid — ${listing.title}`,
    template: 'outbid',
    html: shell({
      preheader: `The bid on ${listing.title} is now ${money.format(currentBid)}.`,
      body: `
        ${eyebrow('Outbid')}
        ${h1('Someone has bid higher')}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])} — your bid on ${lotLine(listing)} has been passed.`)}
        ${factTable([
          ['Your bid', money.format(yourBid)],
          ['Current bid', `<span style="color:${A};font-size:17px;font-weight:800;">${money.format(currentBid)}</span>`],
          ['Minimum next bid', money.format(minimumNext)],
          ['Auction ends', formatDateTime(listing.auction_ends_at)],
        ])}
        ${button(`${BASE}/lot/${esc(listing.slug)}`, 'Place a higher bid')}
        ${p(`<span style="font-size:13px;color:#6B7480;">Tip: set a maximum bid and the system raises you automatically, one increment at a time, up to your ceiling.</span>`)}
      `,
    }),
  }),

  auctionWon: ({ user, listing, amount, order, agreement, signUrl, shippingFee, total }) => ({
    subject: `You won — ${listing.title} (${money.format(amount)})`,
    template: 'auction_won',
    html: shell({
      preheader: `Congratulations, you won ${listing.title} at ${money.format(amount)}.`,
      body: `
        ${eyebrow('Auction result')}
        ${h1('Congratulations — you won this lot')}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])}, you are the winning bidder on ${lotLine(listing)}.`)}
        ${factTable([
          ['Order number', esc(order.order_number)],
          ['Lot', esc(listing.title)],
          ['Stock number', esc(listing.stock_number || '—')],
          ['Winning bid', money.format(amount)],
          ['Delivery', shippingFee ? money.format(shippingFee) : 'Quoted on confirmation'],
          ['Total due', `<span style="color:${A};font-size:17px;font-weight:800;">${money.format(total)}</span>`],
        ])}
        ${agreement && agreement.status === 'signed'
          ? callout('<strong>Your purchase agreement is already signed.</strong> Our finance team will send the invoice and wire instructions shortly — no further action needed right now.', 'success')
          : `${p(`<strong>One step left:</strong> sign Purchase Agreement #${esc(agreement.agreement_number)}. The invoice and wire instructions follow immediately after.`)}
             ${button(signUrl, 'Review & sign agreement')}`}

        ${eyebrow('What happens next')}
        ${p(`<strong>1.</strong> Sign the purchase agreement (if not already signed).<br>
             <strong>2.</strong> Receive your invoice and bank wire instructions.<br>
             <strong>3.</strong> We assign a heavy-haul carrier and send tracking.<br>
             <strong>4.</strong> Delivery in ${esc(B.terms.deliveryWindow)}, followed by your ${B.terms.inspectionDays}-day inspection window.`)}
        ${button(`${BASE}/account/orders/${order.id}`, 'View my order', '#14171C', '#ffffff')}
      `,
    }),
  }),

  auctionLost: ({ user, listing, yourBid, winningBid, relisted }) => ({
    subject: `Auction ended — ${listing.title}`,
    template: 'auction_lost',
    html: shell({
      preheader: `The auction for ${listing.title} has closed.`,
      body: `
        ${eyebrow('Auction closed')}
        ${h1('This lot went to another bidder')}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])} — bidding on ${lotLine(listing)} has ended and your bid of ${money.format(yourBid)} was not the winner${winningBid ? ` (it closed at ${money.format(winningBid)})` : ''}.`)}
        ${relisted
          ? callout(`<strong>Good news — we still have this machine.</strong> A new auction cycle is already open, and you can also take it at the Buy Now price right away.`, 'success')
          : ''}
        ${button(`${BASE}/lot/${esc(listing.slug)}`, relisted ? 'Bid on the new cycle' : 'View this lot')}
        ${p(`Or browse everything else currently on the block:`)}
        ${button(`${BASE}/inventory`, 'Browse inventory', '#14171C', '#ffffff')}
      `,
    }),
  }),

  // ---- Buy Now / orders ---------------------------------------------------

  buyNowReceived: ({ user, listing, order, agreement, signUrl }) => ({
    subject: `Order received — ${listing.title}`,
    template: 'buy_now_received',
    html: shell({
      preheader: `Your order for ${listing.title} is registered and pending review.`,
      body: `
        ${eyebrow('Order received')}
        ${h1('Thank you for your order')}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])}, your purchase request for ${lotLine(listing)} has been registered and is pending review.`)}
        ${factTable([
          ['Order number', esc(order.order_number)],
          ['Purchase price', money.format(order.amount)],
          ['Delivery', order.shipping_fee ? money.format(order.shipping_fee) : 'Quoted on confirmation'],
          ['Total', `<span style="color:${A};font-size:17px;font-weight:800;">${money.format(order.total)}</span>`],
          ['Deliver to', `${esc(order.delivery_line1 || '')}<br>${esc(order.delivery_city || '')}, ${esc(order.delivery_state || '')} ${esc(order.delivery_zip || '')}`],
        ])}
        ${p(`<strong>Purchase Agreement #${esc(agreement.agreement_number)}</strong> has been prepared with your details. Sign it and we move straight to invoicing.`)}
        ${button(signUrl, 'Review & sign')}
        ${callout(`Payment is made by ${esc(B.terms.paymentMethods)} once the agreement is signed. Every purchase carries a ${B.terms.inspectionDays}-day inspection period and a ${B.terms.warrantyMonths}-month warranty.`, 'info')}
      `,
    }),
  }),

  // ---- Agreements ---------------------------------------------------------

  /** Deliberately close to the signature-request mail in the reference flow. */
  agreementRequest: ({ user, agreement, signUrl }) => ({
    subject: `${B.name} has requested your signature — Purchase Agreement #${agreement.agreement_number}`,
    template: 'agreement_request',
    html: shell({
      preheader: `Please review and sign Purchase Agreement #${agreement.agreement_number}.`,
      body: `
        ${eyebrow('Action requested')}
        ${h1(`${B.name} has requested a signature`)}
        ${p(`${esc(B.legalName)} (<a href="mailto:${esc(B.contact.email)}" style="color:${A};">${esc(B.contact.email)}</a>) has requested your signature on the document below.`)}
        ${button(signUrl, 'Review & sign')}
        ${factTable([
          ['Document', `Purchase Agreement #${esc(agreement.agreement_number)} — ${esc(agreement.buyer_name)}`],
          ['Equipment', esc(agreement.item_title)],
          ['Purchase price', money.format(agreement.purchase_price)],
          ['Delivery', agreement.shipping_fee ? money.format(agreement.shipping_fee) : 'Quoted separately'],
          ['Total', `<strong>${money.format(agreement.total_amount)}</strong>`],
        ])}
        ${p(`<span style="font-size:13px;color:#6B7480;">Message from ${esc(B.legalName)}: your purchase agreement is attached for review. Please sign at your earliest convenience so we can proceed with documentation and delivery.</span>`)}
        ${p(`<span style="font-size:12px;color:#6B7480;">Document ID: ${esc(agreement.doc_id)}</span>`)}
      `,
      footerNote: '<strong style="color:#B45309;">Warning:</strong> to prevent others from accessing your document, please do not forward this email.',
    }),
  }),

  agreementSigned: ({ user, agreement, downloadUrl }) => ({
    subject: `Signed — Purchase Agreement #${agreement.agreement_number}`,
    template: 'agreement_signed',
    html: shell({
      preheader: 'You have successfully signed your purchase agreement.',
      body: `
        <div style="text-align:center;margin:0 0 24px;">
          <div style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:#EDF7F1;color:#177245;font-size:26px;">&#10003;</div>
        </div>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:800;color:${INK};text-align:center;">You have successfully signed your document</h1>
        ${factTable([
          ['Document', `Purchase Agreement #${esc(agreement.agreement_number)} — ${esc(agreement.buyer_name)}`],
          ['Equipment', esc(agreement.item_title)],
          ['Total', `<strong>${money.format(agreement.total_amount)}</strong>`],
          ['Signed', formatDateTime(agreement.signed_at)],
          ['Signed by', `${esc(agreement.signature_name)} · IP ${esc(agreement.signature_ip || 'n/a')}`],
        ])}
        ${p('A copy of the fully executed agreement is attached to this email. You can also download it at any time from your account.')}
        ${button(downloadUrl, 'View signed document')}
        ${eyebrow('What happens next')}
        ${p(`Our finance team issues your invoice with bank wire instructions. Once payment clears we assign a carrier, send tracking, and deliver within ${esc(B.terms.deliveryWindow)}. Your ${B.terms.inspectionDays}-day inspection period begins at 9:00 AM on the weekday after delivery.`)}
      `,
      footerNote: '<strong style="color:#B45309;">Warning:</strong> to prevent others from accessing your document, please do not forward this email.',
    }),
  }),

  // ---- Operations ---------------------------------------------------------

  invoice: ({ user, order, listing, wire }) => ({
    subject: `Invoice for order ${order.order_number} — ${money.format(order.total)}`,
    template: 'invoice',
    html: shell({
      preheader: `Payment instructions for order ${order.order_number}.`,
      body: `
        ${eyebrow('Invoice')}
        ${h1(`Payment instructions — ${esc(order.order_number)}`)}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])}, your agreement is signed and your invoice is ready.`)}
        ${factTable([
          ['Equipment', esc(listing.title)],
          ['Purchase price', money.format(order.amount)],
          ['Delivery', money.format(order.shipping_fee)],
          ['Total due', `<span style="color:${A};font-size:18px;font-weight:800;">${money.format(order.total)}</span>`],
        ])}
        ${eyebrow('Bank wire details')}
        ${factTable([
          ['Beneficiary', esc(wire.beneficiary)],
          ['Bank', esc(wire.bank)],
          ['Account number', esc(wire.account)],
          ['Routing (ABA)', esc(wire.routing)],
          ['SWIFT', esc(wire.swift)],
          ['Reference', `<strong>${esc(order.order_number)}</strong>`],
        ])}
        ${callout(`<strong>Always include ${esc(order.order_number)} as the wire reference</strong> so we can match your payment immediately. We will never email you a change of bank details — if you receive such a message, call us on ${esc(B.contact.phone)} before sending funds.`, 'danger')}
      `,
    }),
  }),

  orderShipped: ({ user, order, listing }) => ({
    subject: `On the way — ${listing.title}`,
    template: 'order_shipped',
    html: shell({
      preheader: `Your equipment is in transit. Tracking: ${order.tracking_number || 'assigned'}`,
      body: `
        ${eyebrow('In transit')}
        ${h1('Your equipment is on the road')}
        ${p(`Hello ${esc(user.full_name.split(' ')[0])} — ${lotLine(listing)} has been dispatched.`)}
        ${factTable([
          ['Order', esc(order.order_number)],
          ['Carrier', esc(order.carrier || 'Assigned heavy-haul carrier')],
          ['Tracking', esc(order.tracking_number || 'Provided by carrier on pickup')],
          ['Delivering to', `${esc(order.delivery_city)}, ${esc(order.delivery_state)} ${esc(order.delivery_zip)}`],
          ['Expected', esc(B.terms.deliveryWindow)],
        ])}
        ${button(`${BASE}/account/orders/${order.id}`, 'Track my order')}
        ${callout(`On arrival, please sign the delivery receipt. Your ${B.terms.inspectionDays}-day inspection period starts at 9:00 AM the following weekday.`, 'info')}
      `,
    }),
  }),

  contactReceipt: ({ name }) => ({
    subject: `We received your message — ${B.name}`,
    template: 'contact_receipt',
    html: shell({
      preheader: 'Thanks for getting in touch. We reply within one business day.',
      body: `
        ${eyebrow('Message received')}
        ${h1('Thanks for reaching out')}
        ${p(`Hello ${esc(String(name).split(' ')[0])}, we have your message and a member of the team will reply within one business day.`)}
        ${p(`Need an answer sooner? Call <a href="tel:${esc(B.contact.phoneHref)}" style="color:${A};font-weight:700;">${esc(B.contact.phone)}</a> during ${esc(B.contact.hours)}.`)}
        ${button(`${BASE}/inventory`, 'Browse inventory')}
      `,
    }),
  }),

  // ---- Internal -----------------------------------------------------------

  adminAlert: ({ title, lines, url, label }) => ({
    subject: `[${B.shortName}] ${title}`,
    template: 'admin_alert',
    html: shell({
      preheader: title,
      body: `
        ${eyebrow('Operations')}
        ${h1(title)}
        ${factTable(lines)}
        ${url ? button(url, label || 'Open in admin') : ''}
      `,
    }),
  }),
};

module.exports = { templates, shell, esc, button, factTable, callout };
