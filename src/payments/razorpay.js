// Razorpay REST client (Payment Links, Payments, Route transfers, Reversals, Refunds) and webhook verification.
// Docs: https://razorpay.com/docs/api/ — Route: https://razorpay.com/docs/api/payments/route/
import { createHmac, timingSafeEqual } from 'node:crypto';

export class RazorpayError extends Error {
  constructor(status, body, path) {
    super(`Razorpay ${status} on ${path}: ${body?.error?.code || ''} ${String(body?.error?.description || '').slice(0, 200)}`);
    this.httpStatus = status;
    this.code = body?.error?.code;
    this.retryable = status === 429 || status >= 500 || status === 0;
  }
}

export function verifyRazorpaySignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export class RazorpayClient {
  constructor({ keyId, keySecret, baseUrl = 'https://api.razorpay.com', fetchImpl = fetch, timeoutMs = 15000 }) {
    if (!keyId || !keySecret) throw new Error('Razorpay credentials missing');
    this.auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.mode = keyId.startsWith('rzp_live_') ? 'live' : 'test';
  }

  async request(method, path, body) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: this.auth, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const e = new RazorpayError(0, { error: { description: err.message } }, path);
      e.retryable = true; // network/timeout: outcome unknown → callers reconcile before retrying
      throw e;
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new RazorpayError(response.status, json, path);
    return json;
  }

  createPaymentLink({ amountPaise, reference, description, customerPhone, expireBy, notes }) {
    return this.request('POST', '/v1/payment_links', {
      amount: amountPaise,
      currency: 'INR',
      accept_partial: false,
      reference_id: reference,
      description: description.slice(0, 2048),
      customer: { contact: `+${customerPhone}` },
      notify: { sms: false, email: false }, // we deliver the link on WhatsApp ourselves
      reminder_enable: false,
      expire_by: Math.floor(expireBy / 1000),
      notes,
    });
  }
  async findPaymentLinkByReference(reference) {
    const res = await this.request('GET', `/v1/payment_links?reference_id=${encodeURIComponent(reference)}`);
    return (res.payment_links || []).find(l => l.reference_id === reference) || null;
  }
  fetchPaymentLink(id) { return this.request('GET', `/v1/payment_links/${encodeURIComponent(id)}`); }
  cancelPaymentLink(id) { return this.request('POST', `/v1/payment_links/${encodeURIComponent(id)}/cancel`); }
  fetchPayment(id) { return this.request('GET', `/v1/payments/${encodeURIComponent(id)}`); }

  createTransfer(paymentId, { account, amountPaise, onHold, notes }) {
    return this.request('POST', `/v1/payments/${encodeURIComponent(paymentId)}/transfers`, {
      transfers: [{ account, amount: amountPaise, currency: 'INR', on_hold: onHold, notes }],
    });
  }
  listTransfers(paymentId) { return this.request('GET', `/v1/payments/${encodeURIComponent(paymentId)}/transfers`); }
  setTransferHold(transferId, onHold) {
    return this.request('PATCH', `/v1/transfers/${encodeURIComponent(transferId)}`, { on_hold: onHold });
  }
  fetchTransfer(id) { return this.request('GET', `/v1/transfers/${encodeURIComponent(id)}`); }
  reverseTransfer(transferId, amountPaise, notes) {
    return this.request('POST', `/v1/transfers/${encodeURIComponent(transferId)}/reversals`, { amount: amountPaise, notes });
  }
  listReversals(transferId) { return this.request('GET', `/v1/transfers/${encodeURIComponent(transferId)}/reversals`); }

  refundPayment(paymentId, { amountPaise, receipt, notes }) {
    return this.request('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, speed: 'normal', receipt, notes });
  }
  listRefunds(paymentId) { return this.request('GET', `/v1/payments/${encodeURIComponent(paymentId)}/refunds`); }
}
