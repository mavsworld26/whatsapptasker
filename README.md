# HYD Tasks — WhatsApp-only local task marketplace (Hyderabad pilot)

Customers post household and business jobs on WhatsApp. Verified local taskers bid on WhatsApp. Customers pick a tasker and pay through Razorpay. Funds stay on hold until the job is confirmed. Tracking, chat, reviews, disputes, refunds and support all happen on WhatsApp too. There is no customer website or app.

> **Status: pilot-ready code, not yet live.** Going live needs your Meta, Razorpay, legal and operational approvals. They are listed in [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md). This repository never simulates payments. Every booking needs a real Razorpay payment that the server has verified directly with Razorpay.

## What it does

| Area | Implementation |
|---|---|
| Messaging | Official **WhatsApp Business Platform (Cloud API)**. Inbound webhooks are HMAC-verified and deduplicated. The outbox is durable and retries failed sends. The 24-hour service window is enforced, with **approved template** fallback outside it. Uses reply buttons, list menus and location pins. Delivery failures are tracked. |
| Languages | English, Telugu, Hindi and Hinglish. The first message's script suggests a language, the user confirms it from a list, and can change it anytime with `LANG`. Localized command words (`naya kaam`, `नया काम`, `కొత్త పని`, `मदद`…) map to the same commands. Dates like `kal 5 baje` and `రేపు 11 am` are parsed in IST. |
| Customers | Guided job posting: description → area (typed in any language or as a 📍 pin) → budget → date/time → confirm. Then ranked offers, accept, pay, share address privately, masked chat with the tasker, confirm or dispute, and rate. |
| Taskers | Apply on WhatsApp (name, home area, skills). Operators verify identity, police clearance and interview, and link a Razorpay Route account. Taskers then go AVAILABLE, get job alerts, browse `TASKS`, `OFFER`/`WITHDRAW`, mark `DONE`, and get paid. |
| Matching | Workers must match the task's skill, be within their travel radius and have spare capacity. They are ranked by proximity, Bayesian rating, reliability (completion vs cancellation), responsiveness and load. New taskers get a small boost. Offers are ranked by price, quality and reliability. |
| Payments | **Razorpay Payment Links** by default (UPI, cards, netbanking). **WhatsApp Pay (India)** `order_details` is used once Meta approves your payment configuration. Webhooks only *trigger* a server-to-server check: link status, amount, currency and reference. |
| Worker settlement | **Razorpay Route**. The worker's share is transferred to their linked account **on hold** when payment is captured, and released on confirmation, auto-confirmation or a dispute decision. The platform never holds the money in its own bank account. |
| Refunds & disputes | Free cancellation window with automatic full refund. A tasker cancelling triggers a refund and reopens the job. Late cancellations and disputes go to operators. Refund, split and payout decisions need **two-person co-sign**. Payments made late or twice are refunded automatically. |
| Support | `HELP` tickets. Operators reply in WhatsApp (`REPLY`, `REPLYALL`). Disputes show the ticket thread plus the relayed chat as evidence. |
| Safety & privacy | Moderation queue for sensitive work (electrical, gas, childcare, medical, cash handling…). Phone numbers and UPI IDs are masked in relayed chat. Rate limits, blocking, opt-out (`STOP`/`START`), terms consent with version, and `MYDATA` / `DELETE MY DATA`. Addresses are purged 7 days after a job closes. Logs mask phone numbers and contain no message text. |
| Operations | Operator console over WhatsApp with role-based access (super / support / verifier / finance), an audit log, `STATS` and `JOB` inspection, background jobs with retry and reconciliation, scheduled sweeps, an online backup script and readiness checks. |

## Quick start (no credentials needed)

Node.js 22.16+ (uses the built-in `node:sqlite`; no npm dependencies).

```bash
npm test
```

```bash
npm run demo
```

```bash
cp .env.example .env && npm start
```

- `npm test` runs 37 automated tests: unit, conversation, end-to-end money flows and HTTP security. Razorpay is replaced by an in-memory **test double** that exists only in `test/`.
- `npm run demo` prints a Hinglish customer and tasker conversation. It stops at payment, because payments are not configured in the demo.
- `npm start` runs in `DRY_RUN` mode: outbound WhatsApp messages are logged, not sent.
- `npm run check:config` lists everything still missing for live mode. With `DRY_RUN=false` the service **refuses to start** until those items are fixed.

## Architecture

```
src/
  config.js            env parsing + live-readiness checks (fail closed)
  db.js                SQLite schema & append-only migrations, transactions
  i18n.js              en / te / hi / hinglish catalog, language detection
  areas.js             Hyderabad localities (multilingual names, coordinates)
  parse.js             money, IST dates, ids, phones, categories, safety review
  matching.js          worker ranking, offer ranking, price breakdown (pure)
  whatsapp.js          Cloud API payloads, webhook parsing, outbox drain
  jobs.js              durable background job queue
  marketplace/         conversation router + customer/worker/admin/support flows, payflow state
  payments/razorpay.js Razorpay REST client + webhook signature check
  payments/service.js  provider calls with reconciliation; webhook → verification jobs
  scheduler.js         expiries, auto-confirm, overdue alerts, retention purges
  server.js / app.js / index.js   HTTP endpoints, wiring, process lifecycle
```

Money rule: **no webhook changes money state directly.** Webhooks record the event (deduplicated), then a job asks Razorpay for the truth. Only verified facts book, refund or release. If a provider call times out, the code first checks whether it already happened (by reference) before retrying, so links, transfers, reversals and refunds are never duplicated.

HTTP surface: `GET /health`, `GET /ready`, `GET|POST /webhooks/whatsapp`, `POST /webhooks/razorpay`. Nothing else is exposed.

## Commands

Customers: `MENU`, `POST`, `MYJOBS`, `STATUS HYD0001`, `ACCEPT 12`, `PAY HYD0001`, `ADDRESS HYD0001 …`, `MSG HYD0001 …`, `CONFIRM HYD0001`, `DISPUTE HYD0001 …`, `CANCELJOB HYD0001`, `RATE HYD0001 5 comment`, `BUSINESS Company`, `HELP …`, `LANG`, `MYDATA`, `DELETE MY DATA`, `STOP`/`START`. Most of these are also offered as tap buttons or list rows.

Taskers: `JOIN`, `AVAILABLE`/`UNAVAILABLE`, `TASKS`, `OFFER HYD0001 750 note`, `WITHDRAW HYD0001`, `DONE HYD0001`, `CANCELJOB HYD0001`, `MSG`, `RATE`, `DISPUTE`.

Operators: send `OPSHELP` from an allowlisted number. The runbook is [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Documents

- [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md): **what needs your credentials, approvals or legal action**, with the 30 Nov plan.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): server, TLS, Meta and Razorpay setup, backups, monitoring, go-live tests.
- [docs/WHATSAPP_TEMPLATES.md](docs/WHATSAPP_TEMPLATES.md): template texts to submit to Meta, in English, Telugu and Hindi.
- [docs/OPERATIONS.md](docs/OPERATIONS.md): operator commands, verification SOP, dispute and refund SOP, incidents.

## Known limits (by design for the pilot)

- Single instance on SQLite (WAL, synchronous=FULL). Do not run two replicas. Move to Postgres before scaling beyond the pilot.
- Voice notes and photos are not processed. Users are asked to type, or to share a location pin.
- Telugu and Hindi strings were drafted by engineering and **need native-speaker review**.
- Locality coordinates are approximate centroids. Ops should validate them.
- The WhatsApp Pay `order_details` payload follows Meta's India PG docs. It must be re-tested against your approved configuration. Payment Links are the default until then.
- GST invoices and TCS/TDS reporting are not generated. Your accountant must define these (see the checklist).
