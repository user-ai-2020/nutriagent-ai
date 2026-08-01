"use client";

import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

interface Stats {
  userCount: number;
  mealCount: number;
  chatCount: number;
  logCount: number;
}

export default function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api<Stats>("/api/admin/stats"),
  });

  const cards = [
    { label: "Users", kicker: "Accounts", value: stats?.userCount },
    { label: "Meals", kicker: "Logged", value: stats?.mealCount },
    { label: "Chat messages", kicker: "Agent traffic", value: stats?.chatCount },
    { label: "Audit entries", kicker: "Postgres", value: stats?.logCount },
  ];

  return (
    <AdminShell>
      <h2 style={{ fontSize: 22, margin: "0 0 2px" }}>System overview</h2>
      <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 var(--space-4)" }}>
        Live counters across the agent stack — refreshed on each visit.
      </p>

      <div className="na-nutrient-grid">
        {cards.map((card) => (
          <div key={card.label} className="card elev-sm" style={{ gap: 6 }}>
            <div className="card-kicker">{card.kicker}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 30, lineHeight: 1.1 }}>
              {card.value ?? "—"}
            </div>
            <div style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
