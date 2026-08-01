import { Router } from "express";
import { z } from "zod";
import { prisma } from "@nutriagent/db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

export const usersRouter = Router();

const languageBodySchema = z
  .object({
    preferredLanguage: z.enum(["he", "en", "ru"], {
      errorMap: () => ({ message: "preferredLanguage must be 'he', 'en', or 'ru'" }),
    }),
  })
  .strict();

usersRouter.patch("/me/language", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const body = languageBodySchema.parse(req.body);
    const userId = req.user!.userId;

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: { preferredLanguage: body.preferredLanguage },
      create: {
        userId,
        preferredLanguage: body.preferredLanguage,
      },
      select: { preferredLanguage: true },
    });

    res.json({ preferredLanguage: profile.preferredLanguage });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: err.errors[0]?.message ?? "preferredLanguage must be 'he', 'en', or 'ru'",
      });
      return;
    }
    next(err);
  }
});
