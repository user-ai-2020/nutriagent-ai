import { Parser, type Select } from "node-sql-parser";
import {
  ALLOWED_TABLES,
  MEALS_REQUIRED_TABLES,
  TEXT2SQL_MAX_ROWS,
  USER_SCOPED_TABLES,
} from "./schema";

const parser = new Parser();
const PG_OPT = { database: "Postgresql" } as const;

const BLOCKED_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|CALL)\b/i;

const TABLE_WHITELIST = [...ALLOWED_TABLES].map((t) => `select::null::${t}`);

export class SqlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlValidationError";
  }
}

type TableRef = { table: string; alias: string };

function normalizeTableName(name: string): string {
  return name.replace(/^"/, "").replace(/"$/, "").toLowerCase();
}

function tablesFromList(tableList: string[] | undefined): Set<string> {
  const tables = new Set<string>();
  for (const entry of tableList ?? []) {
    const parts = entry.split("::");
    const name = normalizeTableName(parts[parts.length - 1] ?? "");
    if (name) tables.add(name);
  }
  return tables;
}

function collectFromRefs(from: unknown[], refs: Map<string, TableRef>): void {
  for (const item of from) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;

    if (typeof entry.table === "string") {
      const table = normalizeTableName(entry.table);
      const alias =
        typeof entry.as === "string" && entry.as.trim()
          ? normalizeTableName(entry.as)
          : table;
      refs.set(table, { table, alias });
    }

    const expr = entry.expr as { ast?: Select } | undefined;
    if (expr?.ast) walkSelect(expr.ast, refs);

    if (Array.isArray(entry.from)) {
      collectFromRefs(entry.from, refs);
    }
  }
}

function walkSelect(select: Select, refs: Map<string, TableRef>): void {
  if (Array.isArray(select.from)) collectFromRefs(select.from, refs);
  if (select.with) {
    for (const cte of select.with) {
      if (cte.stmt?.ast) walkSelect(cte.stmt.ast, refs);
    }
  }
  if (select._next) walkSelect(select._next, refs);
  walkExprSubqueries(select.where, refs);
}

function walkExprSubqueries(node: unknown, refs: Map<string, TableRef>): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "select" && Array.isArray(obj.from)) {
    walkSelect(obj as unknown as Select, refs);
  }
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) value.forEach((v) => walkExprSubqueries(v, refs));
    else if (value && typeof value === "object") walkExprSubqueries(value, refs);
  }
}

function userIdExpr(tableAlias: string, userId: number) {
  return {
    type: "binary_expr",
    operator: "=",
    left: { type: "column_ref", table: tableAlias, column: "user_id" },
    right: { type: "number", value: userId },
  };
}

function andExpr(left: unknown, right: unknown) {
  return { type: "binary_expr", operator: "AND", left, right };
}

function resolveAlias(refs: Map<string, TableRef>, table: string): string {
  return refs.get(table)?.alias ?? table;
}

function injectUserScope(select: Select, userId: number, refs: Map<string, TableRef>): void {
  const conditions: unknown[] = [];
  for (const table of USER_SCOPED_TABLES) {
    if (refs.has(table)) conditions.push(userIdExpr(resolveAlias(refs, table), userId));
  }
  if (conditions.length === 0) {
    throw new SqlValidationError(
      "Query must reference at least one user-scoped table (meals, meal_images, user_profiles)"
    );
  }
  let merged = conditions[0];
  for (let i = 1; i < conditions.length; i++) merged = andExpr(merged, conditions[i]);

  if (select.where) {
    const wrapped = { ...(select.where as object), parentheses: true };
    select.where = andExpr(wrapped, merged) as Select["where"];
  } else {
    select.where = merged as Select["where"];
  }
}

function enforceLimit(select: Select): void {
  const limitValue = select.limit?.value?.[0];
  const current =
    limitValue && typeof limitValue === "object" && "value" in limitValue
      ? Number((limitValue as { value: number }).value)
      : null;
  const capped =
    current && Number.isFinite(current) ? Math.min(current, TEXT2SQL_MAX_ROWS) : TEXT2SQL_MAX_ROWS;
  select.limit = { seperator: "", value: [{ type: "number", value: capped }] };
}

function parseSelectStatement(sql: string): { select: Select; tableList: string[] } {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) throw new SqlValidationError("Empty SQL");
  if (trimmed.includes(";")) throw new SqlValidationError("Multiple statements are not allowed");
  if (BLOCKED_KEYWORDS.test(trimmed)) throw new SqlValidationError("Only SELECT queries are allowed");
  if (!/^\s*SELECT\b/i.test(trimmed)) throw new SqlValidationError("Query must start with SELECT");

  let parsed: { ast: Select | Select[]; tableList?: string[] };
  try {
    parsed = parser.parse(trimmed, PG_OPT) as { ast: Select | Select[]; tableList?: string[] };
  } catch {
    throw new SqlValidationError("Invalid SQL syntax");
  }

  const statement = Array.isArray(parsed.ast) ? parsed.ast[0] : parsed.ast;
  if (!statement || statement.type !== "select") {
    throw new SqlValidationError("Only SELECT queries are allowed");
  }

  return { select: statement, tableList: parsed.tableList ?? [] };
}

export function validateSQL(sql: string, userId: number): string {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new SqlValidationError("Invalid userId");
  }

  const { select, tableList } = parseSelectStatement(sql);

  try {
    parser.whiteListCheck(sql, TABLE_WHITELIST, { ...PG_OPT, type: "table" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Table not allowed";
    const match = msg.match(/authority = '([^']+)'/i);
    const denied = match?.[1]?.split("::").pop() ?? "unknown";
    throw new SqlValidationError(`Table not allowed: ${denied}`);
  }

  const refs = new Map<string, TableRef>();
  walkSelect(select, refs);
  const tables = tablesFromList(tableList);
  for (const table of tables) refs.set(table, refs.get(table) ?? { table, alias: table });

  if (tables.size === 0) {
    throw new SqlValidationError("Query must reference at least one allowed table");
  }

  const usesMealsRequired = [...MEALS_REQUIRED_TABLES].some((t) => tables.has(t));
  if (usesMealsRequired && !tables.has("meals")) {
    throw new SqlValidationError("Queries on meal_items or nutrition_values must JOIN meals");
  }

  injectUserScope(select, userId, refs);
  enforceLimit(select);

  return parser.sqlify(select, PG_OPT);
}
