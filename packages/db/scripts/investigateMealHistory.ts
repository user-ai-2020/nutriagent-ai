/**
 * One-off DB investigation for "Nothing"/generic food rows and calorie totals.
 * Run: pnpm --filter @nutriagent/db exec tsx scripts/investigateMealHistory.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "user@nutriagent.ai" },
    select: { userId: true, email: true },
  });
  console.log("USER", user);

  if (!user) return;

  const generic = await prisma.mealItem.findMany({
    where: {
      meal: { userId: user.userId },
      OR: [
        { foodType: { equals: "Nothing", mode: "insensitive" } },
        { foodType: { equals: "none", mode: "insensitive" } },
        { foodType: { equals: "n/a", mode: "insensitive" } },
        { foodType: { equals: "item", mode: "insensitive" } },
        { foodType: { equals: "unknown", mode: "insensitive" } },
        { foodType: { equals: "" } },
        { foodType: { contains: "no food", mode: "insensitive" } },
      ],
    },
    include: {
      meal: { select: { mealId: true, mealDatetime: true, mealType: true, imageUrl: true } },
      nutritionValues: true,
    },
    orderBy: { itemId: "asc" },
  });
  console.log("\n=== GENERIC / NOTHING FOOD ROWS ===");
  console.log(JSON.stringify(generic, null, 2));

  // Yesterday window matching text2sql template (server date)
  const mealsYesterday = await prisma.$queryRaw<
    Array<{
      meal_id: number;
      meal_datetime: Date;
      meal_type: string;
      item_id: number;
      food_type: string;
      estimated_quantity: string;
      calories: number;
    }>
  >`
    SELECT m.meal_id, m.meal_datetime, m.meal_type,
           mi.item_id, mi.food_type, mi.estimated_quantity,
           COALESCE(nv.calories, 0) AS calories
    FROM meals m
    JOIN meal_items mi ON mi.meal_id = m.meal_id
    LEFT JOIN nutrition_values nv ON nv.item_id = mi.item_id
    WHERE m.user_id = ${user.userId}
      AND m.meal_datetime >= CURRENT_DATE - INTERVAL '1 day'
      AND m.meal_datetime < CURRENT_DATE
    ORDER BY m.meal_datetime, mi.item_id
  `;

  console.log("\n=== YESTERDAY RAW ROWS (SQL) ===");
  console.log(JSON.stringify(mealsYesterday, null, 2));

  // Aggregate per meal
  const byMeal = new Map<
    number,
    { mealType: string; datetime: Date; items: Array<{ foodType: string; calories: number }>; sum: number }
  >();
  for (const row of mealsYesterday) {
    const cur = byMeal.get(row.meal_id) ?? {
      mealType: row.meal_type,
      datetime: row.meal_datetime,
      items: [],
      sum: 0,
    };
    const cal = Number(row.calories) || 0;
    cur.items.push({ foodType: row.food_type, calories: cal });
    cur.sum += cal;
    byMeal.set(row.meal_id, cur);
  }

  console.log("\n=== YESTERDAY PER-MEAL SUMS ===");
  let grand = 0;
  for (const [mealId, m] of [...byMeal.entries()].sort((a, b) => a[0] - b[0])) {
    grand += m.sum;
    console.log(
      JSON.stringify({
        mealId,
        mealType: m.mealType,
        datetime: m.datetime,
        itemCount: m.items.length,
        itemCalories: m.items.map((i) => `${i.foodType}=${i.calories}`),
        mealSum: Math.round(m.sum),
      })
    );
  }
  console.log("GRAND_TOTAL_YESTERDAY", Math.round(grand), "MEAL_COUNT", byMeal.size);

  // Any single meal near 3612 for this user (all time)
  const bigMeals = await prisma.$queryRaw<
    Array<{ meal_id: number; meal_datetime: Date; meal_type: string; item_count: bigint; meal_calories: number }>
  >`
    SELECT m.meal_id, m.meal_datetime, m.meal_type,
           COUNT(mi.item_id)::bigint AS item_count,
           COALESCE(SUM(nv.calories), 0)::float AS meal_calories
    FROM meals m
    JOIN meal_items mi ON mi.meal_id = m.meal_id
    LEFT JOIN nutrition_values nv ON nv.item_id = mi.item_id
    WHERE m.user_id = ${user.userId}
    GROUP BY m.meal_id, m.meal_datetime, m.meal_type
    HAVING COALESCE(SUM(nv.calories), 0) >= 2000
    ORDER BY meal_calories DESC
    LIMIT 20
  `;
  console.log("\n=== MEALS WITH >=2000 KCAL (all time) ===");
  console.log(JSON.stringify(bigMeals, null, 2));

  for (const big of bigMeals.slice(0, 3)) {
    const items = await prisma.mealItem.findMany({
      where: { mealId: Number(big.meal_id) },
      include: { nutritionValues: true },
      orderBy: { itemId: "asc" },
    });
    console.log(`\n=== DETAIL meal_id=${big.meal_id} ===`);
    console.log(
      JSON.stringify(
        items.map((i) => ({
          itemId: i.itemId,
          foodType: i.foodType,
          quantity: i.estimatedQuantity,
          calories: i.nutritionValues?.calories ?? null,
        })),
        null,
        2
      )
    );
  }

  // Count how many "Nothing" exist globally
  const nothingCount = await prisma.mealItem.count({
    where: { foodType: { equals: "Nothing", mode: "insensitive" } },
  });
  console.log("\nGLOBAL_NOTHING_COUNT", nothingCount);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
