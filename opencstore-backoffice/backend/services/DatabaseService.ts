/**
 * DatabaseService
 *
 * Manages the SQLite connection and schema initialization.
 * Uses better-sqlite3 for synchronous, reliable embedded DB access.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  open(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.applySchema();
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  get raw(): Database.Database {
    if (!this.db) throw new Error('Database not open. Call open() first.');
    return this.db;
  }

  // ─── Schema ───────────────────────────────────────────────────────────────

  private applySchema(): void {
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    this.db!.exec(sql);
  }

  // ─── Generic CRUD ─────────────────────────────────────────────────────────

  all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, params: unknown[] = []): Database.RunResult {
    return this.raw.prepare(sql).run(...params);
  }

  transaction<T>(fn: () => T): T {
    return this.raw.transaction(fn)();
  }

  // ─── App Settings ─────────────────────────────────────────────────────────

  getSetting(key: string): string | undefined {
    const row = this.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
    return row?.value;
  }

  setSetting(key: string, value: string, description?: string): void {
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO app_settings(key, value, description, updated_at)
       VALUES(?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, description ?? null, now]
    );
  }

  isOnboardingComplete(): boolean {
    return this.getSetting('onboarding_complete') === 'true';
  }

  // ─── Store ────────────────────────────────────────────────────────────────

  getStore(): Record<string, unknown> | undefined {
    return this.get('SELECT * FROM stores LIMIT 1');
  }

  upsertStore(data: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    timezone: string;
    tax_rate: number;
    fuel_tax_rate: number;
    pos_type?: string;
  }): string {
    const existing = this.getStore() as { id: string } | undefined;
    const now = new Date().toISOString();

    if (existing) {
      this.run(
        `UPDATE stores SET name=?, address=?, city=?, state=?, zip=?, phone=?,
         timezone=?, tax_rate=?, fuel_tax_rate=?, pos_type=?, updated_at=? WHERE id=?`,
        [data.name, data.address ?? null, data.city ?? null, data.state ?? null,
         data.zip ?? null, data.phone ?? null, data.timezone, data.tax_rate,
         data.fuel_tax_rate, data.pos_type ?? null, now, existing.id]
      );
      return existing.id;
    }

    const id = uuidv4();
    this.run(
      `INSERT INTO stores(id,name,address,city,state,zip,phone,timezone,tax_rate,fuel_tax_rate,pos_type,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, data.name, data.address ?? null, data.city ?? null, data.state ?? null,
       data.zip ?? null, data.phone ?? null, data.timezone, data.tax_rate,
       data.fuel_tax_rate, data.pos_type ?? null, now, now]
    );
    return id;
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  getUserByUsername(username: string): Record<string, unknown> | undefined {
    return this.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
  }

  createUser(data: {
    store_id: string;
    username: string;
    password_hash: string;
    display_name: string;
    role: 'owner' | 'manager' | 'cashier';
  }): string {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO users(id,store_id,username,password_hash,display_name,role,is_active,created_at,updated_at)
       VALUES(?,?,?,?,?,?,1,?,?)`,
      [id, data.store_id, data.username, data.password_hash, data.display_name, data.role, now, now]
    );
    return id;
  }

  // ─── Dashboard Summary Query ──────────────────────────────────────────────

  getDashboardSummary(storeId: string): Record<string, unknown> {
    const today = new Date().toISOString().split('T')[0];

    const todaySales = this.get<{ total: number }>(
      `SELECT COALESCE(SUM(total), 0) as total FROM transactions
       WHERE store_id=? AND txn_type='sale' AND txn_at >= ?`,
      [storeId, today + 'T00:00:00']
    );

    const pendingItemRecs = this.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM item_recommendations WHERE store_id=? AND status='pending'`,
      [storeId]
    );

    const pendingPriceRecs = this.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM pricing_recommendations WHERE store_id=? AND status='pending'`,
      [storeId]
    );

    const lastImport = this.get<{ completed_at: string }>(
      `SELECT completed_at FROM import_jobs WHERE store_id=? AND status='complete' ORDER BY completed_at DESC LIMIT 1`,
      [storeId]
    );

    const lastBackup = this.get<{ completed_at: string }>(
      `SELECT completed_at FROM backup_manifest WHERE store_id=? AND status='complete' ORDER BY completed_at DESC LIMIT 1`,
      [storeId]
    );

    const topDepts = this.all(
      `SELECT d.name, COALESCE(SUM(ti.ext_price),0) as sales
       FROM transaction_items ti
       JOIN plu_items p ON p.id = ti.plu_item_id
       JOIN departments d ON d.id = p.department_id
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE t.store_id=? AND t.txn_type='sale' AND t.txn_at >= ?
       GROUP BY d.id ORDER BY sales DESC LIMIT 5`,
      [storeId, today + 'T00:00:00']
    );

    const lowMarginItems = this.all(
      `SELECT p.pos_plu_id, p.description, p.cost, p.retail_price,
       CASE WHEN p.retail_price > 0 THEN ROUND((p.retail_price - p.cost) / p.retail_price * 100, 1) ELSE 0 END as margin_pct
       FROM plu_items p WHERE p.store_id=? AND p.cost IS NOT NULL AND p.retail_price IS NOT NULL
       AND p.retail_price > 0 AND p.is_active=1
       AND (p.retail_price - p.cost) / p.retail_price < 0.20
       ORDER BY margin_pct ASC LIMIT 10`,
      [storeId]
    );

    return {
      today_sales: todaySales?.total ?? 0,
      pending_item_recommendations: pendingItemRecs?.cnt ?? 0,
      pending_pricing_recommendations: pendingPriceRecs?.cnt ?? 0,
      last_import_at: lastImport?.completed_at ?? null,
      last_backup_at: lastBackup?.completed_at ?? null,
      top_departments_today: topDepts,
      low_margin_items: lowMarginItems,
    };
  }
}
