// WhatsApp Business Platform (Cloud API) adapter: webhook parsing, message building, sending and the durable outbox.
import { TEMPLATE_LANG } from './i18n.js';
import { log, maskPhone } from './logger.js';

const truncate = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/** Normalises a Meta webhook payload into inbound messages and status updates. */
export function parseWebhook(payload, expectedPhoneNumberId = '') {
  const messages = [];
  const statuses = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      if (expectedPhoneNumberId && value.metadata?.phone_number_id !== expectedPhoneNumberId) continue;
      const names = Object.fromEntries((value.contacts || []).map(c => [c.wa_id, c.profile?.name]));
      for (const msg of value.messages || []) {
        const m = { id: msg.id, from: msg.from, type: msg.type, text: '', profileName: names[msg.from] || null, timestamp: Number(msg.timestamp) * 1000 || null };
        if (msg.type === 'text') m.text = msg.text?.body || '';
        else if (msg.type === 'button') m.text = msg.button?.payload || msg.button?.text || '';
        else if (msg.type === 'interactive') m.text = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || '';
        else if (msg.type === 'location') m.location = { lat: Number(msg.location?.latitude), lng: Number(msg.location?.longitude) };
        messages.push(m);
      }
      for (const st of value.statuses || []) {
        if (st.type === 'payment' || st.payment) {
          statuses.push({
            kind: 'payment', id: st.id, status: st.status, recipient: st.recipient_id,
            referenceId: st.payment?.reference_id || null,
            amount: st.payment?.amount ? { value: Number(st.payment.amount.value), offset: Number(st.payment.amount.offset) } : null,
            pgTransactionId: st.payment?.transaction?.pg_transaction_id || null,
            transactionStatus: st.payment?.transaction?.status || null,
          });
        } else {
          statuses.push({ kind: 'delivery', id: st.id, status: st.status, recipient: st.recipient_id, errors: (st.errors || []).map(e => ({ code: e.code, title: e.title })) });
        }
      }
    }
  }
  return { messages, statuses };
}

/** Builds the Cloud API request body for one outbox row. */
export function buildRequest(to, kind, payload, template, lang, config, useTemplate) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (useTemplate) {
    return {
      ...base, type: 'template',
      template: {
        name: config.templates[template.key],
        language: { code: TEMPLATE_LANG[lang] || 'en' },
        components: [{ type: 'body', parameters: template.params.map(p => ({ type: 'text', text: truncate(p, 1000) })) }],
      },
    };
  }
  if (kind === 'interactive' && payload.buttons) {
    return {
      ...base, type: 'interactive',
      interactive: {
        type: 'button', body: { text: truncate(payload.text, 1024) },
        action: { buttons: payload.buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: truncate(b.id, 256), title: truncate(b.title, 20) } })) },
      },
    };
  }
  if (kind === 'interactive' && payload.list) {
    return {
      ...base, type: 'interactive',
      interactive: {
        type: 'list', body: { text: truncate(payload.text, 4096) },
        action: {
          button: truncate(payload.list.button, 20),
          sections: [{ title: truncate(payload.list.title || 'Options', 24), rows: payload.list.rows.slice(0, 10).map(r => ({ id: truncate(r.id, 200), title: truncate(r.title, 24), ...(r.description ? { description: truncate(r.description, 72) } : {}) })) }],
        },
      },
    };
  }
  if (kind === 'order_details') {
    // WhatsApp Payments (India) payment-gateway order. Field names follow Meta's "Payments API — India (PG)" docs;
    // re-verify against the current docs and your approved payment configuration during integration testing.
    const money = v => ({ value: v, offset: 100 });
    return {
      ...base, type: 'interactive',
      interactive: {
        type: 'order_details',
        body: { text: truncate(payload.text, 1024) },
        action: {
          name: 'review_and_pay',
          parameters: {
            reference_id: payload.reference,
            type: 'digital-goods',
            payment_settings: [{
              type: 'payment_gateway',
              payment_gateway: { type: 'razorpay', configuration_name: config.paymentConfiguration, razorpay: { receipt: payload.reference, notes: { reference: payload.reference, task_id: String(payload.taskId) } } },
            }],
            currency: 'INR',
            total_amount: money(payload.total),
            order: {
              status: 'pending',
              items: [
                { retailer_id: `${payload.reference}-svc`, name: truncate(payload.itemName, 60), amount: money(payload.quote), quantity: 1 },
                { retailer_id: `${payload.reference}-fee`, name: 'Platform service fee', amount: money(payload.fee), quantity: 1 },
              ],
              subtotal: money(payload.quote + payload.fee),
              tax: { ...money(payload.gst), description: 'GST on platform fee' },
            },
          },
        },
      },
    };
  }
  return { ...base, type: 'text', text: { preview_url: Boolean(payload.previewUrl), body: truncate(payload.text, 4096) } };
}

export class MetaError extends Error {
  constructor(status, body) {
    const code = body?.error?.code;
    super(`Meta send error ${status}${code ? ` code ${code}` : ''}: ${truncate(body?.error?.message || '', 200)}`);
    this.httpStatus = status;
    this.code = code;
  }
}

export async function sendRequest(config, body, fetchImpl = fetch) {
  const url = `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new MetaError(response.status, json);
  return { messageId: json.messages?.[0]?.id || null };
}

const RE_ENGAGEMENT_REQUIRED = 131047;

/**
 * Sends due outbox rows. Free-form messages go only inside the customer-service window; outside it,
 * an approved template is used if configured for that message, otherwise the row waits for the user to write again.
 */
export async function drainOutbox(db, config, send = sendRequest, { maxBatch = 20, now = Date.now } = {}) {
  const due = db.prepare("SELECT * FROM outbox WHERE status='pending' AND next_attempt_at<=? ORDER BY id LIMIT ?").all(now(), maxBatch);
  let sent = 0;
  for (const m of due) {
    // Claim the row so a concurrent drain cannot send it twice.
    const claimed = db.prepare("UPDATE outbox SET status='sending' WHERE id=? AND status='pending'").run(m.id);
    if (!claimed.changes) continue;
    const user = db.prepare('SELECT * FROM users WHERE phone=?').get(m.phone);
    if (!user || user.blocked || (!user.opted_in && m.kind !== 'system')) {
      db.prepare("UPDATE outbox SET status='skipped', last_error='opted_out_or_blocked' WHERE id=?").run(m.id);
      continue;
    }
    const template = m.template ? JSON.parse(m.template) : null;
    const withinWindow = Boolean(user.last_inbound_at && now() - user.last_inbound_at < config.messageWindowHours * 3600000);
    const canTemplate = Boolean(template && config.templates[template.key]);
    if (!withinWindow && !canTemplate) {
      db.prepare("UPDATE outbox SET status='waiting_window', last_error='outside_service_window' WHERE id=?").run(m.id);
      continue;
    }
    const body = buildRequest(m.phone, m.kind, JSON.parse(m.payload), template, user.lang || 'en', config, !withinWindow);
    if (config.dryRun) {
      log.info('outbox.dry_run', { id: m.id, to: maskPhone(m.phone), type: body.type });
      db.prepare("UPDATE outbox SET status='sent', attempts=attempts+1, last_error=NULL WHERE id=?").run(m.id);
      sent++;
      continue;
    }
    try {
      const res = await send(config, body);
      db.prepare("UPDATE outbox SET status='sent', attempts=attempts+1, provider_message_id=?, last_error=NULL WHERE id=?").run(res?.messageId || null, m.id);
      sent++;
    } catch (err) {
      const attempts = m.attempts + 1;
      if (err.code === RE_ENGAGEMENT_REQUIRED) {
        db.prepare("UPDATE outbox SET status='waiting_window', attempts=?, last_error=? WHERE id=?").run(attempts, truncate(err.message, 500), m.id);
        continue;
      }
      const permanent = err.httpStatus >= 400 && err.httpStatus < 500 && err.httpStatus !== 429;
      const status = permanent || attempts >= 8 ? 'failed' : 'pending';
      const delay = Math.min(15 * 60000, 2000 * 2 ** attempts);
      db.prepare('UPDATE outbox SET status=?, attempts=?, next_attempt_at=?, last_error=? WHERE id=?').run(status, attempts, now() + delay, truncate(err.message, 500), m.id);
      log.warn('outbox.send_failed', { id: m.id, status, error: truncate(err.message, 200) });
    }
  }
  return sent;
}

export function recordDeliveryStatus(db, status) {
  if (status.status === 'failed') {
    const err = status.errors?.[0];
    if (err?.code === RE_ENGAGEMENT_REQUIRED) {
      db.prepare("UPDATE outbox SET status='waiting_window', last_error='re-engagement required' WHERE provider_message_id=?").run(status.id);
    } else {
      db.prepare("UPDATE outbox SET status='failed', last_error=? WHERE provider_message_id=?").run(truncate(`delivery failed ${err?.code || ''} ${err?.title || ''}`, 300), status.id);
    }
  }
}
