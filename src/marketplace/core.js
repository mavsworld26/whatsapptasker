// Marketplace application service: owns conversation routing, task state and the outbox.
// All handlers run synchronously inside one SQLite transaction per inbound message.
import { transactional } from '../db.js';
import { enqueue } from '../jobs.js';
import { t, LANGS, LANG_NAMES, detectLang } from '../i18n.js';
import { areaLabel } from '../areas.js';
import { normalizePhone, sanitizeText } from '../parse.js';
import { parseCommand } from './commands.js';
import * as customer from './customer.js';
import * as worker from './worker.js';
import * as admin from './admin.js';
import * as support from './support.js';

const FREE_TEXT_STEPS = new Set(['post_description', 'join_name', 'post_when', 'post_budget', 'post_area', 'join_area', 'join_skills', 'post_confirm']);

export class Marketplace {
  constructor(db, config, { now = () => Date.now() } = {}) {
    this.db = db;
    this.config = config;
    this.now = now;
  }

  // ---------- data helpers ----------
  user(phone) { return this.db.prepare('SELECT * FROM users WHERE phone=?').get(phone); }
  task(id) { return id ? this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id) : undefined; }
  offer(id) { return id ? this.db.prepare('SELECT * FROM offers WHERE id=?').get(id) : undefined; }
  workerProfile(phone) { return this.db.prepare('SELECT * FROM worker_profiles WHERE phone=?').get(phone); }
  acceptedOffer(task) { return task?.accepted_offer_id ? this.offer(task.accepted_offer_id) : undefined; }
  livePayment(taskId) {
    return this.db.prepare("SELECT * FROM payments WHERE task_id=? AND status IN ('creating','awaiting_payment','captured','partially_refunded') ORDER BY id DESC LIMIT 1").get(taskId);
  }
  isAdmin(phone) { return this.config.admins.has(phone); }
  can(phone, role) {
    const roles = this.config.admins.get(phone);
    return Boolean(roles && (roles.has('super') || roles.has(role)));
  }
  ensureUser(phone) {
    this.db.prepare('INSERT OR IGNORE INTO users(phone, created_at) VALUES (?, ?)').run(phone, this.now());
    return this.user(phone);
  }
  langOf(phone) { return this.user(phone)?.lang || 'en'; }
  audit(actor, action, ref = '', detail = '') {
    this.db.prepare('INSERT INTO audit(actor,action,ref,detail,created_at) VALUES (?,?,?,?,?)').run(String(actor), action, String(ref), sanitizeText(detail, 400), this.now());
  }
  job(type, payload, opts = {}) { return enqueue(this.db, type, payload, { now: this.now(), ...opts }); }

  /** Atomic state transition. Returns true only if the task was in one of `from`. */
  transition(taskId, from, to, extra = {}) {
    const sets = ['status=?', 'updated_at=?', ...Object.keys(extra).map(k => `${k}=?`)];
    const r = this.db.prepare(`UPDATE tasks SET ${sets.join(',')} WHERE id=? AND status IN (${from.map(() => '?').join(',')})`)
      .run(to, this.now(), ...Object.values(extra), taskId, ...from);
    if (r.changes) this.audit('system', 'task_status', taskId, `${from.join('|')}→${to}`);
    return r.changes === 1;
  }

  // ---------- outbound ----------
  queue(phone, kind, payload, template = null) {
    this.ensureUser(phone);
    this.db.prepare('INSERT INTO outbox(phone,kind,payload,template,next_attempt_at,created_at) VALUES (?,?,?,?,?,?)')
      .run(phone, kind, JSON.stringify(payload), template ? JSON.stringify(template) : null, this.now(), this.now());
  }
  /** Localised message. opts.buttons: [{id, key}] (≤3); opts.template: {key, params} for out-of-window delivery. */
  say(phone, key, params = {}, opts = {}) {
    const lang = this.langOf(phone);
    const text = t(lang, key, params);
    if (opts.buttons?.length) {
      this.queue(phone, 'interactive', { text, buttons: opts.buttons.map(b => ({ id: b.id, title: t(lang, b.key) })) }, opts.template);
    } else {
      this.queue(phone, opts.system ? 'system' : 'text', { text }, opts.template);
    }
  }
  sayRaw(phone, text, opts = {}) { this.queue(phone, 'text', { text: sanitizeText(text, 4000).replace(/ \n/g, '\n') }, opts.template || null); }
  /** Operator alert to admins holding `role` (or super). */
  ops(text, role = 'support') {
    for (const [phone, roles] of this.config.admins) if (roles.has('super') || roles.has(role)) this.queue(phone, 'text', { text: `OPS: ${text}` });
  }
  areasText() { return this.config.pilotAreas.map(areaLabel).join(', '); }

  // ---------- sessions ----------
  getSession(phone) {
    const s = this.db.prepare('SELECT * FROM sessions WHERE phone=?').get(phone);
    return s ? { step: s.step, draft: JSON.parse(s.draft), updatedAt: s.updated_at } : null;
  }
  setSession(phone, step, draft = {}) {
    this.db.prepare(`INSERT INTO sessions(phone,step,draft,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(phone) DO UPDATE SET step=excluded.step, draft=excluded.draft, updated_at=excluded.updated_at`).run(phone, step, JSON.stringify(draft), this.now());
  }
  clearSession(phone) { this.db.prepare('DELETE FROM sessions WHERE phone=?').run(phone); }

  // ---------- inbound ----------
  /** Entry point for one inbound WhatsApp message. Idempotent on message id. */
  processMessage({ from, id, text = '', type = 'text', location = null, profileName = null }) {
    const phone = normalizePhone(from);
    if (!phone) throw new Error('Invalid sender phone');
    if (!id || String(id).length > 256) throw new Error('Missing or invalid WhatsApp message id');
    return transactional(this.db, () => {
      if (this.db.prepare('SELECT 1 FROM inbound_events WHERE message_id=?').get(id)) return { duplicate: true };
      this.db.prepare('INSERT INTO inbound_events(message_id, received_at) VALUES (?,?)').run(id, this.now());
      const existing = this.user(phone);
      this.ensureUser(phone);
      this.db.prepare('UPDATE users SET last_inbound_at=? WHERE phone=?').run(this.now(), phone);
      if (profileName && !existing?.name) this.db.prepare('UPDATE users SET name=? WHERE phone=? AND name IS NULL').run(sanitizeText(profileName, 60), phone);
      // A new inbound message reopens the 24h service window: release held messages.
      this.db.prepare("UPDATE outbox SET status='pending', next_attempt_at=? WHERE phone=? AND status='waiting_window'").run(this.now(), phone);
      const user = this.user(phone);
      if (user.blocked) return { processed: false, blocked: true };
      if (this.rateLimited(phone)) return { processed: false, rateLimited: true };
      const message = sanitizeText(text, 1000);
      this.route(user, message, { type, location, firstContact: !existing });
      return { processed: true };
    });
  }

  rateLimited(phone) {
    if (this.isAdmin(phone)) return false;
    const now = this.now();
    const row = this.db.prepare('SELECT * FROM rate_limits WHERE phone=?').get(phone);
    if (!row || now - row.window_start >= 60000) {
      this.db.prepare('INSERT INTO rate_limits(phone,window_start,count,warned) VALUES (?,?,1,0) ON CONFLICT(phone) DO UPDATE SET window_start=excluded.window_start, count=1, warned=0').run(phone, now);
      return false;
    }
    if (row.count < this.config.maxMessagesPerMinute) {
      this.db.prepare('UPDATE rate_limits SET count=count+1 WHERE phone=?').run(phone);
      return false;
    }
    if (!row.warned) {
      this.db.prepare('UPDATE rate_limits SET warned=1 WHERE phone=?').run(phone);
      this.say(phone, 'rate_limited');
    }
    return true;
  }

  route(user, message, { type, location, firstContact }) {
    const phone = user.phone;
    const { cmd, args, rest } = parseCommand(message);

    // Opt-out/opt-in are honoured in every state.
    if (cmd === 'STOP') {
      this.clearSession(phone);
      this.db.prepare('UPDATE users SET opted_in=0 WHERE phone=?').run(phone);
      this.db.prepare('UPDATE worker_profiles SET available=0 WHERE phone=?').run(phone);
      this.audit(phone, 'opt_out');
      this.say(phone, 'opted_out', {}, { system: true });
      return;
    }
    if (cmd === 'START' && !args.length) {
      this.db.prepare('UPDATE users SET opted_in=1 WHERE phone=?').run(phone);
      this.audit(phone, 'opt_in');
      this.say(phone, 'opted_in');
      return;
    }
    if (!user.opted_in) return;

    // Language selection is available at any time.
    if (cmd === 'LANG') {
      const choice = (args[0] || '').toLowerCase();
      if (LANGS.includes(choice)) {
        this.db.prepare('UPDATE users SET lang=? WHERE phone=?').run(choice, phone);
        this.say(phone, 'lang_set');
        if (!user.terms_accepted_at && !this.isAdmin(phone)) this.sendTerms(phone);
        else this.sendMenu(phone);
      } else {
        this.sendLanguagePicker(phone);
      }
      return;
    }

    if (!user.lang) {
      const guessed = detectLang(message);
      this.db.prepare('UPDATE users SET lang=? WHERE phone=?').run(guessed || 'en', phone);
      if (!this.isAdmin(phone) && (firstContact || !guessed)) { this.sendLanguagePicker(phone, true); return; }
    }

    // Operators: staff commands first (operators don't accept customer terms).
    if (this.isAdmin(phone) && admin.handle(this, phone, cmd, args, rest)) return;

    if (!this.user(phone).terms_accepted_at && !this.isAdmin(phone)) {
      if (cmd === 'AGREE') {
        this.db.prepare('UPDATE users SET terms_accepted_at=?, terms_version=? WHERE phone=?').run(this.now(), this.config.termsVersion, phone);
        this.audit(phone, 'terms_accepted', '', this.config.termsVersion);
        this.say(phone, 'agreed');
        this.sendMenu(phone);
        return;
      }
      if (cmd === 'HELP') { support.help(this, phone, args, rest); return; }
      this.sendTerms(phone);
      return;
    }

    const session = this.getSession(phone);
    if (cmd === 'CANCEL' && !args.length) {
      this.clearSession(phone);
      this.say(phone, 'draft_cancelled');
      return;
    }
    if (cmd === 'MENU' && !args.length) { this.clearSession(phone); this.sendMenu(phone); return; }

    // While a conversation step is waiting for free text, treat input as the answer.
    if (session && FREE_TEXT_STEPS.has(session.step)) {
      if (type !== 'text' && type !== 'interactive' && type !== 'button' && !(type === 'location' && location)) { this.say(phone, 'media_unsupported'); return; }
      if (session.step.startsWith('post_')) customer.continuePost(this, phone, session, message, location);
      else worker.continueJoin(this, phone, session, message, location);
      return;
    }
    if (type !== 'text' && type !== 'interactive' && type !== 'button') { this.say(phone, 'media_unsupported'); return; }

    switch (cmd) {
      case 'POST': return customer.startPost(this, phone);
      case 'MYJOBS': return customer.myJobs(this, phone);
      case 'STATUS': return customer.status(this, phone, args[0]);
      case 'ACCEPT': return customer.acceptOffer(this, phone, args[0]);
      case 'PAY': return customer.paymentStatus(this, phone, args[0]);
      case 'CONFIRM': return customer.confirm(this, phone, args[0]);
      case 'CANCELJOB':
      case 'CANCEL': return customer.cancelJob(this, phone, args[0]);
      case 'ADDRESS': return customer.address(this, phone, args[0], args.slice(1).join(' '));
      case 'BUSINESS': return customer.business(this, phone, rest);
      case 'MSG': return support.relay(this, phone, args[0], args.slice(1).join(' '));
      case 'RATE': return support.rate(this, phone, args[0], args[1], args.slice(2).join(' '));
      case 'DISPUTE': return support.dispute(this, phone, args[0], args.slice(1).join(' '));
      case 'HELP': return support.help(this, phone, args, rest);
      case 'MYDATA': return support.myData(this, phone);
      case 'DELETEMYDATA': return support.erase(this, phone);
      case 'JOIN': return worker.startJoin(this, phone);
      case 'AVAILABLE': return worker.setAvailability(this, phone, true);
      case 'UNAVAILABLE': return worker.setAvailability(this, phone, false);
      case 'TASKS': return worker.listTasks(this, phone);
      case 'OFFER': return worker.makeOffer(this, phone, args);
      case 'WITHDRAW': return worker.withdraw(this, phone, args[0]);
      case 'DONE': return worker.done(this, phone, args[0]);
      case 'ARRIVED':
      case 'STARTED': return worker.arrived(this, phone, args[0]);
      case 'NOSHOW': return customer.noShow(this, phone, args[0]);
      case 'AGREE': return this.sendMenu(phone);
      case 'MENU': return this.sendMenu(phone);
      default:
        this.say(phone, 'unknown');
    }
  }

  sendLanguagePicker(phone, withWelcome = false) {
    const lang = this.langOf(phone);
    this.queue(phone, 'interactive', {
      text: withWelcome ? t(lang, 'welcome') : 'Choose your language / మీ భాష / अपनी भाषा',
      list: { button: 'Language / భాష / भाषा', title: 'Languages', rows: Object.entries(LANG_NAMES).map(([code, name]) => ({ id: `LANG ${code}`, title: name })) },
    });
  }
  sendTerms(phone) {
    this.say(phone, 'terms', { terms: this.config.termsUrl || '(terms link pending)', privacy: this.config.privacyUrl || '(privacy link pending)' }, { buttons: [{ id: 'AGREE', key: 'btn_agree' }] });
  }
  sendMenu(phone) {
    const lang = this.langOf(phone);
    this.queue(phone, 'interactive', {
      text: t(lang, 'menu', { areas: this.areasText() }),
      list: {
        button: 'Menu', title: 'HYD Tasks',
        rows: [
          { id: 'POST', title: t(lang, 'btn_post') },
          { id: 'MYJOBS', title: t(lang, 'btn_myjobs') },
          { id: 'JOIN', title: t(lang, 'btn_join') },
          { id: 'TASKS', title: 'TASKS (taskers)' },
          { id: 'HELP', title: t(lang, 'btn_help') },
          { id: 'LANG', title: 'Language / భాష / भाषा' },
        ],
      },
    });
  }

}
