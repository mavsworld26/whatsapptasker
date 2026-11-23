// Composition root: wires config, database, marketplace, payment provider, outbox and background loops.
import { createDb } from './db.js';
import { runDueJobs, recoverStuckJobs } from './jobs.js';
import { log } from './logger.js';
import { Marketplace } from './marketplace/core.js';
import { RazorpayClient } from './payments/razorpay.js';
import { createPaymentHandlers, onJobFailure } from './payments/service.js';
import { sweep } from './scheduler.js';
import { createServer } from './server.js';
import { drainOutbox, sendRequest } from './whatsapp.js';

export function createApp(config, { db = createDb(config.databasePath), fetchImpl = fetch, now = () => Date.now(), razorpay = null } = {}) {
  const market = new Marketplace(db, config, { now });
  const rzp = razorpay || (config.paymentsEnabled
    ? new RazorpayClient({ keyId: config.razorpayKeyId, keySecret: config.razorpayKeySecret, baseUrl: config.razorpayBaseUrl, fetchImpl })
    : null);
  const unavailable = async () => { throw Object.assign(new Error('Payments not configured'), { retryable: false }); };
  const handlers = rzp ? createPaymentHandlers(market, rzp) : new Proxy({}, { get: () => unavailable });
  const failure = onJobFailure(market);
  const send = (cfg, body) => sendRequest(cfg, body, fetchImpl);

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await runDueJobs(db, handlers, { now, onFailure: failure });
      await drainOutbox(db, config, send, { now });
    } catch (err) {
      log.error('tick.error', { error: String(err.message).slice(0, 200) });
    } finally {
      busy = false;
    }
  }

  const server = createServer(market, config, { onWork: () => { void tick(); } });
  const timers = [];
  return {
    db, market, server, tick, handlers,
    sweep: () => sweep(market),
    start() {
      recoverStuckJobs(db);
      db.prepare("UPDATE outbox SET status='pending' WHERE status='sending'").run(); // possible duplicate after crash > lost message
      timers.push(setInterval(() => { void tick(); }, 2000));
      timers.push(setInterval(() => { try { sweep(market); } catch (err) { log.error('sweep.error', { error: err.message }); } }, 60000));
      return new Promise(resolve => server.listen(config.port, '0.0.0.0', resolve));
    },
    async stop() {
      timers.forEach(clearInterval);
      await new Promise(resolve => server.close(resolve));
      while (busy) await new Promise(r => setTimeout(r, 50));
      db.close();
    },
  };
}
