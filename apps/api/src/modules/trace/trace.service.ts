import { prisma } from '../../lib/prisma';

import type { TraceDto } from '@tiktop/shared';

export async function addTrace(args: {
  taskId: string;
  shotId?: string;
  stage: string;
  level?: 'info' | 'warn' | 'error';
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await prisma.taskTrace.create({
    data: {
      taskId: args.taskId,
      shotId: args.shotId,
      stage: args.stage,
      level: args.level ?? 'info',
      message: args.message,
      payloadJson: args.payload ? JSON.stringify(args.payload) : undefined,
    },
  });
}

export async function listTrace(taskId: string): Promise<TraceDto[]> {
  const rows = await prisma.taskTrace.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    shotId: row.shotId,
    stage: row.stage,
    level: row.level,
    message: row.message,
    payload: parsePayload(row.payloadJson),
    createdAt: row.createdAt.toISOString(),
  }));
}

function parsePayload(payloadJson: string | null): Record<string, unknown> | undefined {
  if (!payloadJson) return undefined;
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
