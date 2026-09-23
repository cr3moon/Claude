/**
 * tests/lottery.test.ts
 *
 * Unit tests for lottery ticket-count math and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  computeCount,
  bookFaceValue,
  bookRemainingValue,
  InvalidCountError,
} from '../src/modules/lottery/lottery-rules';

describe('computeCount', () => {
  it('computes tickets sold and sales amount for a normal count', () => {
    const result = computeCount(10, 25, 100, 5);
    expect(result.ticketsSold).toBe(15);
    expect(result.salesAmount).toBe(75);
    expect(result.isComplete).toBe(false);
  });

  it('handles the very first count from zero', () => {
    const result = computeCount(0, 3, 60, 10);
    expect(result.ticketsSold).toBe(3);
    expect(result.salesAmount).toBe(30);
  });

  it('flags the book complete when the count reaches book size', () => {
    const result = computeCount(95, 100, 100, 2);
    expect(result.isComplete).toBe(true);
    expect(result.ticketsSold).toBe(5);
  });

  it('allows a repeat count with no change (zero tickets sold)', () => {
    const result = computeCount(20, 20, 100, 5);
    expect(result.ticketsSold).toBe(0);
    expect(result.salesAmount).toBe(0);
  });

  it('rejects a count lower than the previous count', () => {
    expect(() => computeCount(20, 15, 100, 5)).toThrow(InvalidCountError);
  });

  it('rejects a count exceeding book size', () => {
    expect(() => computeCount(90, 101, 100, 5)).toThrow(InvalidCountError);
  });

  it('rounds sales amount to 2 decimal places', () => {
    const result = computeCount(0, 3, 60, 3.33);
    expect(result.salesAmount).toBe(9.99);
  });
});

describe('bookFaceValue', () => {
  it('multiplies book size by ticket price', () => {
    expect(bookFaceValue(150, 2)).toBe(300);
  });
});

describe('bookRemainingValue', () => {
  it('computes remaining value from current count', () => {
    expect(bookRemainingValue(40, 100, 5)).toBe(300);
  });

  it('is zero once the book is fully sold', () => {
    expect(bookRemainingValue(100, 100, 5)).toBe(0);
  });

  it('never goes negative even if current exceeds book size', () => {
    expect(bookRemainingValue(120, 100, 5)).toBe(0);
  });
});
