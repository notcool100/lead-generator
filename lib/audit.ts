import { prisma, type Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function audit(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch (err) {
    // Audit failures must never break the calling operation, but they must be visible.
    logger.error({ err, action: params.action }, "audit log write failed");
  }
}

export async function leadEvent(leadId: string, type: string, message: string, metadata?: Prisma.InputJsonValue) {
  await prisma.leadEvent.create({ data: { leadId, type, message, metadata } });
}
