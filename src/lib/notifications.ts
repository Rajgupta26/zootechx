import type { NotificationType, Role, Prisma } from '@prisma/client';
import { prisma } from './db';

/**
 * In-app notifications.
 *
 * Fan-out is by role and/or explicit user list. Reads are polled by the bell
 * component every 30s — deliberately simple, because a WebSocket layer would
 * pin this app to a stateful host. Swap `getUnread` for an SSE stream if you
 * move off serverless.
 */

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
  /** Everyone holding one of these roles is notified. */
  roles?: Role[];
  alsoUserIds?: string[];
  metadata?: Prisma.InputJsonValue;
}

export async function notify(input: NotifyInput): Promise<number> {
  const recipientIds = new Set<string>(input.alsoUserIds ?? []);

  if (input.roles?.length) {
    const users = await prisma.user.findMany({
      where: { role: { in: input.roles }, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    users.forEach((u) => recipientIds.add(u.id));
  }

  if (recipientIds.size === 0) return 0;

  const result = await prisma.notification.createMany({
    data: [...recipientIds].map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl,
      metadata: input.metadata,
    })),
  });

  return result.count;
}

export async function getUnread(userId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { userId, isRead: false },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getNotifications(userId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markRead(userId: string, notificationId?: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false, ...(notificationId ? { id: notificationId } : {}) },
    data: { isRead: true, readAt: new Date() },
  });
}
