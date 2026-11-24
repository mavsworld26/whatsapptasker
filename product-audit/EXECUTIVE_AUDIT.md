# Executive audit: HYD Tasks (WhatsApp-only local services marketplace)

**Audit date:** 24 Nov 2026 · **Repository:** `mavsworld26/whatsapptasker` @ `237fd44` · **Author role:** CPO / marketplace architect / head of QA

## Evidence base

| Evidence | Result |
|---|---|
| `npm test` at `237fd44` (Node 22.23.5) | **62 tests, 62 pass, 0 fail**, about 0.8 s |
| TODO/FIXME scan of `src/`, `scripts/` | None found |
| In-process scale simulation of the current matching code (1 / 5 / 50 / 100 / 1,000 taskers) | See `TEST_STRATEGY.md` §6. It shows a **15-alert single wave** and **one customer message per bid** (100 bids → 100 messages) |
| Live staging Droplet (BLR1, `64.227.143.139`) | `/health` returns 200 over HTTPS (checked by me). The Meta webhook handshake succeeded (operator's logs). The founder reported a reply to "hi" on the Meta test number. **The Droplet runs pre-audit code (`2a7c815`)** |
| Payment provider | **Never exercised.** Razorpay is only an in-memory test double (`test/helpers.js` `FakeRazorpay`) |
| External research | Airtasker help/policy pages; Meta developer docs (Groups API, Flows, pricing, Media); Telangana and central gig-worker law (secondary sources). Cited inline in each document, with unverified items labelled |

**Status legend** (used in every document)

| Label | Meaning |
|---|---|
| ✅ **Tested** | Implemented, and an automated test exercises it |
| 🟡 **Untested** | Implemented, but no test exercises it |
| 🟠 **Partial** | Partly implemented |
| ❌ **Missing** | Not implemented |
| 🔒 **Blocked** | Needs external credentials, approvals or services |

## Feature inventory with evidence

| Area | Feature | Status | Evidence (file:function) |
|---|---|---|---|
| Messaging | Meta webhook verify + HMAC + dedupe | ✅ | `src/server.js:createServer`, `isValidMetaSignature`; `core.js:processMessage`; tests `http.test.js:19`, `audit.test.js:507` |
| Messaging | Outbox with retry/backoff, 24h window, template fallback | ✅ (logic) / 🔒 (templates unapproved) | `whatsapp.js:drainOutbox`; tests `conversations.test.js:194`, `audit.test.js:299` |
| Messaging | Interactive buttons / lists | ✅ payload shape; 🔒 rendering on real devices unverified | `whatsapp.js:buildRequest`; `http.test.js:57` |
| Messaging | Voice notes, photos | ❌ politely rejected | `core.js:route` (`media_unsupported`); `audit.test.js:327` |
| Languages | en / te / hi / Hinglish catalog, script detection, localized aliases | ✅ (machine-checked complete); 🟠 not native-reviewed | `i18n.js`, `commands.js`; `units.test.js:66,83` |
| Customer | Guided posting (description → area/pin → budget → time → confirm) | ✅ | `customer.js:continuePost`; `conversations.test.js:6,42` |
| Customer | Edit task after posting | ❌ | — |
| Customer | Task photos | ❌ | — |
| Customer | Ranked offers list, accept | ✅ | `customer.js:status`, `acceptOffer`; `conversations.test.js:144`, `audit.test.js:214` |
| Customer | Close bidding / bid deadline | ❌ (bids stay open until the scheduled time) | `scheduler.js:sweep` expires at `scheduled_at` |
| Customer | Pay (Razorpay Payment Link) with server-side verification | ✅ vs test double; 🔒 real Razorpay | `payflow.js:startPayment`, `service.js:'payment.verify_link'`; `journey.test.js:5,51` |
| Customer | Address + masked chat | ✅ | `customer.js:address`, `support.js:relay`; `audit.test.js:416` |
| Customer | Confirm / auto-confirm / dispute / no-show / cancel | ✅ | `customer.js:confirm,cancelJob,noShow`; `support.js:dispute`; `scheduler.js:sweep` |
| Customer | Rebook a favourite tasker | ❌ | — |
| Customer | Read review texts of a tasker | ❌ (rating number only) | `customer.js:offersForCustomer` |
| Tasker | Application, verification checklist, approval | ✅ | `worker.js:startJoin,continueJoin`; `admin.js:CHECK,LINKACC,APPROVE`; `conversations.test.js:95` |
| Tasker | Edit profile (areas, skills, radius) after approval | ❌ | `worker.js:startJoin` returns "already approved" |
| Tasker | Job alerts (single wave, max 15) / TASKS list | 🟠 | `customer.js:dispatchTask`, `matching.js:rankWorkersForTask` |
| Tasker | Offer, revise, withdraw | ✅ (unlimited revisions; each re-notifies the customer) | `worker.js:makeOffer,withdraw` |
| Tasker | Price increase / extra work after booking | ❌ | — |
| Tasker | ARRIVED, DONE with anti-fraud timing | ✅ | `worker.js:arrived,done`; `audit.test.js:18,36` |
| Tasker | Report customer no-show / unsafe site | ❌ (only generic `DISPUTE`/`HELP`) | — |
| Tasker | Earnings summary / payout history | ❌ | — |
| Payout | Route transfer on hold, release, reversal, reconciliation | ✅ vs test double; 🔒 Route not enabled | `service.js:'transfer.create','transfer.release','refund.execute'`; `audit.test.js:155,227,472` |
| Business | Business name + lower fee rate | 🟠 | `customer.js:business`, `payflow.js:feeRateFor` |
| Business | GSTIN, GST invoices, multiple staff numbers, monthly billing | ❌ | — |
| Admin | WhatsApp operator console, roles, two-person co-sign, audit | ✅ | `admin.js`; `audit.test.js:395`, `journey.test.js:169` |
| Admin | Web dashboard / analytics funnel | ❌ (`STATS` counts only) | `admin.js:STATS` |
| Trust | Moderation keywords, contact masking, rate limit, block | ✅ | `parse.js:reviewReason`; `support.js:maskContactDetails`; `core.js:rateLimited` |
| Privacy | Consent version, MYDATA, erasure, retention purges | ✅ | `core.js:route` (AGREE), `support.js:erase`, `scheduler.js:RETENTION` |
| Compliance | Telangana welfare-fund fee, worker database filing, GST invoicing, TDS | ❌ / 🔒 legal | — |
| Ops | Backups script, readiness check, Docker/Caddy | ✅ scripts exist; ❌ backups/monitoring **not installed** on the Droplet | `scripts/backup.js`, `scripts/check-config.js` |

## Discrepancies between the intended product and what's implemented

1. **Liquidity mechanics are naive.**
   - A job gets **one wave of at most 15 alerts** (`MATCH_MAX_ALERTS`), with no second wave when nobody bids.
   - There is no time-conflict check for taskers who are already booked.
   - The customer gets **one WhatsApp message per bid**. The simulation measured 100 bids → 100 messages, which is costly and pushes users to block the number.
   - There is no bidding deadline.
2. **The "WhatsApp-only" promise depends on approved templates.** Without them, a tasker who hasn't messaged in 24h **cannot** receive job alerts. On the current setup, most alerts would silently wait (`whatsapp.js:drainOutbox` → `waiting_window`).
3. **Payment is "WhatsApp-adjacent", not in-chat.** The default is a Razorpay Payment Link, which opens a browser or UPI app. In-chat WhatsApp Pay needs separate Meta approval and is untested.
4. **New law changes the economics.**
   - The Telangana Platform Based Gig Workers Act 2026 rules (notified 14 Nov 2026, per secondary sources) impose a **welfare fund fee of up to 2% of each worker payout**, payable by the platform, plus worker-database filing.
   - The Code on Social Security 2020 (in force 21 Nov 2025, per news sources) adds an aggregator contribution of 1–2% of turnover, capped at 5% of worker payouts.
   - **Neither is modelled in pricing or code.**
5. **The scope-change and "extra money" flows are missing.** In Indian home services, this is the most common route for off-platform cash. Airtasker has an "increase price" request; we don't.

## Verdict

- **The software foundation is solid for a pilot:** state machine, money safety, verification, operator controls and tests.
- **The product is not yet a complete marketplace.** Liquidity, notifications, scope changes, tasker earnings and business features are missing or naive.
- **External blockers prevent any real-money launch:** Meta templates and permanent token, Razorpay plus Route, Telangana and GST compliance.

See the founder summary at the end of this file and `FEATURE_GAP_ANALYSIS.md` for the prioritised list.

---

# Founder report (plain language)

### A. What have we built so far?

A working WhatsApp robot backed by a proper database. On a test phone it can:
- greet people in English, Telugu, Hindi or Hinglish;
- take a job request;
- alert nearby verified workers and collect their prices;
- let the customer pick one and send a secure Razorpay payment link;
- hold the worker's money until the customer confirms the job;
- handle cancellations, no-shows, disputes, refunds and support tickets, with two staff members needing to approve any manual refund.

We tested all of this automatically, 62 checks, all passing. We also tested hostile situations: fake payment messages, duplicate payments, many users at once, junk input, and staff permission abuse. It runs on your Bangalore server with HTTPS, and you received a real WhatsApp reply on Meta's test number.

### B. What is missing?

**Marketplace features:**
- Smarter job alerts: several waves, wider radius when nobody bids, skipping workers who are already busy at that time.
- A bidding deadline and fewer customer messages (a summary instead of one message per bid).
- Photos and voice notes in job posts.
- A way for workers to ask for more money when the job turns out bigger.
- Worker earnings summary, worker profile editing, rebooking a favourite worker.
- Business accounts with GST invoices.
- An internal staff dashboard and business metrics.

**Not yet set up:**
- Approved WhatsApp message templates.
- A permanent WhatsApp access token.
- Any Razorpay account at all.

### C. What is broken or dangerous?

Nothing in the code is known to be broken today; we fixed 9 defects in the last audit. What is **dangerous** is launching before these are done:
1. **Money has never moved through real Razorpay**, not even its test mode.
2. **Job alerts won't reach most workers** without approved templates.
3. **New Telangana gig-worker law:** a fee of up to 2% of every payout and registration of your workers, neither handled.
4. **No backups or monitoring on the server**, and it still runs the older code.
5. Workers can push customers to pay cash for "extra work", because we have no in-app way to add extra charges.

### D. What important things have I not thought about?

- **Workers bringing helpers.** Moving and event jobs often need 2–5 people. Unverified helpers entering homes is a safety and legal problem.
- **Cash leakage.** After one good job, customer and worker can swap numbers and skip us. Our protection is value (guarantee, insurance, dispute handling, convenience), not blocking.
- **Notification cost and quality.** Each WhatsApp template costs roughly ₹0.12–0.15 for utility messages (sources disagree). Spammy messages lower your WhatsApp quality rating and can restrict the number.
- **Worker earnings and speed of payout** decide whether good workers stay. Razorpay Route settlement takes days after release.
- **Minimum job size.** ₹100–300 jobs lose money after payment, support and welfare fees.
- **Support load at night and weekends.** Jobs happen when your team is off.
- **One WhatsApp number is a single point of failure.** If Meta restricts it, the whole business stops.

### E. How should the complete marketplace work?

1. Customer says hi, picks a language and posts a job (text, photos, location pin, time, budget).
2. Nearby verified, free workers get alerts in waves until there are enough good offers.
3. The customer gets a short summary of the best offers (not 50 separate messages), compares price, rating and reviews, and picks one.
4. They pay inside WhatsApp or by UPI link; the money is held.
5. The worker confirms the day before, taps "Arrived" on site, and adds extra charges in the chat if the scope changes (the customer must approve and pay).
6. The worker taps "Done"; the customer confirms or reports a problem; the money is released; both rate each other.
7. A rebook button and referral code bring them back.

Staff handle verification, risky jobs, disputes and refunds from a simple dashboard, with WhatsApp as a backup.

### F. What should we build next? (in order)

1. Deploy the audited code; add backups and monitoring.
2. Razorpay test account + Route; run the full money flow in test mode.
3. Submit WhatsApp templates; get a permanent token.
4. Fix notification mechanics: alert waves, busy-worker check, bid digest for customers, bidding deadline.
5. Extra-charge requests ("price increase") inside the platform.
6. Worker earnings summary + profile editing + calendar conflict check.
7. Photos on job posts.
8. Compliance: Telangana welfare fee in pricing, worker registry export, GST invoice data.
9. Internal staff dashboard (read-only first) + funnel metrics.
10. Pilot operations kit: support rota, insurance, verification of the first 30 workers.

### G. Can we launch today?

**No.**
- No Razorpay account; no money flow has ever run (`FakeRazorpay` only).
- No approved templates, so job alerts can't reach workers reliably (`whatsapp.js:drainOutbox`).
- Temporary Meta token that expires daily.
- No Terms or Privacy documents (`TERMS_VERSION=draft-unapproved`); production refuses to start (`config.js:liveReadinessProblems`).
- Telangana gig-worker obligations unaddressed.
- No backups or monitoring.

### H. What is needed to launch safely?

See `90_DAY_LAUNCH_ROADMAP.md` §"Go/no-go checklist". In short:
- **Accounts:** Razorpay live + Route; Meta verification, templates, permanent token and a dedicated business number.
- **Legal:** Terms and Privacy published; written legal and tax advice including the Telangana fee; insurance.
- **Testing:** the 15 staging scenarios passed in Razorpay test mode on real phones; the P0/P1 gaps closed and their tests passing.
- **People and systems:** backups and monitoring live; 30 verified workers; support rota staffed.

### I. What decisions do you need from me?

Each has my recommended default; details are in `COMPLETE_PRODUCT_REQUIREMENTS.md` §12.

| # | Decision | My default |
|---|---|---|
| 1 | Fee model | Customer service fee 15% (business 12%), no worker fee in the pilot; the platform absorbs the gig welfare fees |
| 2 | Minimum job value | ₹300 (today it's ₹100) |
| 3 | Pilot categories | Moving/lifting, packing, furniture assembly, cleaning, errands, event help, office help. Exclude electrical, plumbing, gas, childcare and medical |
| 4 | Multi-person jobs | One verified tasker per booking in the pilot. For more people, the customer books several taskers ("Need 3 people?" creates 3 linked bookings). No unverified helpers |
| 5 | Cancellation policy | Free until 12h before; after that the customer loses the service fee plus 25% of the quote, paid to the tasker; tasker no-show = full refund + penalty |
| 6 | Payment timing | Pay at booking, held until completion (current design) |
| 7 | Bidding window | Close at the first of: 24h, 2h before the job, or the customer choosing |
| 8 | Support hours | 8 AM – 9 PM IST, 7 days, during the pilot |
| 9 | Pilot size | 30 workers, 100 invited customers, Gachibowli / Kondapur / Madhapur only, for 6 weeks |
| 10 | Business accounts | Pay per job by UPI or card in the pilot; monthly invoicing later |

### J. Overall product readiness

**Scoring method:** each dimension is rated 0–5 against what a controlled real-money pilot needs (5 = ready). The score is my judgement from the evidence shown; it is not a percentage.

| Dimension | Score | Evidence |
|---|---|---|
| Core functionality (code) | **3 / 5** | Core flows exist and are tested (62/62). Missing liquidity mechanics, scope changes, earnings, photos and business invoicing (`FEATURE_GAP_ANALYSIS.md`) |
| Testing | **3 / 5** | Strong automated coverage of state and money logic. No real-provider, real-device, load or usability testing yet |
| Security | **3.5 / 5** | Signatures, server-side payment verification, roles, co-sign, privacy masking, fuzzing. Missing: secrets manager, operator WhatsApp two-step verification policy, monitoring, pen-test |
| Integrations | **1 / 5** | WhatsApp: test number only, temporary token, no templates. Payments: none |
| Operations | **1 / 5** | No backups installed, no monitoring, no staff, no SOP drills, no verified workers |
| Regulatory | **0.5 / 5** | Consent and erasure exist in code; no published legal documents, tax registration, gig-law compliance or insurance |
