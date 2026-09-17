import { describe, it, expect } from 'vitest';
import type { Role } from '@prisma/client';
import { can, isOwnScoped, scopeFilter } from '@/lib/rbac';
import { projectSchema } from '@/lib/validators';

/**
 * Starting a project commits the team to delivery and, when it comes from a
 * signed proposal, copies that proposal's billing schedule into the plan.
 * It is deliberately not something everyone who can see projects may do.
 */
const actor = (role: Role, id = 'u1') => ({ id, role, grants: [] as string[] });

describe('project:create', () => {
  it('is held only by the two admin roles', () => {
    for (const role of ['SUPER_ADMIN', 'SUB_ADMIN'] as Role[]) {
      expect(can(actor(role), 'project', 'create'), role).toBe(true);
    }
    for (const role of ['SALES', 'DEVELOPER', 'MARKETING', 'CLIENT'] as Role[]) {
      expect(can(actor(role), 'project', 'create'), role).toBe(false);
    }
  });

  it('still lets Sales and Developer read projects', () => {
    expect(can(actor('SALES'), 'project', 'read')).toBe(true);
    expect(can(actor('DEVELOPER'), 'project', 'read')).toBe(true);
  });

  it('keeps a Developer scoped to projects they are on', () => {
    expect(isOwnScoped('DEVELOPER', 'project', 'read')).toBe(true);
    expect(scopeFilter({ ...actor('DEVELOPER', 'dev-1'), clientId: null }, 'project'))
      .toEqual({ members: { some: { userId: 'dev-1' } } });
  });

  it('never exposes another client’s projects in the portal', () => {
    expect(scopeFilter({ ...actor('CLIENT', 'c1'), clientId: 'client-1' }, 'project'))
      .toEqual({ clientId: 'client-1' });
  });
});

describe('new project form', () => {
  const base = { name: 'Loyalty platform', clientId: 'client-1' };

  it('requires a client — a project with no one to deliver for is not a project', () => {
    const result = projectSchema.safeParse({ name: 'Loyalty platform' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.clientId?.[0]).toBe('Client is required');
    }
  });

  it('asks for a name in words a reader can act on', () => {
    const result = projectSchema.safeParse({ ...base, name: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name?.[0]).toBe('Give the project a name');
    }
  });

  it('starts a project in planning at medium priority when not told otherwise', () => {
    const result = projectSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('PLANNING');
      expect(result.data.priority).toBe('MEDIUM');
    }
  });

  it('treats the proposal link as optional', () => {
    expect(projectSchema.safeParse(base).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, sowId: 'sow-1' }).success).toBe(true);
  });
});
