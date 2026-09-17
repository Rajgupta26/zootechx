import { describe, it, expect } from 'vitest';
import { can, isOwnScoped, scopeFilter } from '@/lib/rbac';
import type { Role } from '@prisma/client';

/**
 * `lead:comment` exists so Marketing can leave a demo link on a lead without
 * being able to change the lead. The point of the permission is what it does
 * NOT grant, so that is what these check.
 */
const actor = (role: Role, id = 'u1') => ({ id, role, grants: [] as string[] });

describe('lead:comment', () => {
  it('is held by the roles that work leads', () => {
    for (const role of ['SUPER_ADMIN', 'SUB_ADMIN', 'SALES', 'MARKETING'] as Role[]) {
      expect(can(actor(role), 'lead', 'comment'), role).toBe(true);
    }
  });

  it('is not held by Developer or Client', () => {
    for (const role of ['DEVELOPER', 'CLIENT'] as Role[]) {
      expect(can(actor(role), 'lead', 'comment'), role).toBe(false);
    }
  });

  it('does not let Marketing edit, delete or reassign the lead', () => {
    const vishit = actor('MARKETING');
    expect(can(vishit, 'lead', 'comment')).toBe(true);
    for (const action of ['update', 'delete', 'assign'] as const) {
      expect(can(vishit, 'lead', action), action).toBe(false);
    }
  });

  it('leaves Marketing able to read every lead, not just their own', () => {
    expect(can(actor('MARKETING'), 'lead', 'read')).toBe(true);
    expect(scopeFilter({ ...actor('MARKETING'), clientId: null }, 'lead')).toEqual({});
  });

  it('keeps Sales commenting only on leads they own', () => {
    expect(isOwnScoped('SALES', 'lead', 'comment')).toBe(true);
    expect(scopeFilter({ ...actor('SALES', 'sales-1'), clientId: null }, 'lead'))
      .toEqual({ ownerId: 'sales-1' });
  });

  it('never opens a lead to a client portal user', () => {
    const client = { ...actor('CLIENT', 'c1'), clientId: 'client-1' };
    expect(can(client, 'lead', 'read')).toBe(false);
    expect(scopeFilter(client, 'lead')).toEqual({ id: '__no_access__' });
  });
});
