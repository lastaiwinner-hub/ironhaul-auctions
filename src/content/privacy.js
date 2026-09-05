'use strict';

/**
 * Privacy policy. Written to describe what this application actually does with
 * personal data — including the identity documents the KYC flow collects.
 * Review with counsel before trading, and update if you add third-party
 * processors (analytics, payment providers, CRM).
 */
module.exports = (B) => [
  {
    heading: '1. Who we are',
    paragraphs: [
      `${B.legalName}, of ${B.address.oneLine}, is the controller of the personal data described in this policy.`,
      `Questions about privacy, or requests relating to your data, should go to ${B.contact.email} or ${B.contact.phone}.`,
    ],
  },
  {
    heading: '2. What we collect',
    paragraphs: [
      '<strong>Account details.</strong> Your name, email address, telephone number, company name where given, and billing and delivery addresses.',
      '<strong>Identity documents.</strong> Images of the front and back of a government-issued photographic identity document, and a photograph of yourself, used solely to verify that you are who you say you are.',
      '<strong>Transaction records.</strong> Bids placed, orders raised, purchase agreements issued and signed, invoices, payment references and delivery details.',
      '<strong>Signature data.</strong> Where you sign a document electronically we record the signature image or typed name, the date and time, and the IP address and browser from which it was applied.',
      '<strong>Technical data.</strong> IP address, browser type, pages visited and session cookies necessary to keep you signed in.',
    ],
  },
  {
    heading: '3. Why we use it',
    paragraphs: [
      'To operate your account, accept bids and process purchases — this is necessary to perform our contract with you.',
      'To verify your identity and prevent fraudulent bidding — this is necessary for our legitimate interest in running an honest auction, and for our record-keeping obligations.',
      'To generate, send and store purchase agreements, invoices and delivery documentation.',
      'To send transactional messages: bid confirmations, outbid alerts, auction results, signature requests, invoices and delivery updates. These are not marketing and cannot be unsubscribed from while your account is active.',
      'To meet legal, tax and accounting obligations, and to establish or defend legal claims.',
    ],
  },
  {
    heading: '4. Cookies',
    paragraphs: [
      'We set a single first-party session cookie so that you stay signed in and so that form submissions can be protected against cross-site request forgery. It is essential to the operation of the site and cannot be disabled while you are logged in.',
      'We do not set advertising cookies and we do not sell or share your data with advertising networks.',
    ],
  },
  {
    heading: '5. How your documents are protected',
    paragraphs: [
      'Identity documents are stored outside the public web root and are never accessible by direct link. They can only be retrieved through an authenticated request by a member of the verification team.',
      'Uploaded images are re-encoded on receipt, which removes embedded metadata including any GPS coordinates recorded by your device.',
      'Passwords are stored only as salted one-way hashes and are never recoverable by us or by anyone else.',
      'Access to personal data is limited to staff who need it to do their job.',
    ],
  },
  {
    heading: '6. Who we share it with',
    paragraphs: [
      'Carriers and logistics partners receive the name, address and telephone number needed to deliver your purchase.',
      'Our bank and professional advisers receive information necessary to process payment and to meet accounting and tax obligations.',
      'Email delivery is handled by our email service provider, which processes the content of transactional messages on our behalf.',
      'We disclose information to law enforcement or regulators where we are legally required to do so.',
      'We do not sell personal data, and we do not share it for third-party marketing.',
    ],
  },
  {
    heading: '7. How long we keep it',
    paragraphs: [
      'Account records are retained for as long as your account is open, and for seven years afterwards where they relate to a completed transaction, to meet tax and accounting requirements.',
      'Identity documents are retained for the period required to evidence that verification was performed, and are deleted once that period expires or your account is closed and no transaction record requires them.',
      'Executed purchase agreements and their signature certificates are retained for seven years as records of concluded contracts.',
    ],
  },
  {
    heading: '8. Your rights',
    paragraphs: [
      'You may request a copy of the personal data we hold about you, ask us to correct anything inaccurate, or ask us to delete data we no longer have a lawful basis to keep.',
      'You may object to processing carried out on the basis of our legitimate interests, and you may ask us to restrict processing while a dispute is resolved.',
      `To exercise any of these rights, email ${B.contact.email}. We respond within 30 days. Note that we cannot delete records we are required to retain for tax or legal purposes, and that deleting your identity records will end your ability to bid.`,
      'Depending on where you live you may also have the right to complain to a data protection authority or state attorney general.',
    ],
  },
  {
    heading: '9. Children',
    paragraphs: [
      'The platform is not directed at anyone under 18 and we do not knowingly collect data from children. If you believe a minor has registered, contact us and we will close the account.',
    ],
  },
  {
    heading: '10. Changes to this policy',
    paragraphs: [
      'We update this policy when our practices change. The date at the top of the page shows when it was last revised, and material changes are notified by email to registered account holders.',
    ],
  },
];
