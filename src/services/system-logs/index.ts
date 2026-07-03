import { SystemLogLevel, type Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type LogMetadata = Prisma.InputJsonValue;

type RecordSystemLogInput = {
  teamId?: string;
  level?: SystemLogLevel;
  source: string;
  event: string;
  message: string;
  workerId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: unknown;
};

type ListSystemLogsInput = {
  teamId: string;
  level?: SystemLogLevel;
  source?: string;
  query?: string;
  limit?: number;
};

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? value.slice(0, maxLength) : value;

const normalizeMetadata = (value: unknown): LogMetadata | undefined => {
  if (value === undefined) return undefined;

  try {
    return JSON.parse(
      JSON.stringify(value, (_key, item) => {
        if (item instanceof Error) {
          return {
            name: item.name,
            message: item.message,
            stack: item.stack,
          };
        }

        if (typeof item === "bigint") {
          return item.toString();
        }

        return item;
      }),
    ) as LogMetadata;
  } catch {
    return { value: String(value) };
  }
};

const mapSystemLog = (
  log: Prisma.SystemLogGetPayload<Record<string, never>>,
) => ({
  id: log.id,
  teamId: log.teamId ?? undefined,
  level: log.level,
  source: log.source,
  event: log.event,
  message: log.message,
  workerId: log.workerId ?? undefined,
  entityType: log.entityType ?? undefined,
  entityId: log.entityId ?? undefined,
  metadata: log.metadata ?? undefined,
  createdAt: log.createdAt.toISOString(),
});

export const recordSystemLog = async ({
  teamId,
  level = SystemLogLevel.INFO,
  source,
  event,
  message,
  workerId,
  entityType,
  entityId,
  metadata,
}: RecordSystemLogInput) => {
  try {
    const log = await prisma.systemLog.create({
      data: {
        teamId,
        level,
        source: truncate(source, 64),
        event: truncate(event, 120),
        message,
        workerId: workerId ? truncate(workerId, 255) : undefined,
        entityType: entityType ? truncate(entityType, 64) : undefined,
        entityId: entityId ? truncate(entityId, 255) : undefined,
        metadata: normalizeMetadata(metadata),
      },
    });

    return mapSystemLog(log);
  } catch {
    return null;
  }
};

export const listSystemLogs = async ({
  teamId,
  level,
  source,
  query,
  limit = 100,
}: ListSystemLogsInput) => {
  const normalizedLimit = Math.min(Math.max(limit, 1), 250);
  const trimmedQuery = query?.trim();
  const logs = await prisma.systemLog.findMany({
    where: {
      teamId,
      level,
      source: source || undefined,
      ...(trimmedQuery
        ? {
            OR: [
              { message: { contains: trimmedQuery, mode: "insensitive" } },
              { event: { contains: trimmedQuery, mode: "insensitive" } },
              { workerId: { contains: trimmedQuery, mode: "insensitive" } },
              { entityId: { contains: trimmedQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: normalizedLimit,
  });

  return logs.map(mapSystemLog);
};
