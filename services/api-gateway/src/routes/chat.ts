import { Router } from "express";
import multer from "multer";
import path from "path";
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
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const messageSchema = z.object({
  message: z.string().min(1),
  mealId: z.number().optional(),
});

chatRouter.get("/history", async (req: AuthRequest, res, next) => {
  try {
    const messages = await prisma.chatHistory.findMany({
      where: { userId: req.user!.userId },
      orderBy: { timestamp: "asc" },
      take: 100,
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

chatRouter.post("/message", upload.single("image"), async (req: AuthRequest, res, next) => {
  try {
    const body = messageSchema.parse({
      message: req.body.message,
      mealId: req.body.mealId ? Number(req.body.mealId) : undefined,
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
      const processed = await processMealImage(req.file.buffer);
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
    }

    await prisma.chatHistory.create({
      data: {
        userId: req.user!.userId,
        role: "user",
        content: body.message,
        mealId: body.mealId,
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
    });

    await prisma.chatHistory.create({
      data: {
        userId: req.user!.userId,
        role: "assistant",
        content: result.reply,
        mealId: result.mealId,
        sources: result.sources,
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
