import { prisma } from "@nutriagent/db";
import { AUDIT_ACTIONS } from "@nutriagent/shared";

export async function logText2SqlQuery(params: {
  userId: number;
  question: string;
  generatedSql?: string;
  validatedSql?: string;
  validationPassed: boolean;
  validationError?: string;
  rowCount?: number;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      actionType: AUDIT_ACTIONS.TEXT2SQL_QUERY,
      details: {
        question: params.question,
        generatedSql: params.generatedSql,
        validatedSql: params.validatedSql,
        validationPassed: params.validationPassed,
        validationError: params.validationError,
        rowCount: params.rowCount,
      },
    },
  });
}
