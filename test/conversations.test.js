import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, onboard, onboardWorker, postTask, PHONES as P } from './helpers.js';
import { drainOutbox } from '../src/whatsapp.js';

test('first contact in Telugu: language picker, terms in Telugu, posting with a location pin', () => {
  const x = setup();
  x.send(P.customer, 'నమస్తే, నాకు సహాయం కావాలి');
  const first = x.messages(P.customer)[0];
  assert.equal(first.kind, 'interactive');
  assert.deepEqual(first.payload.list.rows.map(r => r.id), ['LANG en', 'LANG te', 'LANG hi', 'LANG hinglish']);
  assert.match(first.payload.text, /స్వాగతం/);
  x.send(P.customer, 'POST');
  assert.match(x.last(P.customer), /నిబంధనలు/, 'terms must be accepted before using the service');
  x.send(P.customer, 'LANG te');
  x.send(P.customer, 'అంగీకరిస్తున్నాను');
  x.send(P.customer, 'కొత్త పని');
  assert.match(x.last(P.customer), /పనిని ఒకే సందేశంలో/);
  x.send(P.customer, 'ఇంటి సామాను రెండో అంతస్తుకు మార్చాలి');
  x.send(P.customer, '', { type: 'location', location: { lat: 17.4489, lng: 78.3905 } });
  x.send(P.customer, '900');
  x.send(P.customer, 'రేపు 11 am');
  x.send(P.customer, 'అవును');
  const task = x.task();
  assert.equal(task.area, 'madhapur');
  assert.equal(task.lat, 17.4489);
  assert.equal(task.category, 'moving');
  assert.match(x.last(P.customer), /HYD0001 పోస్ట్ అయింది/);
  assert.ok(x.db.prepare('SELECT terms_accepted_at FROM users WHERE phone=?').get(P.customer).terms_accepted_at);
});

test('Hindi and Hinglish customers get replies in their language', () => {
  const x = setup();
  onboard(x, P.customer, 'hi');
  x.send(P.customer, 'नया काम');
  assert.match(x.last(P.customer), /काम एक मैसेज में बताइए/);
  onboard(x, P.stranger, 'hinglish');
  x.send(P.stranger, 'mere kaam');
  assert.match(x.last(P.stranger), /Abhi koi kaam nahi hai/);
});

test('posting validates area, budget and time and enforces the daily limit', () => {
  const x = setup({ MAX_TASKS_PER_DAY: '2' });
  onboard(x, P.customer);
  x.send(P.customer, 'POST');
  x.send(P.customer, 'short');
  assert.match(x.last(P.customer), /12–500/);
  x.send(P.customer, 'Clean my 2BHK kitchen and bathrooms');
  x.send(P.customer, 'Vijayawada');
  assert.match(x.last(P.customer), /don't serve that location/);
  x.send(P.customer, 'Uppal'); // known city area, but not in the pilot list
  assert.match(x.last(P.customer), /don't serve/);
  x.send(P.customer, 'Kondapur');
  x.send(P.customer, '20');
  assert.match(x.last(P.customer), /₹100 and/);
  x.send(P.customer, '1500');
  x.send(P.customer, 'yesterday');
  assert.match(x.last(P.customer), /1 hour and 60 days/);
  x.send(P.customer, 'today 10:30 am'); // only 30 minutes away
  assert.match(x.last(P.customer), /1 hour and 60 days/);
  x.send(P.customer, 'tomorrow 9 am');
  x.send(P.customer, 'YES');
  assert.equal(x.task().category, 'cleaning');
  x.advance(61000); // stay under the per-minute rate limit
  postTask(x);
  postTask(x);
  assert.equal(x.count('SELECT COUNT(*) n FROM tasks'), 2);
  assert.match(x.last(P.customer), /Limit reached/);
});

test('a description that starts with "help" is treated as the description while posting', () => {
  const x = setup();
  onboard(x, P.customer);
  x.send(P.customer, 'POST');
  x.send(P.customer, 'Help me move my sofa to the balcony');
  assert.match(x.last(P.customer), /Where is the job/);
});

test('sensitive tasks wait for moderation; only verifiers can release them', () => {
  const x = setup();
  onboardWorker(x);
  onboard(x, P.customer);
  postTask(x, P.customer, { description: 'Fix electrical wiring for the new fan' });
  assert.equal(x.task().status, 'review_pending');
  assert.equal(x.count('SELECT COUNT(*) n FROM dispatches'), 0);
  x.send(P.support, 'RELEASE HYD0001');
  assert.match(x.last(P.support), /Not permitted/);
  x.send(P.stranger, 'RELEASE HYD0001');
  assert.equal(x.task().status, 'review_pending');
  x.send(P.admin, 'REJECTJOB HYD0001 Needs a licensed electrician');
  assert.equal(x.task().status, 'rejected');
  assert.match(x.last(P.customer), /licensed electrician/);
});

test('worker verification: checks + payout account required, ID numbers refused, unverified workers cannot bid', () => {
  const x = setup();
  onboard(x, P.customer); postTask(x);
  onboard(x, P.worker);
  x.send(P.worker, 'JOIN'); x.send(P.worker, 'Ravi Kumar'); x.send(P.worker, 'Gachibowli'); x.send(P.worker, 'moving, packing');
  assert.equal(x.market.workerProfile(P.worker).status, 'pending');
  assert.deepEqual(JSON.parse(x.market.workerProfile(P.worker).skills), ['moving', 'packing']);
  x.send(P.worker, 'OFFER HYD0001 700');
  assert.equal(x.count('SELECT COUNT(*) n FROM offers'), 0);
  x.send(P.admin, `APPROVE ${P.worker}`);
  assert.match(x.last(P.admin), /Missing: identity, police, interview, LINKACC/);
  x.send(P.admin, `CHECK ${P.worker} identity 123412341234`);
  assert.match(x.last(P.admin), /looks like an Aadhaar/);
  for (const c of ['identity', 'police', 'interview']) x.send(P.admin, `CHECK ${P.worker} ${c} CASE-77`);
  x.send(P.admin, `LINKACC ${P.worker} not-an-account`);
  assert.match(x.last(P.admin), /Usage: LINKACC/);
  x.send(P.admin, `LINKACC ${P.worker} acc_ABCDEFGH1234`);
  x.send(P.admin, `APPROVE ${P.worker}`);
  assert.equal(x.market.workerProfile(P.worker).status, 'approved');
  x.send(P.worker, 'TASKS');
  assert.match(x.last(P.worker), /HYD0001/);
  x.send(P.worker, 'OFFER HYD0001 700');
  assert.equal(x.count('SELECT COUNT(*) n FROM offers'), 1);
  x.send(P.admin, `SUSPEND ${P.worker} complaint under review`);
  assert.equal(x.db.prepare('SELECT status FROM offers').get().status, 'withdrawn');
  x.send(P.worker, 'OFFER HYD0001 650');
  assert.match(x.last(P.worker), /suspended/);
});

test('workers outside the radius or skill cannot bid or see the job', () => {
  const x = setup();
  onboardWorker(x, P.worker2, { area: 'Uppal', account: 'acc_TESTWORKER0002' });
  onboard(x, P.customer); postTask(x);
  x.send(P.worker2, 'OFFER HYD0001 700');
  assert.match(x.last(P.worker2), /not open for your offer/);
  x.send(P.worker2, 'STATUS HYD0001');
  assert.match(x.last(P.worker2), /not found/);
});

test('payments not configured: booking is refused honestly and nobody is charged', () => {
  const x = setup({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '' });
  onboardWorker(x); onboard(x, P.customer); postTask(x);
  x.send(P.worker, 'OFFER HYD0001 700');
  x.send(P.customer, 'ACCEPT 1');
  assert.equal(x.task().status, 'open');
  assert.equal(x.count('SELECT COUNT(*) n FROM payments'), 0);
  assert.match(x.last(P.customer), /not active yet.*not been charged/s);
});

test('customer sees ranked offers as an interactive list with totals', () => {
  const x = setup();
  onboardWorker(x);
  onboardWorker(x, P.worker2, { name: 'Sita Devi', account: 'acc_TESTWORKER0002' });
  onboard(x, P.customer); postTask(x);
  x.send(P.worker, 'OFFER HYD0001 750');
  x.send(P.worker2, 'OFFER HYD0001 700');
  x.send(P.customer, 'STATUS HYD0001');
  const msg = x.messages(P.customer).at(-1);
  assert.equal(msg.kind, 'interactive');
  assert.deepEqual(msg.payload.list.rows.map(r => r.id), ['ACCEPT 2', 'ACCEPT 1']);
  assert.match(msg.payload.list.rows[0].description, /Sita D\..*total ₹826\.00|Sita D\..*total ₹848\.68/);
  x.send(P.stranger, 'ACCEPT 2');
  assert.equal(x.task().status, 'open', 'only the task owner can accept');
});

test('support: HELP tickets, operator replies relayed on WhatsApp, permission checks', () => {
  const x = setup();
  onboard(x, P.customer);
  x.send(P.customer, 'HELP How do refunds work?');
  assert.match(x.last(P.customer), /Ticket #1 created/);
  assert.match(x.allText(P.support), /Support ticket #1/);
  x.send(P.support, 'REPLY 1 Refunds go back to your original payment method in 5-7 days.');
  assert.match(x.last(P.customer), /Support \(ticket #1\): Refunds go back/);
  x.send(P.support, 'REFUND HYD0001 full test');
  assert.match(x.last(P.support), /Not permitted/);
  x.send(P.support, 'CLOSE 1 answered');
  assert.match(x.last(P.customer), /Ticket #1 resolved: answered/);
});

test('STOP/START, rate limiting, blocking and duplicate message ids', async () => {
  const x = setup({ MAX_MESSAGES_PER_MINUTE: '5' });
  onboard(x, P.customer);
  const dup = x.market.processMessage({ from: P.customer, id: 'wamid.same', text: 'MENU' });
  assert.equal(dup.processed, true);
  assert.equal(x.market.processMessage({ from: P.customer, id: 'wamid.same', text: 'MENU' }).duplicate, true);
  for (let i = 0; i < 6; i++) x.send(P.customer, 'MENU');
  assert.equal(x.send(P.customer, 'MENU').rateLimited, true);
  assert.match(x.last(P.customer), /too quickly/);
  x.advance(61000);
  x.send(P.customer, 'STOP');
  const before = x.messages(P.customer).length;
  x.send(P.customer, 'POST');
  assert.equal(x.messages(P.customer).length, before, 'opted-out users get no replies');
  x.send(P.customer, 'START');
  assert.match(x.last(P.customer), /opted in/);
  x.send(P.admin, `BLOCK ${P.customer}`);
  assert.equal(x.send(P.customer, 'POST').blocked, true);
});

test('outbox: 24h window, approved-template fallback, opt-out and re-engagement errors', async () => {
  const x = setup({ WA_TEMPLATES: JSON.stringify({ job_alert: 'hyd_job_alert_v1' }) });
  const config = { ...x.config, dryRun: false };
  onboardWorker(x);
  onboard(x, P.customer);
  await drainOutbox(x.db, config, async () => ({ messageId: 'm' }), { now: x.now });
  x.advance(30 * 3600000); // worker is now outside the 24h window
  postTask(x);
  const sent = [];
  await drainOutbox(x.db, config, async (cfg, body) => { sent.push(body); return { messageId: `wamid.out${sent.length}` }; }, { now: x.now });
  const toWorker = sent.filter(b => b.to === P.worker);
  assert.equal(toWorker.length, 1);
  assert.equal(toWorker[0].type, 'template');
  assert.equal(toWorker[0].template.name, 'hyd_job_alert_v1');
  assert.equal(toWorker[0].template.components[0].parameters[0].text, 'HYD0001');
  // A message with no approved template waits for the user to come back.
  x.market.say(P.worker, 'available_on');
  await drainOutbox(x.db, config, async () => ({}), { now: x.now });
  assert.equal(x.db.prepare('SELECT status FROM outbox ORDER BY id DESC LIMIT 1').get().status, 'waiting_window');
  x.send(P.worker, 'TASKS');
  assert.equal(x.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='waiting_window'").get().n, 0);
  // Meta 131047 (re-engagement required) parks the message instead of retrying.
  const err = Object.assign(new Error('re-engage'), { httpStatus: 400, code: 131047 });
  await drainOutbox(x.db, config, async () => { throw err; }, { now: x.now });
  assert.ok(x.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='waiting_window'").get().n >= 1);
});

test('data rights: MYDATA summary and erasure keep financial records but remove personal content', () => {
  const x = setup();
  onboardWorker(x); onboard(x, P.customer); postTask(x);
  x.send(P.customer, 'MYDATA');
  assert.match(x.last(P.customer), /1 jobs posted/);
  x.send(P.customer, 'DELETE MY DATA');
  assert.equal(x.task().description, '[erased]');
  const u = x.market.user(P.customer);
  assert.ok(u.erased_at);
  assert.equal(u.opted_in, 0);
  assert.match(x.last(P.customer), /erased/);
});
