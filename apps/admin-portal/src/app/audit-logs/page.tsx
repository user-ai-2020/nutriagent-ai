"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

interface AuditLog {
  logId: number;
  userId?: number;
  userName?: string;
  userEmail?: string;
  actionType: string;
  details?: Record<string, unknown>;
  sourceIp?: string;
  timestamp: string;
}

type Mode = "recent" | "history";

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "recent", label: "Live (Redis cache)" },
  { value: "history", label: "Full history (Postgres)" },
];

export default function AuditLogsPage() {
  const [mode, setMode] = useState<Mode>("recent");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", mode],
    queryFn: () => api<{ source: string; logs: AuditLog[] }>(`/api/admin/audit-logs?mode=${mode}&limit=100`),
    refetchInterval: mode === "recent" ? 5000 : false,
  });

  return (
    <AdminShell>
      <h2 style={{ fontSize: 22, margin: "0 0 2px" }}>Audit Log</h2>
      <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 var(--space-4)" }}>
        Read-only, Admin-only. Recent activity streams from a Redis cache; searches beyond its window fall through to
        Postgres.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          flexWrap: "wrap",
          marginBottom: "var(--space-4)",
        }}
      >
        <div className="seg">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`seg-opt${mode === m.value ? " is-active" : ""}`}
              onClick={() => setMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={() => refetch()}>
          Refresh
        </button>
        <span className="note">Source: {data?.source ?? "—"}</span>
      </div>

      {isLoading ? (
        <p className="note">Loading logs…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Source IP</th>
                <th>Layer</th>
              </tr>
            </thead>
            <tbody>
              {data?.logs.map((log) => (
                <tr key={log.logId ?? log.timestamp}>
                  <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td>{log.userName || log.userEmail || log.userId || "—"}</td>
                  <td>{log.actionType}</td>
                  <td className="text-muted">{log.sourceIp || "—"}</td>
                  <td>
                    <span className={mode === "recent" ? "tag tag-accent" : "tag tag-neutral"}>
                      {mode === "recent" ? "Redis" : "Postgres"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
