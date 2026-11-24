// Customer journeys: posting, offers, payment, completion, cancellation.
import { AREAS, areaLabel, findArea, isPilotArea, nearestArea, distanceKm } from '../areas.js';
import { categoryName, statusName, t } from '../i18n.js';
import { displayRating, rankOffers, rankWorkersForTask, priceBreakdown } from '../matching.js';
import { classifyTask, formatIst, money, parseRupees, parseTaskId, parsePositiveInt, parseWhen, reviewReason, sanitizeText, shortId } from '../parse.js';
import { expirePayment, feeRateFor, requestRefund, requestRelease, sendPaymentRequest, startPayment } from './payflow.js';
import { openTicket } from './support.js';

export function workerDisplayName(profile) {
  const parts = String(profile?.full_name || 'Tasker').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export function startPost(m, phone) {
  m.setSession(phone, 'post_description', {});
  m.say(phone, 'ask_description');
}

export function continuePost(m, phone, session, message, location) {
  const d = session.draft;
  switch (session.step) {
    case 'post_description': {
      if (message.length < 12 || message.length > 500) return m.say(phone, 'bad_description');
      d.description = message;
      d.category = classifyTask(message);
      m.setSession(phone, 'post_area', d);
      return m.say(phone, 'ask_area');
    }
    case 'post_area': {
      let area = null, lat, lng;
      if (location) {
        const near = nearestArea(location.lat, location.lng);
        if (near) { area = near.key; lat = location.lat; lng = location.lng; }
      } else {
        area = findArea(message);
        if (area) ({ lat, lng } = AREAS[area]);
      }
      if (!isPilotArea(area, m.config)) return m.say(phone, 'bad_area', { areas: m.areasText() });
      Object.assign(d, { area, lat, lng });
      m.setSession(phone, 'post_budget', d);
      return m.say(phone, 'ask_budget');
    }
    case 'post_budget': {
      const budget = parseRupees(message);
      if (!budget) return m.say(phone, 'bad_budget');
      d.budget_paise = budget;
      m.setSession(phone, 'post_when', d);
      return m.say(phone, 'ask_when');
    }
    case 'post_when': {
      const when = parseWhen(message, m.now());
      if (!when || when.at < m.now() + 3600000 || when.at > m.now() + 60 * 86400000) return m.say(phone, 'bad_when');
      d.scheduled_at = when.at;
      m.setSession(phone, 'post_confirm', d);
      const lang = m.langOf(phone);
      return m.say(phone, 'review_task', {
        description: d.description, area: areaLabel(d.area), budget: money(d.budget_paise), when: when.label, category: categoryName(lang, d.category),
      }, { buttons: [{ id: 'YES', key: 'btn_yes' }, { id: 'CANCEL', key: 'btn_cancel' }] });
    }
    case 'post_confirm': {
      const answer = message.trim().toLowerCase();
      if (!['yes', 'y', 'haan', 'ha', 'हाँ', 'हां', 'అవును', 'ok'].includes(answer)) return m.say(phone, 'confirm_yes');
      return createTask(m, phone, d);
    }
    default:
      m.clearSession(phone);
  }
}

function createTask(m, phone, d) {
  const recent = m.db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE customer_phone=? AND created_at>?').get(phone, m.now() - 86400000).n;
  if (recent >= m.config.maxTasksPerDay) { m.clearSession(phone); return m.say(phone, 'post_limit', { n: m.config.maxTasksPerDay }); }
  if (d.scheduled_at < m.now() + 30 * 60000) { m.setSession(phone, 'post_when', d); return m.say(phone, 'bad_when'); }
  const reason = reviewReason(d.description, d.category);
  const r = m.db.prepare(`INSERT INTO tasks(customer_phone,description,category,area,lat,lng,scheduled_at,budget_paise,status,review_reason,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(phone, d.description, d.category, d.area, d.lat, d.lng, d.scheduled_at, d.budget_paise,
    reason ? 'review_pending' : 'open', reason, m.now(), m.now());
  const taskId = Number(r.lastInsertRowid);
  m.clearSession(phone);
  m.audit(phone, 'task_created', taskId, `${d.category} ${d.area}`);
  if (reason) {
    m.say(phone, 'task_in_review', { id: shortId(taskId) });
    m.ops(`${shortId(taskId)} needs moderation (${reason}): "${d.description.slice(0, 160)}". RELEASE ${shortId(taskId)} or REJECTJOB ${shortId(taskId)} reason`, 'verifier');
    return;
  }
  const n = dispatchTask(m, taskId);
  m.say(phone, 'task_posted', { id: shortId(taskId), n });
}

export function eligibleWorkers(m) {
  return m.db.prepare(`SELECT w.*, u.last_inbound_at,
      (SELECT COUNT(*) FROM tasks t JOIN offers o ON o.id=t.accepted_offer_id
        WHERE o.worker_phone=w.phone AND t.status IN ('payment_pending','booked','in_progress','awaiting_confirmation')) AS active_jobs
    FROM worker_profiles w JOIN users u ON u.phone=w.phone
    WHERE w.status='approved' AND u.opted_in=1 AND u.blocked=0 AND u.erased_at IS NULL`).all()
    .map(w => ({ ...w, skills: JSON.parse(w.skills) }));
}

/** Matches and alerts workers for an open task. Returns how many workers were alerted. */
export function dispatchTask(m, taskId) {
  const task = m.task(taskId);
  const candidates = eligibleWorkers(m).filter(w => w.available);
  const ranked = rankWorkersForTask(task, candidates, { now: m.now(), limit: m.config.maxAlertsPerTask });
  const id = shortId(task.id);
  const when = formatIst(task.scheduled_at);
  for (const r of ranked) {
    const res = m.db.prepare('INSERT OR IGNORE INTO dispatches(task_id,worker_phone,score,distance_km,created_at) VALUES (?,?,?,?,?)')
      .run(task.id, r.phone, r.score, r.distanceKm, m.now());
    if (!res.changes) continue;
    const lang = m.langOf(r.phone);
    m.say(r.phone, 'job_alert', {
      id, category: categoryName(lang, task.category), area: areaLabel(task.area), distance: r.distanceKm,
      description: task.description.slice(0, 300), when, budget: money(task.budget_paise),
    }, { template: { key: 'job_alert', params: [id, categoryName(lang, task.category), areaLabel(task.area), money(task.budget_paise), when] } });
  }
  m.audit('system', 'task_dispatched', task.id, `${ranked.length} workers`);
  if (!ranked.length) m.ops(`${id} (${task.category}, ${task.area}) has no available matching taskers. Recruit or nudge workers.`, 'support');
  return ranked.length;
}

export function myJobs(m, phone) {
  const lang = m.langOf(phone);
  const rows = m.db.prepare(`SELECT t.* FROM tasks t WHERE t.customer_phone=?
    UNION SELECT t.* FROM tasks t JOIN offers o ON o.id=t.accepted_offer_id WHERE o.worker_phone=?
    ORDER BY id DESC LIMIT 8`).all(phone, phone);
  if (!rows.length) return m.say(phone, 'no_jobs');
  m.say(phone, 'my_jobs', { list: rows.map(x => `${shortId(x.id)} · ${statusName(lang, x.status)} · ${areaLabel(x.area)} · ${formatIst(x.scheduled_at)}`).join('\n') });
}

function canSeeOpenTask(m, phone, task) {
  if (task.status !== 'open') return false;
  const w = eligibleWorkers(m).find(x => x.phone === phone);
  return Boolean(w && rankWorkersForTask(task, [w], { now: m.now() }).length);
}

export function offersForCustomer(m, task) {
  const rows = m.db.prepare(`SELECT o.*, w.full_name, w.home_area, w.rating_sum, w.rating_count, w.jobs_completed, w.jobs_cancelled
    FROM offers o JOIN worker_profiles w ON w.phone=o.worker_phone WHERE o.task_id=? AND o.status='active' AND w.status='approved'`).all(task.id);
  return rankOffers(rows.map(o => ({ ...o, distance_km: AREAS[o.home_area] ? Number(distanceKm(AREAS[o.home_area], task).toFixed(1)) : null })), task.budget_paise);
}

export function status(m, phone, raw) {
  const task = m.task(parseTaskId(raw));
  if (!task) return m.say(phone, 'not_found');
  const offer = m.acceptedOffer(task);
  const isCustomer = task.customer_phone === phone;
  const isWorker = offer?.worker_phone === phone;
  if (!isCustomer && !isWorker && !m.isAdmin(phone) && !canSeeOpenTask(m, phone, task)) return m.say(phone, 'not_found');
  const lang = m.langOf(phone);
  const lines = [
    `${shortId(task.id)} · ${statusName(lang, task.status)}`,
    task.description,
    `📍 ${areaLabel(task.area)} · 🕒 ${formatIst(task.scheduled_at)}`,
    `💰 ${money(task.budget_paise)} · ${categoryName(lang, task.category)}`,
  ];
  const payment = m.livePayment(task.id);
  if (payment && (isCustomer || m.isAdmin(phone))) lines.push(t(lang, 'payment_status', { id: shortId(task.id), total: money(payment.amount_paise), status: payment.status }));
  if (isCustomer && task.status === 'open') {
    const offers = offersForCustomer(m, task);
    if (offers.length) {
      const rate = feeRateFor(m, phone);
      m.queue(phone, 'interactive', {
        text: `${lines.join('\n')}\n\n${t(lang, 'offers_header')}`,
        list: {
          button: 'Offers', title: shortId(task.id),
          rows: offers.slice(0, 10).map((o, i) => ({
            id: `ACCEPT ${o.id}`,
            title: `${i === 0 ? '⭐ ' : ''}${money(o.amount_paise)} · #${o.id}`,
            description: `${workerDisplayName(o)} · ${displayRating(o.rating_sum, o.rating_count)}★ · ${o.jobs_completed} jobs · ${o.distance_km ?? '?'} km · total ${money(priceBreakdown(o.amount_paise, { feeRate: rate, gstRate: m.config.feeGstRate }).total)}`,
          })),
        },
      });
      return;
    }
  }
  m.sayRaw(phone, lines.join('\n'));
}

export function acceptOffer(m, phone, raw) {
  const offer = m.offer(parsePositiveInt(raw));
  const task = offer && m.task(offer.task_id);
  if (!task || task.customer_phone !== phone) return m.say(phone, 'not_found');
  if (task.status !== 'open' || offer.status !== 'active') return m.say(phone, 'not_allowed');
  const wp = m.workerProfile(offer.worker_phone);
  if (!wp || wp.status !== 'approved' || !wp.linked_account_id) {
    m.ops(`Offer #${offer.id} on ${shortId(task.id)} accepted but worker ${offer.worker_phone} is not payout-ready.`, 'verifier');
    return m.say(phone, 'not_allowed');
  }
  if (!m.config.paymentsEnabled) {
    m.ops(`Customer tried to book ${shortId(task.id)} but payments are not configured (Razorpay keys missing).`, 'finance');
    return m.say(phone, 'payments_unavailable', { id: shortId(task.id) });
  }
  if (!m.transition(task.id, ['open'], 'payment_pending', { accepted_offer_id: offer.id })) return m.say(phone, 'not_allowed');
  m.db.prepare("UPDATE offers SET status='accepted', updated_at=? WHERE id=?").run(m.now(), offer.id);
  const { price } = startPayment(m, m.task(task.id), offer);
  m.audit(phone, 'offer_accepted', task.id, `offer ${offer.id}`);
  m.say(phone, 'offer_accepted_customer', { offer: offer.id, id: shortId(task.id), quote: money(price.quote), fee: money(price.fee), gst: money(price.gst), total: money(price.total) });
  m.say(offer.worker_phone, 'offer_selected_worker', { id: shortId(task.id) }, { template: { key: 'generic_update', params: [shortId(task.id), 'your offer was selected'] } });
}

export function paymentStatus(m, phone, raw) {
  const task = m.task(parseTaskId(raw));
  if (!task || task.customer_phone !== phone) return m.say(phone, 'not_found');
  const p = m.livePayment(task.id);
  if (!p) return m.say(phone, 'not_allowed');
  if (p.status === 'awaiting_payment') return sendPaymentRequest(m, task, p);
  m.say(phone, 'payment_status', { id: shortId(task.id), total: money(p.amount_paise), status: p.status });
}

/** Customer (or auto-confirm / dispute resolution) accepts completion: release the worker's payout. */
export function completeTask(m, task, actor, { fromStatuses = ['awaiting_confirmation'] } = {}) {
  if (!m.transition(task.id, fromStatuses, 'completed', { auto_confirm_at: null })) return false;
  const offer = m.acceptedOffer(task);
  m.db.prepare('UPDATE worker_profiles SET jobs_completed=jobs_completed+1, updated_at=? WHERE phone=?').run(m.now(), offer.worker_phone);
  requestRelease(m, task.id, actor);
  const id = shortId(task.id);
  m.say(task.customer_phone, 'confirmed_customer', { id });
  m.say(offer.worker_phone, 'confirmed_worker', { id, quote: money(offer.amount_paise) }, { template: { key: 'generic_update', params: [id, 'job confirmed, payout being released'] } });
  m.audit(actor, 'task_completed', task.id);
  return true;
}

export function confirm(m, phone, raw) {
  const task = m.task(parseTaskId(raw));
  if (!task || task.customer_phone !== phone) return m.say(phone, 'not_found');
  if (task.status !== 'awaiting_confirmation') return m.say(phone, 'not_allowed');
  completeTask(m, task, phone);
}

export function cancelJob(m, phone, raw) {
  const task = m.task(parseTaskId(raw));
  if (!task) return m.say(phone, 'not_found');
  const offer = m.acceptedOffer(task);
  const id = shortId(task.id);
  if (offer && offer.worker_phone === phone) return workerCancel(m, phone, task, offer);
  if (task.customer_phone !== phone) return m.say(phone, 'not_found');

  if (['open', 'review_pending'].includes(task.status)) {
    m.transition(task.id, ['open', 'review_pending'], 'cancelled');
    notifyOfferersClosed(m, task);
    m.audit(phone, 'task_cancelled', task.id);
    return m.say(phone, 'cancelled_free', { id });
  }
  if (task.status === 'payment_pending') {
    const p = m.livePayment(task.id);
    if (p) expirePayment(m, p, 'cancelled');
    m.transition(task.id, ['open', 'payment_pending'], 'cancelled');
    notifyOfferersClosed(m, task);
    if (offer) m.sayRaw(offer.worker_phone, `${id} was cancelled by the customer before payment.`);
    m.audit(phone, 'task_cancelled', task.id, 'before payment');
    return m.say(phone, 'cancelled_free', { id });
  }
  if (task.status === 'in_progress') {
    const ticket = openTicket(m, { phone, taskId: task.id, kind: 'support', body: 'Cancellation requested after the tasker started' });
    return m.say(phone, 'cancel_needs_review', { id, hours: m.config.freeCancelHours, ticket });
  }
  if (task.status === 'booked') {
    const hoursLeft = (task.scheduled_at - m.now()) / 3600000;
    if (hoursLeft >= m.config.freeCancelHours) {
      const p = m.livePayment(task.id);
      m.transition(task.id, ['booked'], 'cancelled');
      requestRefund(m, { paymentId: p.id, amount: p.amount_paise - p.refunded_paise, reverse: p.worker_paise, reason: 'customer_cancel_free_window', actor: phone });
      m.sayRaw(offer.worker_phone, `${id} was cancelled by the customer more than ${m.config.freeCancelHours}h before the start time. Please do not travel. Send TASKS for other jobs.`);
      return m.say(phone, 'cancelled_refund', { id, amount: money(p.amount_paise - p.refunded_paise) });
    }
    const ticket = openTicket(m, { phone, taskId: task.id, kind: 'support', body: `Late cancellation request (${hoursLeft.toFixed(1)}h before start)` });
    return m.say(phone, 'cancel_needs_review', { id, hours: m.config.freeCancelHours, ticket });
  }
  m.say(phone, 'not_allowed');
}

function notifyOfferersClosed(m, task) {
  const offers = m.db.prepare("SELECT * FROM offers WHERE task_id=? AND status IN ('active','accepted')").all(task.id);
  m.db.prepare("UPDATE offers SET status='declined', updated_at=? WHERE task_id=? AND status IN ('active','accepted')").run(m.now(), task.id);
  for (const o of offers) m.sayRaw(o.worker_phone, `${shortId(task.id)} is no longer available (cancelled by the customer).`);
}

/** Assigned worker backs out of a booked job: full refund, task reopens for other offers. */
function workerCancel(m, phone, task, offer) {
  const id = shortId(task.id);
  if (task.status === 'payment_pending') {
    const p = m.livePayment(task.id);
    if (p) expirePayment(m, p, 'cancelled');
    m.db.prepare("UPDATE offers SET status='withdrawn', updated_at=? WHERE id=?").run(m.now(), offer.id);
    m.db.prepare('UPDATE worker_profiles SET jobs_cancelled=jobs_cancelled+1 WHERE phone=?').run(phone);
    m.say(task.customer_phone, 'worker_withdrew_unpaid', { id });
    return m.say(phone, 'worker_cancelled_worker', { id });
  }
  if (task.status !== 'booked') return m.say(phone, 'not_allowed');
  const p = m.livePayment(task.id);
  const amount = p.amount_paise - p.refunded_paise;
  m.transition(task.id, ['booked'], 'open', { accepted_offer_id: null });
  m.db.prepare("UPDATE offers SET status='withdrawn', updated_at=? WHERE id=?").run(m.now(), offer.id);
  // Re-activate other workers' declined offers so the customer can rebook quickly.
  m.db.prepare("UPDATE offers SET status='active', updated_at=? WHERE task_id=? AND status='declined' AND id<>?").run(m.now(), task.id, offer.id);
  m.db.prepare('UPDATE worker_profiles SET jobs_cancelled=jobs_cancelled+1, updated_at=? WHERE phone=?').run(m.now(), phone);
  requestRefund(m, { paymentId: p.id, amount, reverse: p.worker_paise, reason: 'worker_cancelled', actor: phone });
  m.say(task.customer_phone, 'worker_cancelled_customer', { id, amount: money(amount) }, { template: { key: 'generic_update', params: [id, 'tasker cancelled, refund requested'] } });
  m.say(phone, 'worker_cancelled_worker', { id });
  m.ops(`Worker ${phone} cancelled booked ${id}. Full refund queued. Cancellations so far: ${m.workerProfile(phone).jobs_cancelled}.`, 'support');
}

export function address(m, phone, raw, text) {
  const task = m.task(parseTaskId(raw));
  if (!task || task.customer_phone !== phone) return m.say(phone, 'not_found');
  if (!['booked', 'in_progress', 'awaiting_confirmation'].includes(task.status)) return m.say(phone, 'not_allowed');
  const addr = sanitizeText(text, 300);
  if (addr.length < 5) return m.say(phone, 'not_allowed');
  m.db.prepare('UPDATE tasks SET address_note=?, updated_at=? WHERE id=?').run(addr, m.now(), task.id);
  const offer = m.acceptedOffer(task);
  m.say(offer.worker_phone, 'address_shared', { id: shortId(task.id), address: addr });
  m.say(phone, 'address_sent');
}

export function business(m, phone, rest) {
  const name = sanitizeText(rest, 100);
  if (name.length < 2) return m.sayRaw(phone, 'Use: BUSINESS Your Company Name');
  m.db.prepare("UPDATE users SET business_name=?, role=CASE WHEN role='worker' THEN role ELSE 'business' END WHERE phone=?").run(name, phone);
  m.audit(phone, 'business_profile', '', name);
  m.sayRaw(phone, `Business profile set: ${name}. Business service fee rate applies to new bookings.`);
}

export const NOSHOW_GRACE_MS = 30 * 60000;
export const NOSHOW_SUSPEND_AFTER = 2;

/** Customer reports that the booked tasker did not turn up (no ARRIVED by start + 30 min): full refund, no payout. */
export function noShow(m, phone, raw) {
  const task = m.task(parseTaskId(raw));
  if (!task || task.customer_phone !== phone) return m.say(phone, 'not_found');
  if (task.status !== 'booked') return m.say(phone, 'not_allowed');
  if (m.now() < task.scheduled_at + NOSHOW_GRACE_MS) return m.say(phone, 'noshow_too_early', { id: shortId(task.id) });
  const offer = m.acceptedOffer(task);
  const p = m.livePayment(task.id);
  m.transition(task.id, ['booked'], 'cancelled');
  requestRefund(m, { paymentId: p.id, amount: p.amount_paise - p.refunded_paise, reverse: p.worker_paise, reason: 'worker_no_show', actor: phone });
  m.db.prepare('UPDATE worker_profiles SET jobs_cancelled=jobs_cancelled+1, updated_at=? WHERE phone=?').run(m.now(), offer.worker_phone);
  m.audit(phone, 'worker_no_show', task.id, offer.worker_phone);
  const noShows = m.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='worker_no_show' AND detail=?").get(offer.worker_phone).n;
  const id = shortId(task.id);
  m.say(phone, 'noshow_customer', { id, amount: money(p.amount_paise - p.refunded_paise) });
  m.say(offer.worker_phone, 'noshow_worker', { id }, { template: { key: 'generic_update', params: [id, 'reported as no-show'] } });
  if (noShows >= NOSHOW_SUSPEND_AFTER) {
    m.db.prepare("UPDATE worker_profiles SET status='suspended', available=0, updated_at=? WHERE phone=? AND status='approved'").run(m.now(), offer.worker_phone);
    m.db.prepare("UPDATE offers SET status='withdrawn', updated_at=? WHERE worker_phone=? AND status='active'").run(m.now(), offer.worker_phone);
    m.audit('system', 'worker_suspended', offer.worker_phone, `${noShows} no-shows`);
    m.say(offer.worker_phone, 'worker_suspended');
  }
  m.ops(`No-show reported on ${id} for tasker ${offer.worker_phone} (${noShows} total${noShows >= NOSHOW_SUSPEND_AFTER ? ', auto-suspended' : ''}). Full refund queued.`, 'support');
}
