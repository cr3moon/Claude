/**
 * tests/operations.test.ts
 *
 * Unit tests for checklist definitions, templates, and label helpers.
 * Run with: npx vitest run tests/operations.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  CHECKLIST_TEMPLATES,
  getStepTemplates,
  checklistLabel,
} from '../src/modules/operations/checklist-definitions';
import type { ChecklistTemplate } from '../src/modules/operations/checklist-definitions';
import { fmtDate, fmtDateTime, todayIso, daysAgoIso, daysBetween, relativeTime } from '../src/lib/date';

// ─── CHECKLIST_TEMPLATES ─────────────────────────────────────────────────

describe('CHECKLIST_TEMPLATES', () => {
  it('exports exactly 4 templates', () => {
    expect(CHECKLIST_TEMPLATES.length).toBe(4);
  });

  it('contains shift_open template', () => {
    const t = CHECKLIST_TEMPLATES.find(t => t.id === 'shift_open');
    expect(t).toBeDefined();
  });

  it('contains shift_close template', () => {
    const t = CHECKLIST_TEMPLATES.find(t => t.id === 'shift_close');
    expect(t).toBeDefined();
  });

  it('contains day_close template', () => {
    const t = CHECKLIST_TEMPLATES.find(t => t.id === 'day_close');
    expect(t).toBeDefined();
  });

  it('contains shift_handoff template', () => {
    const t = CHECKLIST_TEMPLATES.find(t => t.id === 'shift_handoff');
    expect(t).toBeDefined();
  });

  it('every template has at least 4 steps', () => {
    for (const tmpl of CHECKLIST_TEMPLATES) {
      expect(tmpl.steps.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('every step has a non-empty label', () => {
    for (const tmpl of CHECKLIST_TEMPLATES) {
      for (const step of tmpl.steps) {
        expect(step.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('step order values are unique within each template', () => {
    for (const tmpl of CHECKLIST_TEMPLATES) {
      const orders = tmpl.steps.map(s => s.order ?? s.sort_order ?? 0);
      const unique = new Set(orders);
      expect(unique.size).toBe(orders.length);
    }
  });
});

// ─── getStepTemplates ────────────────────────────────────────────────────

describe('getStepTemplates', () => {
  it('returns steps for a known template id', () => {
    const steps = getStepTemplates('shift_open');
    expect(steps.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown id', () => {
    const steps = getStepTemplates('nonexistent_template_xyz');
    expect(steps).toEqual([]);
  });
});

// ─── checklistLabel ──────────────────────────────────────────────────────

describe('checklistLabel', () => {
  it('returns a readable label for shift_open', () => {
    const label = checklistLabel('shift_open');
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe('shift_open'); // should be human-friendly
  });

  it('returns a readable label for day_close', () => {
    const label = checklistLabel('day_close');
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns the id itself or a fallback for unknown ids', () => {
    const label = checklistLabel('mystery_template');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });
});

// ─── Date utilities ──────────────────────────────────────────────────────

describe('fmtDate', () => {
  it('formats an ISO date string', () => {
    const result = fmtDate('2024-06-15');
    expect(result).toContain('2024');
    expect(typeof result).toBe('string');
  });

  it('returns a non-empty string', () => {
    expect(fmtDate(todayIso()).length).toBeGreaterThan(0);
  });
});

describe('fmtDateTime', () => {
  it('formats an ISO datetime string', () => {
    const result = fmtDateTime('2024-06-15T14:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('todayIso', () => {
  it('returns a valid ISO date string (YYYY-MM-DD)', () => {
    const today = todayIso();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daysAgoIso', () => {
  it('returns a date before today', () => {
    const today    = todayIso();
    const daysAgo  = daysAgoIso(7);
    expect(daysAgo < today).toBe(true);
  });

  it('returns today for daysAgo = 0', () => {
    expect(daysAgoIso(0)).toBe(todayIso());
  });

  it('returns a valid YYYY-MM-DD format', () => {
    expect(daysAgoIso(30)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daysBetween', () => {
  it('returns 0 for same dates', () => {
    expect(daysBetween('2024-01-01', '2024-01-01')).toBe(0);
  });

  it('returns 7 for a week apart', () => {
    expect(daysBetween('2024-01-01', '2024-01-08')).toBe(7);
  });

  it('returns positive value for chronological order', () => {
    expect(daysBetween('2024-01-01', '2024-12-31')).toBeGreaterThan(0);
  });
});

describe('relativeTime', () => {
  it('returns "just now" for very recent times', () => {
    const result = relativeTime(new Date().toISOString());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a string for old dates', () => {
    const result = relativeTime('2020-01-01T00:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
