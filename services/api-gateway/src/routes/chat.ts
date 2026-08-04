import { Router } from "express";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs";
import { createId, openRouterChat } from "@nutriagent/shared";
import { z } from "zod";
import { prisma, Prisma, getCachedLlmSettings } from "@nutriagent/db";
import {
  AUDIT_ACTIONS,
  createImageStorage,
  detectImageMime,
  mealImageStorageKey,
  processMealImage,
} from "@nutriagent/shared";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { callOrchestrator } from "../lib/orchestrator";
import { toUserProfileData } from "../lib/profile";

export const chatRouter = Router();
chatRouter.use(authMiddleware);

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `nutriagent-${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

const messageSchema = z.object({
  message: z.string().min(1),
  mealId: z.number().optional(),
  sessionId: z.number().optional(),
  /** ISO 8601 or browser local "YYYY-MM-DDTHH:mm" — when logging a meal photo for another day/time. */
  mealDatetime: z.string().min(1).optional(),
  mealType: mealTypeSchema.optional(),
});

/**
 * The structured payload behind an assistant turn, persisted on chat_history so a
 * chat reopened from the history picker can re-render meal cards and charts
 * rather than degrading to plain text. Returns undefined for plain replies so we
 * don't write empty JSON objects for every message.
 */
function buildStoredAnalysis(result: {
  itemsDetected?: boolean;
  mealAnalysis?: unknown;
  multiModelMealAnalysis?: unknown;
  nutritionHistory?: unknown;
}): Prisma.InputJsonValue | undefined {
  const stored: Record<string, unknown> = {};
  if (result.multiModelMealAnalysis) stored.multiModelMealAnalysis = result.multiModelMealAnalysis;
  if (result.mealAnalysis) stored.mealAnalysis = result.mealAnalysis;
  if (result.nutritionHistory) stored.nutritionHistory = result.nutritionHistory;
  if (result.itemsDetected !== undefined) stored.itemsDetected = result.itemsDetected;

  // Only `itemsDetected` on its own isn't worth a row of JSON.
  const hasPayload =
    stored.multiModelMealAnalysis || stored.mealAnalysis || stored.nutritionHistory;
  return hasPayload ? (stored as Prisma.InputJsonValue) : undefined;
}

chatRouter.post("/session", async (req: AuthRequest, res, next) => {
  try {
    const session = await prisma.chatSession.create({
      data: {
        userId: req.user!.userId,
      },
    });
    res.json(session);
  } catch (err) {
    next(err);
  }
});

/**
 * Past chat sessions for the sidebar/history picker, newest first, each with a
 * preview taken from its first user message. Sessions are capped at 5 per user by
 * the orchestrator's enforceChatCap node, so no pagination is needed here.
 */
chatRouter.get("/sessions", async (req: AuthRequest, res, next) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          where: { role: "user" },
          orderBy: { timestamp: "asc" },
          take: 1,
          select: { content: true },
        },
        _count: { select: { messages: true } },
      },
    });

    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        messageCount: s._count.messages,
        preview: s.messages[0]?.content ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  he: "Hebrew",
  ru: "Russian",
};

/**
 * Translates stored chat messages into the language the user is currently using.
 * Past messages are frozen in the language the AI wrote them in; templated meal
 * results are re-rendered client-side from structured data, but free-form advice
 * needs a model. Results are cached on the row (`analysis.translations[lang]`) so
 * each message costs at most one call per language.
 */
chatRouter.post("/translate", async (req: AuthRequest, res, next) => {
  try {
    const { messageIds, targetLanguage } = req.body as {
      messageIds?: unknown;
      targetLanguage?: unknown;
    };

    const lang = typeof targetLanguage === "string" ? targetLanguage : "";
    if (!LANGUAGE_NAMES[lang]) {
      return res.status(400).json({ error: "targetLanguage must be one of en, he, ru" });
    }
    const ids = Array.isArray(messageIds)
      ? messageIds.map(Number).filter((n) => Number.isInteger(n)).slice(0, 50)
      : [];
    if (!ids.length) return res.json({ translations: {} });

    // userId in the filter: never translate (or reveal) another user's messages.
    const rows = await prisma.chatHistory.findMany({
      where: { userId: req.user!.userId, messageId: { in: ids } },
      select: { messageId: true, content: true, analysis: true },
    });

    const settings = await getCachedLlmSettings();
    const translations: Record<number, string> = {};

    for (const row of rows) {
      const stored = (row.analysis ?? {}) as Record<string, any>;
      const cached = stored.translations?.[lang];
      if (typeof cached === "string") {
        translations[row.messageId] = cached;
        continue;
      }
      if (!row.content?.trim()) continue;

      try {
        const translated = await openRouterChat({
          apiKey: settings.openRouterApiKey,
          model: settings.chatModel,
          messages: [
            {
              role: "system",
              content:
                `Translate the user's message into ${LANGUAGE_NAMES[lang]}. ` +
                `Reply with ONLY the translation — no preamble, no quotes. ` +
                `Preserve line breaks, bullet characters, emoji, numbers and units exactly. ` +
                `Leave food names, brand names and model names untranslated if they have no common translation. ` +
                `If the text is already in ${LANGUAGE_NAMES[lang]}, return it unchanged.`,
            },
            { role: "user", content: row.content },
          ],
        });

        if (!translated?.trim()) continue;
        translations[row.messageId] = translated;

        // Cache alongside the message so repeat views are free.
        await prisma.chatHistory.update({
          where: { messageId: row.messageId },
          data: {
            analysis: {
              ...stored,
              translations: { ...(stored.translations ?? {}), [lang]: translated },
            } as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        console.warn(`Translation failed for message ${row.messageId}:`, err);
        // Best-effort: skip this message, keep the rest.
      }
    }

    res.json({ translations });
  } catch (err) {
    next(err);
  }
});

chatRouter.get("/history", async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    // Optional: restrict to one session so the UI can reopen a past chat.
    const sessionId = req.query.sessionId ? Number(req.query.sessionId) : undefined;
    const messages = await prisma.chatHistory.findMany({
      // userId stays in the filter even with sessionId set — never trust a
      // session id from the client to scope another user's messages.
      where: { userId: req.user!.userId, ...(sessionId ? { sessionId } : {}) },
      orderBy: { timestamp: "asc" },
      take: limit + 1,
      ...(cursor ? { cursor: { messageId: cursor }, skip: 1 } : {}),
    });
    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? result[result.length - 1]?.messageId : undefined;
    res.json({ messages: result, nextCursor });
  } catch (err) {
    next(err);
  }
});

chatRouter.post("/message", upload.single("image"), async (req: AuthRequest, res, next) => {
  try {
    const body = messageSchema.parse({
      message: req.body.message,
      mealId: req.body.mealId ? Number(req.body.mealId) : undefined,
      sessionId: req.body.sessionId ? Number(req.body.sessionId) : undefined,
      mealDatetime:
        typeof req.body.mealDatetime === "string" && req.body.mealDatetime.trim()
          ? req.body.mealDatetime.trim()
          : undefined,
      mealType:
        typeof req.body.mealType === "string" && req.body.mealType.trim()
          ? req.body.mealType.trim().toLowerCase()
          : undefined,
    });

    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.user!.userId },
    });

    let imageBase64: string | undefined;
    let imageMime: string | undefined;
    let mealImage:
      | {
          id: string;
          storageKey: string;
          width: number;
          height: number;
          fileSizeBytes: number;
          contentHash: string;
          capturedAt: string;
          displayUrl: string;
        }
      | undefined;

    if (req.file) {
      const fileBuffer = await fs.promises.readFile(req.file.path);
      const processed = await processMealImage(fileBuffer);
      const imageId = createId();
      const storageKey = mealImageStorageKey(req.user!.userId, imageId);
      const storage = createImageStorage();
      const uploaded = await storage.upload(processed.buffer, storageKey);

      imageBase64 = processed.buffer.toString("base64");
      imageMime = processed.mimeType;
      mealImage = {
        id: imageId,
        storageKey,
        width: processed.width,
        height: processed.height,
        fileSizeBytes: processed.fileSizeBytes,
        contentHash: processed.contentHash,
        capturedAt: body.mealDatetime
          ? (() => {
              const d = new Date(body.mealDatetime!);
              return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
            })()
          : new Date().toISOString(),
        displayUrl: uploaded.url,
      };

      // Clean up temp file
      fs.promises.unlink(req.file.path).catch(() => {});
    }

    let finalSessionId = body.sessionId;
    if (!finalSessionId) {
      // Find latest session or create one
      const latest = await prisma.chatSession.findFirst({
        where: { userId: req.user!.userId },
        orderBy: { createdAt: "desc" },
      });
      if (latest) {
        finalSessionId = latest.id;
      } else {
        const newSession = await prisma.chatSession.create({
          data: { userId: req.user!.userId },
        });
        finalSessionId = newSession.id;
      }
    }

    await prisma.chatHistory.create({
      data: {
        userId: req.user!.userId,
        role: "user",
        content: body.message,
        mealId: body.mealId,
        sessionId: finalSessionId,
      },
    });

    const profileData = toUserProfileData(profile);

    console.log("Calling callOrchestrator for message:", body.message);
    const result = await callOrchestrator({
      userId: req.user!.userId,
      message: body.message,
      imageBase64,
      imageMime,
      mealId: body.mealId,
      profile: profileData,
      mealImage,
      imageUrl: mealImage?.displayUrl,
      sessionId: finalSessionId,
      mealDatetime: body.mealDatetime,
      mealType: body.mealType,
    });

    if (result.intent === "clarify_vision") {
      // Don't save assistant message or log meal yet, just return the intent to client
      return res.json(result);
    }

    await prisma.chatHistory.create({
      data: {
        userId: req.user!.userId,
        role: "assistant",
        content: result.reply,
        mealId: result.mealId,
        sources: result.sources,
        analysis: buildStoredAnalysis(result),
        sessionId: finalSessionId,
      },
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: result.mealId ? AUDIT_ACTIONS.MEAL_CAPTURE : AUDIT_ACTIONS.CHAT_MESSAGE,
      details: {
        intent: result.intent,
        agentPath: result.agentPath,
        sources: result.sources,
        mealImageId: mealImage?.id,
      },
      sourceIp: req.ip,
    });

    res.json(result);
  } catch (err) {
    console.error("Caught error in POST /message:", err);
    next(err);
  }
});

chatRouter.post("/resume", async (req: AuthRequest, res, next) => {
  try {
    const { answer, sessionId, threadId } = req.body;
    if (!sessionId || !answer) {
      return res.status(400).json({ error: "Missing sessionId or answer" });
    }

    await prisma.chatHistory.create({
      data: {
        userId: req.user!.userId,
        role: "user",
        content: answer,
        sessionId: Number(sessionId),
      },
    });

    const { resumeOrchestrator } = require("../lib/orchestrator");

    // Resume the exact graph thread that paused. Falling back to sessionId keeps
    // older clients working, but they can only resume runs started before graph
    // threads became per-message.
    const result = await resumeOrchestrator(threadId ?? Number(sessionId), answer);

    if (result.intent === "clarify_vision") {
      return res.json(result);
    }

    await prisma.chatHistory.create({
      data: {
        userId: req.user!.userId,
        role: "assistant",
        content: result.reply,
        mealId: result.mealId,
        sources: result.sources,
        analysis: buildStoredAnalysis(result),
        sessionId: Number(sessionId),
      },
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: result.mealId ? AUDIT_ACTIONS.MEAL_CAPTURE : AUDIT_ACTIONS.CHAT_MESSAGE,
      details: {
        intent: result.intent,
        agentPath: result.agentPath,
        sources: result.sources,
      },
      sourceIp: req.ip,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
