import { prisma } from "@nutriagent/db";
import { TEXT2SQL_TIMEOUT_MS } from "./schema";

export async function executeSQL(sql: string, userId: number): Promise<Record<string, unknown>[]> {
  const timeoutMs = TEXT2SQL_TIMEOUT_MS;

  const rows = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE text2sql_user`);
      await tx.$executeRawUnsafe(`SET LOCAL app.current_user_id = '${userId.toString()}'`);
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${timeoutMs}'`);
      const result = await tx.$queryRawUnsafe<Record<string, unknown>[]>(sql);
      return result;
    },
    { timeout: timeoutMs + 2000 }
  );

  return Array.isArray(rows) ? rows : [];
}
