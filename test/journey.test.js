import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, onboard, onboardWorker, postTask, bookedFlow, razorpayWebhook, PHONES as P, START } from './helpers.js';

test('happy path: post → bid → accept → Razorpay link → verified capture → on-hold transfer → done → confirm → release → rate', async () => {
  const x = setup();
  const p = await bookedFlow(x);
  assert.equal(p.status, 'captured');
  assert.equal(p.amount_paise, 75000 + 13500 + 2430); // quote + 18% fee + 18% GST on fee
  assert.equal(x.task().status, 'booked');
  assert.match(x.allText(P.customer), /BOOKED with Ravi K\./);
  assert.match(x.allText(P.worker), /BOOKED: HYD0001/);
  const [transfer] = x.rzp.transfers.values();
  assert.equal(transfer.amount, 75000);
  assert.equal(transfer.on_hold, true);
  assert.equal(transfer.recipient, 'acc_TESTWORKER0001');

  x.send(P.customer, 'ADDRESS HYD0001 Flat 402, Lotus Residency, near DLF gate');
  assert.match(x.last(P.worker), /Flat 402/);
  x.send(P.worker, 'MSG HYD0001 Reaching in 10 mins, call me on 98480 12345');
  assert.match(x.last(P.customer), /\[number hidden\]/);
  assert.doesNotMatch(x.last(P.customer), /98480/);

  x.send(P.customer, 'CONFIRM HYD0001');
  assert.equal(x.task().status, 'booked', 'cannot confirm before the worker marks done');
  x.send(P.stranger, 'DONE HYD0001');
  x.send(P.worker, 'DONE HYD0001');
  assert.equal(x.task().status, 'awaiting_confirmation');
  const ask = x.messages(P.customer).at(-1);
  assert.equal(ask.kind, 'interactive');
  assert.deepEqual(ask.payload.buttons.map(b => b.id), ['CONFIRM HYD0001', 'DISPUTE HYD0001']);

  x.send(P.customer, 'CONFIRM HYD0001');
  assert.equal(x.task().status, 'completed');
  await x.settle();
  assert.equal([...x.rzp.transfers.values()][0].on_hold, false, 'payout released at Razorpay');
  assert.equal(x.db.prepare('SELECT status FROM transfers').get().status, 'released');
  assert.match(x.last(P.worker), /Payout of ₹750/);

  x.send(P.customer, 'RATE HYD0001 5 Very careful with the fridge');
  x.send(P.customer, 'RATE HYD0001 1');
  const w = x.market.workerProfile(P.worker);
  assert.equal(w.rating_count, 1);
  assert.equal(w.rating_sum, 5);
  assert.equal(w.jobs_completed, 1);
  x.send(P.worker, 'RATE HYD0001 4');
  assert.equal(x.count('SELECT COUNT(*) n FROM reviews'), 2);
});

test('webhooks are hints only: unpaid link, wrong amount and missing reference never book', async () => {
  const x = setup();
  const p = await bookedFlow(x, { pay: false });
  // Spoofed/early event: Razorpay says link is not paid.
  razorpayWebhook(x, 'payment_link.paid', { payment_link: { entity: { id: p.provider_link_id } } });
  await x.settle();
  assert.equal(x.task().status, 'payment_pending');
  // Customer paid a different amount (tampered) → verification fails, ops alerted, no booking.
  x.rzp.customerPaysLink(p.provider_link_id, 100);
  razorpayWebhook(x, 'payment_link.paid', { payment_link: { entity: { id: p.provider_link_id } }, extra: 1 });
  x.db.prepare("UPDATE jobs SET dedupe_key=NULL WHERE type='payment.verify_link'").run();
  razorpayWebhook(x, 'payment_link.paid', { payment_link: { entity: { id: p.provider_link_id } } });
  await x.settle();
  assert.equal(x.task().status, 'payment_pending');
  assert.ok(x.count("SELECT COUNT(*) n FROM jobs WHERE status='failed' AND type='payment.verify_link'") >= 1);
  assert.match(x.allText(P.admin), /failed/i);
});

test('duplicate Razorpay events are processed once', async () => {
  const x = setup();
  const p = await bookedFlow(x, { pay: false });
  x.rzp.customerPaysLink(p.provider_link_id);
  const { handleRazorpayEvent } = await import('../src/payments/service.js');
  const { transactional } = await import('../src/db.js');
  const ev = { event: 'payment_link.paid', payload: { payment_link: { entity: { id: p.provider_link_id } } } };
  assert.deepEqual(transactional(x.db, () => handleRazorpayEvent(x.market, ev, 'evt_same')), { accepted: true });
  assert.deepEqual(transactional(x.db, () => handleRazorpayEvent(x.market, ev, 'evt_same')), { duplicate: true });
  await x.settle();
  assert.equal(x.task().status, 'booked');
  assert.equal(x.rzp.transfers.size, 1);
});

test('payment link creation survives a timeout without creating a second link', async () => {
  const x = setup();
  onboardWorker(x); onboard(x, P.customer); postTask(x);
  x.send(P.worker, 'OFFER HYD0001 750');
  // First call: Razorpay creates the link but our request times out.
  const original = x.rzp.createPaymentLink.bind(x.rzp);
  let first = true;
  x.rzp.createPaymentLink = async (args) => { const l = await original(args); if (first) { first = false; const e = new Error('timeout'); e.retryable = true; throw e; } return l; };
  x.send(P.customer, 'ACCEPT 1');
  await x.settle();
  assert.equal(x.rzp.links.size, 1);
  const p = x.db.prepare('SELECT * FROM payments').get();
  assert.equal(p.status, 'awaiting_payment');
  assert.match(x.allText(P.customer), /rzp\.io\/test/);
});

test('unpaid booking expires, link is cancelled, task reopens; a late payment is refunded automatically', async () => {
  const x = setup();
  const p = await bookedFlow(x, { pay: false });
  x.advance(x.config.paymentLinkTtlMinutes * 60000 + 11 * 60000);
  x.app.sweep();
  await x.settle();
  assert.equal(x.task().status, 'open');
  assert.equal(x.db.prepare('SELECT status FROM payments WHERE id=?').get(p.id).status, 'expired');
  assert.equal(x.rzp.links.get(p.provider_link_id).status, 'cancelled');
  assert.equal(x.db.prepare('SELECT status FROM offers WHERE id=1').get().status, 'active');
  // Race: provider captured a payment anyway (e.g. bank delay) → must refund, not book.
  const pay = x.rzp.customerPaysLink(p.provider_link_id);
  razorpayWebhook(x, 'payment.captured', { payment: { entity: { id: pay.id, notes: pay.notes } } });
  await x.settle();
  assert.equal(x.task().status, 'open');
  const rf = x.db.prepare('SELECT * FROM refunds').get();
  assert.equal(rf.amount_paise, p.amount_paise);
  assert.equal(rf.reason, 'late_payment_auto_refund');
  assert.equal(x.rzp.refunds.size, 1);
  // Customer can book again with a fresh payment.
  x.send(P.customer, 'ACCEPT 1');
  await x.settle();
  assert.equal(x.count("SELECT COUNT(*) n FROM payments WHERE status='awaiting_payment'"), 1);
});

test('customer cancels well before start: worker share reversed, full refund, refund webhook notifies', async () => {
  const x = setup();
  const p = await bookedFlow(x);
  x.send(P.customer, 'CANCELJOB HYD0001'); // task is tomorrow 10 am = 24h away ≥ 12h free window
  assert.equal(x.task().status, 'cancelled');
  await x.settle();
  const tr = [...x.rzp.transfers.values()][0];
  assert.equal(tr.reversed, 75000);
  const rf = [...x.rzp.refunds.values()][0];
  assert.equal(rf.amount, p.amount_paise);
  razorpayWebhook(x, 'refund.processed', { refund: { entity: { id: rf.id } } });
  await x.settle();
  assert.equal(x.db.prepare('SELECT status FROM refunds').get().status, 'processed');
  assert.match(x.last(P.customer), /Refund of ₹909\.30/);
  assert.match(x.allText(P.worker), /cancelled by the customer/);
});

test('late cancellation goes to support instead of an automatic refund', async () => {
  const x = setup();
  await bookedFlow(x);
  x.advance(20 * 3600000); // 4h before start
  x.send(P.customer, 'CANCELJOB HYD0001');
  assert.equal(x.task().status, 'booked');
  assert.equal(x.count("SELECT COUNT(*) n FROM tickets WHERE kind='support'"), 1);
  assert.equal(x.count('SELECT COUNT(*) n FROM refunds'), 0);
});

test('worker cancels a booked job: customer refunded, task reopens with other offers active', async () => {
  const x = setup();
  onboardWorker(x, P.worker2, { name: 'Sita Devi', account: 'acc_TESTWORKER0002' });
  await bookedFlow(x);
  // worker2 had no offer before booking; make one before cancel to check reactivation path separately
  x.send(P.worker, 'CANCELJOB HYD0001');
  await x.settle();
  assert.equal(x.task().status, 'open');
  assert.equal(x.task().accepted_offer_id, null);
  assert.equal(x.market.workerProfile(P.worker).jobs_cancelled, 1);
  assert.equal(x.rzp.refunds.size, 1);
  assert.equal([...x.rzp.transfers.values()][0].reversed, 75000);
  x.send(P.worker2, 'OFFER HYD0001 800');
  x.send(P.customer, 'ACCEPT 2');
  await x.settle();
  assert.equal(x.task().status, 'payment_pending');
});

test('dispute holds payout; finance needs two-person co-sign; split refund reverses part and releases the rest', async () => {
  const x = setup();
  const p = await bookedFlow(x);
  x.send(P.worker, 'DONE HYD0001');
  x.send(P.stranger, 'DISPUTE HYD0001 not my job at all');
  assert.equal(x.task().status, 'awaiting_confirmation');
  x.send(P.customer, 'DISPUTE HYD0001 Fridge door was scratched while moving');
  assert.equal(x.task().status, 'disputed');
  assert.match(x.allText(P.worker), /problem was reported/);
  x.advance(72 * 3600000);
  x.app.sweep();
  assert.equal(x.task().status, 'disputed', 'auto-confirm is suspended during disputes');
  x.send(P.worker, 'HELP #1 The scratch was already there, I have photos');
  assert.match(x.allText(P.admin), /Ticket #1 update/);

  x.send(P.support, 'RESOLVE 1 split 200 goodwill');
  assert.match(x.last(P.support), /Not permitted/);
  x.send(P.finance, 'RESOLVE 1 split 200 goodwill for scratch');
  assert.match(x.last(P.finance), /needs a second finance operator: COSIGN 1/);
  x.send(P.finance, 'COSIGN 1');
  assert.match(x.last(P.finance), /Two-person rule/);
  x.send(P.admin, 'COSIGN 1');
  assert.equal(x.task().status, 'completed');
  await x.settle();
  const tr = [...x.rzp.transfers.values()][0];
  assert.equal(tr.reversed, 20000);
  assert.equal(tr.on_hold, false, 'remaining ₹550 released');
  assert.equal([...x.rzp.refunds.values()][0].amount, 20000);
  assert.equal(x.db.prepare('SELECT status, refunded_paise FROM payments WHERE id=?').get(p.id).refunded_paise, 20000);
  assert.equal(x.db.prepare('SELECT status FROM tickets WHERE id=1').get().status, 'resolved');
});

test('auto-confirm releases payout after the configured window when no problem is reported', async () => {
  const x = setup();
  await bookedFlow(x);
  x.send(P.worker, 'DONE HYD0001');
  x.advance(47 * 3600000); x.app.sweep();
  assert.equal(x.task().status, 'awaiting_confirmation');
  x.advance(2 * 3600000); x.app.sweep();
  assert.equal(x.task().status, 'completed');
  await x.settle();
  assert.equal(x.db.prepare('SELECT status FROM transfers').get().status, 'released');
});

test('refund that fails permanently alerts finance and tells the customer honestly', async () => {
  const x = setup();
  await bookedFlow(x);
  const { RazorpayError } = await import('../src/payments/razorpay.js');
  x.rzp.failNext('refundPayment', new RazorpayError(400, { error: { description: 'insufficient balance' } }, '/refund'));
  x.send(P.customer, 'CANCELJOB HYD0001');
  for (let i = 0; i < 12; i++) { x.advance(3600000); await x.settle(); }
  assert.equal(x.db.prepare('SELECT status FROM refunds').get().status, 'failed');
  assert.match(x.allText(P.customer), /problem processing the refund/);
  assert.match(x.allText(P.finance), /FAILED/);
});

test('open tasks expire at their scheduled time', async () => {
  const x = setup();
  onboard(x, P.customer); postTask(x);
  x.advance(25 * 3600000); x.app.sweep();
  assert.equal(x.task().status, 'expired');
  assert.equal(START < x.now(), true);
});
