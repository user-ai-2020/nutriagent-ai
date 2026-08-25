import { Router } from "express";
import { getAiStatus } from "@nutriagent/db";

export const systemRouter = Router();

/** Public: whether OpenRouter is configured (does not expose the key). */
systemRouter.get("/ai-status", async (_req, res, next) => {
  try {
    const status = await getAiStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});
