'use strict';

const express = require('express');
const config = require('../../config');
const { db } = require('../../config/database');
const listingModel = require('../models/listing');
const mailer = require('../services/mailer');
const { templates } = require('../services/emailTemplates');
const { validate } = require('../middleware/validate');
const { limiters, asyncRoute } = require('../middleware/common');

const router = express.Router();
const B = config.brand;

router.get('/', (req, res) => {
  const endingSoon = listingModel.endingSoon(9);
  const featured = listingModel.featured(6);

  res.render('pages/home', {
    title: `${B.name} — ${B.tagline}`,
    metaDescription: B.description,
    bodyClass: 'page-home',
    endingSoon,
    featured: featured.length ? featured : endingSoon.slice(0, 6),
    thumbsBy: listingModel.thumbsFor(endingSoon.map((l) => l.id)),
    facets: listingModel.facets(),
    reviews: REVIEWS.slice(0, 3),
    // The six questions a first-time bidder asks before they will place a bid.
    homeFaq: FAQ.flatMap((g) => g.items).slice(0, 6),
    stats: {
      live: listingModel.liveCount(),
      auctions: listingModel.activeAuctionCount(),
      categories: listingModel.categoriesWithCounts().filter((c) => c.listing_count > 0).length,
    },
  });
});

// ---------------------------------------------------------------------------
// Stock alerts — the one-field sign-up on the home page. Stored in the same
// inbox as a contact enquiry so the team works from a single list.
// ---------------------------------------------------------------------------
router.post('/alerts', limiters.contact, asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().slice(0, 190);
  const wanted = String(req.body.wanted || '').trim().slice(0, 500);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    req.flash('error', 'Please enter a valid email address.');
    return res.redirect('/#alerts');
  }

  db.prepare(`
    INSERT INTO contact_messages (name, email, phone, subject, message, ip_address)
    VALUES (?, ?, NULL, ?, ?, ?)
  `).run('Alert subscriber', email, 'equipment alert request',
    wanted || 'Please email me when matching equipment is catalogued.', req.ip);

  const alert = templates.adminAlert({
    title: 'New equipment alert subscriber',
    lines: [['Email', email], ['Looking for', wanted || 'Anything new']],
    url: `${config.baseUrl}/admin/messages`,
    label: 'Open inbox',
  });
  await mailer.send({
    to: config.mail.adminNotify, subject: alert.subject,
    html: alert.html, template: alert.template,
  });

  req.flash('success', 'You are on the list — we will email you when something matching lands.');
  return res.redirect('/');
}));

router.get('/how-it-works', (req, res) => {
  res.render('pages/how-it-works', {
    title: `How it works — ${B.name}`,
    metaDescription:
      `Register, verify your ID, bid or buy instantly, sign your purchase agreement ` +
      `and take delivery anywhere in ${B.terms.deliveryRegion}.`,
    steps: STEPS,
  });
});

router.get('/faq', (req, res) => {
  res.render('pages/faq', {
    title: `Frequently asked questions — ${B.name}`,
    metaDescription: `Answers on bidding, identity verification, payment, the ${B.terms.inspectionDays}-day inspection period, delivery and returns.`,
    groups: FAQ,
  });
});

router.get('/about', (req, res) => {
  res.render('pages/about', {
    title: `About ${B.name}`,
    metaDescription: `${B.legalName} is a heavy equipment auction house based in ${B.address.city}, ${B.address.stateFull}.`,
    values: VALUES,
    reviews: REVIEWS,
  });
});

router.get('/reviews', (req, res) => {
  res.render('pages/reviews', {
    title: `Buyer reviews — ${B.name}`,
    metaDescription: 'Verified reviews from equipment buyers across the United States.',
    reviews: REVIEWS,
    average: (REVIEWS.reduce((sum, r) => sum + r.rating, 0) / REVIEWS.length).toFixed(1),
  });
});

router.get('/terms-of-service', (req, res) => {
  res.render('pages/legal', {
    title: `Terms of service — ${B.name}`,
    heading: 'Terms of Service',
    updated: 'September 1, 2026',
    sections: require('../content/terms')(B),
  });
});

router.get('/privacy-policy', (req, res) => {
  res.render('pages/legal', {
    title: `Privacy policy — ${B.name}`,
    heading: 'Privacy Policy',
    updated: 'September 1, 2026',
    sections: require('../content/privacy')(B),
  });
});

// ---- Contact --------------------------------------------------------------

router.get('/contact', (req, res) => {
  res.render('pages/contact', {
    title: `Contact ${B.name}`,
    metaDescription: `Call ${B.contact.phone} or send a message — we reply within one business day.`,
    values: {},
    errors: {},
  });
});

router.post('/contact', limiters.contact, asyncRoute(async (req, res) => {
  const { values, errors, valid } = validate(req.body, {
    name: { required: true, label: 'Name', maxLength: 120 },
    email: { required: true, type: 'email', label: 'Email' },
    phone: { type: 'phone', label: 'Phone' },
    subject: { maxLength: 160, default: 'General enquiry' },
    message: { required: true, minLength: 10, maxLength: 4000, label: 'Message' },
    website: {},   // honeypot, see below
  });

  // Bots fill every field they find; a real visitor never sees this one.
  if (values.website) {
    return res.redirect('/contact?sent=1');
  }

  if (!valid) {
    return res.status(400).render('pages/contact', {
      title: `Contact ${B.name}`, values, errors,
    });
  }

  db.prepare(`
    INSERT INTO contact_messages (name, email, phone, subject, message, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(values.name, values.email, values.phone || null,
    values.subject, values.message, req.ip);

  const receipt = templates.contactReceipt({ name: values.name });
  await mailer.send({
    to: values.email,
    subject: receipt.subject,
    html: receipt.html,
    template: receipt.template,
  });

  const alert = templates.adminAlert({
    title: `New enquiry from ${values.name}`,
    lines: [
      ['Name', values.name],
      ['Email', values.email],
      ['Phone', values.phone || '—'],
      ['Subject', values.subject],
      ['Message', values.message.slice(0, 500)],
    ],
    url: `${config.baseUrl}/admin/messages`,
    label: 'Open inbox',
  });
  await mailer.send({
    to: config.mail.adminNotify,
    subject: alert.subject,
    html: alert.html,
    template: alert.template,
    replyTo: values.email,
  });

  req.flash('success', 'Thanks — your message is with our team. We reply within one business day.');
  return res.redirect('/contact?sent=1');
}));

// ---- Machine-readable -----------------------------------------------------

router.get('/sitemap.xml', (req, res) => {
  const listings = db.prepare(
    "SELECT slug, updated_at FROM listings WHERE status = 'live'"
  ).all();
  const staticPaths = ['', '/inventory', '/how-it-works', '/faq', '/about',
    '/reviews', '/contact', '/terms-of-service', '/privacy-policy'];

  const urls = [
    ...staticPaths.map((p) => `<url><loc>${config.baseUrl}${p}</loc><changefreq>daily</changefreq></url>`),
    ...listings.map((l) =>
      `<url><loc>${config.baseUrl}/lot/${l.slug}</loc><lastmod>${l.updated_at.slice(0, 10)}</lastmod><changefreq>hourly</changefreq></url>`),
  ].join('\n  ');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${urls}\n</urlset>`
  );
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /sign\nDisallow: /api\n\nSitemap: ${config.baseUrl}/sitemap.xml\n`
  );
});

router.get('/healthz', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, uptime: process.uptime(), env: config.env });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Static page content
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: '01',
    title: 'Create your account',
    body: 'Register in under a minute — no card, no cost. You can browse every lot and build a watchlist straight away.',
    detail: 'All you need is a name, an email address and a phone number. Confirm your email and your account is open.',
  },
  {
    n: '02',
    title: 'Verify your identity',
    body: 'Upload the front and back of a government-issued ID plus a quick selfie. Verification is what keeps fake accounts and time-wasters out of the bidding.',
    detail: 'Our team reviews documents during business hours — usually within a few hours. You are emailed the moment you are cleared.',
  },
  {
    n: '03',
    title: 'Bid or buy it now',
    body: 'Place a bid on any live lot, or skip the auction and take the machine at its Buy Now price. Set a maximum and we bid for you, one increment at a time.',
    detail: 'A bid inside the final two minutes extends the lot by two minutes, so nothing is ever sniped in the last second.',
  },
  {
    n: '04',
    title: 'Sign your purchase agreement',
    body: 'Your agreement is generated automatically with your name, address and the machine details already filled in. Review it and sign electronically — no printer, no scanner.',
    detail: 'Signed electronically under the U.S. ESIGN Act. You receive a fully executed PDF with a signature certificate.',
  },
  {
    n: '05',
    title: 'Pay securely',
    body: 'We issue your invoice with bank wire instructions quoting your order number. Funds are verified before anything moves.',
    detail: 'We never store card details, and we will never email you a change of bank details.',
  },
  {
    n: '06',
    title: 'Take delivery',
    body: 'We assign a vetted heavy-haul carrier, send you tracking, and deliver to your yard. Your inspection period starts the next weekday morning.',
    detail: `Most deliveries land within ${B.terms.deliveryWindow} across ${B.terms.deliveryRegion}.`,
  },
];

const VALUES = [
  {
    title: 'Every listing inspected',
    body: 'Nothing goes on the block until it has been through our yard, been serviced and been photographed properly — hours, faults and all.',
  },
  {
    title: 'Verified bidders only',
    body: 'Identity verification is mandatory before a bid is accepted. It keeps the bidding honest and the auction clean for serious buyers.',
  },
  {
    title: 'Straight pricing',
    body: 'No buyer premium, no listing fee, no surprise line item at the end. The number you bid is the number on the agreement.',
  },
  {
    title: 'Paperwork that runs itself',
    body: 'The moment you bid, your purchase agreement is drawn up and sent for signature. Win the lot and delivery starts the same day.',
  },
  {
    title: `${B.terms.inspectionDays}-day inspection`,
    body: `Take delivery, put a mechanic on it, and if the machine is not as described we collect it and refund you in full within ${B.terms.refundWindowHours} hours.`,
  },
  {
    title: 'Real people on the phone',
    body: `Call ${B.contact.phone} during ${B.contact.hoursShort} and you get someone who has walked the yard, not a script.`,
  },
];

const FAQ = [
  {
    group: 'Bidding & buying',
    items: [
      {
        q: 'How do the auctions work?',
        a: `Each lot runs as a timed online auction. The listing shows the current bid, the minimum next bid and the time remaining. The highest verified bidder when the clock runs out wins. A bid placed in the final ${B.auction.antiSnipeWindowMin} minutes extends the auction by ${B.auction.antiSnipeExtendMin} minutes, so a lot can never be sniped in the closing seconds.`,
      },
      {
        q: 'What is a maximum bid?',
        a: 'Instead of watching the clock, you can leave a maximum. We bid on your behalf in single increments, only as high as needed to keep you in front, and never above your ceiling. If someone outbids your maximum you are emailed immediately.',
      },
      {
        q: 'Is there a Buy It Now option?',
        a: 'Yes. Every machine carries a Buy Now price alongside its auction. If you would rather not bid, take it at that price and we move straight to the agreement.',
      },
      {
        q: 'If someone wins the auction, is the machine gone?',
        a: 'Not necessarily. We hold real stock and frequently have more than one of the same model. When a cycle closes we declare the winner and, where stock allows, immediately open a fresh auction cycle on the same listing — so you can keep bidding, or take it at the Buy Now price right away.',
      },
      {
        q: 'Is there a buyer premium or hidden fee?',
        a: `No. There is no buyer premium and no listing fee. You pay the hammer price or Buy Now price, plus delivery, plus any taxes that apply in your state. Delivery is estimated at ${B.terms.currencySymbol}${B.terms.deliveryRatePerMile.toFixed(2)} per mile from our yard and confirmed before you pay.`,
      },
    ],
  },
  {
    group: 'Account & verification',
    items: [
      {
        q: 'Why do I need to upload my ID?',
        a: 'A bid is a binding commitment, so we verify who is making it. Every buyer must upload the front and back of a government-issued ID and a selfie before their first bid or purchase. It keeps fake accounts and time-wasters out of the auction.',
      },
      {
        q: 'How long does verification take?',
        a: 'Documents are reviewed by our team during business hours, usually within a few hours. You are emailed as soon as your account is cleared.',
      },
      {
        q: 'How are my documents stored?',
        a: 'Identity documents are stored outside the public web root, are never linked publicly, and are only accessible to the verification team. Location data is stripped from every uploaded image on receipt.',
      },
      {
        q: 'Does it cost anything to register?',
        a: 'No. Registration is free, takes under a minute and needs no payment details. You only ever pay for a machine you have bid on and won, or bought outright.',
      },
    ],
  },
  {
    group: 'Agreements & payment',
    items: [
      {
        q: 'When do I get the purchase agreement?',
        a: 'As soon as you place a bid. The agreement is generated automatically with your name, address, the machine details and your bid amount already filled in, and emailed to you for electronic signature. Signing early means that if you win, delivery is arranged the same day with no further paperwork.',
      },
      {
        q: 'Does signing commit me to pay if I do not win?',
        a: 'No. The agreement only takes effect on the lot you actually win, or on a Buy Now purchase you complete. If you are outbid, nothing is owed.',
      },
      {
        q: 'Is an electronic signature legally binding?',
        a: 'Yes. Signatures are captured under the U.S. ESIGN Act and applicable state UETA legislation, with a full audit trail of when the document was sent, viewed and signed, and from which IP address. Both parties receive the executed PDF with a signature certificate attached.',
      },
      {
        q: 'How do I pay?',
        a: `Payment is by ${B.terms.paymentMethods}. Once your agreement is signed we issue an invoice with our bank details and your order number as the reference. We never store card data, and we will never email you a change of banking details — if you receive such a message, call ${B.contact.phone} before sending funds.`,
      },
    ],
  },
  {
    group: 'Delivery, inspection & returns',
    items: [
      {
        q: 'How does delivery work?',
        a: `Once payment clears we assign a vetted heavy-haul carrier and send you tracking. Most deliveries land within ${B.terms.deliveryWindow} across ${B.terms.deliveryRegion}. If your site cannot take a full-size transporter we will arrange a nearby meeting point.`,
      },
      {
        q: 'Can I collect from your yard instead?',
        a: 'Customer collection is not available. Every machine is delivered through our authorised transport partners so that condition on arrival is documented and the inspection period has a clear start date.',
      },
      {
        q: `What does the ${B.terms.inspectionDays}-day inspection period cover?`,
        a: `Your inspection window opens at 9:00 AM on the weekday after delivery. Put your own mechanic on the machine. If it is not as described, notify us in writing within ${B.terms.returnNoticeDays} days of receiving it and no later than ${B.terms.inspectionDays} days after the sale date, and we collect it at our cost and refund you in full within ${B.terms.refundWindowHours} hours.`,
      },
      {
        q: 'What are the limits during inspection?',
        a: `The machine must not be put to work or altered. Use is limited to what is needed to verify condition — no more than ${B.terms.maxInspectionHours} operating hours or ${B.terms.maxInspectionMiles} miles beyond the reading at time of sale.`,
      },
      {
        q: 'Is there a warranty after the inspection period?',
        a: `Yes. Every machine carries a ${B.terms.warrantyMonths}-month warranty. It does not cover physical damage occurring after the inspection process.`,
      },
      {
        q: 'Can I see more photos or a video before bidding?',
        a: `Absolutely. Call ${B.contact.phone} or email ${B.contact.email} with the stock number and we will send additional photos or walk-around video where available.`,
      },
    ],
  },
];

const REVIEWS = [
  {
    name: 'Derek Simmons', photo: '/img/avatars/m01.jpg', location: 'Albany, GA', rating: 5,
    item: '2022 John Deere 5075E Utility Tractor',
    body: 'I have bought equipment from three different dealers in the last five years and this was by far the best experience. Price was fair, communication was excellent, and the machine was ready to work when it rolled off the trailer.',
  },
  {
    name: 'Cynthia Rowe', photo: '/img/avatars/w01.jpg', location: 'Pensacola, FL', rating: 5,
    item: '2021 Caterpillar 320 Hydraulic Excavator',
    body: 'We needed an excavator on short notice for a land clearing job. They had one in the yard, sorted delivery inside three days, and it showed up with fuel in the tank. That is the kind of service that keeps me coming back.',
  },
  {
    name: 'Marcus Bell', photo: '/img/avatars/m03.jpg', location: 'Columbus, GA', rating: 5,
    item: '2019 Caterpillar 259D3 Compact Track Loader',
    body: 'Straightforward deal from start to finish. The wire transfer process was explained clearly, the paperwork was clean, and the loader runs like a top. I have already referred two neighbours.',
  },
  {
    name: 'Lisa Tanner', photo: '/img/avatars/w02.jpg', location: 'Panama City, FL', rating: 5,
    item: '2020 Case 580N Backhoe Loader',
    body: 'Running a small outfit, every dollar matters. I got a fair price, honest photos and a machine that has not missed a beat in six months of daily use. They replied to every email the same day.',
  },
  {
    name: 'Roy Hutchinson', photo: '/img/avatars/m04.jpg', location: 'Thomasville, GA', rating: 5,
    item: '2019 Caterpillar D3K2 LGP Dozer',
    body: 'The grade on the listing said 4.4 with a seep at one cylinder. That is exactly what showed up — the honesty is worth more to me than a cheaper price somewhere else.',
  },
  {
    name: 'Angela Ferris', photo: '/img/avatars/w03.jpg', location: 'Gainesville, FL', rating: 5,
    item: '2022 Kubota M7060 Utility Tractor',
    body: 'First time buying heavy equipment online and I was completely lost. The team walked me through every step. By the time the tractor arrived I felt like an experienced buyer.',
  },
  {
    name: 'Calvin Marsh', photo: '/img/avatars/m02.jpg', location: 'Tifton, GA', rating: 5,
    item: '2021 Bobcat E35 Mini Excavator',
    body: 'I have worked with dealers up and down the Southeast and this one stands out for one reason: they do what they say. Delivery was on time, price was what was agreed, and the machine matched the listing.',
  },
  {
    name: 'Patricia Nguyen', photo: '/img/avatars/w04.jpg', location: 'Mobile, AL', rating: 5,
    item: '2020 John Deere 310SL Backhoe Loader',
    body: 'The backhoe was exactly what I needed for a drainage project. Ordered Monday, delivered Thursday, and they called me with updates twice during transit. Exceptional logistics for heavy equipment.',
  },
  {
    name: 'Elijah Carter', photo: '/img/avatars/m07.jpg', location: 'Savannah, GA', rating: 4,
    item: '2018 New Holland B95C Backhoe Loader',
    body: 'Buying without being able to walk around the machine felt risky. The ten-day inspection window took that risk off the table. We did not need to use it, but knowing it was there made the decision easy.',
  },
  {
    name: 'James Harrington', photo: '/img/avatars/m05.jpg', location: 'Valdosta, GA', rating: 5,
    item: '2021 John Deere 333G Compact Track Loader',
    body: 'Bought my first machine through them and the process could not have been smoother. Straight answers on condition, pricing and delivery timeline. The loader arrived exactly as described. Solid outfit — I will be back for the next one.',
  },
  {
    name: 'Maria Delgado', photo: '/img/avatars/w05.jpg', location: 'Dothan, AL', rating: 5,
    item: '2019 Hitachi ZX30U-5N Mini Excavator',
    body: 'I was nervous bidding on equipment I had not seen in person, but the agreement came through the moment I bid, with everything already filled in. No chasing paperwork. The machine turned up in great shape.',
  },
  {
    name: 'Tommy Whitfield', photo: '/img/avatars/m08.jpg', location: 'Moultrie, GA', rating: 5,
    item: '2023 Bobcat T66 Compact Track Loader',
    body: 'These folks know equipment. Listing photos were honest, the hours were accurate, and when I had a question about the hydraulics I had a call back inside the hour. Delivery coordination was flawless.',
  },
  {
    name: 'Brenda Okafor', photo: '/img/avatars/w06.jpg', location: 'Tallahassee, FL', rating: 5,
    item: '2018 New Holland B95C Backhoe Loader',
    body: 'The ten-day inspection policy is what sold me. I brought my own mechanic out to look at the backhoe and he said it was in better shape than expected. Transparent, professional and responsive throughout.',
  },
  {
    name: 'Curtis Nakamura', photo: '/img/avatars/m06.jpg', location: 'Boise, ID', rating: 5,
    item: '2020 Caterpillar 236D3 Skid Steer Loader',
    body: 'Set a maximum bid, went back to work, and got the email that I had won at well under my ceiling. The whole thing ran itself. Invoice, wire details and tracking all came through without me having to ask.',
  },
  {
    name: 'Angela Ruiz', photo: '/img/avatars/w07.jpg', location: 'Amarillo, TX', rating: 5,
    item: '2019 Caterpillar D3K2 LGP Dozer',
    body: 'I have bought at physical auctions for fifteen years and this was less hassle than any of them. No buyer premium was the part I did not quite believe until the invoice came and it was exactly the hammer price plus freight.',
  },
];

module.exports = router;
