/**
 * Delete leftover no-food placeholder meals (Nothing / unknown / no food visible).
 * Run: pnpm --filter @nutriagent/db exec tsx scripts/cleanupPlaceholderMeals.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

const PLACEHOLDER_RE =
  /^(nothing|none|n\/?a|unknown|item|null|undefined|empty|no food(?: items?)?(?:\s+visible)?|unidentifiable(?:\s+or\s+no\s+food(?:\s+visible)?)?|no items?(?:\s+detected)?)$/i;

async function main() {
  const placeholders = await prisma.mealItem.findMany({
    where: {
      OR: [
        { foodType: { equals: "" } },
        { foodType: { equals: "Nothing", mode: "insensitive" } },
        { foodType: { equals: "unknown", mode: "insensitive" } },
        { foodType: { equals: "none", mode: "insensitive" } },
        { foodType: { contains: "no food", mode: "insensitive" } },
        { foodType: { contains: "unidentifiable", mode: "insensitive" } },
      ],
    },
    select: { itemId: true, mealId: true, foodType: true },
  });

  const mealIds = [...new Set(placeholders.map((p) => p.mealId))];
  console.log(
    "PLACEHOLDER_ITEMS",
    placeholders.map((p) => ({ itemId: p.itemId, mealId: p.mealId, foodType: p.foodType }))
  );

  // Delete whole meals that only contain placeholders (or any meal that had placeholder-only content).
  for (const mealId of mealIds) {
    const items = await prisma.mealItem.findMany({ where: { mealId } });
    const allPlaceholder = items.every((i) => PLACEHOLDER_RE.test(i.foodType.trim()) || !i.foodType.trim());
    if (allPlaceholder) {
      await prisma.meal.delete({ where: { mealId } });
      console.log("DELETED_MEAL", mealId, "items", items.map((i) => i.foodType));
    } else {
      // Meal has real food too — delete only placeholder items
      for (const item of items) {
        if (PLACEHOLDER_RE.test(item.foodType.trim()) || !item.foodType.trim()) {
          await prisma.mealItem.delete({ where: { itemId: item.itemId } });
          console.log("DELETED_ITEM", item.itemId, item.foodType, "from meal", mealId);
        }
      }
    }
  }

  const remaining = await prisma.mealItem.count({
    where: {
      OR: [
        { foodType: { equals: "Nothing", mode: "insensitive" } },
        { foodType: { equals: "unknown", mode: "insensitive" } },
        { foodType: { contains: "no food", mode: "insensitive" } },
      ],
    },
  });
  console.log("REMAINING_PLACEHOLDER_COUNT", remaining);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
