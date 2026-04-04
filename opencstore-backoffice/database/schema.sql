-- OpenCStore Back Office – SQLite Schema
-- Version: 1.0.0
-- All timestamps are stored as ISO-8601 UTC strings.
-- IDs are UUIDs stored as TEXT.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================
-- STORE & USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS stores (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  phone           TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
  tax_rate        REAL NOT NULL DEFAULT 0.0,
  fuel_tax_rate   REAL NOT NULL DEFAULT 0.0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  pos_type        TEXT,           -- 'verifone_ruby2' | 'commander' | 'mock' | 'file_import'
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('owner','manager','cashier')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  token_hash      TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  invalidated_at  TEXT
);

-- ============================================================
-- CONNECTION SETTINGS (no plaintext secrets stored here)
-- Actual credentials are stored in OS keychain or encrypted file.
-- This table only stores non-secret connection metadata.
-- ============================================================

CREATE TABLE IF NOT EXISTS connection_settings (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  adapter_type    TEXT NOT NULL,  -- 'verifone_ruby2' | 'commander' | 'mock' | 'file_import'
  host            TEXT,           -- IP/hostname, no default
  port            INTEGER,
  db_name         TEXT,
  username_hint   TEXT,           -- hint only, no password stored here
  use_ssl         INTEGER NOT NULL DEFAULT 0,
  read_only       INTEGER NOT NULL DEFAULT 1,
  connection_status TEXT NOT NULL DEFAULT 'untested', -- 'untested'|'ok'|'failed'
  last_tested_at  TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- BACKUP & IMPORT TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS backup_manifest (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  triggered_by    TEXT NOT NULL REFERENCES users(id),
  backup_type     TEXT NOT NULL, -- 'full' | 'plu' | 'pricebook' | 'transactions'
  file_path       TEXT NOT NULL,
  file_size_bytes INTEGER,
  checksum        TEXT,
  source_adapter  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'complete'|'failed'
  notes           TEXT,
  created_at      TEXT NOT NULL,
  completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  triggered_by    TEXT NOT NULL REFERENCES users(id),
  source_type     TEXT NOT NULL, -- 'xml_plu'|'csv_pricebook'|'csv_transactions'|'api'
  source_file     TEXT,
  adapter_type    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  records_total   INTEGER DEFAULT 0,
  records_ok      INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_error   INTEGER DEFAULT 0,
  error_detail    TEXT,
  backup_id       TEXT REFERENCES backup_manifest(id),
  created_at      TEXT NOT NULL,
  completed_at    TEXT
);

-- ============================================================
-- PRODUCT CATALOG (PLU / ITEM MASTER)
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  pos_dept_id     TEXT NOT NULL,  -- native POS identifier
  name            TEXT NOT NULL,
  tax_flag        INTEGER NOT NULL DEFAULT 0,
  age_restricted  INTEGER NOT NULL DEFAULT 0,
  is_fuel         INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  source_raw      TEXT,           -- original JSON from import
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  department_id   TEXT REFERENCES departments(id),
  pos_category_id TEXT NOT NULL,
  name            TEXT NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  source_raw      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plu_items (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  pos_plu_id      TEXT NOT NULL,
  description     TEXT NOT NULL,
  description_short TEXT,
  department_id   TEXT REFERENCES departments(id),
  category_id     TEXT REFERENCES categories(id),
  tax_flag        INTEGER NOT NULL DEFAULT 0,
  age_restricted  INTEGER NOT NULL DEFAULT 0,
  foodstamp_eligible INTEGER NOT NULL DEFAULT 0,
  is_fuel         INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  unit_descriptor TEXT,           -- 'EA'|'PK'|'CS'|'LB'|'OZ'|etc.
  pack_size       INTEGER DEFAULT 1,
  cost            REAL,
  retail_price    REAL,
  sale_price      REAL,
  mix_match_group TEXT,
  loyalty_eligible INTEGER NOT NULL DEFAULT 0,
  vendor_code     TEXT,
  product_code    TEXT,
  source_raw      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_codes (
  id              TEXT PRIMARY KEY,
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id) ON DELETE CASCADE,
  barcode         TEXT NOT NULL,
  barcode_type    TEXT NOT NULL DEFAULT 'UPC_A', -- 'UPC_A'|'UPC_E'|'EAN_13'|'ITF'|'CODE_128'|'PLU'
  is_primary      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_codes_barcode_store
  ON scan_codes(plu_item_id, barcode);

-- ============================================================
-- PRICEBOOK
-- ============================================================

CREATE TABLE IF NOT EXISTS pricebook_entries (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  price_level     TEXT NOT NULL DEFAULT 'regular', -- 'regular'|'sale'|'loyalty'|'wholesale'
  effective_date  TEXT NOT NULL,
  end_date        TEXT,
  retail_price    REAL NOT NULL,
  cost            REAL,
  margin_pct      REAL,           -- stored computed for reporting speed
  is_active       INTEGER NOT NULL DEFAULT 1,
  source_raw      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- CASHIERS (POS operator records)
-- ============================================================

CREATE TABLE IF NOT EXISTS pos_cashiers (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  pos_cashier_id  TEXT NOT NULL,
  name            TEXT NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- SHIFTS
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  pos_shift_id    TEXT,
  shift_number    INTEGER,
  cashier_id      TEXT REFERENCES pos_cashiers(id),
  opened_at       TEXT NOT NULL,
  closed_at       TEXT,
  opening_cash    REAL DEFAULT 0,
  closing_cash    REAL DEFAULT 0,
  expected_cash   REAL DEFAULT 0,
  over_short      REAL DEFAULT 0,
  total_sales     REAL DEFAULT 0,
  total_voids     REAL DEFAULT 0,
  total_refunds   REAL DEFAULT 0,
  total_discounts REAL DEFAULT 0,
  total_tax       REAL DEFAULT 0,
  source_raw      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  shift_id        TEXT REFERENCES shifts(id),
  pos_txn_id      TEXT NOT NULL,
  cashier_id      TEXT REFERENCES pos_cashiers(id),
  txn_type        TEXT NOT NULL DEFAULT 'sale', -- 'sale'|'void'|'refund'|'no_sale'
  txn_at          TEXT NOT NULL,
  subtotal        REAL NOT NULL DEFAULT 0,
  discount_total  REAL NOT NULL DEFAULT 0,
  tax_total       REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  is_training     INTEGER NOT NULL DEFAULT 0,
  source_raw      TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  plu_item_id     TEXT REFERENCES plu_items(id),
  pos_plu_id      TEXT,
  description     TEXT,
  quantity        REAL NOT NULL DEFAULT 1,
  unit_price      REAL NOT NULL DEFAULT 0,
  ext_price       REAL NOT NULL DEFAULT 0,
  cost            REAL,
  tax_amount      REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  is_fuel         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- FUEL SALES
-- ============================================================

CREATE TABLE IF NOT EXISTS fuel_sales (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  shift_id        TEXT REFERENCES shifts(id),
  grade           TEXT NOT NULL, -- 'regular'|'midgrade'|'premium'|'diesel'|'e85'
  pump_number     INTEGER,
  hose_number     INTEGER,
  gallons         REAL NOT NULL DEFAULT 0,
  price_per_gallon REAL NOT NULL DEFAULT 0,
  total_amount    REAL NOT NULL DEFAULT 0,
  cost_per_gallon REAL,
  txn_at          TEXT NOT NULL,
  source_raw      TEXT,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- TENDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS tenders (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tender_type     TEXT NOT NULL, -- 'cash'|'credit'|'debit'|'ebt_food'|'ebt_cash'|'check'|'gift_card'|'mobile'|'other'
  amount          REAL NOT NULL DEFAULT 0,
  change_given    REAL DEFAULT 0,
  card_type       TEXT,           -- 'visa'|'mc'|'amex'|'disc'|etc.
  approval_code   TEXT,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- ITEM AUDIT / RECOMMENDATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS item_recommendations (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  plu_item_id     TEXT REFERENCES plu_items(id),
  job_run_id      TEXT NOT NULL,  -- UUID grouping a recommendation batch
  field_name      TEXT NOT NULL,  -- 'description'|'department'|'category'|'tax_flag'|'unit_descriptor'|'age_restricted'|'upc'|etc.
  current_value   TEXT,
  recommended_value TEXT,
  reason          TEXT NOT NULL,
  rule_code       TEXT NOT NULL,  -- short machine code, e.g. 'BLANK_DESC', 'DUP_UPC'
  confidence      REAL NOT NULL DEFAULT 0.5, -- 0.0–1.0
  requires_manual_review INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'applied'|'skipped'
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  review_notes    TEXT,
  applied_at      TEXT,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- PRICING RECOMMENDATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS pricing_recommendations (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  job_run_id      TEXT NOT NULL,
  current_retail  REAL NOT NULL,
  current_cost    REAL,
  current_margin_pct REAL,
  recommended_retail REAL NOT NULL,
  estimated_margin_pct REAL,
  reason          TEXT NOT NULL,
  rule_code       TEXT NOT NULL,
  confidence      REAL NOT NULL DEFAULT 0.5,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  review_notes    TEXT,
  applied_at      TEXT,
  created_at      TEXT NOT NULL
);

-- Price change history (immutable after insert)
CREATE TABLE IF NOT EXISTS price_change_history (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  changed_by      TEXT NOT NULL REFERENCES users(id),
  recommendation_id TEXT REFERENCES pricing_recommendations(id),
  old_retail      REAL,
  new_retail      REAL,
  old_cost        REAL,
  new_cost        REAL,
  old_margin_pct  REAL,
  new_margin_pct  REAL,
  change_reason   TEXT,
  change_method   TEXT NOT NULL DEFAULT 'manual', -- 'manual'|'recommendation'|'import'
  write_back_status TEXT DEFAULT 'pending_export', -- 'pending_export'|'exported'|'applied_pos'|'rolled_back'
  rollback_snapshot TEXT, -- JSON snapshot for rollback
  created_at      TEXT NOT NULL
);

-- ============================================================
-- APPROVAL QUEUE (write-back plan)
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_queue (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  queue_type      TEXT NOT NULL, -- 'item_change'|'price_change'
  batch_id        TEXT NOT NULL, -- groups related changes in one write-back plan
  reference_id    TEXT NOT NULL, -- FK to item_recommendations or pricing_recommendations
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'applied'|'failed'
  approved_by     TEXT REFERENCES users(id),
  approved_at     TEXT,
  applied_by      TEXT REFERENCES users(id),
  applied_at      TEXT,
  error_detail    TEXT,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- DAILY OPERATIONS / CHECKLISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_checklists (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  shift_id        TEXT REFERENCES shifts(id),
  checklist_type  TEXT NOT NULL, -- 'shift_open'|'shift_close'|'day_close'|'shift_handoff'
  operator_name   TEXT NOT NULL,
  operator_initials TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  over_short_amount REAL DEFAULT 0,
  manager_notes   TEXT,
  is_complete     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_steps (
  id              TEXT PRIMARY KEY,
  checklist_id    TEXT NOT NULL REFERENCES shift_checklists(id) ON DELETE CASCADE,
  step_key        TEXT NOT NULL,  -- machine key
  step_label      TEXT NOT NULL,
  step_order      INTEGER NOT NULL DEFAULT 0,
  completed       INTEGER NOT NULL DEFAULT 0,
  completed_at    TEXT,
  completed_by    TEXT,
  notes           TEXT,
  numeric_value   REAL,           -- for cash counts, fuel readings, etc.
  created_at      TEXT NOT NULL
);

-- ============================================================
-- REPORTS ARCHIVE
-- ============================================================

CREATE TABLE IF NOT EXISTS reports_archive (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  report_type     TEXT NOT NULL,  -- 'daily_shift'|'eod'|'sales_dept'|'margin'|etc.
  report_period_start TEXT NOT NULL,
  report_period_end   TEXT NOT NULL,
  generated_by    TEXT NOT NULL REFERENCES users(id),
  parameters      TEXT,           -- JSON of filters
  data_snapshot   TEXT NOT NULL,  -- full JSON report payload
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_close_packets (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  business_date   TEXT NOT NULL,
  closed_by       TEXT NOT NULL REFERENCES users(id),
  shift_ids       TEXT NOT NULL,  -- JSON array of shift ids
  total_sales     REAL NOT NULL DEFAULT 0,
  total_cash      REAL NOT NULL DEFAULT 0,
  total_credit    REAL NOT NULL DEFAULT 0,
  total_over_short REAL NOT NULL DEFAULT 0,
  notes           TEXT,
  packet_data     TEXT NOT NULL,  -- full JSON close packet
  created_at      TEXT NOT NULL
);

-- ============================================================
-- AUDIT LOG (append-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  store_id        TEXT,
  user_id         TEXT,
  session_id      TEXT,
  event_type      TEXT NOT NULL,
  event_subtype   TEXT,
  description     TEXT NOT NULL,
  entity_type     TEXT,           -- 'plu_item'|'shift'|'recommendation'|etc.
  entity_id       TEXT,
  before_state    TEXT,           -- JSON snapshot before change
  after_state     TEXT,           -- JSON snapshot after change
  ip_address      TEXT,
  result          TEXT NOT NULL DEFAULT 'success', -- 'success'|'failure'|'warning'
  error_detail    TEXT,
  created_at      TEXT NOT NULL
);

-- Prevent any UPDATE or DELETE on audit_log at schema level hint
-- Application layer enforces append-only; no triggers needed in SQLite
-- but documented for operators.

-- ============================================================
-- APP STATE / SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  description     TEXT,
  updated_at      TEXT NOT NULL
);

-- Onboarding completion flag
INSERT OR IGNORE INTO app_settings(key, value, description, updated_at)
  VALUES('onboarding_complete', 'false', 'Whether the first-run wizard has been completed', datetime('now'));

INSERT OR IGNORE INTO app_settings(key, value, description, updated_at)
  VALUES('schema_version', '1', 'Current database schema version', datetime('now'));

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_plu_items_store       ON plu_items(store_id);
CREATE INDEX IF NOT EXISTS idx_plu_items_dept         ON plu_items(department_id);
CREATE INDEX IF NOT EXISTS idx_plu_items_cat          ON plu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_plu_items_pos_plu_id   ON plu_items(pos_plu_id);
CREATE INDEX IF NOT EXISTS idx_scan_codes_barcode      ON scan_codes(barcode);
CREATE INDEX IF NOT EXISTS idx_transactions_shift      ON transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_transactions_at         ON transactions(txn_at);
CREATE INDEX IF NOT EXISTS idx_transaction_items_plu   ON transaction_items(plu_item_id);
CREATE INDEX IF NOT EXISTS idx_shifts_store            ON shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_item_rec_store_job      ON item_recommendations(store_id, job_run_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rec_store_job   ON pricing_recommendations(store_id, job_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_store         ON audit_log(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event         ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created       ON audit_log(created_at);
