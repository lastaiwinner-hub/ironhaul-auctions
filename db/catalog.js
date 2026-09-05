'use strict';

/**
 * Seed catalogue: real-world machine specifications used to populate a
 * demonstrable inventory. Prices are in cents.
 *
 * `photo` names a search term used by db/fetch-images.js to pull matching
 * stock photography, and maps to the files under public/uploads/listings.
 */

const CATEGORIES = [
  { slug: 'excavators',      name: 'Excavators',       icon: 'excavator', sort_order: 1,
    description: 'Hydraulic and mini excavators from 1.5 to 35 tonnes, ready to dig.' },
  { slug: 'mini-excavators', name: 'Mini Excavators',  icon: 'excavator', sort_order: 2,
    description: 'Compact machines for tight sites, utilities and landscaping.' },
  { slug: 'dozers',          name: 'Dozers',           icon: 'dozer',     sort_order: 3,
    description: 'Crawler dozers for grading, land clearing and site preparation.' },
  { slug: 'wheel-loaders',   name: 'Wheel Loaders',    icon: 'loader',    sort_order: 4,
    description: 'Yard and quarry loaders with high-capacity buckets.' },
  { slug: 'skid-steers',     name: 'Skid Steers',      icon: 'skidsteer', sort_order: 5,
    description: 'Skid steer and compact track loaders with quick-attach couplers.' },
  { slug: 'backhoe-loaders', name: 'Backhoe Loaders',  icon: 'backhoe',   sort_order: 6,
    description: 'Two machines in one — loader up front, backhoe at the rear.' },
  { slug: 'telehandlers',    name: 'Telehandlers',     icon: 'telehand',  sort_order: 7,
    description: 'Telescopic handlers for lifting and placing at height.' },
  { slug: 'tractors',        name: 'Tractors',         icon: 'tractor',   sort_order: 8,
    description: 'Utility and row-crop tractors with loaders and three-point hitches.' },
];

const LISTINGS = [
  {
    slug: '2021-caterpillar-320-hydraulic-excavator',
    emissions_tier: 'T4F / DEF',
    lot_number: 4,
    inspection_grade: 4.6,
    inspected_at: '2026-08-14',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Undercarriage', pct: 85 }, { label: 'Hydraulics', pct: 92 }, { label: 'Engine', pct: 94 }, { label: 'Structure', pct: 88 }],
    included_items: '42" HD bucket · hydraulic quick coupler · Cat Grade with 2D · Payload',
    service_notes: '3,050 hrs — hydraulic oil and filters, engine oil, fuel filters, final drive oil. Records on file.',
    known_faults: 'Minor seep at boom cylinder rod seal. No other defects noted.',
    transport_length: '32\'6"',
    transport_width: '10\'6"',
    transport_height: '10\'2"',
    requires_permit: 1,
    title: '2021 Caterpillar 320 Hydraulic Excavator',
    category: 'excavators',
    year: 2021, make: 'Caterpillar', model: '320',
    hours: 3120, engine_hp: 162, engine_type: 'Cat C4.4 ACERT Turbo Diesel, Tier 4 Final',
    operating_weight: 55100, fuel_type: 'Diesel',
    serial_number: 'CAT0320LKGF08841', stock_number: 'EX-93459',
    buy_now_price: 18450000, starting_bid: 13900000, reserve_price: 15200000,
    bid_increment: 25000, photo: 'excavator',
    featured: true, quantity: 2,
    description:
      '2021 Caterpillar 320 Hydraulic Excavator with 3,120 hours. Powered by a 162 HP ' +
      'Cat C4.4 ACERT diesel with Tier 4 Final emissions and DEF. Fitted with Cat Grade ' +
      'with 2D, Grade Assist and Payload as standard, a 42-inch heavy-duty bucket, and a ' +
      'hydraulic quick coupler. Enclosed cab with heat, air conditioning, heated air-suspension ' +
      'seat and a touchscreen monitor with rear and side-view cameras.\n\n' +
      'Undercarriage measured at approximately 85 percent remaining. Full service completed ' +
      'at 3,050 hours including hydraulic oil and filters, engine oil, fuel filters and final ' +
      'drive oil. Runs and operates as it should with no known faults. A clean, work-ready ' +
      'machine suited to general excavation, trenching, utilities and site preparation.',
    highlights: [
      'Cat Grade with 2D, Grade Assist and Payload',
      'Hydraulic quick coupler with 42" HD bucket',
      'Approximately 85% undercarriage remaining',
      'Full service completed at 3,050 hours',
      'Enclosed cab with heat, A/C and heated suspension seat',
      'Rear and side-view camera system',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '55,100 lbs' },
        { label: 'Max dig depth', value: '21 ft 10 in' },
        { label: 'Max reach at ground', value: '32 ft 6 in' },
        { label: 'Bucket capacity', value: '1.19 yd³' },
        { label: 'Swing speed', value: '11.25 rpm' },
      ] },
      { group: 'Engine & hydraulics', items: [
        { label: 'Engine', value: 'Cat C4.4 ACERT' },
        { label: 'Net power', value: '162 HP @ 1,800 rpm' },
        { label: 'Emissions', value: 'Tier 4 Final (DEF)' },
        { label: 'Hydraulic flow', value: '138 gal/min' },
        { label: 'Fuel capacity', value: '111 gal' },
      ] },
    ],
  },
  {
    slug: '2019-caterpillar-d3k2-lgp-dozer',
    emissions_tier: 'T4F / DEF',
    lot_number: 11,
    inspection_grade: 4.2,
    inspected_at: '2026-08-28',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Undercarriage', pct: 90 }, { label: 'Hydraulics', pct: 86 }, { label: 'Engine', pct: 89 }, { label: 'Blade & edge', pct: 62 }],
    included_items: '124" 6-way power pitch blade · Slope Assist · rear hitch · 25" steel tracks',
    service_notes: 'New pads, rails, rollers, idlers and sprockets at 2,683 hrs. Full records.',
    known_faults: 'Cutting edge at 62% — budget replacement within 300 hours.',
    transport_length: '14\'2"',
    transport_width: '10\'4"',
    transport_height: '9\'7"',
    requires_permit: 0,
    title: '2019 Caterpillar D3K2 LGP Dozer',
    category: 'dozers',
    year: 2019, make: 'Caterpillar', model: 'D3K2 LGP',
    hours: 3122, engine_hp: 80, engine_type: 'Cat C4.4 ACERT Turbo Diesel, Tier 4 Final',
    operating_weight: 17900, fuel_type: 'Diesel',
    serial_number: 'KL207555', stock_number: 'DZ-21514',
    buy_now_price: 8950000, starting_bid: 6400000, reserve_price: 7200000,
    bid_increment: 15000, photo: 'bulldozer',
    featured: true, quantity: 1,
    description:
      '2019 Caterpillar D3K2 LGP Dozer with 3,122 hours. Powered by an 80 HP Cat C4.4 ACERT ' +
      'diesel with Tier 4 Final emissions and DEF. Equipped with Slope Assist, a 124-inch ' +
      '6-way power pitch blade, rear hitch and 25-inch steel tracks.\n\n' +
      'Features an enclosed cab with heat, air conditioning, heated joysticks and an air ' +
      'suspension seat for operator comfort. Approximately 90 percent undercarriage remaining, ' +
      'with new pads, rails, rollers, idlers and sprockets installed at 2,683 hours. Recently ' +
      'serviced, runs and operates well. Clean, well maintained and work-ready — ideal for ' +
      'grading, site preparation, land clearing and general earthmoving.',
    highlights: [
      'Slope Assist blade control',
      '124" 6-way power pitch blade',
      'Approximately 90% undercarriage remaining',
      'New pads, rails, rollers, idlers and sprockets at 2,683 hours',
      'Enclosed cab with heat, A/C and heated joysticks',
      'Rear hitch fitted',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '17,900 lbs' },
        { label: 'Blade width', value: '124 in' },
        { label: 'Blade type', value: '6-way power pitch' },
        { label: 'Track shoe width', value: '25 in' },
        { label: 'Ground pressure', value: '4.1 psi' },
      ] },
    ],
  },
  {
    slug: '2023-bobcat-t66-compact-track-loader',
    emissions_tier: 'Non-DEF',
    lot_number: 7,
    inspection_grade: 4.9,
    inspected_at: '2026-09-02',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Undercarriage', pct: 97 }, { label: 'Hydraulics', pct: 99 }, { label: 'Engine', pct: 99 }, { label: 'Cab & glass', pct: 96 }],
    included_items: '74" construction bucket · hydraulic quick attach · 7" touchscreen · rear camera',
    service_notes: '250 hrs — first service completed by dealer. Still inside factory warranty.',
    known_faults: 'None noted. Cosmetically as-new.',
    transport_length: '11\'3"',
    transport_width: '5\'10"',
    transport_height: '6\'9"',
    requires_permit: 0,
    title: '2023 Bobcat T66 Compact Track Loader',
    category: 'skid-steers',
    year: 2023, make: 'Bobcat', model: 'T66',
    hours: 340, engine_hp: 74, engine_type: 'Bobcat Turbo Diesel, Non-DEF',
    operating_weight: 8900, fuel_type: 'Diesel',
    serial_number: 'B4SB11482', stock_number: 'SS-77120',
    buy_now_price: 6480000, starting_bid: 4900000, reserve_price: null,
    bid_increment: 10000, photo: 'skid steer loader',
    featured: true, quantity: 3,
    description:
      '2023 Bobcat T66 Compact Track Loader with just 340 hours. A low-hour, premium compact ' +
      'track loader with a like-new undercarriage and no cosmetic damage worth noting.\n\n' +
      'Powered by a 74 HP Bobcat turbo diesel with no DEF requirement, which keeps running ' +
      'costs and complexity down. Enclosed ROPS cab with heat and air conditioning, a ' +
      '7-inch touchscreen display with telematics, rearview camera, hydraulic quick attach ' +
      'and LED work lights front and rear. Ideal for construction, landscaping and ' +
      'agricultural work where a compact footprint and low ground pressure matter.',
    highlights: [
      'Only 340 hours — effectively as new',
      'Non-DEF engine, simpler to run',
      'Enclosed ROPS cab with heat and A/C',
      '7" touchscreen display with telematics',
      'Rearview camera and LED work lights',
      'Hydraulic quick attach',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '8,900 lbs' },
        { label: 'Rated operating capacity', value: '2,572 lbs' },
        { label: 'Tipping load', value: '7,000 lbs' },
        { label: 'Lift path', value: 'Vertical' },
        { label: 'Auxiliary flow', value: '23 gal/min' },
      ] },
    ],
  },
  {
    slug: '2019-hitachi-zx30u-5n-mini-excavator',
    emissions_tier: 'Tier 4',
    lot_number: 9,
    inspection_grade: 4.1,
    inspected_at: '2026-08-21',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Rubber tracks', pct: 78 }, { label: 'Hydraulics', pct: 88 }, { label: 'Engine', pct: 90 }, { label: 'Structure', pct: 85 }],
    included_items: '24" digging bucket · hydraulic thumb · blade · open canopy',
    service_notes: 'Serviced every 250 hrs by previous owner. Records available on request.',
    known_faults: 'Rubber tracks at 78% — serviceable, expect replacement within 500 hours.',
    transport_length: '15\'1"',
    transport_width: '5\'1"',
    transport_height: '8\'2"',
    requires_permit: 0,
    title: '2019 Hitachi ZX30U-5N Mini Excavator',
    category: 'mini-excavators',
    year: 2019, make: 'Hitachi', model: 'ZX30U-5N',
    hours: 2410, engine_hp: 28, engine_type: 'Yanmar 3TNV88 Diesel',
    operating_weight: 7050, fuel_type: 'Diesel',
    serial_number: 'HCM3U800L00042118', stock_number: 'MX-40817',
    buy_now_price: 3980000, starting_bid: 2850000, reserve_price: 3200000,
    bid_increment: 7500, photo: 'mini excavator',
    featured: false, quantity: 1,
    description:
      '2019 Hitachi ZX30U-5N Mini Excavator with 2,410 hours. A reduced tail-swing machine ' +
      'that works comfortably alongside walls and in confined sites. Powered by a 28 HP ' +
      'Yanmar 3TNV88 diesel.\n\n' +
      'Fitted with rubber tracks in good condition, a hydraulic thumb, blade, and a 24-inch ' +
      'digging bucket. Open canopy with a suspension seat. Regularly serviced with records ' +
      'available. Hydraulics are tight with no drift. A dependable, easy-to-transport machine ' +
      'for utilities, landscaping and general contracting.',
    highlights: [
      'Reduced tail swing for confined sites',
      'Hydraulic thumb fitted',
      'Rubber tracks in good condition',
      '24" digging bucket included',
      'Blade fitted',
      'Service records available',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '7,050 lbs' },
        { label: 'Max dig depth', value: '10 ft 2 in' },
        { label: 'Max reach', value: '16 ft 5 in' },
        { label: 'Bucket width', value: '24 in' },
        { label: 'Track type', value: 'Rubber' },
      ] },
    ],
  },
  {
    slug: '2021-john-deere-333g-compact-track-loader',
    emissions_tier: 'T4F / DEF',
    lot_number: 6,
    inspection_grade: 4.4,
    inspected_at: '2026-08-19',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Undercarriage', pct: 70 }, { label: 'Hydraulics', pct: 94 }, { label: 'Engine', pct: 92 }, { label: 'Cab & glass', pct: 90 }],
    included_items: '78" construction bucket · hydraulic quick attach · high-flow auxiliary · rear camera',
    service_notes: 'Serviced at 1,600 hrs — oil, filters, hydraulic fluid. Full dealer history.',
    known_faults: 'Undercarriage at 70%. No leaks or structural damage found.',
    transport_length: '12\'2"',
    transport_width: '6\'8"',
    transport_height: '6\'11"',
    requires_permit: 0,
    title: '2021 John Deere 333G Compact Track Loader',
    category: 'skid-steers',
    year: 2021, make: 'John Deere', model: '333G',
    hours: 1685, engine_hp: 100, engine_type: 'John Deere PowerTech 3.4L Diesel',
    operating_weight: 11600, fuel_type: 'Diesel',
    serial_number: '1T0333GMLMF391442', stock_number: 'SS-55201',
    buy_now_price: 7420000, starting_bid: 5600000, reserve_price: 6300000,
    bid_increment: 12500, photo: 'track loader construction',
    featured: true, quantity: 1,
    description:
      '2021 John Deere 333G Compact Track Loader with 1,685 hours. The largest machine in ' +
      'the Deere CTL range and one of the most capable compact loaders on the market, with ' +
      'a 100 HP PowerTech diesel and high-flow auxiliary hydraulics.\n\n' +
      'Sealed and pressurised cab with heat and air conditioning, EH joystick controls with ' +
      'selectable ISO/H patterns, and a rearview camera. Undercarriage at approximately ' +
      '70 percent. Fitted with a 78-inch construction bucket and hydraulic quick attach. ' +
      'A strong, high-output machine for heavy grading, mulching and attachment work.',
    highlights: [
      'High-flow auxiliary hydraulics',
      'Sealed and pressurised cab with heat and A/C',
      'EH controls with selectable ISO/H patterns',
      'Approximately 70% undercarriage remaining',
      '78" construction bucket included',
      'Rearview camera',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '11,600 lbs' },
        { label: 'Rated operating capacity', value: '3,700 lbs' },
        { label: 'High-flow auxiliary', value: '40 gal/min' },
        { label: 'Lift path', value: 'Vertical' },
      ] },
    ],
  },
  {
    slug: '2018-caterpillar-315f-lcr-excavator',
    emissions_tier: 'Tier 4 Final',
    lot_number: 12,
    inspection_grade: 3.9,
    inspected_at: '2026-08-25',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Undercarriage', pct: 60 }, { label: 'Hydraulics', pct: 84 }, { label: 'Engine', pct: 87 }, { label: 'Structure', pct: 82 }],
    included_items: '36" digging bucket · hydraulic thumb · quick coupler',
    service_notes: 'Last full service at 5,100 hrs. Hydraulics tested and holding, no drift.',
    known_faults: 'Undercarriage at 60% — factor replacement into your bid. Cosmetic boom scuffing.',
    transport_length: '27\'9"',
    transport_width: '8\'2"',
    transport_height: '9\'6"',
    requires_permit: 0,
    title: '2018 Caterpillar 315F LCR Excavator',
    category: 'excavators',
    year: 2018, make: 'Caterpillar', model: '315F LCR',
    hours: 5240, engine_hp: 96, engine_type: 'Cat C4.4 ACERT Turbo Diesel',
    operating_weight: 35800, fuel_type: 'Diesel',
    serial_number: 'CAT0315FTNCF01923', stock_number: 'EX-88402',
    buy_now_price: 9750000, starting_bid: 7100000, reserve_price: 8000000,
    bid_increment: 15000, photo: 'excavator construction site',
    featured: false, quantity: 1,
    description:
      '2018 Caterpillar 315F LCR Excavator with 5,240 hours. A reduced-radius machine that ' +
      'works well on roadside and confined urban jobs where a conventional tail swing gets ' +
      'in the way.\n\n' +
      'Powered by a 96 HP Cat C4.4 ACERT diesel. Fitted with a hydraulic thumb, 36-inch ' +
      'digging bucket and quick coupler. Enclosed cab with heat and air conditioning. ' +
      'Undercarriage at approximately 60 percent. Hydraulics tested and holding with no ' +
      'drift. Honest hours and a solid work history.',
    highlights: [
      'Reduced-radius tail swing',
      'Hydraulic thumb and quick coupler',
      '36" digging bucket included',
      'Approximately 60% undercarriage remaining',
      'Enclosed cab with heat and A/C',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '35,800 lbs' },
        { label: 'Max dig depth', value: '19 ft 1 in' },
        { label: 'Max reach', value: '27 ft 9 in' },
        { label: 'Bucket capacity', value: '0.85 yd³' },
      ] },
    ],
  },
  {
    slug: '2020-caterpillar-236d3-skid-steer-loader',
    emissions_tier: 'Tier 4 Final',
    lot_number: 8,
    inspection_grade: 4.3,
    inspected_at: '2026-08-30',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Tyres', pct: 70 }, { label: 'Hydraulics', pct: 91 }, { label: 'Engine', pct: 93 }, { label: 'Cab & glass', pct: 89 }],
    included_items: '72" dirt bucket · hydraulic quick coupler · two-speed travel',
    service_notes: 'Serviced at 2,800 hrs. Runs and operates correctly with no warning lights.',
    known_faults: 'Tyres at 70%. No other defects noted.',
    transport_length: '11\'6"',
    transport_width: '5\'10"',
    transport_height: '6\'6"',
    requires_permit: 0,
    title: '2020 Caterpillar 236D3 Skid Steer Loader',
    category: 'skid-steers',
    year: 2020, make: 'Caterpillar', model: '236D3',
    hours: 2890, engine_hp: 74, engine_type: 'Cat C3.3B Turbo Diesel',
    operating_weight: 7200, fuel_type: 'Diesel',
    serial_number: 'CAT0236DKGR902117', stock_number: 'SS-31908',
    buy_now_price: 4180000, starting_bid: 3100000, reserve_price: null,
    bid_increment: 7500, photo: 'skid steer',
    featured: false, quantity: 2,
    description:
      '2020 Caterpillar 236D3 Skid Steer Loader with 2,890 hours. A radial-lift wheeled skid ' +
      'steer that is quick on hard surfaces and easy to float between sites.\n\n' +
      'Powered by a 74 HP Cat C3.3B turbo diesel. Enclosed cab with heat and air conditioning, ' +
      'two-speed travel and a hydraulic quick coupler. Tyres at approximately 70 percent. ' +
      'Comes with a 72-inch dirt bucket. Serviced and ready to work.',
    highlights: [
      'Radial lift path',
      'Two-speed travel',
      'Enclosed cab with heat and A/C',
      'Hydraulic quick coupler',
      '72" dirt bucket included',
      'Tyres at approximately 70%',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '7,200 lbs' },
        { label: 'Rated operating capacity', value: '1,800 lbs' },
        { label: 'Auxiliary flow', value: '20 gal/min' },
        { label: 'Lift path', value: 'Radial' },
      ] },
    ],
  },
  {
    slug: '2018-new-holland-b95c-backhoe-loader',
    emissions_tier: 'T4F / DEF',
    lot_number: 10,
    inspection_grade: 4.0,
    inspected_at: '2026-08-23',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Tyres', pct: 65 }, { label: 'Hydraulics', pct: 85 }, { label: 'Engine', pct: 88 }, { label: 'Structure', pct: 84 }],
    included_items: '24" rear bucket · front loader bucket · extendable dipper · hydraulic thumb',
    service_notes: 'Serviced at 4,500 hrs — engine oil, filters, transmission fluid.',
    known_faults: 'Tyres at 65%. Loader arm pins show normal wear for hours.',
    transport_length: '23\'4"',
    transport_width: '7\'6"',
    transport_height: '9\'4"',
    requires_permit: 0,
    title: '2018 New Holland B95C Backhoe Loader',
    category: 'backhoe-loaders',
    year: 2018, make: 'New Holland', model: 'B95C',
    hours: 4630, engine_hp: 97, engine_type: 'FPT Turbo Diesel, Tier 4 Final',
    operating_weight: 16800, fuel_type: 'Diesel',
    serial_number: 'NEHB95CTKHF08812', stock_number: 'BH-62740',
    buy_now_price: 5240000, starting_bid: 3900000, reserve_price: 4400000,
    bid_increment: 10000, photo: 'backhoe loader',
    featured: false, quantity: 1,
    description:
      '2018 New Holland B95C Backhoe Loader with 4,630 hours. A genuinely versatile machine ' +
      'that loads, digs and travels between sites under its own power.\n\n' +
      'Powered by a 97 HP FPT turbo diesel with Tier 4 Final emissions. Four-wheel drive with ' +
      'an extendable dipper, hydraulic thumb and a 24-inch rear bucket. Enclosed cab with ' +
      'heat and air conditioning. Front loader bucket included. Tyres at approximately ' +
      '65 percent. A dependable all-rounder for utilities, municipal work and general ' +
      'contracting.',
    highlights: [
      'Four-wheel drive',
      'Extendable dipper (extendahoe)',
      'Hydraulic thumb fitted',
      '24" rear bucket and front loader bucket included',
      'Enclosed cab with heat and A/C',
      'Road-legal — travels between sites',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '16,800 lbs' },
        { label: 'Max dig depth', value: '18 ft 4 in (extended)' },
        { label: 'Loader capacity', value: '1.3 yd³' },
        { label: 'Drive', value: '4WD' },
      ] },
    ],
  },
  {
    slug: '2019-caterpillar-tl642d-telehandler',
    emissions_tier: 'Tier 4 Final',
    lot_number: 5,
    inspection_grade: 4.2,
    inspected_at: '2026-08-27',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Tyres', pct: 75 }, { label: 'Boom & wear pads', pct: 82 }, { label: 'Hydraulics', pct: 88 }, { label: 'Engine', pct: 90 }],
    included_items: 'Carriage and forks · frame levelling · three steering modes',
    service_notes: 'Serviced at 3,900 hrs. Boom and hydraulics tested and holding.',
    known_faults: 'Boom wear pads at 82% — routine replacement item.',
    transport_length: '21\'6"',
    transport_width: '8\'0"',
    transport_height: '8\'2"',
    requires_permit: 0,
    title: '2019 Caterpillar TL642D Telehandler',
    category: 'telehandlers',
    year: 2019, make: 'Caterpillar', model: 'TL642D',
    hours: 3980, engine_hp: 74, engine_type: 'Cat C3.8 Turbo Diesel',
    operating_weight: 22400, fuel_type: 'Diesel',
    serial_number: 'CAT0TL64ETBL01477', stock_number: 'TH-19055',
    buy_now_price: 6890000, starting_bid: 5000000, reserve_price: 5700000,
    bid_increment: 12500, photo: 'telehandler',
    featured: false, quantity: 1,
    description:
      '2019 Caterpillar TL642D Telehandler with 3,980 hours. A 6,600 lb capacity machine ' +
      'reaching 42 feet — the standard workhorse for framing, masonry and general ' +
      'construction lifting.\n\n' +
      'Powered by a 74 HP Cat C3.8 turbo diesel. Four-wheel drive with three steering modes ' +
      'and frame levelling. Enclosed cab with heat. Fitted with carriage and forks. Tyres at ' +
      'approximately 75 percent. Boom and hydraulics tested and holding.',
    highlights: [
      '6,600 lb capacity, 42 ft reach',
      'Three steering modes including crab steer',
      'Frame levelling',
      'Carriage and forks included',
      'Enclosed cab with heat',
      'Tyres at approximately 75%',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Max lift capacity', value: '6,600 lbs' },
        { label: 'Max lift height', value: '42 ft' },
        { label: 'Max forward reach', value: '29 ft 6 in' },
        { label: 'Drive', value: '4WD, 3 steering modes' },
      ] },
    ],
  },
  {
    slug: '2020-john-deere-544l-wheel-loader',
    emissions_tier: 'T4F / DEF',
    lot_number: 2,
    inspection_grade: 4.3,
    inspected_at: '2026-08-18',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Tyres', pct: 60 }, { label: 'Hydraulics', pct: 90 }, { label: 'Engine', pct: 92 }, { label: 'Structure', pct: 87 }],
    included_items: '3.0 yd³ GP bucket with bolt-on edge · ride control · differential lock',
    service_notes: 'Serviced at 4,050 hrs — oil, filters, axle oil. Records on file.',
    known_faults: 'Tyres at 60% — the main cost item to plan for. Machine otherwise sound.',
    transport_length: '24\'3"',
    transport_width: '8\'6"',
    transport_height: '10\'8"',
    requires_permit: 0,
    title: '2020 John Deere 544L Wheel Loader',
    category: 'wheel-loaders',
    year: 2020, make: 'John Deere', model: '544L',
    hours: 4120, engine_hp: 161, engine_type: 'John Deere PowerTech 6.8L Diesel',
    operating_weight: 30900, fuel_type: 'Diesel',
    serial_number: '1DW544LXPLF702318', stock_number: 'WL-70318',
    buy_now_price: 14200000, starting_bid: 10500000, reserve_price: 11800000,
    bid_increment: 25000, photo: 'wheel loader',
    featured: false, quantity: 1,
    description:
      '2020 John Deere 544L Wheel Loader with 4,120 hours. A 3-yard yard loader that handles ' +
      'aggregate, snow and general material work without complaint.\n\n' +
      'Powered by a 161 HP PowerTech diesel. Fitted with a 3.0 yd³ general-purpose bucket ' +
      'with bolt-on cutting edge, ride control and a differential lock. Enclosed cab with ' +
      'heat, air conditioning and a heated air-suspension seat. Tyres at approximately ' +
      '60 percent. Serviced at 4,050 hours.',
    highlights: [
      '3.0 yd³ general-purpose bucket',
      'Ride control fitted',
      'Differential lock',
      'Heated air-suspension seat',
      'Serviced at 4,050 hours',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '30,900 lbs' },
        { label: 'Bucket capacity', value: '3.0 yd³' },
        { label: 'Breakout force', value: '22,900 lbf' },
        { label: 'Full turn tipping load', value: '20,100 lbs' },
      ] },
    ],
  },
  {
    slug: '2019-bobcat-e42-mini-excavator',
    emissions_tier: 'Tier 4',
    lot_number: 3,
    inspection_grade: 4.4,
    inspected_at: '2026-09-01',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Rubber tracks', pct: 80 }, { label: 'Hydraulics', pct: 92 }, { label: 'Engine', pct: 91 }, { label: 'Structure', pct: 88 }],
    included_items: '18" and 36" buckets · hydraulic X-Change coupler · angle blade · secondary auxiliary',
    service_notes: 'Serviced on schedule. Hydraulics tested, no drift or leaks.',
    known_faults: 'None noted beyond normal wear for hours.',
    transport_length: '17\'9"',
    transport_width: '6\'6"',
    transport_height: '8\'2"',
    requires_permit: 0,
    title: '2019 Bobcat E42 Mini Excavator',
    category: 'mini-excavators',
    year: 2019, make: 'Bobcat', model: 'E42',
    hours: 2760, engine_hp: 42, engine_type: 'Bobcat D24 Diesel',
    operating_weight: 9600, fuel_type: 'Diesel',
    serial_number: 'B4778112204', stock_number: 'MX-52117',
    buy_now_price: 4490000, starting_bid: 3300000, reserve_price: null,
    bid_increment: 7500, photo: 'compact excavator',
    featured: false, quantity: 2,
    description:
      '2019 Bobcat E42 Mini Excavator with 2,760 hours. A 4.2-tonne zero-house-swing machine ' +
      'that is easy to float and comfortable to run all day.\n\n' +
      'Powered by a 42 HP Bobcat D24 diesel. Enclosed cab with heat and air conditioning, ' +
      'hydraulic X-Change coupler, angle blade and auxiliary hydraulics with a second ' +
      'auxiliary line. Rubber tracks at approximately 80 percent. Comes with an 18-inch and ' +
      'a 36-inch bucket.',
    highlights: [
      'Zero house swing',
      'Enclosed cab with heat and A/C',
      'Hydraulic X-Change coupler',
      'Secondary auxiliary hydraulics',
      '18" and 36" buckets included',
      'Rubber tracks at approximately 80%',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Operating weight', value: '9,600 lbs' },
        { label: 'Max dig depth', value: '10 ft 8 in' },
        { label: 'Max reach', value: '17 ft 9 in' },
        { label: 'Auxiliary flow', value: '17 gal/min' },
      ] },
    ],
  },
  {
    slug: '2022-kubota-m7060-utility-tractor',
    emissions_tier: 'Tier 4 Final',
    lot_number: 1,
    inspection_grade: 4.7,
    inspected_at: '2026-08-31',
    inspected_by: 'Dale Whitmore',
    condition_scores: [{ label: 'Tyres', pct: 85 }, { label: 'Hydraulics', pct: 95 }, { label: 'Engine', pct: 96 }, { label: 'Cab & glass', pct: 93 }],
    included_items: 'LA1154 front loader with quick-attach bucket · 540/540E PTO · Cat II three-point hitch',
    service_notes: 'Serviced at 1,100 hrs by dealer. Complete service history.',
    known_faults: 'None noted. Well maintained throughout.',
    transport_length: '13\'9"',
    transport_width: '6\'4"',
    transport_height: '8\'5"',
    requires_permit: 0,
    title: '2022 Kubota M7060 Utility Tractor',
    category: 'tractors',
    year: 2022, make: 'Kubota', model: 'M7060',
    hours: 1240, engine_hp: 71, engine_type: 'Kubota V3307 Turbo Diesel',
    operating_weight: 6900, fuel_type: 'Diesel',
    serial_number: 'KBUM7060LNJC10228', stock_number: 'TR-44190',
    buy_now_price: 5680000, starting_bid: 4200000, reserve_price: 4700000,
    bid_increment: 10000, photo: 'tractor farm',
    featured: false, quantity: 1,
    description:
      '2022 Kubota M7060 Utility Tractor with 1,240 hours. A 71 HP four-wheel-drive tractor ' +
      'with a front loader — the size most operations actually need.\n\n' +
      'Powered by a Kubota V3307 turbo diesel. Fitted with an LA1154 front loader with ' +
      'quick-attach bucket, 8-speed transmission with hydraulic shuttle, 540/540E PTO and a ' +
      'category II three-point hitch. Enclosed cab with heat and air conditioning. Tyres at ' +
      'approximately 85 percent. Well maintained with service records.',
    highlights: [
      'LA1154 front loader with quick-attach bucket',
      'Four-wheel drive',
      '8-speed transmission with hydraulic shuttle',
      '540/540E PTO',
      'Category II three-point hitch',
      'Enclosed cab with heat and A/C',
    ],
    specs: [
      { group: 'Operating specifications', items: [
        { label: 'Engine power', value: '71 HP' },
        { label: 'PTO power', value: '59 HP' },
        { label: 'Transmission', value: '8F/8R with shuttle' },
        { label: 'Hitch category', value: 'II' },
        { label: 'Drive', value: '4WD' },
      ] },
    ],
  },
];

module.exports = { CATEGORIES, LISTINGS };
