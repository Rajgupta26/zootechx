'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto';
import { verifyPassword } from '@/lib/auth';
import {
  requirePermission, requestContext, requireAuth,
  grantSudo, isSudoActive, SudoRequiredError,
} from '@/lib/session';
import { hasRecordGrant, can } from '@/lib/rbac';
import { credentialSchema, sudoSchema } from '@/lib/validators';
import type { ActionResult } from './billing';

/**
 * Credentials vault.
 *
 * Rules enforced here, not in the UI:
 *  - Secrets are never included in list queries; only `revealSecretAction`
 *    decrypts, and only for one record at a time.
 *  - Every reveal and copy writes a CredentialAccess row AND an audit entry.
 *  - CRITICAL secrets additionally require sudo mode (a password re-entry
 *    within the last 10 minutes).
 *  - A non-admin needs an explicit per-record PermissionGrant.
 */

function fail<T = unknown>(err: unknown): ActionResult<T> {
  return {
    ok: false,
    error: err instanceof Error ? err.message : 'Something went wrong.',
    ...(err instanceof SudoRequiredError ? { fieldErrors: { sudo: ['required'] } } : {}),
  };
}

export async function createCredentialAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = credentialSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('credential', 'create');
    const ctx = await requestContext();
    const d = parsed.data;
    const encrypted = encryptSecret(d.secret);

    const credential = await prisma.credential.create({
      data: {
        name: d.name, description: d.description,
        category: d.category, environment: d.environment,
        username: d.username, url: d.url,
        sensitivity: d.sensitivity,
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretAuthTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        clientId: d.clientId || null,
        projectId: d.projectId || null,
        ownerId: user.id,
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      },
    });

    await prisma.credentialAccess.create({
      data: {
        credentialId: credential.id, userId: user.id, action: 'create',
        ip: ctx.ip, userAgent: ctx.userAgent,
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'credential.create', entity: 'credential', entityId: credential.id,
      summary: `Added ${d.sensitivity.toLowerCase()} credential "${d.name}" (${d.environment})`,
      ip: ctx.ip,
    });

    revalidatePath('/vault');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Decrypt and return one secret.
 * This is the only code path that ever returns plaintext.
 */
export async function revealSecretAction(
  credentialId: string,
  reason?: string
): Promise<ActionResult<{ secret: string; masked: string }>> {
  try {
    const user = await requireAuth();
    const ctx = await requestContext();

    const credential = await prisma.credential.findUniqueOrThrow({
      where: { id: credentialId },
    });

    // Role permission OR an explicit per-record grant.
    const allowed =
      can(user, 'credential', 'reveal') ||
      hasRecordGrant(user, 'credential', 'reveal', credentialId);

    if (!allowed) {
      await audit({
        actorId: user.id, actorEmail: user.email, actorRole: user.role,
        action: 'credential.reveal_denied', entity: 'credential', entityId: credentialId,
        summary: `Denied reveal of "${credential.name}" — no permission`,
        ip: ctx.ip,
      });
      return { ok: false, error: 'You do not have access to this credential.' };
    }

    // CRITICAL secrets need a fresh password confirmation.
    if (credential.sensitivity === 'CRITICAL' && !isSudoActive(user)) {
      return {
        ok: false,
        error: 'Confirm your password to reveal this production secret.',
        fieldErrors: { sudo: ['required'] },
      };
    }

    const secret = decryptSecret({
      ciphertext: credential.secretCiphertext,
      iv: credential.secretIv,
      authTag: credential.secretAuthTag,
      keyVersion: credential.keyVersion,
    });

    await prisma.credentialAccess.create({
      data: {
        credentialId, userId: user.id, action: 'reveal',
        ip: ctx.ip, userAgent: ctx.userAgent,
        sudoVerified: credential.sensitivity === 'CRITICAL',
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'credential.reveal', entity: 'credential', entityId: credentialId,
      summary: `Revealed "${credential.name}" (${credential.environment}, ${credential.sensitivity})`,
      metadata: { reason: reason ?? null, sensitivity: credential.sensitivity },
      ip: ctx.ip, userAgent: ctx.userAgent,
    });

    return { ok: true, data: { secret, masked: maskSecret(secret) } };
  } catch (err) {
    return fail(err);
  }
}

/** Logged separately from reveal — copying puts the secret on the clipboard. */
export async function logCredentialCopyAction(credentialId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const ctx = await requestContext();
    const credential = await prisma.credential.findUniqueOrThrow({
      where: { id: credentialId },
      select: { name: true },
    });

    await prisma.credentialAccess.create({
      data: { credentialId, userId: user.id, action: 'copy', ip: ctx.ip, userAgent: ctx.userAgent },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'credential.copy', entity: 'credential', entityId: credentialId,
      summary: `Copied "${credential.name}" to clipboard`,
      ip: ctx.ip,
    });

    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Sudo mode: re-enter the password to unlock CRITICAL reveals for 10 minutes. */
export async function enterSudoModeAction(raw: unknown): Promise<ActionResult<{ until: string }>> {
  try {
    const parsed = sudoSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Enter your password.' };
    }

    const user = await requireAuth();
    const record = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!record.passwordHash || !(await verifyPassword(parsed.data.password, record.passwordHash))) {
      const ctx = await requestContext();
      await audit({
        actorId: user.id, actorEmail: user.email, actorRole: user.role,
        action: 'auth.sudo_failed', entity: 'user', entityId: user.id,
        summary: 'Failed sudo re-authentication attempt',
        ip: ctx.ip,
      });
      return { ok: false, error: 'That password is not correct.' };
    }

    const until = await grantSudo(user.id);

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'auth.sudo_granted', entity: 'user', entityId: user.id,
      summary: `Sudo mode granted until ${until.toISOString()}`,
    });

    revalidatePath('/vault');
    return { ok: true, data: { until: until.toISOString() } };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCredentialAction(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('credential', 'delete');
    const ctx = await requestContext();

    const credential = await prisma.credential.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'credential.delete', entity: 'credential', entityId: id,
      summary: `Deleted credential "${credential.name}"`,
      ip: ctx.ip,
    });

    revalidatePath('/vault');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
