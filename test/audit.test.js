// QA / security audit suite: adversarial, concurrency, failure-injection and lifecycle tests.
// External services are test doubles (FakeRazorpay, stubbed Meta sender); no live money or messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { setup, onboard, onboardWorker, postTask, bookedFlow, razorpayWebhook, PHONES as P } from './helpers.js';
import { createDb } from '../src/db.js';
import { drainOutbox } from '../src/whatsapp.js';
import { RazorpayError } from '../src/payments/razorpay.js';

const HOUR = 3600000;
const allTo = (x, phone) => x.messages(phone).map(m => JSON.stringify(m.payload)).join('\n');

// ---------------------------------------------------------------- lifecycle: start, completion fraud, no-show
test('job start: tasker marks ARRIVED near start time; customer is told; DONE before start time is refused', async () => {
  const x = setup();
  await bookedFlow(x); // scheduled tomorrow 10:00, now is today 10:00
  x.send(P.worker, 'DONE HYD0001');
  assert.equal(x.task().status, 'booked', 'completion cannot be claimed a day before the job');
  assert.match(x.last(P.worker), /too early/i);
  x.send(P.worker, 'ARRIVED HYD0001');
  assert.equal(x.task().status, 'booked', 'cannot start 24h early');
  x.advance(23.5 * HOUR);
  x.send(P.stranger, 'ARRIVED HYD0001');
  assert.equal(x.task().status, 'booked');
  x.send(P.worker, 'ARRIVED HYD0001');
  assert.equal(x.task().status, 'in_progress');
  assert.match(x.last(P.customer), /arrived|started/i);
  x.send(P.worker, 'DONE HYD0001');
  assert.equal(x.task().status, 'awaiting_confirmation');
});

test('fraudulent completion: only the assigned tasker can mark done and only the customer can confirm', async () => {
  const x = setup();
  onboardWorker(x, P.worker2, { name: 'Sita Devi', account: 'acc_TESTWORKER0002' });
  await bookedFlow(x);
  x.advance(24 * HOUR);
  x.send(P.worker2, 'DONE HYD0001');
  x.send(P.stranger, 'DONE HYD0001');
  assert.equal(x.task().status, 'booked');
  x.send(P.worker, 'DONE HYD0001');
  x.send(P.worker, 'CONFIRM HYD0001');
  x.send(P.worker2, 'CONFIRM HYD0001');
  assert.equal(x.task().status, 'awaiting_confirmation', 'a worker cannot confirm their own job');
  await x.settle();
  assert.equal([...x.rzp.transfers.values()][0].on_hold, true, 'no payout before customer confirmation');
});

test('worker no-show: customer reports after start time → full refund, job cancelled, repeat offenders suspended', async () => {
  const x = setup();
  const p = await bookedFlow(x);
  x.send(P.customer, 'NOSHOW HYD0001');
  assert.equal(x.task().status, 'booked', 'cannot report a no-show before the start time');
  x.advance(24.6 * HOUR);
  x.send(P.stranger, 'NOSHOW HYD0001');
  assert.equal(x.task().status, 'booked');
  x.send(P.customer, 'NOSHOW HYD0001');
  assert.equal(x.task().status, 'cancelled');
  await x.settle();
  assert.equal([...x.rzp.refunds.values()][0].amount, p.amount_paise);
  assert.equal([...x.rzp.transfers.values()][0].reversed, 75000);
  assert.equal(x.market.workerProfile(P.worker).jobs_cancelled, 1);
  assert.match(x.allText(P.admin), /no-show/i);
  // A worker who has started the job cannot be reported as a no-show.
  const y = setup();
  await bookedFlow(y);
  y.advance(23.9 * HOUR); y.send(P.worker, 'ARRIVED HYD0001'); y.advance(HOUR);
  y.send(P.customer, 'NOSHOW HYD0001');
  assert.equal(y.task().status, 'in_progress');
});

test('two no-shows automatically suspend the tasker', async () => {
  const x = setup();
  await bookedFlow(x);
  x.advance(24.6 * HOUR);
  x.send(P.customer, 'NOSHOW HYD0001');
  await x.settle();
  x.advance(60000);
  postTask(x, P.customer, { when: 'tomorrow 10 am' });
  x.send(P.worker, 'OFFER HYD0002 700');
  x.send(P.customer, `ACCEPT ${x.db.prepare('SELECT id FROM offers WHERE task_id=2').get().id}`);
  await x.settle();
  const p2 = x.db.prepare('SELECT * FROM payments WHERE task_id=2').get();
  x.rzp.customerPaysLink(p2.provider_link_id);
  razorpayWebhook(x, 'payment_link.paid', { payment_link: { entity: { id: p2.provider_link_id } } });
  await x.settle();
  assert.equal(x.task(2).status, 'booked');
  x.advance(24.6 * HOUR);
  x.send(P.customer, 'NOSHOW HYD0002');
  assert.equal(x.market.workerProfile(P.worker).status, 'suspended');
});

// ---------------------------------------------------------------- settlement correctness
test('goodwill partial REFUND on a booked job does not complete the job or release the payout', async () => {
  const x = setup();
  await bookedFlow(x);
  x.send(P.finance, 'REFUND HYD0001 100 delayed arrival goodwill');
  x.send(P.admin, 'COSIGN 1');
  await x.settle();
  assert.equal(x.task().status, 'booked');
  const tr = [...x.rzp.transfers.values()][0];
  assert.equal(tr.on_hold, true, 'payout still held until the job is done');
  assert.equal(tr.reversed, 0, 'goodwill is platform-funded, not taken from the tasker');
  assert.equal([...x.rzp.refunds.values()][0].amount, 10000);
});

test('late cancellation settled by operator: customer partly refunded, tasker keeps a cancellation fee, job cancelled', async () => {
  const x = setup();
  const p = await bookedFlow(x);
  x.advance(20 * HOUR);
  x.send(P.customer, 'CANCELJOB HYD0001');
  const ticket = x.db.prepare('SELECT id FROM tickets').get().id;
  x.send(P.finance, `RESOLVE ${ticket} split 500 late cancellation, tasker keeps 250`);
  x.send(P.admin, 'COSIGN 1');
  assert.equal(x.task().status, 'cancelled');
  await x.settle();
  const tr = [...x.rzp.transfers.values()][0];
  assert.equal(tr.reversed, 50000);
  assert.equal(tr.on_hold, false, 'cancellation fee released to tasker');
  assert.equal(x.db.prepare('SELECT refunded_paise FROM payments WHERE id=?').get(p.id).refunded_paise, 50000);
});

test('refunds never exceed the captured amount, even with repeated operator actions', async () => {
  const x = setup();
  const p = await bookedFlow(x);
  x.send(P.finance, 'REFUND HYD0001 900 first goodwill');
  x.send(P.finance, 'REFUND HYD0001 900 second goodwill');
  x.send(P.admin, 'COSIGN 1');
  x.send(P.admin, 'COSIGN 2');
  assert.match(x.last(P.admin), /exceeds refundable/);
  await x.settle();
  const total = [...x.rzp.refunds.values()].reduce((s, r) => s + r.amount, 0);
  assert.ok(total <= p.amount_paise);
});

// ---------------------------------------------------------------- payment security & races
test('payment link created after the booking was cancelled is cancelled at Razorpay (no orphan payable link)', async () => {
  const x = setup();
  onboardWorker(x); onboard(x, P.customer); postTask(x);
  x.send(P.worker, 'OFFER HYD0001 750');
  const real = x.rzp.createPaymentLink.bind(x.rzp);
  x.rzp.createPaymentLink = async (a) => { const l = await real(a); x.send(P.customer, 'CANCELJOB HYD0001'); return l; }; // cancel lands mid-call
  x.send(P.customer, 'ACCEPT 1');
  await x.settle();
  assert.equal(x.task().status, 'cancelled');
  assert.equal(x.rzp.links.size, 1);
  const [link] = x.rzp.links.values();
  if (link) assert.equal(link.status, 'cancelled');
  assert.doesNotMatch(x.allText(P.customer), /rzp\.io/, 'customer never receives a link for a cancelled booking');
});

test('transfer created at Razorpay but our request timed out: a later refund reverses the real transfer', async () => {
  const x = setup();
  onboardWorker(x); onboard(x, P.customer); postTask(x);
  x.send(P.worker, 'OFFER HYD0001 750');
  x.send(P.customer, 'ACCEPT 1');
  await x.settle();
  const p = x.db.prepare('SELECT * FROM payments').get();
  const real = x.rzp.createTransfer.bind(x.rzp);
  x.rzp.createTransfer = async (...a) => { await real(...a); throw Object.assign(new Error('timeout'), { retryable: true }); };
  x.rzp.listTransfers = async () => ({ items: [] }); // reconciliation lookup also failing at first
  x.rzp.customerPaysLink(p.provider_link_id);
  razorpayWebhook(x, 'payment_link.paid', { payment_link: { entity: { id: p.provider_link_id } } });
  await x.app.tick(); await x.app.tick();
  assert.equal(x.rzp.transfers.size, 1, 'transfer exists at provider');
  delete x.rzp.listTransfers; // provider lookup works again
  x.send(P.customer, 'CANCELJOB HYD0001');
  x.advance(HOUR);
  await x.settle(); x.advance(HOUR); await x.settle();
  assert.equal([...x.rzp.transfers.values()][0].reversed, 75000, 'money is not stranded in the tasker account');
  assert.equal(x.rzp.transfers.size, 1, 'no duplicate transfer');
});

test('WhatsApp Pay double payment for one order: first books, second is refunded in full', async () => {
  const x = setup({ WA_PAYMENT_CONFIGURATION: 'hyd-rzp-config' });
  onboardWorker(x); onboard(x, P.customer); postTask(x);
  x.send(P.worker, 'OFFER HYD0001 750');
  x.send(P.customer, 'ACCEPT 1');
  await x.settle();
  const p = x.db.prepare('SELECT * FROM payments').get();
  assert.equal(p.channel, 'whatsapp_pay');
  assert.equal(x.messages(P.customer).at(-1).kind, 'order_details');
  const mk = () => { const id = x.rzp.id('pay'); x.rzp.payments.set(id, { id, amount: p.amount_paise, currency: 'INR', status: 'captured', notes: { reference: p.reference } }); return id; };
  const [a, b] = [mk(), mk()];
  const { handleWhatsAppPaymentStatus } = await import('../src/payments/service.js');
  const { transactional } = await import('../src/db.js');
  for (const id of [a, b]) transactional(x.db, () => handleWhatsAppPaymentStatus(x.market, { referenceId: p.reference, pgTransactionId: id, status: 'captured' }));
  await x.settle();
  assert.equal(x.task().status, 'booked');
  const refunds = [...x.rzp.refunds.values()];
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].payment_id, b);
  assert.equal(refunds[0].amount, p.amount_paise);
});

test('forged or mismatched payment events never book', async () => {
  const x = setup();
  const p = await bookedFlow(x, { pay: false });
  // Unknown provider payment id with a real reference.
  razorpayWebhook(x, 'payment.captured', { payment: { entity: { id: 'pay_FORGED000001', notes: { reference: p.reference } } } });
  // Real payment of a different (smaller) amount claiming this reference.
  x.rzp.payments.set('pay_SMALL', { id: 'pay_SMALL', amount: 100, currency: 'INR', status: 'captured', notes: { reference: p.reference } });
  razorpayWebhook(x, 'payment.captured', { payment: { entity: { id: 'pay_SMALL', notes: { reference: p.reference } } } });
  // Unknown link id.
  razorpayWebhook(x, 'payment_link.paid', { payment_link: { entity: { id: 'plink_UNKNOWN' } } });
  await x.settle();
  assert.equal(x.task().status, 'payment_pending');
  assert.equal(x.rzp.transfers.size, 0);
});

test('double ACCEPT race: only one offer can be accepted and only one payment is created', async () => {
  const x = setup();
  onboardWorker(x);
  onboardWorker(x, P.worker2, { name: 'Sita Devi', account: 'acc_TESTWORKER0002' });
  onboard(x, P.customer); postTask(x);
  x.send(P.worker, 'OFFER HYD0001 750');
  x.send(P.worker2, 'OFFER HYD0001 700');
  x.send(P.customer, 'ACCEPT 1');
  x.send(P.customer, 'ACCEPT 2');
  assert.equal(x.task().accepted_offer_id, 1);
  assert.equal(x.count('SELECT COUNT(*) n FROM payments'), 1);
});

test('payout release failures: transient errors retry, permanent errors alert finance and keep funds held', async () => {
  const x = setup();
  await bookedFlow(x);
  x.advance(24 * HOUR);
  x.send(P.worker, 'DONE HYD0001');
  x.rzp.failNext('setTransferHold', new RazorpayError(503, { error: { description: 'unavailable' } }, '/transfers'));
  x.send(P.customer, 'CONFIRM HYD0001');
  await x.settle();
  assert.equal(x.db.prepare('SELECT status FROM transfers').get().status, 'on_hold', 'still held after a transient failure');
  x.advance(HOUR); await x.settle();
  assert.equal(x.db.prepare('SELECT status FROM transfers').get().status, 'released', 'released on retry');

  const y = setup();
  await bookedFlow(y);
  y.advance(24 * HOUR);
  y.send(P.worker, 'DONE HYD0001');
  y.rzp.failNext('setTransferHold', new RazorpayError(400, { error: { description: 'linked account suspended' } }, '/transfers'));
  y.send(P.customer, 'CONFIRM HYD0001');
  for (let i = 0; i < 3; i++) { y.advance(HOUR); await y.settle(); }
  assert.equal(y.db.prepare('SELECT status FROM transfers').get().status, 'on_hold');
  assert.match(y.allText(P.finance), /Payout job transfer.release .* failed/);
  assert.doesNotMatch(y.allText(P.worker), /Payout of/, 'worker is not told they were paid');
});

// ---------------------------------------------------------------- concurrency over HTTP
async function withServer(x, fn) {
  await new Promise(r => x.app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${x.app.server.address().port}`;
  try { await fn(base); } finally { await new Promise(r => x.app.server.close(r)); }
}
let wamid = 0;
function signedInbound(from, text) {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1234' }, messages: [{ id: `wamid.http${++wamid}`, from, type: 'text', text: { body: text } }] } }] }] });
  return { body, headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', 'meta-secret').update(body).digest('hex')}` } };
}

test('concurrency: 4 customers and 4 taskers interleaving requests in parallel stay consistent', async () => {
  const x = setup({ MAX_MESSAGES_PER_MINUTE: '200' });
  const customers = ['919600000001', '919600000002', '919600000003', '919600000004'];
  const workers = ['919700000001', '919700000002', '919700000003', '919700000004'];
  workers.forEach((w, i) => onboardWorker(x, w, { name: `Worker ${i} K`, account: `acc_PARALLELWK00${i}` }));
  customers.forEach(c => onboard(x, c));
  await withServer(x, async base => {
    const post = (from, text) => { const s = signedInbound(from, text); return fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body: s.body, headers: s.headers }); };
    // Each customer posts a job; steps are sequential per customer but customers run in parallel.
    await Promise.all(customers.map(async c => {
      for (const t of ['POST', `Shift boxes and a sofa for ${c.slice(-1)}`, 'Kondapur', '900', 'tomorrow 11 am', 'YES']) assert.equal((await post(c, t)).status, 200);
    }));
    assert.equal(x.count("SELECT COUNT(*) n FROM tasks WHERE status='open'"), 4);
    // Every worker bids on every task, all at once.
    const bids = [];
    for (const w of workers) for (let t = 1; t <= 4; t++) bids.push(post(w, `OFFER HYD000${t} ${700 + t * 10}`));
    const results = await Promise.all(bids);
    assert.ok(results.every(r => r.status === 200));
    assert.equal(x.count("SELECT COUNT(*) n FROM offers WHERE status='active'"), 16);
    // All customers accept simultaneously, and customer 1 also races a second accept.
    const offerFor = (task, w) => x.db.prepare('SELECT id FROM offers WHERE task_id=? AND worker_phone=?').get(task, w).id;
    const taskOf = c => x.db.prepare('SELECT id FROM tasks WHERE customer_phone=?').get(c).id; // ids depend on arrival order
    const accepts = customers.map((c, i) => post(c, `ACCEPT ${offerFor(taskOf(c), workers[i])}`));
    accepts.push(post(customers[0], `ACCEPT ${offerFor(taskOf(customers[0]), workers[3])}`));
    await Promise.all(accepts);
  });
  await x.settle();
  assert.equal(x.count("SELECT COUNT(*) n FROM tasks WHERE status='payment_pending'"), 4);
  assert.equal(x.count('SELECT COUNT(*) n FROM payments'), 4, 'exactly one payment per task');
  const t1 = x.db.prepare('SELECT * FROM tasks WHERE customer_phone=?').get(customers[0]);
  assert.equal(t1.accepted_offer_id, x.db.prepare('SELECT id FROM offers WHERE task_id=? AND worker_phone=?').get(t1.id, workers[0]).id, 'first accept wins, racing second is rejected');
  assert.equal(x.count("SELECT COUNT(*) n FROM offers WHERE status='accepted'"), 4);
  assert.equal(x.count('SELECT COUNT(*) n FROM tasks t JOIN offers o ON o.id=t.accepted_offer_id WHERE o.task_id<>t.id'), 0, 'no cross-task offer acceptance');
});

// ---------------------------------------------------------------- WhatsApp delivery
test('outbox: transient Meta errors retry with backoff, permanent errors stop, delivery-failure webhooks are recorded', async () => {
  const x = setup();
  const live = { ...x.config, dryRun: false };
  onboard(x, P.customer);
  x.db.prepare("UPDATE outbox SET status='sent'").run();
  x.market.say(P.customer, 'available_on');
  const fail = status => async () => { throw Object.assign(new Error(`meta ${status}`), { httpStatus: status }); };
  await drainOutbox(x.db, live, fail(500), { now: x.now });
  let row = x.db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.status, 'pending'); assert.equal(row.attempts, 1); assert.ok(row.next_attempt_at > x.now());
  await drainOutbox(x.db, live, async () => ({ messageId: 'x' }), { now: x.now });
  assert.equal(x.db.prepare('SELECT status FROM outbox WHERE id=?').get(row.id).status, 'pending', 'not resent before backoff');
  x.advance(60000);
  await drainOutbox(x.db, live, async () => ({ messageId: 'wamid.ok1' }), { now: x.now });
  assert.equal(x.db.prepare('SELECT status FROM outbox WHERE id=?').get(row.id).status, 'sent');
  x.market.say(P.customer, 'available_off');
  await drainOutbox(x.db, live, fail(400), { now: x.now });
  assert.equal(x.db.prepare('SELECT status FROM outbox ORDER BY id DESC LIMIT 1').get().status, 'failed');
  x.market.say(P.customer, 'available_on');
  for (let i = 0; i < 9; i++) { await drainOutbox(x.db, live, fail(503), { now: x.now }); x.advance(20 * 60000); x.send(P.customer, 'MENU'); x.db.prepare("UPDATE outbox SET status='sent' WHERE payload LIKE '%HYD Tasks menu%'").run(); }
  row = x.db.prepare("SELECT * FROM outbox WHERE payload LIKE '%AVAILABLE%' ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.status, 'failed'); assert.equal(row.attempts, 8);
  const { recordDeliveryStatus } = await import('../src/whatsapp.js');
  recordDeliveryStatus(x.db, { id: 'wamid.ok1', status: 'failed', errors: [{ code: 131026, title: 'undeliverable' }] });
  assert.match(x.db.prepare("SELECT last_error FROM outbox WHERE provider_message_id='wamid.ok1'").get().last_error, /131026/);
});

// ---------------------------------------------------------------- languages, media, invalid input
test('voice notes, images and stickers get a clear "please type" reply, also mid-conversation', () => {
  const x = setup();
  onboard(x, P.customer, 'te');
  x.send(P.customer, '', { type: 'audio' });
  assert.match(x.last(P.customer), /వాయిస్/);
  x.send(P.customer, 'POST');
  x.send(P.customer, '', { type: 'image' });
  assert.match(x.last(P.customer), /వాయిస్/);
  x.send(P.customer, '', { type: 'sticker' });
  assert.equal(x.market.getSession(P.customer).step, 'post_description', 'draft is kept');
});

test('full journey in Telugu (customer) and Hindi (tasker) with review at the end', async () => {
  const x = setup();
  onboardWorker(x);
  x.send(P.worker, 'LANG hi');
  onboard(x, P.customer, 'te');
  x.send(P.customer, 'కొత్త పని');
  x.send(P.customer, 'సోఫా మరియు సామాను రెండో అంతస్తుకు మార్చాలి');
  x.send(P.customer, 'గచ్చిబౌలి');
  x.send(P.customer, '₹800');
  x.send(P.customer, 'రేపు 10 am');
  x.send(P.customer, 'అవును');
  assert.match(allTo(x, P.worker), /नया|बोली/);
  x.send(P.worker, 'OFFER HYD0001 750');
  assert.match(x.last(P.customer), /కొత్త ఆఫర్/);
  x.send(P.customer, 'ACCEPT 1');
  await x.settle();
  assert.match(x.last(P.customer), /Razorpay/);
  const p = x.db.prepare('SELECT * FROM payments').get();
  x.rzp.customerPaysLink(p.provider_link_id);
  razorpayWebhook(x, 'payment_link.paid', { payment_link: { entity: { id: p.provider_link_id } } });
  await x.settle();
  assert.match(allTo(x, P.customer), /BOOKED/);
  x.advance(23.5 * HOUR);
  x.send(P.worker, 'ARRIVED HYD0001');
  x.send(P.worker, 'DONE HYD0001');
  assert.match(x.last(P.worker), /धन्यवाद/);
  x.send(P.customer, 'CONFIRM HYD0001');
  await x.settle();
  assert.match(x.last(P.worker), /पेआउट/);
  x.send(P.customer, 'RATE HYD0001 5 చాలా బాగుంది');
  assert.match(x.last(P.customer), /ధన్యవాదాలు/);
  assert.equal(x.db.prepare('SELECT comment FROM reviews').get().comment, 'చాలా బాగుంది');
});

test('fuzz: random and malicious inputs never crash the router or corrupt state', () => {
  const x = setup({ MAX_MESSAGES_PER_MINUTE: '600' });
  onboardWorker(x); onboard(x, P.customer); postTask(x);
  const samples = ['', ' ', '\u0000\u0007', 'A'.repeat(5000), '🙂🙂🙂', "'); DROP TABLE tasks;--", 'OFFER', 'OFFER HYD0001', 'OFFER HYD0001 -5', 'OFFER HYD0001 1e9',
    'OFFER HYD99999999999999 700', 'ACCEPT -1', 'ACCEPT 1.5', 'ACCEPT 99999', 'STATUS', 'STATUS ../../etc/passwd', 'RATE HYD0001 10', 'RATE HYD0001 NaN', 'CONFIRM', 'DONE',
    'NOSHOW', 'ARRIVED', 'MSG', 'MSG HYD0001', 'ADDRESS HYD0001', 'DISPUTE HYD0001', 'HELP #999 hi', 'HELP #abc', 'LANG xx', 'CANCELJOB HYD0000', 'WITHDRAW', 'APPROVE 919333333333',
    'COSIGN 1', 'REFUND HYD0001 full test', 'BLOCK 919222222222', '{"json":true}', '<script>alert(1)</script>', 'नमस्ते', 'నమస్తే', 'START HYD0001', 'STOP HYD0001'];
  for (const s of samples) for (const who of [P.customer, P.worker, P.stranger]) {
    assert.doesNotThrow(() => x.send(who, s), `input ${JSON.stringify(s).slice(0, 40)} from ${who}`);
  }
  assert.equal(x.count('SELECT COUNT(*) n FROM tasks'), 1, 'tasks table intact');
  assert.equal(x.task().status, 'open');
  assert.equal(x.count('SELECT COUNT(*) n FROM financial_actions'), 0, 'non-operators cannot request money movement');
  assert.equal(x.market.user(P.customer).blocked, 0);
  x.send(P.customer, 'START'); // "STOP HYD0001" above is honoured as an opt-out (compliance), so opt back in
  x.send(P.customer, 'POST');
  x.send(P.customer, "Move sofa'); DROP TABLE tasks;-- carefully");
  x.send(P.customer, 'Gachibowli'); x.send(P.customer, '800'); x.send(P.customer, 'tomorrow 10 am'); x.send(P.customer, 'YES');
  assert.equal(x.task(2).description, "Move sofa'); DROP TABLE tasks;-- carefully", 'stored as literal text');
});

// ---------------------------------------------------------------- authorization & privacy
test('operator authorization matrix: each role is limited to its commands; customers and taskers have none', () => {
  const x = setup({ ADMIN_PHONES: `${P.admin}:super,${P.finance}:finance,${P.support}:support,919111111114:verifier` });
  const verifier = '919111111114';
  onboard(x, P.worker); x.send(P.worker, 'JOIN'); x.send(P.worker, 'Ravi Kumar'); x.send(P.worker, 'Gachibowli'); x.send(P.worker, '1');
  const tryCmd = (who, cmd) => { const before = x.messages(who).length; x.send(who, cmd); return x.messages(who).slice(before).map(m => m.payload.text).join(' '); };
  assert.match(tryCmd(P.support, `CHECK ${P.worker} identity CASE-1`), /Not permitted/);
  assert.match(tryCmd(P.finance, `APPROVE ${P.worker}`), /Not permitted/);
  assert.match(tryCmd(verifier, 'REFUND HYD0001 full x'), /Not permitted/);
  assert.match(tryCmd(verifier, 'COSIGN 1'), /Not permitted/);
  assert.match(tryCmd(P.support, 'BLOCK 919222222222'), /Not permitted/);
  assert.match(tryCmd(verifier, `CHECK ${P.worker} identity CASE-1`), /recorded/);
  for (const outsider of [P.customer, P.worker]) {
    onboard(x, outsider);
    for (const c of [`APPROVE ${P.worker}`, 'STATS', 'TICKETS', `BLOCK ${P.customer}`, 'JOBS', 'OPSHELP']) {
      assert.doesNotMatch(tryCmd(outsider, c), /Tasks |approved|Open tickets|blocked|Operator commands/);
    }
  }
  assert.equal(x.market.workerProfile(P.worker).status, 'pending');
  assert.equal(x.count("SELECT COUNT(*) n FROM audit WHERE action LIKE 'worker_%' AND actor IN (?, ?)", P.customer, P.worker), 1, 'only the application itself');
});

test('privacy: phone numbers are never shared between customer and tasker; outsiders cannot read or message a job', async () => {
  const x = setup();
  await bookedFlow(x);
  x.send(P.customer, 'ADDRESS HYD0001 Flat 9, Aparna Towers');
  x.send(P.worker, 'MSG HYD0001 call me +91 93333 33333 or pay me at ravi@ybl');
  x.send(P.stranger, 'MSG HYD0001 hello');
  x.send(P.stranger, 'ADDRESS HYD0001 fake');
  x.send(P.stranger, 'STATUS HYD0001');
  x.send(P.worker2, 'STATUS HYD0001');
  const customerInbox = allTo(x, P.customer);
  const workerInbox = allTo(x, P.worker);
  assert.ok(!workerInbox.includes(P.customer) && !workerInbox.includes(P.customer.slice(2)), 'tasker never sees the customer phone');
  assert.ok(!customerInbox.includes(P.worker) && !customerInbox.includes(P.worker.slice(2)), 'customer never sees the tasker phone');
  assert.doesNotMatch(customerInbox, /93333|ravi@ybl/);
  assert.doesNotMatch(allTo(x, P.stranger), /Aparna|Flat 9|Move a sofa/);
  assert.equal(x.count('SELECT COUNT(*) n FROM relay_messages'), 1);
});

test('database file is created with owner-only permissions and survives restart (migrations idempotent)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-audit-'));
  const file = path.join(dir, 'm.sqlite');
  const db = createDb(file);
  db.prepare('INSERT INTO users(phone, created_at) VALUES (?, ?)').run('919000000000', 1);
  db.close();
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const again = createDb(file);
  assert.equal(again.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  assert.ok(again.prepare('SELECT MAX(version) v FROM schema_migrations').get().v >= 1);
  again.close();
  fs.rmSync(dir, { recursive: true });
});

// ---------------------------------------------------------------- worker lifecycle
test('worker lifecycle: apply → checks → approve → suspend (offers withdrawn, no alerts) → reinstate → reject flow', () => {
  const x = setup();
  onboardWorker(x);
  onboard(x, P.customer);
  x.send(P.admin, `SUSPEND ${P.worker} customer complaint`);
  assert.equal(x.market.workerProfile(P.worker).status, 'suspended');
  postTask(x);
  assert.equal(x.count('SELECT COUNT(*) n FROM dispatches'), 0, 'suspended taskers get no alerts');
  x.send(P.worker, 'AVAILABLE');
  assert.match(x.last(P.worker), /suspended/);
  x.send(P.worker, 'JOIN');
  assert.equal(x.market.workerProfile(P.worker).status, 'suspended', 'cannot re-apply to escape a suspension');
  x.send(P.admin, `REINSTATE ${P.worker}`);
  x.send(P.worker, 'AVAILABLE');
  x.send(P.worker, 'TASKS');
  assert.match(x.last(P.worker), /HYD0001/);
  onboard(x, P.worker2);
  x.send(P.worker2, 'JOIN'); x.send(P.worker2, 'Sita Devi'); x.send(P.worker2, 'Kondapur'); x.send(P.worker2, '2');
  x.send(P.admin, `REJECT ${P.worker2} failed interview`);
  assert.equal(x.market.workerProfile(P.worker2).status, 'rejected');
  assert.match(x.last(P.worker2), /not approved/);
});

test('refund and reversal that time out at Razorpay are not duplicated on retry', async () => {
  const x = setup();
  const p = await bookedFlow(x);
  const realRefund = x.rzp.refundPayment.bind(x.rzp);
  const realReverse = x.rzp.reverseTransfer.bind(x.rzp);
  let r1 = true, r2 = true;
  x.rzp.reverseTransfer = async (...a) => { const r = await realReverse(...a); if (r1) { r1 = false; throw Object.assign(new Error('timeout'), { retryable: true }); } return r; };
  x.rzp.refundPayment = async (...a) => { const r = await realRefund(...a); if (r2) { r2 = false; throw Object.assign(new Error('timeout'), { retryable: true }); } return r; };
  x.send(P.customer, 'CANCELJOB HYD0001');
  for (let i = 0; i < 6; i++) { x.advance(HOUR); await x.settle(); }
  assert.equal(x.rzp.reversals.size, 1, 'one reversal');
  assert.equal(x.rzp.refunds.size, 1, 'one refund');
  assert.equal([...x.rzp.refunds.values()][0].amount, p.amount_paise);
  assert.equal(x.db.prepare('SELECT status FROM refunds').get().status, 'requested');
});

test('customer complaint after completion: ticket opens without a hold; split is refused, platform-funded refund allowed', async () => {
  const x = setup();
  await bookedFlow(x);
  x.advance(24 * HOUR);
  x.send(P.worker, 'DONE HYD0001');
  x.send(P.customer, 'CONFIRM HYD0001');
  await x.settle();
  x.send(P.customer, 'DISPUTE HYD0001 Tasker was rude and broke a lamp');
  assert.equal(x.task().status, 'completed', 'already paid out: no hold possible');
  x.send(P.finance, 'RESOLVE 1 split 100 lamp');
  x.send(P.admin, 'COSIGN 1');
  assert.match(x.last(P.admin), /not executed: a split needs an open job/);
  x.send(P.finance, 'REFUND HYD0001 200 broken lamp goodwill');
  x.send(P.admin, 'COSIGN 2');
  await x.settle();
  assert.equal([...x.rzp.refunds.values()][0].amount, 20000);
  assert.equal([...x.rzp.transfers.values()][0].reversed, 0);
});

test('malformed but correctly signed webhook bodies are rejected without crashing', async () => {
  const x = setup();
  await withServer(x, async base => {
    for (const body of ['null', '[]', '"x"', '{"object":"whatsapp_business_account","entry":"nope"}']) {
      const sig = `sha256=${createHmac('sha256', 'meta-secret').update(body).digest('hex')}`;
      const r = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body, headers: { 'x-hub-signature-256': sig } });
      assert.ok(r.status === 200 || r.status === 400, `${body} → ${r.status}`);
    }
    const big = 'x'.repeat(1_100_000);
    const r = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body: big, headers: { 'x-hub-signature-256': 'sha256=00' } }).catch(e => ({ status: 'reset' }));
    assert.ok(r.status === 413 || r.status === 'reset' || r.status === 401);
    assert.equal((await fetch(`${base}/health`)).status, 200, 'server still up');
  });
});
