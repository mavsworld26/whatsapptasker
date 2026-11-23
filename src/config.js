// Configuration is parsed once here; every other module consumes the parsed object.
// Live mode fails closed: missing credentials stop the process instead of degrading silently.

const ROLES = new Set(['super', 'support', 'verifier', 'finance']);

function num(value, fallback, { min = -Infinity, max = Infinity, name } = {}) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid numeric config ${name}: ${value}`);
  return n;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (/^(1|true|yes)$/i.test(value)) return true;
  if (/^(0|false|no)$/i.test(value)) return false;
  throw new Error(`Invalid boolean config value: ${value}`);
}

// ADMIN_PHONES="919xxxxxxxxx:super,919yyyyyyyyy:support+verifier"
export function parseAdmins(raw = '') {
  const admins = new Map();
  for (const entry of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const [phonePart, rolePart = 'super'] = entry.split(':');
    const phone = phonePart.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) throw new Error(`Invalid admin phone in ADMIN_PHONES: ${phonePart}`);
    const roles = new Set(rolePart.split('+').map(r => r.trim().toLowerCase()).filter(Boolean));
    for (const r of roles) if (!ROLES.has(r)) throw new Error(`Unknown admin role "${r}" (allowed: ${[...ROLES].join(', ')})`);
    admins.set(phone, roles);
  }
  return admins;
}

function parseTemplates(raw) {
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('WA_TEMPLATES must be a JSON object of {key: templateName}'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('WA_TEMPLATES must be a JSON object');
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === '' || v === null) continue; // not yet approved
    if (typeof v !== 'string' || !/^[a-z0-9_]{1,512}$/.test(v)) throw new Error(`Invalid template name for ${k}`);
    out[k] = v;
  }
  return out;
}

export function readConfig(env = process.env) {
  const appEnv = env.APP_ENV || 'development';
  const config = {
    appEnv,
    port: num(env.PORT, 8080, { min: 0, max: 65535, name: 'PORT' }),
    databasePath: env.DATABASE_PATH || './data/marketplace.sqlite',
    publicBaseUrl: (env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    dryRun: bool(env.DRY_RUN, true),
    // WhatsApp Business Platform (Cloud API)
    verifyToken: env.WA_VERIFY_TOKEN || '',
    appSecret: env.WA_APP_SECRET || '',
    accessToken: env.WA_ACCESS_TOKEN || '',
    phoneNumberId: env.WA_PHONE_NUMBER_ID || '',
    graphVersion: env.WA_GRAPH_VERSION || 'v23.0',
    templates: parseTemplates(env.WA_TEMPLATES),
    paymentConfiguration: env.WA_PAYMENT_CONFIGURATION || '', // Meta WhatsApp Pay (India) configuration name, if approved
    messageWindowHours: num(env.MESSAGE_WINDOW_HOURS, 24, { min: 1, max: 24, name: 'MESSAGE_WINDOW_HOURS' }),
    // Razorpay (RBI-authorised payment aggregator) — Payment Links + Route
    razorpayKeyId: env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
    razorpayBaseUrl: env.RAZORPAY_BASE_URL || 'https://api.razorpay.com',
    paymentLinkTtlMinutes: num(env.PAYMENT_LINK_TTL_MINUTES, 60, { min: 16, max: 1440, name: 'PAYMENT_LINK_TTL_MINUTES' }),
    // Pricing (pilot business assumptions — confirm with your CA)
    feeRateHousehold: num(env.FEE_RATE_HOUSEHOLD, 0.18, { min: 0, max: 0.5, name: 'FEE_RATE_HOUSEHOLD' }),
    feeRateBusiness: num(env.FEE_RATE_BUSINESS, 0.15, { min: 0, max: 0.5, name: 'FEE_RATE_BUSINESS' }),
    feeGstRate: num(env.FEE_GST_RATE, 0.18, { min: 0, max: 0.28, name: 'FEE_GST_RATE' }),
    // Operations
    admins: parseAdmins(env.ADMIN_PHONES || ''),
    financeRequireCosign: bool(env.FINANCE_REQUIRE_COSIGN, true),
    pilotAreas: (env.PILOT_AREAS || 'gachibowli,kondapur,madhapur,hitech city,kothaguda,nanakramguda,manikonda')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    maxAlertsPerTask: num(env.MATCH_MAX_ALERTS, 15, { min: 1, max: 100, name: 'MATCH_MAX_ALERTS' }),
    autoConfirmHours: num(env.AUTO_CONFIRM_HOURS, 48, { min: 1, max: 336, name: 'AUTO_CONFIRM_HOURS' }),
    freeCancelHours: num(env.FREE_CANCEL_HOURS, 12, { min: 0, max: 168, name: 'FREE_CANCEL_HOURS' }),
    maxTasksPerDay: num(env.MAX_TASKS_PER_DAY, 5, { min: 1, max: 100, name: 'MAX_TASKS_PER_DAY' }),
    maxMessagesPerMinute: num(env.MAX_MESSAGES_PER_MINUTE, 20, { min: 1, max: 600, name: 'MAX_MESSAGES_PER_MINUTE' }),
    termsVersion: env.TERMS_VERSION || 'draft-unapproved',
    termsUrl: env.TERMS_URL || '',
    privacyUrl: env.PRIVACY_URL || '',
    supportHours: env.SUPPORT_HOURS || '9 AM – 7 PM IST, Mon–Sat',
  };
  config.paymentsEnabled = Boolean(config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret);
  return config;
}

// Returns a list of problems; production refuses to start if any exist.
export function liveReadinessProblems(config) {
  const p = [];
  if (config.dryRun) p.push('DRY_RUN must be false');
  for (const [k, label] of [['appSecret', 'WA_APP_SECRET'], ['verifyToken', 'WA_VERIFY_TOKEN'], ['accessToken', 'WA_ACCESS_TOKEN'], ['phoneNumberId', 'WA_PHONE_NUMBER_ID']]) {
    if (!config[k]) p.push(`${label} is required`);
  }
  if (config.verifyToken && config.verifyToken.length < 24) p.push('WA_VERIFY_TOKEN should be at least 24 random characters');
  if (!config.paymentsEnabled) p.push('RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required');
  if (config.appEnv === 'production' && config.razorpayKeyId && !config.razorpayKeyId.startsWith('rzp_live_')) p.push('Production requires a rzp_live_ key');
  if (config.appEnv !== 'production' && config.razorpayKeyId.startsWith('rzp_live_')) p.push('Live Razorpay keys are only allowed with APP_ENV=production');
  if (!config.publicBaseUrl.startsWith('https://')) p.push('PUBLIC_BASE_URL must be an https:// URL');
  if (!config.admins.size) p.push('ADMIN_PHONES must list at least one operator');
  const finance = [...config.admins.values()].filter(r => r.has('finance') || r.has('super')).length;
  if (config.financeRequireCosign && finance < 2) p.push('FINANCE_REQUIRE_COSIGN=true needs at least two finance/super operators');
  if (config.appEnv === 'production' && (config.termsVersion === 'draft-unapproved' || !config.termsUrl || !config.privacyUrl)) {
    p.push('TERMS_VERSION, TERMS_URL and PRIVACY_URL must reference lawyer-approved documents');
  }
  for (const key of ['job_alert', 'offer_received', 'payment_request', 'booking_confirmed', 'completion_request', 'generic_update']) {
    if (!config.templates[key]) p.push(`WA_TEMPLATES.${key} (Meta-approved template) is missing — out-of-window notifications will queue`);
  }
  return p;
}

// Template gaps degrade (messages wait for the user to message again); everything else is fatal.
export function fatalLiveProblems(config) {
  return liveReadinessProblems(config).filter(x => !x.startsWith('WA_TEMPLATES'));
}
