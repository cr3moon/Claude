/**
 * tests/timeclock.test.ts
 *
 * Unit tests for time-clock hours/labor-cost math and validation.
 */

import { describe, it, expect } from 'vitest';
import { computeHours, InvalidTimeEntryError } from '../src/modules/timeclock/timeclock-rules';

describe('computeHours', () => {
  it('computes hours worked for a simple 8-hour shift', () => {
    const result = computeHours('2026-01-01T09:00:00Z', '2026-01-01T17:00:00Z', 0, null);
    expect(result.hoursWorked).toBe(8);
    expect(result.laborCost).toBeNull();
  });

  it('subtracts unpaid break minutes', () => {
    const result = computeHours('2026-01-01T09:00:00Z', '2026-01-01T17:00:00Z', 30, null);
    expect(result.hoursWorked).toBe(7.5);
  });

  it('computes labor cost when an hourly wage is given', () => {
    const result = computeHours('2026-01-01T09:00:00Z', '2026-01-01T17:00:00Z', 0, 15);
    expect(result.laborCost).toBe(120);
  });

  it('rounds hours and labor cost to 2 decimal places', () => {
    const result = computeHours('2026-01-01T09:00:00Z', '2026-01-01T09:20:00Z', 0, 15.375);
    expect(result.hoursWorked).toBe(0.33);
    // laborCost is computed from the already-rounded hoursWorked (0.33), matching what's displayed
    expect(result.laborCost).toBe(5.07);
  });

  it('rejects a clock-out at or before clock-in', () => {
    expect(() => computeHours('2026-01-01T17:00:00Z', '2026-01-01T09:00:00Z', 0, null)).toThrow(InvalidTimeEntryError);
    expect(() => computeHours('2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', 0, null)).toThrow(InvalidTimeEntryError);
  });

  it('rejects a negative break', () => {
    expect(() => computeHours('2026-01-01T09:00:00Z', '2026-01-01T17:00:00Z', -5, null)).toThrow(InvalidTimeEntryError);
  });

  it('rejects a break as long as the shift', () => {
    expect(() => computeHours('2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', 60, null)).toThrow(InvalidTimeEntryError);
  });

  it('rejects a break longer than the shift', () => {
    expect(() => computeHours('2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', 90, null)).toThrow(InvalidTimeEntryError);
  });
});
