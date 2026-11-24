# Airtasker (and peers) benchmark → what we should build

## Method and honesty notes

- **Verified behaviour** comes from Airtasker's public help, policy and blog pages, retrieved 24 Nov 2026. Rules vary by country and change over time, and **some sources are old** (for example the 2021 "increase price" post), so treat figures as indicative.
- **Peer comparisons** (Urban Company, TaskRabbit, Thumbtack, Upwork) are from general industry knowledge. They were **not re-verified in this audit** and are labelled *(unverified)*.
- I **did not** inspect any proprietary code or designs.

**Sources:**
- [Airtasker Accountability Framework / cancellation policy](https://www.airtasker.com/au/cancellation-policy)
- [Customer cancellation policy](https://support.airtasker.com/hc/en-au/articles/23416253011865-What-is-the-Cancellation-policy-for-Customers)
- [Tasker cancellation policy](https://support.airtasker.com/hc/en-au/articles/23418633460505-What-is-the-Cancellation-policy-for-Taskers)
- [Payment guidelines](https://support.airtasker.com/hc/en-us/articles/225553508-What-are-the-Payment-Guidelines)
- [Terms (UK)](https://airtasker.com/uk/terms/)
- [New feature: increasing the task price](https://www.airtasker.com/blog/new-feature-increasing-task-price/)
- [Accepting a price increase](https://support.airtasker.com/hc/en-au/articles/360021456911-How-do-I-accept-a-price-increase-request)
- [Making an offer](https://support.airtasker.com/hc/en-au/articles/360020896011-Everything-Taskers-should-know-about-making-an-offer)
- [Tasker pricing and payments](https://support.airtasker.com/hc/en-us/articles/360020792491-Tasker-information-about-pricing-and-payments)
- [Safety tips](https://support.airtasker.com/hc/en-us/articles/202402894-I-m-doing-tasks-What-are-some-safety-tips-I-should-follow)

## Verified Airtasker behaviour (from the sources above)

| Topic | What Airtasker publicly states |
|---|---|
| Offers | Taskers make offers. Before assignment they can **update the offer price** ("Update Offer"); agreeing a price in comments does not change the offer. Unaccepted offers can be withdrawn |
| Pre-assignment questions | **Public comments** on a task are used to clarify details before offering; private messages after assignment |
| Posting edits | A poster can revise or withdraw a task before accepting an offer |
| Payment | **No cash.** On accepting an offer, task price + connection fee is charged to a card and **held** ("Airtasker Pay" / trust account) until completion |
| Fees | Customer **connection fee** (for example 15.95% AU, 17.4% UK, with a minimum and cap), non-refundable. Taskers pay a service fee only on tasks they win |
| Completion | The Tasker marks complete, then the Poster is asked to **release payment**. If they don't, the Tasker can dispute |
| Payout speed | Funds reach the Tasker about **3–5 business days** after release |
| Price increase | After assignment, the Tasker can **request a price increase**; the Poster approves or declines. An old (2021) post said up to 3 increases, max $500, increases only |
| Cancellation | A cancellation request goes to the other party to approve or reject. Whoever is responsible pays a **cancellation fee ≈ the connection fee** (a customer's is deducted from the refund; a Tasker's from their next payout). "Extenuating circumstances" can waive fees. Refunds default to platform credits, with card refund on request |
| Off-platform payments | Not allowed, except tips and receipted materials reimbursed directly |
| Trust | Verification **badges**, reviews and completion rate shown; payment provider (Stripe) may request Tasker ID |
| Reviews | Left **after payment release** |

## Feature-by-feature recommendation

**Decision codes:** **A** build for the Hyderabad MVP · **B** build a simpler WhatsApp version · **C** later phase · **D** exclude.

| # | Capability | Airtasker (verified unless noted) | Our current code | Decision | Rationale for Hyderabad + WhatsApp |
|---|---|---|---|---|---|
| 1 | Registration / onboarding | App account, email/phone | WhatsApp number = identity; language + consent (`core.js:route`) | **A (done)** | The WhatsApp number is already verified by WhatsApp; no passwords |
| 2 | Task creation | Rich form: title, details, date, location, budget, photos | Guided chat (`customer.js:continuePost`) | **B** | Keep the chat flow. Add WhatsApp **Flows** for a one-screen form once approved (see `WHATSAPP_ARCHITECTURE.md`) |
| 3 | Categories | Large open catalogue | 10 keyword-classified categories (`parse.js:classifyTask`) | **B** | A curated low-risk list builds trust; licensed trades excluded |
| 4 | Photos | Supported | Rejected (`core.js:route`) | **A** | Photos cut price disputes and scope surprises. The Cloud API supports media download via media ID (expires; 7-day retention per Meta docs) |
| 5 | Location / scheduling | Address + date options | Area or pin + parsed IST time (`parse.js:parseWhen`) | **A (done)** + date flexibility **C** | |
| 6 | Budget | Customer budget | Required budget | **A (done)** | Keep the budget; shown to taskers as a guide |
| 7 | Discovery | Browse feed, map, alerts | Push alerts (1 wave of ≤15) + `TASKS` | **B** | WhatsApp has no feed. **Waves + TASKS pull**, detailed in `MATCHING_AND_BIDDING_DESIGN.md` |
| 8 | Public questions on tasks | Yes | No | **B** (later in MVP) | `ASK HYD0001 …` relayed anonymously; the answer goes to all bidders. Prevents contact-swapping in public comments |
| 9 | Offers | Yes | Yes (`worker.js:makeOffer`) | **A (done)** | |
| 10 | Offer update | Yes | Yes, unlimited, re-notifies the customer | **A (fix)** | Cap at 3 revisions; include in the digest instead of a message each time |
| 11 | Counter-offer by poster | *Not documented in sources reviewed* | No | **D (MVP)** | Haggling over WhatsApp multiplies messages; customers can raise the budget or pick another offer |
| 12 | Offer withdrawal | Yes | Yes | **A (done)** | |
| 13 | Worker profiles | Rich profile, badges, reviews | Name initial, rating, jobs count, distance | **B** | `PROFILE 12` shows badges (ID ✔, police ✔), rating, last 3 review snippets |
| 14 | Ratings & reviews | After release | After completion, both directions (`support.js:rate`) | **A (done)** + show snippets **B** | |
| 15 | Selection & assignment | Accept → pay → assigned | Same (`customer.js:acceptOffer`) | **A (done)** | |
| 16 | Payment collection | Card, held in trust | Razorpay link (UPI/cards/netbanking); Route hold | **A** 🔒 | UPI is essential in India. Funds are held by Razorpay Route, never by the founder informally |
| 17 | In-chat payment | n/a | `order_details` coded, off | **C** 🔒 | Needs Meta WhatsApp Pay approval |
| 18 | Completion & release | Tasker completes → poster releases → dispute if not | DONE → CONFIRM, auto-confirm 48h, dispute hold | **A (done)** | Auto-confirm protects taskers from silent customers (a deliberate difference; must be in the Terms) |
| 19 | Price increase / extra work | Tasker request → poster approves | **Missing** | **A** | Main defence against cash side-deals |
| 20 | Cancellation | Mutual request, fee = connection fee, extenuating circumstances | Unilateral rules: free > 12h, ops review < 12h, tasker cancel refund, no-show | **B** | Keep simple automatic rules plus operator discretion; add an explicit customer late-cancel fee |
| 21 | Refund to credits | Default credits | Refund to source | **D** | Platform wallets/credits raise prepaid-instrument and regulatory questions in India. Refund to source only |
| 22 | Disputes | Support-mediated | Ticket + hold + co-signed resolution | **A (done)** | |
| 23 | Fraud prevention | Verification, in-app payments | Verification checklist, masking, server-side payment checks | **A (done)** + anomaly rules **C** | |
| 24 | Trust & safety | Safety tips, badges | Moderation queue, 112 guidance | **B** | Add a safety check-in for long jobs, SOS keyword, women-customer preferences **(decision)** |
| 25 | Support | Help centre + chat | HELP tickets over WhatsApp | **A (done)** | Staff it; add an out-of-hours auto-reply with expectations |
| 26 | Repeat booking | Rebook favourite | Missing | **A** | Cheap to build; biggest retention lever |
| 27 | Business accounts | "Airtasker for Business" *(unverified details)* | Name + fee rate only | **B** → **C** | MVP: GSTIN capture + GST-compliant invoice data. Later: multi-user, monthly invoicing |
| 28 | Tasker earnings | Dashboard | Missing | **A** | `EARNINGS` summary on WhatsApp |
| 29 | Commission | Connection fee + tasker service fee | 18%/15% customer fee + GST on fee | **A (revisit)** | See `PAYMENTS_AND_COMPLIANCE.md`; Telangana welfare fee changes the maths |
| 30 | Referrals / growth | Referral credits *(unverified)* | Missing | **C** | Cash rewards need a policy; start with ops-led referral codes |
| 31 | Fixed-price catalogue (Urban Company model) *(unverified)* | — | — | **C (consider)** | For very standard jobs (deep clean of a 2BHK), fixed price converts better than bidding. Validate in the pilot |
| 32 | Insurance | Insurance cover *(unverified details)* | None | **A** 🔒 | Needs an insurer partner |

## Where we deliberately differ from Airtasker

1. **Push, not browse:** WhatsApp has no task feed, so discovery is targeted alerts in waves, plus pull via `TASKS`.
2. **Every tasker is verified before their first bid:** police verification and an in-person interview, which suits the home-entry trust gap in India. Airtasker badges are optional.
3. **No platform credits:** refunds go back to the original payment method.
4. **Auto-confirm after 48h** instead of an indefinite "release" wait.
5. **No public comments:** questions are relayed, to stop contact-swapping.
