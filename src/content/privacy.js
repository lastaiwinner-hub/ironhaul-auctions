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
      '<strong>Identity documents.</strong> Images of the front and back of a government-issued photographic identity document, and a photograph of yourself, used for identity checks and investigating suspected fraud.',
      '<strong>Transaction records.</strong> Bids placed, orders raised, purchase agreements issued and signed, invoices, payment references and delivery details.',
      '<strong>Signature data.</strong> Where you sign a document electronically we record the signature image or typed name, the date and time, and the IP address and browser from which it was applied.',
      '<strong>Live chat.</strong> The name and optional email address you provide, your messages, the public page where you start a conversation, and its traffic source when analytics is allowed. Staff replies appear in your browser; chat does not send automatic email notifications.',
      '<strong>Optional audience analytics.</strong> With your permission, we record public page paths, session visit times, broad device type, referral hostname and campaign tags. We do not store full referral URLs, IP addresses or social account identities in analytics.',
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
      'We use a first-party session cookie so that you stay signed in and so that form submissions can be protected against cross-site request forgery. It is essential to the operation of the site and cannot be disabled while you are logged in.',
      'The session cookie also preserves your chat and analytics preference. Analytics is off until you select Site analytics and save your choices. Use Privacy choices on the site to withdraw consent; this removes the currently associated analytics visit. Browser Global Privacy Control and Do Not Track signals prevent analytics tracking. Chat remains available without analytics.',
      'Only if you separately opt in to Meta advertising, we use the Meta Pixel and Conversions API to share public page visits, equipment views, registrations, checkout starts, submitted orders, accepted bids and confirmed paid purchases with Meta for advertising measurement and personalization. This may involve the _fbp and _fbc cookies, ad click identifiers, IP address, browser information, hashed email and account identifiers, product IDs and transaction values. We do not send identity documents, signatures, chat text, passwords or payment instructions. Private account and signing pages do not load the Pixel.',
    ],
  },
  {
    heading: '5. How your documents are protected',
    paragraphs: [
      'Identity documents are stored outside the public web root and are never accessible by direct link. They are served through authenticated, authorized requests by the account holder or an administrator.',
      'Uploaded images are re-encoded on receipt, which removes embedded metadata including any GPS coordinates recorded by your device.',
      'Passwords are stored only as salted one-way hashes rather than stored as readable passwords. No security measure eliminates every risk.',
      'Access to personal data is limited to staff who need it to do their job.',
    ],
  },
  {
    heading: '6. Who we share it with',
    paragraphs: [
      'Carriers and logistics partners receive the name, address and telephone number needed to deliver your purchase.',
      'Our bank and professional advisers receive information necessary to process payment and to meet accounting and tax obligations.',
      'When staff chat alerts are enabled, Telegram receives a generic new-message notification, a message reference and a link to our authenticated staff inbox. Chat message text, customer names and email addresses are not included in these alerts.',
      'Hosting and email providers process data needed to operate the service, including Hostinger for hosting and Resend when configured for email delivery. Providers may process information outside your state or country.',
      'We disclose information to law enforcement or regulators where we are legally required to do so.',
      'When you opt in to Meta advertising, Meta receives the limited advertising data described above. Use Privacy choices to withdraw this permission; pending advertising events and stored advertising context are removed. Global Privacy Control and Do Not Track prevent this tracking. Withdrawal does not undo events already received by Meta. See Meta’s privacy policy at https://www.facebook.com/privacy/policy/.',
    ],
  },
  {
    heading: '7. How long we keep it',
    paragraphs: [
      'Account records are retained while your account is open. Transaction and contract records may be kept afterwards for applicable accounting, tax, dispute and fraud-prevention purposes; retention is reviewed by staff rather than enforced by a seven-year automatic deletion job.',
      'Identity documents and transaction records are managed through staff review. Closing an account does not automatically delete these files. Request deletion through our privacy contact; we assess the request against applicable law, outstanding transactions, fraud investigations and record-retention needs.',
      'Audience visit data is retained for up to 90 days after its last activity. Chat messages are retained for 180 days; inactive conversation contact details are removed after 180 days. Automated cleanup runs during normal application use.',
      'Advertising attribution context is retained for up to 30 days after activity. Unsent event payloads expire within six days; successfully delivered payloads are removed locally, while event IDs and delivery statuses are retained to prevent duplicate reporting.',
      'Executed agreements and signature evidence remain in transaction records subject to applicable retention obligations and staff review.',
    ],
  },
  {
    heading: '8. Your rights',
    paragraphs: [
      'You may request a copy of the personal data we hold about you, ask us to correct anything inaccurate, or ask us to delete data we no longer have a lawful basis to keep.',
      'You may object to processing carried out on the basis of our legitimate interests, and you may ask us to restrict processing while a dispute is resolved.',
      `To exercise any of these rights, email ${B.contact.email}. We respond within the period required by applicable law and may request proportionate information to verify your identity. Note that we cannot delete records we are required to retain for tax or legal purposes, and that deleting your identity records will end your ability to bid.`,
      'Depending on where you live you may also have the right to complain to a data protection authority or state attorney general.',
    ],
  },
  {
    heading: '9. Public bidding information',
    paragraphs: ['Public bid histories show abbreviated bidder names, city/state where provided, bid amounts and times. Administrators can see full account names. Do not include sensitive information in public-facing account details.'],
  },
  {
    heading: '10. Children',
    paragraphs: [
      'The platform is not directed at anyone under 18 and we do not knowingly collect data from children. If you believe a minor has registered, contact us and we will close the account.',
    ],
  },
  {
    heading: '11. Changes to this policy',
    paragraphs: [
      'We update this policy when our practices change. The date at the top of the page shows when it was last revised, and we provide additional notice or request consent where required by applicable law.',
    ],
  },
];
