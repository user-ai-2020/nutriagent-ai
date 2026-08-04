/**
 * Build varied dashboard advice cards from meal/totals data and the user's local clock.
 * Returns translation keys + params so callers keep i18n in the UI layer.
 */

export type MealTypeBreakdown = {
  breakfast: number;
  lunch: number;
  dinner: number;
  snack: number;
};

export type DashboardAdviceInput = {
  /** Client local Date — drives time-of-day recommendations. */
  now: Date;
  isToday: boolean;
  leftKcal: number;
  mealCount: number;
  proteinLeft: number;
  proteinGrams: number;
  proteinGoal: number;
  carbsGrams: number;
  fatGrams: number;
  sugarGrams: number;
  carbsGoal?: number;
  fatGoal?: number;
  mealTypeBreakdown: MealTypeBreakdown;
  steps: number;
  stepsGoal: number;
  calorieConsumed: number;
  calorieGoal: number;
};

export type AdviceCardSpec = {
  id: string;
  /** Higher = more relevant for the current context. */
  score: number;
  kickerKey: string;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
};

function hourOf(d: Date): number {
  return d.getHours();
}

/** Slot for "what to eat now" by local wall clock. */
export function localMealSlot(hour: number): "morning" | "midday" | "afternoon" | "evening" | "late" {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late";
}

/**
 * Pick up to `limit` advice cards. Pool rotates with time-of-day + daily seed so
 * the same three protein plate tips don't appear forever.
 */
export function pickDashboardAdvice(input: DashboardAdviceInput, limit = 3): AdviceCardSpec[] {
  const hour = hourOf(input.now);
  const slot = localMealSlot(hour);
  const dayKey =
    input.now.getFullYear() * 10000 + (input.now.getMonth() + 1) * 100 + input.now.getDate();
  // Hour salt so cards shift through the day even if macros are unchanged.
  const rotate = (dayKey + hour) % 5;

  const proteinPct =
    input.proteinGoal > 0 ? Math.round((input.proteinGrams / input.proteinGoal) * 100) : 0;
  const carbsGoal = input.carbsGoal ?? 250;
  const fatGoal = input.fatGoal ?? 70;
  const carbsPct = carbsGoal > 0 ? Math.round((input.carbsGrams / carbsGoal) * 100) : 0;
  const fatPct = fatGoal > 0 ? Math.round((input.fatGrams / fatGoal) * 100) : 0;
  const stepsPct =
    input.stepsGoal > 0 ? Math.round((input.steps / input.stepsGoal) * 100) : 0;

  const b = input.mealTypeBreakdown;
  const candidates: AdviceCardSpec[] = [];

  // —— Time-based "what to eat" (user local time) ——
  if (input.isToday) {
    if (slot === "morning") {
      candidates.push({
        id: "time-morning",
        score: 95,
        kickerKey: "dashboard.adviceTimeKicker",
        titleKey: "dashboard.adviceEatMorningTitle",
        bodyKey: "dashboard.adviceEatMorningBody",
      });
    } else if (slot === "midday") {
      candidates.push({
        id: "time-midday",
        score: 95,
        kickerKey: "dashboard.adviceTimeKicker",
        titleKey: "dashboard.adviceEatMiddayTitle",
        bodyKey: "dashboard.adviceEatMiddayBody",
        params: { left: input.leftKcal },
      });
    } else if (slot === "afternoon") {
      candidates.push({
        id: "time-snack",
        score: 92,
        kickerKey: "dashboard.adviceTimeKicker",
        titleKey: "dashboard.adviceEatSnackTitle",
        bodyKey: "dashboard.adviceEatSnackBody",
      });
    } else if (slot === "evening") {
      candidates.push({
        id: "time-evening",
        score: 95,
        kickerKey: "dashboard.adviceTimeKicker",
        titleKey: "dashboard.adviceEatEveningTitle",
        bodyKey: "dashboard.adviceEatEveningBody",
        params: { left: input.leftKcal },
      });
    } else {
      candidates.push({
        id: "time-late",
        score: 90,
        kickerKey: "dashboard.adviceTimeKicker",
        titleKey: "dashboard.adviceEatLateTitle",
        bodyKey: "dashboard.adviceEatLateBody",
      });
    }
  }

  // —— Meal-table gaps (use mealTypeBreakdown) ——
  if (input.isToday && hour >= 10 && b.breakfast < 50 && input.mealCount === 0) {
    candidates.push({
      id: "gap-no-meals",
      score: 88,
      kickerKey: "dashboard.adviceMealGapKicker",
      titleKey: "dashboard.adviceNoMealsTitle",
      bodyKey: "dashboard.adviceNoMealsBody",
    });
  }
  if (input.isToday && hour >= 12 && hour < 16 && b.lunch < 50) {
    candidates.push({
      id: "gap-lunch",
      score: 85,
      kickerKey: "dashboard.adviceMealGapKicker",
      titleKey: "dashboard.adviceMissingLunchTitle",
      bodyKey: "dashboard.adviceMissingLunchBody",
    });
  }
  if (input.isToday && hour >= 18 && b.dinner < 50) {
    candidates.push({
      id: "gap-dinner",
      score: 84,
      kickerKey: "dashboard.adviceMealGapKicker",
      titleKey: "dashboard.adviceMissingDinnerTitle",
      bodyKey: "dashboard.adviceMissingDinnerBody",
      params: { left: input.leftKcal },
    });
  }
  if (b.snack > 400) {
    candidates.push({
      id: "snack-heavy",
      score: 70 + rotate,
      kickerKey: "dashboard.adviceSnackKicker",
      titleKey: "dashboard.adviceSnackHeavyTitle",
      bodyKey: "dashboard.adviceSnackHeavyBody",
      params: { kcal: Math.round(b.snack) },
    });
  }

  // —— Protein ——
  candidates.push({
    id: "protein",
    score: input.proteinLeft > 0 ? 75 + Math.min(20, input.proteinLeft / 5) : 55 + rotate,
    kickerKey: "dashboard.adviceProteinKicker",
    titleKey: input.isToday ? "dashboard.adviceProteinForDay" : "dashboard.adviceProteinThatDay",
    bodyKey: input.proteinLeft
      ? "dashboard.adviceProteinUnderTarget"
      : "dashboard.adviceProteinTargetReached",
    params: input.proteinLeft
      ? { grams: input.proteinLeft }
      : { pct: proteinPct },
  });
  if (input.proteinGrams > 0 && proteinPct < 40 && input.mealCount >= 1) {
    candidates.push({
      id: "protein-boost",
      score: 78,
      kickerKey: "dashboard.adviceProteinKicker",
      titleKey: "dashboard.adviceProteinBoostTitle",
      bodyKey: "dashboard.adviceProteinBoostBody",
      params: { grams: input.proteinGrams, goal: input.proteinGoal },
    });
  }

  // —— Carbs / fat / sugar from totals ——
  if (input.calorieConsumed > 200 && carbsPct > 110) {
    candidates.push({
      id: "carbs-high",
      score: 72 + rotate,
      kickerKey: "dashboard.adviceMacroKicker",
      titleKey: "dashboard.adviceCarbsHighTitle",
      bodyKey: "dashboard.adviceCarbsHighBody",
      params: { grams: Math.round(input.carbsGrams) },
    });
  } else if (input.calorieConsumed > 200 && carbsPct < 50) {
    candidates.push({
      id: "carbs-low",
      score: 68 + rotate,
      kickerKey: "dashboard.adviceMacroKicker",
      titleKey: "dashboard.adviceCarbsLowTitle",
      bodyKey: "dashboard.adviceCarbsLowBody",
    });
  }
  if (input.calorieConsumed > 200 && fatPct > 120) {
    candidates.push({
      id: "fat-high",
      score: 71 + rotate,
      kickerKey: "dashboard.adviceMacroKicker",
      titleKey: "dashboard.adviceFatHighTitle",
      bodyKey: "dashboard.adviceFatHighBody",
      params: { grams: Math.round(input.fatGrams) },
    });
  }
  if (input.sugarGrams > 45) {
    candidates.push({
      id: "sugar",
      score: 76,
      kickerKey: "dashboard.adviceSugarKicker",
      titleKey: "dashboard.adviceSugarTitle",
      bodyKey: "dashboard.adviceSugarBody",
      params: { grams: Math.round(input.sugarGrams) },
    });
  }

  // —— Budget ——
  candidates.push({
    id: "budget",
    score: input.leftKcal > 0 ? 65 + Math.min(25, input.leftKcal / 40) : 70,
    kickerKey: "dashboard.adviceBudgetKicker",
    titleKey: input.leftKcal ? "dashboard.adviceBudgetAvailable" : "dashboard.adviceBudgetReached",
    bodyKey: input.leftKcal
      ? "dashboard.adviceBudgetAvailableBody"
      : input.isToday
        ? "dashboard.adviceBudgetMetToday"
        : "dashboard.adviceBudgetUsedThatDay",
    params: { left: input.leftKcal },
  });

  // —— Steps ——
  if (input.stepsGoal > 0) {
    candidates.push({
      id: "steps",
      score: stepsPct < 50 ? 74 : 58 + rotate,
      kickerKey: "dashboard.adviceStepsKicker",
      titleKey: "dashboard.adviceStepsTitle",
      bodyKey:
        stepsPct < 50
          ? "dashboard.adviceStepsLowBody"
          : stepsPct < 100
            ? "dashboard.adviceStepsMidBody"
            : "dashboard.adviceStepsDoneBody",
      params: {
        steps: input.steps,
        goal: input.stepsGoal,
        left: Math.max(0, input.stepsGoal - input.steps),
      },
    });
  }

  // —— Rotating how-to tips (not always plate protein) ——
  const howToVariants: Array<{ id: string; titleKey: string; bodyKey: string }> = [
    {
      id: "how-plate",
      titleKey: "dashboard.adviceHowToPlateProtein",
      bodyKey: "dashboard.adviceHowToPlateProteinBody",
    },
    {
      id: "how-veg",
      titleKey: "dashboard.adviceHowToVegTitle",
      bodyKey: "dashboard.adviceHowToVegBody",
    },
    {
      id: "how-water",
      titleKey: "dashboard.adviceHowToWaterTitle",
      bodyKey: "dashboard.adviceHowToWaterBody",
    },
    {
      id: "how-pair",
      titleKey: "dashboard.adviceHowToPairTitle",
      bodyKey: "dashboard.adviceHowToPairBody",
    },
    {
      id: "how-timing",
      titleKey: "dashboard.adviceHowToTimingTitle",
      bodyKey: "dashboard.adviceHowToTimingBody",
    },
  ];
  const how = howToVariants[rotate % howToVariants.length]!;
  candidates.push({
    id: how.id,
    score: 50 + rotate * 3,
    kickerKey: "dashboard.adviceHowToKicker",
    titleKey: how.titleKey,
    bodyKey: how.bodyKey,
  });

  // —— Unbalanced meal split across table ——
  const slotsLogged = [b.breakfast, b.lunch, b.dinner].filter((v) => v >= 50).length;
  if (input.mealCount >= 2 && slotsLogged === 1 && b.dinner + b.lunch + b.breakfast > 0) {
    candidates.push({
      id: "split",
      score: 73,
      kickerKey: "dashboard.adviceMealGapKicker",
      titleKey: "dashboard.adviceMealSplitTitle",
      bodyKey: "dashboard.adviceMealSplitBody",
    });
  }

  // Sort by score desc, then rotate through ties with day seed for variety.
  candidates.sort((a, b2) => {
    if (b2.score !== a.score) return b2.score - a.score;
    return (a.id.charCodeAt(0) + dayKey) % 7 - ((b2.id.charCodeAt(0) + dayKey) % 7);
  });

  const seen = new Set<string>();
  const out: AdviceCardSpec[] = [];
  for (const c of candidates) {
    // Keep unique kickers somewhat diverse — allow max 1 protein card etc. by id family
    const family = c.id.split("-")[0]!;
    const familyCount = out.filter((o) => o.id.startsWith(family)).length;
    if (familyCount >= 1 && family !== "time") continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length >= limit) break;
  }

  // Guarantee at least one card.
  if (out.length === 0) {
    out.push({
      id: "budget-fallback",
      score: 1,
      kickerKey: "dashboard.adviceBudgetKicker",
      titleKey: "dashboard.adviceBudgetAvailable",
      bodyKey: "dashboard.adviceBudgetAvailableBody",
      params: { left: input.leftKcal },
    });
  }

  return out;
}
