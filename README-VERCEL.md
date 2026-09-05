# Running this on Vercel

Vercel runs the app as a **serverless function**, not as the long-lived server
it was built as. It boots and the whole site is browsable, but four things
behave differently from a normal host, and it is worth knowing exactly which.

## What works

- Every page: home, inventory, lot pages, testimonials, FAQ, legal, contact.
- Registering, signing in, bidding, Buy Now, uploading ID, signing an
  agreement and the whole admin — **within one container's lifetime**.
- The catalogue ships pre-seeded (`db/demo.sqlite`), so a cold container has
  the full demo inventory the moment it starts.

## What does not

1. **Writes do not persist.** The filesystem is read-only apart from `/tmp`,
   so the database is copied there on cold start. When the container is
   recycled — minutes of idleness is enough — every bid, account and uploaded
   document placed on it is gone, and the catalogue is back to the seed.
2. **Writes are not shared.** Two visitors can land on two containers and see
   two different current bids.
3. **Auctions do not close by themselves.** On a normal server `node-cron`
   closes due lots every minute. Here that work is exposed at `/api/cron`
   instead — call it from Vercel Cron (once a day on Hobby) or an external
   pinger. Protect it with the `CRON_SECRET` environment variable:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron`
4. **Email is written to disk, not sent**, unless SMTP credentials are set —
   and on Vercel that disk is `/tmp`, so the outbox is unreadable in practice.

## Environment variables

| Variable | Needed | Notes |
|---|---|---|
| `SESSION_SECRET` | yes | 32+ random characters, or the app refuses to boot in production |
| `BASE_URL` | yes | `https://<your-deployment>.vercel.app` — used in agreement and email links |
| `CRON_SECRET` | recommended | guards `/api/cron` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | optional | without these, mail is written to the outbox instead of sent |

## When this stops being enough

The moment you want real bidders, this needs a host with a disk and an
always-on process — a $5–10/month Railway or Render instance, or the VPS in
`DEPLOYMENT.md`. Nothing in the code changes; it just runs as `npm start`
again and the cron does its own work.
