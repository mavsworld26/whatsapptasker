import { readConfig, fatalLiveProblems, liveReadinessProblems } from './config.js';
import { createApp } from './app.js';
import { log } from './logger.js';

const config = readConfig();
if (!config.dryRun || config.appEnv === 'production') {
  const fatal = fatalLiveProblems(config);
  if (fatal.length) {
    log.error('startup.refused', { problems: fatal });
    process.exit(1);
  }
}
for (const warning of liveReadinessProblems(config)) if (!config.dryRun) log.warn('startup.warning', { warning });

const app = createApp(config);
await app.start();
log.info('startup', { port: config.port, env: config.appEnv, dryRun: config.dryRun, payments: config.paymentsEnabled ? 'razorpay' : 'disabled' });

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info('shutdown', { signal });
  await app.stop();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
