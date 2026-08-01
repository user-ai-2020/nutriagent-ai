import bcrypt from "bcryptjs";
import { prisma } from "../src";

async function main() {
  const userRole = await prisma.role.upsert({
    where: { roleName: "User" },
    update: {},
    create: { roleName: "User" },
  });

  const adminRole = await prisma.role.upsert({
    where: { roleName: "Admin" },
    update: {},
    create: { roleName: "Admin" },
  });

  const userPassword = await bcrypt.hash("user123", 10);
  const adminPassword = await bcrypt.hash("admin123", 10);

  const demoUser = await prisma.user.upsert({
    where: { email: "user@nutriagent.ai" },
    update: {
      profile: {
        update: {
          healthRestrictions: [],
          allergies: [],
        },
      },
    },
    create: {
      name: "Demo User",
      email: "user@nutriagent.ai",
      passwordHash: userPassword,
      roleId: userRole.roleId,
      profile: {
        create: {
          dietGoals: {
            dailyCalories: 2000,
            proteinGrams: 120,
            carbsGrams: 250,
            fatGrams: 65,
          },
          healthRestrictions: [],
          allergies: [],
          dietType: "balanced",
          weight: 75,
          height: 175,
          age: 30,
        },
      },
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@nutriagent.ai" },
    update: {},
    create: {
      name: "System Admin",
      email: "admin@nutriagent.ai",
      passwordHash: adminPassword,
      roleId: adminRole.roleId,
    },
  });

  const knowledgeDocs = [
    {
      title: "Diabetes-friendly meal choices",
      content:
        "For diabetes management, prioritize low glycemic index foods: lean proteins, non-starchy vegetables, whole grains. Avoid sugary drinks and refined carbs. Recommended restaurant choices: grilled chicken salad, salmon with steamed vegetables.",
      category: "health",
    },
    {
      title: "Protein sources and macros",
      content:
        "100g grilled chicken breast: ~165 kcal, 31g protein, 3.6g fat, 0g carbs. 100g salmon: ~208 kcal, 20g protein, 13g fat, 0g carbs. 100g tofu: ~76 kcal, 8g protein, 4.8g fat, 1.9g carbs.",
      category: "nutrition",
    },
    {
      title: "Peanut allergy substitutes",
      content:
        "Safe alternatives to peanuts: sunflower seed butter, soy nut butter, tahini (if no sesame allergy). Always check cross-contamination labels in restaurants.",
      category: "allergy",
    },
    {
      title: "Balanced diet guidelines (WHO/DRI)",
      content:
        "Adults should aim for 45-65% calories from carbs, 10-35% from protein, 20-35% from fat. Limit added sugars to less than 10% of total energy. Daily fiber: 25-38g.",
      category: "guidelines",
    },
    {
      title: "ארוחות ביניים מאוזנות — איחוד המזון / משרד הבריאות",
      content:
        "ארוחת ביניים מאוזנת כוללת מנה מכל קבוצת מזון: חלבון (יוגורט טבעי, גבינה לבנה, חביתה), פחמימה מלאה (לחם מלא, גרנולה ללא סוכר מוסף), ופירות או ירקות. " +
        "דוגמה: יוגורט 150–200 גרם, 2–3 כפיות גרנולה, חצי כוס פירות. " +
        "הימנעו מארוחות ביניים ממתקים בלבד; שילוב חלבון+פחמימה מורידים תחושת רעב. " +
        "מקור: הנחיות תזונה נכונה, משרד הבריאות / איחוד המזון.",
      category: "nutrition",
    },
  ];

  for (const doc of knowledgeDocs) {
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { title: doc.title },
    });
    if (!existing) {
      await prisma.knowledgeDocument.create({ data: doc });
    }
  }

  console.log("Seed completed:");
  console.log("  User: user@nutriagent.ai / user123");
  console.log("  Admin: admin@nutriagent.ai / admin123");
  console.log("  Demo user ID:", demoUser.userId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
