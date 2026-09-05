# Deploying to a VPS

This covers both projects. They are independent Node applications, so you can
run them on one VPS or on two — the steps are identical apart from the names,
ports and domains.

Throughout, replace:

| Placeholder | Example |
|---|---|
| `APP` | `ironhaul` or `autoblock` |
| `PORT` | `3010` (IronHaul) / `3020` (AutoBlock) |
| `DOMAIN` | `ironhaul-auctions.com` |

---

## 1. What to buy

### Server

Both sites are server-rendered Node with a SQLite database — light on RAM,
sensitive to disk speed. **NVMe is worth more than extra vCPUs here.**

| Situation | Spec | Roughly |
|---|---|---|
| One site, launching | 2 vCPU, 4 GB RAM, 80 GB NVMe | $12–24/mo |
| **Both sites** *(recommended start)* | 4 vCPU, 8 GB RAM, 160 GB NVMe | $24–48/mo |
| Busy, thousands of daily bidders | 8 vCPU, 16 GB RAM, 320 GB NVMe | $48–96/mo |

Any of Hetzner (cheapest by a distance), DigitalOcean, Vultr, Linode or Hostinger
will do. **Choose a region near your buyers** — every bid is a round trip, and a
bidder in Texas on a Frankfurt server feels it in the closing seconds.

Use **Ubuntu 24.04 LTS**.

### Everything else you need

| Item | Why | Cost |
|---|---|---|
| **Domain** | One per site | ~$12/yr each |
| **Transactional email** | Bid confirmations, agreements, invoices | $0–15/mo |
| **Backups** | The database *is* the business | ~20% of server |
| **TLS certificate** | Let's Encrypt via Caddy | Free |
| **Object storage** *(optional)* | Photos + KYC off the server disk | ~$5/mo |

**Email is the one thing not to cheap out on.** These sites send purchase
agreements and invoices; if they land in spam, the business stops. Use a real
transactional provider with a verified sending domain:

- **Postmark** — best deliverability for transactional mail, ~$15/mo
- **Amazon SES** — cheapest at volume, ~$0.10 per 1,000
- **Mailgun** / **SendGrid** — solid middle ground

Do **not** send from a Gmail account or from the VPS's own IP. You must set
**SPF, DKIM and DMARC** on the sending domain, or agreements will be filtered.

**Minimum realistic budget: ~$40/month for both sites**, including server,
email, backups and two domains.

---

## 2. Prepare the server

SSH in as root, then:

```bash
adduser deploy
usermod -aG sudo deploy

# Copy your SSH key across, then lock down password login.
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

From here on, work as `deploy`.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential python3 sqlite3 ufw fail2ban

# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # expect v22.x

sudo systemctl enable --now fail2ban
```

`build-essential` and `python3` are needed because `better-sqlite3` and `sharp`
compile native code on install.

Unattended security updates:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 3. Upload the application

From your Windows machine:

```powershell
scp -r F:\Projects\ironhaul-auctions  deploy@YOUR_SERVER_IP:/tmp/
scp -r F:\Projects\autoblock-auctions deploy@YOUR_SERVER_IP:/tmp/
```

Do not copy `node_modules` — it contains Windows binaries that will not run on
Linux. Git is better than `scp` if you have a repository.

On the server:

```bash
sudo mkdir -p /var/www
sudo mv /tmp/ironhaul-auctions  /var/www/ironhaul
sudo mv /tmp/autoblock-auctions /var/www/autoblock
sudo chown -R deploy:deploy /var/www/ironhaul /var/www/autoblock

cd /var/www/ironhaul
rm -rf node_modules package-lock.json
npm install --omit=dev
```

Repeat for `/var/www/autoblock`.

---

## 4. Configure

```bash
cd /var/www/ironhaul
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
nano .env
```

The values that matter in production:

```ini
NODE_ENV=production
PORT=3010
BASE_URL=https://ironhaul-auctions.com     # no trailing slash
TRUST_PROXY=1                              # required behind Caddy/nginx

SESSION_SECRET=<the 96-character string you just generated>

DATABASE_FILE=/var/www/ironhaul/data/ironhaul.sqlite

SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=<token>
SMTP_PASS=<token>
MAIL_FROM_EMAIL=no-reply@ironhaul-auctions.com
MAIL_REPLY_TO=sales@ironhaul-auctions.com
ADMIN_NOTIFY_EMAIL=sales@ironhaul-auctions.com

ADMIN_EMAIL=you@yourdomain.com
ADMIN_PASSWORD=<a long random password>

SCHEDULER_ENABLED=true
```

> **`BASE_URL` must be correct.** Every purchase agreement signing link is built
> from it. Get it wrong and buyers receive dead links.

```bash
chmod 600 .env
npm run migrate
npm run seed        # creates your admin account; do this ONCE
```

Do the same for `/var/www/autoblock` with `PORT=3020` and its own domain,
secret and database path.

---

## 5. Run as a service

`/etc/systemd/system/ironhaul.service`:

```ini
[Unit]
Description=IronHaul Auctions
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/ironhaul
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ironhaul

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/ironhaul/data /var/www/ironhaul/logs /var/www/ironhaul/public/uploads

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ironhaul
sudo systemctl status ironhaul
journalctl -u ironhaul -f          # live logs
```

Copy the file for `autoblock`, changing the name, directory and identifier.

systemd is preferable to pm2 here: it starts on boot, restarts on crash, and
handles the `SIGTERM` the app already shuts down cleanly on.

---

## 6. TLS and reverse proxy

**Caddy** is the shortest path — it obtains and renews certificates
automatically.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
ironhaul-auctions.com, www.ironhaul-auctions.com {
    reverse_proxy localhost:3010
    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options    "nosniff"
        Referrer-Policy           "strict-origin-when-cross-origin"
        -Server
    }

    # Long cache for fingerprint-free static assets; adjust if you add hashing.
    @static path /css/* /js/* /img/*
    header @static Cache-Control "public, max-age=604800"

    request_body {
        max_size 15MB          # must exceed MAX_UPLOAD_MB
    }

    log {
        output file /var/log/caddy/ironhaul.log
        format json
    }
}

autoblock-auctions.com, www.autoblock-auctions.com {
    reverse_proxy localhost:3020
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options    "nosniff"
        Referrer-Policy           "strict-origin-when-cross-origin"
        -Server
    }
    request_body { max_size 15MB }
    log {
        output file /var/log/caddy/autoblock.log
        format json
    }
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Point both domains' A records at the server IP **before** reloading, or the
certificate request will fail.

---

## 7. DNS

For each domain:

| Type | Name | Value |
|---|---|---|
| A | `@` | your server IP |
| A | `www` | your server IP |
| TXT | `@` | `v=spf1 include:spf.mtasv.net ~all` *(Postmark; use your provider's)* |
| CNAME | `pm._domainkey` | provider's DKIM value |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:you@domain.com` |

Verify before launch:

```bash
dig +short ironhaul-auctions.com
dig +short TXT ironhaul-auctions.com
```

Then send yourself a test through <https://www.mail-tester.com> — aim for 10/10.
Anything under 8 means agreements will land in spam.

---

## 8. Backups

**The SQLite file is the entire business** — every user, bid, order and signed
agreement. Back it up properly, and back up `data/` alongside it, because that
is where the KYC documents and executed PDFs live.

`/usr/local/bin/backup-auctions.sh`:

```bash
#!/bin/bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
DEST=/var/backups/auctions
mkdir -p "$DEST"

for APP in ironhaul autoblock; do
  DB="/var/www/$APP/data/$APP.sqlite"
  [ -f "$DB" ] || continue

  # .backup is safe on a live database; copying the file is not.
  sqlite3 "$DB" ".backup '$DEST/$APP-$STAMP.sqlite'"
  gzip "$DEST/$APP-$STAMP.sqlite"

  tar czf "$DEST/$APP-files-$STAMP.tar.gz" \
      -C "/var/www/$APP" data/kyc data/agreements public/uploads
done

find "$DEST" -type f -mtime +30 -delete

# Off-site. A backup on the same server is not a backup.
# rclone copy "$DEST" remote:auction-backups --max-age 25h
```

```bash
sudo chmod +x /usr/local/bin/backup-auctions.sh
sudo crontab -e
# 0 3 * * *  /usr/local/bin/backup-auctions.sh >> /var/log/auction-backup.log 2>&1
```

Set up `rclone` to push to Backblaze B2 or S3 and uncomment that line. Then
**restore one to a scratch directory and open it** — an untested backup is a
guess.

---

## 9. Deploying an update

```bash
cd /var/www/ironhaul
sudo systemctl stop ironhaul
sqlite3 data/ironhaul.sqlite ".backup 'data/pre-deploy.sqlite'"

git pull                      # or re-upload
npm install --omit=dev
npm run migrate               # idempotent

sudo systemctl start ironhaul
sudo systemctl status ironhaul
curl -s https://ironhaul-auctions.com/healthz
```

Auctions close on a one-minute cron, so a brief restart is safe — anything due
is settled on the next tick.

---

## 10. After launch

**Watch for:**

```bash
journalctl -u ironhaul -p err -since today   # application errors
du -sh /var/www/*/data /var/www/*/public/uploads
df -h                                        # disk is the usual first problem
```

Also check **Admin → Email log** for failures, and the daily digest in the
journal at 07:00 (unsigned agreements, failed emails, KYC backlog).

**Optional but worth it:**

- **Uptime monitoring** — UptimeRobot (free) against `/healthz`
- **Cloudflare** in front — free CDN, DDoS protection, and it hides the origin IP
- **Error tracking** — Sentry's free tier

---

## Scaling later

The current design comfortably handles a few hundred concurrent bidders. When
it stops:

1. **Move uploads to object storage** (S3/R2) — the easiest win, and it takes
   image serving off the app.
2. **Migrate SQLite to PostgreSQL.** The schema is standard SQL; the work is in
   `config/database.js` and swapping `better-sqlite3` for `pg`. Do this *before*
   you need more than one app process.
3. **Then** run multiple app processes behind the proxy — and set
   `SCHEDULER_ENABLED=false` on all but one, or auctions get settled twice.
4. **Replace polling with WebSockets.** The lot page currently polls
   `/api/lot/:slug/state` every 12 seconds; at high concurrency, push is cheaper.

---

## Legal, before you take a single real bid

This is software, not legal advice. Handle these first:

- **Auction and dealer licensing.** Most US states require a licence to sell
  vehicles, and many regulate online auctions separately. This is the item most
  likely to stop you trading.
- **The contracts.** Have a lawyer in your operating state review
  `src/content/terms.js`, `src/content/privacy.js` and the purchase agreement in
  `src/services/pdfService.js`.
- **Identity documents.** You are storing government ID and biometric selfies.
  Check your state's biometric privacy law (Illinois BIPA and Texas CUBI are the
  strict ones) and confirm your retention period is lawful and documented.
- **Odometer disclosure** (automotive) — federal and state rules apply to every
  sale.
- **Sales tax** on vehicles, which varies by state and by where the buyer takes
  delivery.
- **Consumer protection** — the FTC Used Car Rule requires a Buyers Guide on
  used vehicle sales.
