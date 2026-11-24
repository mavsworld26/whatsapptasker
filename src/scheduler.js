// Time-based policies: payment expiry, auto-confirmation, task expiry, overdue alerts and retention purges.
import { transactional } from './db.js';
import { completeTask } from './marketplace/customer.js';
import { expirePayment } from './marketplace/payflow.js';
import { shortId } from './parse.js';

const DAY = 86400000;
export const RETENTION = {
  addressDaysAfterClose: 7,
  relayChatDays: 180,
  inboundIdsDays: 30,
  heldMessageDays: 7,
  paymentGraceMs: 10 * 60000, // allow late provider webhooks before releasing an unpaid booking
};

export function sweep(market) {
  const now = market.now();
  const db = market.db;
  const counts = { expiredPayments: 0, autoConfirmed: 0, expiredTasks: 0, overdue: 0 };
  transactional(db, () => {
    for (const p of db.prepare("SELECT * FROM payments WHERE status IN ('creating','awaiting_payment') AND expires_at < ?").all(now - RETENTION.paymentGraceMs)) {
      if (expirePayment(market, p, 'expired')) counts.expiredPayments++;
    }
    for (const t of db.prepare("SELECT * FROM tasks WHERE status='awaiting_confirmation' AND auto_confirm_at IS NOT NULL AND auto_confirm_at <= ?").all(now)) {
      if (completeTask(market, t, 'system:auto_confirm')) counts.autoConfirmed++;
    }
    for (const t of db.prepare("SELECT * FROM tasks WHERE status IN ('open','review_pending') AND scheduled_at < ?").all(now)) {
      if (market.transition(t.id, ['open', 'review_pending'], 'expired')) {
        db.prepare("UPDATE offers SET status='declined', updated_at=? WHERE task_id=? AND status='active'").run(now, t.id);
        market.sayRaw(t.customer_phone, `${shortId(t.id)} expired because the scheduled time passed without a booking. Send POST to create a new job.`);
        counts.expiredTasks++;
      }
    }
    for (const t of db.prepare("SELECT * FROM tasks WHERE status IN ('booked','in_progress') AND scheduled_at < ?").all(now - 12 * 3600000)) {
      const alerted = db.prepare("SELECT 1 FROM audit WHERE action='overdue_alert' AND ref=?").get(String(t.id));
      if (alerted) continue;
      market.audit('system', 'overdue_alert', t.id);
      market.ops(`${shortId(t.id)} is booked but not marked DONE 12h after its start time. Contact both parties.`, 'support');
      counts.overdue++;
    }
    db.prepare("UPDATE tasks SET address_note=NULL WHERE address_note IS NOT NULL AND status IN ('completed','cancelled','refunded','expired') AND updated_at < ?").run(now - RETENTION.addressDaysAfterClose * DAY);
    db.prepare('DELETE FROM relay_messages WHERE created_at < ?').run(now - RETENTION.relayChatDays * DAY);
    db.prepare('DELETE FROM inbound_events WHERE received_at < ?').run(now - RETENTION.inboundIdsDays * DAY);
    db.prepare("UPDATE outbox SET status='skipped', last_error='window_never_reopened' WHERE status='waiting_window' AND created_at < ?").run(now - RETENTION.heldMessageDays * DAY);
    db.prepare("DELETE FROM sessions WHERE updated_at < ?").run(now - 2 * DAY);
  });
  return counts;
}
