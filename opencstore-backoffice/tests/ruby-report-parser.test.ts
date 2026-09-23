/**
 * tests/ruby-report-parser.test.ts
 *
 * Fixtures below are hand-built to match the field names and example
 * values documented in docs/commander-ruby-reports.md (sourced from a
 * different store's Commander unit via a sibling project) — they are NOT
 * captured from this store's own unit. These tests guard the parser's
 * tolerant tag-scanning logic against the documented shape; they do not
 * prove the shape itself is correct for our hardware. See that doc's
 * "Verification needed" section.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePeriodList, parseRubyTax, parseRubySummary, parseRubyDepartment, parseRubyNetwork,
} from '../integrations/commander/ruby-report-parser';

describe('parsePeriodList (vreportpdlist)', () => {
  const xml = `<?xml version="1.0"?>
    <pd:periodList xmlns:pd="urn:vfi-sapphire:pd.2001-10-01" xmlns:vs="urn:vfi-sapphire:vs.2001-10-01">
      <periodInfo>
        <vs:period sysid="2"/>
        <name>2026-07-17.312</name>
        <desc>2026-07-17 (DAILY-312)</desc>
        <reportParameter name="filename">2026-07-17.312</reportParameter>
        <reportParameter name="period">2</reportParameter>
      </periodInfo>
      <periodInfo>
        <vs:period sysid="1"/>
        <name>2026-07-17.392</name>
        <desc>2026-07-17 (SHIFT-392)</desc>
        <reportParameter name="filename">2026-07-17.392</reportParameter>
        <reportParameter name="period">1</reportParameter>
      </periodInfo>
      <periodInfo>
        <vs:period sysid="2"/>
        <name>current</name>
        <desc>Current DAILY</desc>
        <reportParameter name="filename">current</reportParameter>
        <reportParameter name="period">2</reportParameter>
      </periodInfo>
    </pd:periodList>`;

  it('parses SHIFT and DAILY periods with their report parameters', () => {
    const periods = parsePeriodList(xml);
    expect(periods).toHaveLength(3);

    const daily = periods.find(p => p.name === '2026-07-17.312')!;
    expect(daily.periodType).toBe(2);
    expect(daily.filename).toBe('2026-07-17.312');
    expect(daily.period).toBe('2');

    const shift = periods.find(p => p.name === '2026-07-17.392')!;
    expect(shift.periodType).toBe(1);
    expect(shift.filename).toBe('2026-07-17.392');
  });

  it('includes the current (still-open) daily period', () => {
    const periods = parsePeriodList(xml);
    const current = periods.find(p => p.name === 'current')!;
    expect(current).toBeDefined();
    expect(current.filename).toBe('current');
    expect(current.periodType).toBe(2);
  });
});

describe('parseRubyTax (reptname=tax)', () => {
  const xml = `<?xml version="1.0"?>
    <pd:taxPd xmlns:pd="urn:vfi-sapphire:pd.2001-10-01">
      <totals>
        <taxInfo cat="HIGH TAX">
          <taxableSales>959.66</taxableSales>
          <netTax>67.19</netTax>
        </taxInfo>
        <taxInfo cat="LOW TAX">
          <taxableSales>842.15</taxableSales>
          <netTax>25.30</netTax>
        </taxInfo>
      </totals>
      <byCashier>
        <totals>
          <taxInfo cat="HIGH TAX">
            <taxableSales>0.00</taxableSales>
            <netTax>0.00</netTax>
          </taxInfo>
        </totals>
      </byCashier>
    </pd:taxPd>`;

  it('parses HIGH/LOW TAX taxable sales and net tax from the first totals block', () => {
    const report = parseRubyTax(xml);
    expect(report.categories).toHaveLength(2);

    const high = report.categories.find(c => c.category === 'HIGH TAX')!;
    expect(high.taxableSales).toBeCloseTo(959.66);
    expect(high.netTax).toBeCloseTo(67.19);

    const low = report.categories.find(c => c.category === 'LOW TAX')!;
    expect(low.taxableSales).toBeCloseTo(842.15);
    expect(low.netTax).toBeCloseTo(25.30);
  });
});

describe('parseRubySummary (reptname=summary)', () => {
  const xml = `<?xml version="1.0"?>
    <pd:summaryPd xmlns:pd="urn:vfi-sapphire:pd.2001-10-01">
      <summaryInfo>
        <fuelSales>6817.91</fuelSales>
      </summaryInfo>
      <difference>
        <outsideSales>5068.62</outsideSales>
      </difference>
      <mopInfo>
        <mop type="CREDIT">4346.34</mop>
        <mop type="CASH">7186.76</mop>
        <mop type="DEBIT">8270.87</mop>
      </mopInfo>
    </pd:summaryPd>`;

  it('prefers fuelSales as the Gas KPI, distinct from the outside-sales delta', () => {
    const report = parseRubySummary(xml);
    expect(report.fuelSales).toBeCloseTo(6817.91);
    expect(report.outsideSalesDelta).toBeCloseTo(5068.62);
    expect(report.fuelSales).not.toBeCloseTo(report.outsideSalesDelta!);
  });

  it('parses the CASH/CREDIT/DEBIT tender mix', () => {
    const report = parseRubySummary(xml);
    expect(report.tenders).toHaveLength(3);
    expect(report.tenders.find(t => t.mop === 'CASH')?.amount).toBeCloseTo(7186.76);
    expect(report.tenders.find(t => t.mop === 'CREDIT')?.amount).toBeCloseTo(4346.34);
  });

  it('returns 0/null rather than throwing when a field is missing', () => {
    const report = parseRubySummary('<pd:summaryPd xmlns:pd="urn:vfi-sapphire:pd.2001-10-01"></pd:summaryPd>');
    expect(report.fuelSales).toBe(0);
    expect(report.outsideSalesDelta).toBeNull();
    expect(report.tenders).toEqual([]);
  });
});

describe('parseRubyDepartment (reptname=department)', () => {
  const xml = `<?xml version="1.0"?>
    <pd:departmentPd xmlns:pd="urn:vfi-sapphire:pd.2001-10-01" xmlns:vs="urn:vfi-sapphire:vs.2001-10-01">
      <deptInfo>
        <vs:deptBase name="CIGARETTES"/>
        <netSales>2945.54</netSales>
      </deptInfo>
      <deptInfo>
        <vs:deptBase name="GROCERY"/>
        <netSales>80.96</netSales>
      </deptInfo>
    </pd:departmentPd>`;

  it('pairs department names with net sales', () => {
    const report = parseRubyDepartment(xml);
    expect(report.departments).toHaveLength(2);
    expect(report.departments.find(d => d.name === 'CIGARETTES')?.netSales).toBeCloseTo(2945.54);
    expect(report.departments.find(d => d.name === 'GROCERY')?.netSales).toBeCloseTo(80.96);
  });
});

describe('parseRubyNetwork (reptname=network)', () => {
  const xml = `<?xml version="1.0"?>
    <pd:networkPd xmlns:pd="urn:vfi-sapphire:pd.2001-10-01">
      <cardInfo name="VISA">
        <amount>3200.11</amount>
      </cardInfo>
      <cardInfo name="MASTERCARD">
        <amount>1146.23</amount>
      </cardInfo>
    </pd:networkPd>`;

  it('parses per-network charge totals', () => {
    const report = parseRubyNetwork(xml);
    expect(report.cards).toHaveLength(2);
    expect(report.cards.find(c => c.network === 'VISA')?.amount).toBeCloseTo(3200.11);
  });
});
