/**
 * tests/store-access.test.ts
 *
 * Unit tests for multi-store access logic.
 */

import { describe, it, expect } from 'vitest';
import { mergeAccessibleStores, canAccessStore, canRevokeAccess } from '../src/modules/stores/store-access-rules';

describe('mergeAccessibleStores', () => {
  it('always includes the home store', () => {
    expect(mergeAccessibleStores('home', [])).toEqual(['home']);
  });

  it('includes granted stores after the home store', () => {
    expect(mergeAccessibleStores('home', ['a', 'b'])).toEqual(['home', 'a', 'b']);
  });

  it('deduplicates a granted store that matches the home store', () => {
    expect(mergeAccessibleStores('home', ['home', 'a'])).toEqual(['home', 'a']);
  });

  it('deduplicates repeated grants', () => {
    expect(mergeAccessibleStores('home', ['a', 'a', 'b'])).toEqual(['home', 'a', 'b']);
  });
});

describe('canAccessStore', () => {
  it('is true for the home store', () => {
    expect(canAccessStore('home', [], 'home')).toBe(true);
  });

  it('is true for a granted store', () => {
    expect(canAccessStore('home', ['a'], 'a')).toBe(true);
  });

  it('is false for a store that is neither home nor granted', () => {
    expect(canAccessStore('home', ['a'], 'b')).toBe(false);
  });
});

describe('canRevokeAccess', () => {
  it('is false for the home store', () => {
    expect(canRevokeAccess('home', 'home')).toBe(false);
  });

  it('is true for a granted (non-home) store', () => {
    expect(canRevokeAccess('a', 'home')).toBe(true);
  });
});
