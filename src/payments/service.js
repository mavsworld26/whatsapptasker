// Payment side effects: every provider call runs here, in a background job, followed by a short DB
// transaction that records the verified result. Webhooks never change money state directly — they only
// schedule a server-to-server verification with Razorpay.
import { transactional } from '../db.js';
import { RetryLater } from '../jobs.js';
import { log } from '../logger.js';
import { money, shortId } from '../parse.js';
import { markCaptured, paymentCreationFailed, paymentRequestReady } from '../marketplace/payflow.js';

const row = (db, sql, ...a) => db.prepare(sql).get(...a);

export function createPaymentHandlers(market, razorpay) {
  const { db } = market;
  const tx = fn => transactional(db, fn);

  async function findOrCreateLink(p, task) {
    try {
      return await razorpay.createPaymentLink({
        amountPaise: p.amount_paise, reference: p.reference,
        description: `HYD Tasks ${shortId(task.id)} — tasker ${money(p.worker_paise)} + fee ${money(p.fee_paise)} + GST ${money(p.fee_gst_paise)}`,
        customerPhone: task.customer_phone, expireBy: p.expires_at, notes: { reference: p.reference, task_id: String(task.id) },
      });
    } catch (err) {
      // Unknown outcome (timeout) or duplicate reference: the link may already exist — reconcile by reference.
      const existing = await razorpay.findPaymentLinkByReference(p.reference).catch(() => null);
      if (existing) return existing;
      throw err;
    }
  }

  return {
    async 'payment.create'({ paymentId }) {
      const p = row(db, 'SELECT * FROM payments WHERE id=?', paymentId);
      if (!p || p.status !== 'creating') return;
      const task = market.task(p.task_id);
      if (p.channel === 'whatsapp_pay') { tx(() => paymentRequestReady(market, p.id)); return; }
      let link;
      try {
        link = await findOrCreateLink(p, task);
      } catch (err) {
        if (err.retryable) throw err;
        tx(() => paymentCreationFailed(market, p.id, err.message));
        return;
      }
      if (link.amount !== p.amount_paise || link.reference_id !== p.reference || link.currency !== 'INR') {
        tx(() => paymentCreationFailed(market, p.id, `link mismatch ${link.id}`));
        return;
      }
      tx(() => paymentRequestReady(market, p.id, { linkId: link.id, shortUrl: link.short_url }));
    },

    async 'payment.cancel_link'({ paymentId }) {
      const p = row(db, 'SELECT * FROM payments WHERE id=?', paymentId);
      if (!p?.provider_link_id) return;
      try { await razorpay.cancelPaymentLink(p.provider_link_id); }
      catch (err) { if (err.retryable) throw err; log.info('payment_link.cancel_skipped', { paymentId, error: err.message.slice(0, 120) }); }
    },

    // Triggered by payment_link.paid: confirm with Razorpay before booking.
    async 'payment.verify_link'({ linkId }) {
      const p = row(db, 'SELECT * FROM payments WHERE provider_link_id=?', linkId);
      if (!p) throw Object.assign(new Error(`No payment for link ${linkId}`), { retryable: false });
      const link = await razorpay.fetchPaymentLink(linkId);
      if (link.status !== 'paid') { log.warn('payment_link.not_paid_on_verify', { linkId, status: link.status }); return; }
      if (link.reference_id !== p.reference || link.amount_paid !== p.amount_paise) {
        throw Object.assign(new Error(`Link ${linkId} amount/reference mismatch`), { retryable: false });
      }
      const captured = (link.payments || []).find(x => x.status === 'captured');
      if (!captured) throw new RetryLater('link paid but no captured payment listed yet');
      const pay = await razorpay.fetchPayment(captured.payment_id);
      if (pay.status !== 'captured' || pay.amount !== p.amount_paise || pay.currency !== 'INR') {
        throw Object.assign(new Error(`Payment ${pay.id} failed verification (${pay.status} ${pay.amount} ${pay.currency})`), { retryable: false });
      }
      tx(() => capture(p.id, pay.id));
    },

    // Triggered by payment.captured (Razorpay) or a WhatsApp Pay status webhook.
    async 'payment.verify_payment'({ providerPaymentId, reference }) {
      const p = row(db, 'SELECT * FROM payments WHERE reference=?', reference);
      if (!p) throw Object.assign(new Error(`Unknown payment reference ${reference}`), { retryable: false });
      const pay = await razorpay.fetchPayment(providerPaymentId);
      if (pay.status === 'authorized') throw new RetryLater('payment authorized, awaiting auto-capture', 60000);
      if (pay.status !== 'captured' || pay.amount !== p.amount_paise || pay.currency !== 'INR' || pay.notes?.reference !== p.reference) {
        throw Object.assign(new Error(`Payment ${providerPaymentId} failed verification for ${reference}`), { retryable: false });
      }
      tx(() => capture(p.id, pay.id));
    },

    async 'transfer.create'({ transferId }) {
      const tr = row(db, 'SELECT * FROM transfers WHERE id=?', transferId);
      if (!tr || tr.status !== 'creating') return;
      const amount = tr.amount_paise - tr.reversed_paise;
      if (amount <= 0) { tx(() => db.prepare("UPDATE transfers SET status='reversed', updated_at=? WHERE id=?").run(market.now(), tr.id)); return; }
      const p = row(db, 'SELECT * FROM payments WHERE id=?', tr.payment_id);
      const ref = `T${tr.id}`;
      let transfer;
      try {
        const res = await razorpay.createTransfer(p.provider_payment_id, { account: tr.linked_account_id, amountPaise: amount, onHold: true, notes: { transfer_ref: ref, task: shortId(tr.task_id) } });
        transfer = res.items?.[0] || res;
      } catch (err) {
        const list = await razorpay.listTransfers(p.provider_payment_id).catch(() => null);
        transfer = list?.items?.find(x => x.notes?.transfer_ref === ref);
        if (!transfer) throw err;
      }
      tx(() => db.prepare("UPDATE transfers SET provider_transfer_id=?, amount_paise=?, reversed_paise=0, status='on_hold', updated_at=? WHERE id=? AND status='creating'")
        .run(transfer.id, amount, market.now(), tr.id));
    },

    async 'transfer.release'({ transferId }) {
      const tr = row(db, 'SELECT * FROM transfers WHERE id=?', transferId);
      if (!tr || tr.status === 'released' || tr.status === 'reversed') return;
      if (tr.status === 'creating') throw new RetryLater('transfer not created yet', 20000);
      const task = market.task(tr.task_id);
      if (task.status !== 'completed') throw Object.assign(new Error(`Refusing release: ${shortId(task.id)} is ${task.status}`), { retryable: false });
      await razorpay.setTransferHold(tr.provider_transfer_id, false);
      tx(() => {
        db.prepare("UPDATE transfers SET status='released', updated_at=? WHERE id=?").run(market.now(), tr.id);
        market.say(tr.worker_phone, 'payout_released', { amount: money(tr.amount_paise), id: shortId(tr.task_id), ref: tr.provider_transfer_id },
          { template: { key: 'generic_update', params: [shortId(tr.task_id), 'payout released'] } });
        market.audit('razorpay', 'payout_released', tr.task_id, tr.provider_transfer_id);
      });
    },

    async 'refund.execute'({ refundId, releaseAfter }) {
      let rf = row(db, 'SELECT * FROM refunds WHERE id=?', refundId);
      if (!rf || rf.status === 'failed') return;
      const p = row(db, 'SELECT * FROM payments WHERE id=?', rf.payment_id);
      const ref = `R${rf.id}`;
      // 1) Claw back the worker share from the Route transfer, if any.
      if (rf.status === 'queued') {
        const tr = row(db, 'SELECT * FROM transfers WHERE payment_id=?', p.id);
        const reverse = tr ? Math.min(rf.reverse_paise, tr.amount_paise - tr.reversed_paise) : 0;
        if (reverse > 0 && tr.status === 'creating') {
          tx(() => {
            db.prepare("UPDATE transfers SET reversed_paise=reversed_paise+?, status=CASE WHEN amount_paise-reversed_paise-?<=0 THEN 'reversed' ELSE status END, updated_at=? WHERE id=?").run(reverse, reverse, market.now(), tr.id);
            db.prepare("UPDATE refunds SET status='reversed', provider_reversal_id='not_transferred', updated_at=? WHERE id=?").run(market.now(), rf.id);
          });
        } else if (reverse > 0 && tr.status === 'on_hold') {
          let reversal;
          try { reversal = await razorpay.reverseTransfer(tr.provider_transfer_id, reverse, { refund_ref: ref }); }
          catch (err) {
            const list = await razorpay.listReversals(tr.provider_transfer_id).catch(() => null);
            reversal = list?.items?.find(x => x.notes?.refund_ref === ref);
            if (!reversal) throw err;
          }
          tx(() => {
            db.prepare("UPDATE transfers SET reversed_paise=reversed_paise+?, status=CASE WHEN amount_paise-reversed_paise-?<=0 THEN 'reversed' ELSE status END, updated_at=? WHERE id=?").run(reverse, reverse, market.now(), tr.id);
            db.prepare("UPDATE refunds SET status='reversed', provider_reversal_id=?, updated_at=? WHERE id=?").run(reversal.id, market.now(), rf.id);
          });
        } else {
          if (reverse > 0 && tr.status === 'released') market.ops(`Refund ${ref} on ${shortId(rf.task_id)}: worker transfer already released — refund comes from platform balance; recover manually if needed.`, 'finance');
          tx(() => db.prepare("UPDATE refunds SET status='reversed', updated_at=? WHERE id=?").run(market.now(), rf.id));
        }
        rf = row(db, 'SELECT * FROM refunds WHERE id=?', refundId);
      }
      // 2) Refund the customer.
      if (rf.status === 'reversed') {
        let refund;
        try { refund = await razorpay.refundPayment(p.provider_payment_id, { amountPaise: rf.amount_paise, receipt: ref, notes: { refund_ref: ref, reason: rf.reason.slice(0, 200) } }); }
        catch (err) {
          const list = await razorpay.listRefunds(p.provider_payment_id).catch(() => null);
          refund = list?.items?.find(x => x.notes?.refund_ref === ref);
          if (!refund) throw err;
        }
        tx(() => {
          db.prepare('UPDATE refunds SET status=?, provider_refund_id=?, updated_at=? WHERE id=?').run(refund.status === 'processed' ? 'processed' : 'requested', refund.id, market.now(), rf.id);
          if (refund.status === 'processed') notifyRefundProcessed(market, rf, refund.id);
          market.audit('razorpay', 'refund_created', rf.task_id, `${ref} ${refund.id} ${refund.status}`);
        });
      }
      // 3) Partial refunds in disputes release the remaining worker share.
      if (releaseAfter) {
        const tr = row(db, "SELECT * FROM transfers WHERE payment_id=? AND status IN ('creating','on_hold')", p.id);
        if (tr) tx(() => market.job('transfer.release', { transferId: tr.id }, { dedupeKey: `transfer.release:${tr.id}` }));
      }
    },

    async 'refund.sync'({ providerRefundId, status }) {
      const rf = row(db, 'SELECT * FROM refunds WHERE provider_refund_id=?', providerRefundId);
      if (!rf) throw new RetryLater(`refund ${providerRefundId} not yet recorded`, 60000);
      if (rf.status === 'processed' || rf.status === 'failed') return;
      tx(() => {
        if (status === 'processed') {
          db.prepare("UPDATE refunds SET status='processed', updated_at=? WHERE id=?").run(market.now(), rf.id);
          notifyRefundProcessed(market, rf, providerRefundId);
        } else if (status === 'failed') {
          markRefundFailed(market, rf, 'provider reported refund.failed');
        }
      });
    },
  };

  function capture(paymentId, providerPaymentId) {
    const p = row(db, 'SELECT * FROM payments WHERE id=?', paymentId);
    if (p.provider_payment_id && p.provider_payment_id !== providerPaymentId) {
      // A second successful payment for the same request: record it separately and refund it in full.
      const r = db.prepare(`INSERT INTO payments(task_id,offer_id,reference,amount_paise,worker_paise,fee_paise,fee_gst_paise,channel,provider_payment_id,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'expired',?,?)`).run(p.task_id, p.offer_id, `${p.reference}-DUP-${providerPaymentId}`, p.amount_paise, 0, 0, 0, p.channel, providerPaymentId, market.now(), market.now());
      const dupId = Number(r.lastInsertRowid);
      const rr = db.prepare(`INSERT INTO refunds(payment_id,task_id,amount_paise,reverse_paise,reason,status,created_at,updated_at) VALUES (?,?,?,0,'duplicate_payment','queued',?,?)`)
        .run(dupId, p.task_id, p.amount_paise, market.now(), market.now());
      db.prepare("UPDATE payments SET status='refunded', refunded_paise=amount_paise WHERE id=?").run(dupId);
      market.job('refund.execute', { refundId: Number(rr.lastInsertRowid) }, { dedupeKey: `refund.execute:${rr.lastInsertRowid}` });
      market.ops(`Duplicate payment ${providerPaymentId} for ${p.reference} — full refund queued.`, 'finance');
      return { duplicatePayment: true };
    }
    return markCaptured(market, paymentId, providerPaymentId);
  }
}

function notifyRefundProcessed(market, rf, providerRefundId) {
  const task = market.task(rf.task_id);
  market.say(task.customer_phone, 'refund_processed', { amount: money(rf.amount_paise), id: shortId(task.id), ref: providerRefundId },
    { template: { key: 'generic_update', params: [shortId(task.id), 'refund processed'] } });
}

export function markRefundFailed(market, rf, reason) {
  market.db.prepare("UPDATE refunds SET status='failed', last_error=?, updated_at=? WHERE id=?").run(String(reason).slice(0, 300), market.now(), rf.id);
  const task = market.task(rf.task_id);
  market.say(task.customer_phone, 'refund_failed', { id: shortId(task.id) });
  market.ops(`❗ Refund R${rf.id} (${money(rf.amount_paise)}) for ${shortId(task.id)} FAILED: ${String(reason).slice(0, 160)}. Resolve in Razorpay Dashboard.`, 'finance');
}

/** Called when a job exhausts retries or fails permanently. Records money-relevant failures for humans. */
export function onJobFailure(market) {
  return (job, err) => {
    const payload = JSON.parse(job.payload);
    transactional(market.db, () => {
      if (job.type === 'payment.create') paymentCreationFailed(market, payload.paymentId, err.message);
      else if (job.type === 'refund.execute') {
        const rf = market.db.prepare('SELECT * FROM refunds WHERE id=?').get(payload.refundId);
        if (rf && rf.status !== 'processed') markRefundFailed(market, rf, err.message);
      } else if (job.type === 'transfer.create' || job.type === 'transfer.release') {
        market.db.prepare('UPDATE transfers SET last_error=?, updated_at=? WHERE id=?').run(String(err.message).slice(0, 300), market.now(), payload.transferId);
        market.ops(`❗ Payout job ${job.type} for transfer ${payload.transferId} failed: ${String(err.message).slice(0, 160)}`, 'finance');
      } else {
        market.ops(`❗ Background job ${job.type} #${job.id} failed: ${String(err.message).slice(0, 160)}`, 'finance');
      }
    });
  };
}

/** Routes a signature-verified Razorpay webhook event into verification jobs. Synchronous; call inside a transaction. */
export function handleRazorpayEvent(market, event, eventId) {
  const inserted = market.db.prepare('INSERT OR IGNORE INTO provider_events(provider,event_id,event_type,received_at) VALUES (?,?,?,?)')
    .run('razorpay', eventId, String(event.event), market.now());
  if (!inserted.changes) return { duplicate: true };
  const pl = event.payload || {};
  switch (event.event) {
    case 'payment_link.paid': {
      const linkId = pl.payment_link?.entity?.id;
      if (linkId) market.job('payment.verify_link', { linkId }, { dedupeKey: `verify_link:${linkId}` });
      break;
    }
    case 'payment.captured': {
      const pay = pl.payment?.entity;
      if (pay?.id && pay.notes?.reference) market.job('payment.verify_payment', { providerPaymentId: pay.id, reference: pay.notes.reference }, { dedupeKey: `verify_payment:${pay.id}` });
      break;
    }
    case 'refund.processed':
    case 'refund.failed': {
      const refund = pl.refund?.entity;
      if (refund?.id) market.job('refund.sync', { providerRefundId: refund.id, status: event.event.split('.')[1] }, { dedupeKey: `refund.sync:${refund.id}:${event.event}` });
      break;
    }
    default:
      break;
  }
  return { accepted: true };
}

/** WhatsApp Pay status webhooks are hints only: verify the PG transaction with Razorpay before booking. */
export function handleWhatsAppPaymentStatus(market, status) {
  if (!status.referenceId || !status.pgTransactionId) return;
  if (!['captured', 'success'].includes(String(status.status).toLowerCase()) && String(status.transactionStatus).toLowerCase() !== 'success') return;
  market.job('payment.verify_payment', { providerPaymentId: status.pgTransactionId, reference: status.referenceId }, { dedupeKey: `verify_payment:${status.pgTransactionId}` });
}
