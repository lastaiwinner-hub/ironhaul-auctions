# Staff chat alerts

Alerts are disabled by default. Create a Telegram bot with BotFather, start a private conversation with it, and configure these variables in the server's private environment (never in client code or Git):

```
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<private bot token>
TELEGRAM_CHAT_ID=<your destination chat ID>
TELEGRAM_INBOX_URL=https://heavylineauctions.us/yard-2c7424e7c2/inbox
```

Restart the application after configuring. Send a new website chat message and confirm that your Telegram account receives an alert and that the inbox link requires staff authentication. No old conversations are replayed when enabling alerts.

Each new visitor message queues a generic alert containing a message reference and inbox link. Customer names, emails, message bodies and documents are not forwarded. Team replies do not notify. A durable SQLite queue survives restarts and deduplicates repeated chat submissions. The worker checks every five seconds, respects Telegram rate limits, and retries failures up to twelve attempts. A network failure after Telegram accepted a request can occasionally cause a repeated alert; Telegram does not provide an idempotency key for sendMessage.

Delivery failures do not block chat. Logs contain a generic warning without credentials. Failed alerts can be inspected using `support_alerts` (failed=1); resolve connectivity/configuration before resetting attempts, failed and next_attempt for a deliberate retry. Queue records are removed with their source chat message during the existing 180-day retention cleanup.

Before deploying, back up the production database and current release. Startup migration adds support_alerts and agreements.policy_version. Deploy code only; never replace the live database with db/demo.sqlite or a local preview database. Verify policy pages, authenticated bidder names and public name masking after restart.
