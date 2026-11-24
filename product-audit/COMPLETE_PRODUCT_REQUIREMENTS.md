# Product requirements: HYD Tasks (WhatsApp-only local services marketplace)

Version 1.0 · 24 Nov 2026 · Owner: CPO

> **Status labels:** ✅ built and tested · 🟠 partial · ❌ to build · 🔒 external.
> **Evidence** for existing behaviour is in `EXECUTIVE_AUDIT.md`. Detailed flows live in the workflow documents. This PRD is the contract they refer to.

## 1. Vision

The most trusted way in Hyderabad to get everyday tasks done by verified local people: posted, booked, paid and resolved **entirely in WhatsApp**, in the user's own language.

## 2. Target users and problems

| Persona | Description | Core problem | What success looks like |
|---|---|---|---|
| **Lakshmi**, 34, Gachibowli homeowner (Telugu/English) | Moving flats, assembling furniture | Doesn't trust random helpers; can't get quotes quickly; no recourse if things go wrong | 3 good quotes within 2h, a verified tasker, money back if it goes wrong |
| **Arjun**, 29, IT employee in Kondapur (English/Hinglish) | Errands, cleaning before guests | No time; apps for every service | One WhatsApp chat, pay by UPI, done |
| **Ravi**, 26, tasker from Kothaguda (Telugu/Hindi, two-wheeler) | Lifting, packing, small repairs | Irregular work; customers haggle or don't pay | Steady nearby jobs, guaranteed pay in days, fair ratings |
| **Café owner in Madhapur** (business) | Event setup, shop help | Agencies are slow and costly; needs GST invoices | Book 3 helpers for Saturday in 10 minutes, with an invoice |
| **Ops agent** (internal) | Verification, disputes, support | Needs fast, safe tools and clear rules | Resolve cases in under 15 minutes with an audit trail |

## 3. Business objectives (pilot, 6 weeks)

| Metric | Target |
|---|---|
| Booked jobs | 150 |
| Fill rate (task with ≥1 offer in 2h) | ≥80% |
| Post → booking conversion | ≥35% |
| Completion without dispute | ≥90% |
| 30-day customer repeat rate | ≥25% |
| Median tasker earnings on the platform | ≥₹6,000/month among active taskers |
| Unauthorised money movements | **Zero** |

## 4. Scope

**In the MVP:**
- Household and business task posting.
- Verified taskers, waves of alerts, bidding.
- Payment at booking, held via Razorpay Route.
- Start and complete, confirm or auto-confirm, reviews.
- Cancellation, no-show and dispute policies.
- Price increase (EXTRA), support tickets.
- 4 languages, photos.
- Operator console (WhatsApp + internal web, read-only first).
- Compliance plumbing.

**Out of the MVP:** voice transcription, in-chat WhatsApp Pay, referrals, recurring jobs, monthly B2B invoicing, licensed trades, care work.

## 5. Functional requirements

Each line is testable. Test IDs reference `TEST_STRATEGY.md`.

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-01 | Onboarding with language choice and recorded consent | No command except HELP works before AGREE; consent version and time stored | ✅ TS-WA… `conversations.test.js:6` |
| FR-02 | Post a task: description, area/pin, budget, time, optional ≤3 photos, number of workers | Invalid inputs re-prompted with examples; pilot areas only; ≥₹300; 1h–60d ahead | 🟠 (no photos, ₹100 minimum) |
| FR-03 | Sensitive-task moderation | Keyword or category hits never alert taskers until an ops RELEASE | ✅ |
| FR-04 | Matching eligibility: verified, skill, radius, no schedule conflict, caps, quiet hours | A tasker failing any filter neither receives an alert nor can bid | 🟠 (conflict, caps, quiet hours ❌) |
| FR-05 | Notification waves per `MATCHING_AND_BIDDING_DESIGN.md` §3.3 | Wave 2 fires only if <3 offers at T+30m; ≤40 alerts per task | ❌ |
| FR-06 | Offers: create, revise (≤3), withdraw; ≤20 per task | Caps enforced with polite messages | 🟠 (caps ❌) |
| FR-07 | Customer bid digest | ≤5 bid-related customer messages per task | ❌ |
| FR-08 | Offer comparison and tasker profile | List shows price, total, ★, jobs, km; `PROFILE n` shows badges and 3 review snippets | 🟠 |
| FR-09 | Bid window and `CLOSE` | Closes at the earliest of 24h / start−2h / selection; bidders informed | ❌ |
| FR-10 | Accept → payment → booking | Booking only after server-side verification; one live payment per task; expiry reopens | ✅ / 🔒 provider |
| FR-11 | Funds held until completion via Route on-hold transfer | No release before completion or an approved settlement | ✅ / 🔒 |
| FR-12 | Address and masked chat | Address only to the assigned tasker; phone numbers and UPI IDs masked; purged 7 days after close | ✅ |
| FR-13 | ARRIVED / DONE timing guards | ARRIVED ≥ start−2h; DONE ≥ start−30m | ✅ |
| FR-14 | Price increase (EXTRA) | Customer approval and separate verified payment before the extra is owed | ❌ |
| FR-15 | Confirm / auto-confirm 48h / dispute | Dispute freezes auto-confirm and payout | ✅ |
| FR-16 | Cancellation policy | Free ≥12h; <12h per the founder's fee policy; tasker cancel → refund + reopen; penalties | ✅ / 🟠 (automatic late fee pending decision) |
| FR-17 | No-show (both directions) with contest window | Refund waits 30 min for a tasker contest; customer no-show ticket | 🟠 |
| FR-18 | Reviews both ways, only after completion | One per side per job | ✅ |
| FR-19 | Support tickets with SLA and out-of-hours auto-reply | First response ≤2 business hours | 🟠 |
| FR-20 | Operator roles, two-person co-sign for money | Requester can't co-sign; every action audited | ✅ |
| FR-21 | Refund semantics (full / settle / goodwill) | Per `ADMIN_WORKFLOWS.md` A4 | ✅ |
| FR-22 | Tasker earnings | Matches released transfers | ❌ |
| FR-23 | Business profile + GST invoice data | GSTIN validated; invoice data per the CA spec | ❌ |
| FR-24 | Data rights | MYDATA, erasure (financial records retained) | ✅ |
| FR-25 | Compliance: welfare-fee accrual + worker registry export | Per the legal spec | ❌ |
| FR-26 | Repeat booking | "Book again" invites that tasker first | ❌ (P2) |

## 6. Non-functional requirements

| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-01 | Webhook acknowledgement latency | p95 < 300 ms at 50 msg/s | Untested (TS-LOAD-01) |
| NFR-02 | Message idempotency | Exactly-once state effects per message ID / provider event | ✅ |
| NFR-03 | Money correctness | No booking without verified capture; no duplicate provider objects; refunds ≤ captured | ✅ (test double) |
| NFR-04 | Availability | 99.5% monthly in the pilot; uptime monitoring | ❌ monitoring |
| NFR-05 | Durability | RPO ≤1h (hourly off-site backup), RTO ≤2h | ❌ installed |
| NFR-06 | Security | HMAC webhooks; least-privilege roles; secrets only in env/secret store; DB file 600; no PII in logs | ✅ / 🟠 (secrets manager) |
| NFR-07 | Privacy | DPDP-aligned notice, consent, retention, erasure | 🟠 (legal docs 🔒) |
| NFR-08 | Localisation | All user-facing strings in 4 languages, native-reviewed | 🟠 |
| NFR-09 | Accessibility | Every step completable with buttons/lists or short words; no step requires reading English | 🟠 |
| NFR-10 | Scalability | Pilot: single instance (SQLite). City: Postgres + queue | ✅ pilot / ❌ city |

## 7. Lifecycles

- **Task / booking:** state diagram in `MATCHING_AND_BIDDING_DESIGN.md` §3.6.
- **Tasker:** `TASKER_WORKFLOWS.md` T1.
- **Finance action:** `ADMIN_WORKFLOWS.md` A4.

**Offer lifecycle**

| From | Event | To |
|---|---|---|
| — | OFFER | active |
| active | OFFER again (≤3) | active (amount updated) |
| active | WITHDRAW / tasker suspended | withdrawn |
| active | customer ACCEPT | accepted |
| active | another offer booked / task closed | declined |
| accepted | payment expired / failed | active |
| accepted | tasker cancels | withdrawn |
| declined | selected tasker cancelled after booking | active (re-offered) |

**Payment lifecycle**

| From | Event | To |
|---|---|---|
| — | ACCEPT | creating |
| creating | link created | awaiting_payment |
| creating | provider error | failed |
| creating / awaiting_payment | expiry / cancel | expired / cancelled (link cancelled) |
| awaiting_payment | verified capture | captured |
| expired / cancelled | late capture | refunded (automatic) |
| captured | full refund | refunded |
| captured | partial refund | partially_refunded |

## 8. Notification rules (summary)

| Rule | Value |
|---|---|
| Message delivery | Free-form only inside the 24h window; otherwise an approved template, or wait for the user |
| Tasker alerts | ≤10/day; quiet hours 21:00–07:00 IST except urgent jobs |
| Customer bid messages | ≤5 per task |
| Reminders | Day-before tasker confirmation; customer reminder 2h before start |
| Opt-out | STOP always honoured; one system confirmation |
| Language | Every message in the user's chosen language; templates in te/hi/en (Hinglish → en) |

## 9. Data model (current, `src/db.js`; ✳ = proposed additions)

```mermaid
erDiagram
  users ||--o| worker_profiles : "is"
  users ||--o{ tasks : "posts"
  tasks ||--o{ offers : "receives"
  tasks ||--o{ dispatches : "alerts"
  tasks ||--o{ payments : "paid by"
  payments ||--o| transfers : "settles to tasker"
  payments ||--o{ refunds : "refunded by"
  tasks ||--o{ tickets : "support/disputes"
  tickets ||--o{ ticket_messages : ""
  tasks ||--o{ reviews : ""
  tasks ||--o{ relay_messages : "masked chat"
  tasks ||--o{ financial_actions : "co-signed ops"
  worker_profiles ||--o{ worker_checks : "verification evidence"
  users { text phone PK; text lang; text role; int terms_accepted_at; int blocked }
  tasks { int id PK; text status; int scheduled_at; int budget_paise; text area; real lat; real lng }
  offers { int id PK; int task_id; text worker_phone; int amount_paise; text status }
  payments { int id PK; text reference UK; int amount_paise; text status; text provider_payment_id UK }
  transfers { int id PK; int payment_id UK; text status; int reversed_paise }
```

Other tables: `jobs`, `outbox`, `inbound_events`, `provider_events`, `sessions`, `rate_limits`, `audit`, `schema_migrations`.

✳ Proposed tables: `businesses`, `levies`, `task_media`, `notification_waves` (or `dispatches.wave`), `payments.kind` (extra), `consents` (job-alert opt-in).

## 10. Permissions

| Action | Customer | Assigned tasker | Other tasker | support | verifier | finance | super |
|---|---|---|---|---|---|---|---|
| View the own task and its offers | ✔ | task only | open-task summary if eligible | ✔ | ✔ | ✔ | ✔ |
| Accept / cancel / confirm / no-show | ✔ | — | — | — | — | — | — |
| Offer / arrive / done / extra | — | ✔ | offer only | — | — | — | — |
| Chat relay / address | ✔ | ✔ | — | read in a ticket | — | — | ✔ |
| Approve / suspend taskers, moderate | — | — | — | — | ✔ | — | ✔ |
| Reply to tickets | — | — | — | ✔ | — | — | ✔ |
| Request / co-sign refunds and payouts | — | — | — | — | — | ✔ | ✔ |

## 11. Analytics and expansion gates

| Metric | Gate to expand beyond Gachibowli / Kondapur / Madhapur |
|---|---|
| Weekly booked jobs | ≥75 for 3 consecutive weeks |
| Fill rate (≥1 offer in 2h) | ≥80% |
| Median offers per task | 3–8 |
| Post → book conversion | ≥35% |
| Completion without dispute | ≥90%; dispute rate <5%; no-show <3% |
| Repeat rate (30-day) | ≥25% |
| Active taskers earning ≥₹6k/month | ≥20 |
| Support tickets per booked job | <0.3 |
| Contribution margin per job | ≥₹0 including support (target) |
| Payment success (link → captured) | ≥85% |

**Assumptions to validate in the field:** tasker response rate; customer price sensitivity to a 15% fee; willingness to prepay; UPI link completion rate; acceptable radius; demand mix by category; business invoice needs.

## 12. Founder decisions (defaults recommended)

| # | Decision | Recommended default | Consequence if different |
|---|---|---|---|
| D1 | Fee model | Customer fee 15% (business 12%), minimum ₹49, no tasker fee | A tasker fee eases margin but slows supply growth |
| D2 | Minimum task | ₹300 | Lower minimum = negative margin per job |
| D3 | Categories | moving, packing, assembly, cleaning, errands, event, office | Adding licensed trades needs licence checks and insurance |
| D4 | Multi-person jobs | Linked bookings of verified taskers only | Unverified helpers = safety and legal risk |
| D5 | Late-cancel policy | <12h: customer pays fee + 25% of the quote to the tasker | Too lenient hurts taskers; too strict hurts conversion |
| D6 | Auto-confirm | 48h | Shorter is better for taskers; longer for customers |
| D7 | Bid window | 24h / start−2h | — |
| D8 | Support hours | 8 AM – 9 PM, 7 days | Night jobs need an on-call rota |
| D9 | Pilot size | 30 taskers, 100 invited customers, 6 weeks | — |
| D10 | Business billing | Pay per job in the pilot | Credit terms add credit risk |
| D11 | Female-tasker preference option | Offer it if supply allows | Inclusion and safety benefit; matching complexity |
