import type { UserProfile } from "@nutriagent/db";
import type { UserProfileData } from "@nutriagent/shared";

/** Maps Prisma UserProfile row → orchestrator/agent profile payload. */
export function toUserProfileData(profile: UserProfile | null | undefined): UserProfileData | undefined {
  if (!profile) return undefined;

  const preferredLanguage =
    profile.preferredLanguage === "he" ||
    profile.preferredLanguage === "en" ||
    profile.preferredLanguage === "ru"
      ? profile.preferredLanguage
      : undefined;

  return {
    dietGoals: (profile.dietGoals as UserProfileData["dietGoals"]) ?? {},
    healthRestrictions: (profile.healthRestrictions as string[]) ?? [],
    allergies: (profile.allergies as string[]) ?? [],
    dietType: profile.dietType ?? undefined,
    weight: profile.weight ?? undefined,
    height: profile.height ?? undefined,
    age: profile.age ?? undefined,
    // Passed to the agents so advice matches the training goal — a cut and a lean
    // bulk need different portion guidance for the same person.
    sex: (profile.sex as UserProfileData["sex"]) ?? undefined,
    activityLevel: (profile.activityLevel as UserProfileData["activityLevel"]) ?? undefined,
    fitnessGoal: (profile.fitnessGoal as UserProfileData["fitnessGoal"]) ?? undefined,
    preferredLanguage,
  };
}
