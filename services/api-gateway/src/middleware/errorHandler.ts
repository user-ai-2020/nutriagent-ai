import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  // Streaming responses (and any handler that already replied before throwing)
  // leave headers sent; writing again throws ERR_HTTP_HEADERS_SENT and takes
  // down the request. Hand those to express's default handler, which closes the
  // socket instead.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: err.errors[0]?.message ?? "Invalid request" });
    return;
  }
  console.error(err);
  // `err` is typed as Error but express forwards whatever was thrown — a string
  // or a rejected non-Error would have crashed on `.message`.
  const message = err instanceof Error ? err.message : String(err ?? "");
  const safeMessage =
    process.env.NODE_ENV === "production" ? "Internal server error" : message || "Internal server error";
  res.status(500).json({ error: safeMessage });
}
