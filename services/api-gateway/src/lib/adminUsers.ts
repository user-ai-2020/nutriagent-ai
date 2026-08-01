import { prisma, UserProfile, Meal, MealItem, NutritionValue } from "@nutriagent/db";

export async function countActiveAdmins(): Promise<number> {
  const adminRole = await prisma.role.findUnique({ where: { roleName: "Admin" } });
  if (!adminRole) return 0;
  return prisma.user.count({
    where: { roleId: adminRole.roleId, accountStatus: "active" },
  });
}

export function parsePagination(
  query: Record<string, unknown>,
  defaults: { limit: number; maxLimit: number }
): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(query.limit) || defaults.limit, 1), defaults.maxLimit);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

export function mapUserSummary(u: {
  userId: number;
  name: string;
  email: string;
  accountStatus: string;
  createdAt: Date;
  role: { roleName: string };
}) {
  return {
    userId: u.userId,
    name: u.name,
    email: u.email,
    role: u.role.roleName,
    accountStatus: u.accountStatus,
    createdAt: u.createdAt.toISOString(),
  };
}

export function mapUserProfile(profile: UserProfile | null) {
  if (!profile) return null;
  return {
    dietGoals: profile.dietGoals,
    healthRestrictions: profile.healthRestrictions,
    allergies: profile.allergies,
    dietType: profile.dietType,
    weight: profile.weight,
    height: profile.height,
    age: profile.age,
    dailyStepsGoal: profile.dailyStepsGoal,
    preferredLanguage: profile.preferredLanguage,
  };
}

type MealWithItems = Meal & {
  items: (MealItem & { nutritionValues: NutritionValue | null })[];
};

export function mapMeal(meal: MealWithItems) {
  return {
    mealId: meal.mealId,
    mealDatetime: meal.mealDatetime.toISOString(),
    mealType: meal.mealType,
    source: meal.source,
    imageUrl: meal.imageUrl,
    items: meal.items.map((item) => ({
      itemId: item.itemId,
      foodType: item.foodType,
      estimatedQuantity: item.estimatedQuantity,
      visionConfidence: item.visionConfidence,
      nutrition: item.nutritionValues
        ? {
            calories: item.nutritionValues.calories,
            protein: item.nutritionValues.protein,
            fat: item.nutritionValues.fat,
            carbs: item.nutritionValues.carbs,
            sugar: item.nutritionValues.sugar,
          }
        : null,
    })),
  };
}

export async function assertCanDemoteAdmin(targetUserId: number): Promise<string | null> {
  const target = await prisma.user.findUnique({
    where: { userId: targetUserId },
    include: { role: true },
  });
  if (!target || target.role.roleName !== "Admin") return null;

  const adminCount = await countActiveAdmins();
  if (adminCount <= 1) {
    return "Cannot remove the last admin";
  }
  return null;
}

export async function assertCanDeleteUser(
  actorUserId: number,
  targetUserId: number
): Promise<string | null> {
  if (actorUserId === targetUserId) {
    return "Cannot delete your own account";
  }

  const target = await prisma.user.findUnique({
    where: { userId: targetUserId },
    include: { role: true },
  });
  if (!target) return "User not found";

  if (target.role.roleName === "Admin") {
    const adminCount = await countActiveAdmins();
    if (adminCount <= 1) {
      return "Cannot delete the last admin";
    }
  }

  return null;
}
