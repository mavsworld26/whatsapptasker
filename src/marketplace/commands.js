// Parses an inbound text into { cmd, args, rest }. Canonical commands are English keywords; common
// Telugu, Hindi and Hinglish phrasings map to the same commands. Interactive button/list ids are
// canonical command strings, so taps and typed commands share one parser.

const PHRASES = [
  // multi-word phrases first (matched against the whole normalised message start)
  [/^delete my data\b/i, 'DELETEMYDATA'],
  [/^(mera|meri) data (delete|hatao|mitao)\b|^मेरा डेटा (हटाओ|मिटाओ)|^నా డేటా తొలగించ/i, 'DELETEMYDATA'],
  [/^my data\b|^mera data\b|^मेरा डेटा$|^నా డేటా$/i, 'MYDATA'],
  [/^(my jobs|mere kaam|mera kaam)\b|^मेरे काम|^నా పనులు/i, 'MYJOBS'],
  [/^(naya kaam|kaam post|post job|new job)\b|^नया काम|^కొత్త పని/i, 'POST'],
];

const WORDS = {
  POST: ['post', 'kaam', 'काम', 'పని'],
  MENU: ['menu', 'hi', 'hello', 'hey', 'namaste', 'namaskar', 'namaskaram', 'नमस्ते', 'नमस्कार', 'మెను', 'నమస్తే', 'నమస్కారం', 'मेनू', 'start over'],
  HELP: ['help', 'support', 'madad', 'मदद', 'सहायता', 'సహాయం', 'హెల్ప్'],
  JOIN: ['join', 'register', 'जुड़ें', 'చేరండి'],
  STOP: ['stop', 'unsubscribe', 'रोकें', 'ఆపు', 'band'],
  START: ['start', 'subscribe'],
  YES: ['yes', 'y', 'haan', 'ha', 'han', 'हाँ', 'हां', 'అవును', 'ok', 'okay'],
  NO: ['no', 'nahi', 'नहीं', 'కాదు'],
  AGREE: ['agree', 'i agree', 'सहमत', 'అంగీకరిస్తున్నాను', 'అంగీకారం'],
  LANG: ['lang', 'language', 'भाषा', 'భాష', 'bhasha'],
  CANCEL: ['cancel', 'रद्द', 'రద్దు'],
};
const WORD_MAP = new Map();
for (const [cmd, words] of Object.entries(WORDS)) for (const w of words) WORD_MAP.set(w.toLowerCase(), cmd);

export function parseCommand(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase().replace(/[!?.।]+$/u, '').trim();
  for (const [re, cmd] of PHRASES) {
    const m = lower.match(re);
    if (m) {
      const rest = raw.slice(m[0].length).trim();
      return { cmd, args: rest ? rest.split(/\s+/) : [], rest };
    }
  }
  if (WORD_MAP.has(lower)) return { cmd: WORD_MAP.get(lower), args: [], rest: '' };
  const parts = raw.split(/\s+/);
  const first = (parts[0] || '').toLowerCase();
  const rest = raw.slice(parts[0]?.length || 0).trim();
  const cmd = WORD_MAP.get(first) || first.toUpperCase().replace(/[^A-Z_]/g, '');
  return { cmd, args: parts.slice(1), rest };
}

export const isWholeCommand = (text, cmd) => parseCommand(text).cmd === cmd && parseCommand(text).args.length === 0;
