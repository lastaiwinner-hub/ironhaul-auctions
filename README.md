# IronHaul Auctions

Online auction and instant-buy platform for excavators and heavy equipment.
Identity-verified bidding, live auctions with anti-sniping, and purchase
agreements that are generated, emailed and electronically signed automatically.

Its sister project, **AutoBlock Auctions** (`../autoblock-auctions`), is the same
engine adapted for cars, trucks, SUVs and motorcycles.

---

## Quick start

```bash
npm install
cp .env.example .env          # then set SESSION_SECRET (see below)
npm run setup                 # migrate + download seed photos + seed data
npm start
```

Open <http://localhost:3010>.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@ironhaul-auctions.com` | `ChangeMe!2026` |
| Verified buyer | `buyer@example.com` | `DemoBuyer!2026` |

**Change both passwords before this is reachable from the internet.**

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## What it does

### Buying flow

1. **Register** — free, under a minute, no card.
2. **Confirm email** — link expires in 48 hours.
3. **Verify identity** — upload ID front, ID back and a selfie. An administrator
   approves or rejects with a reason. Bidding stays locked until approved.
4. **Bid** — with an optional maximum (proxy) bid. A bid in the final 2 minutes
   extends the auction by 2 minutes.
5. **Sign** — the purchase agreement is generated the moment a bid lands,
   pre-filled with the buyer's name, address, the machine's serial and stock
   numbers, and the bid amount. Signed electronically under ESIGN/UETA with a
   full audit trail.
6. **Pay & receive** — invoice with wire instructions, then delivery tracking.

Buy Now runs the same paperwork without the auction.

### The agreement automation

This is the part most auction software leaves manual. Controlled from
**Admin → Settings → Agreement automation**:

| Setting | Behaviour |
|---|---|
| `on_bid` *(default)* | Every bid generates and emails a ready-to-sign contract |
| `on_win` | Only the winning bidder receives one |
| `never` | Auctions issue nothing; Buy Now still always does |

Re-bidding **refreshes** the buyer's existing open agreement rather than issuing
a second one — enforced by a partial unique index, not just application logic.

### Stock stays on sale after a win

`keep_selling` (per listing, on by default) means closing an auction declares a
winner *and* immediately opens a fresh cycle on the same listing. Bid history is
preserved per cycle, so each cycle has its own winner and its own contract.

---

## Design language

The two projects deliberately share **no visual DNA**. They run the same engine,
but the design systems are separate on purpose — do not refactor them back
together.

| | IronHaul (equipment) | AutoBlock (automotive) |
|---|---|---|
| Character | High-vis industrial | Editorial showroom |
| Canvas | White / warm concrete | Warm bone |
| Accent | Safety amber + electric orange | Electric blue → violet gradient |
| Surfaces | 2px black outline + hard offset shadow | Borderless + soft layered shadow |
| Corners | 3px | 18–26px |
| Display type | Saira Condensed, uppercase | Instrument Serif, sentence case |
| Figures | IBM Plex Mono (instrumentation) | Proportional, large |
| Listings | Dense manifest **rows** with a data plate | Large photo **cards** + a feature band |
| Nav | Hard-edged tabs locked to a rule | Floating pill group |
| Motion | Snap, hard translate | Ease, lift and scale |
| Signature | Hazard stripes, live ticker | Gradient wash, glass overlays |

Both are light and high-energy; neither uses a dark theme.

---

## Architecture

```
config/
  brand.js          ← EDIT THIS TO REBRAND — names, addresses, colours, terms
  index.js          env + paths
  database.js       SQLite connection, WAL, migrations
db/
  schema.sql        full schema (money in integer cents, timestamps ISO-8601 UTC)
  catalog.js        seed inventory
  fetch-images.js   downloads freely-licensed seed photography
src/
  models/           users, listings, orders, settings
  services/
    auctionEngine.js    transactional bidding, proxy bids, cycle close/relist
    biddingService.js   orchestration: bid → agreement → emails → order
    agreementService.js issue, send, view, sign, void
    pdfService.js       agreement + invoice PDF generation
    mailer.js           SMTP, or .eml files when SMTP is absent
    scheduler.js        cron: close auctions, prune sessions, daily digest
  routes/           public, auth, account, listings, bidding, sign, admin, api
  views/            EJS templates
```

**Design rule:** `auctionEngine` is purely transactional — no email, no file I/O.
Everything with a side effect lives in `biddingService`, so a slow SMTP server
can never hold a database write open or lose a bid.

### Money and time

- All amounts are **integer cents**. `src/services/money.js` is the only place
  that converts to and from decimals.
- All timestamps are **ISO-8601 UTC strings**.

---

## Configuration

Everything user-visible comes from **`config/brand.js`**: trading name, legal
entity, addresses, phone numbers, signing officer, colours, fonts, inspection
window, warranty length, delivery rate and auction mechanics. Change a value
once and it propagates to the website, the emails and the generated PDFs.

Restart the app after editing it.

Operational settings that change without a deploy live in
**Admin → Settings**: agreement trigger, KYC gates, and bank wire details.

---

## Email

Without `SMTP_HOST`, every message is still rendered, logged and written to
`logs/mail/*.eml`. Open one in any mail client to see exactly what a buyer would
receive. Nothing silently no-ops, and the whole flow is testable with no
credentials.

With SMTP configured, delivery is recorded in `email_log` and visible at
**Admin → Email log**.

Templates live in `src/services/emailTemplates.js`:

`welcome` · `passwordReset` · `kycSubmitted` · `kycApproved` · `kycRejected` ·
`bidPlaced` · `outbid` · `auctionWon` · `auctionLost` · `buyNowReceived` ·
`agreementRequest` · `agreementSigned` · `invoice` · `orderShipped` ·
`contactReceipt` · `adminAlert`

---

## Security

- Passwords hashed with bcrypt (12 rounds).
- Sessions in SQLite, `httpOnly` + `sameSite=lax`, `secure` in production, and
  the session ID is rotated on login.
- CSRF on every state-changing request. Multipart uploads are checked *after*
  multer parses the body, with `assertCsrfChecked` failing closed if a route
  forgets.
- Rate limits on auth, bidding, contact and signing.
- **KYC documents and agreement PDFs live in `data/`, outside the web root**,
  and are only reachable through an authorising route handler.
- Uploaded images are re-encoded through sharp, which strips EXIF — including
  the GPS coordinates a phone puts in a selfie.
- Helmet CSP; `X-Content-Type-Options: nosniff` on user content.
- `SESSION_SECRET` under 32 characters refuses to boot in production.

---

## Operations

```bash
npm start            # production
npm run dev          # auto-reload
npm run migrate      # apply schema (idempotent)
npm run seed         # categories, listings, photos, admin, demo buyer
npm run seed:images  # re-download seed photography
npm run setup        # migrate + seed:images + seed
npm run reset        # DELETE the database and rebuild  ← destructive
```

Stop the server before `npm run reset` — Windows will not delete a database file
that is still open.

Health check: `GET /healthz`.

### Background jobs

`node-cron`, started with the app:

| Schedule | Job |
|---|---|
| every minute | close ended auctions, declare winners, email, relist |
| hourly | prune expired sessions |
| 07:00 daily | log unsigned agreements, failed emails, KYC backlog |

If you ever run more than one app process, set `SCHEDULER_ENABLED=false` on all
but one, or auctions will be settled twice.

---

## Seed photography

`npm run seed:images` pulls freely-licensed photographs from Wikimedia Commons
and records the author and licence of every file in
`public/uploads/listings/CREDITS.json`.

**Licences vary per file.** Review that file and comply with its attribution
terms, or replace the images with your own photography before trading. Upload
your own through **Admin → Inventory → Edit → Photos**.

---

## Before going live

- [ ] Replace `config/brand.js` with your real trading details
- [ ] Change the admin and demo passwords; delete `buyer@example.com`
- [ ] Set a strong `SESSION_SECRET` and `BASE_URL` (signing links depend on it)
- [ ] Configure SMTP with SPF, DKIM and DMARC on your sending domain
- [ ] Enter real bank details in Admin → Settings
- [ ] Replace the seed catalogue and photography with your own stock
- [ ] Have a lawyer in your operating state review `src/content/terms.js`,
      `src/content/privacy.js` and the agreement in `src/services/pdfService.js`
- [ ] Set `TRUST_PROXY=1` behind nginx or Caddy

See **DEPLOYMENT.md** for the VPS setup.
