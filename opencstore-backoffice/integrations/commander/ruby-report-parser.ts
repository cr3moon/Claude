/**
 * ruby-report-parser.ts
 *
 * Pure XML parsing for Commander's Ruby period-report family
 * (`vreportpdlist` / `vrubyrept`). Kept separate from CommanderNaxmlClient
 * so it's testable without a live connection or mocked HTTP.
 *
 * See docs/commander-ruby-reports.md: this shape is sourced second-hand
 * (a different store's Commander unit, documented by a sibling project)
 * and is NOT yet verified against this store's own unit. Parsing here is
 * deliberately tolerant — it scans for tag names anywhere under the
 * relevant section rather than assuming one fixed path — specifically
 * because of that uncertainty.
 */

import { XMLParser } from 'fast-xml-parser';

export interface CommanderReportPeriod {
  periodType: 1 | 2; // 1 = SHIFT, 2 = DAILY
  name: string;
  desc: string;
  filename: string;
  period: string;
}

export type RubyReportName = 'tax' | 'summary' | 'department' | 'network';

export interface RubyTaxCategory {
  category: string;
  taxableSales: number;
  netTax: number;
}

export interface RubyTaxReport {
  categories: RubyTaxCategory[];
}

export interface RubyTender {
  mop: string;
  amount: number;
}

export interface RubySummaryReport {
  /** The correct "Gas" KPI per StoreDesk's documented gotcha — prefer this
   *  over any outside-sales delta computed from T-Log totals. */
  fuelSales: number;
  outsideSalesDelta: number | null;
  tenders: RubyTender[];
}

export interface RubyDepartmentLine {
  name: string;
  netSales: number;
}

export interface RubyDepartmentReport {
  departments: RubyDepartmentLine[];
}

export interface RubyNetworkLine {
  network: string;
  amount: number;
}

export interface RubyNetworkReport {
  cards: RubyNetworkLine[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  // Same rationale as CommanderNaxmlClient's fuel-price parser: numeric
  // coercion on attribute values can corrupt names that look like exponent
  // notation. Keep it off for consistency and safety.
  parseAttributeValue: false,
  trimValues: true,
});

function toArray(v: unknown): Record<string, unknown>[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  return [v as Record<string, unknown>];
}

/** Recursively collects every element whose local (namespace-stripped) tag matches. */
function findAllNamespaced(node: unknown, localName: string, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) findAllNamespaced(item, localName, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const local = key.includes(':') ? key.split(':')[1] : key;
      if (local === localName) {
        if (Array.isArray(value)) out.push(...(value as Record<string, unknown>[]));
        else out.push(value as Record<string, unknown>);
      } else {
        findAllNamespaced(value, localName, out);
      }
    }
  }
  return out;
}

/** A field may parse as a bare number/string or as `{ '#text': value, ...attrs }` — unwrap either. */
function unwrapValue(v: unknown): number | string | undefined {
  if (v && typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>)['#text'] as number | string;
  }
  if (v && typeof v === 'object') return undefined;
  return v as number | string | undefined;
}

/** SHIFT/DAILY periods from `vreportpdlist`. Use `filename`/`period` verbatim in `vrubyrept` calls. */
export function parsePeriodList(xml: string): CommanderReportPeriod[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const periodInfos = findAllNamespaced(doc, 'periodInfo');

  return periodInfos.map((p) => {
    const periodTag = findAllNamespaced(p, 'period')[0] as Record<string, unknown> | undefined;
    const periodType = Number(periodTag?.['@_sysid'] ?? 0) === 1 ? 1 : 2;
    const params = toArray(p['reportParameter']);
    const findParam = (name: string) => params.find((pp) => pp['@_name'] === name);
    const filenameParam = findParam('filename');
    const periodParam = findParam('period');
    return {
      periodType: periodType as 1 | 2,
      name: String(p['name'] ?? '').trim(),
      desc: String(p['desc'] ?? '').trim(),
      filename: String(filenameParam?.['#text'] ?? filenameParam ?? p['name'] ?? ''),
      period: String(periodParam?.['#text'] ?? periodParam ?? periodType),
    };
  });
}

/** HIGH TAX / LOW TAX taxable-sales + tax-collected, from the period's first `<totals>` block. */
export function parseRubyTax(xml: string): RubyTaxReport {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const totalsBlocks = findAllNamespaced(doc, 'totals');
  const first = totalsBlocks[0] as Record<string, unknown> | undefined;
  const taxInfos = first ? toArray(first['taxInfo']) : [];

  const categories: RubyTaxCategory[] = taxInfos
    .map((t) => ({
      category: String(t['@_cat'] ?? t['cat'] ?? '').trim(),
      taxableSales: Number(unwrapValue(t['taxableSales']) ?? 0),
      netTax: Number(unwrapValue(t['netTax']) ?? 0),
    }))
    .filter((c) => c.category);

  return { categories };
}

/** Gas KPI (`fuelSales`), tender mix, and the secondary outside-sales delta. */
export function parseRubySummary(xml: string): RubySummaryReport {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const summaryInfo = findAllNamespaced(doc, 'summaryInfo')[0] as Record<string, unknown> | undefined;
  const fuelSales = Number(unwrapValue(summaryInfo?.['fuelSales']) ?? NaN);

  const difference = findAllNamespaced(doc, 'difference')[0] as Record<string, unknown> | undefined;
  const outsideRaw = difference ? Number(unwrapValue(difference['outsideSales']) ?? NaN) : NaN;

  const mopNodes = findAllNamespaced(doc, 'mop');
  const tenders: RubyTender[] = mopNodes
    .map((m) => ({
      mop: String(m['@_type'] ?? m['type'] ?? '').trim(),
      amount: Number(unwrapValue(m) ?? 0),
    }))
    .filter((t) => t.mop);

  return {
    fuelSales: isNaN(fuelSales) ? 0 : fuelSales,
    outsideSalesDelta: isNaN(outsideRaw) ? null : outsideRaw,
    tenders,
  };
}

/** Net sales per department, from `deptInfo`/`vs:deptBase` pairs. */
export function parseRubyDepartment(xml: string): RubyDepartmentReport {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const deptInfos = findAllNamespaced(doc, 'deptInfo');

  const departments: RubyDepartmentLine[] = deptInfos
    .map((d) => {
      const base = findAllNamespaced(d, 'deptBase')[0] as Record<string, unknown> | undefined;
      return {
        name: String(base?.['@_name'] ?? base?.['name'] ?? '').trim(),
        netSales: Number(unwrapValue(d['netSales']) ?? 0),
      };
    })
    .filter((d) => d.name);

  return { departments };
}

/** Card-network charge totals for the period. */
export function parseRubyNetwork(xml: string): RubyNetworkReport {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const cardInfos = findAllNamespaced(doc, 'cardInfo');

  const cards: RubyNetworkLine[] = cardInfos
    .map((c) => ({
      network: String(c['@_name'] ?? c['name'] ?? '').trim(),
      amount: Number(unwrapValue(c['amount'] ?? c) ?? 0),
    }))
    .filter((c) => c.network);

  return { cards };
}
