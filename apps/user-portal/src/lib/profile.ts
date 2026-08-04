export interface Profile {
  dietGoals?: { dailyCalories?: number; proteinGrams?: number; carbsGrams?: number; fatGrams?: number };
  healthRestrictions?: string[];
  allergies?: string[];
  dietType?: string;
  dailyStepsGoal?: number;
  todaySteps?: number;
  /** Body-composition inputs behind BMI / BMR / TDEE and the calorie target. */
  weight?: number;
  height?: number;
  age?: number;
  sex?: "male" | "female";
  activityLevel?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  fitnessGoal?: "lose_fat" | "maintain" | "build_muscle";
}

/**
 * `id` is the wire value (never translate it — it is persisted and matched
 * server-side). `labelKey` is what the UI renders through i18n; these lists used
 * to carry a bare English `label`, which is why the pills stayed in English on a
 * fully Russian Settings page. `label` is kept only as a last-resort fallback if
 * a key is ever missing from a locale.
 */
export const RESTRICTIONS = [
  { id: "gluten-free", labelKey: "profileOptions.glutenFree", label: "Gluten-free", kind: "restriction" },
  { id: "nuts", labelKey: "profileOptions.nutAllergy", label: "Nut allergy", kind: "allergy" },
  { id: "dairy-free", labelKey: "profileOptions.dairyFree", label: "Dairy-free", kind: "restriction" },
  { id: "low-sodium", labelKey: "profileOptions.lowSodium", label: "Low-sodium", kind: "restriction" },
] as const;

export const DIET_TYPES = [
  { id: "balanced", labelKey: "profileOptions.balanced", label: "Balanced" },
  { id: "vegetarian", labelKey: "profileOptions.vegetarian", label: "Vegetarian" },
  { id: "keto", labelKey: "profileOptions.keto", label: "Ketogenic" },
  { id: "low-carb", labelKey: "profileOptions.lowCarb", label: "Low-carb" },
] as const;

export type RestrictionId = (typeof RESTRICTIONS)[number]["id"];

export function selectedRestrictions(profile: Profile): RestrictionId[] {
  return RESTRICTIONS.filter((r) =>
    (r.kind === "allergy" ? profile.allergies : profile.healthRestrictions)?.includes(r.id)
  ).map((r) => r.id);
}

/** Splits the flat pill selection back into the API's allergies / restrictions arrays. */
export function applyRestrictions(profile: Profile, selected: RestrictionId[]): Profile {
  const pick = (kind: "allergy" | "restriction") =>
    RESTRICTIONS.filter((r) => r.kind === kind && selected.includes(r.id)).map((r) => r.id);
  return { ...profile, allergies: pick("allergy"), healthRestrictions: pick("restriction") };
}
