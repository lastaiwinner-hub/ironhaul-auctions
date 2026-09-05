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
  name: 'IronHaul Auctions',
  legalName: 'IronHaul Auctions LLC',
  shortName: 'IronHaul',
  tagline: 'Bid. Win. Move Iron.',
  domain: 'ironhaul-auctions.com',
  vertical: 'equipment', // 'equipment' | 'automotive' — drives spec fields & copy

  description:
    'Online auctions and instant-buy pricing on excavators, dozers, loaders, ' +
    'backhoes and heavy construction equipment. Verified listings, digital ' +
    'purchase agreements and nationwide delivery.',

  // ---- Contact ------------------------------------------------------------
  contact: {
    email: 'sales@ironhaul-auctions.com',
    supportEmail: 'support@ironhaul-auctions.com',
    noreplyEmail: 'no-reply@ironhaul-auctions.com',
    phone: '+1 (406) 555-0142',
    phoneHref: '+14065550142',
    hours: 'Mon–Fri  7:00 AM – 8:00 PM MT',
    hoursShort: 'Mon–Fri 7AM–8PM',
    responseTime: 'We reply within 24 hours',
  },

  // ---- Registered address (also the Seller block on every agreement) ------
  address: {
    line1: '4180 Foundry Yard Road',
    line2: '',
    city: 'Superior',
    state: 'MT',
    stateFull: 'Montana',
    postalCode: '59872',
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
    deliveryRegion: 'the United States, Canada and Mexico',
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
  // Blueprint blue carries the interface; orange is reserved strictly for the
  // closing clock, and the green/amber/red scale is the condition grading.
  theme: {
    accent: '#1D4E89',        // blueprint blue — the working accent
    accentDeep: '#163C6B',
    accentSoft: '#EEF3F9',
    hot: '#E5601A',           // time pressure only
    ink: '#17191B',
    inkSoft: '#3E4245',
    surface: '#FFFFFF',
    surfaceAlt: '#F2F1EC',    // document paper
    panel: '#FAFAF7',
    muted: '#6B6F73',
    line: '#DEDBD3',
    good: '#2E7D52',
    fair: '#C77D0A',
    poor: '#C0392B',
    live: '#E5601A',
    success: '#2E7D52',
    danger: '#C0392B',
    info: '#1D4E89',
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
