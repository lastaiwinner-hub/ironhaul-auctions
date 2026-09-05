-- ===========================================================================
--  IronHaul Auctions -- database schema
--  All monetary amounts are stored as INTEGER cents to avoid float drift.
--  All timestamps are ISO-8601 UTC strings (e.g. 2026-09-01T14:03:22.000Z).
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------------
-- Users & identity verification
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  email                TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT    NOT NULL,
  full_name            TEXT    NOT NULL,
  phone                TEXT,
  company              TEXT,

  address_line1        TEXT,
  address_line2        TEXT,
  city                 TEXT,
  state                TEXT,
  postal_code          TEXT,
  country              TEXT    NOT NULL DEFAULT 'United States',

  role                 TEXT    NOT NULL DEFAULT 'buyer'
                               CHECK (role IN ('buyer','admin')),
  status               TEXT    NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','suspended','closed')),

  email_verified       INTEGER NOT NULL DEFAULT 0,
  email_verify_token   TEXT,
  email_verify_expires TEXT,

  reset_token          TEXT,
  reset_expires        TEXT,

  -- Identity verification (KYC). A buyer must reach 'approved' before the
  -- bidding and buy-now actions unlock.
  kyc_status           TEXT    NOT NULL DEFAULT 'none'
                               CHECK (kyc_status IN ('none','pending','approved','rejected')),
  kyc_rejection_reason TEXT,
  kyc_submitted_at     TEXT,
  kyc_reviewed_at      TEXT,
  kyc_reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,

  bid_limit            INTEGER,             -- cents; NULL = no cap
  notes                TEXT,                -- internal, admin-only

  last_login_at        TEXT,
  last_login_ip        TEXT,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_users_kyc     ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_verify  ON users(email_verify_token);
CREATE INDEX IF NOT EXISTS idx_users_reset   ON users(reset_token);

-- Three documents are required: government ID front, ID back and a selfie.
CREATE TABLE IF NOT EXISTS kyc_documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type      TEXT    NOT NULL
                        CHECK (doc_type IN ('id_front','id_back','selfie','proof_of_address')),
  file_name     TEXT    NOT NULL,      -- stored name, relative to data/kyc
  original_name TEXT,
  mime_type     TEXT,
  size_bytes    INTEGER,
  uploaded_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_documents(user_id);

-- --------------------------------------------------------------------------
-- Catalogue
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,
  title           TEXT    NOT NULL,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,

  year            INTEGER,
  make            TEXT,
  model           TEXT,
  condition       TEXT    NOT NULL DEFAULT 'used'
                          CHECK (condition IN ('new','used','certified')),

  -- Heavy-equipment identity fields
  hours            INTEGER,
  serial_number    TEXT,
  engine_hp        INTEGER,
  engine_type      TEXT,
  operating_weight INTEGER,          -- lbs
  fuel_type        TEXT,
  emissions_tier   TEXT,             -- e.g. "T4F / DEF", "Non-DEF"
  stock_number     TEXT,
  lot_number       INTEGER,          -- catalogue position within the sale

  -- Condition report. Used equipment sells on evidence, so these carry the
  -- same weight as price: a buyer commits six figures on them alone.
  inspection_grade REAL,             -- 0.0-5.0 overall
  inspected_at     TEXT,             -- ISO date of inspection
  inspected_by     TEXT,             -- name of the inspector
  condition_scores TEXT,             -- JSON [{label, pct}] wear meters
  included_items   TEXT,             -- attachments and options in the sale
  service_notes    TEXT,             -- what was done, at what hours
  known_faults     TEXT,             -- disclosed defects, stated plainly
  lien_status      TEXT DEFAULT 'Title clear, no liens',

  -- Transport figures, needed to book a lowboy before bidding
  transport_length TEXT,
  transport_width  TEXT,
  transport_height TEXT,
  requires_permit  INTEGER NOT NULL DEFAULT 0,

  description     TEXT,
  highlights      TEXT,              -- JSON array of strings
  specs           TEXT,              -- JSON [{group, items:[{label,value}]}]

  location_city   TEXT,
  location_state  TEXT,
  location_zip    TEXT,

  -- Pricing, in cents
  buy_now_price   INTEGER NOT NULL,
  starting_bid    INTEGER NOT NULL,
  reserve_price   INTEGER,           -- NULL = no reserve
  bid_increment   INTEGER NOT NULL DEFAULT 10000,

  -- Denormalised live state, kept in step by the auction engine
  current_bid     INTEGER NOT NULL DEFAULT 0,
  bid_count       INTEGER NOT NULL DEFAULT 0,
  high_bidder_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,

  auction_starts_at TEXT,
  auction_ends_at   TEXT,

  status          TEXT    NOT NULL DEFAULT 'live'
                          CHECK (status IN ('draft','live','ended','sold','archived')),

  -- The operator keeps selling the same machine after a cycle is won: stock
  -- is decremented on a completed sale, and a new cycle opens automatically.
  quantity        INTEGER NOT NULL DEFAULT 1,
  keep_selling    INTEGER NOT NULL DEFAULT 1,

  is_featured     INTEGER NOT NULL DEFAULT 0,
  view_count      INTEGER NOT NULL DEFAULT 0,

  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_listings_status   ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_ends     ON listings(auction_ends_at);
CREATE INDEX IF NOT EXISTS idx_listings_featured ON listings(is_featured);

CREATE TABLE IF NOT EXISTS listing_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  file_name  TEXT    NOT NULL,
  alt        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_images_listing ON listing_images(listing_id, sort_order);

-- --------------------------------------------------------------------------
-- Auctions & bids
-- --------------------------------------------------------------------------
-- Each listing runs a series of cycles. Closing a cycle names a winner but
-- leaves the machine on sale, so bid history stays attached to its own cycle.
CREATE TABLE IF NOT EXISTS auction_cycles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id      INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  cycle_number    INTEGER NOT NULL,
  starts_at       TEXT    NOT NULL,
  ends_at         TEXT    NOT NULL,
  starting_bid    INTEGER NOT NULL,
  reserve_price   INTEGER,
  final_amount    INTEGER,
  winning_bid_id  INTEGER,
  winning_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reserve_met     INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','closed','cancelled')),
  closed_at       TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (listing_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_cycles_open ON auction_cycles(status, ends_at);

CREATE TABLE IF NOT EXISTS bids (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  cycle_id     INTEGER NOT NULL REFERENCES auction_cycles(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,     -- cents, the bid actually standing
  max_amount   INTEGER,              -- cents, proxy ceiling; NULL = plain bid
  is_auto      INTEGER NOT NULL DEFAULT 0,   -- raised by proxy, not typed
  status       TEXT    NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','outbid','won','lost','retracted')),
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_bids_listing ON bids(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bids_cycle   ON bids(cycle_id, amount DESC);
CREATE INDEX IF NOT EXISTS idx_bids_user    ON bids(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS watchlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, listing_id)
);

-- --------------------------------------------------------------------------
-- Orders & purchase agreements
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number  TEXT    NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  listing_id    INTEGER NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  cycle_id      INTEGER REFERENCES auction_cycles(id) ON DELETE SET NULL,

  type          TEXT    NOT NULL CHECK (type IN ('auction_win','buy_now')),

  amount        INTEGER NOT NULL,    -- hammer price or buy-now price, cents
  shipping_fee  INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL,

  status        TEXT    NOT NULL DEFAULT 'pending_agreement'
                        CHECK (status IN ('pending_agreement','agreement_sent',
                                          'agreement_signed','invoiced','paid',
                                          'in_transit','delivered','cancelled')),

  -- Delivery details captured at checkout, snapshotted so later profile edits
  -- never rewrite the terms of a concluded order.
  delivery_name    TEXT,
  delivery_phone   TEXT,
  delivery_email   TEXT,
  delivery_line1   TEXT,
  delivery_line2   TEXT,
  delivery_city    TEXT,
  delivery_state   TEXT,
  delivery_zip     TEXT,
  delivery_country TEXT DEFAULT 'United States',
  notes            TEXT,

  tracking_number  TEXT,
  carrier          TEXT,

  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- A fully snapshotted contract: the machine, the parties and the money are
-- frozen at issue time so the PDF can always be regenerated byte-identically.
CREATE TABLE IF NOT EXISTS agreements (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  agreement_number TEXT    NOT NULL UNIQUE,
  order_id         INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  bid_id           INTEGER REFERENCES bids(id) ON DELETE SET NULL,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id       INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,

  trigger          TEXT    NOT NULL DEFAULT 'bid'
                           CHECK (trigger IN ('bid','auction_win','buy_now','manual')),

  -- Buyer snapshot
  buyer_name       TEXT NOT NULL,
  buyer_email      TEXT NOT NULL,
  buyer_phone      TEXT,
  buyer_line1      TEXT,
  buyer_line2      TEXT,
  buyer_city       TEXT,
  buyer_state      TEXT,
  buyer_zip        TEXT,
  buyer_country    TEXT,

  -- Seller snapshot
  seller_name      TEXT NOT NULL,
  seller_address   TEXT,
  seller_city_line TEXT,
  seller_phone     TEXT,
  seller_email     TEXT,

  -- Item snapshot
  item_title       TEXT NOT NULL,
  item_year        INTEGER,
  item_make        TEXT,
  item_model       TEXT,
  item_meter       TEXT,          -- "3,122 Hours" / "48,210 Miles"
  item_engine_hp   TEXT,
  item_serial      TEXT,
  item_stock       TEXT,

  -- Money snapshot, cents
  purchase_price   INTEGER NOT NULL,
  shipping_fee     INTEGER NOT NULL DEFAULT 0,
  total_amount     INTEGER NOT NULL,

  status           TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','viewed','signed','declined','voided')),

  access_token     TEXT NOT NULL UNIQUE,   -- unguessable signing-link secret
  doc_id           TEXT NOT NULL,          -- printed on every page, audit ref

  pdf_unsigned     TEXT,                   -- file name under data/agreements
  pdf_signed       TEXT,

  signature_image  TEXT,                   -- file name under uploads/signatures
  signature_name   TEXT,
  signature_ip     TEXT,
  signature_agent  TEXT,
  signature_method TEXT CHECK (signature_method IN ('drawn','typed')),

  audit_trail      TEXT NOT NULL DEFAULT '[]',   -- JSON array of events

  sent_at          TEXT,
  viewed_at        TEXT,
  signed_at        TEXT,
  declined_at      TEXT,
  decline_reason   TEXT,

  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_agr_user   ON agreements(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agr_status ON agreements(status);
CREATE INDEX IF NOT EXISTS idx_agr_token  ON agreements(access_token);
-- At most one live contract per buyer per listing: re-bidding refreshes the
-- existing draft instead of flooding the buyer with near-identical contracts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agr_open_per_listing
  ON agreements(user_id, listing_id)
  WHERE status IN ('draft','sent','viewed');

-- --------------------------------------------------------------------------
-- Operations
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  template     TEXT NOT NULL,
  related_type TEXT,
  related_id   INTEGER,
  status       TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','failed','skipped')),
  error        TEXT,
  message_id   TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  sent_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_email_status ON email_log(status, created_at);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  subject    TEXT,
  message    TEXT NOT NULL,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  ip_address TEXT,
  status     TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','read','replied','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

-- Security / compliance trail for anything an administrator changes.
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  detail      TEXT,
  ip_address  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_activity ON activity_log(created_at DESC);
