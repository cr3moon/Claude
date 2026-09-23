/**
 * tests/t-log-parser.test.ts
 *
 * Fixtures below are hand-built to match the field names and documented
 * gotchas in t-log-parser.ts's doc comment (sourced second-hand from a
 * different store's Commander unit via a sibling project), not captured
 * from this store's own unit. These tests guard the parser's tag-scanning
 * logic and the tax-summary exclusion rule against that documented shape.
 */

import { describe, it, expect } from 'vitest';
import { parseTransSet, computeTaxSummary, computePeriodDelta } from '../integrations/commander/t-log-parser';

const SAMPLE_TRANSSET = `<?xml version="1.0"?>
<transSet periodID="2" periodname="DAILY" longId="2026-07-17" shortId="312" site="0508">
  <openedTime>2026-07-16T02:05:06-04:00</openedTime>
  <closedTime>2026-07-17T02:05:06-04:00</closedTime>
  <startTotals>
    <insideSales>1000.00</insideSales>
    <outsideSales>500.00</outsideSales>
    <overallSales>1500.00</overallSales>
  </startTotals>

  <trans type="sale" recalled="false">
    <trTickNum>101</trTickNum>
    <posNum>1</posNum>
    <trUniqueSN>SN-1001</trUniqueSN>
    <date>2026-07-16T10:00:00-04:00</date>
    <trValue>
      <trTotNoTax>10.00</trTotNoTax>
      <trTotWTax>10.70</trTotWTax>
      <trTotTax>0.70</trTotTax>
      <trTax>
        <taxAmts>
          <taxAmt cat="HIGH TAX">10.00</taxAmt>
          <taxRate cat="HIGH TAX">7.000</taxRate>
          <taxNet cat="HIGH TAX">0.70</taxNet>
        </taxAmts>
      </trTax>
    </trValue>
    <trLines>
      <trLine type="plu">
        <trlDept>10</trlDept>
        <trlQty>1</trlQty>
        <trlLineTot>10.00</trlLineTot>
        <trlDesc>MARLBORO REDS KS 20CT</trlDesc>
        <trlUPC>0012345678905</trlUPC>
      </trLine>
    </trLines>
    <trPaylines>
      <trPayline type="sale">
        <trpPaycode mop="CASH">CASH</trpPaycode>
        <trpAmt>10.70</trpAmt>
      </trPayline>
    </trPaylines>
  </trans>

  <trans type="network sale" recalled="false">
    <trTickNum>102</trTickNum>
    <posNum>1</posNum>
    <trUniqueSN>SN-1002</trUniqueSN>
    <date>2026-07-16T11:00:00-04:00</date>
    <trValue>
      <trTotNoTax>30.00</trTotNoTax>
      <trTotWTax>30.00</trTotWTax>
      <trTotTax>0.00</trTotTax>
      <trTax>
        <taxAmts>
          <taxAmt cat="HIGH TAX">30.00</taxAmt>
          <taxNet cat="HIGH TAX">2.10</taxNet>
        </taxAmts>
      </trTax>
    </trValue>
    <trLines>
      <trLine type="preFuel">
        <trlDept>9999</trlDept>
        <trlQty>1</trlQty>
        <trlLineTot>30.00</trlLineTot>
        <trlDesc>FUEL DEPOSIT</trlDesc>
      </trLine>
    </trLines>
    <trPaylines>
      <trPayline type="sale">
        <trpPaycode mop="CREDIT">CREDIT</trpPaycode>
        <trpAmt>30.00</trpAmt>
      </trPayline>
    </trPaylines>
  </trans>

  <trans type="void" recalled="false">
    <trTickNum>103</trTickNum>
    <trUniqueSN>SN-1003</trUniqueSN>
  </trans>

  <trans type="journal" recalled="false">
    <trJournal>
      <trjText type="LOGIN/LOGOUT">Cashier login</trjText>
    </trJournal>
  </trans>

  <endTotals>
    <insideSales>1250.00</insideSales>
    <outsideSales>750.00</outsideSales>
    <overallSales>2000.00</overallSales>
  </endTotals>
</transSet>`;

describe('parseTransSet', () => {
  it('parses the envelope fields', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    expect(result.periodId).toBe('2');
    expect(result.periodName).toBe('DAILY');
    expect(result.longId).toBe('2026-07-17');
    expect(result.shortId).toBe('312');
    expect(result.openedTime).toBe('2026-07-16T02:05:06-04:00');
    expect(result.closedTime).toBe('2026-07-17T02:05:06-04:00');
  });

  it('parses start/end totals', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    expect(result.startTotals).toEqual({ insideSales: 1000, outsideSales: 500, overallSales: 1500 });
    expect(result.endTotals).toEqual({ insideSales: 1250, outsideSales: 750, overallSales: 2000 });
  });

  it('parses sale and network sale into ticket records, in document order', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    expect(result.tickets).toHaveLength(2);
    expect(result.tickets[0].type).toBe('sale');
    expect(result.tickets[0].uniqueId).toBe('SN-1001');
    expect(result.tickets[1].type).toBe('network sale');
    expect(result.tickets[1].uniqueId).toBe('SN-1002');
  });

  it('counts voids without including them as tickets', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    expect(result.voidCount).toBe(1);
    expect(result.tickets.some((t) => t.uniqueId === 'SN-1003')).toBe(false);
  });

  it('ignores journal events entirely', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    expect(result.tickets).toHaveLength(2);
    expect(result.voidCount).toBe(1);
    // journal contributed neither a ticket nor a void
  });

  it('parses ticket lines with department, quantity, total, and UPC', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    const line = result.tickets[0].lines[0];
    expect(line.type).toBe('plu');
    expect(line.department).toBe('10');
    expect(line.quantity).toBe(1);
    expect(line.lineTotal).toBeCloseTo(10.0);
    expect(line.upc).toBe('0012345678905'); // leading zero preserved
  });

  it('flags a ticket with a preFuel line via hasPreFuel', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    expect(result.tickets[0].hasPreFuel).toBe(false);
    expect(result.tickets[1].hasPreFuel).toBe(true);
  });

  it('parses tender mop and amount from trPaylines', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    expect(result.tickets[0].tenders).toEqual([{ mop: 'CASH', amount: 10.70 }]);
    expect(result.tickets[1].tenders).toEqual([{ mop: 'CREDIT', amount: 30.00 }]);
  });

  it('parses per-category tax amounts on the ticket', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    const cat = result.tickets[0].taxByCategory.find((c) => c.category === 'HIGH TAX');
    expect(cat?.taxableSales).toBeCloseTo(10.0);
    expect(cat?.taxCollected).toBeCloseTo(0.70);
  });
});

describe('computeTaxSummary', () => {
  it('excludes tickets with a preFuel line from the tax sum', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    const summary = computeTaxSummary(result.tickets);
    const highTax = summary.find((c) => c.category === 'HIGH TAX')!;
    // Only ticket 1 (no preFuel) should count: 10.00 taxable / 0.70 collected.
    // Ticket 2's 30.00/2.10 must NOT be included, per the documented gotcha.
    expect(highTax.taxableSales).toBeCloseTo(10.0);
    expect(highTax.taxCollected).toBeCloseTo(0.70);
  });

  it('never includes voids (they were never converted into tickets)', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    expect(result.tickets.every((t) => t.uniqueId !== 'SN-1003')).toBe(true);
  });

  it('returns an empty summary for no tickets', () => {
    expect(computeTaxSummary([])).toEqual([]);
  });
});

describe('computePeriodDelta', () => {
  it('computes the endTotals minus startTotals delta', () => {
    const result = parseTransSet(SAMPLE_TRANSSET);
    const delta = computePeriodDelta(result.startTotals, result.endTotals);
    expect(delta).toEqual({ insideSales: 250, outsideSales: 250, overallSales: 500 });
  });
});
