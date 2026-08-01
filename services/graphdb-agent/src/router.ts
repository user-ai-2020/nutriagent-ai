import { Router } from "express";
import { UserProfileData } from "@nutriagent/shared";

export const graphdbRouter = Router();

const CLINICAL_GRAPH: Record<string, { restrictions: string[]; substitutes: string[]; avoid: string[] }> = {
  diabetes: {
    restrictions: ["high glycemic foods", "sugary drinks"],
    substitutes: ["whole grains", "lean protein", "non-starchy vegetables"],
    avoid: ["white bread", "soda", "candy"],
  },
  "peanut allergy": {
    restrictions: ["peanuts", "peanut oil"],
    substitutes: ["sunflower seed butter", "almond butter (if no tree nut allergy)", "tahini"],
    avoid: ["peanut sauce", "mixed nuts", "satay"],
  },
  hypertension: {
    restrictions: ["high sodium"],
    substitutes: ["herbs and spices", "fresh vegetables", "grilled proteins"],
    avoid: ["processed meats", "canned soups", "pickled foods"],
  },
};

graphdbRouter.post("/recommend", async (req, res) => {
  const { profile, foodQuery } = req.body as { profile?: UserProfileData; foodQuery?: string };

  const recommendations: string[] = [];
  const safeFoods: string[] = [];
  const avoidFoods: string[] = [];

  const restrictions = [
    ...(profile?.healthRestrictions ?? []),
    ...(profile?.allergies ?? []).map((a) => `${a} allergy`),
  ];

  for (const restriction of restrictions) {
    const key = Object.keys(CLINICAL_GRAPH).find((k) => restriction.toLowerCase().includes(k));
    if (key) {
      const node = CLINICAL_GRAPH[key];
      safeFoods.push(...node.substitutes);
      avoidFoods.push(...node.avoid);
      recommendations.push(
        `For ${restriction}: prefer ${node.substitutes.slice(0, 2).join(", ")}; avoid ${node.avoid.slice(0, 2).join(", ")}`
      );
    }
  }

  if (foodQuery) {
    const lower = foodQuery.toLowerCase();
    for (const avoid of avoidFoods) {
      if (lower.includes(avoid.toLowerCase())) {
        recommendations.push(`Caution: "${foodQuery}" may conflict with your health profile`);
      }
    }
  }

  res.json({
    recommendations,
    safeFoods: [...new Set(safeFoods)],
    avoidFoods: [...new Set(avoidFoods)],
    source: "clinical-knowledge-graph-poc",
  });
});
