// Boundary parsers for user-typed values. Each returns a parsed value or null; callers re-prompt on null.

export const CATEGORIES = ['moving', 'cleaning', 'assembly', 'packing', 'handyman', 'gardening', 'event', 'errands', 'office', 'general'];

const CATEGORY_PATTERNS = [
  ['moving', /sofa|fridge|almirah|\bmove\b|moving|shift|relocat|carry|lift|loading|सामान|शिफ्ट|उठा|సామాను|షిఫ్ట్|మార్చ|మోయ/i],
  ['cleaning', /clean|safai|saaf|jhaadu|pocha|wash|dust|सफाई|साफ|శుభ్ర|క్లీన్/i],
  ['assembly', /assembl|furniture|ikea|bed frame|wardrobe|shelf|rack|curtain|फर्नीचर|జోడించ|ఫర్నిచర్/i],
  ['packing', /pack|unpack|box|carton|organi[sz]|पैक|ప్యాక్/i],
  ['handyman', /repair|fix|drill|hang|mount|tv mount|door|hinge|tap|leak|मरम्मत|ठीक|రిపేర్|బాగు/i],
  ['gardening', /garden|plant|lawn|grass|pot|बगीचा|पौधे|తోట|మొక్క/i],
  ['event', /event|party|wedding|function|decorat|setup|stall|exhibition|पार्टी|शादी|ఫంక్షన్|పెళ్లి|పార్టీ/i],
  ['errands', /errand|pick ?up|drop|deliver|courier|grocer|queue|line|सामान लाना|డెలివరీ|తీసుకురా/i],
  ['office', /office|inventory|data entry|stock|filing|reception|shop help|दुकान|ఆఫీస్|షాప్/i],
];

export function classifyTask(desc = '') {
  for (const [cat, re] of CATEGORY_PATTERNS) if (re.test(desc)) return cat;
  return 'general';
}

// Work that needs licensed professionals, vulnerable-person care or is unlawful/hazardous goes to human review.
const REVIEW_PATTERN = /\b(child ?care|babysit|nanny|elder ?care|patient|medical|nurs|injection|prescription|medicine|weapon|gun|firearm|knife|drug|ganja|alcohol|liquor|cash ?(pick ?up|delivery)|electric|wiring|gas ?(line|cylinder|pipe)|lpg|hazard|chemical|pest|security guard|bouncer|loan|recovery agent|aadhaar|otp|password|bank account)|बिजली|वायरिंग|गैस|दवा|बच्च|కరెంట్|వైరింగ్|గ్యాస్|మందు|పిల్ల/i;

export function reviewReason(description, category) {
  if (category === 'general') return 'uncategorised';
  const m = String(description).match(REVIEW_PATTERN);
  return m ? `sensitive:${m[0].toLowerCase()}` : null;
}

export function parseRupees(value, { min = 100, max = 100000 } = {}) {
  const s = String(value ?? '').replace(/[₹,\s]|rs\.?|inr|rupees?|रुपये|రూపాయలు/gi, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const paise = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(paise) || paise < min * 100 || paise > max * 100) return null;
  return paise;
}

export function money(paise) {
  const digits = paise % 100 === 0 ? 0 : 2;
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const shortId = id => `HYD${String(id).padStart(4, '0')}`;
export function parseTaskId(s) {
  const m = String(s || '').trim().toUpperCase().match(/^(?:HYD)?0*(\d{1,9})$/);
  if (!m) return null;
  const id = Number(m[1]);
  return id > 0 ? id : null;
}
export function parsePositiveInt(s) {
  const m = String(s || '').trim().match(/^#?(\d{1,9})$/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function sanitizeText(text, max = 500) {
  return String(text ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

// ---------- Dates in Asia/Kolkata (UTC+05:30, no DST) ----------
const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

function istParts(ts) {
  const d = new Date(ts + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}
function istToUtc(y, m, d, hh, mm) {
  return Date.UTC(y, m, d, hh, mm) - IST_OFFSET_MS;
}

function parseTime(s) {
  // 24h with minutes: 18:30 / 18.30
  let m = s.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm|a\.m\.|p\.m\.)?/i);
  let hh, mm = 0, mer;
  if (m) { hh = Number(m[1]); mm = Number(m[2]); mer = m[3]; }
  else {
    m = s.match(/\b(1[0-2]|0?[1-9])\s*(am|pm|a\.m\.|p\.m\.|baje|बजे|గంటలకు|గంటలు)?\b/i);
    if (!m) {
      if (/morning|subah|सुबह|ఉదయం/i.test(s)) return { hh: 10, mm: 0, guessed: true };
      if (/afternoon|dopahar|दोपहर|మధ్యాహ్నం/i.test(s)) return { hh: 14, mm: 0, guessed: true };
      if (/evening|shaam|sham|शाम|సాయంత్రం/i.test(s)) return { hh: 18, mm: 0, guessed: true };
      return null;
    }
    hh = Number(m[1]); mer = m[2];
  }
  mer = (mer || '').toLowerCase().replace(/\./g, '');
  if (mer === 'pm' && hh < 12) hh += 12;
  else if (mer === 'am' && hh === 12) hh = 0;
  else if (mer !== 'am' && mer !== 'pm' && hh <= 12) {
    if (/shaam|sham|शाम|evening|రాత్రి|సాయంత్రం|raat|रात|night/i.test(s) && hh < 12) hh += 12;
    else if (hh >= 1 && hh <= 7) hh += 12; // "5 baje" without context: working hours → 5 PM
  }
  return { hh, mm };
}

/**
 * Parses free text like "30 Nov 2026 10 AM", "tomorrow 5pm", "kal 11 baje", "రేపు 10 am", "30/11 18:00".
 * Returns { at, label } in UTC ms, or null. Times are Hyderabad local (IST).
 */
export function parseWhen(text, nowMs = Date.now()) {
  const s = String(text || '').toLowerCase().normalize('NFC');
  const today = istParts(nowMs);
  let date = null;
  if (/\b(today|aaj)\b|आज|ఈరోజు|ఈ రోజు/.test(s)) date = today;
  else if (/\b(day after tomorrow|parso|parson)\b|परसों|ఎల్లుండి/.test(s)) date = istParts(nowMs + 2 * 86400000);
  else if (/\b(tomorrow|tmrw|kal)\b|कल|రేపు/.test(s)) date = istParts(nowMs + 86400000);
  else {
    let m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s*(\d{4})?/);
    if (m) date = { d: Number(m[1]), m: MONTHS[m[2]], y: m[3] ? Number(m[3]) : null };
    else {
      m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/);
      if (m) date = { d: Number(m[2]), m: MONTHS[m[1]], y: m[3] ? Number(m[3]) : null };
      else {
        m = s.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
        if (m) date = { d: Number(m[1]), m: Number(m[2]) - 1, y: m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : null };
      }
    }
    if (date && date.y === null) {
      date.y = today.y;
      if (istToUtc(date.y, date.m, date.d, 23, 59) < nowMs) date.y += 1;
    }
  }
  if (!date || date.m < 0 || date.m > 11 || date.d < 1 || date.d > 31) return null;
  // Remove the date fragment before reading the time, so "30/11" isn't read as a clock time.
  const timeText = s.replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/, ' ').replace(/\b\d{1,2}(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s*(\d{4})?/, ' ').replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*\d{1,2}(?:st|nd|rd|th)?,?\s*(\d{4})?/, ' ');
  const time = parseTime(timeText);
  if (!time) return null;
  const at = istToUtc(date.y, date.m, date.d, time.hh, time.mm);
  const check = istParts(at);
  if (check.d !== date.d || check.m !== date.m) return null; // e.g. 31 Feb
  return { at, label: formatIst(at) };
}

export function formatIst(ts) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(ts));
}
