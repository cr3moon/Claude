/**
 * src/modules/reconciliation/reconciliation-rules.ts
 *
 * Pure logic for comparing manually-entered sales/shift figures against a
 * Commander Ruby report snapshot for the same period. Kept separate from
 * ReconciliationService so the matching/variance math is testable without
 * a database or a live connection.
 */

import type { CommanderReportPeriod } from '../../../integrations/commander/ruby-report-parser';

export interface LabeledValue {
  label: string;
  value: number;
}

export interface VarianceRow {
  label: string;
  manual: number;
  commander: number;
  /** commander − manual. Positive means Commander reported more than was manually entered. */
  variance: number;
}

function normalizeLabel(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Pairs manual and Commander-reported values by a case-insensitive/trimmed
 * label match (department name, tender type, etc.) and computes the
 * variance for each. Entries present on only one side still appear, with
 * the missing side reported as 0 — a manual entry with no Commander match
 * is exactly as informative as a Commander line with no manual entry.
 */
export function buildVarianceRows(manual: LabeledValue[], commander: LabeledValue[]): VarianceRow[] {
  const commanderByKey = new Map(commander.map((c) => [normalizeLabel(c.label), c]));
  const seen = new Set<string>();
  const rows: VarianceRow[] = [];

  for (const m of manual) {
    const key = normalizeLabel(m.label);
    seen.add(key);
    const c = commanderByKey.get(key);
    rows.push({ label: m.label, manual: m.value, commander: c?.value ?? 0, variance: (c?.value ?? 0) - m.value });
  }
  for (const c of commander) {
    const key = normalizeLabel(c.label);
    if (seen.has(key)) continue;
    rows.push({ label: c.label, manual: 0, commander: c.value, variance: c.value });
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Finds the Commander period(s) of the given type covering a business
 * date: closed periods whose filename starts with that date
 * (`YYYY-MM-DD.NNN`), or — only when the date is today and no closed
 * period matches yet — the still-open `current` period. DAILY periods
 * normally resolve to at most one match; SHIFT periods may resolve to
 * several.
 */
export function findPeriodsForDate(
  periods: CommanderReportPeriod[],
  periodType: 1 | 2,
  dateIso: string,
  todayIso: string
): CommanderReportPeriod[] {
  const closed = periods.filter(
    (p) => p.periodType === periodType && p.filename !== 'current' && p.filename.startsWith(dateIso)
  );
  if (closed.length > 0) return closed;

  if (dateIso === todayIso) {
    const current = periods.find((p) => p.periodType === periodType && p.filename === 'current');
    return current ? [current] : [];
  }

  return [];
}
