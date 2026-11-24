# Customer workflows

Each workflow lists the 12 required elements. **Status** gives the current implementation, with evidence. ✳ marks the recommended behaviour where it differs from today.

Common to all workflows:
- **Security:** the sender is identified only by the Meta-signed webhook's `from` number (`server.js`). Every command checks ownership of the job (`customer.js`).
- **Duplicates:** messages are deduplicated by `message_id` (`core.js:processMessage`).
- **Atomicity:** every state change runs inside one SQLite transaction.

---

## C1. First contact, language and consent
**Status:** ✅ `core.js:route`, `sendLanguagePicker`, `sendTerms`; tests `conversations.test.js:6,32`

| Element | Spec |
|---|---|
| 1 Trigger | Unknown number messages the business number |
| 2 Received | Any text, for example "hi", "నమస్తే" |
| 3 Presented | Welcome in the detected script + a language list (English/తెలుగు/हिंदी/Hinglish), then Terms + Privacy links with an "I agree" button |
| 4 Action | Picks a language; taps "I agree" (`AGREE`) |
| 5 Validation | Language in the allowed set; consent recorded only on AGREE |
| 6 DB | `users` row; `lang`; `terms_version`, `terms_accepted_at`; audit `terms_accepted` |
| 7 Notify others | — |
| 8 Timeout / retry | Re-prompted on any later message until AGREE; the session expires after 2 days |
| 9 Errors | Media before consent → "please type"; unknown text → terms again |
| 10 Rollback | `STOP` at any point → opted out (system message always sent) |
| 11 Security | Consent can't be bypassed: every non-HELP command needs AGREE |
| 12 End state | ✔ Menu shown · ✘ User never agrees (no data beyond phone and messages) |

## C2. Post a task
**Status:** ✅ `customer.js:startPost,continuePost,createTask,dispatchTask`; ❌ photos, ❌ number of workers, ❌ edit. Tests `conversations.test.js:6,42,71,79`

| Element | Spec |
|---|---|
| 1 Trigger | `POST` / "naya kaam" / "కొత్త పని" / menu tap |
| 2–4 Dialogue | Description (12–500 chars) → area name or 📍 pin → budget (₹) → date/time → review card with Yes/Cancel buttons. ✳ Add: optional photos (≤3), "How many people?" (1–5), urgency |
| 5 Validation | Pilot area only (`areas.js:isPilotArea`); budget ₹100–₹1,00,000 (✳ ₹300 minimum); time 1h–60 days ahead (`parse.js:parseWhen`); 5 posts/24h; sensitive keywords → review |
| 6 DB | `tasks` (status `open` or `review_pending`); `dispatches` per alerted tasker; audit |
| 7 Notify | Matching taskers get a job alert (template outside 24h); ops gets a moderation or no-match alert |
| 8 Timeout | Abandoned draft purged after 2 days ✅; ✳ reminder after 30 min of inactivity mid-draft |
| 9 Errors | Unknown area → list of served areas; bad budget/time → re-ask with an example; voice/photo → "please type" (✳ accept photos) |
| 10 Rollback | `CANCEL` discards the draft; `CANCELJOB` after posting (C6) |
| 11 Security | Rate limit 20 msgs/min; descriptions stored as literal text (SQL injection tested `audit.test.js:373`) |
| 12 End | ✔ `open` with alerts sent · ⏸ `review_pending` · ✘ `rejected` by ops (customer told why) |

## C3. Receive and compare offers
**Status:** 🟠 per-bid messages (✳ digest); list of top 10 ✅ `customer.js:status,offersForCustomer`; ❌ tasker profile/reviews view; ❌ bid window close

| Element | Spec |
|---|---|
| 1 Trigger | Tasker offers |
| 3 Presented | ✳ Bid digest (see `MATCHING_AND_BIDDING_DESIGN.md` §3.4); `STATUS HYD…` → interactive list (price, ★, jobs, km, total incl. fee) |
| 4 Action | Tap an offer (`ACCEPT n`); ✳ `PROFILE n`; ✳ `CLOSE HYD…` |
| 5 Validation | Only the task owner sees offers; only active offers from approved taskers |
| 8 Timeout | ✳ Reminders at 4h and 12h if offers are waiting; window closes at the earliest of 24h / start−2h |
| 9 Errors | No offers → ✳ nudge at 2h (raise budget / change time); expiry at start time ✅ |
| 12 End | ✔ Offer accepted (C4) · ✘ task expires; taskers notified (✳) |

## C4. Accept an offer and pay
**Status:** ✅ `customer.js:acceptOffer`, `payflow.js`, `service.js`; tests `journey.test.js:5,83,99`, `audit.test.js:140,177,199,214`. 🔒 Razorpay

| Element | Spec |
|---|---|
| 1 Trigger | `ACCEPT n` / list tap |
| 3 Presented | Price breakdown (quote + fee + GST) → Razorpay link valid for 60 min (or in-chat "Review and pay" if WhatsApp Pay is enabled) |
| 5 Validation | Task `open` and owned; offer active; tasker still approved with a linked account; payments configured (else an honest "not active") |
| 6 DB | Task `payment_pending`; offer `accepted`; `payments` row (`creating` → `awaiting_payment`); job `payment.create` |
| 7 Notify | Tasker: "selected, wait for BOOKED" |
| 8 Timeout | Link expiry 60 min + 10 min grace → task reopens, offer active again, link cancelled ✅ |
| 9 Errors | Link creation fails → customer told nobody was charged, ops alerted ✅; payment arrives late → auto-refund ✅; double payment → second refunded ✅ |
| 10 Rollback | `CANCELJOB` before paying → link cancelled ✅ (including mid-creation) |
| 11 Security | Booking only after server-side verification of status, amount, currency and reference ✅ |
| 12 End | ✔ `booked`; tasker share transferred **on hold** · ✘ back to `open` |

## C5. Job day: address, chat, arrival, completion, confirmation, review
**Status:** ✅ `customer.js:address,confirm,completeTask`, `support.js:relay,rate`, `worker.js:arrived,done`, `scheduler.js` auto-confirm; tests `journey.test.js:5`, `audit.test.js:18,36,339,416`

| Element | Spec |
|---|---|
| 1 Trigger | Booking confirmed |
| 3 Presented | "BOOKED with Ravi K." + instructions (ADDRESS, MSG); ✳ reminder the day before + 1h before |
| 4 Action | `ADDRESS HYD… …` → sent only to the tasker; `MSG` relay; "Confirm done" / "Report problem" buttons; `RATE HYD… 5 comment` |
| 5 Validation | Only the parties; phone numbers and UPI IDs masked; DONE refused before start−30m |
| 6 DB | `address_note` (purged 7 days after close); `relay_messages` (180 days); task → `in_progress` → `awaiting_confirmation` → `completed`; release job |
| 7 Notify | Arrival notice to the customer; completion request with buttons; payout notice to the tasker |
| 8 Timeout | Auto-confirm after 48h unless disputed ✅ |
| 9 Errors | Payout release failure → retries, finance alerted, tasker not told they were paid ✅ |
| 12 End | ✔ `completed` + review · ✘ `disputed` (C7) |

## C6. Cancel
**Status:** ✅ `customer.js:cancelJob`; tests `journey.test.js:124,141`, `audit.test.js:110`

| When | Behaviour |
|---|---|
| Draft / open / review | Free; bidders told ✅ |
| Payment pending | Free; link cancelled ✅ |
| Booked, ≥12h before start | Full refund; tasker share reversed; tasker told ✅ |
| Booked, <12h | Support ticket → ops `RESOLVE n split X` (customer refund X, tasker keeps the rest) ✅; ✳ automatic policy (fee + 25% of quote to the tasker) once the founder decides |
| In progress | Support ticket ✅ |

## C7. Problem, dispute, complaint
**Status:** ✅ `support.js:dispute,help`; `admin.js:RESOLVE`; tests `journey.test.js:169`, `audit.test.js:488`

| Element | Spec |
|---|---|
| Trigger | "Report problem" button / `DISPUTE HYD… text` / `HELP text` |
| Validation | Only the parties; 5–500 chars |
| DB | `tickets` (+ prior status); task → `disputed` if money is still held; auto-confirm cancelled |
| Notify | Other party asked for their side; ops alerted |
| Timeout | ✳ SLA: first response within 2 business hours; escalation after 24h |
| End | ✔ release / refund / split (co-signed) · complaint after payout → platform-funded goodwill only |

## C8. Tasker no-show
**Status:** ✅ `customer.js:noShow`; tests `audit.test.js:52,75`. ✳ Add a contest window for the tasker (see the fraud register)

## C9. Repeat booking ❌
✳ "Book Ravi again" button after a review → creates a task with a direct invite to that tasker (visible only to them for 2h, then normal waves).

## C10. Data rights
**Status:** ✅ `support.js:myData,erase`; test `conversations.test.js:221`
