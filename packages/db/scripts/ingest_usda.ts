import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Resolved relative to the repo root so this runs on any machine; override with
// USDA_DIR when the extracted FoodData Central CSVs live elsewhere.
const DEFAULT_USDA_DIR = path.resolve(
  __dirname,
  '../../../usda_extracted/FoodData_Central_foundation_food_csv_2026-04-30'
);
const USDA_DIR = process.env.USDA_DIR
  ? path.resolve(process.env.USDA_DIR)
  : DEFAULT_USDA_DIR;

if (!fs.existsSync(USDA_DIR)) {
  console.error(
    `USDA data directory not found: ${USDA_DIR}\n` +
      `Extract usda.zip at the repo root, or set USDA_DIR to the folder containing food.csv.`
  );
  process.exit(1);
}

const nutrientMap: Record<string, string> = {
  '1008': 'calories',
  '1003': 'protein',
  '1004': 'fat',
  '1005': 'carbs'
};

async function readCSV(filePath: string): Promise<any[]> {
  const records = [];
  const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, skip_empty_lines: true }));
  for await (const record of parser) {
    records.push(record);
  }
  return records;
}

async function main() {
  console.log('Reading foundation_food.csv...');
  const foundationFoods = await readCSV(path.join(USDA_DIR, 'foundation_food.csv'));
  const foundationIds = new Set(foundationFoods.map(f => f.fdc_id));
  
  console.log('Reading food.csv...');
  const allFoods = await readCSV(path.join(USDA_DIR, 'food.csv'));
  const foodDescriptions = new Map<string, string>();
  for (const food of allFoods) {
    if (foundationIds.has(food.fdc_id)) {
      foodDescriptions.set(food.fdc_id, food.description);
    }
  }

  console.log('Reading food_nutrient.csv...');
  const allNutrients = await readCSV(path.join(USDA_DIR, 'food_nutrient.csv'));
  const foodNutrients = new Map<string, any>();
  
  for (const nut of allNutrients) {
    if (foundationIds.has(nut.fdc_id) && nutrientMap[nut.nutrient_id]) {
      const field = nutrientMap[nut.nutrient_id];
      if (!foodNutrients.has(nut.fdc_id)) {
        foodNutrients.set(nut.fdc_id, { calories: 0, protein: 0, fat: 0, carbs: 0 });
      }
      foodNutrients.get(nut.fdc_id)[field] = parseFloat(nut.amount) || 0;
    }
  }

  const entries = [];
  for (const fdc_id of foundationIds) {
    const description = foodDescriptions.get(fdc_id);
    if (!description) continue;
    const nuts = foodNutrients.get(fdc_id) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
    entries.push({
      fdcId: parseInt(fdc_id),
      description,
      calories: nuts.calories,
      protein: nuts.protein,
      fat: nuts.fat,
      carbs: nuts.carbs,
    });
  }

  console.log(`Inserting ${entries.length} local foods into DB...`);
  await prisma.localFood.deleteMany({});
  
  const chunkSize = 1000;
  for (let i = 0; i < entries.length; i += chunkSize) {
    await prisma.localFood.createMany({ data: entries.slice(i, i + chunkSize) });
  }
  console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
