/**
 * `meal_type` is stored as a lowercase English enum ("lunch"). Rendering the raw
 * column — which several screens did — left an English "LUNCH" badge sitting in
 * an otherwise fully translated page. Map it to the locale instead; unknown
 * values fall through unchanged rather than showing a missing-key string.
 */
export function mealTypeLabel(
  mealType: string | null | undefined,
  t: (key: string) => string
): string {
  const key = (mealType ?? "").trim().toLowerCase();
  switch (key) {
    case "breakfast":
      return t("dashboard.breakfast");
    case "lunch":
      return t("dashboard.lunch");
    case "dinner":
      return t("dashboard.dinner");
    case "snack":
      return t("dashboard.snack");
    default:
      return mealType ?? "";
  }
}
