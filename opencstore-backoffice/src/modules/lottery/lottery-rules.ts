/**
 * src/modules/lottery/lottery-rules.ts
 *
 * Pure lottery ticket-count math and validation. No DB access — covered
 * directly by unit tests; backend/services/LotteryService.ts wraps these
 * with the actual queries. Mirrors src/modules/inventory/inventory-rules.ts.
 */

export const BOOK_STATUSES = ['received', 'active', 'settled', 'returned'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export interface CountResult {
  ticketsSold: number;
  salesAmount: number;
  isComplete: boolean;
}

export class InvalidCountError extends Error {}

/**
 * Validates and computes the result of one count event: the delta since
 * the previous cumulative ticket number, its dollar value, and whether the
 * book is now fully sold. Throws InvalidCountError on an out-of-range or
 * backwards count rather than silently clamping it — a bad count number is
 * almost always a data-entry mistake, not a real event to record.
 */
export function computeCount(
  previousTicketNumber: number,
  newTicketNumber: number,
  bookSize: number,
  ticketPrice: number
): CountResult {
  if (newTicketNumber < previousTicketNumber) {
    throw new InvalidCountError(
      `New ticket count (${newTicketNumber}) is less than the last recorded count (${previousTicketNumber}).`
    );
  }
  if (newTicketNumber > bookSize) {
    throw new InvalidCountError(`Ticket count (${newTicketNumber}) cannot exceed the book size (${bookSize}).`);
  }
  const ticketsSold = newTicketNumber - previousTicketNumber;
  return {
    ticketsSold,
    salesAmount: round2(ticketsSold * ticketPrice),
    isComplete: newTicketNumber === bookSize,
  };
}

/** Full value of an unsold book. */
export function bookFaceValue(bookSize: number, ticketPrice: number): number {
  return round2(bookSize * ticketPrice);
}

/** Remaining unsold value of a book at its current ticket count. */
export function bookRemainingValue(currentTicketNumber: number, bookSize: number, ticketPrice: number): number {
  return round2(Math.max(0, bookSize - currentTicketNumber) * ticketPrice);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
