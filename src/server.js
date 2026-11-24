import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { transactional } from './db.js';
import { log } from './logger.js';
import { verifyRazorpaySignature } from './payments/razorpay.js';
import { handleRazorpayEvent, handleWhatsAppPaymentStatus } from './payments/service.js';
import { parseWebhook, recordDeliveryStatus } from './whatsapp.js';

const MAX_BODY_BYTES = 1_000_000;

export function isValidMetaSignature(body, provided, secret) {
  if (!secret || typeof provided !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(provided.slice(7), 'hex'));
}

const json = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJson(raw) {
  try { return JSON.parse(raw.toString('utf8')); } catch { throw Object.assign(new Error('invalid json'), { status: 400 }); }
}

export function createServer(market, config, { onWork = () => {}, isReady = () => true } = {}) {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/ready') {
        let dbOk = false;
        try { dbOk = market.db.prepare('SELECT 1 AS ok').get().ok === 1; } catch { dbOk = false; }
        const ready = dbOk && isReady();
        return json(res, ready ? 200 : 503, { ready, db: dbOk, dryRun: config.dryRun, payments: config.paymentsEnabled });
      }

      if (req.method === 'GET' && url.pathname === '/webhooks/whatsapp') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token') || '';
        const challenge = url.searchParams.get('hub.challenge');
        const ok = mode === 'subscribe' && config.verifyToken && token.length === config.verifyToken.length &&
          timingSafeEqual(Buffer.from(token), Buffer.from(config.verifyToken)) && challenge && /^[\w-]{1,128}$/.test(challenge);
        if (!ok) return json(res, 403, { error: 'verification failed' });
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(challenge);
      }

      if (req.method === 'POST' && url.pathname === '/webhooks/whatsapp') {
        if (!config.appSecret) return json(res, 503, { error: 'not configured' });
        const raw = await readBody(req);
        if (!isValidMetaSignature(raw, req.headers['x-hub-signature-256'], config.appSecret)) return json(res, 401, { error: 'invalid signature' });
        const payload = parseJson(raw);
        if (!payload || typeof payload !== 'object' || payload.object !== 'whatsapp_business_account') return json(res, 200, { ignored: true });
        const { messages, statuses } = parseWebhook(payload, config.phoneNumberId);
        let processed = 0, failed = 0;
        for (const message of messages) {
          try { market.processMessage(message); processed++; }
          catch (err) { failed++; log.error('inbound.failed', { id: message.id, error: String(err.message).slice(0, 200) }); }
        }
        transactional(market.db, () => {
          for (const st of statuses) {
            if (st.kind === 'payment') handleWhatsAppPaymentStatus(market, st);
            else recordDeliveryStatus(market.db, st);
          }
        });
        // Non-2xx makes Meta redeliver; processing is idempotent per message id.
        json(res, failed ? 500 : 200, { received: messages.length, processed });
        onWork();
        return;
      }

      if (req.method === 'POST' && url.pathname === '/webhooks/razorpay') {
        if (!config.razorpayWebhookSecret) return json(res, 503, { error: 'not configured' });
        const raw = await readBody(req);
        if (!verifyRazorpaySignature(raw, req.headers['x-razorpay-signature'], config.razorpayWebhookSecret)) return json(res, 401, { error: 'invalid signature' });
        const event = parseJson(raw);
        if (!event || typeof event !== 'object' || typeof event.event !== 'string') return json(res, 400, { error: 'invalid event' });
        const eventId = req.headers['x-razorpay-event-id'] || `${event.event}:${event.created_at}:${event.payload?.payment?.entity?.id || event.payload?.payment_link?.entity?.id || event.payload?.refund?.entity?.id || ''}`;
        const result = transactional(market.db, () => handleRazorpayEvent(market, event, String(eventId).slice(0, 200)));
        json(res, 200, result);
        onWork();
        return;
      }
      return json(res, 404, { error: 'not found' });
    } catch (err) {
      log.error('http.error', { path: url.pathname, error: String(err.message).slice(0, 200) });
      return json(res, err.status || 500, { error: err.status ? err.message : 'internal error' });
    } finally {
      if (url.pathname.startsWith('/webhooks')) log.info('http.request', { method: req.method, path: url.pathname, ms: Date.now() - started, status: res.statusCode });
    }
  });
}
