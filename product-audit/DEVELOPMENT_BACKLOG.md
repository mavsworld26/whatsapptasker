# Development backlog (implementable tasks)

**Effort:** S ≤1 day · M 2–3 days · L 4–6 days (one engineer, including tests).

**Definition of done**, for every task:
- code and tests merged;
- `npm test` green;
- i18n keys present in all 4 languages (checked by `units.test.js`);
- docs updated;
- deployed to staging and smoke-tested.

---

## Phase 1: critical / transaction / security

### DEV-01 Deploy the audited build and install the ops safety net (G07, G08) — S
- **Problem:** the Droplet runs pre-audit code, with no backups or monitoring.
- **Behaviour:**
  - deploy `main`;
  - hourly encrypted off-site backup;
  - uptime monitor on `/health`;
  - resize to 1 GB.
- **Dependencies:** founder access to the Droplet, a backup bucket, a monitor account.
- **Components:** `deploy/`, `scripts/backup.js`.
- **Acceptance:** a restore drill reproduces the data; an alert fires within 5 min of the container stopping.
- **Edge cases:** disk full; a backup during writes (`VACUUM INTO` is safe).
- **Tests:** TS-OPS-01..03 (manual).

### DEV-02 Telangana compliance plumbing (G06) — M
- **Problem:** the welfare fee and worker registry are not supported.
- **Behaviour:**
  - per released payout, accrue `welfare_fee_paise = rate × payout` (config `GIG_WELFARE_FEE_RATE`, default 0.02) in a new `levies` table;
  - `scripts/export-worker-registry.js` produces a CSV/JSON of onboarded workers in the format legal specifies.
- **Dependencies:** a legal opinion on the format and the rate.
- **Components:** `db.js` (migration), `service.js:'transfer.release'`, new script.
- **Acceptance:** after N releases, the levy total equals the sum of 2% of payouts; the export contains only workers with consent.
- **Edge cases:** partial reversal before release (levy on the net payout); erased workers.
- **Tests:** TS-COMP-01.

### DEV-03 Chargeback handling (G21) — M
- **Behaviour:** handle Razorpay `payment.dispute.created/won/lost` webhooks. If the transfer is still held, keep it held and open a finance ticket; on lost, reverse what is possible and record the loss.
- **Components:** `service.js:handleRazorpayEvent`, a new job.
- **Acceptance:** a dispute event on a held booking blocks release.
- **Edge cases:** already released.
- **Tests:** TS-PAY-12.

### DEV-04 Pricing update (G18) — S
- **Behaviour:** `MIN_TASK_RUPEES` (default 300), fee rates per founder decision, enforced in posting and offers.
- **Components:** `parse.js:parseRupees` callers, `config.js`, `payflow.js`.
- **Tests:** update `units.test.js`, `conversations.test.js:42`.

## Phase 2: essential journeys

### DEV-05 In-platform price increase `EXTRA` (G14) — L
- **Problem:** scope changes push cash off-platform.
- **Behaviour:**
  - the assigned tasker sends `EXTRA HYD… amount reason` (booked/in_progress only, ≤2 requests, total ≤100% of the quote);
  - the customer gets an Approve/Decline card;
  - Approve → a new payment line (`payments.kind='extra'`) via a Payment Link → verified → a second Route transfer on hold;
  - Decline / 2h timeout → the tasker is told.
- **Components:** `worker.js`, `customer.js`, `payflow.js`, `service.js`, `db.js` (migration: `payments.kind`, allow multiple live payments per task with kind).
- **Acceptance:** completion releases both transfers; a full refund reverses both; a dispute holds both.
- **Edge cases:** EXTRA during a dispute (refused); payment after decline (auto-refund); concurrent EXTRA requests.
- **Tests:** TS-BID-20..23.

### DEV-06 Tasker reports: `CUSTNOSHOW`, `UNSAFE`, `SOS` (G15) — M
- **Behaviour:** each requires a location pin within 300 m of the task location (pin task) or ops call-back; opens a ticket with high priority; `SOS` pages all super operators immediately and replies with 112 guidance.
- **Tests:** TS-DISP-09, TS-SAFE-01/02.

### DEV-07 No-show contest window (G16) — S
- **Behaviour:** `NOSHOW` → state `noshow_pending` for 30 min; the tasker can reply `HERE HYD…` with a pin, which converts it to a dispute; otherwise the refund executes.
- **Tests:** TS-DISP-08; update `audit.test.js:52,75`.

### DEV-08 Reminders and day-before confirmation (G17) — M
- **Behaviour:**
  - at start−18h the tasker gets a "Confirm you're coming" button; no reply by start−12h → ops alert and the customer is told a backup is being arranged;
  - the customer gets a reminder at start−2h.
- **Tests:** TS-LIFE-06.

### DEV-09 Earnings + payout-failure guidance (G19) — S. Tests: TS-PAY-15.

### DEV-10 Photos on tasks (G23) — L
- **Behaviour:** accept ≤3 images during posting; a job downloads them via the media ID → URL (within 5 min) → private object storage; bidders get the images in the alert (inside the window) or a "send PHOTOS HYD…" pull.
- **Dependencies:** storage bucket; DPDP notice update.
- **Tests:** TS-WA-08.

## Phase 3: notifications, bidding, matching

### DEV-11 Notification waves + alert caps + quiet hours (G10) — L
- **Components:** `customer.js:dispatchTask` → `matching.js:planWave`, `scheduler.js`, `dispatches.wave`.
- **Acceptance:** per `MATCHING_AND_BIDDING_DESIGN.md` §3.3.
- **Tests:** TS-MATCH-01..03, TS-BID-10.

### DEV-12 Schedule-conflict filter (G11) — S. Tests: TS-MATCH-04.

### DEV-13 Bid digest, offer cap, revision cap (G12) — M. Tests: TS-BID-05..07.

### DEV-14 Bid window + `CLOSE` + customer reminders (G13) — M. Tests: TS-BID-11,12.

### DEV-15 Explicit job-alert opt-in + delivered-reach metrics (G24, G38) — S

## Phase 4: payments, refunds, support

### DEV-16 Daily founder/finance digest + Razorpay reconciliation (G22) — M

### DEV-17 Out-of-hours auto-reply, ticket assignment, SLA timers (G20) — M

### DEV-18 Business GSTIN + invoice data/PDF (G33) — L (after the CA's position)

### DEV-19 Internal admin web console, read-only first (G36) — L
Behind SSO or basic auth plus an IP allowlist; never exposed publicly through Caddy without auth.

### DEV-20 Template set revision (G03 code side) — S
Split `generic_update`; add reminder/digest templates; keep `docs/WHATSAPP_TEMPLATES.md` in sync.

## Phase 5: tests and readiness

### DEV-21 `scripts/simulate.js` (S1–S1000) + k6 load script (TS-LOAD-01) — M

### DEV-22 Full English + Hinglish journey tests; language QA checklist — S

### DEV-23 Pilot readiness command (`npm run check:pilot`) — S
Combines `check:config`, migration version, template presence, backup recency and the last restore drill date.

## Phase 6: pilot preparation (non-code)
Verification of 30 taskers, insurance, support rota, legal documents, the staging test plan with evidence, the go/no-go review.

## Later (P2/P3)
DEV-30 rebook favourite · DEV-31 `PROFILE n` view · DEV-32 tasker profile editing · DEV-33 linked multi-worker bookings · DEV-34 `ASK` questions · DEV-35 WhatsApp Flows · DEV-36 analytics funnel · DEV-37 voice transcription · DEV-38 WhatsApp Pay · DEV-39 Postgres.
