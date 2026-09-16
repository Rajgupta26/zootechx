import type { Role } from '@prisma/client';

/**
 * Role-based access control.
 *
 * Permissions are strings of the form "<resource>:<action>". The matrix below
 * is the single source of truth — UI navigation, server actions, and route
 * middleware all read from it, so a permission can never be enforced in one
 * place and forgotten in another.
 *
 * Per-record exceptions (e.g. one developer granted one production API key)
 * live in the PermissionGrant table and are layered on top by `can()`.
 */

export const RESOURCES = [
  'dashboard', 'lead', 'client', 'followup', 'quotation', 'sow', 'project',
  'milestone', 'progresslog', 'issue', 'task', 'invoice', 'payment', 'expense',
  'credential', 'brand', 'campaign', 'creative', 'user', 'audit', 'settings',
  'portal', 'notification', 'report',
] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = 'read' | 'create' | 'update' | 'delete' | 'approve' | 'reveal' | 'send' | 'assign';
export type Permission = `${Resource}:${Action}` | '*';

const ALL: Permission[] = ['*'];

/**
 * `own` scopes a permission to records the user owns or is assigned to.
 * Enforced by the scope helpers at the bottom of this file.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,

  SUB_ADMIN: [
    'dashboard:read', 'report:read',
    'lead:read', 'lead:create', 'lead:update', 'lead:delete', 'lead:assign',
    'client:read', 'client:create', 'client:update', 'client:delete',
    'followup:read', 'followup:create', 'followup:update', 'followup:delete', 'followup:assign',
    'quotation:read', 'quotation:create', 'quotation:update', 'quotation:send',
    'sow:read', 'sow:create', 'sow:update', 'sow:send', 'sow:approve',
    'project:read', 'project:create', 'project:update',
    'milestone:read', 'milestone:create', 'milestone:update', 'milestone:approve',
    'progresslog:read', 'issue:read', 'issue:update', 'issue:assign',
    'task:read', 'task:create', 'task:update', 'task:delete', 'task:assign',
    'invoice:read', 'invoice:create', 'invoice:update', 'invoice:send', 'invoice:approve',
    'payment:read', 'payment:create', 'payment:update',
    'expense:read', 'expense:create', 'expense:update', 'expense:approve',
    'credential:read', 'credential:reveal',
    'brand:read', 'campaign:read', 'creative:read', 'creative:approve',
    'user:read', 'user:create', 'user:update',
    'notification:read', 'notification:update',
    'settings:read',
  ],

  SALES: [
    'dashboard:read',
    'lead:read', 'lead:create', 'lead:update', 'lead:delete',
    'client:read', 'client:create', 'client:update',
    'followup:read', 'followup:create', 'followup:update',
    'quotation:read', 'quotation:create', 'quotation:update', 'quotation:send',
    'sow:read', 'sow:create', 'sow:update', 'sow:send',
    'invoice:read', 'invoice:create', 'invoice:send',
    'payment:read',
    'task:read', 'task:update',
    'project:read',
    'notification:read', 'notification:update',
  ],

  DEVELOPER: [
    'dashboard:read',
    'project:read', 'project:update',
    'milestone:read', 'milestone:update',
    'progresslog:read', 'progresslog:create', 'progresslog:update',
    'issue:read', 'issue:create', 'issue:update',
    'task:read', 'task:update',
    'sow:read',
    'credential:read', 'credential:reveal',
    'client:read',
    'notification:read', 'notification:update',
  ],

  MARKETING: [
    'dashboard:read',
    'brand:read', 'brand:create', 'brand:update',
    'campaign:read', 'campaign:create', 'campaign:update',
    'creative:read', 'creative:create', 'creative:update',
    'lead:read', 'lead:create',
    'client:read',
    'task:read', 'task:update',
    'credential:read',
    'notification:read', 'notification:update',
  ],

  CLIENT: [
    'portal:read',
    'project:read',
    'milestone:read',
    'sow:read', 'sow:approve',
    'invoice:read',
    'payment:read',
  ],
};

/**
 * Permissions a role may hold only for records it owns/is assigned to.
 * Everything else in ROLE_PERMISSIONS is org-wide for that role.
 */
export const OWN_SCOPED: Partial<Record<Role, Permission[]>> = {
  SALES: ['lead:read', 'lead:update', 'lead:delete', 'followup:read', 'followup:update'],
  DEVELOPER: ['project:read', 'project:update', 'milestone:update', 'progresslog:update', 'task:update'],
  MARKETING: ['brand:update', 'campaign:update', 'creative:update'],
  CLIENT: ['project:read', 'milestone:read', 'sow:read', 'invoice:read', 'payment:read'],
};

export interface Actor {
  id: string;
  role: Role;
  clientId?: string | null;
  /** Extra grants loaded from PermissionGrant, as "resource:action" or "resource:action:id". */
  grants?: string[];
}

/** Does this actor hold the permission at all (ignoring record ownership)? */
export function hasPermission(actor: Pick<Actor, 'role' | 'grants'>, permission: Permission): boolean {
  const rolePerms = ROLE_PERMISSIONS[actor.role] ?? [];
  if (rolePerms.includes('*')) return true;
  if (rolePerms.includes(permission)) return true;
  return (actor.grants ?? []).some((g) => g === permission || g.startsWith(`${permission}:`));
}

export function can(actor: Pick<Actor, 'role' | 'grants'>, resource: Resource, action: Action): boolean {
  return hasPermission(actor, `${resource}:${action}` as Permission);
}

/** Explicit per-record grant, e.g. credential:reveal:<credentialId>. */
export function hasRecordGrant(
  actor: Pick<Actor, 'grants'>,
  resource: Resource,
  action: Action,
  recordId: string
): boolean {
  return (actor.grants ?? []).includes(`${resource}:${action}:${recordId}`);
}

/** True when the role may only touch its own records for this permission. */
export function isOwnScoped(role: Role, resource: Resource, action: Action): boolean {
  if (role === 'SUPER_ADMIN' || role === 'SUB_ADMIN') return false;
  return (OWN_SCOPED[role] ?? []).includes(`${resource}:${action}` as Permission);
}

/**
 * Prisma `where` fragment that restricts a query to what the actor may see.
 * Used by every list endpoint so scoping is impossible to forget.
 */
export function scopeFilter(actor: Actor, resource: Resource): Record<string, unknown> {
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'SUB_ADMIN') return {};

  switch (actor.role) {
    case 'SALES':
      if (resource === 'lead') return { ownerId: actor.id };
      if (resource === 'followup') return { assigneeId: actor.id };
      return {};

    case 'DEVELOPER':
      if (resource === 'project') return { members: { some: { userId: actor.id } } };
      if (resource === 'task') return { assigneeId: actor.id };
      if (resource === 'progresslog') return { authorId: actor.id };
      if (resource === 'issue') return { project: { members: { some: { userId: actor.id } } } };
      return {};

    case 'MARKETING':
      if (resource === 'brand') return { ownerId: actor.id };
      if (resource === 'campaign') return { brand: { ownerId: actor.id } };
      if (resource === 'task') return { assigneeId: actor.id };
      return {};

    case 'CLIENT':
      // The portal must never leak across client boundaries.
      if (!actor.clientId) return { id: '__no_access__' };
      if (resource === 'invoice' || resource === 'project' || resource === 'sow') {
        return { clientId: actor.clientId };
      }
      if (resource === 'milestone') return { project: { clientId: actor.clientId } };
      if (resource === 'payment') return { clientId: actor.clientId };
      return { id: '__no_access__' };

    default:
      return {};
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  SUB_ADMIN: 'Sub Admin',
  SALES: 'Sales',
  DEVELOPER: 'Developer',
  MARKETING: 'Digital Marketing',
  CLIENT: 'Client',
};

/** Landing page per role after login. */
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: '/dashboard',
  SUB_ADMIN: '/dashboard',
  SALES: '/dashboard',
  DEVELOPER: '/dashboard',
  MARKETING: '/dashboard',
  CLIENT: '/portal',
};
