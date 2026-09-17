import { describe, it, expect } from 'vitest';
import type { Role } from '@prisma/client';
import { assignableRoles, can } from '@/lib/rbac';
import { userSchema } from '@/lib/validators';

/**
 * Creating an account is the most privileged thing in the app after the vault:
 * the role decides what someone can read for as long as the account exists.
 * The rule that matters is not who can add people — it is who they can add.
 */
const STAFF: Role[] = ['SUPER_ADMIN', 'SUB_ADMIN', 'SALES', 'DEVELOPER', 'MARKETING'];

describe('who may add a team member', () => {
  it('is the two admin roles and nobody else', () => {
    const actor = (role: Role) => ({ id: 'u1', role, grants: [] as string[] });
    expect(can(actor('SUPER_ADMIN'), 'user', 'create')).toBe(true);
    expect(can(actor('SUB_ADMIN'), 'user', 'create')).toBe(true);
    for (const role of ['SALES', 'DEVELOPER', 'MARKETING', 'CLIENT'] as Role[]) {
      expect(can(actor(role), 'user', 'create'), role).toBe(false);
    }
  });

  it('lets a Super admin hand out every role', () => {
    expect(assignableRoles('SUPER_ADMIN')).toEqual([
      'SUPER_ADMIN', 'SUB_ADMIN', 'SALES', 'DEVELOPER', 'MARKETING', 'CLIENT',
    ]);
  });

  /** The escalation this whole rule exists to stop. */
  it('never lets a Sub admin create a Super admin', () => {
    expect(assignableRoles('SUB_ADMIN')).not.toContain('SUPER_ADMIN');
  });

  it('does not let a Sub admin create another Sub admin either', () => {
    expect(assignableRoles('SUB_ADMIN')).not.toContain('SUB_ADMIN');
  });

  it('gives every other role nothing to hand out', () => {
    for (const role of ['SALES', 'DEVELOPER', 'MARKETING', 'CLIENT'] as Role[]) {
      expect(assignableRoles(role), role).toEqual([]);
    }
  });
});

describe('the new member form', () => {
  const base = {
    name: 'Divya Nair',
    email: 'divya@zootechx.com',
    role: 'SALES' as const,
    password: 'harbour-lantern-42',
  };

  it('accepts a staff account', () => {
    const parsed = userSchema.parse(base);
    expect(parsed.status).toBe('ACTIVE');
    expect(parsed.role).toBe('SALES');
  });

  it('requires a password long enough for an account that reads contracts', () => {
    const short = userSchema.safeParse({ ...base, password: 'a'.repeat(11) });
    expect(short.success).toBe(false);
    if (!short.success) {
      expect(short.error.flatten().fieldErrors.password?.[0]).toBe('At least 12 characters');
    }
    expect(userSchema.safeParse({ ...base, password: 'a'.repeat(12) }).success).toBe(true);
  });

  it('will not create an account with no password at all', () => {
    const { password: _password, ...withoutPassword } = base;
    expect(userSchema.safeParse(withoutPassword).success).toBe(false);
  });

  it('refuses an address nobody could sign in with', () => {
    for (const email of ['', 'nope', 'no@domain', 'a b@c.com']) {
      expect(userSchema.safeParse({ ...base, email }).success, email).toBe(false);
    }
  });

  /**
   * A portal account with no company would see either nothing or everything,
   * depending on which query forgot to apply the scope filter.
   */
  it('refuses a client portal account that is not tied to a client', () => {
    const orphan = userSchema.safeParse({ ...base, role: 'CLIENT' });
    expect(orphan.success).toBe(false);
    if (!orphan.success) {
      expect(orphan.error.flatten().fieldErrors.clientId?.[0])
        .toBe('A client portal account must be tied to a client');
    }
    expect(userSchema.safeParse({ ...base, role: 'CLIENT', clientId: 'client-1' }).success).toBe(true);
  });

  it('does not require a client for staff roles', () => {
    for (const role of STAFF) {
      expect(userSchema.safeParse({ ...base, role }).success, role).toBe(true);
    }
  });
});
