import { Router } from "express";
import { z } from "zod";
import { prisma } from "@nutriagent/db";
import { AUDIT_ACTIONS, createImageStorage } from "@nutriagent/shared";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { recognizeMealFromImage } from "../lib/mealRecognition";
import { toUserProfileData } from "../lib/profile";

export const mealsRouter = Router();
mealsRouter.use(authMiddleware);

const mealInclude = {
  items: { include: { nutritionValues: true } },
  images: true,
} as const;

mealsRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const { from, to, q, mealType } = req.query;
    const where: {
      userId: number;
      mealDatetime?: { gte?: Date; lte?: Date };
      mealType?: string;
      OR?: Array<Record<string, unknown>>;
    } = {
      userId: req.user!.userId,
    };

    if (from || to) {
      where.mealDatetime = {};
      if (from) where.mealDatetime.gte = new Date(String(from));
      if (to) where.mealDatetime.lte = new Date(String(to));
    }
    if (mealType) where.mealType = String(mealType);
    if (q) {
      where.OR = [
        { items: { some: { foodType: { contains: String(q), mode: "insensitive" } } } },
        { source: { contains: String(q), mode: "insensitive" } },
      ];
    }

    const meals = await prisma.meal.findMany({
      where,
      include: mealInclude,
      orderBy: { mealDatetime: "desc" },
    });

    res.json(meals);
  } catch (err) {
    next(err);
  }
});

mealsRouter.get("/:mealId", async (req: AuthRequest, res, next) => {
  try {
    const meal = await prisma.meal.findFirst({
      where: {
        mealId: Number(req.params.mealId),
        userId: req.user!.userId,
      },
      include: mealInclude,
    });

    if (!meal) {
      res.status(404).json({ error: "Meal not found" });
      return;
    }
    res.json(meal);
  } catch (err) {
    next(err);
  }
});

mealsRouter.post("/:mealId/images/:imageId/re-recognize", async (req: AuthRequest, res, next) => {
  try {
    const mealId = Number(req.params.mealId);
    const imageId = String(req.params.imageId);
    const userId = req.user!.userId;

    // Ownership: meal must belong to the authenticated user (IDOR guard for sequential mealId).
    const meal = await prisma.meal.findFirst({
      where: { mealId, userId },
    });
    if (!meal) {
      res.status(404).json({ error: "Meal not found" });
      return;
    }

    const mealImage = await prisma.mealImage.findFirst({
      where: {
        id: imageId,
        mealId,
        userId,
      },
    });
    if (!mealImage) {
      res.status(404).json({ error: "Meal image not found" });
      return;
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    const profileData = toUserProfileData(profile);

    const storage = createImageStorage();
    const buffer = await storage.download(mealImage.storageKey);
    const { nutrition, visionModelVersion } = await recognizeMealFromImage({
      imageBase64: buffer.toString("base64"),
      imageMime: "image/jpeg",
      message: "Re-analyze stored meal image",
      profile: profileData,
    });

    await prisma.$transaction(async (tx) => {
      // Re-check ownership inside transaction before mutating items.
      const owned = await tx.meal.findFirst({ where: { mealId, userId }, select: { mealId: true } });
      if (!owned) throw new Error("Meal not found");

      await tx.mealItem.deleteMany({ where: { mealId } });
      for (const item of nutrition.items) {
        await tx.mealItem.create({
          data: {
            mealId,
            foodType: item.foodType,
            estimatedQuantity: item.estimatedQuantity,
            visionConfidence: item.visionConfidence,
            nutritionValues: {
              create: item.nutrition,
            },
          },
        });
      }
      await tx.mealImage.update({
        where: { id: imageId },
        data: {
          recognizedAt: new Date(),
          visionModelVersion,
        },
      });
    });

    const updated = await prisma.meal.findFirst({
      where: { mealId, userId: req.user!.userId },
      include: mealInclude,
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: AUDIT_ACTIONS.MEAL_CAPTURE,
      details: {
        action: "re-recognize",
        mealId,
        imageId,
        visionModelVersion,
      },
      sourceIp: req.ip,
    });

    res.json({
      meal: updated,
      analysis: {
        items: nutrition.items,
        totalNutrition: nutrition.totalNutrition,
        summary: nutrition.summary,
        sources: nutrition.sources,
        visionModelVersion,
      },
    });
  } catch (err) {
    next(err);
  }
});

const updateItemSchema = z.object({
  foodType: z.string().min(1).optional(),
  estimatedQuantity: z.string().min(1).optional(),
  calories: z.number().optional(),
  protein: z.number().optional(),
  fat: z.number().optional(),
  carbs: z.number().optional(),
  sugar: z.number().optional(),
});

mealsRouter.patch("/:mealId/items/:itemId", async (req: AuthRequest, res, next) => {
  try {
    const mealId = Number(req.params.mealId);
    const itemId = Number(req.params.itemId);
    const body = updateItemSchema.parse(req.body);

    const meal = await prisma.meal.findFirst({
      where: { mealId, userId: req.user!.userId },
    });
    if (!meal) {
      res.status(404).json({ error: "Meal not found" });
      return;
    }

    const item = await prisma.mealItem.findFirst({
      where: { itemId, mealId },
      include: { nutritionValues: true },
    });
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    await prisma.mealItem.update({
      where: { itemId },
      data: {
        foodType: body.foodType ?? item.foodType,
        estimatedQuantity: body.estimatedQuantity ?? item.estimatedQuantity,
      },
    });

    if (item.nutritionValues) {
      await prisma.nutritionValue.update({
        where: { itemId },
        data: {
          calories: body.calories ?? item.nutritionValues.calories,
          protein: body.protein ?? item.nutritionValues.protein,
          fat: body.fat ?? item.nutritionValues.fat,
          carbs: body.carbs ?? item.nutritionValues.carbs,
          sugar: body.sugar ?? item.nutritionValues.sugar,
        },
      });
    }

    const updated = await prisma.meal.findFirst({
      where: { mealId },
      include: mealInclude,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

mealsRouter.patch("/:mealId", async (req: AuthRequest, res, next) => {
  try {
    const mealId = Number(req.params.mealId);
    const body = z
      .object({
        mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
        source: z.enum(["home", "restaurant"]).optional(),
      })
      .parse(req.body);

    const meal = await prisma.meal.findFirst({
      where: { mealId, userId: req.user!.userId },
    });
    if (!meal) {
      res.status(404).json({ error: "Meal not found" });
      return;
    }

    const updated = await prisma.meal.update({
      where: { mealId },
      data: body,
      include: mealInclude,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
