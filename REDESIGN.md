# Dealership and auction redesign

Branch: `codex/design-refresh`.

This replaces the initial brochure template with an auction marketplace. IronLot uses navy, steel blue and amber; AutoBlock uses graphite and red. Both use original vector brand marks, locally served Manrope and Inter variable fonts, and licensed real photography. No generative images or lettering are used.

The homepage uses a substantial white masthead, a separate navigation bar and a photographic hero with two featured inventory cards. The visual direction draws on the user’s Baughman dealership reference without copying its branding or content. Eight auction cards show bid amounts, counts, time remaining, specifications, watchlist links and direct links into the existing bidding flow. Ending-today, no-reserve and most-bids controls filter/sort the visible selection. Full inventory search remains server-rendered. The same card template is used in inventory.

`public/js/marketplace.js` polls the existing `/api/lots/state` endpoint every 15 seconds while the page is visible, updates prices/counts/deadlines/status, and highlights actual price changes. A timestamp indicates the last successful update; a failed request produces a paused status. Requests have an 8-second timeout. No simulated bids, viewer counts or scarcity messages are introduced. Motion respects reduced-motion preferences.

The expanded homepage includes an illustrated brand story, purchasing steps, delivery planning and native expandable FAQs. A mileage calculator uses the existing brand configuration’s per-mile rate and clearly identifies its output as an estimate.

## Assets

Campaign images come from Unsplash: EESOFUFFZICH for equipment and Jakob Rosen for automotive. They are cropped and encoded as WebP. These are brand images, not photographs of featured auction lots. Existing Commons catalogue images remain representative. `/photo-credits` and `public/uploads/listings/CREDITS.json` expose source/author/licence information. The equipment catalogue’s 315F photo order was adjusted to lead with a clear excavator photo. Font licences are stored in `public/fonts`.

## Validation and operation

`npm test` uses a temporary SQLite copy for route, catalogue and live-state API checks. Browser review covers 390/768/1440px, home/inventory/registration/item pages, navigation, filtering, price updates and search. Runtime auction data in the local preview remains the repository’s demo catalogue.

Use Node 20+ and `npm ci`, then `npm start` with your development database configuration. Existing bidding, KYC, agreement and mail services are retained. These checks do not establish production payment, SMTP or deployment readiness. Never replace an existing live database with the demo database.
