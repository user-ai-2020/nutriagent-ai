import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Local (not UTC) YYYY-MM-DD — toISOString() would shift the day for anyone
 *  behind UTC and land the dashboard on the wrong date. */
export function toDateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Centralized query keys
export const queryKeys = {
  dashboard: (date: string, period: string) => ["dashboard", date, period] as const,
  profile: () => ["profile"] as const,
  meals: (params: string) => ["meals", params] as const,
  meal: (id: number | null) => ["meal", id] as const,
};

// --- Queries ---

export function useDashboard(dateKey: string, period: "day" | "week" | "month" = "week") {
  // Guard against a non-date being passed positionally (the period and date args
  // are easy to swap); the API rejects anything that isn't YYYY-MM-DD with a 400
  // that surfaces as a full-page "Invalid date" error.
  const safeDateKey = DATE_KEY_RE.test(dateKey) ? dateKey : toDateKey();

  return useQuery({
    queryKey: queryKeys.dashboard(safeDateKey, period),
    queryFn: () => api<any>(`/api/dashboard?period=${period}&date=${safeDateKey}`),
    // Keep showing the previous day/period while the next one loads. Without this
    // the data goes undefined on every change and the whole dashboard unmounts and
    // remounts — the visible "blink" when stepping through days.
    placeholderData: keepPreviousData,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile(),
    queryFn: () => api<any>("/api/profile"),
    staleTime: 5 * 60 * 1000, // 5 min - profile rarely changes
  });
}

export function useMeals(params: string) {
  return useQuery({
    queryKey: queryKeys.meals(params),
    queryFn: () => api<any[]>(`/api/meals?${params}`),
    enabled: !!params,
  });
}

export function useMeal(id: number | null) {
  return useQuery({
    queryKey: queryKeys.meal(id),
    queryFn: () =>
      api<{
        mealId: number;
        mealDatetime: string;
        mealType: string;
        imageUrl?: string | null;
        items: Array<{
          itemId: number;
          foodType: string;
          estimatedQuantity: string;
          visionConfidence?: number | null;
          nutritionValues?: {
            calories: number;
            protein: number;
            fat: number;
            carbs: number;
            sugar?: number;
          } | null;
        }>;
      }>(`/api/meals/${id}`),
    enabled: id !== null && id > 0,
  });
}

// --- Mutations ---

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api("/api/profile", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profile() }),
  });
}

/**
 * Record the step count for a day. The API upserts on (userId, date), so this is
 * a set-to-value operation rather than an increment — callers that want "+1000"
 * pass the already-summed total. Invalidates the dashboard (which reads steps
 * from daily_steps) and the profile (whose todaySteps cache the API updates).
 */
export function useLogSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ steps, date }: { steps: number; date?: string }) =>
      api("/api/activity/steps", {
        method: "POST",
        body: JSON.stringify({ steps, ...(date ? { date } : {}) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });
}

export function useEditMealItem(mealId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, foodType }: { itemId: number; foodType: string }) =>
      api(`/api/meals/${mealId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ foodType }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meal(mealId) });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

/** Call after a meal is logged via chat to refresh dashboard/meals */
export function useInvalidateMealData() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["meals"] });
  };
}
