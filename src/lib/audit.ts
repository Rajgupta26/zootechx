import { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';
import { prisma } from './db';
import { sha256 } from './crypto';

/**
 * Append-only, hash-chained audit log.
 *
 * Each entry stores sha256(prevHash + canonical(entry)). Deleting or editing a
 * row breaks every hash after it, so tampering is detectable by replaying the
 * chain (see verifyAuditChain). The log is never exposed with a delete path.
 */

export interface AuditInput {
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: Role | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

function canonical(entry: AuditInput & { createdAt: string; prevHash: string | null }): string {
  return JSON.stringify({
    actorId: entry.actorId ?? null,
    actorEmail: entry.actorEmail ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    metadata: entry.metadata ?? null,
    ip: entry.ip ?? null,
    createdAt: entry.createdAt,
    prevHash: entry.prevHash,
  });
}

/**
 * Write an audit entry. Pass `tx` to make the entry atomic with the change it
 * describes — a rolled-back invoice must not leave an audit trail claiming it
 * was created.
 */
export async function audit(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
  const db = tx ?? prisma;

  const previous = await db.auditLog.findFirst({
    orderBy: { seq: 'desc' },
    select: { hash: true },
  });

  const createdAt = new Date();
  const prevHash = previous?.hash ?? null;
  const hash = sha256(canonical({ ...input, createdAt: createdAt.toISOString(), prevHash }));

  await db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? Prisma.JsonNull,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      prevHash,
      hash,
      createdAt,
    },
  });
}

/**
 * Replay the chain and report the first entry whose hash doesn't match.
 * Surface this in the admin audit screen so tampering is visible.
 */
export async function verifyAuditChain(limit = 5000): Promise<{
  valid: boolean;
  checked: number;
  brokenAtId?: string;
  brokenAtSeq?: string;
}> {
  const entries = await prisma.auditLog.findMany({
    orderBy: { seq: 'asc' },
    take: limit,
  });

  let prevHash: string | null = null;
  for (const entry of entries) {
    const expected = sha256(
      canonical({
        actorId: entry.actorId,
        actorEmail: entry.actorEmail,
        actorRole: entry.actorRole,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        summary: entry.summary,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue,
        ip: entry.ip,
        createdAt: entry.createdAt.toISOString(),
        prevHash,
      })
    );

    if (entry.prevHash !== prevHash || entry.hash !== expected) {
      return {
        valid: false,
        checked: entries.length,
        brokenAtId: entry.id,
        brokenAtSeq: entry.seq.toString(),
      };
    }
    prevHash = entry.hash;
  }

  return { valid: true, checked: entries.length };
}
