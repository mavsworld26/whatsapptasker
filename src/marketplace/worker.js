// Worker (tasker) journeys: application, availability, job discovery, bidding, completion.
import { AREAS, areaLabel, findArea, nearestArea } from '../areas.js';
import { categoryName } from '../i18n.js';
import { displayRating, rankWorkersForTask } from '../matching.js';
import { CATEGORIES, formatIst, money, parseRupees, parseTaskId, sanitizeText, shortId } from '../parse.js';
import { eligibleWorkers, workerDisplayName } from './customer.js';

export function startJoin(m, phone) {
  const wp = m.workerProfile(phone);
  if (wp?.status === 'approved') return m.say(phone, 'worker_approved');
  if (wp?.status === 'pending') return m.say(phone, 'application_pending');
  if (wp?.status === 'suspended') return m.say(phone, 'worker_suspended');
  m.db.prepare(`INSERT INTO worker_profiles(phone,status,updated_at) VALUES (?,'applying',?)
    ON CONFLICT(phone) DO UPDATE SET status='applying', updated_at=excluded.updated_at`).run(phone, m.now());
  m.setSession(phone, 'join_name', {});
  m.say(phone, 'join_name');
}

export function continueJoin(m, phone, session, message, location) {
  const d = session.draft;
  const lang = m.langOf(phone);
  if (session.step === 'join_name') {
    const name = sanitizeText(message, 80);
    if (name.length < 2 || /\d{4,}/.test(name)) return m.say(phone, 'bad_name');
    d.full_name = name;
    m.setSession(phone, 'join_area', d);
    return m.say(phone, 'join_area');
  }
  if (session.step === 'join_area') {
    const area = location ? nearestArea(location.lat, location.lng, 5)?.key : findArea(message);
    if (!area) return m.say(phone, 'bad_area', { areas: Object.keys(AREAS).map(areaLabel).join(', ') });
    d.home_area = area;
    m.setSession(phone, 'join_skills', d);
    return m.say(phone, 'join_skills', { list: CATEGORIES.map((c, i) => `${i + 1}. ${categoryName(lang, c)} (${c})`).join('\n') });
  }
  if (session.step === 'join_skills') {
    const picked = new Set();
    for (const token of message.toLowerCase().split(/[,\s/]+/).filter(Boolean)) {
      const n = Number(token);
      if (Number.isInteger(n) && n >= 1 && n <= CATEGORIES.length) picked.add(CATEGORIES[n - 1]);
      else if (CATEGORIES.includes(token)) picked.add(token);
    }
    if (!picked.size) return m.say(phone, 'bad_skills');
    const skills = [...picked];
    m.db.prepare(`UPDATE worker_profiles SET status='pending', full_name=?, home_area=?, skills=?, available=0, updated_at=? WHERE phone=?`)
      .run(d.full_name, d.home_area, JSON.stringify(skills), m.now(), phone);
    m.db.prepare("UPDATE users SET role='worker' WHERE phone=?").run(phone);
    m.clearSession(phone);
    m.audit(phone, 'worker_applied', phone, `${d.home_area} ${skills.join(',')}`);
    m.say(phone, 'join_done');
    m.ops(`New tasker application ${phone}: ${d.full_name}, ${areaLabel(d.home_area)}, skills ${skills.join(', ')}. Record checks with CHECK, payout with LINKACC, then APPROVE.`, 'verifier');
  }
}

function requireApproved(m, phone) {
  const wp = m.workerProfile(phone);
  if (wp?.status === 'approved') return wp;
  if (wp?.status === 'suspended') m.say(phone, 'worker_suspended');
  else if (wp?.status === 'pending') m.say(phone, 'application_pending');
  else m.say(phone, 'need_verified');
  return null;
}

export function setAvailability(m, phone, on) {
  if (!requireApproved(m, phone)) return;
  m.db.prepare('UPDATE worker_profiles SET available=?, updated_at=? WHERE phone=?').run(on ? 1 : 0, m.now(), phone);
  m.say(phone, on ? 'available_on' : 'available_off');
}

function matchFor(m, phone, task) {
  const w = eligibleWorkers(m).find(x => x.phone === phone);
  return w ? rankWorkersForTask(task, [w], { now: m.now() })[0] || null : null;
}

export function listTasks(m, phone) {
  if (!requireApproved(m, phone)) return;
  const lang = m.langOf(phone);
  const open = m.db.prepare("SELECT * FROM tasks WHERE status='open' AND scheduled_at>? ORDER BY scheduled_at LIMIT 200").all(m.now());
  const w = eligibleWorkers(m).find(x => x.phone === phone);
  const rows = w
    ? open.map(task => ({ task, match: rankWorkersForTask(task, [w], { now: m.now() })[0] })).filter(x => x.match).slice(0, 8)
    : [];
  if (!rows.length) return m.say(phone, 'no_open_tasks');
  m.say(phone, 'open_tasks', {
    list: rows.map(({ task, match }) => `${shortId(task.id)} · ${categoryName(lang, task.category)} · ${areaLabel(task.area)} (${match.distanceKm} km) · ${money(task.budget_paise)} · ${formatIst(task.scheduled_at)}\n   ${task.description.slice(0, 90)}`).join('\n'),
  });
}

export function makeOffer(m, phone, args) {
  const wp = requireApproved(m, phone);
  if (!wp) return;
  const task = m.task(parseTaskId(args[0]));
  const amount = parseRupees(args[1] || '');
  if (!task || !amount) return m.say(phone, 'offer_usage');
  const match = task.status === 'open' && task.scheduled_at > m.now() ? matchFor(m, phone, task) : null;
  if (!match) return m.say(phone, 'task_unavailable');
  const note = sanitizeText(args.slice(2).join(' '), 160).replace(/(\+?\d[\d\s-]{8,}\d)/g, '[number hidden]').replace(/[\w.-]+@[\w.-]+/g, '[id hidden]');
  m.db.prepare(`INSERT INTO offers(task_id,worker_phone,amount_paise,note,status,created_at,updated_at) VALUES (?,?,?,?,'active',?,?)
    ON CONFLICT(task_id,worker_phone) DO UPDATE SET amount_paise=excluded.amount_paise, note=excluded.note, status='active', updated_at=excluded.updated_at
    WHERE offers.status IN ('active','withdrawn')`).run(task.id, phone, amount, note || null, m.now(), m.now());
  const offer = m.db.prepare('SELECT * FROM offers WHERE task_id=? AND worker_phone=?').get(task.id, phone);
  if (offer.status !== 'active' || offer.amount_paise !== amount) return m.say(phone, 'task_unavailable');
  m.audit(phone, 'offer_submitted', task.id, `offer ${offer.id} ${amount}`);
  m.say(phone, 'offer_sent', { amount: money(amount), id: shortId(task.id) });
  m.say(task.customer_phone, 'offer_received', {
    id: shortId(task.id), amount: money(amount), worker: workerDisplayName(wp), rating: displayRating(wp.rating_sum, wp.rating_count),
    jobs: wp.jobs_completed, distance: match.distanceKm, offer: offer.id, note: note ? `\n“${note}”` : '',
  }, { template: { key: 'offer_received', params: [shortId(task.id), money(amount)] } });
}

export function withdraw(m, phone, raw) {
  const task = m.task(parseTaskId(raw));
  const r = task ? m.db.prepare("UPDATE offers SET status='withdrawn', updated_at=? WHERE task_id=? AND worker_phone=? AND status='active'").run(m.now(), task.id, phone) : { changes: 0 };
  if (!r.changes) return m.say(phone, 'not_allowed');
  m.audit(phone, 'offer_withdrawn', task.id);
  m.say(phone, 'offer_withdrawn', { id: shortId(task.id) });
}

// Anti-fraud timing: a job can be started at most 2h before, and marked done at most 30 min before, its start time.
export const START_WINDOW_MS = 2 * 3600000;
export const DONE_EARLIEST_MS = 30 * 60000;

/** Tasker reached the location and started work. */
export function arrived(m, phone, raw) {
  const task = m.task(parseTaskId(raw));
  const offer = m.acceptedOffer(task);
  if (!task || offer?.worker_phone !== phone) return m.say(phone, 'not_found');
  if (task.status !== 'booked') return m.say(phone, 'not_allowed');
  if (m.now() < task.scheduled_at - START_WINDOW_MS) return m.say(phone, 'too_early', { id: shortId(task.id) });
  m.transition(task.id, ['booked'], 'in_progress');
  m.say(phone, 'started_worker', { id: shortId(task.id) });
  m.say(task.customer_phone, 'started_customer', { id: shortId(task.id) }, { template: { key: 'generic_update', params: [shortId(task.id), 'tasker has started'] } });
  m.audit(phone, 'task_started', task.id);
}

export function done(m, phone, raw) {
  const task = m.task(parseTaskId(raw));
  const offer = m.acceptedOffer(task);
  if (!task || offer?.worker_phone !== phone) return m.say(phone, 'not_found');
  if (!['booked', 'in_progress'].includes(task.status)) return m.say(phone, 'not_allowed');
  if (m.now() < task.scheduled_at - DONE_EARLIEST_MS) return m.say(phone, 'too_early', { id: shortId(task.id) });
  const autoAt = m.now() + m.config.autoConfirmHours * 3600000;
  m.transition(task.id, ['booked', 'in_progress'], 'awaiting_confirmation', { auto_confirm_at: autoAt });
  const id = shortId(task.id);
  m.say(phone, 'done_worker', { id, hours: m.config.autoConfirmHours });
  m.say(task.customer_phone, 'done_customer', { id, hours: m.config.autoConfirmHours }, {
    buttons: [{ id: `CONFIRM ${id}`, key: 'btn_confirm' }, { id: `DISPUTE ${id}`, key: 'btn_dispute' }],
    template: { key: 'completion_request', params: [id] },
  });
  m.audit(phone, 'task_done', task.id);
}

