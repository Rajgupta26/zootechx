import { describe, it, expect } from 'vitest';
import type { Role } from '@prisma/client';
import { can, scopeFilter } from '@/lib/rbac';

/**
 * The client portal boundary.
 *
 * The portal links straight to /api/invoices/[id]/pdf and /api/sows/[id]/pdf,
 * so the middleware has to let a CLIENT reach those prefixes. That is only safe
 * because neither route trusts the middleware: each checks the read permission
 * and then applies `scopeFilter`, which for a CLIENT collapses to their own
 * company. These pin that second layer, because it is now the only one.
 */
const portalUser = (clientId: string) => ({
  id: 'portal-1',
  role: 'CLIENT' as Role,
  clientId,
  grants: [] as string[],
});

describe('a client portal account', () => {
  it('may read invoices and proposals at all', () => {
    expect(can(portalUser('c1'), 'invoice', 'read')).toBe(true);
    expect(can(portalUser('c1'), 'sow', 'read')).toBe(true);
  });

  it('is narrowed to its own company on both', () => {
    for (const resource of ['invoice', 'sow'] as const) {
      expect(scopeFilter(portalUser('client-1'), resource), resource)
        .toEqual({ clientId: 'client-1' });
    }
  });

  it('is narrowed on projects and milestones too', () => {
    expect(scopeFilter(portalUser('client-1'), 'project')).toEqual({ clientId: 'client-1' });
    expect(scopeFilter(portalUser('client-1'), 'milestone'))
      .toEqual({ project: { clientId: 'client-1' } });
  });

  it('cannot write anything', () => {
    for (const action of ['create', 'update', 'delete', 'send'] as const) {
      expect(can(portalUser('c1'), 'invoice', action), action).toBe(false);
    }
  });

  it('cannot reach leads, credentials, the team or the audit log', () => {
    for (const resource of ['lead', 'credential', 'user', 'audit'] as const) {
      expect(can(portalUser('c1'), resource, 'read'), resource).toBe(false);
    }
  });

  /**
   * Staff are not scoped by client, so the same filter must not silently
   * narrow them to nothing — that would empty every staff list page.
   */
  it('leaves staff unfiltered on the same resources', () => {
    const admin = { id: 'u1', role: 'SUPER_ADMIN' as Role, clientId: null, grants: [] as string[] };
    expect(scopeFilter(admin, 'invoice')).toEqual({});
    expect(scopeFilter(admin, 'sow')).toEqual({});
  });
});
