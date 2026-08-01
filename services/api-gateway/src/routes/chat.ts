import { Router } from "express";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs";
import { createId } from "@nutriagent/shared";
import { z } from "zod";
import { prisma } from "@nutriagent/db";
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

const messageSchema = z.object({
  message: z.string().min(1),
  mealId: z.number().optional(),
  sessionId: z.number().optional(),
});

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

chatRouter.get("/history", async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const messages = await prisma.chatHistory.findMany({
      where: { userId: req.user!.userId },
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
        capturedAt: new Date().toISOString(),
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
    next(err);
  }
});

chatRouter.post("/resume", async (req: AuthRequest, res, next) => {
  try {
    const { answer, sessionId } = req.body;
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
    
    const result = await resumeOrchestrator(Number(sessionId), answer);

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
