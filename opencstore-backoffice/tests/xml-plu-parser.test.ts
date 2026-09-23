/**
 * tests/xml-plu-parser.test.ts
 *
 * Regression coverage for XmlPluParser against the real sample file.
 * Department/Category names and Item tax/age-restriction flags are all
 * XML *attributes* in this format (e.g. `<Department id="1" Name="TOBACCO"
 * Taxable="true" AgeRestricted="true" />`), which fast-xml-parser exposes
 * under the `@_`-prefixed key, not the bare name — a parser that reads
 * `d['Name']` instead of `d['@_Name']` gets `undefined` for every one of
 * them. That bug shipped silently because it fails soft: names come back
 * empty, ImportService's "skip if no name" check discards the row instead
 * of erroring, and no department/category ever gets created — 12
 * departments and 20 categories, gone, with only the plain item count
 * surviving. Item tax_flag/age_restricted have the same bug but fail even
 * quieter: they just default to false instead of being discarded, so an
 * imported tobacco item silently loses its age-restriction flag.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { XmlPluParser } from '../integrations/parsers/XmlPluParser';

const SAMPLE_PATH = path.join(__dirname, '..', 'sample-data', 'mock-plu.xml');

describe('XmlPluParser against the real sample file', () => {
  const xml = fs.readFileSync(SAMPLE_PATH, 'utf-8');
  const parser = new XmlPluParser();
  const result = parser.parse(xml);

  it('parses all 12 departments with real names, not blank', () => {
    expect(result.departments).toHaveLength(12);
    expect(result.departments!.every(d => d.name.length > 0)).toBe(true);
    expect(result.departments!.map(d => d.name)).toContain('TOBACCO');
    expect(result.departments!.map(d => d.name)).toContain('FUEL');
  });

  it('reads department tax/age/fuel flags from their attributes correctly', () => {
    const tobacco = result.departments!.find(d => d.name === 'TOBACCO')!;
    expect(tobacco.tax_flag).toBe(true);
    expect(tobacco.age_restricted).toBe(true);
    expect(tobacco.is_fuel).toBe(false);

    const fuel = result.departments!.find(d => d.name === 'FUEL')!;
    expect(fuel.is_fuel).toBe(true);

    const grocery = result.departments!.find(d => d.name === 'GROCERY')!;
    expect(grocery.tax_flag).toBe(false);
    expect(grocery.age_restricted).toBe(false);
  });

  it('parses categories with real names, not blank', () => {
    expect(result.categories!.length).toBeGreaterThan(0);
    expect(result.categories!.every(c => c.name.length > 0)).toBe(true);
    expect(result.categories!.map(c => c.name)).toContain('CIGARETTES');
  });

  it('reads item tax_flag/age_restricted from their attributes, not always false', () => {
    const marlboro = result.items!.find(i => i.pos_plu_id === '1001')!;
    expect(marlboro.description).toBe('MARLBORO REDS KS 20CT');
    expect(marlboro.tax_flag).toBe(true);
    expect(marlboro.age_restricted).toBe(true);
  });

  it('does not mark every item age-restricted (the flag actually varies)', () => {
    const notAllRestricted = result.items!.some(i => i.age_restricted === false);
    expect(notAllRestricted).toBe(true);
  });
});
