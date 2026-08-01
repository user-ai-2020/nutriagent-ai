import { Router } from "express";
import multer from "multer";
import os from "os";
import fs from "fs";
import { z } from "zod";
import { prisma } from "@nutriagent/db";
import {
  AUDIT_ACTIONS,
  createImageStorage,
  createId,
  processMealImage,
} from "@nutriagent/shared";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";

export const activityRouter = Router();
activityRouter.use(authMiddleware);

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `nutriagent-act-${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Zod schemas
const logActivitySchema = z.object({
  activityType: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  caloriesBurned: z.number().int().positive().optional(),
  timestamp: z.string().datetime().optional(),
});

const logStepsSchema = z.object({
  steps: z.number().int().positive(),
  date: z.string().datetime().optional(), // YYYY-MM-DD or full ISO
});

// 1. POST /api/activity/log
activityRouter.post("/log", upload.single("image"), async (req: AuthRequest, res, next) => {
  try {
    const body = logActivitySchema.parse({
      activityType: req.body.activityType,
      durationMinutes: Number(req.body.durationMinutes),
      caloriesBurned: req.body.caloriesBurned ? Number(req.body.caloriesBurned) : undefined,
      timestamp: req.body.timestamp,
    });

    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();

    const exerciseLog = await prisma.exerciseLog.create({
      data: {
        userId: req.user!.userId,
        activityType: body.activityType,
        durationMinutes: body.durationMinutes,
        caloriesBurned: body.caloriesBurned,
        timestamp,
      },
    });

    if (req.file) {
      const fileBuffer = await fs.promises.readFile(req.file.path);
      const processed = await processMealImage(fileBuffer);
      const imageId = createId();
      // We reuse the storage bucket logic but use exercise as prefix if needed
      // Actually we just generate a storage key: `users/${userId}/exercise/${imageId}.jpg`
      const storageKey = `users/${req.user!.userId}/exercise/${imageId}.jpg`;
      const storage = createImageStorage();
      await storage.upload(processed.buffer, storageKey);

      await prisma.exerciseImage.create({
        data: {
          id: imageId,
          exerciseId: exerciseLog.id,
          userId: req.user!.userId,
          storageKey,
          width: processed.width,
          height: processed.height,
          fileSizeBytes: processed.fileSizeBytes,
          contentHash: processed.contentHash,
          capturedAt: new Date(),
        },
      });

      fs.promises.unlink(req.file.path).catch(() => {});
    }

    const updatedLog = await prisma.exerciseLog.findUnique({
      where: { id: exerciseLog.id },
      include: { images: true },
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: "ACTIVITY_LOG",
      details: {
        activityType: body.activityType,
        durationMinutes: body.durationMinutes,
        exerciseId: exerciseLog.id,
      },
      sourceIp: req.ip,
    });

    res.json(updatedLog);
  } catch (err) {
    if (req.file) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
    next(err);
  }
});

// 2. POST /api/activity/steps
activityRouter.post("/steps", async (req: AuthRequest, res, next) => {
  try {
    const body = logStepsSchema.parse({
      steps: Number(req.body.steps),
      date: req.body.date,
    });

    const date = body.date ? new Date(body.date) : new Date();
    // Normalize to midnight UTC for the date field
    const normalizedDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    const dailySteps = await prisma.dailySteps.upsert({
      where: {
        userId_date: {
          userId: req.user!.userId,
          date: normalizedDate,
        },
      },
      update: {
        steps: body.steps,
      },
      create: {
        userId: req.user!.userId,
        date: normalizedDate,
        steps: body.steps,
        source: "manual",
      },
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: "STEPS_LOG",
      details: {
        steps: body.steps,
        date: normalizedDate.toISOString(),
      },
      sourceIp: req.ip,
    });

    // Update user profile todaySteps if it is today
    const today = new Date();
    if (
      normalizedDate.getUTCFullYear() === today.getUTCFullYear() &&
      normalizedDate.getUTCMonth() === today.getUTCMonth() &&
      normalizedDate.getUTCDate() === today.getUTCDate()
    ) {
      await prisma.userProfile.update({
        where: { userId: req.user!.userId },
        data: { todaySteps: dailySteps.steps },
      });
    }

    res.json(dailySteps);
  } catch (err) {
    next(err);
  }
});
