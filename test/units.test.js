import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, parseRupees, classifyTask, reviewReason, parseTaskId, normalizePhone, money } from '../src/parse.js';
import { findArea, nearestArea, distanceKm, AREAS } from '../src/areas.js';
import { LANGS, allKeys, catalog, detectLang, t } from '../src/i18n.js';
import { rankWorkersForTask, rankOffers, priceBreakdown, bayesianRating } from '../src/matching.js';
import { parseCommand } from '../src/marketplace/commands.js';
import { readConfig, liveReadinessProblems, parseAdmins } from '../src/config.js';
import { maskContactDetails } from '../src/marketplace/support.js';
import { START } from './helpers.js';

const IST = ts => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts));

test('parseWhen understands English, Hinglish, Hindi and Telugu phrasing in IST', () => {
  // START = 24 Nov 2026 10:00 IST
  assert.equal(IST(parseWhen('tomorrow 10 am', START).at), '25/11/2026, 10:00');
  assert.equal(IST(parseWhen('kal 5 baje', START).at), '25/11/2026, 17:00');
  assert.equal(IST(parseWhen('कल शाम 6 बजे', START).at), '25/11/2026, 18:00');
  assert.equal(IST(parseWhen('రేపు 11 am', START).at), '25/11/2026, 11:00');
  assert.equal(IST(parseWhen('30 Nov 2026 4:30 pm', START).at), '30/11/2026, 16:30');
  assert.equal(IST(parseWhen('Dec 3 9am', START).at), '03/12/2026, 09:00');
  assert.equal(IST(parseWhen('28/11 18:00', START).at), '28/11/2026, 18:00');
  assert.equal(IST(parseWhen('today evening', START).at), '24/11/2026, 18:00');
  assert.equal(IST(parseWhen('5 Jan 10am', START).at), '05/01/2027, 10:00', 'past month rolls to next year');
  assert.equal(parseWhen('31 Feb 10am', START), null);
  assert.equal(parseWhen('sometime soon', START), null);
});

test('money, ids and phone parsing', () => {
  assert.equal(parseRupees('₹1,299.50'), 129950);
  assert.equal(parseRupees('800 rs'), 80000);
  assert.equal(parseRupees('50'), null);
  assert.equal(parseRupees('-5'), null);
  assert.equal(parseRupees('1e5'), null);
  assert.equal(money(90930), '₹909.30');
  assert.equal(money(100000), '₹1,000');
  assert.equal(parseTaskId('hyd0012'), 12);
  assert.equal(parseTaskId('HYD0012; DROP'), null);
  assert.equal(normalizePhone('98480 12345'), '919848012345');
  assert.equal(normalizePhone('+91 98480-12345'), '919848012345');
  assert.equal(normalizePhone('12345'), null);
});

test('areas resolve from English, Telugu and Hindi names and from location pins', () => {
  assert.equal(findArea('near Gachibowli stadium'), 'gachibowli');
  assert.equal(findArea('గచ్చిబౌలి'), 'gachibowli');
  assert.equal(findArea('माधापुर में'), 'madhapur');
  assert.equal(findArea('Hitech City, Cyber Towers'), 'hitech city');
  assert.equal(findArea('Vizag'), null);
  assert.equal(nearestArea(17.4420, 78.3500).key, 'gachibowli');
  assert.equal(nearestArea(17.0, 78.0), null);
  assert.ok(distanceKm(AREAS.gachibowli, AREAS.madhapur) > 4 && distanceKm(AREAS.gachibowli, AREAS.madhapur) < 6);
});

test('task classification and safety review work across languages', () => {
  assert.equal(classifyTask('Sofa shift karna hai'), 'moving');
  assert.equal(classifyTask('घर की सफाई करनी है'), 'cleaning');
  assert.equal(classifyTask('ఇంటి సామాను మార్చాలి'), 'moving');
  assert.equal(classifyTask('Assemble IKEA wardrobe'), 'assembly');
  assert.equal(reviewReason('Fix electrical wiring in kitchen', 'handyman'), 'sensitive:electric');
  assert.equal(reviewReason('Babysit my child for 3 hours', 'errands'), 'sensitive:babysit');
  assert.equal(reviewReason('Move boxes to garage', 'moving'), null);
  assert.equal(reviewReason('Help me with stuff', 'general'), 'uncategorised');
});

test('i18n catalog: every key in all four languages, same placeholders, WhatsApp button limits', () => {
  const M = catalog();
  for (const key of allKeys()) {
    const ph = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    for (const lang of LANGS) {
      assert.ok(M[key][lang], `${key} missing ${lang}`);
      assert.equal(ph(M[key][lang]), ph(M[key].en), `${key}/${lang} placeholders differ`);
      if (key.startsWith('btn_')) assert.ok([...M[key][lang]].length <= 20, `${key}/${lang} exceeds 20 chars`);
    }
  }
  assert.equal(detectLang('నాకు సహాయం కావాలి'), 'te');
  assert.equal(detectLang('मुझे मदद चाहिए'), 'hi');
  assert.equal(detectLang('mujhe ghar shift karna hai'), 'hinglish');
  assert.equal(detectLang('I need help'), null);
  assert.match(t('te', 'task_posted', { id: 'HYD0001', n: 3 }), /HYD0001.*3/s);
});

test('commands: localized aliases map to canonical commands; operator words do not collide', () => {
  assert.equal(parseCommand('naya kaam').cmd, 'POST');
  assert.equal(parseCommand('नया काम').cmd, 'POST');
  assert.equal(parseCommand('నా పనులు').cmd, 'MYJOBS');
  assert.equal(parseCommand('मदद').cmd, 'HELP');
  assert.equal(parseCommand('ACCEPT 3').cmd, 'ACCEPT');
  assert.equal(parseCommand('JOB HYD0001').cmd, 'JOB');
  assert.equal(parseCommand('delete my data').cmd, 'DELETEMYDATA');
  assert.deepEqual(parseCommand('offer hyd0001 750 two helpers').args, ['hyd0001', '750', 'two', 'helpers']);
});

test('matching engine: skills, radius, capacity and ranking', () => {
  const task = { customer_phone: 'c', category: 'moving', lat: AREAS.gachibowli.lat, lng: AREAS.gachibowli.lng };
  const base = { radius_km: 6, rating_sum: 0, rating_count: 0, jobs_completed: 0, jobs_cancelled: 0, active_jobs: 0, last_inbound_at: START };
  const workers = [
    { ...base, phone: 'near', home_area: 'gachibowli', skills: ['moving'] },
    { ...base, phone: 'mid-good', home_area: 'madhapur', skills: ['moving'], rating_sum: 98, rating_count: 20, jobs_completed: 20 },
    { ...base, phone: 'far', home_area: 'uppal', skills: ['moving'] },
    { ...base, phone: 'wrong-skill', home_area: 'gachibowli', skills: ['cleaning'] },
    { ...base, phone: 'busy', home_area: 'gachibowli', skills: ['moving'], active_jobs: 3 },
    { ...base, phone: 'c', home_area: 'gachibowli', skills: ['moving'] },
  ];
  const ranked = rankWorkersForTask(task, workers, { now: START });
  assert.deepEqual(ranked.map(r => r.phone).sort(), ['mid-good', 'near']);
  assert.ok(bayesianRating(5, 1) < bayesianRating(96, 20), 'one 5★ review does not beat a strong track record');
  const offers = rankOffers([
    { id: 1, amount_paise: 70000, rating_sum: 0, rating_count: 0, jobs_completed: 0 },
    { id: 2, amount_paise: 72000, rating_sum: 98, rating_count: 20, jobs_completed: 20 },
    { id: 3, amount_paise: 150000, rating_sum: 50, rating_count: 10, jobs_completed: 10 },
  ], 80000);
  assert.deepEqual(offers.map(o => o.id), [2, 1, 3]);
  assert.deepEqual(priceBreakdown(75000, { feeRate: 0.15, gstRate: 0.18 }), { quote: 75000, fee: 11250, gst: 2025, total: 88275 });
});

test('config: live mode readiness is explicit and admin roles are validated', () => {
  const c = readConfig({ DRY_RUN: 'false', APP_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'w', ADMIN_PHONES: '919111111111:super' });
  const problems = liveReadinessProblems(c).join('\n');
  assert.match(problems, /WA_ACCESS_TOKEN is required/);
  assert.match(problems, /Production requires a rzp_live_ key/);
  assert.match(problems, /two finance\/super operators/);
  assert.match(problems, /lawyer-approved/);
  assert.match(problems, /WA_TEMPLATES.job_alert/);
  assert.throws(() => parseAdmins('919111111111:god'), /Unknown admin role/);
  assert.throws(() => readConfig({ FEE_RATE_HOUSEHOLD: '2' }), /Invalid numeric/);
  assert.equal(readConfig({}).paymentsEnabled, false);
});

test('contact details are masked in relayed messages', () => {
  assert.equal(maskContactDetails('call 9848012345 or pay ravi@okaxis'), 'call [number hidden] or pay [UPI/email hidden]');
});
