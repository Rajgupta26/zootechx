'use server';

import { revalidatePath } from 'next/cache';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { requestContext, requirePermission } from '@/lib/session';
import { assignableRoles } from '@/lib/rbac';
import { userSchema } from '@/lib/validators';
import type { ActionResult } from './billing';

/**
 * Team accounts.
 *
 * Adding a person is the most privileged thing in the app after the vault: a
 * role here decides what someone can read for as long as the account exists,
 * and nothing about it is reversible by the person it affects. So every path
 * out of this file is permission-checked, rank-checked and audited.
 */

function fail<T = unknown>(err: unknown): ActionResult<T> {
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

export async function createTeamMemberAction(
  raw: unknown
): Promise<ActionResult<{ id: string; name: string; email: string; role: Role }>> {
  try {
    const parsed = userSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const actor = await requirePermission('user', 'create');
    const d = parsed.data;

    if (!assignableRoles(actor.role).includes(d.role)) {
      return {
        ok: false,
        error: `Your role (${actor.role}) cannot create a ${d.role} account.`,
        fieldErrors: { role: ['You cannot assign this role.'] },
      };
    }

    const email = d.email.trim().toLowerCase();

    // Includes soft-deleted rows: the email column is unique across all of
    // them, so a silent Prisma constraint error is the alternative.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, deletedAt: true },
    });
    if (existing) {
      return {
        ok: false,
        error: existing.deletedAt
          ? 'An account with that email was removed earlier. Restore it rather than creating a second one.'
          : 'Someone already has that email address.',
        fieldErrors: { email: ['That email is already taken.'] },
      };
    }

    if (d.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: d.clientId, deletedAt: null },
        select: { id: true },
      });
      if (!client) {
        return {
          ok: false,
          error: 'Check the highlighted fields.',
          fieldErrors: { clientId: ['That client no longer exists.'] },
        };
      }
    }

    const created = await prisma.user.create({
      data: {
        name: d.name.trim(),
        email,
        phone: d.phone?.trim() || null,
        role: d.role,
        department: d.department?.trim() || null,
        // Only a portal account is bound to a client; a stray clientId on a
        // staff account would scope their whole view to that one company.
        clientId: d.role === 'CLIENT' ? d.clientId! : null,
        passwordHash: await hashPassword(d.password),
        status: d.status,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    const { ip, userAgent } = await requestContext();
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'user.create',
      entity: 'user',
      entityId: created.id,
      summary: `Created ${created.role} account for ${created.email}`,
      ip,
      userAgent,
    });

    // Every Super admin learns that the roster changed, whoever did it.
    await notify({
      type: 'SYSTEM',
      title: 'New team account',
      body: `${actor.name} created a ${created.role} account for ${created.name}.`,
      linkUrl: '/team',
      roles: ['SUPER_ADMIN'],
    });

    revalidatePath('/team');
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Suspend or restore an account.
 *
 * Suspended rather than deleted: the audit log, the leads they own and the
 * invoices they raised all point at this row, and deleting it would orphan
 * that history. `getCurrentUser` refuses a suspended user, so access stops at
 * their next request rather than at the end of their session.
 */
export async function setTeamMemberStatusAction(
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED'
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const actor = await requirePermission('user', 'update');

    if (userId === actor.id) {
      return { ok: false, error: 'You cannot suspend your own account.' };
    }

    const target = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target) return { ok: false, error: 'That account no longer exists.' };

    if (!assignableRoles(actor.role).includes(target.role)) {
      return { ok: false, error: `Your role (${actor.role}) cannot change a ${target.role} account.` };
    }

    // Losing the last active Super admin locks everyone out of the vault, of
    // settings, and of this screen — with no way back in through the app.
    if (target.role === 'SUPER_ADMIN' && status === 'SUSPENDED') {
      const remaining = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE', deletedAt: null, id: { not: target.id } },
      });
      if (remaining === 0) {
        return {
          ok: false,
          error: 'That is the only active Super admin. Promote someone else first.',
        };
      }
    }

    await prisma.user.update({
      where: { id: target.id },
      // A suspended account's sudo window should not survive the suspension.
      data: { status, sudoUntil: status === 'SUSPENDED' ? null : undefined },
    });

    const { ip, userAgent } = await requestContext();
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: status === 'SUSPENDED' ? 'user.suspend' : 'user.restore',
      entity: 'user',
      entityId: target.id,
      summary: `${status === 'SUSPENDED' ? 'Suspended' : 'Restored'} ${target.role} account ${target.email}`,
      ip,
      userAgent,
    });

    revalidatePath('/team');
    return { ok: true, data: { id: target.id, status } };
  } catch (err) {
    return fail(err);
  }
}
