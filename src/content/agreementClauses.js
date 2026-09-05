'use strict';

const money = require('../services/money');
const { formatContract } = require('../services/dates');

/**
 * The agreement rendered as HTML for the on-screen signing page.
 *
 * This is the same contract the PDF generator produces, expressed for the
 * browser so the signer reads the actual terms rather than being asked to sign
 * an opaque attachment. Keep the two in step: any clause added here belongs in
 * pdfService.js as well.
 */
module.exports = (B, a) => {
  const buyerCityLine = [
    a.buyer_city,
    a.buyer_state ? `${a.buyer_state} ${a.buyer_zip || ''}`.trim() : a.buyer_zip,
  ].filter(Boolean).join(', ');

  return [
    {
      n: 1,
      heading: "Seller's Information",
      table: [
        ['Name', a.seller_name],
        ['Street Address', a.seller_address],
        ['City, State, Zip Code', a.seller_city_line],
        ['Telephone Number', a.seller_phone],
        ['Email Address', a.seller_email],
      ],
    },
    {
      n: 2,
      heading: "Buyer's Information",
      table: [
        ['Name', a.buyer_name],
        ['Street Address', [a.buyer_line1, a.buyer_line2].filter(Boolean).join(', ') || '—'],
        ['City, State, Zip Code', buyerCityLine || '—'],
        ['Telephone Number', a.buyer_phone || '—'],
        ['Email Address', a.buyer_email],
      ],
    },
    {
      n: 3,
      heading: 'Object of Sale',
      intro: `<strong>${a.seller_name}</strong> hereby agrees to sell, and <strong>${a.buyer_name}</strong> hereby agrees to purchase, the following product:`,
      table: [
        ['Year | Make | Model', [a.item_year, a.item_make, a.item_model].filter(Boolean).join(' | ')],
        ['Hour Meter', a.item_meter || 'On request'],
        ['Engine HP', a.item_engine_hp || '—'],
        ['Serial Number', a.item_serial || 'On request'],
        ['Inventory Stock Number', a.item_stock || '—'],
      ],
    },
    {
      n: 4,
      heading: 'Ownership Transfer',
      paragraphs: [
        `<strong>${a.seller_name}</strong> certifies that it is the lawful owner of the above-described Equipment and that it is free of all encumbrances and any and all legal claims. Parties agree to sign all documents necessary to transfer ownership of the Equipment from the Seller to the Buyer within ${B.terms.inspectionDays} days of the date of this Agreement.`,
        'The Buyer shall be liable for all administrative costs relating to the registration of the Equipment in his/her name and all costs relating to any required roadworthy or inspection certificate.',
      ],
    },
    {
      n: 5,
      heading: 'Purchase Price and Method',
      paragraphs: [
        `The total purchase price to be paid shall be: <strong>${money.format(a.purchase_price)} US Dollars</strong> (${money.toWords(a.purchase_price)}). All applicable taxes — state, local, municipal and/or sales taxes — are the responsibility of the Buyer and are not included in the purchase price.`,
        a.shipping_fee > 0
          ? `The shipping and handling fee of <strong>${money.format(a.shipping_fee)} US Dollars</strong> is the responsibility of the Buyer and is due upon delivery.`
          : null,
        `The purchase price is to be paid through <strong>${B.terms.paymentMethods}</strong>. Payment must reference agreement number <strong>${a.agreement_number}</strong> so that funds can be matched to this contract on receipt.`,
      ].filter(Boolean),
      total: {
        label: 'Total amount due',
        value: `${money.format(a.total_amount)} USD`,
      },
    },
    {
      n: 6,
      heading: 'Equipment Buy Back Guarantee',
      paragraphs: [
        `The <strong>${B.legalName}</strong> ${B.terms.inspectionDays} Day Buy Back Guarantee enables the Buyer to return the item/s for a full refund of the purchase price if the product/s was not accurately described and represented. Buyer must directly notify <strong>${B.legalName}</strong> in writing within ${B.terms.returnNoticeDays} days of receiving the product, but no longer than ${B.terms.inspectionDays} days after sale date, to initiate the return process. The return notification should be addressed to the Seller by phone, email or registered mail.`,
        `The item is covered by a <strong>${B.terms.warrantyMonths}-month warranty</strong>. The warranty does not cover any physical damage that occurs after the inspection process.`,
        'The inspection period begins at 9:00 AM on the weekday following the delivery day, as signed and certified by the Buyer on the delivery receipt.',
        `The purchased product must not be put to work or altered, and must not be used beyond what is required to verify the condition of the Equipment — not more than <strong>${B.terms.maxInspectionHours} hours of use or ${B.terms.maxInspectionMiles} miles</strong> from the reading at time of sale. In the event of a return, the Buyer is NOT responsible for freight and handling charges. In the event of a return, the Seller agrees to refund the Buyer, in full, within ${B.terms.refundWindowHours} hours.`,
        `If the Buyer decides to return the Equipment, the Seller (<strong>${B.legalName}</strong>) agrees to collect the item, covering all the related costs.`,
      ],
    },
    {
      n: 7,
      heading: 'Miscellaneous Provisions',
      paragraphs: [
        `The Seller (<strong>${B.legalName}</strong>) confirms that it is the owner of the product described in Paragraph 3 (Object of Sale), with the right to sell it to the Buyer for the purchase price and method listed in Paragraph 5 (Purchase Price and Method), that there are no liens or encumbrances on such product, and certifies that the information provided in this Purchase Agreement is true, accurate, and complete to the best of its knowledge.`,
        `The Buyer and the Seller (<strong>${B.legalName}</strong>) agree that the product described in Paragraph 3 above shall be sold by the Seller, and purchased by the Buyer, on an "as is" basis and in an "as is" condition, with a ${B.terms.inspectionDays} Day Buy Back guarantee to the described product. The Buyer accepts all liability for the product as of the date of arrival.`,
        `This Agreement constitutes the entire understanding between the parties and supersedes all prior discussions. It is governed by the laws of the State of <strong>${B.address.stateFull}</strong>. The parties agree that this Agreement may be executed electronically, and that an electronic signature carries the same legal effect as a handwritten one under the U.S. ESIGN Act and applicable state UETA legislation.`,
      ],
    },
    {
      n: 8,
      heading: 'Signatures',
      signature: {
        sellerName: `${B.signatory.name}, ${B.signatory.title}`,
        sellerCompany: B.legalName,
        sellerDate: formatContract(a.created_at),
        buyerName: a.buyer_name,
        buyerEmail: a.buyer_email,
      },
    },
  ];
};
