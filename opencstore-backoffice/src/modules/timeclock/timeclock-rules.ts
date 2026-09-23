/**
 * src/modules/timeclock/timeclock-rules.ts
 *
 * Pure time-clock math and validation: hours worked, labor cost, and
 * clock-out validation. No DB access — covered directly by unit tests;
 * backend/services/TimeClockService.ts wraps these with the actual
 * queries. Mirrors the inventory/lottery rules modules.
 */

export class InvalidTimeEntryError extends Error {}

export interface HoursResult {
  hoursWorked: number;
  laborCost: number | null;
}

/**
 * Computes hours worked between a clock-in and clock-out timestamp, minus
 * any unpaid break. Throws InvalidTimeEntryError on a clock-out at or
 * before clock-in, or a break longer than the shift itself — both are
 * data-entry mistakes, not real shifts, so they're rejected rather than
 * silently producing a negative or zero duration.
 */
export function computeHours(clockInIso: string, clockOutIso: string, breakMinutes: number, hourlyWage: number | null): HoursResult {
  const clockIn = new Date(clockInIso).getTime();
  const clockOut = new Date(clockOutIso).getTime();
  if (!(clockOut > clockIn)) {
    throw new InvalidTimeEntryError('Clock-out must be after clock-in.');
  }
  if (breakMinutes < 0) {
    throw new InvalidTimeEntryError('Break minutes cannot be negative.');
  }
  const grossMinutes = (clockOut - clockIn) / 60_000;
  if (breakMinutes >= grossMinutes) {
    throw new InvalidTimeEntryError('Break cannot be as long as, or longer than, the shift.');
  }
  const hoursWorked = round2((grossMinutes - breakMinutes) / 60);
  return {
    hoursWorked,
    laborCost: hourlyWage != null ? round2(hoursWorked * hourlyWage) : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
