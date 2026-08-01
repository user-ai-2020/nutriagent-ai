import { createId, mealImageStorageKey } from "@nutriagent/shared";
import {
  BLOWOUT_FOODS,
  type FoodTemplate,
  type MealType,
  foodsForMealType,
} from "./foods";
import { createRng, fakeSha256Hex, pickNUnique, randInt } from "./rng";

export { SYNTHETIC_DEMO_SOURCE, SYNTHETIC_DEMO_SOURCE as SYNTHETIC_MEAL_SOURCE } from "./constants";

export type GeneratedMealItem = FoodTemplate & { visionConfidence: number };

export type GeneratedMealImage = {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  contentHash: string;
  capturedAt: Date;
  recognizedAt: Date;
  visionModelVersion: string;
};

export type GeneratedMeal = {
  mealType: MealType;
  mealDatetime: Date;
  items: GeneratedMealItem[];
  withImage: boolean;
  image?: GeneratedMealImage;
};

export type GeneratedDay = {
  dateKey: string;
  dailyCalorieBudget: number;
  isBlowout: boolean;
  steps: number;
  meals: GeneratedMeal[];
  totalCalories: number;
};

export type DateRange = { start: Date; end: Date };

export function computeDateRange(days: number, now = new Date()): DateRange {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

export function selectBlowoutDayIndices(dayCount: number, seed: number): Set<number> {
  const scored = Array.from({ length: dayCount }, (_, i) => ({
    i,
    score: createRng(seed + i * 7919)(),
  }));
  scored.sort((a, b) => b.score - a.score);
  const blowoutCount = Math.max(1, Math.round(dayCount * 0.2));
  return new Set(scored.slice(0, blowoutCount).map((x) => x.i));
}

function mealHour(mealType: MealType, rng: () => number): number {
  switch (mealType) {
    case "breakfast":
      return randInt(rng, 7, 9);
    case "lunch":
      return randInt(rng, 12, 14);
    case "dinner":
      return randInt(rng, 18, 21);
    case "snack":
      return randInt(rng, 15, 17);
  }
}

function scaleFood(food: FoodTemplate, factor: number): FoodTemplate {
  const f = Math.max(0.5, Math.min(2.2, factor));
  return {
    ...food,
    calories: Math.round(food.calories * f),
    protein: Math.round(food.protein * f * 10) / 10,
    fat: Math.round(food.fat * f * 10) / 10,
    carbs: Math.round(food.carbs * f * 10) / 10,
    sugar: Math.round(food.sugar * f * 10) / 10,
  };
}

function buildMealImage(
  userId: number,
  mealDatetime: Date,
  rng: () => number
): GeneratedMealImage {
  const id = createId();
  const capturedAt = new Date(mealDatetime.getTime() - randInt(rng, 1, 4) * 60_000);
  const recognizedAt = new Date(capturedAt.getTime() + randInt(rng, 2, 8) * 1000);
  return {
    id,
    storageKey: mealImageStorageKey(userId, id),
    width: 512,
    height: randInt(rng, 340, 512),
    fileSizeBytes: randInt(rng, 38_000, 72_000),
    contentHash: fakeSha256Hex(rng),
    capturedAt,
    recognizedAt,
    visionModelVersion:
      "cohere/rerank-4-fast;openai/gpt-4o,google/gemini-flash-1.5,anthropic/claude-3.5-sonnet",
  };
}

function buildMeal(
  userId: number,
  day: Date,
  mealType: MealType,
  targetCalories: number,
  rng: () => number,
  blowout: boolean
): GeneratedMeal {
  const pool = mealType === "dinner" && blowout ? [...foodsForMealType("dinner"), ...BLOWOUT_FOODS] : foodsForMealType(mealType);
  const itemCount = blowout && mealType === "dinner" ? randInt(rng, 2, 3) : randInt(rng, 1, 2);
  const picks = pickNUnique(rng, pool, itemCount);

  const baseTotal = picks.reduce((s, f) => s + f.calories, 0);
  const factor = baseTotal > 0 ? targetCalories / baseTotal : 1;

  const items: GeneratedMealItem[] = picks.map((food) => ({
    ...scaleFood(food, factor),
    visionConfidence: Math.round((0.72 + rng() * 0.23) * 100) / 100,
  }));

  const hour = mealHour(mealType, rng);
  const minute = randInt(rng, 0, 59);
  const mealDatetime = new Date(day);
  mealDatetime.setHours(hour, minute, 0, 0);

  const withImage = rng() < 0.45;
  return {
    mealType,
    mealDatetime,
    items,
    withImage,
    image: withImage ? buildMealImage(userId, mealDatetime, rng) : undefined,
  };
}

export function generateSyntheticDays(params: {
  userId: number;
  days: number;
  seed: number;
  baseDailyCalories?: number;
  now?: Date;
}): GeneratedDay[] {
  const { userId, days, seed, baseDailyCalories = 2000, now = new Date() } = params;
  const rng = createRng(seed);
  const blowouts = selectBlowoutDayIndices(days, seed);
  const { start } = computeDateRange(days, now);
  const out: GeneratedDay[] = [];

  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const dateKey = day.toISOString().slice(0, 10);
    const isBlowout = blowouts.has(i);

    const budgetJitter = randInt(rng, -130, 130);
    const dailyCalorieBudget = baseDailyCalories + budgetJitter;

    const includeSnack = !isBlowout || rng() > 0.35;
    const mealTypes: MealType[] = includeSnack
      ? ["breakfast", "lunch", "dinner", "snack"]
      : ["breakfast", "lunch", "dinner"];

    const split = isBlowout
      ? { breakfast: 0.18, lunch: 0.22, dinner: 0.52, snack: includeSnack ? 0.08 : 0 }
      : { breakfast: 0.24, lunch: 0.32, dinner: 0.34, snack: includeSnack ? 0.1 : 0 };

    const intakeTarget = isBlowout
      ? Math.round(dailyCalorieBudget * (1.45 + rng() * 0.35))
      : Math.round(dailyCalorieBudget * (0.88 + rng() * 0.18));

    const steps = isBlowout
      ? randInt(rng, 3200, 6200)
      : randInt(rng, 6500, 12_500);

    const meals = mealTypes.map((mealType) =>
      buildMeal(
        userId,
        day,
        mealType,
        Math.round(intakeTarget * split[mealType]),
        rng,
        isBlowout
      )
    );

    const totalCalories = meals.reduce(
      (sum, meal) => sum + meal.items.reduce((s, item) => s + item.calories, 0),
      0
    );

    out.push({
      dateKey,
      dailyCalorieBudget,
      isBlowout,
      steps,
      meals,
      totalCalories,
    });
  }

  return out;
}
