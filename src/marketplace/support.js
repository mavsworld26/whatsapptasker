// Customer support, disputes, masked chat relay, reviews and data-subject requests.
import { parseTaskId, sanitizeText, shortId } from '../parse.js';
import { LANG_NAMES } from '../i18n.js';

const ACTIVE = ['payment_pending', 'booked', 'awaiting_confirmation', 'disputed'];

// Phone numbers and UPI handles are masked in relayed chat so payments and contact stay on-platform.
export function maskContactDetails(text) {
  return text
    .replace(/(\+?\d[\d\s-]{8,}\d)/g, '[number hidden]')
    .replace(/\b[\w.-]{2,}@[a-z]{2,}\b/gi, '[UPI/email hidden]');
}

export function openTicket(m, { phone, taskId = null, kind, body, priorStatus = null }) {
  const r = m.db.prepare(`INSERT INTO tickets(task_id,reporter_phone,kind,status,prior_task_status,created_at,updated_at) VALUES (?,?,?,'open',?,?,?)`)
    .run(taskId, phone, kind, priorStatus, m.now(), m.now());
  const ticket = Number(r.lastInsertRowid);
  m.db.prepare('INSERT INTO ticket_messages(ticket_id,sender,body,created_at) VALUES (?,?,?,?)').run(ticket, phone, sanitizeText(body, 1000), m.now());
  m.audit(phone, `ticket_${kind}`, ticket, taskId ? shortId(taskId) : '');
  m.ops(`${kind === 'dispute' ? '⚠️ DISPUTE' : 'Support'} ticket #${ticket}${taskId ? ` on ${shortId(taskId)}` : ''} from ${phone}: "${sanitizeText(body, 200)}". Reply: REPLY ${ticket} text`, 'support');
  return ticket;
}

function ticketParties(m, ticket) {
  const parties = new Set([ticket.reporter_phone]);
  const task = m.task(ticket.task_id);
  if (task) {
    parties.add(task.customer_phone);
    const offer = m.acceptedOffer(task);
    if (offer) parties.add(offer.worker_phone);
  }
  return parties;
}

export function help(m, phone, args, rest) {
  if (!rest) return m.say(phone, 'help_menu', { hours: m.config.supportHours });
  const ref = (args[0] || '').match(/^#(\d+)$/);
  if (ref) {
    const ticket = m.db.prepare("SELECT * FROM tickets WHERE id=? AND status='open'").get(Number(ref[1]));
    if (!ticket || !ticketParties(m, ticket).has(phone)) return m.say(phone, 'not_found');
    const body = sanitizeText(args.slice(1).join(' '), 1000);
    if (!body) return m.say(phone, 'help_menu', { hours: m.config.supportHours });
    m.db.prepare('INSERT INTO ticket_messages(ticket_id,sender,body,created_at) VALUES (?,?,?,?)').run(ticket.id, phone, body, m.now());
    m.db.prepare('UPDATE tickets SET updated_at=? WHERE id=?').run(m.now(), ticket.id);
    m.ops(`Ticket #${ticket.id} update from ${phone}: "${body.slice(0, 200)}"`, 'support');
    return m.say(phone, 'relay_sent');
  }
  const ticket = openTicket(m, { phone, kind: 'support', body: rest });
  m.say(phone, 'ticket_created', { ticket, hours: m.config.supportHours });
}

export function dispute(m, phone, raw, details) {
  const task = m.task(parseTaskId(raw));
  const offer = m.acceptedOffer(task);
  if (!task || (task.customer_phone !== phone && offer?.worker_phone !== phone)) return m.say(phone, 'not_found');
  const text = sanitizeText(details, 500);
  if (text.length < 5) return m.say(phone, 'dispute_usage');
  const holdable = ['booked', 'awaiting_confirmation'].includes(task.status);
  if (!holdable && task.status !== 'completed' && task.status !== 'disputed') return m.say(phone, 'not_allowed');
  const ticket = openTicket(m, { phone, taskId: task.id, kind: 'dispute', body: text, priorStatus: task.status });
  if (holdable) m.transition(task.id, ['booked', 'awaiting_confirmation'], 'disputed', { auto_confirm_at: null });
  const id = shortId(task.id);
  m.say(phone, 'dispute_created', { ticket, id });
  const other = phone === task.customer_phone ? offer?.worker_phone : task.customer_phone;
  if (other) m.say(other, 'dispute_other_party', { id, ticket }, { template: { key: 'generic_update', params: [id, `problem reported, ticket ${ticket}`] } });
}

export function relay(m, phone, raw, body) {
  const task = m.task(parseTaskId(raw));
  const offer = m.acceptedOffer(task);
  if (!task || !offer || (phone !== task.customer_phone && phone !== offer.worker_phone)) return m.say(phone, 'not_found');
  if (!['booked', 'awaiting_confirmation', 'disputed'].includes(task.status)) return m.say(phone, 'not_allowed');
  const text = maskContactDetails(sanitizeText(body, 800));
  if (!text) return m.say(phone, 'not_allowed');
  const to = phone === task.customer_phone ? offer.worker_phone : task.customer_phone;
  m.db.prepare('INSERT INTO relay_messages(task_id,from_phone,to_phone,body,created_at) VALUES (?,?,?,?,?)').run(task.id, phone, to, text, m.now());
  const fromLabel = phone === task.customer_phone ? 'Customer' : 'Tasker';
  m.say(to, 'relay', { id: shortId(task.id), from: fromLabel, body: text }, { template: { key: 'generic_update', params: [shortId(task.id), 'new message'] } });
  m.say(phone, 'relay_sent');
}

export function rate(m, phone, raw, rawScore, comment) {
  const task = m.task(parseTaskId(raw));
  const offer = m.acceptedOffer(task);
  const score = Number(rawScore);
  if (!task || !offer || !Number.isInteger(score) || score < 1 || score > 5) return m.say(phone, 'not_allowed');
  if (task.status !== 'completed') return m.say(phone, 'not_allowed');
  let reviewee;
  if (phone === task.customer_phone) reviewee = offer.worker_phone;
  else if (phone === offer.worker_phone) reviewee = task.customer_phone;
  else return m.say(phone, 'not_found');
  const r = m.db.prepare('INSERT OR IGNORE INTO reviews(task_id,reviewer_phone,reviewee_phone,score,comment,created_at) VALUES (?,?,?,?,?,?)')
    .run(task.id, phone, reviewee, score, maskContactDetails(sanitizeText(comment, 300)) || null, m.now());
  if (!r.changes) return m.say(phone, 'not_allowed');
  if (reviewee === offer.worker_phone) {
    m.db.prepare('UPDATE worker_profiles SET rating_sum=rating_sum+?, rating_count=rating_count+1, updated_at=? WHERE phone=?').run(score, m.now(), reviewee);
    if (score <= 2) m.ops(`Low rating ${score}/5 for tasker ${reviewee} on ${shortId(task.id)}: "${sanitizeText(comment, 160)}"`, 'support');
  }
  m.audit(phone, 'review', task.id, String(score));
  m.say(phone, 'rated', { id: shortId(task.id), score });
}

export function myData(m, phone) {
  const u = m.user(phone);
  const count = (sql) => m.db.prepare(sql).get(phone).n;
  m.say(phone, 'mydata', {
    role: u.role, lang: LANG_NAMES[u.lang] || u.lang, terms: u.terms_version || '-',
    tasks: count('SELECT COUNT(*) AS n FROM tasks WHERE customer_phone=?'),
    offers: count('SELECT COUNT(*) AS n FROM offers WHERE worker_phone=?'),
    tickets: count('SELECT COUNT(*) AS n FROM tickets WHERE reporter_phone=?'),
  });
}

/** Erase personal data while keeping records the law requires (payments, refunds, audit of money movement). */
export function erase(m, phone) {
  const active = m.db.prepare(`SELECT COUNT(*) AS n FROM tasks t LEFT JOIN offers o ON o.id=t.accepted_offer_id
    WHERE (t.customer_phone=? OR o.worker_phone=?) AND t.status IN (${ACTIVE.map(() => '?').join(',')})`).get(phone, phone, ...ACTIVE).n;
  if (active) return m.say(phone, 'erase_blocked');
  m.say(phone, 'erased', {}, { system: true });
  m.db.prepare("UPDATE users SET name=NULL, business_name=NULL, opted_in=0, erased_at=? WHERE phone=?").run(m.now(), phone);
  m.db.prepare("UPDATE tasks SET description='[erased]', address_note=NULL WHERE customer_phone=?").run(phone);
  m.db.prepare("UPDATE worker_profiles SET full_name=NULL, available=0, status=CASE WHEN status='approved' THEN 'suspended' ELSE status END WHERE phone=?").run(phone);
  m.db.prepare("UPDATE offers SET note=NULL, status=CASE WHEN status='active' THEN 'withdrawn' ELSE status END WHERE worker_phone=?").run(phone);
  m.db.prepare('DELETE FROM relay_messages WHERE from_phone=? OR to_phone=?').run(phone, phone);
  m.db.prepare("UPDATE ticket_messages SET body='[erased]' WHERE sender=?").run(phone);
  m.db.prepare("UPDATE reviews SET comment=NULL WHERE reviewer_phone=?").run(phone);
  m.db.prepare('DELETE FROM sessions WHERE phone=?').run(phone);
  m.audit(phone, 'data_erased');
}

