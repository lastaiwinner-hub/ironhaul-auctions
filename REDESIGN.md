# Website redesign

Review branch: `codex/design-refresh`.

The public design keeps the existing brand and Express/EJS application. The homepage now has an editorial photo hero, catalogue search, category navigation, six auction cards, buying process, FAQs and the existing alert form. Shared styling improves inventory, item details and account entry pages. Mobile navigation supports Escape and restores focus.

IronLot uses Barlow Condensed/Barlow, warm paper, burnt orange and the existing blueprint blue. AutoBlock uses a Georgia editorial headline, Archivo interface type, forest green, cream and rust. These are real typefaces; no generated lettering or AI images are used.

## Photography

The hero is an optimized WebP made from an existing Wikimedia Commons photograph. `public/img/hero-source.txt` identifies the original catalogue file; `public/uploads/listings/CREDITS.json` records its creator and licence. The public `/photo-credits` route exposes attribution for every catalogue image. Existing source photographs remain available. Images can depict different models or years and are labelled as representative; replace them with actual inventory photography before offering those specific items for sale.

## Validation

`npm test` runs four integration tests against a disposable SQLite copy, covering public/auth page rendering, listing and filter routes, photo assets/credits and an empty catalogue. Local browser checks cover 390, 768 and 1440px viewports, navigation, search, listing details and JavaScript errors.

Run with Node 20+ using `npm ci`, then `npm start` against your configured development database. For a local catalogue preview, copy `db/demo.sqlite` into the configured `DATABASE_FILE`; do not overwrite an existing database. The existing mail, bidding, verification and agreement services are retained. SMTP delivery, live payments and production deployment are outside these design checks.
