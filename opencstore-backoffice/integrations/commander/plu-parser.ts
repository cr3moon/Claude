/**
 * plu-parser.ts
 *
 * Pure XML building/parsing for Commander's live PLU catalog command
 * (`vPLUs`), sent over the same POST /cgi-bin/NAXML lane already used for
 * fuel prices/totals — kept separate from CommanderNaxmlClient so it's
 * testable without a live connection.
 *
 * Field set and request shape are sourced second-hand (see
 * docs/commander-ruby-reports.md's sibling note on the Ruby report family
 * for the same caveat) from a different store's Commander unit, documented
 * by a sibling project (StoreDesk, github.com/cr3moon/StoreDesk). Unlike
 * this app's fuel price/totals commands, `vPLUs` has NOT been exercised
 * against this store's own unit yet.
 *
 * Known gap: unlike the XML *file* export this app already parses
 * (integrations/parsers/XmlPluParser.ts, which reads explicit Taxable/
 * AgeRestricted attributes), the documented live `vPLUs` response does not
 * expose those flags directly — only upc, upcModifier, description,
 * department (a sysid code, not a name), price, sellUnit, fees, pcode,
 * taxRates (sysids), taxableRebate, maxQtyPerTrans. `tax_flag` below is a
 * best-effort heuristic (non-empty taxRates); `age_restricted` and
 * `foodstamp_eligible` have no live signal at all and default to false —
 * verify those via Item Audit after a live sync, same as any import.
 */

import { XMLParser } from 'fast-xml-parser';

export interface CommanderPluRecord {
  upc: string;
  upcModifier: string;
  description: string;
  departmentSysid: string;
  price: number | undefined;
  sellUnit: number;
  hasTaxRates: boolean;
}

export interface PluPage {
  plus: CommanderPluRecord[];
  page: number;
  ofPages: number;
}

const NAXML_DOMAIN_NS = 'urn:vfi-sapphire:np.domain.2001-07-01';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'PLU' || name.endsWith(':PLU'),
  // Deliberately false: automatic numeric coercion on tag *values* strips
  // leading zeros from UPC codes (e.g. "0012345678905" -> 12345678905),
  // corrupting barcodes that need to match exactly. Every numeric field
  // this module reads (price, department sysid, SellUnit) is explicitly
  // Number(...)-cast in the mapping below, so nothing is lost by keeping
  // everything else a plain string.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

function toArray(v: unknown): Record<string, unknown>[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  return [v as Record<string, unknown>];
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Finds a namespace-prefixed root element (e.g. "domain:PLUs") by its local name. */
function findNamespaced(doc: Record<string, unknown>, localName: string): unknown {
  for (const key of Object.keys(doc)) {
    if (key === localName || key.endsWith(`:${localName}`)) return doc[key];
  }
  return undefined;
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

/**
 * Builds the `PLUSelect` request body for `vPLUs`. Pass `upc` for a single
 * targeted lookup (optionally with `modifier`); omit it to page through
 * the whole catalog with `pageSize`/`page`.
 */
export function buildPluSelectXml(opts: { upc?: string; modifier?: string; pageSize: number; page: number }): string {
  const wheres = opts.upc
    ? `<where kind="PLUNumber">${escapeXml(opts.upc)}</where>` +
      (opts.modifier !== undefined ? `<where kind="PLUModifier">${escapeXml(opts.modifier)}</where>` : '')
    : '';
  return (
    `<domain:PLUSelect xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:domain="${NAXML_DOMAIN_NS}">` +
    `${wheres}<pageSize>${opts.pageSize}</pageSize><page>${opts.page}</page></domain:PLUSelect>`
  );
}

/** Parses a `<domain:PLUs page="…" ofPages="…">` response into records. */
export function parsePluSelectResponse(xml: string): PluPage {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = findNamespaced(doc, 'PLUs') as Record<string, unknown> | undefined;
  const page = Number(root?.['@_page'] ?? 1);
  const ofPages = Number(root?.['@_ofPages'] ?? 1);
  const pluNodes = root ? findAllNamespaced(root, 'PLU') : [];

  const plus: CommanderPluRecord[] = pluNodes.map((p) => {
    const taxRates = toArray(p['taxRates']);
    return {
      upc: String(p['upc'] ?? '').trim(),
      upcModifier: String(p['upcModifier'] ?? '0').trim(),
      description: String(p['description'] ?? '').trim(),
      departmentSysid: String(p['department'] ?? '').trim(),
      price: p['price'] !== undefined && p['price'] !== null && p['price'] !== '' ? Number(p['price']) : undefined,
      sellUnit: p['SellUnit'] !== undefined ? Number(p['SellUnit']) : 1,
      hasTaxRates: taxRates.length > 0,
    };
  }).filter((p) => p.upc);

  return { plus, page: isNaN(page) ? 1 : page, ofPages: isNaN(ofPages) ? 1 : ofPages };
}
