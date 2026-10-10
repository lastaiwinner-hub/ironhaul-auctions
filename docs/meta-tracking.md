# Heavyline Meta tracking

Set META_PIXEL_ID and META_ACCESS_TOKEN in the production environment. The token is server-only. META_TEST_EVENT_CODE is optional for Events Manager Test Events; leave it empty for normal traffic. Graph API is pinned to v25.0.

Advertising is off by default and requires a separate Meta advertising opt-in. Previous first-party analytics permission does not grant it. GPC/DNT and admin sessions are excluded. Privacy choices revokes pending events and attribution for the associated buyer. Attribution expires after 30 days; unsent events expire after six days. Delivered payloads are removed, retaining IDs/status for deduplication.

| Event | Trigger | Delivery |
| --- | --- | --- |
| PageView | Consenting visitor opens an allowed public page | Pixel + CAPI, matching event ID |
| ViewContent | Existing public equipment detail page | Pixel + CAPI, matching event ID |
| CompleteRegistration | Account creation succeeds | CAPI only |
| InitiateCheckout | Verified buyer opens Buy Now checkout, once per session/lot | CAPI only |
| Lead | Buy Now creates an order | CAPI only |
| BidPlaced | Accepted bid; custom event | CAPI only |
| Purchase | Order transitions to paid, once per order | CAPI only |

Purchase uses the buyer's consent and attribution, never the administrator's IP/browser. Its USD value includes order amount and shipping. Signing an agreement, receiving an invoice, or winning an auction does not fire Purchase. No cart/payment-details events are emitted because these steps do not exist in this bank-transfer checkout. Private account/signing/order pages do not load Meta scripts. Automatic event discovery is disabled in the Pixel initialization.

A database outbox retries delivery every 15 seconds, with per-event backoff up to one hour and an eight-second network timeout. Network errors never block checkout. Only numeric API error codes or a generic network code are saved; API responses and access tokens are never logged. Start/stop runs with server.js.

Operational check (from project directory, without printing payloads or secrets):

    node -e "require('./config'); const {db}=require('./config/database'); console.table(db.prepare('SELECT name,status,COUNT(*) AS count,MAX(error_code) AS error_code FROM meta_events GROUP BY name,status').all())"

Use CompleteRegistration as the initial campaign conversion, then evaluate accepted-bid or paid-purchase optimization as actual conversion volume grows. This does not configure campaigns in Ads Manager. Verify domain/dataset permissions and Event Diagnostics in Events Manager. Do not generate fake paid orders for testing. Automated tests use a mocked Meta endpoint and a disposable database.
