// Operator console over WhatsApp, restricted to allowlisted numbers with role-based permissions.
// Roles: support (tickets, relay), verifier (workers, moderation), finance (refunds, payouts, co-signing), super (all).
import { areaLabel } from '../areas.js';
import { formatIst, money, normalizePhone, parseRupees, parseTaskId, parsePositiveInt, sanitizeText, shortId } from '../parse.js';
import { completeTask, dispatchTask } from './customer.js';
import { requestRefund } from './payflow.js';

const REQUIRED_CHECKS = ['identity', 'police', 'interview'];
const CHECK_TYPES = ['identity', 'police', 'interview', 'skills'];

const COMMANDS = {
  OPSHELP: 'support', STATS: 'support', JOBS: 'support', JOB: 'support', TICKETS: 'support', TICKET: 'support', REPLY: 'support', REPLYALL: 'support', CLOSE: 'support',
  PENDING: 'verifier', WORKER: 'verifier', CHECK: 'verifier', LINKACC: 'verifier', APPROVE: 'verifier', REJECT: 'verifier', SUSPEND: 'verifier', REINSTATE: 'verifier',
  REVIEWQ: 'verifier', RELEASE: 'verifier', REJECTJOB: 'verifier', BLOCK: 'verifier', UNBLOCK: 'verifier',
  RESOLVE: 'finance', REFUND: 'finance', PAYOUT: 'finance', ACTIONS: 'finance', COSIGN: 'finance', DECLINE: 'finance',
};

const HELP_TEXT = `Operator commands
SUPPORT: STATS · JOBS [status] · JOB HYD1 · TICKETS · TICKET 7 · REPLY 7 text · REPLYALL 7 text · CLOSE 7 note
VERIFIER: PENDING · WORKER 91… · CHECK 91… identity|police|interview|skills evidence-ref · LINKACC 91… acc_XXXX · APPROVE 91… · REJECT 91… reason · SUSPEND 91… reason · REINSTATE 91… · REVIEWQ · RELEASE HYD1 · REJECTJOB HYD1 reason · BLOCK 91… · UNBLOCK 91…
FINANCE: RESOLVE 7 release|refund|split <rupees> note · REFUND HYD1 full|<rupees> reason · PAYOUT HYD1 reason · ACTIONS · COSIGN 3 · DECLINE 3 reason
Never record ID/bank numbers here — evidence-ref is your internal file/case reference.`;

export function handle(m, phone, cmd, args, rest) {
  const role = COMMANDS[cmd];
  if (!role) return false;
  if (!m.can(phone, role)) { m.sayRaw(phone, `Not permitted: ${cmd} needs role ${role}.`); return true; }
  const reply = text => m.sayRaw(phone, text);
  const fn = HANDLERS[cmd];
  fn(m, phone, args, rest, reply);
  return true;
}

function workerSummary(m, target) {
  const w = m.workerProfile(target);
  if (!w) return null;
  const checks = m.db.prepare('SELECT check_type, verifier, evidence_ref, created_at FROM worker_checks WHERE phone=?').all(target);
  return `${target} · ${w.full_name || '-'} · ${w.status}\nArea ${areaLabel(w.home_area)} (${w.radius_km} km) · skills ${JSON.parse(w.skills).join(', ')}\nPayout account: ${w.linked_account_id || 'NOT LINKED'}\nRating ${w.rating_count ? (w.rating_sum / w.rating_count).toFixed(2) : 'n/a'} (${w.rating_count}) · done ${w.jobs_completed} · cancelled ${w.jobs_cancelled}\nChecks: ${checks.map(c => `${c.check_type}✔ (${c.verifier.slice(-4)}, ${c.evidence_ref})`).join(', ') || 'none'}`;
}

function financeAction(m, phone, { kind, task, amount, reason, ticketId = null, settle = false }, reply) {
  const r = m.db.prepare(`INSERT INTO financial_actions(kind,task_id,amount_paise,reason,ticket_id,requested_by,status,settle,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'awaiting_cosign',?,?,?)`).run(kind, task.id, amount, reason, ticketId, phone, settle ? 1 : 0, m.now(), m.now());
  const id = Number(r.lastInsertRowid);
  m.audit(phone, 'finance_action_requested', id, `${kind} ${shortId(task.id)} ${amount} ${reason}`);
  if (!m.config.financeRequireCosign) return executeAction(m, id, phone, reply);
  reply(`Action #${id} (${kind} ${money(amount)} on ${shortId(task.id)}) needs a second finance operator: COSIGN ${id}`);
  for (const [p, roles] of m.config.admins) {
    if (p !== phone && (roles.has('finance') || roles.has('super'))) m.sayRaw(p, `OPS: ${phone} requests ${kind} ${money(amount)} on ${shortId(task.id)} — "${reason}". Approve: COSIGN ${id} · Decline: DECLINE ${id} reason`);
  }
}

const OPEN_WORK = ['disputed', 'booked', 'in_progress', 'awaiting_confirmation'];

/**
 * Executes an approved money movement.
 * - release: job is completed and the tasker's held transfer is released.
 * - refund, full: everything is returned; the held tasker share is reversed; job → refunded.
 * - refund, settle (RESOLVE split): X is taken from the tasker's held share and refunded; the rest is released.
 *   Work done/disputed → completed. Still booked (late cancellation) → cancelled, remainder is the tasker's fee.
 * - refund, goodwill (REFUND partial): platform-funded; the job and the tasker's payout are untouched.
 */
function executeAction(m, id, approver, reply) {
  const a = m.db.prepare('SELECT * FROM financial_actions WHERE id=?').get(id);
  const task = m.task(a.task_id);
  const p = m.db.prepare("SELECT * FROM payments WHERE task_id=? AND status IN ('captured','partially_refunded') ORDER BY id DESC LIMIT 1").get(task.id);
  const fail = msg => { m.db.prepare("UPDATE financial_actions SET status='rejected', approved_by=?, updated_at=? WHERE id=?").run(approver, m.now(), id); reply(`Action #${id} not executed: ${msg}`); };
  if (!p) return fail('no captured payment for this task');
  const tr = m.db.prepare('SELECT * FROM transfers WHERE payment_id=?').get(p.id);
  const transferHeld = tr && ['creating', 'on_hold'].includes(tr.status);
  if (a.kind === 'release') {
    if (!OPEN_WORK.includes(task.status)) return fail(`task status is ${task.status}`);
    if (!transferHeld) return fail('worker transfer is not on hold');
    completeTask(m, task, approver, { fromStatuses: OPEN_WORK });
  } else {
    const refundable = p.amount_paise - p.refunded_paise;
    if (a.amount_paise > refundable) return fail(`refund exceeds refundable ${money(refundable)}`);
    const full = a.amount_paise === refundable;
    const held = transferHeld ? tr.amount_paise - tr.reversed_paise : 0;
    const settle = !full && a.settle === 1 && transferHeld && OPEN_WORK.includes(task.status);
    if (a.settle === 1 && !full && !settle) return fail('a split needs an open job with the tasker payout still on hold');
    if (settle && a.amount_paise > held) return fail(`split refund exceeds the tasker's held share ${money(held)}`);
    // Full refunds and settlements claw back from the held tasker share; goodwill refunds are platform-funded.
    const reverse = full ? held : settle ? a.amount_paise : 0;
    requestRefund(m, { paymentId: p.id, amount: a.amount_paise, reverse, reason: a.reason, actor: approver, releaseAfter: settle });
    if (full) m.transition(task.id, [...OPEN_WORK, 'completed'], 'refunded', { auto_confirm_at: null });
    else if (settle) m.transition(task.id, OPEN_WORK, task.status === 'booked' ? 'cancelled' : 'completed', { auto_confirm_at: null });
    const releaseAfter = settle;
    const offer = m.acceptedOffer(task);
    m.say(task.customer_phone, 'refund_after_review', { id: shortId(task.id), amount: money(a.amount_paise) }, { template: { key: 'generic_update', params: [shortId(task.id), 'refund requested'] } });
    if (offer) m.sayRaw(offer.worker_phone, `${shortId(task.id)}: after review, ${money(a.amount_paise)} is being refunded to the customer.${releaseAfter ? ` The remaining ${money(Math.max(0, offer.amount_paise - reverse))} will be released to you.` : ''}`);
  }
  m.db.prepare("UPDATE financial_actions SET status='executed', approved_by=?, updated_at=? WHERE id=?").run(approver, m.now(), id);
  if (a.ticket_id) resolveTicket(m, a.ticket_id, `${a.kind} ${money(a.amount_paise)}: ${a.reason}`);
  m.audit(approver, 'finance_action_executed', id, `${a.kind} ${a.amount_paise}`);
  reply(`Action #${id} executed (${a.kind} ${money(a.amount_paise)} on ${shortId(task.id)}). Provider calls run in the background; failures alert finance.`);
}

function resolveTicket(m, ticketId, outcome) {
  const ticket = m.db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
  if (!ticket || ticket.status !== 'open') return;
  m.db.prepare("UPDATE tickets SET status='resolved', outcome=?, updated_at=? WHERE id=?").run(sanitizeText(outcome, 300), m.now(), ticketId);
  const parties = new Set([ticket.reporter_phone]);
  const task = m.task(ticket.task_id);
  if (task && ticket.kind === 'dispute') {
    parties.add(task.customer_phone);
    const o = m.acceptedOffer(task);
    if (o) parties.add(o.worker_phone);
  }
  for (const p of parties) m.say(p, 'ticket_resolved', { ticket: ticketId, outcome: sanitizeText(outcome, 300) });
}

const target = args => normalizePhone(args[0]);

const HANDLERS = {
  OPSHELP: (m, p, a, r, reply) => reply(HELP_TEXT),
  STATS: (m, p, a, r, reply) => {
    const q = sql => m.db.prepare(sql).all();
    const tasks = q('SELECT status, COUNT(*) n FROM tasks GROUP BY status').map(x => `${x.status}:${x.n}`).join(' ');
    const workers = q('SELECT status, COUNT(*) n FROM worker_profiles GROUP BY status').map(x => `${x.status}:${x.n}`).join(' ');
    const gmv = m.db.prepare("SELECT COALESCE(SUM(amount_paise-refunded_paise),0) s FROM payments WHERE status IN ('captured','partially_refunded','refunded')").get().s;
    const jobsFailed = m.db.prepare("SELECT COUNT(*) n FROM jobs WHERE status='failed'").get().n;
    const outboxFailed = m.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='failed'").get().n;
    reply(`Tasks ${tasks || '-'}\nWorkers ${workers || '-'}\nCaptured net ${money(gmv)}\nFailed jobs ${jobsFailed} · failed messages ${outboxFailed}\nPayments ${m.config.paymentsEnabled ? 'configured' : 'NOT CONFIGURED'} · DRY_RUN ${m.config.dryRun}`);
  },
  JOBS: (m, p, a, r, reply) => {
    const rows = a[0]
      ? m.db.prepare('SELECT * FROM tasks WHERE status=? ORDER BY id DESC LIMIT 15').all(a[0].toLowerCase())
      : m.db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 15').all();
    reply(rows.length ? rows.map(x => `${shortId(x.id)} · ${x.status} · ${areaLabel(x.area)} · ${x.category} · ${formatIst(x.scheduled_at)}`).join('\n') : 'No tasks.');
  },
  JOB: (m, p, a, r, reply) => {
    const t = m.task(parseTaskId(a[0]));
    if (!t) return reply('Usage: JOB HYD0001');
    const o = m.acceptedOffer(t);
    const pay = m.db.prepare('SELECT reference,status,amount_paise,refunded_paise,provider_payment_id FROM payments WHERE task_id=? ORDER BY id').all(t.id);
    const tr = m.db.prepare('SELECT status,amount_paise,reversed_paise,provider_transfer_id FROM transfers WHERE task_id=?').all(t.id);
    const offers = m.db.prepare('SELECT COUNT(*) n FROM offers WHERE task_id=?').get(t.id).n;
    reply(`${shortId(t.id)} · ${t.status}${t.review_reason ? ` (review: ${t.review_reason})` : ''}\n${t.description}\nCustomer ${t.customer_phone} · worker ${o?.worker_phone || '-'} · offers ${offers}\n${areaLabel(t.area)} · ${formatIst(t.scheduled_at)} · budget ${money(t.budget_paise)}\nPayments: ${pay.map(x => `${x.reference} ${x.status} ${money(x.amount_paise)} refunded ${money(x.refunded_paise)} ${x.provider_payment_id || ''}`).join('; ') || '-'}\nTransfers: ${tr.map(x => `${x.status} ${money(x.amount_paise)} rev ${money(x.reversed_paise)} ${x.provider_transfer_id || ''}`).join('; ') || '-'}`);
  },
  TICKETS: (m, p, a, r, reply) => {
    const rows = m.db.prepare("SELECT * FROM tickets WHERE status='open' ORDER BY kind='dispute' DESC, id LIMIT 15").all();
    reply(rows.length ? rows.map(x => `#${x.id} · ${x.kind}${x.task_id ? ` · ${shortId(x.task_id)}` : ''} · ${x.reporter_phone} · ${formatIst(x.created_at)}`).join('\n') : 'No open tickets.');
  },
  TICKET: (m, p, a, r, reply) => {
    const t = m.db.prepare('SELECT * FROM tickets WHERE id=?').get(parsePositiveInt(a[0]));
    if (!t) return reply('Usage: TICKET 7');
    const msgs = m.db.prepare('SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id').all(t.id);
    const chat = t.task_id ? m.db.prepare('SELECT * FROM relay_messages WHERE task_id=? ORDER BY id DESC LIMIT 10').all(t.task_id).reverse() : [];
    reply(`#${t.id} ${t.kind} · ${t.status}${t.task_id ? ` · ${shortId(t.task_id)} (was ${t.prior_task_status || '-'})` : ''}\n${msgs.map(x => `[${x.sender === 'ops' ? 'OPS' : x.sender.slice(-4)}] ${x.body}`).join('\n')}${chat.length ? `\n— last relayed chat —\n${chat.map(x => `[${x.from_phone.slice(-4)}] ${x.body}`).join('\n')}` : ''}`);
  },
  REPLY: (m, p, a, r, reply) => replyTicket(m, p, a, reply, false),
  REPLYALL: (m, p, a, r, reply) => replyTicket(m, p, a, reply, true),
  CLOSE: (m, p, a, r, reply) => {
    const t = m.db.prepare("SELECT * FROM tickets WHERE id=? AND status='open'").get(parsePositiveInt(a[0]));
    if (!t) return reply('Usage: CLOSE 7 note');
    if (t.kind === 'dispute' && m.task(t.task_id)?.status === 'disputed') return reply('Disputed task still on hold: use RESOLVE with release/refund/split.');
    resolveTicket(m, t.id, sanitizeText(a.slice(1).join(' '), 300) || 'closed');
    m.audit(p, 'ticket_closed', t.id);
    reply(`Ticket #${t.id} closed.`);
  },
  PENDING: (m, p, a, r, reply) => {
    const rows = m.db.prepare("SELECT * FROM worker_profiles WHERE status='pending' ORDER BY updated_at LIMIT 20").all();
    reply(rows.length ? rows.map(w => `${w.phone} · ${w.full_name} · ${areaLabel(w.home_area)} · ${JSON.parse(w.skills).join(',')} · acct ${w.linked_account_id ? '✔' : '✘'}`).join('\n') : 'No pending applications.');
  },
  WORKER: (m, p, a, r, reply) => reply(workerSummary(m, target(a)) || 'Usage: WORKER 919876543210'),
  CHECK: (m, p, a, r, reply) => {
    const phone = target(a);
    const type = (a[1] || '').toLowerCase();
    const evidence = sanitizeText(a.slice(2).join(' '), 120);
    if (!phone || !m.workerProfile(phone) || !CHECK_TYPES.includes(type) || evidence.length < 3) return reply('Usage: CHECK 919876543210 identity|police|interview|skills internal-evidence-ref');
    if (/\b\d{12}\b|\b[A-Z]{5}\d{4}[A-Z]\b/.test(evidence)) return reply('Evidence ref looks like an Aadhaar/PAN number. Store documents in your secure KYC system and record only its case reference.');
    m.db.prepare(`INSERT INTO worker_checks(phone,check_type,verifier,evidence_ref,created_at) VALUES (?,?,?,?,?)
      ON CONFLICT(phone,check_type) DO UPDATE SET verifier=excluded.verifier, evidence_ref=excluded.evidence_ref, created_at=excluded.created_at`).run(phone, type, p, evidence, m.now());
    m.audit(p, 'worker_check', phone, `${type} ${evidence}`);
    reply(`${type} check recorded for ${phone}.`);
  },
  LINKACC: (m, p, a, r, reply) => {
    const phone = target(a);
    const acc = a[1] || '';
    if (!phone || !m.workerProfile(phone) || !/^acc_[A-Za-z0-9]{8,20}$/.test(acc)) return reply('Usage: LINKACC 919876543210 acc_XXXXXXXXXXXXXX (Razorpay Route linked account, created & KYC-verified in the Razorpay Dashboard)');
    m.db.prepare('UPDATE worker_profiles SET linked_account_id=?, updated_at=? WHERE phone=?').run(acc, m.now(), phone);
    m.db.prepare(`INSERT INTO worker_checks(phone,check_type,verifier,evidence_ref,created_at) VALUES (?,'payout_account',?,?,?)
      ON CONFLICT(phone,check_type) DO UPDATE SET verifier=excluded.verifier, evidence_ref=excluded.evidence_ref, created_at=excluded.created_at`).run(phone, p, acc, m.now());
    m.audit(p, 'worker_linked_account', phone, acc);
    reply(`Linked account ${acc} recorded for ${phone}. Make sure its Route KYC is "activated" in Razorpay.`);
  },
  APPROVE: (m, p, a, r, reply) => {
    const phone = target(a);
    const w = phone && m.workerProfile(phone);
    if (!w || !['pending', 'rejected'].includes(w.status)) return reply('Usage: APPROVE 919876543210 (application must be pending)');
    const done = new Set(m.db.prepare('SELECT check_type FROM worker_checks WHERE phone=?').all(phone).map(x => x.check_type));
    const missing = REQUIRED_CHECKS.filter(c => !done.has(c));
    if (missing.length || !w.linked_account_id) return reply(`Cannot approve ${phone}. Missing: ${[...missing, ...(w.linked_account_id ? [] : ['LINKACC payout account'])].join(', ')}`);
    m.db.prepare("UPDATE worker_profiles SET status='approved', approved_by=?, approved_at=?, available=0, updated_at=? WHERE phone=?").run(p, m.now(), m.now(), phone);
    m.audit(p, 'worker_approved', phone);
    m.say(phone, 'worker_approved', {}, { template: { key: 'generic_update', params: ['-', 'tasker application approved'] } });
    reply(`${phone} approved.`);
  },
  REJECT: (m, p, a, r, reply) => setWorkerStatus(m, p, a, reply, ['pending', 'applying'], 'rejected', 'worker_rejected'),
  SUSPEND: (m, p, a, r, reply) => setWorkerStatus(m, p, a, reply, ['approved'], 'suspended', 'worker_suspended'),
  REINSTATE: (m, p, a, r, reply) => setWorkerStatus(m, p, a, reply, ['suspended'], 'approved', 'worker_approved'),
  REVIEWQ: (m, p, a, r, reply) => {
    const rows = m.db.prepare("SELECT * FROM tasks WHERE status='review_pending' ORDER BY id LIMIT 15").all();
    reply(rows.length ? rows.map(t => `${shortId(t.id)} · ${t.review_reason} · ${t.description.slice(0, 100)}`).join('\n') : 'Moderation queue empty.');
  },
  RELEASE: (m, p, a, r, reply) => {
    const t = m.task(parseTaskId(a[0]));
    if (!t || !m.transition(t.id, ['review_pending'], 'open')) return reply('Usage: RELEASE HYD0001 (task must be review_pending)');
    m.audit(p, 'task_moderation_approved', t.id);
    const n = dispatchTask(m, t.id);
    m.say(t.customer_phone, 'task_released', { id: shortId(t.id), n });
    reply(`${shortId(t.id)} released to ${n} taskers.`);
  },
  REJECTJOB: (m, p, a, r, reply) => {
    const t = m.task(parseTaskId(a[0]));
    const reason = sanitizeText(a.slice(1).join(' '), 200);
    if (!t || reason.length < 3 || !m.transition(t.id, ['review_pending', 'open'], 'rejected')) return reply('Usage: REJECTJOB HYD0001 reason (task must be review_pending or open)');
    m.db.prepare("UPDATE offers SET status='declined' WHERE task_id=? AND status='active'").run(t.id);
    m.audit(p, 'task_moderation_rejected', t.id, reason);
    m.say(t.customer_phone, 'task_rejected', { id: shortId(t.id), reason });
    reply(`${shortId(t.id)} rejected.`);
  },
  BLOCK: (m, p, a, r, reply) => {
    const phone = target(a);
    if (!phone || m.isAdmin(phone) || !m.user(phone)) return reply('Usage: BLOCK 919876543210');
    m.db.prepare('UPDATE users SET blocked=1 WHERE phone=?').run(phone);
    m.db.prepare('UPDATE worker_profiles SET available=0 WHERE phone=?').run(phone);
    m.audit(p, 'user_blocked', phone);
    reply(`${phone} blocked. Active jobs are NOT auto-cancelled — check JOBS and handle refunds.`);
  },
  UNBLOCK: (m, p, a, r, reply) => {
    const phone = target(a);
    if (!phone) return reply('Usage: UNBLOCK 919876543210');
    m.db.prepare('UPDATE users SET blocked=0 WHERE phone=?').run(phone);
    m.audit(p, 'user_unblocked', phone);
    reply(`${phone} unblocked.`);
  },
  RESOLVE: (m, p, a, r, reply) => {
    const ticket = m.db.prepare("SELECT * FROM tickets WHERE id=? AND status='open'").get(parsePositiveInt(a[0]));
    const outcome = (a[1] || '').toLowerCase();
    if (!ticket || !ticket.task_id) return reply('Usage: RESOLVE 7 release|refund|split <rupees> note (dispute tickets). Use CLOSE for support tickets.');
    const task = m.task(ticket.task_id);
    const pay = m.db.prepare("SELECT * FROM payments WHERE task_id=? AND status IN ('captured','partially_refunded') ORDER BY id DESC LIMIT 1").get(task.id);
    if (!pay) return reply('No captured payment on this task — use CLOSE.');
    const offer = m.acceptedOffer(task);
    if (outcome === 'release') return financeAction(m, p, { kind: 'release', task, amount: offer.amount_paise, reason: sanitizeText(a.slice(2).join(' '), 200) || 'dispute resolved for tasker', ticketId: ticket.id }, reply);
    if (outcome === 'refund') return financeAction(m, p, { kind: 'refund', task, amount: pay.amount_paise - pay.refunded_paise, reason: sanitizeText(a.slice(2).join(' '), 200) || 'dispute resolved for customer', ticketId: ticket.id }, reply);
    if (outcome === 'split') {
      const amt = parseRupees(a[2] || '', { min: 1 });
      if (!amt || amt >= offer.amount_paise) return reply(`Split refund must be ₹1 – ${money(offer.amount_paise - 100)} (less than the tasker quote).`);
      return financeAction(m, p, { kind: 'refund', task, amount: amt, reason: sanitizeText(a.slice(3).join(' '), 200) || 'partial refund', ticketId: ticket.id, settle: true }, reply);
    }
    reply('Usage: RESOLVE 7 release|refund|split <rupees> note');
  },
  REFUND: (m, p, a, r, reply) => {
    const task = m.task(parseTaskId(a[0]));
    const pay = task && m.db.prepare("SELECT * FROM payments WHERE task_id=? AND status IN ('captured','partially_refunded') ORDER BY id DESC LIMIT 1").get(task.id);
    if (!pay) return reply('Usage: REFUND HYD0001 full|<rupees> reason (task needs a captured payment)');
    const refundable = pay.amount_paise - pay.refunded_paise;
    const amount = (a[1] || '').toLowerCase() === 'full' ? refundable : parseRupees(a[1] || '', { min: 1 });
    const reason = sanitizeText(a.slice(2).join(' '), 200);
    if (!amount || amount > refundable || reason.length < 3) return reply(`Usage: REFUND HYD0001 full|<rupees> reason. Refundable: ${money(refundable)}`);
    financeAction(m, p, { kind: 'refund', task, amount, reason }, reply);
  },
  PAYOUT: (m, p, a, r, reply) => {
    const task = m.task(parseTaskId(a[0]));
    const offer = m.acceptedOffer(task);
    if (!task || !offer) return reply('Usage: PAYOUT HYD0001 reason');
    financeAction(m, p, { kind: 'release', task, amount: offer.amount_paise, reason: sanitizeText(a.slice(1).join(' '), 200) || 'manual release' }, reply);
  },
  ACTIONS: (m, p, a, r, reply) => {
    const rows = m.db.prepare("SELECT * FROM financial_actions WHERE status='awaiting_cosign' ORDER BY id").all();
    reply(rows.length ? rows.map(x => `#${x.id} ${x.kind} ${money(x.amount_paise)} ${shortId(x.task_id)} by ${x.requested_by.slice(-4)}: ${x.reason}`).join('\n') : 'No actions awaiting co-sign.');
  },
  COSIGN: (m, p, a, r, reply) => {
    const action = m.db.prepare("SELECT * FROM financial_actions WHERE id=? AND status='awaiting_cosign'").get(parsePositiveInt(a[0]));
    if (!action) return reply('Usage: COSIGN 3 (action awaiting co-sign)');
    if (action.requested_by === p) return reply('Two-person rule: a different finance operator must co-sign.');
    m.db.prepare("UPDATE financial_actions SET status='executing', updated_at=? WHERE id=?").run(m.now(), action.id);
    executeAction(m, action.id, p, reply);
  },
  DECLINE: (m, p, a, r, reply) => {
    const action = m.db.prepare("SELECT * FROM financial_actions WHERE id=? AND status='awaiting_cosign'").get(parsePositiveInt(a[0]));
    if (!action) return reply('Usage: DECLINE 3 reason');
    m.db.prepare("UPDATE financial_actions SET status='rejected', approved_by=?, updated_at=? WHERE id=?").run(p, m.now(), action.id);
    m.audit(p, 'finance_action_declined', action.id, a.slice(1).join(' '));
    m.sayRaw(action.requested_by, `OPS: action #${action.id} was declined by ${p}: ${sanitizeText(a.slice(1).join(' '), 200)}`);
    reply(`Action #${action.id} declined.`);
  },
};

function setWorkerStatus(m, p, a, reply, from, to, msgKey) {
  const phone = target(a);
  const w = phone && m.workerProfile(phone);
  if (!w || !from.includes(w.status)) return reply(`Usage: ${to === 'approved' ? 'REINSTATE' : to === 'rejected' ? 'REJECT' : 'SUSPEND'} 919876543210 reason (current status must be ${from.join('/')})`);
  m.db.prepare('UPDATE worker_profiles SET status=?, available=0, updated_at=? WHERE phone=?').run(to, m.now(), phone);
  if (to !== 'approved') m.db.prepare("UPDATE offers SET status='withdrawn', updated_at=? WHERE worker_phone=? AND status='active'").run(m.now(), phone);
  m.audit(p, `worker_${to}`, phone, a.slice(1).join(' '));
  m.say(phone, msgKey);
  reply(`${phone} → ${to}.`);
}

function replyTicket(m, p, a, reply, all) {
  const t = m.db.prepare("SELECT * FROM tickets WHERE id=? AND status='open'").get(parsePositiveInt(a[0]));
  const body = sanitizeText(a.slice(1).join(' '), 1000);
  if (!t || !body) return reply(`Usage: ${all ? 'REPLYALL' : 'REPLY'} 7 your message`);
  m.db.prepare("INSERT INTO ticket_messages(ticket_id,sender,body,created_at) VALUES (?,'ops',?,?)").run(t.id, body, m.now());
  const to = new Set([t.reporter_phone]);
  if (all && t.task_id) {
    const task = m.task(t.task_id);
    to.add(task.customer_phone);
    const o = m.acceptedOffer(task);
    if (o) to.add(o.worker_phone);
  }
  for (const x of to) m.say(x, 'support_reply', { ticket: t.id, body }, { template: { key: 'generic_update', params: [`ticket ${t.id}`, 'support replied'] } });
  m.audit(p, 'ticket_reply', t.id);
  reply(`Sent to ${to.size} participant(s).`);
}

