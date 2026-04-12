/**
 * database/seeds/seed.ts
 *
 * Development seed script. Populates the database with:
 *   - One demo store
 *   - Three users: owner (admin), manager, cashier
 *   - Loads sample PLU data from sample-data/mock-plu.xml
 *   - Marks onboarding as complete so you land on the login screen
 *
 * Run with: npm run seed
 * Credentials after seeding:
 *   owner:   admin / admin123
 *   manager: manager / manager123
 *   cashier: cashier / cashier123
 */

import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../../../backend/services/DatabaseService';
import { ImportService } from '../../../backend/services/ImportService';
import { AuditLogger } from '../../../audit/AuditLogger';
import { MockVerifoneAdapter } from '../../../integrations/adapters/MockVerifoneAdapter';

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT      = path.resolve(__dirname, '../../..');
const DB_PATH   = path.join(ROOT, 'dev.db');        // use dev.db in project root for dev
const BACKUP_DIR = path.join(ROOT, '.dev-backups');

console.log('🌱  OpenCStore seed starting…');
console.log(`    DB: ${DB_PATH}`);

// ─── Services ─────────────────────────────────────────────────────────────────

const dbService   = new DatabaseService(DB_PATH);
const auditLogger = new AuditLogger(dbService);
const importSvc   = new ImportService(dbService, auditLogger);

dbService.open();

// ─── Wipe existing seed data (idempotent) ────────────────────────────────────

console.log('    Clearing existing data…');
dbService.run('DELETE FROM checklist_steps');
dbService.run('DELETE FROM shift_checklists');
dbService.run('DELETE FROM pricing_recommendations');
dbService.run('DELETE FROM item_recommendations');
dbService.run('DELETE FROM import_jobs');
dbService.run('DELETE FROM scan_codes');
dbService.run('DELETE FROM plu_items');
dbService.run('DELETE FROM categories');
dbService.run('DELETE FROM departments');
dbService.run('DELETE FROM shifts');
dbService.run('DELETE FROM users');
dbService.run('DELETE FROM stores');
dbService.run("DELETE FROM app_settings WHERE key != 'schema_version'");
dbService.run('DELETE FROM audit_log');

// ─── Store ────────────────────────────────────────────────────────────────────

console.log('    Creating demo store…');
const storeId = dbService.upsertStore({
  name:          "Joe's Corner Mart",
  address:       '1234 Main Street',
  city:          'Springfield',
  state:         'IL',
  zip:           '62701',
  phone:         '(217) 555-0100',
  timezone:      'America/Chicago',
  tax_rate:      0.0875,
  fuel_tax_rate: 0.0,
  pos_type:      'mock_commander',
});

console.log(`    Store created: ${storeId}`);

// ─── Users ────────────────────────────────────────────────────────────────────

console.log('    Creating users…');

async function createUser(opts: {
  username: string; password: string; display_name: string; role: 'owner' | 'manager' | 'cashier';
}) {
  const hash = await bcrypt.hash(opts.password, 12);
  return dbService.createUser({
    store_id:      storeId,
    username:      opts.username,
    password_hash: hash,
    display_name:  opts.display_name,
    role:          opts.role,
  });
}

const [ownerId] = await Promise.all([
  createUser({ username: 'admin',   password: 'admin123',   display_name: 'Joe Smith (Owner)',   role: 'owner'   }),
  createUser({ username: 'manager', password: 'manager123', display_name: 'Maria Garcia (Mgr)',  role: 'manager' }),
  createUser({ username: 'cashier', password: 'cashier123', display_name: 'Casey Jones (CSR)',   role: 'cashier' }),
]);

console.log('    Users created: admin / manager / cashier');

// ─── Settings ─────────────────────────────────────────────────────────────────

console.log('    Seeding app settings…');
const settingRows: [string, string, string][] = [
  ['store_name',         "Joe's Corner Mart",    'Store display name'],
  ['store_address',      '1234 Main Street, Springfield IL 62701', 'Full store address'],
  ['default_tax_rate',   '8.75',                 'Default sales tax rate (%)'],
  ['adapter_type',       'mock_commander',        'POS adapter type'],
  ['timezone',           'America/Chicago',       'Store timezone'],
  ['onboarding_complete','true',                  'Onboarding wizard completed'],
];
for (const [key, value, description] of settingRows) {
  dbService.setSetting(key, value, description);
}

// ─── Sample PLU data ──────────────────────────────────────────────────────────

console.log('    Loading sample PLU data…');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const adapter = new MockVerifoneAdapter();
adapter.configure({ adapterType: 'mock', readOnly: true });

try {
  const result = await importSvc.runImport({
    storeId,
    userId:    ownerId,
    adapter,
    format:    'xml_plu',
    backupDir: BACKUP_DIR,
  });
  console.log(`    PLU import: ${(result as { recordsOk?: number }).recordsOk ?? '?'} items loaded`);
} catch (err) {
  console.warn(`    ⚠ PLU import failed (non-fatal): ${err}`);
}

// ─── Done ─────────────────────────────────────────────────────────────────────

dbService.close();

console.log('');
console.log('✅  Seed complete!');
console.log('');
console.log('   Login credentials:');
console.log('   ┌──────────┬──────────────┬─────────┐');
console.log('   │ Username │ Password     │ Role    │');
console.log('   ├──────────┼──────────────┼─────────┤');
console.log('   │ admin    │ admin123     │ owner   │');
console.log('   │ manager  │ manager123   │ manager │');
console.log('   │ cashier  │ cashier123   │ cashier │');
console.log('   └──────────┴──────────────┴─────────┘');
console.log('');
console.log(`   Run: npm run dev`);
