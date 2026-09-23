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
  private schemaPath: string;

  /**
   * @param schemaPath Absolute path to database/schema.sql. Callers must pass
   *   this explicitly — the compiled main-process code, ts-node running the
   *   source directly (database/seeds/seed.ts), and a packaged build each put
   *   this file at a different depth relative to __dirname, so there is no
   *   single relative path that works in every context.
   */
  constructor(dbPath: string, schemaPath: string) {
    this.dbPath = dbPath;
    this.schemaPath = schemaPath;
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
    this.applyColumnMigrations();
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
    if (!fs.existsSync(this.schemaPath)) {
      throw new Error(`Schema file not found at: ${this.schemaPath}`);
    }
    const sql = fs.readFileSync(this.schemaPath, 'utf-8');
    this.db!.exec(sql);
  }

  /**
   * `CREATE TABLE IF NOT EXISTS` (what applySchema runs) creates any table
   * that's new to schema.sql, but silently does nothing for a column added
   * to a table that already exists on disk — an install that onboarded
   * before that column existed just never gets it, and every query that
   * touches it throws "no such column" at runtime instead of failing to
   * open. Each column ever added to an existing table after its first
   * release needs an entry here; a column on a brand-new table doesn't
   * (CREATE TABLE IF NOT EXISTS already covers that case correctly).
   */
  private applyColumnMigrations(): void {
    const migrations: { table: string; column: string; ddl: string }[] = [
      { table: 'plu_items', column: 'on_hand_qty', ddl: 'ALTER TABLE plu_items ADD COLUMN on_hand_qty REAL NOT NULL DEFAULT 0' },
      { table: 'plu_items', column: 'reorder_point', ddl: 'ALTER TABLE plu_items ADD COLUMN reorder_point REAL' },
      { table: 'users', column: 'hourly_wage', ddl: 'ALTER TABLE users ADD COLUMN hourly_wage REAL' },
    ];
    for (const m of migrations) {
      const columns = this.db!.prepare(`PRAGMA table_info(${m.table})`).all() as { name: string }[];
      if (!columns.some(c => c.name === m.column)) {
        this.db!.exec(m.ddl);
      }
    }
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
  //
  // A single install's stores table can hold more than one row (multi-store
  // operators), so every read/write here takes an explicit storeId rather
  // than guessing "the" store — there previously was a getStore()/
  // upsertStore() pair that grabbed row #1 unconditionally, which broke the
  // moment a second store existed.

  getStore(storeId: string): Record<string, unknown> | undefined {
    return this.get('SELECT * FROM stores WHERE id=?', [storeId]);
  }

  listStores(storeIds: string[]): Record<string, unknown>[] {
    if (storeIds.length === 0) return [];
    const placeholders = storeIds.map(() => '?').join(',');
    return this.all(`SELECT * FROM stores WHERE id IN (${placeholders}) ORDER BY name`, storeIds);
  }

  /** Always inserts a new store row — used for the very first store (onboarding) and for adding a location. */
  createStore(data: {
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
    const id = uuidv4();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO stores(id,name,address,city,state,zip,phone,timezone,tax_rate,fuel_tax_rate,pos_type,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, data.name, data.address ?? null, data.city ?? null, data.state ?? null,
       data.zip ?? null, data.phone ?? null, data.timezone, data.tax_rate,
       data.fuel_tax_rate, data.pos_type ?? null, now, now]
    );
    return id;
  }

  /** Always updates the given existing store row. */
  updateStore(storeId: string, data: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    phone?: string | null;
    timezone: string;
    tax_rate: number;
    fuel_tax_rate: number;
    pos_type?: string | null;
  }): void {
    const now = new Date().toISOString();
    this.run(
      `UPDATE stores SET name=?, address=?, city=?, state=?, zip=?, phone=?,
       timezone=?, tax_rate=?, fuel_tax_rate=?, pos_type=?, updated_at=? WHERE id=?`,
      [data.name, data.address ?? null, data.city ?? null, data.state ?? null,
       data.zip ?? null, data.phone ?? null, data.timezone, data.tax_rate,
       data.fuel_tax_rate, data.pos_type ?? null, now, storeId]
    );
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
