import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Ordered, append-only migrations. Never edit a shipped migration; add a new one.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    phone TEXT PRIMARY KEY,
    name TEXT,
    lang TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','business','worker')),
    business_name TEXT,
    opted_in INTEGER NOT NULL DEFAULT 1,
    terms_version TEXT,
    terms_accepted_at INTEGER,
    blocked INTEGER NOT NULL DEFAULT 0,
    last_inbound_at INTEGER,
    erased_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE worker_profiles (
    phone TEXT PRIMARY KEY REFERENCES users(phone),
    status TEXT NOT NULL DEFAULT 'applying' CHECK (status IN ('applying','pending','approved','rejected','suspended')),
    full_name TEXT,
    home_area TEXT,
    radius_km REAL NOT NULL DEFAULT 6,
    skills TEXT NOT NULL DEFAULT '[]',
    available INTEGER NOT NULL DEFAULT 0,
    linked_account_id TEXT,
    rating_sum INTEGER NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    jobs_completed INTEGER NOT NULL DEFAULT 0,
    jobs_cancelled INTEGER NOT NULL DEFAULT 0,
    approved_by TEXT,
    approved_at INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_workers_match ON worker_profiles(status, available);
  -- Verification evidence: what was checked, by whom and an external reference. Never ID or bank numbers.
  CREATE TABLE worker_checks (
    phone TEXT NOT NULL REFERENCES users(phone),
    check_type TEXT NOT NULL CHECK (check_type IN ('identity','police','interview','skills','payout_account')),
    verifier TEXT NOT NULL,
    evidence_ref TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (phone, check_type)
  );
  CREATE TABLE sessions (
    phone TEXT PRIMARY KEY REFERENCES users(phone),
    step TEXT NOT NULL,
    draft TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL REFERENCES users(phone),
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    area TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    scheduled_at INTEGER NOT NULL,
    budget_paise INTEGER NOT NULL CHECK (budget_paise > 0),
    status TEXT NOT NULL,
    review_reason TEXT,
    accepted_offer_id INTEGER,
    address_note TEXT,
    auto_confirm_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_tasks_customer ON tasks(customer_phone, status);
  CREATE INDEX idx_tasks_status ON tasks(status, scheduled_at);
  CREATE TABLE dispatches (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    worker_phone TEXT NOT NULL REFERENCES users(phone),
    score REAL NOT NULL,
    distance_km REAL NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (task_id, worker_phone)
  );
  CREATE TABLE offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    worker_phone TEXT NOT NULL REFERENCES users(phone),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn','accepted','declined')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (task_id, worker_phone)
  );
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    offer_id INTEGER NOT NULL REFERENCES offers(id),
    reference TEXT NOT NULL UNIQUE,
    amount_paise INTEGER NOT NULL,
    worker_paise INTEGER NOT NULL,
    fee_paise INTEGER NOT NULL,
    fee_gst_paise INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    channel TEXT NOT NULL CHECK (channel IN ('payment_link','whatsapp_pay')),
    provider_link_id TEXT UNIQUE,
    short_url TEXT,
    provider_payment_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('creating','awaiting_payment','captured','expired','cancelled','failed','refunded','partially_refunded')),
    refunded_paise INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX idx_one_live_payment ON payments(task_id) WHERE status IN ('creating','awaiting_payment','captured','partially_refunded');
  CREATE TABLE transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    worker_phone TEXT NOT NULL REFERENCES users(phone),
    linked_account_id TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    reversed_paise INTEGER NOT NULL DEFAULT 0,
    provider_transfer_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('creating','on_hold','releasing','released','reversed','failed')),
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES payments(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    reverse_paise INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    provider_reversal_id TEXT,
    provider_refund_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('queued','reversed','requested','processed','failed')),
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  -- Operator-initiated money movements: requested by one operator, co-signed by another.
  CREATE TABLE financial_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('refund','release')),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    amount_paise INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ticket_id INTEGER,
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    status TEXT NOT NULL CHECK (status IN ('awaiting_cosign','executing','executed','rejected')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE provider_events (
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (provider, event_id)
  );
  CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    dedupe_key TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_jobs_due ON jobs(status, next_attempt_at);
  CREATE TABLE inbound_events (
    message_id TEXT PRIMARY KEY,
    received_at INTEGER NOT NULL
  );
  CREATE TABLE outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL REFERENCES users(phone),
    kind TEXT NOT NULL CHECK (kind IN ('text','interactive','order_details','system')),
    payload TEXT NOT NULL,
    template TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','waiting_window','skipped','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    provider_message_id TEXT,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_outbox_due ON outbox(status, next_attempt_at);
  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    reporter_phone TEXT NOT NULL REFERENCES users(phone),
    kind TEXT NOT NULL CHECK (kind IN ('support','dispute')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    outcome TEXT,
    prior_task_status TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id),
    sender TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE reviews (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    reviewer_phone TEXT NOT NULL REFERENCES users(phone),
    reviewee_phone TEXT NOT NULL REFERENCES users(phone),
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (task_id, reviewer_phone)
  );
  -- Masked customer<->worker chat relayed through the business number; kept as dispute evidence.
  CREATE TABLE relay_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    from_phone TEXT NOT NULL,
    to_phone TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE rate_limits (
    phone TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL,
    warned INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    ref TEXT,
    detail TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_audit_ref ON audit(ref);
  `,
  // 2: operator refunds that settle a job (dispute split / late-cancellation fee) vs platform-funded goodwill.
  `ALTER TABLE financial_actions ADD COLUMN settle INTEGER NOT NULL DEFAULT 0;`,
];

export function createDb(filePath = ':memory:') {
  if (filePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const db = new DatabaseSync(filePath);
  if (filePath !== ':memory:') fs.chmodSync(filePath, 0o600); // owner-only; WAL/SHM files inherit this mode
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1;
    if (applied.has(version)) return;
    transactional(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(version, Date.now());
    });
  });
  return db;
}

const depths = new WeakMap();
// Synchronous transaction. Nested calls on the same connection join the outer transaction.
export function transactional(db, fn) {
  const depth = depths.get(db) || 0;
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depths.set(db, 1);
  try {
    const result = fn();
    if (result && typeof result.then === 'function') throw new Error('transactional() callbacks must be synchronous');
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depths.set(db, 0);
  }
}

export const schemaVersion = () => MIGRATIONS.length;
