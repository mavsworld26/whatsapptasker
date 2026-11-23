# Operator runbook

Operators use their own WhatsApp numbers, listed in `ADMIN_PHONES` with roles. Send `OPSHELP` for the command list. Every operator action is written to the `audit` table with the operator's number.

| Role | Can do |
|---|---|
| support | STATS, JOBS, JOB, TICKETS, TICKET, REPLY, REPLYALL, CLOSE |
| verifier | PENDING, WORKER, CHECK, LINKACC, APPROVE, REJECT, SUSPEND, REINSTATE, REVIEWQ, RELEASE, REJECTJOB, BLOCK, UNBLOCK |
| finance | RESOLVE, REFUND, PAYOUT, ACTIONS, COSIGN, DECLINE |
| super | everything |

## Tasker verification SOP

1. A new application alert arrives (`OPS: New tasker application …`). Call the applicant from your official number.
2. **Identity**: check an original government ID in person or through DigiLocker. Never ask for ID photos or numbers on WhatsApp. Record it with `CHECK 91… identity KYC-2026-0012`, using a case reference from your secure KYC store.
3. **Police verification** through the official Hyderabad/Cyberabad process. Then `CHECK 91… police PV-REF-…`
4. **Interview** (and a skills trial for assembly or handyman work): `CHECK 91… interview INT-…` and optionally `CHECK 91… skills …`
5. **Payout**: in the Razorpay Dashboard → Route → create a linked account. Razorpay collects bank and KYC details. Once it is activated: `LINKACC 91… acc_…`
6. `APPROVE 91…`. The system refuses until steps 2–5 are recorded.
7. Low ratings (≤2★), repeated cancellations or complaints: `SUSPEND 91… reason`. This withdraws their active offers.

## Moderation

Jobs that mention electrical, gas, childcare, eldercare, medical, cash handling, weapons, alcohol and similar terms, or that cannot be categorised, wait in `REVIEWQ`. Use `RELEASE HYD…` only when the work is lawful, safe and suitable for unlicensed taskers. Otherwise use `REJECTJOB HYD… reason`. The customer sees the reason.

## Disputes and refunds

- A disputed job is **on hold**: auto-confirm stops, and the tasker's money stays in the on-hold Route transfer.
- `TICKET 7` shows the complaint, both sides' messages and the recent relayed chat. Ask both parties for their side with `REPLYALL 7 …`.
- Decide with `RESOLVE 7 release|refund|split <rupees> note`:
  - `release`: the tasker is paid in full.
  - `refund`: the customer gets the full amount (worker share reversed, fee refunded).
  - `split 200`: the customer gets ₹200, taken from the tasker's share; the rest is released to the tasker.
- With `FINANCE_REQUIRE_COSIGN=true`, a **second** finance operator must send `COSIGN <id>` (or `DECLINE <id> reason`). The requester cannot co-sign.
- Goodwill or late-cancellation refunds: `REFUND HYD… full|<rupees> reason`. This also needs a co-sign.
- After a payout is released, a refund comes from platform funds. Finance is alerted and must recover the money manually if appropriate.
- Refund failures (`❗ Refund … FAILED`) must be fixed in the Razorpay Dashboard the same day. The customer has already been told support is handling it.

## Daily checks

- `STATS`: failed jobs or failed messages above 0 need investigation (`docker compose logs app | grep job.error`).
- `TICKETS`: answer within the published support hours.
- `JOBS booked`: the system alerts on bookings not marked DONE 12h after start. Call both parties.
- Razorpay Dashboard: on-hold transfers older than 7 days, failed refunds, and settlement reports matching `STATS` totals.

## Incidents

- **Safety incident reported**: tell the reporter to call 112 if anyone is in danger. `SUSPEND` the tasker, open a dispute so money stays on hold, escalate to the founder, and keep the evidence (`TICKET` output and audit rows).
- **Suspected leaked Meta token or Razorpay key**: rotate it immediately in Meta or Razorpay, update `.env`, and run `docker compose up -d`.
- **Database issue**: stop the app, restore the latest verified backup (DEPLOYMENT.md §6), start the app, then reconcile with the Razorpay Dashboard for the gap period. Every provider call is keyed by a reference (`HYD0001-P1`, `T<id>`, `R<id>`), so you can match records.
- **Messages not delivered**: check `STATS`, the Meta WhatsApp Manager quality rating and messaging limits, and template status.
