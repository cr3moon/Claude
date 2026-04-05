/**
 * tests/report-service.test.ts
 *
 * Unit tests for report definitions, column schemas, and export helpers.
 * Run with: npx vitest run tests/report-service.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  REPORT_DEFINITIONS,
  REPORT_DEF_MAP,
} from '../src/modules/reports/report-definitions';
import type { ReportDefinition, ReportColumn } from '../src/modules/reports/report-definitions';
import { buildCsvString } from '../src/modules/reports/report-export.service';

// ─── REPORT_DEFINITIONS ───────────────────────────────────────────────────

describe('REPORT_DEFINITIONS', () => {
  it('exports at least 13 report definitions', () => {
    expect(REPORT_DEFINITIONS.length).toBeGreaterThanOrEqual(13);
  });

  it('every definition has a unique id', () => {
    const ids    = REPORT_DEFINITIONS.map(d => d.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every definition has a non-empty name', () => {
    for (const def of REPORT_DEFINITIONS) {
      expect(def.name.length).toBeGreaterThan(0);
    }
  });

  it('every definition has at least one column', () => {
    for (const def of REPORT_DEFINITIONS) {
      expect(def.columns.length).toBeGreaterThan(0);
    }
  });

  it('every column has key, label, and valid format', () => {
    const validFormats = new Set(['text', 'currency', 'percent', 'integer', 'datetime', 'date', undefined]);
    for (const def of REPORT_DEFINITIONS) {
      for (const col of def.columns) {
        expect(col.key.length).toBeGreaterThan(0);
        expect(col.label.length).toBeGreaterThan(0);
        expect(validFormats.has(col.format)).toBe(true);
      }
    }
  });

  it('column align is left, right, center, or undefined', () => {
    const valid = new Set(['left', 'right', 'center', undefined]);
    for (const def of REPORT_DEFINITIONS) {
      for (const col of def.columns) {
        expect(valid.has(col.align)).toBe(true);
      }
    }
  });
});

// ─── REPORT_DEF_MAP ──────────────────────────────────────────────────────

describe('REPORT_DEF_MAP', () => {
  it('contains all report IDs', () => {
    for (const def of REPORT_DEFINITIONS) {
      expect(REPORT_DEF_MAP[def.id]).toBeDefined();
    }
  });

  it('values match REPORT_DEFINITIONS entries', () => {
    for (const def of REPORT_DEFINITIONS) {
      expect(REPORT_DEF_MAP[def.id]).toBe(def);
    }
  });
});

// ─── Specific required report IDs ─────────────────────────────────────

const REQUIRED_REPORT_IDS = [
  'sales_by_department',
  'sales_by_category',
  'top_items_by_revenue',
  'low_margin_items',
  'price_change_history',
  'import_job_log',
  'audit_recommendations',
];

describe('Required reports exist', () => {
  for (const id of REQUIRED_REPORT_IDS) {
    it(`report "${id}" is present`, () => {
      expect(REPORT_DEF_MAP[id]).toBeDefined();
    });
  }
});

// ─── buildCsvString ──────────────────────────────────────────────────────

describe('buildCsvString', () => {
  const columns: ReportColumn[] = [
    { key: 'name',  label: 'Name',  format: 'text'     },
    { key: 'price', label: 'Price', format: 'currency'  },
    { key: 'qty',   label: 'Qty',   format: 'integer'   },
  ];

  const rows = [
    { name: 'Coca Cola 20oz', price: 1.99, qty: 100 },
    { name: 'Pepsi 20oz',     price: 1.89, qty: 80  },
  ];

  it('returns a non-empty string', () => {
    const csv = buildCsvString(columns, rows);
    expect(typeof csv).toBe('string');
    expect(csv.length).toBeGreaterThan(0);
  });

  it('first line is the header row', () => {
    const csv    = buildCsvString(columns, rows);
    const header = csv.split('\n')[0];
    expect(header).toContain('Name');
    expect(header).toContain('Price');
    expect(header).toContain('Qty');
  });

  it('has correct number of data rows', () => {
    const csv   = buildCsvString(columns, rows);
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    // header + 2 data rows
    expect(lines.length).toBe(3);
  });

  it('wraps values containing commas in quotes', () => {
    const commaRows = [{ name: 'Cola, Diet', price: 1.99, qty: 50 }];
    const csv = buildCsvString(columns, commaRows);
    expect(csv).toContain('"Cola, Diet"');
  });

  it('handles null and undefined values gracefully', () => {
    const nullRows = [{ name: null, price: undefined, qty: 0 }];
    expect(() => buildCsvString(columns, nullRows as unknown as Record<string, unknown>[])).not.toThrow();
  });

  it('handles empty rows array', () => {
    const csv   = buildCsvString(columns, []);
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    expect(lines.length).toBe(1); // only header
  });
});

// ─── Column format display sanity ────────────────────────────────────────

describe('Currency and numeric columns are right-aligned', () => {
  it('currency columns have align right or are unspecified with right intent', () => {
    for (const def of REPORT_DEFINITIONS) {
      for (const col of def.columns) {
        if (col.format === 'currency' || col.format === 'percent' || col.format === 'integer') {
          const align = col.align ?? 'right'; // default should be right for numeric
          expect(['right', undefined]).toContain(col.align);
        }
      }
    }
  });
});
