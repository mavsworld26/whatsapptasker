import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { setup, bookedFlow, PHONES as P } from './helpers.js';
import { buildRequest, parseWebhook } from '../src/whatsapp.js';

async function withServer(x, fn) {
  await new Promise(r => x.app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${x.app.server.address().port}`;
  try { await fn(base); } finally { await new Promise(r => x.app.server.close(r)); }
}
const metaSig = (body, secret = 'meta-secret') => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
const rzpSig = (body, secret = 'whsec_test') => createHmac('sha256', secret).update(body).digest('hex');
const inbound = (id, text, from = P.customer) => JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1234' }, contacts: [{ wa_id: from, profile: { name: 'Lakshmi' } }], messages: [{ id, from, timestamp: '1795494600', type: 'text', text: { body: text } }] } }] }],
});

test('Meta webhook: verification handshake, signature enforcement, idempotent processing', async () => {
  const x = setup();
  await withServer(x, async base => {
    const ok = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token-for-tests-123456&hub.challenge=987654`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '987654');
    assert.equal((await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)).status, 403);

    const body = inbound('wamid.A', 'hi');
    assert.equal((await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body })).status, 401);
    assert.equal((await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body, headers: { 'x-hub-signature-256': metaSig(body, 'other') } })).status, 401);
    const res = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body, headers: { 'x-hub-signature-256': metaSig(body) } });
    assert.equal(res.status, 200);
    await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body, headers: { 'x-hub-signature-256': metaSig(body) } });
    assert.equal(x.count('SELECT COUNT(*) n FROM inbound_events'), 1);
    assert.equal(x.market.user(P.customer).name, 'Lakshmi');
    const bad = '{not json';
    assert.equal((await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', body: bad, headers: { 'x-hub-signature-256': metaSig(bad) } })).status, 400);
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/ready`)).status, 200);
  });
});

test('Razorpay webhook: signature required, event deduplicated, booking only after server-side verification', async () => {
  const x = setup();
  const p = await bookedFlow(x, { pay: false });
  x.rzp.customerPaysLink(p.provider_link_id);
  await withServer(x, async base => {
    const body = JSON.stringify({ event: 'payment_link.paid', created_at: 1, payload: { payment_link: { entity: { id: p.provider_link_id } } } });
    assert.equal((await fetch(`${base}/webhooks/razorpay`, { method: 'POST', body, headers: { 'x-razorpay-signature': rzpSig(body, 'nope') } })).status, 401);
    const headers = { 'x-razorpay-signature': rzpSig(body), 'x-razorpay-event-id': 'evt_1' };
    assert.deepEqual(await (await fetch(`${base}/webhooks/razorpay`, { method: 'POST', body, headers })).json(), { accepted: true });
    assert.deepEqual(await (await fetch(`${base}/webhooks/razorpay`, { method: 'POST', body, headers })).json(), { duplicate: true });
  });
  await x.settle();
  assert.equal(x.task().status, 'booked');
});

test('WhatsApp payloads: interactive limits, templates and order_details are well-formed', () => {
  const cfg = { templates: { job_alert: 'hyd_job_alert_v1' }, paymentConfiguration: 'hyd-razorpay' };
  const btn = buildRequest('91999', 'interactive', { text: 'x', buttons: [{ id: 'A', title: 'A very long button title indeed' }] }, null, 'en', cfg, false);
  assert.equal(btn.interactive.action.buttons[0].reply.title.length, 20);
  const tpl = buildRequest('91999', 'text', { text: 'x' }, { key: 'job_alert', params: ['HYD0001'] }, 'hinglish', cfg, true);
  assert.equal(tpl.template.language.code, 'en');
  const order = buildRequest('91999', 'order_details', { text: 'Pay', reference: 'HYD0001-P1', taskId: 1, total: 90930, quote: 75000, fee: 13500, gst: 2430, itemName: 'Task HYD0001' }, null, 'te', cfg, false);
  const params = order.interactive.action.parameters;
  assert.equal(params.total_amount.value, params.order.subtotal.value + params.order.tax.value);
  assert.equal(params.payment_settings[0].payment_gateway.configuration_name, 'hyd-razorpay');
  const parsed = parseWebhook({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1' }, statuses: [{ id: 's', type: 'payment', status: 'captured', payment: { reference_id: 'HYD0001-P1', transaction: { pg_transaction_id: 'pay_1', status: 'success' } } }] } }] }] }, '1');
  assert.equal(parsed.statuses[0].kind, 'payment');
  assert.equal(parsed.statuses[0].pgTransactionId, 'pay_1');
});
