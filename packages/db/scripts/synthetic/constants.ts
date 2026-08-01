/** Shared source tag for synthetic demo seed rows (meals + daily steps). */
export const SYNTHETIC_DEMO_SOURCE = "synthetic-demo";

/** @deprecated use SYNTHETIC_DEMO_SOURCE */
export const SYNTHETIC_MEAL_SOURCE = SYNTHETIC_DEMO_SOURCE;

export function dateKeyToUtcDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

export function parseStepsByDate(goals: unknown): Record<string, number> {
  if (!goals || typeof goals !== "object") return {};
  const raw = (goals as Record<string, unknown>).stepsByDate;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const steps = Number(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(steps) && steps >= 0) {
      out[key] = Math.round(steps);
    }
  }
  return out;
}
