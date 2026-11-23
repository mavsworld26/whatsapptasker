# Launch checklist: items that need YOUR credentials, approvals or legal action

Engineering status (23 Nov 2026): the code is complete for a controlled pilot, and 37 automated tests pass. Nothing below has been obtained or approved yet. None of it can be done by engineering alone. Review times are set by Meta, Razorpay, government bodies and your advisers, so the **30 Nov 2026 date depends on them**.

Legend: 🔑 credential you must create · ✅ external approval · ⚖️ legal/tax/compliance advice · 🧑‍🤝‍🧑 operational action

## 1. WhatsApp Business Platform (Meta)

| # | Item | Type | Notes |
|---|---|---|---|
| 1.1 | Meta Business portfolio, **business verification** | ✅ | Needs company documents. Business-initiated messaging limits stay low until verified. |
| 1.2 | WhatsApp Business Account + dedicated phone number + **display name approval** | ✅ | The number must not be in use on the consumer WhatsApp app. |
| 1.3 | Meta app with WhatsApp product, **System User permanent token** (`whatsapp_business_messaging`, `whatsapp_business_management`) | 🔑 | → `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_APP_SECRET`. Store them in a secrets manager. |
| 1.4 | Webhook callback `https://<domain>/webhooks/whatsapp`, subscribed to `messages` | 🔑 | `WA_VERIFY_TOKEN`: a random string you choose. |
| 1.5 | **Message templates** (6 keys, ×3 languages) submitted and approved | ✅ | Texts are in `WHATSAPP_TEMPLATES.md`. Meta decides each template's category (utility or marketing) and pricing. Without approved templates, out-of-window notifications wait until the user messages again. |
| 1.6 | Confirm a **local-services marketplace** use case complies with the WhatsApp Business & Commerce Policies | ✅ | Ask your Meta partner or BSP, and keep the written answer. |
| 1.7 | Billing method on the WABA (conversation/message charges) | 🔑 | |
| 1.8 | *(Optional, later)* **WhatsApp Pay India** payment configuration linked to Razorpay, accept WhatsApp Payments terms, status **Active** | ✅ | Typically takes longer than a week. The pilot uses Razorpay Payment Links until this is active. Then set `WA_PAYMENT_CONFIGURATION` and re-test the `order_details` payload end to end in staging. |

## 2. Razorpay (collection, refunds, worker settlement)

| # | Item | Type | Notes |
|---|---|---|---|
| 2.1 | Razorpay account **KYC activation** under the correct business category | ✅ | Tell Razorpay plainly that this is a services marketplace collecting on behalf of independent taskers. Get their written confirmation that this model is allowed for your account. |
| 2.2 | **Route** enabled on the account | ✅ | Required for linked accounts, on-hold transfers, reversals and release. |
| 2.3 | API keys (test, then live) | 🔑 | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. The service rejects live keys unless `APP_ENV=production`. |
| 2.4 | Webhook → `https://<domain>/webhooks/razorpay` with events `payment_link.paid`, `payment.captured`, `refund.processed`, `refund.failed` | 🔑 | `RAZORPAY_WEBHOOK_SECRET` |
| 2.5 | Per-worker **Route linked account** created and KYC-verified in the Razorpay Dashboard (bank account and PAN collected by Razorpay, never in chat) | 🧑‍🤝‍🧑✅ | Record it with `LINKACC <phone> acc_…`. A worker cannot be approved without it. |
| 2.6 | Run the staging test plan in **test mode**, including reversal of an **on-hold** transfer and partial refund + release | 🧑‍🤝‍🧑 | Razorpay's public docs do not say whether an on-hold transfer can be reversed. Confirm with Razorpay support and in test mode before taking live money. |
| 2.7 | Refund and settlement schedule agreed (refund credits/balance for refunds) | ✅ | Refunds draw from your Razorpay balance. Keep it funded. |

## 3. Legal, tax and compliance (⚖️ — get written advice)

| # | Topic | What to confirm |
|---|---|---|
| 3.1 | Entity & registrations | Company or LLP, PAN/TAN, **GST registration** (e-commerce operators often must register regardless of turnover thresholds), and the Telangana Shops & Establishments registration. |
| 3.2 | **GST on these services** | Whether CGST Act **section 9(5)** (the e-commerce operator pays GST for notified services such as housekeeping, plumbing and carpentry supplied by unregistered persons) applies to some or all categories, and whether **TCS under section 52** applies. Either can change pricing. `FEE_GST_RATE` currently charges GST only on the platform fee. GST invoices are **not** generated yet. |
| 3.3 | **Income-tax TDS under section 194-O** | Deduction on payouts to taskers, the PAN requirements, and how to do it with Route (Razorpay can advise). |
| 3.4 | **Gig-worker law** | Code on Social Security 2020 obligations for aggregators (registration and welfare contributions), and the current status of any Telangana gig/platform-worker law or rules. Check both before onboarding taskers. |
| 3.5 | **DPDP Act 2023 & DPDP Rules** | Privacy notice, consent text (the AGREE step records version and time), grievance officer, retention schedule, breach process and data-principal rights (`MYDATA`, `DELETE MY DATA` are implemented). Confirm how long payment records must be kept. |
| 3.6 | **Consumer Protection (E-Commerce) Rules 2020** | Grievance officer named in the terms, display of total price (shown before payment), refund and cancellation policy, tasker identity disclosure, and review integrity. |
| 3.7 | IT Act intermediary obligations | Terms, grievance redressal timelines and takedown process. |
| 3.8 | Terms of Service, tasker agreement, privacy notice, cancellation/refund policy | Lawyer-approved, published at public URLs → `TERMS_URL`, `PRIVACY_URL`, `TERMS_VERSION`. **Production refuses to start without them.** The cancellation window (`FREE_CANCEL_HOURS=12`) and auto-confirm (`AUTO_CONFIRM_HOURS=48`) must match the published policy. |
| 3.9 | Worker classification | Taskers are independent contractors. Contract wording, no exclusivity, and how pricing is set. |
| 3.10 | Insurance | Accident cover for taskers and liability cover for property damage. Strongly recommended before the first job. |
| 3.11 | Prohibited and licensed work list | Confirm the moderation list (`src/parse.js` REVIEW_PATTERN). Electrical and gas work need licensed professionals. Childcare, eldercare and medical work are excluded from the pilot. |

## 4. Operations (🧑‍🤝‍🧑)

- At least **two finance operators** (two-person rule) plus support and verifier staff. List their WhatsApp numbers in `ADMIN_PHONES` with roles.
- A tasker verification SOP: ID check (in person or DigiLocker, done outside WhatsApp), police verification through the Hyderabad/Cyberabad police process, interview, skills test. Store documents in a secure KYC system and record only case references with `CHECK`.
- Support hours staffed as published (`SUPPORT_HOURS`), an escalation phone line for safety incidents, and an incident log.
- Native-speaker review of every Telugu and Hindi string (`src/i18n.js`) and of the template texts.
- Validate locality coordinates and pilot area boundaries (`src/areas.js`, `PILOT_AREAS`).
- Recruit and verify the first taskers (target 30) before customer launch.

## 5. Plan to a 30 Nov 2026 controlled pilot

| Day | Gate | Owner |
|---|---|---|
| Mon 23 Nov | Code, tests, docs delivered | Engineering ✔ |
| Mon 23 – Tue 24 | Submit Meta verification and display name; create Razorpay account and request **Route**; brief lawyer and CA (items 3.x) | Founder |
| Tue 24 – Wed 25 | Provision server, domain, TLS; deploy staging with `DRY_RUN=true`, then Meta test number and Razorpay **test** keys; submit templates | Engineering + Founder |
| Wed 25 – Fri 27 | Staging test plan (DEPLOYMENT.md §7) in Razorpay test mode; native-language review; verify the first taskers and create their linked accounts | Engineering + Ops |
| Sat 28 – Sun 29 | Legal docs published; production config; **go/no-go** review | Founder + Legal |
| Mon 30 Nov | Controlled pilot (invited customers, verified taskers, live keys) **only if** items 1.1–1.5, 2.1–2.6, 3.1–3.8 and 3.10 are done. Otherwise continue in staging with Razorpay test mode; no real money. | Founder |

**Fallback if approvals slip:** run the full WhatsApp flow on Meta's test number with Razorpay **test mode** for internal users. Taking real payments before Razorpay activation, Route and legal sign-off is not supported, and the code is built to refuse it.
