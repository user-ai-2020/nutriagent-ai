import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../../../.env") });

import { prisma } from "../src";
import { SeedCliError, parseSeedCliArgs } from "./synthetic/cli";
import { SYNTHETIC_DEMO_SOURCE, dateKeyToUtcDate } from "./synthetic/constants";
import { computeDateRange, generateSyntheticDays } from "./synthetic/generator";

const DEMO_EMAIL = "user@nutriagent.ai";

async function resolveUserId(explicitUserId?: number): Promise<number> {
  if (explicitUserId !== undefined) {
    const user = await prisma.user.findUnique({ where: { userId: explicitUserId } });
    if (!user) {
      throw new SeedCliError(`User ${explicitUserId} does not exist — run pnpm db:seed or pass a valid --userId`);
    }
    return explicitUserId;
  }

  const demo = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!demo) {
    throw new SeedCliError(`Demo user ${DEMO_EMAIL} not found — run pnpm db:seed first`);
  }
  return demo.userId;
}

async function clearSyntheticRange(
  userId: number,
  start: Date,
  end: Date
): Promise<{ meals: number; dailySteps: number }> {
  const [meals, dailySteps] = await prisma.$transaction([
    prisma.meal.deleteMany({
      where: {
        userId,
        source: SYNTHETIC_DEMO_SOURCE,
        mealDatetime: { gte: start, lte: end },
      },
    }),
    prisma.dailySteps.deleteMany({
      where: {
        userId,
        source: SYNTHETIC_DEMO_SOURCE,
        date: {
          gte: dateKeyToUtcDate(start.toISOString().slice(0, 10)),
          lte: dateKeyToUtcDate(end.toISOString().slice(0, 10)),
        },
      },
    }),
  ]);

  return { meals: meals.count, dailySteps: dailySteps.count };
}

async function persistSyntheticDays(
  userId: number,
  days: ReturnType<typeof generateSyntheticDays>
): Promise<{ meals: number; images: number; dailySteps: number }> {
  let mealCount = 0;
  let imageCount = 0;
  let dailyStepsCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const day of days) {
      // Upsert assumes no non-synthetic daily_steps rows overlap this date range;
      // otherwise synthetic-demo would overwrite (e.g. manual/backfill) and clearSyntheticRange could delete them later.
      await tx.dailySteps.upsert({
        where: {
          userId_date: {
            userId,
            date: dateKeyToUtcDate(day.dateKey),
          },
        },
        create: {
          userId,
          date: dateKeyToUtcDate(day.dateKey),
          steps: day.steps,
          source: SYNTHETIC_DEMO_SOURCE,
        },
        update: {
          steps: day.steps,
          source: SYNTHETIC_DEMO_SOURCE,
        },
      });
      dailyStepsCount += 1;

      for (const meal of day.meals) {
        await tx.meal.create({
          data: {
            userId,
            mealDatetime: meal.mealDatetime,
            mealType: meal.mealType,
            source: SYNTHETIC_DEMO_SOURCE,
            items: {
              create: meal.items.map((item) => ({
                foodType: item.name,
                estimatedQuantity: item.quantity,
                visionConfidence: item.visionConfidence,
                nutritionValues: {
                  create: {
                    calories: item.calories,
                    protein: item.protein,
                    fat: item.fat,
                    carbs: item.carbs,
                    sugar: item.sugar,
                  },
                },
              })),
            },
            ...(meal.image
              ? {
                  images: {
                    create: {
                      id: meal.image.id,
                      userId,
                      storageKey: meal.image.storageKey,
                      width: meal.image.width,
                      height: meal.image.height,
                      fileSizeBytes: meal.image.fileSizeBytes,
                      contentHash: meal.image.contentHash,
                      capturedAt: meal.image.capturedAt,
                      recognizedAt: meal.image.recognizedAt,
                      visionModelVersion: meal.image.visionModelVersion,
                    },
                  },
                }
              : {}),
          },
        });
        mealCount += 1;
        if (meal.image) imageCount += 1;
      }
    }
  });

  return { meals: mealCount, images: imageCount, dailySteps: dailyStepsCount };
}

async function updateProfileTodaySteps(
  userId: number,
  days: ReturnType<typeof generateSyntheticDays>
): Promise<void> {
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = days.find((d) => d.dateKey === todayKey);
  if (!today) return;

  await prisma.userProfile.update({
    where: { userId },
    data: { todaySteps: today.steps },
  });
}

export async function runSyntheticMonthSeed(options: {
  userId?: number;
  days: number;
  seed: number;
  now?: Date;
}): Promise<void> {
  const userId = await resolveUserId(options.userId);
  const range = computeDateRange(options.days, options.now);

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  const goals = (profile?.dietGoals as Record<string, number> | undefined) ?? {};
  const baseDailyCalories = goals.dailyCalories ?? 2000;

  const removed = await clearSyntheticRange(userId, range.start, range.end);
  const generated = generateSyntheticDays({
    userId,
    days: options.days,
    seed: options.seed,
    baseDailyCalories,
    now: options.now,
  });

  const inserted = await persistSyntheticDays(userId, generated);
  await updateProfileTodaySteps(userId, generated);

  const blowouts = generated.filter((d) => d.isBlowout).length;
  console.log("Synthetic month seed completed:");
  console.log(`  userId=${userId}  days=${options.days}  seed=${options.seed}`);
  console.log(`  range: ${range.start.toISOString().slice(0, 10)} → ${range.end.toISOString().slice(0, 10)}`);
  console.log(
    `  removed ${removed.meals} synthetic meal(s), ${removed.dailySteps} synthetic daily_steps row(s) in range`
  );
  console.log(
    `  inserted ${inserted.meals} meals, ${inserted.dailySteps} daily_steps rows, ${inserted.images} meal image(s)`
  );
  console.log(`  blowout days: ${blowouts}/${options.days} (~${Math.round((blowouts / options.days) * 100)}%)`);
}

async function main() {
  const options = parseSeedCliArgs();
  await runSyntheticMonthSeed(options);
}

main()
  .catch((err) => {
    console.error(err instanceof SeedCliError ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
