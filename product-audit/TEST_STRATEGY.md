# QA test strategy

## 1. Current automated suite (executed 24 Nov 2026 at `237fd44`)

| File | Tests | Result |
|---|---|---|
| `test/units.test.js` | 9 | 9 pass |
| `test/conversations.test.js` | 13 | 13 pass |
| `test/journey.test.js` | 12 | 12 pass |
| `test/http.test.js` | 3 | 3 pass |
| `test/audit.test.js` | 25 | 25 pass |
| **Total** | **62** | **62 pass, 0 fail** (≈0.8 s) |

**Limits:**
- Razorpay is the `FakeRazorpay` test double, and Meta sends are stubbed.
- There are no real-device, live-provider, load or usability tests.
- Passing simulations do **not** prove production readiness.

## 2. Test levels

| Level | Tooling | Where |
|---|---|---|
| Unit | `node:test` | `units.test.js` |
| Conversation / integration (in-process, real SQLite) | helpers `setup()`, `send()` | `conversations.test.js`, `journey.test.js`, `audit.test.js` |
| HTTP / webhook (real server, real HMAC) | `fetch` against `app.server` | `http.test.js`, `audit.test.js` |
| Provider sandbox | **Razorpay test mode**, Meta test number | Staging Droplet, manual + scripted (`docs/DEPLOYMENT.md` §7) |
| Load | k6 or a Node script posting signed webhooks to staging | To build (TS-LOAD-*) |
| Usability / language | Moderated sessions with 5 customers + 5 taskers per language | Pilot prep |

## 3. Test catalogue

**Status:**
- **A** = automated and passing (reference given)
- **P** = planned, automatable
- **M** = manual / sandbox
- **X** = blocked by an external dependency

| ID | Feature | Preconditions | Steps | Expected | Pri | Automatable | Status |
|---|---|---|---|---|---|---|---|
| TS-WA-01 | Webhook verification | Verify token set | GET with good/bad token | 200 challenge / 403 | P0 | Yes | A `http.test.js:19` |
| TS-WA-02 | Signature enforcement | App secret | POST unsigned / wrong / correct | 401/401/200 | P0 | Yes | A `http.test.js:19` |
| TS-WA-03 | Duplicate inbound | — | Same message id twice | Processed once | P0 | Yes | A `conversations.test.js:174` |
| TS-WA-04 | Malformed signed body / oversize | — | null, [], 1.1 MB | 200 ignored / 400 / 413, server up | P1 | Yes | A `audit.test.js:507` |
| TS-WA-05 | Template fallback outside 24h | Template configured | Message to an inactive user | Template sent | P0 | Yes / live X | A `conversations.test.js:194`; live X |
| TS-WA-06 | Opt-out | — | STOP, then events | Only the system confirmation; no alerts | P0 | Yes | A `conversations.test.js:174` |
| TS-WA-07 | Retry/backoff/permanent failure/131047 | — | Inject 500/400/131047 | Backoff; failed; waiting | P1 | Yes | A `audit.test.js:299` |
| TS-WA-08 | Photo on task | G23 built | Send an image while posting | Stored, shown to bidders | P1 | Yes | P |
| TS-WA-09 | Real-device rendering (lists/buttons, 4 languages, Android + iOS) | Staging | Manual script | Readable, truncation OK | P0 | No | M |
| TS-LANG-01..04 | Full journey per language | — | te/hi/en/hinglish | All replies in that language | P1 | Yes | A `audit.test.js:339`, `conversations.test.js:6,32` (✳ add en + hinglish full journey) |
| TS-LANG-05 | Voice/image/sticker | — | Send media | "Please type", draft kept | P1 | Yes | A `audit.test.js:327` |
| TS-INP-01 | Fuzz | — | 40 malicious inputs × 3 users | No crash, no state change | P0 | Yes | A `audit.test.js:373` |
| TS-POST-01..05 | Posting validation, limits, moderation | — | — | — | P0 | Yes | A `conversations.test.js:42,71,79` |
| TS-MATCH-01 | Wave 1 size + ranking | 50 taskers | Post | 10 alerts to the top-ranked | P1 | Yes | P (today 15, single wave) |
| TS-MATCH-02 | Wave 2 trigger | <3 offers at 30 min | Advance clock | +15 alerts, radius +3 km | P1 | Yes | P |
| TS-MATCH-03 | Alert caps / quiet hours | — | Many tasks at 22:00 | No non-urgent alerts | P1 | Yes | P |
| TS-MATCH-04 | Schedule conflict | Tasker booked 10:00 | Post 11:00 task | Tasker not alerted, can't bid | P1 | Yes | P |
| TS-MATCH-05 | Radius / skill gating | — | — | — | P0 | Yes | A `conversations.test.js:124`, `units.test.js:94` |
| TS-BID-01 | Offer / revise / withdraw | — | — | — | P0 | Yes | A `journey.test.js:5` |
| TS-BID-05 | Digest | 20 bids | Bids arrive | ≤5 customer bid messages | P1 | Yes | P (measured today: 1 per bid) |
| TS-BID-06 | Offer cap 20 | 25 taskers | 25 offers | 21st+ refused politely | P1 | Yes | P |
| TS-BID-07 | Revision cap 3 | — | 4 revisions | 4th refused | P2 | Yes | P |
| TS-BID-10 | No offers at 2h | — | Clock +2h | Customer nudge + ops alert | P1 | Yes | P |
| TS-BID-11/12 | Bid window close / customer disappears | — | Clock +24h | Closed; taskers informed | P1 | Yes | P |
| TS-BID-20..23 | Price increase flow | G14 | EXTRA → approve/decline/expire | Extra payment held; decline leaves the price | P1 | Yes | P |
| TS-RACE-01 | Double accept | 2 offers | 2 ACCEPTs | 1 booking, 1 payment | P0 | Yes | A `audit.test.js:214` |
| TS-RACE-02 | Parallel customers/taskers over HTTP | 4×4 | Parallel requests | Consistent | P0 | Yes | A `audit.test.js:263` |
| TS-RACE-03 | Cancel during link creation | — | — | Link cancelled, never sent | P0 | Yes | A `audit.test.js:140` |
| TS-PAY-01 | Happy path payment → hold → release | — | — | — | P0 | Yes / sandbox M | A `journey.test.js:5`; **M (Razorpay test mode) X** |
| TS-PAY-02 | Spoofed / mismatched / unknown payment | — | — | Never books | P0 | Yes | A `journey.test.js:51`, `audit.test.js:199` |
| TS-PAY-03 | Duplicate webhook | — | — | Once | P0 | Yes | A `journey.test.js:69` |
| TS-PAY-04 | Double payment | — | — | Second refunded | P0 | Yes | A `audit.test.js:177` |
| TS-PAY-05 | Late payment after expiry | — | — | Auto refund | P0 | Yes | A `journey.test.js:99` |
| TS-PAY-06 | Refund with reversal of an on-hold transfer | — | — | Reversal then refund | P0 | Yes / **sandbox X** | A `journey.test.js:124`; sandbox X |
| TS-PAY-07 | Timeouts don't duplicate (link/transfer/reversal/refund) | — | — | Single provider object | P0 | Yes | A `journey.test.js:83`, `audit.test.js:155,472` |
| TS-PAY-08 | Payout failure transient/permanent | — | — | Retry / alert, held | P0 | Yes | A `audit.test.js:227` |
| TS-PAY-09 | Refund failure | — | — | Alert, honest message | P0 | Yes | A `journey.test.js:215` |
| TS-PAY-10 | Refund cap | — | — | Never exceeds captured | P0 | Yes | A `audit.test.js:126` |
| TS-PAY-11 | Goodwill vs settle semantics | — | — | Payout untouched / split | P0 | Yes | A `audit.test.js:97,110,488` |
| TS-PAY-12 | Chargeback | G21 | Dispute webhook | Hold + ops | P1 | Yes | P |
| TS-PAY-15 | Earnings summary | G19 | — | Correct totals | P1 | Yes | P |
| TS-LIFE-01..04 | ARRIVED / DONE timing / fraudulent confirm / auto-confirm | — | — | — | P0 | Yes | A `audit.test.js:18,36`, `journey.test.js:202` |
| TS-LIFE-06 | Day-before confirmation | G17 | — | Ops alert on no reply | P1 | Yes | P |
| TS-DISP-01..07 | Cancel (free, late, tasker), dispute, no-show, complaint | — | — | — | P0 | Yes | A `journey.test.js:124,141,151,169`, `audit.test.js:52,75,110,488` |
| TS-DISP-08 | No-show contest | G16 | — | Refund waits | P1 | Yes | P |
| TS-DISP-09 | Customer no-show | G15 | — | Ticket + fee | P1 | Yes | P |
| TS-SEC-01 | Role matrix | — | — | — | P0 | Yes | A `audit.test.js:395` |
| TS-SEC-02 | Co-sign two-person rule | — | — | Same operator refused | P0 | Yes | A `journey.test.js:169` |
| TS-PRIV-01 | No phone sharing; outsiders blocked | — | — | — | P0 | Yes | A `audit.test.js:416` |
| TS-PRIV-02 | Erasure | — | — | — | P1 | Yes | A `conversations.test.js:221` |
| TS-DB-01 | File permissions, migration upgrade | — | — | 600; v1→v2 | P1 | Yes | A `audit.test.js:434` + manual upgrade check (run 24 Nov) |
| TS-OPS-01 | Backup + restore drill | Staging | Backup, wipe, restore | Same data | P0 | Partly | M |
| TS-OPS-02 | Uptime alert | Monitor | Stop the container | Alert in <5 min | P0 | No | M |
| TS-OPS-03 | Redeploy smoke | — | Pull, rebuild | /health 200, "hi" works | P0 | No | M |
| TS-OPS-04 | Quality-rating watch | — | — | Weekly check | P1 | No | M |
| TS-OPS-05 | Daily finance digest | G22 | — | Matches Razorpay | P1 | Yes | P |
| TS-COMP-01 | Worker registry export + welfare fee accrual | G06 | — | Correct file, 2% accrued | P0 | Yes | P |
| TS-SAFE-01/02 | SOS / UNSAFE | — | — | Ops paged | P1 | Yes | P |
| TS-SUP-03 | Out-of-hours auto-reply | G20 | — | Correct hours text | P1 | Yes | P |
| TS-LOAD-01 | 50 webhooks/s for 5 min against staging | Staging | k6 | p95 < 300 ms, no errors | P1 | Yes | P |

## 4. Multi-user simulations (to build as `scripts/simulate.js`; one-off run below)

| Scenario | Taskers | Customers | What it checks |
|---|---|---|---|
| S1 | 1 | 1 | Full journey |
| S5 | 5 | 3 | Competition, decline notices |
| S50 | 50 | 10 | Wave sizes, digest count |
| S100 | 100 | 20 | Offer cap, ranking fairness (alert distribution Gini) |
| S1000 | 1,000 | 100 | Matching latency, memory, alert caps |

## 5. Minimum set that must pass before any real-money pilot

1. All 62 current automated tests, plus the automated tests for every P1 gap built (G10–G24).
2. **Sandbox (Razorpay test mode):** TS-PAY-01, -05, -06, -07 (forced timeout where possible), -08, -11 on real phones, recorded with Razorpay IDs.
3. **Live Meta:** TS-WA-05 (approved template delivered), TS-WA-09 (rendering), TS-LANG full journey in Telugu and Hindi with native reviewers.
4. **Ops:** TS-OPS-01, -02, -03; incident tabletop drills.
5. **Compliance:** TS-COMP-01 signed off by legal.

## 6. One-off simulation of the current code (executed 24 Nov 2026)

**Method:** an in-process scratch script using the test helpers. It inserts N approved taskers (moving skill, 5 pilot areas), posts one task, has up to 100 taskers bid, and the customer opens STATUS. **This is not a load test of the server.**

| Taskers | Post + dispatch | Alerts sent | Bids accepted | Avg ms per bid | Customer msgs from bids | Peak RSS |
|---|---|---|---|---|---|---|
| 1 | 21 ms | 1 | 1/1 | 1.3 | 1 | 65 MB |
| 5 | 5 ms | 5 | 5/5 | 0.8 | 5 | 66 MB |
| 50 | 5 ms | **15** | 50/50 | 1.4 | **50** | 73 MB |
| 100 | 5 ms | **15** | 100/100 | 1.3 | **100** | 76 MB |
| 1,000 | 19 ms | **15** | 100/100 | 5.2 | **100** | 118 MB |

**Conclusions:**
- Compute is not the bottleneck at pilot scale.
- The **product mechanics** are the problem: a single 15-alert wave, and one customer message per bid (G10, G12).
- Bid cost grows with tasker count because each bid reloads every eligible tasker (`customer.js:eligibleWorkers`). That's fine for the pilot; index it before city scale.
