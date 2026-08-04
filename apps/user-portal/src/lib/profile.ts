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

export const RESTRICTIONS = [
  { id: "gluten-free", label: "Gluten-free", kind: "restriction" },
  { id: "nuts", label: "Nut allergy", kind: "allergy" },
  { id: "dairy-free", label: "Dairy-free", kind: "restriction" },
  { id: "low-sodium", label: "Low-sodium", kind: "restriction" },
] as const;

export const DIET_TYPES = [
  { id: "balanced", label: "Balanced" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "keto", label: "Ketogenic" },
  { id: "low-carb", label: "Low-carb" },
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
