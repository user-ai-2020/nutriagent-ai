export type FoodTemplate = {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
  quantity: string;
};

export const BREAKFAST_FOODS: FoodTemplate[] = [
  { name: "Greek yogurt with berries", calories: 220, protein: 18, fat: 6, carbs: 28, sugar: 18, quantity: "1 bowl" },
  { name: "Scrambled eggs on toast", calories: 340, protein: 18, fat: 18, carbs: 28, sugar: 3, quantity: "2 eggs + 2 slices" },
  { name: "Oatmeal with banana", calories: 310, protein: 10, fat: 7, carbs: 52, sugar: 14, quantity: "1 serving" },
  { name: "Avocado toast", calories: 290, protein: 8, fat: 16, carbs: 30, sugar: 2, quantity: "2 slices" },
  { name: "Shakshuka", calories: 380, protein: 16, fat: 22, carbs: 24, sugar: 8, quantity: "1 plate" },
];

export const LUNCH_FOODS: FoodTemplate[] = [
  { name: "Grilled chicken salad", calories: 420, protein: 38, fat: 18, carbs: 22, sugar: 6, quantity: "1 large bowl" },
  { name: "Salmon rice bowl", calories: 540, protein: 32, fat: 20, carbs: 52, sugar: 4, quantity: "1 bowl" },
  { name: "Turkey whole-wheat wrap", calories: 480, protein: 28, fat: 16, carbs: 48, sugar: 5, quantity: "1 wrap" },
  { name: "Lentil soup with bread", calories: 390, protein: 18, fat: 8, carbs: 58, sugar: 6, quantity: "1 bowl" },
  { name: "Tuna poke bowl", calories: 510, protein: 34, fat: 14, carbs: 56, sugar: 8, quantity: "1 bowl" },
];

export const DINNER_FOODS: FoodTemplate[] = [
  { name: "Baked salmon with vegetables", calories: 520, protein: 36, fat: 28, carbs: 18, sugar: 6, quantity: "180g salmon" },
  { name: "Chicken stir-fry with rice", calories: 580, protein: 34, fat: 16, carbs: 68, sugar: 10, quantity: "1 plate" },
  { name: "Penne pasta with tomato sauce", calories: 620, protein: 18, fat: 14, carbs: 96, sugar: 12, quantity: "320g" },
  { name: "Beef steak with roasted potatoes", calories: 680, protein: 42, fat: 36, carbs: 38, sugar: 3, quantity: "200g steak" },
  { name: "Vegetable curry with rice", calories: 540, protein: 14, fat: 18, carbs: 78, sugar: 10, quantity: "1 plate" },
];

export const SNACK_FOODS: FoodTemplate[] = [
  { name: "Apple with almond butter", calories: 190, protein: 4, fat: 10, carbs: 22, sugar: 16, quantity: "1 medium apple" },
  { name: "Protein bar", calories: 210, protein: 20, fat: 8, carbs: 22, sugar: 12, quantity: "1 bar" },
  { name: "Hummus with carrots", calories: 160, protein: 6, fat: 9, carbs: 16, sugar: 6, quantity: "1 snack plate" },
  { name: "Mixed nuts", calories: 220, protein: 7, fat: 18, carbs: 8, sugar: 3, quantity: "30g" },
];

export const BLOWOUT_FOODS: FoodTemplate[] = [
  { name: "Double cheeseburger with fries", calories: 980, protein: 42, fat: 58, carbs: 72, sugar: 10, quantity: "1 combo" },
  { name: "Large pepperoni pizza (3 slices)", calories: 870, protein: 36, fat: 42, carbs: 88, sugar: 12, quantity: "3 slices" },
  { name: "Sushi platter", calories: 920, protein: 38, fat: 28, carbs: 118, sugar: 22, quantity: "18 pieces" },
  { name: "BBQ ribs with mashed potatoes", calories: 1050, protein: 48, fat: 62, carbs: 68, sugar: 14, quantity: "1 plate" },
];

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export function foodsForMealType(mealType: MealType): FoodTemplate[] {
  switch (mealType) {
    case "breakfast":
      return BREAKFAST_FOODS;
    case "lunch":
      return LUNCH_FOODS;
    case "dinner":
      return DINNER_FOODS;
    case "snack":
      return SNACK_FOODS;
  }
}
