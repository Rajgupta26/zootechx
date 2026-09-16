import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { auth } from './auth';
import { prisma } from './db';
import { type Action, type Actor, type Resource, can, hasRecordGrant } from './rbac';

/**
 * Server-side session helpers.
 *
 * Every server action and route handler starts with one of these. They are the
 * only place the session is read, so authorization cannot be bypassed by
 * forgetting a check in a new file — `requirePermission` throws by default.
 */

export class AuthorizationError extends Error {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class SudoRequiredError extends Error {
  constructor(message = 'Re-authentication required.') {
    super(message);
    this.name = 'SudoRequiredError';
  }
}

export interface CurrentUser extends Actor {
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  sudoUntil: Date | null;
}

/**
 * Load the signed-in user plus their per-record grants.
 * `cache` dedupes this across a single render pass.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, role: true, clientId: true,
      status: true, deletedAt: true, sudoUntil: true,
      grants: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { resource: true, action: true, resourceId: true },
      },
    },
  });

  if (!user || user.deletedAt || user.status === 'SUSPENDED') return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    sudoUntil: user.sudoUntil,
    grants: user.grants.map((g) =>
      g.resourceId ? `${g.resource}:${g.action}:${g.resourceId}` : `${g.resource}:${g.action}`
    ),
  };
});

/** Redirects to /login when there is no session. */
export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Throws AuthorizationError when the permission is missing. */
export async function requirePermission(
  resource: Resource,
  action: Action
): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!can(user, resource, action)) {
    throw new AuthorizationError(
      `Your role (${user.role}) cannot ${action} ${resource}.`
    );
  }
  return user;
}

/** Permission OR an explicit per-record grant. */
export async function requireRecordAccess(
  resource: Resource,
  action: Action,
  recordId: string
): Promise<CurrentUser> {
  const user = await requireAuth();
  if (can(user, resource, action) || hasRecordGrant(user, resource, action, recordId)) {
    return user;
  }
  throw new AuthorizationError(`You do not have access to this ${resource}.`);
}

const SUDO_WINDOW_MINUTES = 10;

/**
 * Sudo mode for revealing CRITICAL production secrets.
 * The window is short and stored server-side so a stolen JWT alone is not
 * enough to dump the vault.
 */
export async function requireSudo(): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!user.sudoUntil || user.sudoUntil < new Date()) {
    throw new SudoRequiredError(
      'Confirm your password to reveal this secret.'
    );
  }
  return user;
}

export async function grantSudo(userId: string): Promise<Date> {
  const until = new Date(Date.now() + SUDO_WINDOW_MINUTES * 60_000);
  await prisma.user.update({ where: { id: userId }, data: { sudoUntil: until } });
  return until;
}

export async function revokeSudo(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sudoUntil: null } });
}

export function isSudoActive(user: Pick<CurrentUser, 'sudoUntil'>): boolean {
  return Boolean(user.sudoUntil && user.sudoUntil > new Date());
}

/** Caller IP and user agent for audit entries. */
export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ip: forwarded ? forwarded.split(',')[0].trim() : h.get('x-real-ip'),
    userAgent: h.get('user-agent'),
  };
}
