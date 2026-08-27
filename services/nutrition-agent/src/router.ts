import { Router } from "express";
import { UserProfileData, VisionFoodItem, isClearlyOutOfScope, outOfScopeReply, openRouterChat, parseQuantityGrams, resolveResponseLanguage, responseLanguageInstruction, scopeGuardrailInstruction, CITATION_SOURCES } from "@nutriagent/shared";
import { getCachedLlmSettings } from "@nutriagent/db";
import { findNutrition } from "./nutrition-db";
import { isSuspiciousMealTotal, isSuspiciousNutrition, kcalPer100g } from "./nutrition-sanity";

export const nutritionRouter = Router();

function scaleNutrition(base: ReturnType<typeof findNutrition>, quantity: string, foodType: string) {
  const grams = parseQuantityGrams(quantity, foodType);
  const factor = grams / 100;
  const nutrition = {
    calories: Math.round(base.calories * factor),
    protein: Math.round(base.protein * factor * 10) / 10,
    fat: Math.round(base.fat * factor * 10) / 10,
    carbs: Math.round(base.carbs * factor * 10) / 10,
    sugar: Math.round(base.sugar * factor * 10) / 10,
  };
  const suspicious = isSuspiciousNutrition(nutrition.calories, grams);
  return { nutrition, grams, suspicious, kcalPer100g: Math.round(kcalPer100g(nutrition.calories, grams)) };
}

nutritionRouter.post("/calculate", async (req, res) => {
  const { items, profile } = req.body as {
    items: VisionFoodItem[];
    profile?: UserProfileData;
    /** Accepted for API compatibility; RAG titles are surfaced via orchestrator citation pills, not summary text. */
    ragContext?: string[];
  };

  const enriched = items.map((item) => {
    const scaled = scaleNutrition(findNutrition(item.foodType), item.estimatedQuantity, item.foodType);
    return {
      ...item,
      nutrition: scaled.nutrition,
      nutritionMeta: {
        grams: scaled.grams,
        kcalPer100g: scaled.kcalPer100g,
        suspicious: scaled.suspicious,
      },
    };
  });

  const totalNutrition = enriched.reduce(
    (acc, item) => ({
      calories: acc.calories + item.nutrition.calories,
      protein: acc.protein + item.nutrition.protein,
      fat: acc.fat + item.nutrition.fat,
      carbs: acc.carbs + item.nutrition.carbs,
      sugar: acc.sugar + item.nutrition.sugar,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0 }
  );

  const isHe = profile?.preferredLanguage === "he";
  const isRu = profile?.preferredLanguage === "ru";
  
  const warnings: string[] = [];
  for (const item of enriched) {
    if (item.nutritionMeta.suspicious) {
      warnings.push(
        isHe
          ? `צפיפות קלוריות חשודה עבור ${item.foodType} (${item.nutritionMeta.kcalPer100g} קק"ל/100 גרם ב-${item.nutritionMeta.grams} גרם) — בדוק את גודל המנה או ההתאמה`
          : isRu
          ? `Подозрительная плотность калорий для ${item.foodType} (${item.nutritionMeta.kcalPer100g} ккал/100г при ${item.nutritionMeta.grams}г) — проверьте порцию или соответствие продукта`
          : `Suspicious calorie density for ${item.foodType} (${item.nutritionMeta.kcalPer100g} kcal/100g at ${item.nutritionMeta.grams}g) — verify portion or food match`
      );
    }
  }

  const totalGrams = enriched.reduce((sum, item) => sum + item.nutritionMeta.grams, 0);
  if (isSuspiciousMealTotal(totalNutrition.calories, totalGrams, enriched.length)) {
    warnings.push(
      isHe
        ? `סך ארוחה חשוד (${totalNutrition.calories} קק"ל עבור ${enriched.length} פריטים, ${Math.round(totalGrams)} גרם) — ייתכן שהמנה פוצלה למרכיבים במקום פריט אחד`
        : isRu
        ? `Подозрительное количество калорий (${totalNutrition.calories} ккал для ${enriched.length} продуктов, ${Math.round(totalGrams)}г) — возможно, блюдо было разделено на ингредиенты вместо одной записи`
        : `Suspicious meal total (${totalNutrition.calories} kcal for ${enriched.length} items, ${Math.round(totalGrams)}g) — dish may be split into components instead of one entry`
    );
  }
  if (profile?.allergies?.length) {
    for (const item of enriched) {
      for (const allergy of profile.allergies) {
        if (item.foodType.toLowerCase().includes(allergy.toLowerCase())) {
          warnings.push(
            isHe
              ? `אזהרה: ${item.foodType} עשוי להכיל ${allergy}`
              : isRu
              ? `Внимание: ${item.foodType} может содержать ${allergy}`
              : `Warning: ${item.foodType} may contain ${allergy}`
          );
        }
      }
    }
  }

  if (profile?.healthRestrictions?.includes("diabetes") && totalNutrition.sugar > 15) {
    warnings.push(
      isHe
        ? "תכולת סוכר גבוהה - שקול להתאים את גודל המנה לניהול סוכרת"
        : isRu
        ? "Высокое содержание сахара - подумайте о корректировке порции для контроля диабета"
        : "High sugar content - consider portion adjustment for diabetes management"
    );
  }

  const summary = [
    isHe
      ? `סה"כ לארוחה: ${totalNutrition.calories} קק"ל | חלבון ${Math.round(totalNutrition.protein)}g | פחמימות ${Math.round(totalNutrition.carbs)}g | שומן ${Math.round(totalNutrition.fat)}g`
      : isRu
      ? `Итого: ${totalNutrition.calories} ккал | Белки ${Math.round(totalNutrition.protein)}г | Углеводы ${Math.round(totalNutrition.carbs)}г | Жиры ${Math.round(totalNutrition.fat)}г`
      : `Meal total: ${totalNutrition.calories} kcal | Protein ${Math.round(totalNutrition.protein)}g | Carbs ${Math.round(totalNutrition.carbs)}g | Fat ${Math.round(totalNutrition.fat)}g`,
    ...warnings,
  ].join("\n");

  res.json({
    items: enriched,
    totalNutrition,
    warnings,
    summary,
    sources: [CITATION_SOURCES.NUTRITION_DB, CITATION_SOURCES.DRI_WHO],
  });
});

nutritionRouter.post("/advise", async (req, res) => {
  const { message, profile, context } = req.body as {
    message: string;
    profile?: UserProfileData;
    context?: string[];
  };

  let reply: string;
  const lang = resolveResponseLanguage(message, profile?.preferredLanguage);
  if (isClearlyOutOfScope(message)) {
    res.json({
      reply: outOfScopeReply(lang),
      sources: [],
    });
    return;
  }
  const restrictions = profile?.healthRestrictions?.join(", ") || "none";
  const allergies = profile?.allergies?.join(", ") || "none";

  try {
    const llm = await getCachedLlmSettings();
    const apiKey = llm.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      const prompt = [
        "You are a nutrition advisor.",
        scopeGuardrailInstruction(),
        `User restrictions: ${restrictions}. Allergies: ${allergies}. Diet: ${profile?.dietType || "balanced"}.`,
        `Context:\n${(context || []).join("\n")}`,
        `Question: ${message}`,
        lang === "he"
          ? "When recommending foods in Hebrew, align with Israeli Ministry of Health / Food Union (איחוד המזון) portion guidance where relevant."
          : "",
        "Give a concise, practical answer with brief rationale.",
        responseLanguageInstruction(lang),
      ]
        .filter(Boolean)
        .join("\n");
      reply =
        (await openRouterChat({
          apiKey,
          model: llm.chatModel,
          messages: [
            { role: "system", content: `${scopeGuardrailInstruction()}\n${responseLanguageInstruction(lang)}` },
            { role: "user", content: prompt },
          ],
          maxTokens: 400,
        })) || generateMockAdvice(message, profile, context);
    } else {
      reply = generateMockAdvice(message, profile, context);
    }
  } catch {
    reply = generateMockAdvice(message, profile, context);
  }

  const adviseSources: string[] = [
    CITATION_SOURCES.USER_PROFILE,
    CITATION_SOURCES.RAG_KB,
    CITATION_SOURCES.DRI_WHO,
    CITATION_SOURCES.ISRAEL_FOOD_UNION,
  ];

  res.json({
    reply,
    sources: adviseSources,
  });
});

function generateMockAdvice(message: string, profile?: UserProfileData, context?: string[]): string {
  const lang = resolveResponseLanguage(message, profile?.preferredLanguage);
  if (isClearlyOutOfScope(message)) return outOfScopeReply(lang);
  const lower = message.toLowerCase();
  const diet = profile?.dietType || "balanced";
  const calories = profile?.dietGoals?.dailyCalories || 2000;
  const proteinTarget = profile?.dietGoals?.proteinGrams || 120;
  const restrictions = profile?.healthRestrictions?.join(", ") || "none";
  const ragHint = context
    ?.map((chunk) => chunk.replace(/^[^:]+:\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ")
    .slice(0, 320);

  if (lang === "he") {
    if (lower.includes("restaurant") || lower.includes("מסעדה")) {
      return `לפי הפרופיל שלך (${diet}, מגבלות: ${restrictions}), מומלץ עוף/דג בגריל עם ירקות מאודות. הימנע ממטוגנים ורוטבים מתוקים.${ragHint ? ` ${ragHint}` : ""}`;
    }
    if (lower.includes("protein") || lower.includes("חלבון")) {
      return `יעד החלבון היומי שלך הוא ${proteinTarget} גרם. מקורות טובים: עוף, דג, קטניות, טופו. פזר צריכה לאורך היום.${ragHint ? ` ${ragHint}` : ""}`;
    }
    if (
      lower.includes("what should i eat") ||
      lower.includes("what to eat") ||
      lower.includes("eat now") ||
      lower.includes("should i eat") ||
      lower.includes("מה לאכול") ||
      lower.includes("מה כדאי")
    ) {
      const mealIdeas =
        diet === "keto"
          ? "נסה ביצים עם אבוקדו, יוגורט יווני עם אגוזים, או סלמון עם ירקות עלים — שמור על פחמימות נמוכות."
          : diet === "vegan"
            ? "נסה קערת עדשים עם קינואה וירקות קלויים, או חומוס עם פיתה מלאה וסלט."
            : "נסה צלחת מאוזנת: חלבון רזה (עוף, דג או טופו), חצי צלחת ירקות, ומנה קטנה של דגנים מלאים או פחמימות.";
      return `לתוכנית ${diet} שלך (${calories} קק"ל/יום, מגבלות: ${restrictions}): ${mealIdeas}${ragHint ? ` ${ragHint}` : ""}`;
    }
    if (ragHint) {
      return `לפי פרופיל ${diet} שלך (${calories} קק"ל/יום): ${ragHint}`;
    }
    return `הנה הנחיה תזונתית מותאמת ליעדים שלך (${calories} קק"ל/יום) ולפרופיל הבריאות. שאל על ארוחות, מסעדות או התקדמות יומית.`;
  }

  if (lower.includes("restaurant") || lower.includes("מסעדה")) {
    return `Based on your profile (${diet}, restrictions: ${restrictions}), I recommend grilled chicken or salmon with steamed vegetables. Avoid fried items and sugary sauces.${ragHint ? ` ${ragHint}` : ""}`;
  }
  if (lower.includes("protein") || lower.includes("חלבון")) {
    return `Your daily protein target is ${profile?.dietGoals?.proteinGrams || 120}g. Good sources: chicken, fish, legumes, tofu. Spread intake across meals for best absorption.${ragHint ? ` ${ragHint}` : ""}`;
  }
  if (
    lower.includes("what should i eat") ||
    lower.includes("what to eat") ||
    lower.includes("eat now") ||
    lower.includes("should i eat") ||
    lower.includes("מה לאכול") ||
    lower.includes("מה כדאי")
  ) {
    const mealIdeas =
      diet === "keto"
        ? "Try eggs with avocado, Greek yogurt with nuts, or grilled salmon with leafy greens — keep carbs low."
        : diet === "vegan"
          ? "Try a lentil bowl with quinoa and roasted vegetables, or hummus with whole-grain pita and salad."
          : "Try a balanced plate: lean protein (chicken, fish, or tofu), half a plate of vegetables, and a small portion of whole grains or starchy carbs.";
    return `For your ${diet} plan (${calories} kcal/day, restrictions: ${restrictions}): ${mealIdeas}${ragHint ? ` ${ragHint}` : ""}`;
  }
  if (ragHint) {
    return `Based on your ${diet} profile (${calories} kcal/day): ${ragHint}`;
  }
  return `Here's personalized nutrition guidance based on your goals (${calories} kcal/day) and health profile. Ask me about meals, restaurants, or your daily progress.`;
}
