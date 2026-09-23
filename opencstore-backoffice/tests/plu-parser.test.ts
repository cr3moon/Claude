/**
 * tests/plu-parser.test.ts
 *
 * Fixtures below are hand-built to match the field names documented in
 * plu-parser.ts's doc comment (sourced second-hand from a different
 * store's Commander unit via a sibling project), not captured from this
 * store's own unit.
 */

import { describe, it, expect } from 'vitest';
import { buildPluSelectXml, parsePluSelectResponse } from '../integrations/commander/plu-parser';

describe('buildPluSelectXml', () => {
  it('builds a browse request with just pageSize/page', () => {
    const xml = buildPluSelectXml({ pageSize: 50, page: 2 });
    expect(xml).toContain('<pageSize>50</pageSize>');
    expect(xml).toContain('<page>2</page>');
    expect(xml).not.toContain('<where');
  });

  it('builds a targeted UPC lookup with where clauses', () => {
    const xml = buildPluSelectXml({ upc: '8037', modifier: '0', pageSize: 1, page: 1 });
    expect(xml).toContain('<where kind="PLUNumber">8037</where>');
    expect(xml).toContain('<where kind="PLUModifier">0</where>');
  });

  it('escapes XML-significant characters in the UPC', () => {
    const xml = buildPluSelectXml({ upc: '<bad>&"', pageSize: 1, page: 1 });
    expect(xml).not.toContain('<bad>');
    expect(xml).toContain('&lt;bad&gt;&amp;&quot;');
  });
});

describe('parsePluSelectResponse', () => {
  const xml = `<?xml version="1.0"?>
    <domain:PLUs xmlns:domain="urn:vfi-sapphire:np.domain.2001-07-01" page="1" ofPages="3">
      <domain:PLU>
        <upc>0012345678905</upc>
        <upcModifier>000</upcModifier>
        <description>MARLBORO REDS KS 20CT</description>
        <department>10</department>
        <price>9.49</price>
        <SellUnit>1</SellUnit>
        <fees><fee>0</fee></fees>
        <pcode>0</pcode>
        <taxRates><domain:taxRate sysid="1"/></taxRates>
      </domain:PLU>
      <domain:PLU>
        <upc>0049000006344</upc>
        <upcModifier>000</upcModifier>
        <description>COCA COLA 20OZ PET</description>
        <department>3</department>
        <price>2.19</price>
        <SellUnit>1</SellUnit>
        <fees><fee>0</fee></fees>
        <pcode>0</pcode>
      </domain:PLU>
    </domain:PLUs>`;

  it('parses the page/ofPages attributes', () => {
    const result = parsePluSelectResponse(xml);
    expect(result.page).toBe(1);
    expect(result.ofPages).toBe(3);
  });

  it('parses each PLU record', () => {
    const result = parsePluSelectResponse(xml);
    expect(result.plus).toHaveLength(2);

    const marlboro = result.plus[0];
    expect(marlboro.upc).toBe('0012345678905');
    expect(marlboro.description).toBe('MARLBORO REDS KS 20CT');
    expect(marlboro.departmentSysid).toBe('10');
    expect(marlboro.price).toBeCloseTo(9.49);
    expect(marlboro.sellUnit).toBe(1);
  });

  it('flags hasTaxRates from a non-empty taxRates block, not just its presence', () => {
    const result = parsePluSelectResponse(xml);
    expect(result.plus[0].hasTaxRates).toBe(true);   // has a taxRate entry
    expect(result.plus[1].hasTaxRates).toBe(false);  // no taxRates element at all
  });

  it('defaults upcModifier to "0" and sellUnit to 1 when absent', () => {
    const minimal = `<?xml version="1.0"?>
      <domain:PLUs xmlns:domain="urn:vfi-sapphire:np.domain.2001-07-01" page="1" ofPages="1">
        <domain:PLU>
          <upc>123</upc>
          <description>Bare item</description>
          <department>1</department>
        </domain:PLU>
      </domain:PLUs>`;
    const result = parsePluSelectResponse(minimal);
    expect(result.plus[0].upcModifier).toBe('0');
    expect(result.plus[0].sellUnit).toBe(1);
    expect(result.plus[0].price).toBeUndefined();
  });

  it('drops PLU nodes with no UPC rather than surfacing a broken row', () => {
    const noUpc = `<?xml version="1.0"?>
      <domain:PLUs xmlns:domain="urn:vfi-sapphire:np.domain.2001-07-01" page="1" ofPages="1">
        <domain:PLU>
          <description>Missing UPC</description>
        </domain:PLU>
      </domain:PLUs>`;
    expect(parsePluSelectResponse(noUpc).plus).toHaveLength(0);
  });

  it('handles an empty page (zero PLU nodes) without throwing', () => {
    const empty = `<?xml version="1.0"?>
      <domain:PLUs xmlns:domain="urn:vfi-sapphire:np.domain.2001-07-01" page="1" ofPages="1"></domain:PLUs>`;
    expect(parsePluSelectResponse(empty).plus).toEqual([]);
  });
});
