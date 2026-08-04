import { Router } from "express";
import { z } from "zod";
import { prisma } from "@nutriagent/db";
import { AUDIT_ACTIONS } from "@nutriagent/shared";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";

export const profileRouter = Router();
profileRouter.use(authMiddleware);

const profileSchema = z.object({
  dietGoals: z
    .object({
      dailyCalories: z.number().optional(),
      proteinGrams: z.number().optional(),
      carbsGrams: z.number().optional(),
      fatGrams: z.number().optional(),
    })
    .optional(),
  healthRestrictions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  dietType: z.string().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  age: z.number().int().optional(),
  // Inputs behind BMI / BMR (Mifflin-St Jeor) / TDEE and the calorie + protein target.
  sex: z.enum(["male", "female"]).optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
  fitnessGoal: z.enum(["lose_fat", "maintain", "build_muscle"]).optional(),
  dailyStepsGoal: z.number().int().optional(),
  todaySteps: z.number().int().optional(),
  preferredLanguage: z.enum(["en", "he", "ru"]).optional(),
});

profileRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    res.json(profile ?? {});
  } catch (err) {
    next(err);
  }
});

profileRouter.put("/", async (req: AuthRequest, res, next) => {
  try {
    const body = profileSchema.parse(req.body);
    const profile = await prisma.userProfile.upsert({
      where: { userId: req.user!.userId },
      update: body,
      create: { userId: req.user!.userId, ...body },
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: AUDIT_ACTIONS.PROFILE_UPDATE,
      sourceIp: req.ip,
    });

    res.json(profile);
  } catch (err) {
    next(err);
  }
});
