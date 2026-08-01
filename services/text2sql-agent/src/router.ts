import { Router } from "express";
import { generateSQL } from "./generateSQL";
import { formatAnswer } from "./formatAnswer";
import { executeSQL } from "./executeSQL";
import { TEXT2SQL_SCHEMA_DESCRIPTION } from "./schema";
import { SqlValidationError, validateSQL } from "./validateSQL";
import { logText2SqlQuery } from "./audit";

export const text2sqlRouter = Router();

text2sqlRouter.post("/query", async (req, res) => {
  const { userId, question, includeSql, debugSql, preferredLanguage } = req.body as {
    userId: number;
    question: string;
    includeSql?: boolean;
    debugSql?: boolean;
    preferredLanguage?: string | null;
  };

  if (!userId || !question?.trim()) {
    res.status(400).json({ error: "userId and question are required" });
    return;
  }

  const showSql =
    includeSql === true ||
    debugSql === true ||
    process.env.TEXT2SQL_DEBUG_SQL === "true";

  let generatedSql: string | undefined;
  let validatedSql: string | undefined;

  try {
    generatedSql = await generateSQL(question.trim(), TEXT2SQL_SCHEMA_DESCRIPTION);
    validatedSql = validateSQL(generatedSql, userId);
    const rows = await executeSQL(validatedSql, userId);
    const answer = await formatAnswer(question.trim(), rows, preferredLanguage);

    await logText2SqlQuery({
      userId,
      question: question.trim(),
      generatedSql,
      validatedSql,
      validationPassed: true,
      rowCount: rows.length,
    });

    res.json({
      answer,
      rowCount: rows.length,
      ...(showSql ? { sql: validatedSql } : {}),
    });
  } catch (err) {
    const validationError =
      err instanceof SqlValidationError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Text2SQL query failed";

    await logText2SqlQuery({
      userId,
      question: question.trim(),
      generatedSql,
      validatedSql,
      validationPassed: false,
      validationError,
    }).catch(() => {
      /* audit failure must not mask original error */
    });

    if (err instanceof SqlValidationError) {
      res.status(400).json({ error: validationError, rowCount: 0 });
      return;
    }

    res.status(500).json({ error: validationError, rowCount: 0 });
  }
});
