/**
 * t-log-parser.ts
 *
 * Pure XML parsing for Commander's closed daily/shift transaction set
 * (`vtransset`) — the full per-ticket T-Log, as opposed to the
 * pre-aggregated Ruby period reports (ruby-report-parser.ts) or the PLU
 * catalog (plu-parser.ts). Kept separate from CommanderNaxmlClient so it's
 * testable without a live connection.
 *
 * Sourced second-hand from a different store's Commander unit (see
 * docs/commander-ruby-reports.md's caveat, which applies here too) via a
 * sibling project. This is the least-verified surface in this codebase —
 * a multi-MB envelope with thousands of mixed-type events per day. Only
 * `sale`/`network sale` tickets are parsed into structured records; voids
 * are counted but not itemized, and `journal`/cashier events are ignored
 * entirely (audit-trail noise, not sales data, per the source project's
 * own notes).
 *
 * Documented gotchas this parser follows:
 *  - A ticket's tax fields (`taxAmt`/`taxNet`) should be summed only over
 *    sale/network-sale tickets that do NOT contain a `preFuel` line (a
 *    fuel prepay deposit, not a real sale) and never over voids — see
 *    computeTaxSummary(). Summing everything overstates the total.
 *  - `taxAmt`/`taxNet` are used exactly as Commander wrote them — never
 *    sign-flipped.
 */

import { XMLParser } from 'fast-xml-parser';

export interface TicketTender {
  mop: string;
  amount: number;
}

export interface TicketLine {
  type: string; // 'plu' | 'postFuel' | 'preFuel' | 'dept' | 'void plu'
  description: string;
  department: string | null;
  quantity: number;
  lineTotal: number;
  upc: string | null;
  isFuel: boolean;
}

export interface TaxCategoryAmount {
  category: string;
  taxableSales: number;
  taxCollected: number;
}

export interface TicketRecord {
  /** Commander's trUniqueSN — stable across re-fetches of the same closed period; used as the dedupe key. */
  uniqueId: string;
  type: 'sale' | 'network sale';
  ticketNumber: string | null;
  registerNumber: string | null;
  date: string | null;
  totalNoTax: number;
  totalWithTax: number;
  totalTax: number;
  taxByCategory: TaxCategoryAmount[];
  hasPreFuel: boolean;
  tenders: TicketTender[];
  lines: TicketLine[];
}

export interface PeriodTotals {
  insideSales: number;
  outsideSales: number;
  overallSales: number;
}

export interface TransSetSummary {
  periodId: string;
  periodName: string; // 'DAILY' | 'SHIFT'
  longId: string;      // business date, e.g. '2026-07-17'
  shortId: string;      // Commander's own sequence number
  openedTime: string | null;
  closedTime: string | null;
  startTotals: PeriodTotals;
  endTotals: PeriodTotals;
  tickets: TicketRecord[];
  voidCount: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['trans', 'trLine', 'trPayline', 'taxAmt', 'taxNet', 'taxRate'].includes(name),
  // Same rationale as plu-parser.ts: keep tag values as plain strings so
  // nothing with meaningful leading zeros (ticket numbers, register ids)
  // gets silently corrupted. Every numeric field is explicitly Number()-cast below.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function toArray(v: unknown): Record<string, unknown>[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  return [v as Record<string, unknown>];
}

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function parseTotals(node: Record<string, unknown> | undefined): PeriodTotals {
  return {
    insideSales: num(node?.['insideSales']),
    outsideSales: num(node?.['outsideSales']),
    overallSales: num(node?.['overallSales']),
  };
}

function parseTicket(trans: Record<string, unknown>): TicketRecord {
  const type = String(trans['@_type'] ?? '') as 'sale' | 'network sale';
  const trValue = (trans['trValue'] ?? {}) as Record<string, unknown>;
  const trTax = (trValue['trTax'] ?? {}) as Record<string, unknown>;
  const taxAmts = (trTax['taxAmts'] ?? {}) as Record<string, unknown>;

  const taxAmtNodes = toArray(taxAmts['taxAmt']);
  const taxNetNodes = toArray(taxAmts['taxNet']);
  const categories = new Map<string, TaxCategoryAmount>();
  for (const n of taxAmtNodes) {
    const cat = String(n['@_cat'] ?? '').trim();
    if (!cat) continue;
    categories.set(cat, { category: cat, taxableSales: num(n['#text'] ?? n), taxCollected: 0 });
  }
  for (const n of taxNetNodes) {
    const cat = String(n['@_cat'] ?? '').trim();
    if (!cat) continue;
    const existing = categories.get(cat) ?? { category: cat, taxableSales: 0, taxCollected: 0 };
    existing.taxCollected = num(n['#text'] ?? n);
    categories.set(cat, existing);
  }

  const trLines = toArray(trans['trLines'] ? (trans['trLines'] as Record<string, unknown>)['trLine'] : trans['trLine']);
  const lines: TicketLine[] = trLines.map((l) => ({
    type: String(l['@_type'] ?? '').trim(),
    description: String(l['trlDesc'] ?? '').trim(),
    department: l['trlDept'] !== undefined ? String(l['trlDept']).trim() : null,
    quantity: num(l['trlQty'] ?? 1),
    lineTotal: num(l['trlLineTot']),
    upc: l['trlUPC'] !== undefined ? String(l['trlUPC']).trim() : null,
    isFuel: String(l['@_type'] ?? '') === 'postFuel' || String(l['@_type'] ?? '') === 'preFuel',
  }));

  const paylineWrap = (trans['trPaylines'] ?? {}) as Record<string, unknown>;
  const paylines = toArray(paylineWrap['trPayline']);
  const tenders: TicketTender[] = paylines
    .map((p) => {
      const paycode = (p['trpPaycode'] ?? {}) as Record<string, unknown>;
      return { mop: String(paycode['@_mop'] ?? paycode['#text'] ?? '').trim(), amount: num(p['trpAmt']) };
    })
    .filter((t) => t.mop);

  return {
    uniqueId: String(trans['trUniqueSN'] ?? trans['trSeq'] ?? '').trim(),
    type: type === 'network sale' ? 'network sale' : 'sale',
    ticketNumber: trans['trTickNum'] !== undefined ? String(trans['trTickNum']).trim() : null,
    registerNumber: trans['posNum'] !== undefined ? String(trans['posNum']).trim() : null,
    date: trans['date'] !== undefined ? String(trans['date']).trim() : null,
    totalNoTax: num(trValue['trTotNoTax']),
    totalWithTax: num(trValue['trTotWTax']),
    totalTax: num(trValue['trTotTax']),
    taxByCategory: [...categories.values()],
    hasPreFuel: lines.some((l) => l.type === 'preFuel'),
    tenders,
    lines,
  };
}

export function parseTransSet(xml: string): TransSetSummary {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc['transSet'] ?? {}) as Record<string, unknown>;

  const transNodes = toArray(root['trans']);
  const tickets: TicketRecord[] = [];
  let voidCount = 0;

  for (const trans of transNodes) {
    const type = String(trans['@_type'] ?? '');
    if (type === 'sale' || type === 'network sale') {
      tickets.push(parseTicket(trans));
    } else if (type === 'void') {
      voidCount += 1;
    }
  }

  return {
    periodId: String(root['@_periodID'] ?? '').trim(),
    periodName: String(root['@_periodname'] ?? '').trim(),
    longId: String(root['@_longId'] ?? '').trim(),
    shortId: String(root['@_shortId'] ?? '').trim(),
    openedTime: root['openedTime'] !== undefined ? String(root['openedTime']).trim() : null,
    closedTime: root['closedTime'] !== undefined ? String(root['closedTime']).trim() : null,
    startTotals: parseTotals(root['startTotals'] as Record<string, unknown> | undefined),
    endTotals: parseTotals(root['endTotals'] as Record<string, unknown> | undefined),
    tickets,
    voidCount,
  };
}

/**
 * Sums tax by category across the period's real sales — excluding voids
 * (never included as tickets in the first place, see parseTransSet) and
 * excluding any ticket with a `preFuel` line (a prepay deposit, not a
 * completed sale). This is the documented print-matching rule; summing
 * every ticket overstates the total.
 */
export function computeTaxSummary(tickets: TicketRecord[]): TaxCategoryAmount[] {
  const totals = new Map<string, TaxCategoryAmount>();
  for (const ticket of tickets) {
    if (ticket.hasPreFuel) continue;
    for (const cat of ticket.taxByCategory) {
      const existing = totals.get(cat.category) ?? { category: cat.category, taxableSales: 0, taxCollected: 0 };
      existing.taxableSales += cat.taxableSales;
      existing.taxCollected += cat.taxCollected;
      totals.set(cat.category, existing);
    }
  }
  return [...totals.values()];
}

/** endTotals − startTotals, the period's sales delta (grand totalizers, not a simple "ring sales only" figure). */
export function computePeriodDelta(start: PeriodTotals, end: PeriodTotals): PeriodTotals {
  return {
    insideSales: end.insideSales - start.insideSales,
    outsideSales: end.outsideSales - start.outsideSales,
    overallSales: end.overallSales - start.overallSales,
  };
}
