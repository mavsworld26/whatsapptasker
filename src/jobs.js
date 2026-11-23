// Durable background jobs for side effects that need the network (payment provider calls).
// Jobs run one at a time, so jobs touching the same payment never overlap in flight.
import { log } from './logger.js';

export function enqueue(db, type, payload, { dedupeKey = null, delayMs = 0, now = Date.now() } = {}) {
  const r = db.prepare(`INSERT INTO jobs(type,payload,dedupe_key,next_attempt_at,created_at,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(dedupe_key) DO NOTHING`).run(type, JSON.stringify(payload), dedupeKey, now + delayMs, now, now);
  return r.changes > 0;
}

export class RetryLater extends Error {
  constructor(message, delayMs = 30000) { super(message); this.delayMs = delayMs; this.retryable = true; }
}

export function recoverStuckJobs(db) {
  return db.prepare("UPDATE jobs SET status='pending' WHERE status='running'").run().changes;
}

export async function runDueJobs(db, handlers, { now = Date.now, maxJobs = 20, onFailure = () => {} } = {}) {
  let ran = 0;
  for (let i = 0; i < maxJobs; i++) {
    const job = db.prepare("SELECT * FROM jobs WHERE status='pending' AND next_attempt_at<=? ORDER BY id LIMIT 1").get(now());
    if (!job) break;
    const claimed = db.prepare("UPDATE jobs SET status='running', updated_at=? WHERE id=? AND status='pending'").run(now(), job.id);
    if (!claimed.changes) continue;
    ran++;
    const handler = handlers[job.type];
    try {
      if (!handler) throw Object.assign(new Error(`No handler for job type ${job.type}`), { retryable: false });
      await handler(JSON.parse(job.payload), job);
      db.prepare("UPDATE jobs SET status='done', attempts=attempts+1, last_error=NULL, updated_at=? WHERE id=?").run(now(), job.id);
    } catch (err) {
      const attempts = job.attempts + 1;
      const retry = err.retryable !== false && attempts < 10;
      const delay = err.delayMs || Math.min(30 * 60000, 5000 * 2 ** attempts);
      db.prepare('UPDATE jobs SET status=?, attempts=?, next_attempt_at=?, last_error=?, updated_at=? WHERE id=?')
        .run(retry ? 'pending' : 'failed', attempts, now() + delay, String(err.message).slice(0, 500), now(), job.id);
      log[retry ? 'warn' : 'error']('job.error', { id: job.id, type: job.type, attempts, retry, error: String(err.message).slice(0, 200) });
      if (!retry) onFailure(job, err);
    }
  }
  return ran;
}
