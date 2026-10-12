'use strict';

/**
 * ============================================================================
 *  BRAND CONFIGURATION  —  EDIT THIS FILE TO REBRAND THE ENTIRE PLATFORM
 * ============================================================================
 *  Every user-visible name, address, phone number, legal entity string and
 *  colour token flows from this one file: the website, the transactional
 *  emails and the generated Purchase Agreement PDFs all read from here.
 *  Change a value once and it propagates everywhere.
 * ==========================================================================*/

module.exports = {
  // ---- Identity -----------------------------------------------------------
  name: 'Heavyline Auctions',
  legalName: 'Heavyline Auctions',
  shortName: 'Heavyline',
  tagline: 'Bid. Win. Move Iron.',
  domain: 'heavylineauctions.us',
  vertical: 'equipment', // 'equipment' | 'automotive' — drives spec fields & copy

  description:
    'Online auctions and instant-buy pricing on excavators, dozers, loaders, ' +
    'backhoes and heavy construction equipment. Verified listings, digital ' +
    'purchase agreements and nationwide delivery.',

  // ---- Contact ------------------------------------------------------------
  contact: {
    email: 'contact@heavylineauctions.us',
    supportEmail: 'contact@heavylineauctions.us',
    noreplyEmail: 'contact@heavylineauctions.us',
    phone: '+1 (804) 505-5453',
    phoneHref: '+18045055453',
    hours: 'Mon–Fri  7:00 AM – 8:00 PM MT',
    hoursShort: 'Mon–Fri 7AM–8PM',
    responseTime: 'We reply within 24 hours',
  },

  // ---- Registered address (also the Seller block on every agreement) ------
  address: {
    line1: '10 Industrial Hwy',
    line2: '',
    city: 'Lester',
    state: 'PA',
    stateFull: 'Pennsylvania',
    postalCode: '19029',
    country: 'United States',
    get oneLine() {
      return `${this.line1}, ${this.city}, ${this.state} ${this.postalCode}`;
    },
  },

  // ---- Signing officer printed on the seller line of the agreement --------
  signatory: {
    name: 'Dale Whitmore',
    title: 'Managing Member',
  },

  // ---- Commercial terms (rendered into contracts and FAQ) -----------------
  terms: {
    inspectionDays: 10,          // buy-back / inspection window, in days
    warrantyMonths: 6,           // post-sale warranty
    returnNoticeDays: 3,         // days to notify of intent to return
    maxInspectionHours: 5,       // operating hours allowed during inspection
    maxInspectionMiles: 60,      // road miles allowed during inspection
    refundWindowHours: 24,       // refund turnaround after return accepted
    deliveryRatePerMile: 0.80,   // USD per mile, delivery estimator
    defaultShippingFee: 1200_00, // cents — fallback when no ZIP is supplied
    depositPercent: 0,           // 0 = no deposit required to bid
    buyerPremiumPercent: 0,      // 0 = no buyer's premium ("no hidden fees")
    currency: 'USD',
    currencySymbol: '$',
    paymentMethods: 'bank wire transfer',
    deliveryWindow: '2–7 business days',
    deliveryRegion: 'the United States',
  },

  // ---- Auction mechanics --------------------------------------------------
  auction: {
    defaultIncrement: 100_00,      // cents — minimum raise between bids
    antiSnipeWindowMin: 2,         // a bid inside this window extends the lot
    antiSnipeExtendMin: 2,         // ...by this many minutes
    defaultDurationHours: 72,      // length of a fresh auction cycle
    relistOnClose: true,           // keep selling after a winner is declared
    relistDelayMinutes: 15,        // pause between cycles
    proxyBidding: true,            // allow maximum (autobid) amounts
  },

  // ---- Visual identity ----------------------------------------------------
  // "Condition report": a technical document, not a construction billboard.
  // Charcoal and warm neutral surfaces frame red actions; distinct status colors serve the
  // closing clock and the green/amber/red condition grading scale.
  theme: {
    accent: '#BA302D',        // Heavyline red — the working accent
    accentDeep: '#942623',
    accentSoft: '#FAEFEC',
    hot: '#BA302D',           // time pressure only
    ink: '#202122',
    inkSoft: '#4B4945',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F1E8',    // document paper
    panel: '#FCFAF6',
    muted: '#67645F',
    line: '#DED9D1',
    good: '#2E7D52',
    fair: '#C77D0A',
    poor: '#C0392B',
    live: '#BA302D',
    success: '#2E7D52',
    danger: '#C0392B',
    info: '#BA302D',
    warn: '#C77D0A',
    displayFont: "'Barlow Condensed', 'Archivo', system-ui, sans-serif",
    bodyFont: "'Barlow', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', ui-monospace, monospace",
    googleFonts:
      'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&' +
      'family=Barlow:wght@400;500;600;700&' +
      'family=JetBrains+Mono:wght@400;500;600;700&display=swap',
  },

  // ---- Social -------------------------------------------------------------
  social: {
    facebook: '',
    instagram: '',
    youtube: '',
    linkedin: '',
  },

  // ---- Trust badges shown on listing pages --------------------------------
  trustBadges: [
    { icon: 'shield-check', label: 'Verified Listing' },
    { icon: 'lock',         label: 'Secure Payment' },
    { icon: 'signature',    label: 'Digital Agreement' },
    { icon: 'headset',      label: 'Mon–Fri Support' },
    { icon: 'rotate-left',  label: '10-Day Inspection' },
    { icon: 'certificate',  label: '6-Month Warranty' },
    { icon: 'clipboard',    label: 'Pre-Delivery Inspection' },
  ],
};
