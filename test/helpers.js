// TEST-ONLY helpers. FakeRazorpay is an in-memory stand-in for the Razorpay API used to exercise our
// state machine in automated tests. It is never wired into the running service and moves no money.
import { createDb } from '../src/db.js';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { silenceLogs } from '../src/logger.js';
import { RazorpayError } from '../src/payments/razorpay.js';
import { handleRazorpayEvent } from '../src/payments/service.js';
import { transactional } from '../src/db.js';

silenceLogs();

export const START = Date.UTC(2026, 10, 24, 4, 30); // 24 Nov 2026 10:00 IST

export class FakeRazorpay {
  constructor() {
    this.links = new Map(); this.payments = new Map(); this.transfers = new Map(); this.refunds = new Map(); this.reversals = new Map();
    this.calls = []; this.failures = []; this.seq = 0;
  }
  id(prefix) { return `${prefix}_TEST${String(++this.seq).padStart(6, '0')}`; }
  failNext(method, err) { this.failures.push({ method, err }); }
  maybeFail(method) {
    this.calls.push(method);
    const i = this.failures.findIndex(f => f.method === method);
    if (i >= 0) { const { err } = this.failures.splice(i, 1)[0]; throw err; }
  }
  async createPaymentLink({ amountPaise, reference, expireBy, notes }) {
    this.maybeFail('createPaymentLink');
    if ([...this.links.values()].some(l => l.reference_id === reference)) throw new RazorpayError(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'reference_id already exists' } }, '/v1/payment_links');
    const link = { id: this.id('plink'), amount: amountPaise, amount_paid: 0, currency: 'INR', reference_id: reference, status: 'created', short_url: `https://rzp.io/test/${this.seq}`, expire_by: Math.floor(expireBy / 1000), notes, payments: [] };
    this.links.set(link.id, link);
    return structuredClone(link);
  }
  async findPaymentLinkByReference(reference) { return structuredClone([...this.links.values()].find(l => l.reference_id === reference) || null); }
  async fetchPaymentLink(id) { this.maybeFail('fetchPaymentLink'); return structuredClone(this.links.get(id)); }
  async cancelPaymentLink(id) {
    this.maybeFail('cancelPaymentLink');
    const l = this.links.get(id);
    if (l.status !== 'created') throw new RazorpayError(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'cannot cancel' } }, '/cancel');
    l.status = 'cancelled';
    return structuredClone(l);
  }
  /** Simulates the customer completing checkout on the hosted link (test only). */
  customerPaysLink(linkId, amount) {
    const l = this.links.get(linkId);
    const pay = { id: this.id('pay'), amount: amount ?? l.amount, currency: 'INR', status: 'captured', notes: l.notes };
    this.payments.set(pay.id, pay);
    l.status = 'paid'; l.amount_paid = pay.amount; l.payments.push({ payment_id: pay.id, amount: pay.amount, status: 'captured' });
    return pay;
  }
  async fetchPayment(id) { this.maybeFail('fetchPayment'); const p = this.payments.get(id); if (!p) throw new RazorpayError(400, { error: { description: 'not found' } }, '/payments'); return structuredClone(p); }
  async createTransfer(paymentId, { account, amountPaise, onHold, notes }) {
    this.maybeFail('createTransfer');
    const tr = { id: this.id('trf'), source: paymentId, recipient: account, amount: amountPaise, on_hold: onHold, notes, reversed: 0 };
    this.transfers.set(tr.id, tr);
    return { entity: 'collection', count: 1, items: [structuredClone(tr)] };
  }
  async listTransfers(paymentId) { return { items: [...this.transfers.values()].filter(t => t.source === paymentId).map(x => structuredClone(x)) }; }
  async setTransferHold(id, onHold) { this.maybeFail('setTransferHold'); const t = this.transfers.get(id); t.on_hold = onHold; return structuredClone(t); }
  async reverseTransfer(id, amount, notes) {
    this.maybeFail('reverseTransfer');
    const t = this.transfers.get(id);
    if (amount > t.amount - t.reversed) throw new RazorpayError(400, { error: { description: 'reversal exceeds' } }, '/reversals');
    t.reversed += amount;
    const rev = { id: this.id('rvrsl'), transfer_id: id, amount, notes };
    this.reversals.set(rev.id, rev);
    return structuredClone(rev);
  }
  async listReversals(id) { return { items: [...this.reversals.values()].filter(r => r.transfer_id === id) }; }
  async refundPayment(paymentId, { amountPaise, notes }) {
    this.maybeFail('refundPayment');
    const p = this.payments.get(paymentId);
    const already = [...this.refunds.values()].filter(r => r.payment_id === paymentId).reduce((s, r) => s + r.amount, 0);
    if (amountPaise + already > p.amount) throw new RazorpayError(400, { error: { description: 'refund exceeds' } }, '/refund');
    const rf = { id: this.id('rfnd'), payment_id: paymentId, amount: amountPaise, status: 'pending', notes };
    this.refunds.set(rf.id, rf);
    return structuredClone(rf);
  }
  async listRefunds(paymentId) { return { items: [...this.refunds.values()].filter(r => r.payment_id === paymentId) }; }
}

export const PHONES = { customer: '919222222222', worker: '919333333333', worker2: '919444444444', stranger: '919555555555', admin: '919111111111', finance: '919111111112', support: '919111111113' };

export function setup(envOverrides = {}) {
  let clock = START;
  const config = readConfig({
    DRY_RUN: 'true', APP_ENV: 'test',
    ADMIN_PHONES: `${PHONES.admin}:super,${PHONES.finance}:finance,${PHONES.support}:support`,
    RAZORPAY_KEY_ID: 'rzp_test_dummy', RAZORPAY_KEY_SECRET: 'dummy', RAZORPAY_WEBHOOK_SECRET: 'whsec_test',
    WA_APP_SECRET: 'meta-secret', WA_VERIFY_TOKEN: 'verify-token-for-tests-123456', WA_PHONE_NUMBER_ID: '1234',
    TERMS_URL: 'https://example.invalid/terms', PRIVACY_URL: 'https://example.invalid/privacy',
    ...envOverrides,
  });
  const rzp = new FakeRazorpay();
  const db = createDb(':memory:');
  const app = createApp(config, { db, razorpay: config.paymentsEnabled ? rzp : null, now: () => clock });
  let seq = 0;
  const x = {
    config, db, app, rzp, market: app.market, P: PHONES,
    advance(ms) { clock += ms; },
    now: () => clock,
    send(from, text, extra = {}) { return app.market.processMessage({ from, id: `wamid.${++seq}`, text, type: 'text', ...extra }); },
    messages(phone) { return db.prepare('SELECT * FROM outbox WHERE phone=? ORDER BY id').all(phone).map(r => ({ ...r, payload: JSON.parse(r.payload) })); },
    last(phone) { const m = x.messages(phone); return m.length ? m[m.length - 1].payload.text : ''; },
    allText(phone) { return x.messages(phone).map(m => m.payload.text).join('\n----\n'); },
    task(id = 1) { return app.market.task(id); },
    async settle() { for (let i = 0; i < 10; i++) { const n = await app.tick(); void n; if (!db.prepare("SELECT 1 FROM jobs WHERE status='pending' AND next_attempt_at<=?").get(clock)) break; } },
    count(sql, ...a) { return db.prepare(sql).get(...a).n; },
  };
  return x;
}

export function onboard(x, phone, lang = 'en') {
  x.send(phone, 'hi');
  x.send(phone, `LANG ${lang}`);
  x.send(phone, 'AGREE');
}

export function onboardWorker(x, phone = PHONES.worker, { area = 'Gachibowli', skills = '1, 4', name = 'Ravi Kumar', account = 'acc_TESTWORKER0001' } = {}) {
  onboard(x, phone);
  x.send(phone, 'JOIN');
  x.send(phone, name);
  x.send(phone, area);
  x.send(phone, skills);
  for (const c of ['identity', 'police', 'interview']) x.send(PHONES.admin, `CHECK ${phone} ${c} KYC-CASE-${c}`);
  x.send(PHONES.admin, `LINKACC ${phone} ${account}`);
  x.send(PHONES.admin, `APPROVE ${phone}`);
  x.send(phone, 'AVAILABLE');
}

export function postTask(x, phone = PHONES.customer, { description = 'Move a sofa and fridge to the 2nd floor', area = 'Gachibowli', budget = '800', when = 'tomorrow 10 am' } = {}) {
  x.send(phone, 'POST');
  x.send(phone, description);
  x.send(phone, area);
  x.send(phone, budget);
  x.send(phone, when);
  x.send(phone, 'YES');
}

/** Customer + worker onboarded, task posted, offer made and accepted, link created. Returns the payment row. */
export async function bookedFlow(x, { amount = '750', pay = true } = {}) {
  onboardWorker(x);
  onboard(x, PHONES.customer);
  postTask(x);
  x.send(PHONES.worker, `OFFER HYD0001 ${amount} Will bring a trolley`);
  x.send(PHONES.customer, 'ACCEPT 1');
  await x.settle();
  const p = x.db.prepare('SELECT * FROM payments WHERE task_id=1').get();
  if (pay) {
    x.rzp.customerPaysLink(p.provider_link_id);
    razorpayWebhook(x, 'payment_link.paid', { payment_link: { entity: { id: p.provider_link_id } } });
    await x.settle();
  }
  return x.db.prepare('SELECT * FROM payments WHERE id=?').get(p.id);
}

let evt = 0;
export function razorpayWebhook(x, event, payload) {
  return transactional(x.db, () => handleRazorpayEvent(x.market, { event, payload, created_at: 1 }, `evt_${++evt}`));
}
