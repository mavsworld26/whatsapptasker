// Local conversation walkthrough. No WhatsApp or payment provider is contacted, payments are NOT
// configured, and the flow intentionally stops where a real Razorpay payment would be required.
import { readConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { silenceLogs } from '../src/logger.js';

silenceLogs();
const config = readConfig({ DRY_RUN: 'true', ADMIN_PHONES: '919111111111:super' });
const app = createApp(config, { db: createDb(':memory:') });
const names = { '919222222222': 'CUSTOMER', '919333333333': 'TASKER', '919111111111': 'OPERATOR' };
let n = 0, shown = 0;
function say(from, text) {
  console.log(`\n${names[from]} > ${text}`);
  app.market.processMessage({ from, id: `demo-${++n}`, text });
  const rows = app.db.prepare('SELECT * FROM outbox WHERE id > ? ORDER BY id').all(shown);
  for (const r of rows) {
    const p = JSON.parse(r.payload);
    const extra = p.buttons ? `  [buttons: ${p.buttons.map(b => b.title).join(' | ')}]` : p.list ? `  [list: ${p.list.rows.map(x => x.title).join(' | ')}]` : '';
    console.log(`  BOT → ${names[r.phone]}: ${p.text.replace(/\n/g, '\n        ')}${extra}`);
    shown = r.id;
  }
}
const [c, w, a] = ['919222222222', '919333333333', '919111111111'];
for (const m of ['hi', 'LANG en', 'AGREE', 'JOIN', 'Ravi Kumar', 'Gachibowli', '1, 4']) say(w, m);
for (const m of [`CHECK ${w} identity CASE-1`, `CHECK ${w} police CASE-2`, `CHECK ${w} interview CASE-3`, `LINKACC ${w} acc_DEMOACCOUNT01`, `APPROVE ${w}`]) say(a, m);
say(w, 'AVAILABLE');
for (const m of ['hi', 'LANG hinglish', 'AGREE', 'naya kaam', 'Sofa aur fridge 2nd floor par shift karna hai', 'Gachibowli', '800', 'kal 11 baje', 'haan']) say(c, m);
say(w, 'OFFER HYD0001 750 Trolley le kar aaunga');
say(c, 'STATUS HYD0001');
say(c, 'ACCEPT 1');
console.log('\nDemo ends here: real bookings need Razorpay credentials and a real customer payment.');
