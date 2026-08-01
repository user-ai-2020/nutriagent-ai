import { Router } from "express";
import { prisma } from "@nutriagent/db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDateParam(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

function startOfWeekSunday(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function endOfWeekSaturday(d: Date): Date {
  const x = startOfWeekSunday(d);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(start: Date, end: Date): number {
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((utcEnd - utcStart) / (1000 * 60 * 60 * 24));
}

function sumNutrition(
  meals: Array<{
    items: Array<{
      nutritionValues: { calories: number; protein: number; fat: number; carbs: number; sugar: number } | null;
    }>;
  }>
) {
  return meals.reduce(
    (acc, meal) => {
      for (const item of meal.items) {
        if (item.nutritionValues) {
          acc.calories += item.nutritionValues.calories;
          acc.protein += item.nutritionValues.protein;
          acc.fat += item.nutritionValues.fat;
          acc.carbs += item.nutritionValues.carbs;
          acc.sugar += item.nutritionValues.sugar;
        }
      }
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0 }
  );
}

dashboardRouter.get("/", async (req: AuthRequest, res, next) => {
  try {
    const period = (req.query.period as string) || "week";
    const dateQuery = typeof req.query.date === "string" ? req.query.date : undefined;
    const now = new Date();
    let from: Date;
    let rangeEnd = now;

    const focusDay = dateQuery ? parseDateParam(dateQuery) : startOfDay(now);
    if (dateQuery && !focusDay) {
      res.status(400).json({ error: "Invalid date; use YYYY-MM-DD" });
      return;
    }

    const focusStart = focusDay ?? startOfDay(now);
    const focusEnd = endOfDay(focusStart);
    const isFocusToday = focusStart.getTime() === startOfDay(now).getTime();

    if (period === "week" && dateQuery) {
      from = startOfWeekSunday(focusStart);
      const weekEnd = endOfWeekSaturday(focusStart);
      rangeEnd = weekEnd.getTime() > now.getTime() ? now : weekEnd;
    } else if (period === "day") {
      from = startOfDay(now);
      rangeEnd = now;
    } else if (period === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = now;
    } else {
      from = startOfWeekSunday(now);
      rangeEnd = now;
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.user!.userId },
    });

    const meals = await prisma.meal.findMany({
      where: {
        userId: req.user!.userId,
        mealDatetime: { gte: from, lte: rangeEnd },
      },
      include: { items: { include: { nutritionValues: true } } },
      orderBy: { mealDatetime: "asc" },
    });

    const dailySteps = await prisma.dailySteps.findMany({
      where: {
        userId: req.user!.userId,
        date: { gte: from, lte: rangeEnd },
      },
    });

    const exerciseLogs = await prisma.exerciseLog.findMany({
      where: {
        userId: req.user!.userId,
        timestamp: { gte: from, lte: rangeEnd },
      },
    });

    const dayMeals = meals.filter(
      (m) => m.mealDatetime >= focusStart && m.mealDatetime <= focusEnd
    );
    const dayTotals = sumNutrition(dayMeals);
    const totals = sumNutrition(meals);
    const goals = (profile?.dietGoals as Record<string, number>) ?? {
      dailyCalories: 2000,
      proteinGrams: 120,
      carbsGrams: 250,
      fatGrams: 65,
    };

    const mealTypeBreakdown = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    for (const meal of dayMeals) {
      const cals = sumNutrition([meal]).calories;
      const key = (meal.mealType || "snack") as keyof typeof mealTypeBreakdown;
      if (key in mealTypeBreakdown) mealTypeBreakdown[key] += cals;
      else mealTypeBreakdown.snack += cals;
    }

    const paddedDailyBreakdown = [];
    const totalDays = daysBetween(from, rangeEnd);
    
    for (let i = 0; i <= totalDays; i++) {
      const currentDay = new Date(from);
      currentDay.setDate(from.getDate() + i);
      const dateKey = localDateKey(currentDay);
      
      const dayMealsList = meals.filter(m => localDateKey(m.mealDatetime) === dateKey);
      const dayNutrition = sumNutrition(dayMealsList);
      
      const stepsCount = dailySteps
        .filter(s => localDateKey(s.date) === dateKey)
        .reduce((sum, s) => sum + s.steps, 0);
        
      const burned = exerciseLogs
        .filter(e => localDateKey(e.timestamp) === dateKey)
        .reduce((sum, e) => sum + (e.caloriesBurned || 0), 0);

      paddedDailyBreakdown.push({
        date: dateKey,
        calories: dayNutrition.calories,
        protein: dayNutrition.protein,
        fat: dayNutrition.fat,
        carbs: dayNutrition.carbs,
        steps: stepsCount,
        caloriesBurned: burned
      });
    }

    const macroCalories = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
    const macroPercentages = {
      protein: macroCalories ? Math.round(((totals.protein * 4) / macroCalories) * 100) : 0,
      carbs: macroCalories ? Math.round(((totals.carbs * 4) / macroCalories) * 100) : 0,
      fat: macroCalories ? Math.round(((totals.fat * 9) / macroCalories) * 100) : 0,
    };

    const calorieGoal = goals.dailyCalories || 2000;

    res.json({
      period,
      date: localDateKey(focusStart),
      totals,
      todayTotals: dayTotals,
      calorieBudget: {
        goal: calorieGoal,
        consumed: dayTotals.calories,
        remaining: Math.max(calorieGoal - dayTotals.calories, 0),
        percent: Math.min(Math.round((dayTotals.calories / calorieGoal) * 100), 100),
      },
      mealTypeBreakdown,
      steps: {
        today: isFocusToday ? (profile?.todaySteps ?? 0) : 0,
        goal: profile?.dailyStepsGoal ?? 8000,
      },
      goals,
      dailyBreakdown: paddedDailyBreakdown,
      macroPercentages,
      mealCount: dayMeals.length,
    });
  } catch (err) {
    next(err);
  }
});
