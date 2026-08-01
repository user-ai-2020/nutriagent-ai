import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../../../.env") });

import { prisma } from "../src";
import { dateKeyToUtcDate, parseStepsByDate } from "./synthetic/constants";

export const BACKFILL_STEPS_SOURCE = "diet-goals-backfill";

export async function backfillDailyStepsFromDietGoals(): Promise<{
  profilesScanned: number;
  rowsUpserted: number;
}> {
  const profiles = await prisma.userProfile.findMany();
  let rowsUpserted = 0;

  for (const profile of profiles) {
    const stepsByDate = parseStepsByDate(profile.dietGoals);
    for (const [dateKey, steps] of Object.entries(stepsByDate)) {
      await prisma.dailySteps.upsert({
        where: {
          userId_date: {
            userId: profile.userId,
            date: dateKeyToUtcDate(dateKey),
          },
        },
        create: {
          userId: profile.userId,
          date: dateKeyToUtcDate(dateKey),
          steps,
          source: BACKFILL_STEPS_SOURCE,
        },
        update: {
          steps,
          source: BACKFILL_STEPS_SOURCE,
        },
      });
      rowsUpserted += 1;
    }
  }

  return { profilesScanned: profiles.length, rowsUpserted };
}

async function main() {
  const result = await backfillDailyStepsFromDietGoals();
  console.log("DailySteps backfill completed:");
  console.log(`  profiles scanned: ${result.profilesScanned}`);
  console.log(`  rows upserted: ${result.rowsUpserted}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
