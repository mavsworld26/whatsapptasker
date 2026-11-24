# Edge-case and failure matrix

| Column | Meaning |
|---|---|
| **Sev** | Impact: Critical / High / Medium / Low |
| **Lik** | Likelihood in the pilot: H / M / L |
| **Status** | ✅ handled + tested · 🟠 partly handled · ❌ not handled |
| **Test** | An existing test ID (file:line), or a proposed ID from `TEST_STRATEGY.md` |

Sorted by severity, then likelihood.

| # | Scenario | Sev | Lik | Detection | Prevention | Recovery | Owner | Status | Test |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Payment captured but booking not recorded (crash, race, late webhook) | Critical | M | Razorpay webhook + verification job; late-capture branch | Book only after verification; idempotent jobs | Auto full refund + finance alert (`payflow.js:markCaptured`) | Eng | ✅ | `journey.test.js:99` |
| 2 | Duplicate charge (customer pays twice) | Critical | L | Second provider payment ID on the same reference | Link `accept_partial=false`; one live payment per task (unique index) | Second payment auto-refunded | Eng | ✅ | `audit.test.js:177` |
| 3 | Payment webhook delivered twice / out of order | High | H | `provider_events` dedupe | Job dedupe keys | — | Eng | ✅ | `journey.test.js:69`, `http.test.js:42` |
| 4 | Spoofed payment webhook / fake screenshot | Critical | M | HMAC + server lookup | Never trust webhook or chat claims | — | Eng | ✅ | `journey.test.js:51`, `audit.test.js:199` |
| 5 | Duplicate payout / refund after a timeout | Critical | L | Check-before-create by reference | 10-min reconcile wait | Finance alert | Eng | ✅ | `audit.test.js:155,472` |
| 6 | Refund fails at the provider | High | L | Job failure → `markRefundFailed` | Keep the Razorpay balance funded | Finance fixes in the dashboard; customer told honestly | Finance | ✅ | `journey.test.js:215` |
| 7 | Payout release fails (linked account KYC issue) | High | M | Job failure alert | Approve taskers only with an activated linked account | Finance + tasker fix steps (✳ tasker message missing) | Finance | 🟠 | `audit.test.js:227` |
| 8 | Tasker marks done early to collect via auto-confirm | High | M | DONE time guard | ARRIVED/DONE windows; 48h dispute window | Dispute → refund | Eng/Ops | ✅ | `audit.test.js:18` |
| 9 | Customer chargeback after release | High | L | ❌ no dispute webhook | Clear receipts; confirmation record | ❌ needs a flow | Finance | ❌ | TS-PAY-12 |
| 10 | **Tasker asks for extra cash on site** | High | **H** | Customer complaint; chat keywords ("cash", "extra") | ✳ In-platform `EXTRA` price increase; T&C; masking | Dispute; warn/suspend tasker | Product/Ops | ❌ | TS-BID-20 |
| 11 | **Off-platform deal for repeat work** | High | **H** | Repeat customer–tasker pairs stop booking (analytics) | Value: guarantee, insurance, easy rebook; masking ✅ | Win-back; tasker policy | Product | 🟠 | TS-PRIV-03 |
| 12 | Fake tasker identity | Critical | M | In-person ID + police verification | Evidence refs; approval gate ✅ | Suspend; police report | Ops | ✅ (process) 🔒 (people) | `conversations.test.js:95` |
| 13 | Unsafe / illegal job request | Critical | M | Keyword moderation ✅; tasker `UNSAFE` ❌ | Category whitelist; terms | Reject job; block customer | Ops | 🟠 | `conversations.test.js:79` |
| 14 | Safety incident at a home | Critical | L | ❌ no SOS keyword | Verified people; masked numbers | 112; ops escalation SOP | Ops | ❌ | TS-SAFE-01 |
| 15 | Tasker no-show | High | M | Customer `NOSHOW` after start+30m | Day-before confirmation ✳ | Full refund; penalties; auto-suspend after 2 | Eng/Ops | ✅ (✳ confirmation) | `audit.test.js:52,75` |
| 16 | False no-show claim by the customer | Medium | M | Tasker complaint | ✳ Contest window with a location pin before the refund | Ops review | Product | ❌ | TS-DISP-08 |
| 17 | Customer no-show (tasker arrives, nobody home) | Medium | M | ❌ | ✳ `CUSTNOSHOW` with a pin | Cancellation fee to the tasker via ops split | Product | ❌ | TS-DISP-09 |
| 18 | Tasker late | Medium | H | ARRIVED timestamp vs start | Reminders ✳ | Goodwill refund / rating | Ops | 🟠 | TS-LIFE-05 |
| 19 | Scope change / inaccurate description | Medium | H | Chat; dispute | Photos ✳; `EXTRA` ✳ | Split resolution ✅ | Product | 🟠 | `audit.test.js:110` |
| 20 | Price disagreement after the job | Medium | M | Dispute | Agreed price recorded ✅ | Co-signed split ✅ | Ops | ✅ | `journey.test.js:169` |
| 21 | Disputed completion | High | M | Dispute holds money ✅ | Evidence: chat log, ✳ photos | Release/refund/split ✅ | Ops | ✅ | `journey.test.js:169` |
| 22 | Fake reviews | Medium | L | Reviews only from completed paid jobs ✅ | One review per job per side ✅ | Remove (✳ admin command) | Ops | 🟠 | `journey.test.js:5` |
| 23 | Customer disappears after posting | Low | H | No ACCEPT | ✳ Reminders; window close | Expire; taskers informed ✳ | Product | 🟠 | TS-BID-12 |
| 24 | Tasker unresponsive after selection | Medium | M | No ARRIVED; overdue alert ✅ | ✳ Day-before confirm | NOSHOW / ops | Ops | 🟠 | TS-LIFE-06 |
| 25 | Selected tasker unavailable before payment | Medium | M | Tasker cancels | — | Link cancelled; reselect ✅ | Eng | ✅ | `journey.test.js:151` |
| 26 | Two ACCEPTs at once / parallel users | High | M | Atomic transition | Single-writer DB | Second refused ✅ | Eng | ✅ | `audit.test.js:214,263` |
| 27 | Tasker double-booked at the same time | High | M | ❌ | ✳ Schedule-conflict filter | Reassign | Eng | ❌ | TS-MATCH-04 |
| 28 | Duplicate WhatsApp messages | Medium | H | message_id dedupe | — | — | Eng | ✅ | `conversations.test.js:174`, `http.test.js:19` |
| 29 | Notifications not delivered (no template / 131047 / user blocked) | High | **H** | Outbox status; delivery webhooks | Approved templates 🔒; digest | Resend when the window opens ✅ | Eng/Founder | 🟠 | `conversations.test.js:194`, `audit.test.js:299` |
| 30 | WhatsApp number restricted / quality drop | Critical | M | ❌ no quality monitoring | Digest, caps, quiet hours ✳; opt-in records | Backup number plan | Founder/Eng | ❌ | TS-OPS-04 |
| 31 | Messaging API outage | High | L | Send failures → retries ✅; ❌ alerting | — | Queue persists; resend ✅ | Eng | 🟠 | `audit.test.js:299` |
| 32 | Server / DB down or disk loss | Critical | L | ❌ monitoring | ❌ backups not installed | Restore from backup (untested) | Eng | ❌ | TS-OPS-01/02 |
| 33 | Support outside business hours | Medium | H | Ticket timestamps | ✳ Auto-reply with hours and emergency guidance | Next-morning queue | Ops | 🟠 | TS-SUP-03 |
| 34 | Personal data leak between parties | High | M | Masking; access checks | Never share phone numbers ✅ | Incident process | Eng | ✅ | `audit.test.js:416` |
| 35 | Operator account compromise | High | L | Audit log | Co-sign ✅; 2-step verification policy ✳ | Remove the number; review the audit | Founder | 🟠 | `audit.test.js:395` |
| 36 | Telangana welfare fee / worker registry not filed | High (legal) | H | — | ✳ Fee in pricing; registry export | Back-payment + penalties | Founder/Legal | ❌ | TS-COMP-01 |
| 37 | GST misclassification | High (legal) | M | — | CA opinion; invoice data ✳ | Amend returns | Founder/CA | ❌ | TS-COMP-02 |
| 38 | 100 bids flood the customer | Medium | M (at scale) | Measured in simulation | ✳ Digest + offer cap | — | Eng | ❌ | TS-BID-05 |
| 39 | No bids at all | High (liquidity) | H (early) | Offer count | ✳ Waves; recruit supply | ✳ Customer nudge + ops alert ✅ | Ops | 🟠 | TS-BID-10 |
| 40 | Voice-only users (low literacy) | Medium | M | Media type | Buttons and lists; Telugu/Hindi text | ✳ Ops callback for voice users | Product | 🟠 | `audit.test.js:327` |
