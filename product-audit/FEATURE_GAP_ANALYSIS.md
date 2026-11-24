# Feature gap analysis against the existing code (`237fd44`)

**Priority:** **P0** launch blocker · **P1** required for a reliable MVP · **P2** important · **P3** future.

**Type:** **M** genuinely missing · **I** exists but needs improvement · **X** external (credentials, approval or legal; not code).

## P0: launch blockers

| ID | Feature | Expected | Existing | Gap | Type | Fix | Affected modules | Required tests |
|---|---|---|---|---|---|---|---|---|
| G01 | Razorpay account + Route | Real payment, hold, release and refund in test, then live mode | Client + jobs tested against a test double only | Never exercised | X | Founder obtains test keys + Route; run the staging plan | `payments/*` (no code change expected) | TS-PAY-01..10 against Razorpay **test mode** |
| G02 | On-hold transfer reversal confirmed | Refund after booking works | Assumed | Unconfirmed provider behaviour | X | Written confirmation from Razorpay + test-mode proof | `service.js:'refund.execute'` | TS-PAY-06 |
| G03 | Approved templates | Job alerts reach taskers outside 24h | Fallback logic ✅ | No templates | X + I | Submit templates; split `generic_update`; add digest/reminder templates | `whatsapp.js`, `i18n.js`, `docs/WHATSAPP_TEMPLATES.md` | TS-WA-05 (live) |
| G04 | Permanent Meta token, verified business, dedicated number | Stable messaging | Test number, 24h token | — | X | Founder | config | TS-WA-01 (live) |
| G05 | Legal documents | Published Terms, Privacy, refund policy; grievance officer | `TERMS_VERSION=draft-unapproved` | — | X | Lawyer | config | `units.test.js:117` (gate exists) |
| G06 | Telangana gig-worker compliance | Aggregator registration; worker database export; ≤2% welfare fee on payouts paid by the platform | None | Missing | X + M | Lawyer confirms; **engineering**: `scripts/export-worker-registry.js` + fee accrual ledger line per payout | `payflow.js`, new script | TS-COMP-01 |
| G07 | Backups + monitoring on the Droplet | Hourly encrypted off-site backup; uptime alert | Scripts only | Not installed | I | Install cron + monitor; restore drill | `deploy/` | TS-OPS-01, TS-OPS-02 |
| G08 | Redeploy the audited code | Droplet runs `237fd44`+ | Runs `2a7c815` | Stale | I | `git pull` + rebuild | — | Smoke TS-OPS-03 |

## P1: required for a reliable MVP

| ID | Feature | Expected | Existing (evidence) | Gap | Type | Fix | Modules | Tests |
|---|---|---|---|---|---|---|---|---|
| G10 | Notification waves | Wave 1 (10) → wave 2 (+15, +3 km) if <3 offers in 30 min → customer nudge + ops at 2h | Single wave of 15 (`customer.js:dispatchTask`) | Liquidity holes | I | Scheduler-driven waves; `dispatches.wave` column | `customer.js`, `scheduler.js`, `matching.js`, `db.js` | TS-MATCH-01..03, TS-BID-10 |
| G11 | Schedule-conflict filter | Busy taskers excluded within ±3h | Capacity ≥3 only (`matching.js:33`) | Double-booking | M | Add a booked-times query to eligibility | `customer.js:eligibleWorkers`, `matching.js` | TS-MATCH-04 |
| G12 | Bid digest + caps | ≤5 bid messages per task; ≤20 offers; ≤3 revisions | One message per bid/revision (`worker.js:makeOffer`); measured 100 → 100 | Spam, cost, quality risk | I | Digest scheduler; caps | `worker.js`, `scheduler.js`, `i18n.js` | TS-BID-05..08 |
| G13 | Bid window / close | Earliest of 24h / start−2h / selection; `CLOSE` | Open until start (`scheduler.js`) | Uncertainty | M | `bids_close_at`; close job | `customer.js`, `scheduler.js` | TS-BID-11,12 |
| G14 | In-platform price increase | `EXTRA` → customer approves → extra payment → extra held transfer | None | Main cash-leakage path | M | New flow + payment line type | `worker.js`, `payflow.js`, `service.js`, `db.js` | TS-BID-20..23 |
| G15 | Customer no-show / unsafe-site reports | `CUSTNOSHOW`, `UNSAFE` with a location pin → ops ticket; fee policy | None | Tasker unprotected | M | Commands + tickets | `worker.js`, `support.js` | TS-DISP-09, TS-SAFE-02 |
| G16 | No-show contest window | Tasker can contest within 30 min with a pin before the refund executes | Immediate refund (`customer.js:noShow`) | False claims | I | Pending state + timer | `customer.js`, `scheduler.js` | TS-DISP-08 |
| G17 | Reminders | Day-before tasker confirmation; customer reminders | None | No-shows | M | Scheduler + templates | `scheduler.js` | TS-LIFE-06 |
| G18 | Minimum task value + fee model update | ₹300 minimum; fees per founder decision; welfare fee accounted | ₹100; 18/15% | Unit economics | I | Config + pricing | `parse.js`, `config.js`, `payflow.js` | `units.test.js` update |
| G19 | Tasker earnings + payout-failure guidance | `EARNINGS`; KYC-fail message | None | Retention | M | Read model | `worker.js` | TS-PAY-15 |
| G20 | Out-of-hours auto-reply, support SLA timers | Expectation-setting | None | Frustration | M | Scheduler + config | `support.js` | TS-SUP-03 |
| G21 | Chargeback handling | Dispute webhook → hold → ops | None | Money loss | M | Webhook + job | `service.js`, `server.js` | TS-PAY-12 |
| G22 | Founder/finance daily digest + reconciliation | Daily summary; Razorpay settlement match | `STATS` only | Blind spots | M | Scheduled report | `admin.js`, new job | TS-OPS-05 |
| G23 | Photos on tasks | ≤3 photos stored (private bucket), shared with bidders | Rejected | Mis-quotes | M | Media download job + storage | `whatsapp.js`, `customer.js`, storage | TS-WA-08 |
| G24 | Explicit job-alert opt-in record | Stored consent for Meta policy | Implicit via AVAILABLE | Policy risk | I | Wording + field | `worker.js`, `db.js` | TS-WA-06 |
| G25 | Telugu/Hindi native review | Correct, natural copy | Engineer-drafted | Trust | X | Reviewer | `i18n.js` | Language checklist |

## P2: important improvements

| ID | Feature | Existing | Fix |
|---|---|---|---|
| G30 | Rebook favourite tasker | None | Direct-invite task |
| G31 | Tasker profile view for customers (badges, review snippets) | Rating number only | `PROFILE n` |
| G32 | Tasker profile editing | None | `EDIT …` commands |
| G33 | Business GSTIN + invoice data | Name only | `businesses` table; invoice job |
| G34 | Multi-worker linked bookings | None | `workers_needed` |
| G35 | Pre-booking questions (`ASK`) | None | Anonymous relay to bidders |
| G36 | Internal web admin console | WhatsApp commands only | Authenticated internal UI |
| G37 | WhatsApp Flows for posting and applying | Chat steps | Flows (in window) |
| G38 | Delivery-based reach metrics | Failure only | Use delivered/read statuses |
| G39 | Analytics funnel (post → offer → book → complete → repeat) | Counts | Event table + report |

## P3: future

Voice-note transcription (Telugu/Hindi), WhatsApp Pay in-chat, referral programme, fixed-price catalogue for standard jobs, Postgres migration, multi-city numbers, recurring business tasks, monthly invoicing, KYC vendor automation, insurance integration.

## Already exists but needs improvement (summary)

G08, G10, G12, G16, G18, G24 (and I-type rows above). Everything else in P1 is genuinely missing.
