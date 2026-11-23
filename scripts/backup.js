// Consistent online backup of the SQLite database (safe while the service runs, thanks to WAL).
// Usage: npm run backup -- /path/to/backups   (default ./backups). Encrypt and copy off-site afterwards.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const source = process.env.DATABASE_PATH || './data/marketplace.sqlite';
const dir = process.argv[2] || './backups';
if (!fs.existsSync(source)) { console.error(`Database not found: ${source}`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const target = path.join(dir, `marketplace-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const db = new DatabaseSync(source);
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
fs.chmodSync(target, 0o600);
const check = new DatabaseSync(target, { readOnly: true });
const ok = check.prepare('PRAGMA integrity_check').get();
check.close();
console.log(`Backup written: ${target} (integrity: ${Object.values(ok)[0]})`);
