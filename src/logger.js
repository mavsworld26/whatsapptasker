// Structured JSON logs. Never log message bodies, tokens, addresses or full phone numbers.
export const maskPhone = p => (p ? `${String(p).slice(0, 4)}****${String(p).slice(-2)}` : p);

let sink = line => process.stdout.write(`${line}\n`);
let silent = false;
export function setLogSink(fn) { sink = fn; }
export function silenceLogs(value = true) { silent = value; }

function emit(level, event, fields = {}) {
  if (silent) return;
  sink(JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }));
}
export const log = {
  info: (e, f) => emit('info', e, f),
  warn: (e, f) => emit('warn', e, f),
  error: (e, f) => emit('error', e, f),
};
