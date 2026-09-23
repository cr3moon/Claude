import { describe, it, expect } from 'vitest';
import { wouldRemoveLastActiveOwner } from '../src/modules/users/user-management-rules';

describe('wouldRemoveLastActiveOwner', () => {
  it('blocks deactivating the only active owner', () => {
    const owners = [{ id: 'a', isActive: true }];
    expect(wouldRemoveLastActiveOwner(owners, 'a')).toBe(true);
  });

  it('allows deactivating one of several active owners', () => {
    const owners = [{ id: 'a', isActive: true }, { id: 'b', isActive: true }];
    expect(wouldRemoveLastActiveOwner(owners, 'a')).toBe(false);
  });

  it('allows it when the other owner is already inactive but re-deactivating the same target is a no-op', () => {
    const owners = [{ id: 'a', isActive: true }, { id: 'b', isActive: false }];
    expect(wouldRemoveLastActiveOwner(owners, 'a')).toBe(true);
  });

  it('is false for a target that is already inactive (nothing to remove)', () => {
    const owners = [{ id: 'a', isActive: false }];
    expect(wouldRemoveLastActiveOwner(owners, 'a')).toBe(false);
  });

  it('is false for an unknown target id', () => {
    const owners = [{ id: 'a', isActive: true }];
    expect(wouldRemoveLastActiveOwner(owners, 'nonexistent')).toBe(false);
  });
});
