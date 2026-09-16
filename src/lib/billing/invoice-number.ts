import type { Prisma, InvoiceKind } from '@prisma/client';
import { fiscalYearFor } from './fiscal-year';

/**
 * Gapless, FY-scoped invoice numbering.
 *
 * GST law requires a unique, consecutive series per financial year with no
 * gaps. `count() + 1` is not safe: two concurrent requests read the same count
 * and produce a duplicate. Instead we do an atomic UPDATE ... RETURNING on a
 * dedicated counter row, inside the caller's transaction, so the number is
 * only consumed if the invoice itself commits.
 *
 * Always call this INSIDE a prisma.$transaction with the invoice insert.
 */

export interface AllocatedNumber {
  number: string;
  fyLabel: string;
  seq: number;
  prefix: string;
}

const KIND_SEGMENT: Record<InvoiceKind, string> = {
  TAX_INVOICE: '',
  PROFORMA: 'PRO',
  CREDIT_NOTE: 'CN',
};

export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  opts: { kind: InvoiceKind; prefix: string; issueDate?: Date; padTo?: number }
): Promise<AllocatedNumber> {
  const { kind, prefix, issueDate = new Date(), padTo = 4 } = opts;
  const fyLabel = fiscalYearFor(issueDate).label;

  // Ensure the counter row exists. The unique constraint makes this safe under
  // concurrency — a losing racer just skips creation.
  await tx.invoiceSequence.upsert({
    where: { kind_fyLabel_prefix: { kind, fyLabel, prefix } },
    create: { kind, fyLabel, prefix, lastSeq: 0 },
    update: {},
  });

  // Atomic increment: Postgres locks this row for the rest of the transaction,
  // so a concurrent allocation blocks here instead of duplicating a number.
  const updated = await tx.invoiceSequence.update({
    where: { kind_fyLabel_prefix: { kind, fyLabel, prefix } },
    data: { lastSeq: { increment: 1 } },
    select: { lastSeq: true },
  });

  const seq = updated.lastSeq;
  const segment = KIND_SEGMENT[kind];
  const parts = [prefix, segment, fyLabel, String(seq).padStart(padTo, '0')].filter(Boolean);

  return { number: parts.join('/'), fyLabel, seq, prefix };
}

/** Preview the next number without consuming it (for UI hints only). */
export async function peekNextInvoiceNumber(
  db: { invoiceSequence: { findUnique: (a: any) => Promise<{ lastSeq: number } | null> } },
  opts: { kind: InvoiceKind; prefix: string; issueDate?: Date; padTo?: number }
): Promise<string> {
  const { kind, prefix, issueDate = new Date(), padTo = 4 } = opts;
  const fyLabel = fiscalYearFor(issueDate).label;
  const row = await db.invoiceSequence.findUnique({
    where: { kind_fyLabel_prefix: { kind, fyLabel, prefix } },
    select: { lastSeq: true },
  });
  const seq = (row?.lastSeq ?? 0) + 1;
  const segment = KIND_SEGMENT[kind];
  return [prefix, segment, fyLabel, String(seq).padStart(padTo, '0')].filter(Boolean).join('/');
}
