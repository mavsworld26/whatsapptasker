// Money-related state transitions (synchronous, inside DB transactions). Network calls happen only in
// payments/service.js jobs; this module records intent and verified provider facts.
import { formatIst, money, shortId } from '../parse.js';
import { areaLabel } from '../areas.js';
import { priceBreakdown } from '../matching.js';
import { workerDisplayName } from './customer.js';
import { t } from '../i18n.js';

export function feeRateFor(m, customerPhone) {
  return m.user(customerPhone)?.business_name ? m.config.feeRateBusiness : m.config.feeRateHousehold;
}

/** Customer accepted an offer: create the payment intent and schedule the provider call. */
export function startPayment(m, task, offer) {
  const price = priceBreakdown(offer.amount_paise, { feeRate: feeRateFor(m, task.customer_phone), gstRate: m.config.feeGstRate });
  const n = m.db.prepare('SELECT COUNT(*) AS n FROM payments WHERE task_id=?').get(task.id).n + 1;
  const reference = `${shortId(task.id)}-P${n}`;
  const channel = m.config.paymentConfiguration ? 'whatsapp_pay' : 'payment_link';
  const r = m.db.prepare(`INSERT INTO payments(task_id,offer_id,reference,amount_paise,worker_paise,fee_paise,fee_gst_paise,channel,status,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,'creating',?,?,?)`).run(task.id, offer.id, reference, price.total, price.quote, price.fee, price.gst, channel,
    m.now() + m.config.paymentLinkTtlMinutes * 60000, m.now(), m.now());
  const paymentId = Number(r.lastInsertRowid);
  m.job('payment.create', { paymentId }, { dedupeKey: `payment.create:${paymentId}` });
  m.audit(task.customer_phone, 'payment_intent', task.id, `${reference} ${price.total}`);
  return { paymentId, price, reference };
}

/** Provider link/order is ready: deliver the payment request on WhatsApp. */
export function paymentRequestReady(m, paymentId, { linkId = null, shortUrl = null } = {}) {
  const p = m.db.prepare('SELECT * FROM payments WHERE id=?').get(paymentId);
  if (!p || p.status !== 'creating') return false;
  m.db.prepare("UPDATE payments SET status='awaiting_payment', provider_link_id=?, short_url=?, updated_at=? WHERE id=?").run(linkId, shortUrl, m.now(), p.id);
  const task = m.task(p.task_id);
  sendPaymentRequest(m, task, m.db.prepare('SELECT * FROM payments WHERE id=?').get(p.id));
  return true;
}

export function sendPaymentRequest(m, task, p) {
  const id = shortId(task.id);
  const tpl = { key: 'payment_request', params: [id, money(p.amount_paise)] };
  if (p.channel === 'whatsapp_pay') {
    const lang = m.langOf(task.customer_phone);
    m.queue(task.customer_phone, 'order_details', {
      text: t(lang, 'pay_in_chat', { id, total: money(p.amount_paise) }),
      reference: p.reference, taskId: task.id, total: p.amount_paise, quote: p.worker_paise, fee: p.fee_paise, gst: p.fee_gst_paise,
      itemName: `Task ${id}`,
    }, tpl);
  } else {
    m.say(task.customer_phone, 'pay_link', { id, total: money(p.amount_paise), url: p.short_url, expires: formatIst(p.expires_at) }, { template: tpl });
  }
}

export function paymentCreationFailed(m, paymentId, reason) {
  const p = m.db.prepare('SELECT * FROM payments WHERE id=?').get(paymentId);
  if (!p || p.status !== 'creating') return;
  m.db.prepare("UPDATE payments SET status='failed', last_error=?, updated_at=? WHERE id=?").run(String(reason).slice(0, 300), m.now(), p.id);
  reopenAfterPaymentEnded(m, p);
  m.say(m.task(p.task_id).customer_phone, 'payment_failed_retry', { id: shortId(p.task_id) });
  m.ops(`Payment request ${p.reference} could not be created: ${String(reason).slice(0, 160)}`, 'finance');
}

function reopenAfterPaymentEnded(m, p) {
  const task = m.task(p.task_id);
  if (task.status === 'payment_pending' && task.accepted_offer_id === p.offer_id) {
    m.transition(task.id, ['payment_pending'], 'open', { accepted_offer_id: null });
    m.db.prepare("UPDATE offers SET status='active', updated_at=? WHERE id=? AND status='accepted'").run(m.now(), p.offer_id);
  }
}

/** Unpaid request passed its expiry: release the task back to open. */
export function expirePayment(m, p, reason = 'expired') {
  const r = m.db.prepare("UPDATE payments SET status=?, updated_at=? WHERE id=? AND status IN ('creating','awaiting_payment')").run(reason, m.now(), p.id);
  if (!r.changes) return false;
  reopenAfterPaymentEnded(m, p);
  if (p.provider_link_id) m.job('payment.cancel_link', { paymentId: p.id }, { dedupeKey: `payment.cancel_link:${p.id}` });
  const task = m.task(p.task_id);
  const offer = m.offer(p.offer_id);
  if (reason === 'expired') {
    m.say(task.customer_phone, 'payment_expired', { id: shortId(task.id) }, { template: { key: 'generic_update', params: [shortId(task.id), 'payment link expired'] } });
    if (offer) m.sayRaw(offer.worker_phone, `${shortId(task.id)}: the customer did not complete payment in time. Your offer is active again.`);
  }
  return true;
}

/**
 * A payment was verified with Razorpay (server-to-server). Books the task, or refunds automatically if the
 * booking is no longer valid (e.g. paid after expiry or after cancellation).
 */
export function markCaptured(m, paymentId, providerPaymentId) {
  const p = m.db.prepare('SELECT * FROM payments WHERE id=?').get(paymentId);
  if (!p) throw new Error(`Unknown payment ${paymentId}`);
  if (p.provider_payment_id === providerPaymentId && ['captured', 'refunded', 'partially_refunded'].includes(p.status)) return { duplicate: true };
  const task = m.task(p.task_id);
  const bookable = ['creating', 'awaiting_payment'].includes(p.status) && task.status === 'payment_pending' && task.accepted_offer_id === p.offer_id;
  if (!bookable) {
    // Money arrived for a booking we can no longer honour: record it and refund in full.
    m.db.prepare("UPDATE payments SET status='captured', provider_payment_id=?, updated_at=? WHERE id=?").run(providerPaymentId, m.now(), p.id);
    requestRefund(m, { paymentId: p.id, amount: p.amount_paise, reverse: 0, reason: 'late_payment_auto_refund', actor: 'system' });
    m.ops(`Late/invalid payment ${p.reference} (${money(p.amount_paise)}) for ${shortId(task.id)} in status ${task.status} — full refund queued.`, 'finance');
    return { refunded: true };
  }
  m.db.prepare("UPDATE payments SET status='captured', provider_payment_id=?, updated_at=? WHERE id=?").run(providerPaymentId, m.now(), p.id);
  m.transition(task.id, ['payment_pending'], 'booked');
  const offer = m.offer(p.offer_id);
  const others = m.db.prepare("SELECT * FROM offers WHERE task_id=? AND id<>? AND status='active'").all(task.id, offer.id);
  m.db.prepare("UPDATE offers SET status='declined', updated_at=? WHERE task_id=? AND id<>? AND status='active'").run(m.now(), task.id, offer.id);
  for (const o of others) m.say(o.worker_phone, 'offer_not_selected', { id: shortId(task.id) });
  const wp = m.workerProfile(offer.worker_phone);
  m.db.prepare(`INSERT INTO transfers(payment_id,task_id,worker_phone,linked_account_id,amount_paise,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'creating',?,?)`).run(p.id, task.id, offer.worker_phone, wp.linked_account_id, p.worker_paise, m.now(), m.now());
  const transferId = Number(m.db.prepare('SELECT last_insert_rowid() AS id').get().id);
  m.job('transfer.create', { transferId }, { dedupeKey: `transfer.create:${transferId}` });
  const id = shortId(task.id);
  const when = formatIst(task.scheduled_at);
  m.say(task.customer_phone, 'booked_customer', { id, total: money(p.amount_paise), worker: workerDisplayName(wp), when }, { template: { key: 'booking_confirmed', params: [id, when] } });
  m.say(offer.worker_phone, 'booked_worker', { id, description: task.description, area: areaLabel(task.area), when, quote: money(offer.amount_paise) }, { template: { key: 'booking_confirmed', params: [id, when] } });
  m.audit('razorpay', 'payment_captured', task.id, `${p.reference} ${providerPaymentId}`);
  return { booked: true };
}

/**
 * Record a refund intent. `reverse` is how much to pull back from the worker's Route transfer first.
 * Full refunds free the task for a new payment; partial refunds keep the payment live for the remainder.
 */
export function requestRefund(m, { paymentId, amount, reverse, reason, actor, releaseAfter = false }) {
  const p = m.db.prepare('SELECT * FROM payments WHERE id=?').get(paymentId);
  const remaining = p.amount_paise - p.refunded_paise;
  if (!(amount > 0) || amount > remaining) throw new Error(`Refund ${amount} exceeds refundable ${remaining}`);
  if (reverse > p.worker_paise) throw new Error('Reversal exceeds worker share');
  const r = m.db.prepare(`INSERT INTO refunds(payment_id,task_id,amount_paise,reverse_paise,reason,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'queued',?,?)`).run(p.id, p.task_id, amount, reverse, reason, m.now(), m.now());
  const refundId = Number(r.lastInsertRowid);
  const refunded = p.refunded_paise + amount;
  m.db.prepare('UPDATE payments SET refunded_paise=?, status=?, updated_at=? WHERE id=?')
    .run(refunded, refunded >= p.amount_paise ? 'refunded' : 'partially_refunded', m.now(), p.id);
  m.job('refund.execute', { refundId, releaseAfter }, { dedupeKey: `refund.execute:${refundId}` });
  m.audit(actor, 'refund_requested', p.task_id, `${refundId} ${amount} reverse ${reverse} ${reason}`);
  return refundId;
}

/** Release the worker's on-hold Route transfer (after confirmation, auto-confirm or dispute decision). */
export function requestRelease(m, taskId, actor) {
  const tr = m.db.prepare("SELECT * FROM transfers WHERE task_id=? AND status IN ('creating','on_hold') ORDER BY id DESC LIMIT 1").get(taskId);
  if (!tr) return false;
  m.job('transfer.release', { transferId: tr.id }, { dedupeKey: `transfer.release:${tr.id}` });
  m.audit(actor, 'payout_release_requested', taskId, `transfer ${tr.id}`);
  return true;
}
