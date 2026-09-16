'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { requirePermission, requestContext } from '@/lib/session';
import { normaliseEmail, normalisePhoneDigits } from '@/lib/utils';
import {
  leadSchema, leadBaseSchema, clientSchema, followUpSchema, taskSchema,
  projectSchema, progressLogSchema, issueSchema, expenseSchema,
} from '@/lib/validators';
import type { ActionResult } from './billing';

/** Leads, clients, follow-ups, projects, tasks, issues and expenses. */

function fail<T = unknown>(err: unknown): ActionResult<T> {
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

// ---------- Leads ----------

export async function createLeadAction(raw: unknown): Promise<ActionResult<{ id: string; duplicate?: string }>> {
  try {
    const parsed = leadSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('lead', 'create');
    const d = parsed.data;

    const dedupeEmail = normaliseEmail(d.email);
    const dedupePhone = normalisePhoneDigits(d.phone);

    // Warn on an existing lead with the same email or phone rather than
    // silently creating a second record for the same person.
    const existing = await prisma.lead.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(dedupeEmail ? [{ dedupeEmail }] : []),
          ...(dedupePhone ? [{ dedupePhone }] : []),
        ],
      },
      select: { id: true, name: true, owner: { select: { name: true } } },
    });

    if (existing) {
      return {
        ok: false,
        error: `A lead for ${existing.name} already exists${existing.owner ? `, owned by ${existing.owner.name}` : ''}.`,
        data: { id: existing.id, duplicate: existing.id },
      };
    }

    const lead = await prisma.lead.create({
      data: {
        name: d.name, company: d.company,
        email: d.email || null, phone: d.phone || null,
        dedupeEmail, dedupePhone,
        source: d.source, sourceDetail: d.sourceDetail, status: d.status,
        estimatedValue: d.estimatedValue ? d.estimatedValue.replace(/[,\s]/g, '') : null,
        currency: d.currency, requirement: d.requirement,
        city: d.city, stateCode: d.stateCode,
        ownerId: d.ownerId || user.id,
        createdById: user.id,
        nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null,
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'lead.create', entity: 'lead', entityId: lead.id,
      summary: `Created lead ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    });

    if (d.ownerId && d.ownerId !== user.id) {
      await notify({
        type: 'LEAD_ASSIGNED',
        title: 'New lead assigned to you',
        body: `${lead.name}${lead.company ? ` — ${lead.company}` : ''}`,
        linkUrl: `/leads/${lead.id}`,
        alsoUserIds: [d.ownerId],
      });
    }

    revalidatePath('/leads');
    return { ok: true, data: { id: lead.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateLeadAction(id: string, raw: unknown): Promise<ActionResult> {
  try {
    const parsed = leadBaseSchema.partial().safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('lead', 'update');
    const before = await prisma.lead.findUniqueOrThrow({ where: { id } });
    const d = parsed.data;

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.company !== undefined ? { company: d.company } : {}),
        ...(d.email !== undefined ? { email: d.email || null, dedupeEmail: normaliseEmail(d.email) } : {}),
        ...(d.phone !== undefined ? { phone: d.phone || null, dedupePhone: normalisePhoneDigits(d.phone) } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.source !== undefined ? { source: d.source } : {}),
        ...(d.ownerId !== undefined ? { ownerId: d.ownerId } : {}),
        ...(d.requirement !== undefined ? { requirement: d.requirement } : {}),
        ...(d.estimatedValue !== undefined
          ? { estimatedValue: d.estimatedValue ? d.estimatedValue.replace(/[,\s]/g, '') : null }
          : {}),
        ...(d.nextFollowUpAt !== undefined
          ? { nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null }
          : {}),
      },
    });

    if (d.status && d.status !== before.status) {
      await prisma.activity.create({
        data: {
          leadId: id, actorId: user.id, type: 'status_change',
          body: `Status changed from ${before.status} to ${d.status}`,
        },
      });
    }

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'lead.update', entity: 'lead', entityId: id,
      summary: `Updated lead ${lead.name}`,
      metadata: { statusFrom: before.status, statusTo: lead.status },
    });

    revalidatePath('/leads');
    revalidatePath(`/leads/${id}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Convert a won lead into a client record, carrying its details across. */
export async function convertLeadAction(id: string): Promise<ActionResult<{ clientId: string }>> {
  try {
    const user = await requirePermission('client', 'create');
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });

    if (lead.convertedClientId) {
      return { ok: false, error: 'This lead has already been converted.' };
    }

    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          name: lead.company || lead.name,
          email: lead.email ?? '',
          phone: lead.phone,
          city: lead.city,
          stateCode: lead.stateCode,
          currency: lead.currency,
          accountManagerId: lead.ownerId,
          notes: lead.requirement,
        },
      });

      await tx.lead.update({
        where: { id },
        data: { status: 'WON', convertedClientId: created.id, convertedAt: new Date() },
      });

      await audit(
        {
          actorId: user.id, actorEmail: user.email, actorRole: user.role,
          action: 'lead.convert', entity: 'lead', entityId: id,
          summary: `Converted lead ${lead.name} into client ${created.name}`,
          metadata: { clientId: created.id },
        },
        tx
      );

      return created;
    });

    revalidatePath('/leads');
    revalidatePath('/clients');
    return { ok: true, data: { clientId: client.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteLeadAction(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('lead', 'delete');
    // Soft delete — leads carry history worth keeping.
    const lead = await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'lead.delete', entity: 'lead', entityId: id,
      summary: `Deleted lead ${lead.name}`,
    });

    revalidatePath('/leads');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Clients ----------

export async function createClientAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = clientSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('client', 'create');
    const d = parsed.data;
    const { stateNameFromCode } = await import('@/lib/billing/gst');

    const client = await prisma.client.create({
      data: {
        ...d,
        gstin: d.gstin || null,
        website: d.website || null,
        stateName: stateNameFromCode(d.stateCode),
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'client.create', entity: 'client', entityId: client.id,
      summary: `Created client ${client.name}`,
    });

    revalidatePath('/clients');
    return { ok: true, data: { id: client.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateClientAction(id: string, raw: unknown): Promise<ActionResult> {
  try {
    const parsed = clientSchema.partial().safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('client', 'update');
    const { stateNameFromCode } = await import('@/lib/billing/gst');
    const d = parsed.data;

    await prisma.client.update({
      where: { id },
      data: {
        ...d,
        gstin: d.gstin === '' ? null : d.gstin,
        website: d.website === '' ? null : d.website,
        ...(d.stateCode ? { stateName: stateNameFromCode(d.stateCode) } : {}),
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'client.update', entity: 'client', entityId: id,
      summary: `Updated client details`,
    });

    revalidatePath('/clients');
    revalidatePath(`/clients/${id}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Follow-ups ----------

export async function createFollowUpAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = followUpSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('followup', 'create');
    const d = parsed.data;

    const followUp = await prisma.followUp.create({
      data: {
        leadId: d.leadId || null,
        clientId: d.clientId || null,
        channel: d.channel,
        subject: d.subject,
        notes: d.notes,
        dueAt: new Date(d.dueAt),
        assigneeId: d.assigneeId || user.id,
      },
    });

    if (d.leadId) {
      await prisma.lead.update({
        where: { id: d.leadId },
        data: { nextFollowUpAt: followUp.dueAt },
      });
    }

    revalidatePath('/follow-ups');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function completeFollowUpAction(
  id: string,
  outcome: string
): Promise<ActionResult> {
  try {
    const user = await requirePermission('followup', 'update');
    const followUp = await prisma.followUp.update({
      where: { id },
      data: { status: 'DONE', completedAt: new Date(), outcome },
    });

    if (followUp.leadId) {
      await prisma.lead.update({
        where: { id: followUp.leadId },
        data: { lastContactedAt: new Date(), nextFollowUpAt: null },
      });
      await prisma.activity.create({
        data: {
          leadId: followUp.leadId, actorId: user.id, type: 'follow_up',
          body: `${followUp.channel}: ${followUp.subject} — ${outcome}`,
        },
      });
    }

    revalidatePath('/follow-ups');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Projects & delivery ----------

export async function createProjectAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = projectSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('project', 'create');
    const d = parsed.data;
    const count = await prisma.project.count();

    const project = await prisma.project.create({
      data: {
        code: d.code || `PRJ-${String(count + 1).padStart(4, '0')}`,
        name: d.name,
        description: d.description,
        clientId: d.clientId,
        sowId: d.sowId || null,
        status: d.status,
        priority: d.priority,
        leadDevId: d.leadDevId || null,
        startDate: d.startDate ? new Date(d.startDate) : null,
        targetEndDate: d.targetEndDate ? new Date(d.targetEndDate) : null,
        budgetHours: d.budgetHours ? d.budgetHours.replace(/[,\s]/g, '') : null,
        members: d.leadDevId ? { create: [{ userId: d.leadDevId, roleLabel: 'Tech Lead' }] } : undefined,
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'project.create', entity: 'project', entityId: project.id,
      summary: `Created project ${project.code} — ${project.name}`,
    });

    revalidatePath('/projects');
    return { ok: true, data: { id: project.id } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Update a milestone and recompute the project's progress percentage.
 * Progress is derived, never entered by hand, so the client portal can't drift
 * from the actual milestone state.
 */
export async function updateMilestoneAction(
  id: string,
  status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'APPROVED'
): Promise<ActionResult> {
  try {
    const user = await requirePermission('milestone', 'update');

    const milestone = await prisma.milestone.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'COMPLETED' || status === 'APPROVED' ? new Date() : null,
        approvedAt: status === 'APPROVED' ? new Date() : null,
      },
      include: { project: { select: { id: true, name: true, clientId: true } } },
    });

    const all = await prisma.milestone.findMany({
      where: { projectId: milestone.projectId },
      select: { status: true },
    });
    const done = all.filter((m) => m.status === 'COMPLETED' || m.status === 'APPROVED').length;
    const progressPct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;

    await prisma.project.update({
      where: { id: milestone.projectId },
      data: { progressPct },
    });

    if (status === 'COMPLETED') {
      await notify({
        type: 'MILESTONE_COMPLETED',
        title: `Milestone complete — ${milestone.title}`,
        body: `${milestone.project.name} is now ${progressPct}% complete.`,
        linkUrl: `/projects/${milestone.projectId}`,
        roles: ['SUPER_ADMIN', 'SUB_ADMIN'],
      });
    }

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'milestone.update', entity: 'milestone', entityId: id,
      summary: `${milestone.title} → ${status} (project now ${progressPct}%)`,
    });

    revalidatePath(`/projects/${milestone.projectId}`);
    revalidatePath('/portal');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createProgressLogAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = progressLogSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('progresslog', 'create');
    const d = parsed.data;
    const logDate = new Date(d.logDate);
    logDate.setHours(0, 0, 0, 0);

    // One log per developer per project per day — upsert rather than reject.
    await prisma.progressLog.upsert({
      where: {
        projectId_authorId_logDate: { projectId: d.projectId, authorId: user.id, logDate },
      },
      create: {
        projectId: d.projectId, authorId: user.id, logDate,
        hoursSpent: d.hoursSpent, summary: d.summary,
        blockers: d.blockers, nextSteps: d.nextSteps,
        clientVisible: d.clientVisible,
      },
      update: {
        hoursSpent: d.hoursSpent, summary: d.summary,
        blockers: d.blockers, nextSteps: d.nextSteps,
        clientVisible: d.clientVisible,
      },
    });

    revalidatePath('/progress-logs');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createIssueAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = issueSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('issue', 'create');
    const d = parsed.data;

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: d.projectId },
      select: { code: true },
    });
    const count = await prisma.issue.count({ where: { projectId: d.projectId } });

    await prisma.issue.create({
      data: {
        projectId: d.projectId,
        key: `${project.code.split('-')[0]}-${String(count + 101)}`,
        title: d.title, description: d.description,
        severity: d.severity, stepsToReproduce: d.stepsToReproduce,
        environment: d.environment,
        reporterId: user.id, assigneeId: d.assigneeId || null,
      },
    });

    revalidatePath('/issues');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateIssueStatusAction(
  id: string,
  status: 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'WONT_FIX'
): Promise<ActionResult> {
  try {
    await requirePermission('issue', 'update');
    await prisma.issue.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date() : null,
      },
    });
    revalidatePath('/issues');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Tasks ----------

export async function createTaskAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = taskSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('task', 'create');
    const d = parsed.data;

    const task = await prisma.task.create({
      data: {
        title: d.title, description: d.description,
        status: d.status, priority: d.priority,
        assigneeId: d.assigneeId || null,
        projectId: d.projectId || null,
        department: d.department,
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        createdById: user.id,
      },
    });

    if (d.assigneeId && d.assigneeId !== user.id) {
      await notify({
        type: 'TASK_ASSIGNED',
        title: `Task assigned: ${task.title}`,
        linkUrl: '/tasks',
        alsoUserIds: [d.assigneeId],
      });
    }

    revalidatePath('/tasks');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateTaskStatusAction(
  id: string,
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'DONE' | 'CANCELLED'
): Promise<ActionResult> {
  try {
    await requirePermission('task', 'update');
    await prisma.task.update({
      where: { id },
      data: { status, completedAt: status === 'DONE' ? new Date() : null },
    });
    revalidatePath('/tasks');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Expenses ----------

export async function createExpenseAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = expenseSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('expense', 'create');
    const d = parsed.data;

    await prisma.expense.create({
      data: {
        title: d.title, category: d.category,
        amount: d.amount.replace(/[,\s]/g, ''),
        gstAmount: d.gstAmount ? d.gstAmount.replace(/[,\s]/g, '') : '0',
        itcEligible: d.itcEligible, vendor: d.vendor,
        currency: d.currency,
        expenseDate: new Date(d.expenseDate),
        clientId: d.clientId || null,
        projectId: d.projectId || null,
        notes: d.notes,
        ownerId: user.id,
      },
    });

    revalidatePath('/expenses');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function approveExpenseAction(id: string, approve: boolean): Promise<ActionResult> {
  try {
    const user = await requirePermission('expense', 'approve');
    const expense = await prisma.expense.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approverId: user.id,
        approvedAt: approve ? new Date() : null,
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: approve ? 'expense.approve' : 'expense.reject',
      entity: 'expense', entityId: id,
      summary: `${approve ? 'Approved' : 'Rejected'} expense: ${expense.title}`,
    });

    revalidatePath('/expenses');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
