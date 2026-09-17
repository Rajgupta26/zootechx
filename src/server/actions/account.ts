'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { requestContext, requireAuth } from '@/lib/session';
import { changePasswordSchema } from '@/lib/validators';
import type { ActionResult } from './billing';

/**
 * Your own account.
 *
 * Every account in this app starts with a password an administrator chose and
 * still knows — there is no invitation email to set one privately. Without a
 * way to change it, "one account per person" is a filing convention rather
 * than an access control: the audit log names someone who never held their own
 * credentials alone.
 */
export async function changeMyPasswordAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = changePasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    // requireAuth, not requirePermission: this is the one thing every role can
    // do, including a client portal account.
    const me = await requireAuth();

    const record = await prisma.user.findUnique({
      where: { id: me.id },
      select: { passwordHash: true },
    });

    if (!record?.passwordHash) {
      return {
        ok: false,
        error: 'This account has no password set. Ask an administrator to set one.',
      };
    }

    if (!(await verifyPassword(parsed.data.currentPassword, record.passwordHash))) {
      return {
        ok: false,
        error: 'That is not your current password.',
        fieldErrors: { currentPassword: ['Incorrect password'] },
      };
    }

    await prisma.user.update({
      where: { id: me.id },
      data: {
        passwordHash: await hashPassword(parsed.data.newPassword),
        // Any sudo window was granted against the old password.
        sudoUntil: null,
      },
    });

    const { ip, userAgent } = await requestContext();
    await audit({
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
      action: 'user.password_change',
      entity: 'user',
      entityId: me.id,
      summary: `${me.name} changed their own password`,
      ip,
      userAgent,
    });

    revalidatePath('/account');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}
