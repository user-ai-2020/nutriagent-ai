import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Centralized query keys
export const queryKeys = {
  dashboard: (date: string) => ["dashboard", date] as const,
  profile: () => ["profile"] as const,
  meals: (params: string) => ["meals", params] as const,
  meal: (id: number | null) => ["meal", id] as const,
};

// --- Queries ---

export function useDashboard(dateKey: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(dateKey),
    queryFn: () => api<any>(`/api/dashboard?period=week&date=${dateKey}`),
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
    queryFn: () => api<any>(`/api/meals/${id}`),
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
