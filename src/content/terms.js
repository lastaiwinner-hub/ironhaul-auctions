'use strict';

/**
 * Terms of service, rendered from the brand config so the trading name,
 * addresses and commercial windows never drift out of step with the contracts.
 *
 * These are a commercially reasonable starting point written to match how the
 * platform actually behaves — they are not legal advice. Have a lawyer in your
 * operating state review them before you trade.
 */
module.exports = (B) => [
  {
    heading: '1. About these terms',
    paragraphs: [
      `These Terms of Service govern your use of ${B.domain} and any related services operated by ${B.legalName} ("we", "us", "the Company"), a company registered at ${B.address.oneLine}.`,
      'By creating an account, placing a bid, or completing a purchase you accept these terms in full. If you do not accept them, do not use the platform.',
      'We may update these terms from time to time. Material changes are notified by email to registered account holders at least 14 days before they take effect.',
    ],
  },
  {
    heading: '2. Eligibility and accounts',
    paragraphs: [
      'You must be at least 18 years old and legally able to enter into binding contracts. Accounts are personal to you and may not be shared, sold or transferred.',
      'You are responsible for keeping your password confidential and for all activity that occurs under your account. Tell us immediately if you suspect unauthorised access.',
      'You must provide accurate, current and complete information. Registering under a false identity, or on behalf of an undisclosed third party, is grounds for immediate suspension and cancellation of any bids or purchases made.',
    ],
  },
  {
    heading: '3. Identity verification',
    paragraphs: [
      'Before your first bid or purchase you must complete identity verification by uploading the front and back of a valid government-issued photographic identity document, together with a photograph of yourself (a "selfie").',
      'We verify these documents to confirm that you are who you say you are, to prevent fraudulent bidding, and to meet our record-keeping obligations. Verification is at our sole discretion and we may request further documentation or decline an account without giving reasons.',
      'Identity documents are stored securely, are not published, and are handled in accordance with our Privacy Policy.',
    ],
  },
  {
    heading: '4. Bidding',
    paragraphs: [
      'A bid is a binding offer to purchase the lot at the amount bid, subject to these terms. Bids cannot be retracted once placed except at our discretion, and only where a genuine error can be demonstrated promptly.',
      `Auctions run to a published closing time. A bid placed within the final ${B.auction.antiSnipeWindowMin} minutes extends the closing time by ${B.auction.antiSnipeExtendMin} minutes. This repeats for as long as bidding continues.`,
      'Where you set a maximum bid, you authorise us to bid automatically on your behalf in single increments, only as far as needed to maintain the leading position, and never above the maximum you set.',
      'Some lots carry a reserve. If bidding closes below the reserve, no sale is concluded and no obligation arises on either side.',
      'The highest verified bid at close wins, provided any reserve is met. We reserve the right to reject any bid, cancel any auction and withdraw any lot at any time before close.',
    ],
  },
  {
    heading: '5. Continuing availability of stock',
    paragraphs: [
      'We hold physical inventory and may hold multiple units of the same specification. Where stock remains after a winning bid is declared, we may open a further auction cycle for the same listing and continue to offer the item at its Buy Now price.',
      'The declaration of a winner on one auction cycle therefore does not necessarily mean the item is no longer available. Each cycle is a separate contract with its own winner.',
    ],
  },
  {
    heading: '6. Buy Now purchases',
    paragraphs: [
      'Every listing carries a Buy Now price. Submitting a Buy Now request creates an order which is subject to our confirmation of availability and to your completion of identity verification.',
      'A Buy Now order does not conclude a sale until we have confirmed the order and you have signed the purchase agreement.',
    ],
  },
  {
    heading: '7. Purchase agreements and electronic signature',
    paragraphs: [
      'A purchase agreement is generated automatically and sent to you for signature. It records the parties, the item, the price and the terms of sale, and is the operative contract for the transaction.',
      'You agree that the agreement may be signed electronically, and that an electronic signature has the same legal effect as a handwritten one under the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN) and applicable state UETA legislation.',
      'We record the date, time and IP address at which each document is sent, viewed and signed, and issue a signature certificate with the executed document.',
      'Where an agreement is issued at the time of bidding, it becomes operative only if you win that lot or complete a Buy Now purchase of it. Being outbid creates no payment obligation.',
    ],
  },
  {
    heading: '8. Price, taxes and payment',
    paragraphs: [
      `The purchase price is the hammer price or Buy Now price as applicable. There is no buyer premium. Delivery is charged separately and is estimated at ${B.terms.currencySymbol}${B.terms.deliveryRatePerMile.toFixed(2)} per mile from our yard, confirmed in writing before payment.`,
      'All applicable state, local, municipal and sales taxes, together with registration and titling costs, are your responsibility and are not included in the purchase price.',
      `Payment is by ${B.terms.paymentMethods}. An invoice is issued once the purchase agreement is signed and must be settled within the period stated on it. Your order number must be quoted as the payment reference.`,
      `We will never notify you of a change to our banking details by email. If you receive such a message, do not act on it — call ${B.contact.phone} to verify before transferring any funds.`,
      'Title in the goods passes to you on receipt of cleared funds in full. Risk passes on delivery.',
    ],
  },
  {
    heading: '9. Delivery',
    paragraphs: [
      `We arrange delivery through vetted carriers to addresses within ${B.terms.deliveryRegion}. Most deliveries complete within ${B.terms.deliveryWindow} of cleared payment, though transit times are estimates and are not guaranteed.`,
      'Customer collection from our yard is not available. You must ensure the delivery address is accessible to a heavy-haul transporter and that someone authorised is present to receive and sign for the item. Where a site cannot accept a full-size transporter we will agree a nearby meeting point.',
      'You must inspect the item on arrival and record any visible transit damage on the delivery receipt before signing it.',
    ],
  },
  {
    heading: `10. Inspection period and buy-back guarantee`,
    paragraphs: [
      `Every purchase carries a ${B.terms.inspectionDays}-day buy-back guarantee. The inspection period begins at 9:00 AM on the weekday following delivery, as certified by your signature on the delivery receipt.`,
      `If the item was not accurately described or represented, you must notify us in writing within ${B.terms.returnNoticeDays} days of receiving it, and in no case later than ${B.terms.inspectionDays} days after the sale date, to start a return.`,
      `During the inspection period the item must not be put to work, altered, repaired, resold or used commercially. Use is limited to verifying condition and must not exceed ${B.terms.maxInspectionHours} operating hours or ${B.terms.maxInspectionMiles} miles beyond the reading at time of sale.`,
      `Where a return is accepted we collect the item at our cost and refund the purchase price in full within ${B.terms.refundWindowHours} hours of collection.`,
      `Following the inspection period, items are covered by a ${B.terms.warrantyMonths}-month warranty. The warranty does not cover physical damage occurring after the inspection process, wear items, or damage caused by misuse, neglect or unauthorised modification.`,
    ],
  },
  {
    heading: '11. Condition and "as is" basis',
    paragraphs: [
      'Items are inspected and serviced before listing, and we describe them as accurately as we can, including known faults and hour readings.',
      `Subject to the buy-back guarantee and warranty above, items are sold on an "as is" basis in an "as is" condition. Save as expressly stated in these terms and in your purchase agreement, all other warranties, conditions and representations, whether express or implied by statute or common law, are excluded to the fullest extent permitted by law.`,
      'Most lots are sold without a pre-bid physical inspection. Additional photographs or video are available on request before you bid.',
    ],
  },
  {
    heading: '12. Non-payment and default',
    paragraphs: [
      'If you fail to sign the purchase agreement or settle the invoice within the stated period, we may cancel the sale, re-offer the item, suspend or close your account, and recover any resulting loss from you, including the difference in resale price and reasonable costs.',
      'Repeated non-payment or bid retraction is treated as a serious breach and results in permanent exclusion from the platform.',
    ],
  },
  {
    heading: '13. Prohibited conduct',
    paragraphs: [
      'You must not bid on your own listings or arrange for others to do so; place bids you do not intend to honour; use automated systems to place bids; interfere with the operation of the platform; or attempt to access accounts or data belonging to others.',
      'We monitor bidding patterns and will cancel bids and suspend accounts where we identify shill bidding, collusion or manipulation.',
    ],
  },
  {
    heading: '14. Limitation of liability',
    paragraphs: [
      'Nothing in these terms excludes or limits our liability for death or personal injury caused by our negligence, for fraud or fraudulent misrepresentation, or for any liability that cannot lawfully be excluded.',
      'Subject to that, our total liability arising out of or in connection with any transaction is limited to the purchase price paid for the item concerned.',
      'We are not liable for indirect or consequential loss, loss of profit, loss of business, loss of contracts, or loss arising from downtime, delayed delivery, or the unavailability of the platform.',
    ],
  },
  {
    heading: '15. Governing law',
    paragraphs: [
      `These terms and any dispute arising from them are governed by the laws of the State of ${B.address.stateFull}, and the parties submit to the exclusive jurisdiction of the courts of that state.`,
    ],
  },
  {
    heading: '16. Contact',
    paragraphs: [
      `${B.legalName}, ${B.address.oneLine}.`,
      `Email ${B.contact.email} · Telephone ${B.contact.phone} · ${B.contact.hours}`,
    ],
  },
];
