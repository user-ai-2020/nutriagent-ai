import { prisma } from "@nutriagent/db";
import { TEXT2SQL_TIMEOUT_MS } from "./schema";

export async function executeSQL(sql: string, userId: number): Promise<Record<string, unknown>[]> {
  // userId is interpolated straight into `SET LOCAL app.current_user_id` below,
  // which is the value row-level security keys off. validateSQL() already checks
  // this, but executeSQL is exported and must not depend on its caller having
  // done so: a non-integer here would be raw SQL injection into the RLS setting.
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("executeSQL: userId must be a positive integer");
  }

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
