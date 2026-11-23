# Deployment guide (single-server pilot)

## 1. Server

- One small Linux VM in an Indian region (for example AWS ap-south-1 Mumbai or ap-south-2 Hyderabad), 2 vCPU / 2 GB is plenty for the pilot. Use an encrypted disk and automatic security updates. Allow SSH by key only, and open ports 80/443 only.
- Docker Engine with the Compose plugin.
- A DNS A record, for example `tasks.yourco.in`, pointing to the VM.

```bash
sudo mkdir -p /opt/hyd-tasks && sudo chown $USER /opt/hyd-tasks && cd /opt/hyd-tasks
```

Copy this project into `/opt/hyd-tasks`, then:

```bash
cp .env.example .env && chmod 600 .env
```

```bash
mkdir -p data backups && sudo chown 1000:1000 data backups
```

## 2. Configure `.env`

Fill in the values listed in `.env.example`, then check them. The service image has no `.env` baked in; keep secrets in `.env` with mode 600 or in your platform's secret manager.

```bash
docker compose run --rm app node --disable-warning=ExperimentalWarning scripts/check-config.js
```

## 3. Start

```bash
docker compose up -d --build
```

```bash
curl -s https://tasks.yourco.in/health
```

Caddy obtains TLS certificates automatically and only proxies `/webhooks/*` and `/health`. `/ready` is used by the container health check internally.

**Only one app replica.** SQLite plus the in-process background loops assume a single writer.

## 4. Connect Meta (WhatsApp Cloud API)

1. developers.facebook.com → your app → WhatsApp → Configuration → Webhook: callback `https://tasks.yourco.in/webhooks/whatsapp`, verify token = `WA_VERIFY_TOKEN`. Subscribe to **messages**.
2. Add your operator numbers as test recipients while using the test number.
3. Send `hi` from your phone. You should get the language list. Check `docker compose logs app`; logs show masked numbers only.
4. Submit the templates in `WHATSAPP_TEMPLATES.md`. After approval, put their names in `WA_TEMPLATES` and restart.

## 5. Connect Razorpay

1. In **test mode** first: Dashboard → Settings → API Keys → generate keys → `.env`.
2. Webhooks → add `https://tasks.yourco.in/webhooks/razorpay`, set a secret (`RAZORPAY_WEBHOOK_SECRET`), and select `payment_link.paid`, `payment.captured`, `refund.processed`, `refund.failed`.
3. Route → create a test linked account for a test tasker. Note its `acc_…` id and record it with `LINKACC`.
4. For production: switch to live keys, set `APP_ENV=production`, and recreate the webhook in live mode.

## 6. Backups, monitoring, logs

- Backups: `deploy/hyd-tasks-backup.cron` takes a consistent hourly `VACUUM INTO` snapshot, encrypts it with GPG and copies it off-site. **Test a restore** before launch: stop the app, copy the decrypted snapshot to `data/marketplace.sqlite`, start the app.
- Uptime monitoring: probe `https://tasks.yourco.in/health` every minute and alert operators.
- Logs are JSON on stdout (`docker compose logs`). Ship them to your log tool and alert on `"level":"error"`. Watch `job.error`, `outbox.send_failed` and `startup.refused`.
- Operators can send `STATS` on WhatsApp for failed jobs and messages, and payment configuration status.

## 7. Staging test plan (run before go-live, Razorpay test mode)

| # | Scenario | Expected |
|---|---|---|
| 1 | New user says hi in Telugu, Hindi and English | Language list, then terms in that language, then AGREE, then menu |
| 2 | Tasker JOIN → operator CHECK ×3 → LINKACC → APPROVE → AVAILABLE | Approval only after all checks |
| 3 | Customer posts with a location pin | Correct area; matching tasker gets an alert |
| 4 | Two taskers bid; customer opens STATUS | Ranked list; ACCEPT gives a payment link |
| 5 | Pay with Razorpay test UPI/card | BOOKED to both; Route transfer **on hold** in Dashboard |
| 6 | ADDRESS + MSG with a phone number in the text | Address goes only to the tasker; number masked |
| 7 | DONE → CONFIRM | Transfer released in Dashboard; payout message; RATE works |
| 8 | Let a link expire (set `PAYMENT_LINK_TTL_MINUTES=16`) | Job reopens; link cancelled |
| 9 | Customer cancels more than 12h before start | Transfer reversed, full refund, `refund.processed` message |
| 10 | Tasker cancels a booked job | Refund; job reopens with other offers |
| 11 | Dispute → RESOLVE split → COSIGN by a second finance operator | Partial reversal and refund, remainder released |
| 12 | Wrong signature to both webhooks | 401, nothing changes |
| 13 | STOP / START, `DELETE MY DATA` | No messages after STOP; data erased |
| 14 | Message after 24h silence, with and without an approved template | Template sent, or message waits until the user replies |
| 15 | Kill the container mid-flow, then restart | No duplicate bookings or refunds; queued work resumes |

Write down the results (screenshots and Razorpay IDs) as evidence for go/no-go.

## 8. Upgrades and rollback

- Back up first: `docker compose exec app node scripts/backup.js /app/backups`.
- `docker compose up -d --build`. Migrations run automatically at startup and are append-only.
- Roll back by redeploying the previous image **and** restoring the pre-upgrade backup if a migration ran.
