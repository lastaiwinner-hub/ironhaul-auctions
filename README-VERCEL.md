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

## Getting the confirmation email to actually arrive

Without SMTP credentials the app writes mail to a file outbox instead of
sending it, and on Vercel that outbox is `/tmp` — unreadable in practice. A new
buyer would sit forever on "check your inbox" and could never bid.

So when no SMTP host is configured, the confirmation page shows the signed-in
owner their own verification link. It only ever reveals a token to the person
who just typed that address in, and it disappears the moment real mail works.
Treat it as a demo convenience: it means email addresses are not really being
proven, so do not run a live auction on it.

To send real mail, set these five variables and redeploy. Any transactional
provider works — Resend, Brevo, Postmark and Amazon SES all have free or
near-free tiers and all speak SMTP:

| Variable | Example |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | your API key |
| `MAIL_FROM_EMAIL` | `no-reply@yourdomain.com` |

Then add **SPF, DKIM and DMARC** records for that sending domain — the provider
gives you the exact values. Skip them and the codes land in spam, which looks
identical to "the email never arrived".

Once `SMTP_HOST` is set, the self-serve panel disappears on its own and the
verification email goes out normally.
