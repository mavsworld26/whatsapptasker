# QA, security and production-readiness audit

**Date:** 24 Nov 2026 · **Scope:** the whole repository (`src/`, `test/`, `deploy/`, `scripts/`) and the staging Droplet · **Runtime:** Node.js 22.23.5

## 1. How this was tested and what it does *not* prove

- **Automated:** 62 tests run with `node --test` against an in-memory SQLite database. Each run takes about 0.8 s.
- **External services:**
  - **Razorpay** is replaced by `FakeRazorpay` in `test/helpers.js`, an in-memory test double. It moves no money and is never loaded by the running service.
  - **Meta's send API** is replaced by stub functions.
  - **Webhooks** are exercised over real HTTP, with real HMAC signatures, against the real server code.
- **Not exercised at all:**
  - Razorpay, in either test mode or live mode, because no keys are configured.
  - Razorpay Route linked accounts.
  - WhatsApp Pay (India).
  - Approved message templates.
  - Rendering of interactive lists and buttons on real Android and iOS devices.
  - **No real money has moved.**
- **Exercised live (staging Droplet, Meta test number):**
  - **I verified myself:** the public HTTPS endpoint answers, and the webhook rejects a wrong verify token.
  - **From your server logs:** Meta's verification handshake succeeded (200) and a signed `POST /webhooks/whatsapp` was accepted (200).
  - **You reported:** sending "hi" from your phone returned the language menu.
  - **Not verified live:** every other flow. Your Droplet still runs the code from *before* this audit, so redeploy it (§7, step 1).

## 2. Test results

| Suite | Tests | Pass | Fail | Covers |
|---|---|---|---|---|
| `test/units.test.js` | 9 | 9 | 0 | IST date parsing in 4 languages, money and IDs, areas and location pins, classification and safety review, i18n completeness and button limits, command aliases, matching and pricing, config readiness, contact masking |
| `test/conversations.test.js` | 13 | 13 | 0 | Telugu, Hindi and Hinglish onboarding; posting validation; daily limit; moderation; worker verification; radius and skill gating; payments-disabled path; ranked offers; support tickets; STOP/START, rate limit, block, duplicate message IDs; 24h window and template fallback; data export and erasure |
| `test/journey.test.js` | 12 | 12 | 0 | Full paid journey; spoofed and early webhooks; duplicate events; link-creation timeout; payment expiry and late payment; free and late cancellation; tasker cancellation; dispute with co-signed split; auto-confirm; permanent refund failure; task expiry |
| `test/http.test.js` | 3 | 3 | 0 | Meta handshake and signatures, Razorpay signatures and dedupe over HTTP, WhatsApp payload shapes |
| `test/audit.test.js` *(new)* | 25 | 25 | 0 | See below |
| **Total** | **62** | **62** | **0** | |

**First run of the new audit suite, before any fixes:** 13 passed, 9 failed. Every failure was a real defect (listed in §4) except two problems in my own test code, which I corrected. After the fixes, the whole suite was re-run: 62 of 62 pass.

**What the audit suite covers, mapped to your requirements:**

| Your requirement | Test(s) |
|---|---|
| 4. Full journey: post → bid → select → pay → **start** → complete → payout → review | happy path; full journey in Telugu (customer) and Hindi (tasker); job start |
| 5. Registration, approval, suspension, verification | worker lifecycle; verification checks; authorization matrix; two no-shows auto-suspend |
| 6. Simultaneous users | 4 customers × 4 taskers sending requests in parallel over HTTP (16 bids, a racing double accept); double ACCEPT race |
| 7. Telugu, Hindi, English, voice, invalid input | Telugu/Hindi journey; voice/image/sticker messages; fuzz test (40 malicious or malformed inputs × 3 senders, including SQL injection) |
| 8. Webhook signatures, duplicates, failed notifications, retries | Meta and Razorpay signature tests; duplicate IDs; outbox backoff, permanent failure, 8-attempt cap and delivery-failure webhook; malformed signed bodies; oversized body |
| 9. Payment security, duplicate charges, refunds, payout failures, races, fraudulent completion | forged and mismatched payments; WhatsApp Pay double payment; refund cap; refund/reversal/transfer timeouts not duplicated; payout transient and permanent failures; orphaned payment link; fraudulent DONE/CONFIRM; premature DONE |
| 10. Authorization, privacy, database security, admin commands | role matrix; phone numbers never shared; outsider access; DB file mode 600; migration upgrade |
| 11. Cancellation, disputes, no-shows, complaints | free and late cancellation; tasker cancellation; late-cancellation settlement; no-show (refund, suspension, not after start); complaint after completion |

## 3. Features

### Fully implemented (verified by automated tests; real providers not exercised)

- **WhatsApp conversations:** signed webhooks, deduplication, 24h service window, template fallback, opt-out, rate limit, interactive buttons and lists, location pins.
- **Languages:** English, Telugu, Hindi and Hinglish, including localized commands and dates.
- **Jobs:** posting with validation, moderation queue, matching and dispatch, bidding and offer ranking.
- **Booking and payment:** booking with a payment intent and Razorpay Payment Link; verification checks status, amount, currency and reference directly with Razorpay before booking.
- **Job execution:** ARRIVED (start), DONE with anti-fraud timing, CONFIRM, auto-confirm after 48h.
- **Payouts:** Razorpay Route transfer on hold at capture, released on completion.
- **Refunds:** free cancellation; tasker cancellation; no-show; dispute (release, refund or split) with two-person co-sign; late-cancellation fee; goodwill refunds.
- **Payment safety:** automatic refund of late or duplicate payments; check-before-create reconciliation for links, transfers, reversals and refunds.
- **Support:** tickets, operator replies, masked customer–tasker chat, two-way reviews.
- **Workers:** verification checklist, approval, suspension, reinstatement, rejection, blocking.
- **Operations:** WhatsApp operator console with roles, audit log, scheduler (expiry, auto-confirm, overdue alerts, retention purges), backups script, readiness checks, Docker/Caddy deployment.

### Partially implemented

| Feature | Gap |
|---|---|
| Voice notes and photos | Politely rejected and the draft is kept. No transcription or image handling. |
| Job start / arrival | Self-reported with `ARRIVED`; there is no GPS or location-pin proof. A tasker who does the job but forgets ARRIVED could be falsely reported as a no-show. That is an operational risk (§6). |
| WhatsApp Pay (in-chat payment) | Payload built from Meta docs and its hint webhook verified with Razorpay in tests. Never run against Meta. Switched off unless `WA_PAYMENT_CONFIGURATION` is set. |
| Out-of-window notifications | Code is complete, but no templates are approved yet, so these messages wait until the user writes again. The `generic_update` template parameter is English-only. |
| Telugu and Hindi text | Complete coverage (checked by test), but drafted by engineering; needs native-speaker review. |
| Tax | GST is charged on the platform fee only. No GST invoices, TCS or 194-O TDS handling. |
| Monitoring and backups | Scripts and cron file exist, but they are **not installed** on the Droplet. |

## 4. Defects and vulnerabilities found and fixed

| # | Severity | Defect | Fix | Regression test |
|---|---|---|---|---|
| 1 | **Critical** | A partial goodwill `REFUND` on a booked job **marked the job completed and released the tasker's payout** before the work was done, and took the refund out of the tasker's share. | Refunds now have explicit rules: goodwill is platform-funded and changes nothing else; `RESOLVE split` settles from the held share; a full refund reverses the held share. A new database migration adds the `settle` flag. | goodwill partial REFUND; complaint after completion |
| 2 | **Critical** | **Duplicate payout or refund risk.** If Razorpay created a transfer, reversal or refund but our request timed out, a retry could create it again. | Check Razorpay for an existing record before every create; wait 10 minutes before re-creating a transfer after an unknown outcome. | transfer timeout; refund/reversal timeout |
| 3 | **High** | **Stranded money.** If transfer creation failed locally but succeeded at Razorpay, a later refund skipped the reversal, so the money stayed in the tasker's linked account. | The refund job looks the transfer up at Razorpay and adopts it before reversing. | transfer timeout |
| 4 | **High** | **Fraudulent early completion.** A tasker could mark DONE straight after booking; a silent customer would trigger auto-confirm and payout. | DONE is refused until 30 minutes before the start time. A new `ARRIVED` command (from 2h before) puts the job in progress, and the customer is notified. | job start; fraudulent completion |
| 5 | **High** | **No worker no-show handling.** The customer could only open a ticket, and the money stayed with no clear rule. | `NOSHOW` from 30 minutes after start, only if the tasker never sent ARRIVED: full refund with reversal, job cancelled, tasker penalised, auto-suspension after 2 no-shows, ops alerted. | worker no-show; two no-shows |
| 6 | **High** | **No way to settle a late cancellation** (partial refund plus cancellation fee for the tasker). | `RESOLVE n split X` on a booked job cancels it, refunds X from the tasker's share and releases the rest as a fee. The payout guard allows this release only with an executed settle action. | late cancellation settled |
| 7 | **High** | **Orphaned payable link.** If the booking was cancelled while the link was being created, the link stayed payable at Razorpay. A late payment was auto-refunded, but the customer could still be charged and waiting for a refund. | After creation, if the booking is gone, the link is cancelled immediately and never sent to the customer. | orphaned link |
| 8 | Medium | The database file was world-readable (mode 644) inside its volume. | The file is created with mode 600 (WAL/SHM inherit it). | DB permissions |
| 9 | Medium | A correctly signed webhook with a `null`, array or malformed body caused HTTP 500 and endless Meta retries. | The body shape is validated; malformed entries are ignored (Meta) or get 400 (Razorpay). | malformed signed bodies |

**Checked and not a defect:**
- A message starting with STOP (for example "STOP HYD0001") opts the user out. That is intentional, for WhatsApp opt-out compliance.
- Two failing first-run tests were bugs in my test code: an assumed task order, and an invalid operator reason.

**Security properties confirmed by tests:**
- HMAC on every Meta and Razorpay webhook.
- No money state changes without a server-to-server check.
- Parameterised SQL everywhere; injection text is stored literally.
- Role-based operator commands; customers and taskers can't run any of them.
- Two-person co-sign for operator money movements.
- Phone numbers and UPI IDs never exchanged between parties.
- Outsiders can't read or message a job.
- Body size limit; rate limits.
- The app port is bound to 127.0.0.1 only; containers run as non-root with a read-only filesystem.
- No npm dependencies (no supply-chain exposure).

## 5. Actions requiring real Meta, payment-provider or regulatory approval

Details are in `LAUNCH_CHECKLIST.md`. Status today:

| Area | Item | Status |
|---|---|---|
| Meta | Business verification, display name, dedicated business number (not a personal WhatsApp number), billing | Not started |
| Meta | **Permanent System User token** (the current token expires every ~24h) | Not done |
| Meta | 6 templates × 3 languages approved | Not submitted |
| Meta | Written confirmation that a services marketplace is allowed under Meta's policies | Not done |
| Meta | WhatsApp Pay India configuration *(optional)* | Not started |
| Razorpay | Account KYC activation, marketplace model approved, **Route enabled**, test keys then live keys, webhook | Not started |
| Razorpay | Confirm that a transfer **on hold can be reversed** (refunds after booking depend on it) | Not confirmed |
| Razorpay | Each tasker's Route linked account, KYC-verified | Not started |
| Legal / tax | GST registration and section 9(5)/52 position, 194-O TDS, Social Security Code gig-worker duties and Telangana rules, DPDP privacy notice and grievance officer, E-Commerce Rules, lawyer-approved Terms/Privacy/refund policy, insurance | Not started |
| Operations | Two finance operators, police-verification SOP, native-language review, support staffing | Not started |

## 6. Remaining blockers and risks

1. **No payment provider has ever been exercised**, not even Razorpay test mode. This is the biggest technical unknown.
2. The **Meta access token is temporary**, and messages go from a Meta *test* number to allowlisted recipients only.
3. **The Droplet runs pre-audit code.** It has 512 MB of memory, no off-site backups and no uptime monitoring.
4. **Secrets were pasted into chat earlier:**
   - **GitHub token:** revoke it if you haven't already.
   - **Webhook verify token:** low risk, but rotate it before production.
5. **No-show misuse:** a customer could report a no-show for a tasker who did the work but forgot ARRIVED, triggering an automatic refund. Mitigations: tasker training, and keeping the tasker's right to dispute. Consider requiring a location pin for ARRIVED before scaling.
6. **Operator accounts are only as secure as the operators' WhatsApp accounts.** Enable WhatsApp two-step verification on every operator phone. Money movements still need two operators.
7. **SQLite allows a single instance only.** That's fine for the pilot volume; move to Postgres before scaling.

## 7. Deployment readiness

| Stage | Ready? |
|---|---|
| Internal staging with the Meta test number, no payments | **Yes**, once redeployed (step 1 below) |
| Staging with Razorpay **test mode** | Code ready; needs Razorpay test keys, Route and a test linked account |
| Controlled pilot with real customers and real money | **No.** Blocked by §5 and §6 items 1–4 |

## 8. Exact steps before the first real customer transaction

1. **Deploy the audited code.** On the Droplet: `cd /opt/whatsapptasker`, then `git pull` (with a fresh read-only token), then `docker compose up -d --build`. Confirm `/health` and send "hi" again.
2. **Install the safety net:** hourly off-site encrypted backup (`deploy/hyd-tasks-backup.cron`) plus one test restore; an uptime monitor on `/health`; resize the Droplet to 1 GB.
3. **Razorpay:** create the account and get **test** keys. Enable Route. Create one test linked account. Configure the webhook. Put the keys in `.env`.
4. **Run the 15-scenario staging plan** (`DEPLOYMENT.md` §7) in Razorpay test mode on real phones. Pay particular attention to reversal of an **on-hold** transfer, partial refund plus release, the no-show refund, and two-person co-sign. Record each Razorpay ID as evidence.
5. **Meta:** business verification; dedicated business number; permanent System User token; submit and get approval for the templates; get written confirmation on the policy for services marketplaces.
6. **Legal and tax:** publish lawyer-approved Terms, Privacy and refund policy, then set `TERMS_URL`, `PRIVACY_URL` and `TERMS_VERSION`. Get written CA advice on GST, TCS and TDS. Register as required. Take out insurance.
7. **Razorpay live:** KYC activated, marketplace model approved in writing, **live** keys, `APP_ENV=production`. Then `npm run check:config` must report no blocking items; the service refuses to start otherwise.
8. **Operations:** two finance operators in `ADMIN_PHONES`; WhatsApp two-step verification on operator phones; tasker checks done and linked accounts **activated**; native-speaker review done; support hours staffed.
9. **First transaction:** one invited customer, one verified tasker, a small job. A finance operator watches the Razorpay Dashboard from payment through hold, release and settlement before you open to more users.
