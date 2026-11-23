// Offline readiness check. Prints what is still missing before DRY_RUN=false / production.
import { readConfig, liveReadinessProblems } from '../src/config.js';

const config = readConfig();
const problems = liveReadinessProblems(config);
console.log(`APP_ENV=${config.appEnv} DRY_RUN=${config.dryRun} payments=${config.paymentsEnabled ? 'configured' : 'missing'} admins=${config.admins.size}`);
console.log(`Pilot areas: ${config.pilotAreas.join(', ')}`);
console.log(`Templates configured: ${Object.keys(config.templates).join(', ') || 'none'}`);
if (!problems.length) { console.log('✅ No blocking configuration problems found.'); process.exit(0); }
console.log('\nOutstanding items:');
for (const p of problems) console.log(` - ${p}`);
process.exit(1);
