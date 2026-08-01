import { prisma, Prisma } from "@nutriagent/db";
import { AuditLogEntry, cacheAuditEntry } from "@nutriagent/shared";
import { getRedis } from "./redis";

export async function writeAuditLog(params: {
  userId?: number;
  actionType: string;
  details?: Record<string, unknown>;
  sourceIp?: string;
}): Promise<AuditLogEntry> {
  const record = await prisma.auditLog.create({
    data: {
      userId: params.userId,
      actionType: params.actionType,
      details: params.details as Prisma.InputJsonValue | undefined,
      sourceIp: params.sourceIp,
    },
  });

  const entry: AuditLogEntry = {
    logId: record.logId,
    userId: record.userId ?? undefined,
    actionType: record.actionType,
    details: (record.details as Record<string, unknown>) ?? undefined,
    sourceIp: record.sourceIp ?? undefined,
    timestamp: record.timestamp.toISOString(),
  };

  try {
    await cacheAuditEntry(getRedis(), entry);
  } catch {
    // Postgres remains source of truth
  }

  return entry;
}
