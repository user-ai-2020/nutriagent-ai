"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

type Tab = "profile" | "meals" | "logs";

interface UserDetailResponse {
  user: {
    userId: number;
    name: string;
    email: string;
    role: string;
    accountStatus: string;
    createdAt: string;
  };
  profile: {
    dietGoals: unknown;
    healthRestrictions: unknown;
    allergies: unknown;
    dietType: string | null;
    weight: number | null;
    height: number | null;
    age: number | null;
    dailyStepsGoal: number;
    preferredLanguage: string | null;
  } | null;
  meals: {
    items: Array<{
      mealId: number;
      mealDatetime: string;
      mealType: string;
      items: Array<{
        foodType: string;
        estimatedQuantity: string;
        nutrition: { calories: number; protein: number; fat: number; carbs: number } | null;
      }>;
    }>;
    total: number;
    limit: number;
    offset: number;
  };
  auditLogs: {
    items: Array<{
      logId: number;
      actionType: string;
      timestamp: string;
      details: unknown;
    }>;
    total: number;
    limit: number;
    offset: number;
  };
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  const text =
    typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  return (
    <pre
      style={{
        margin: 0,
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "var(--font-mono, monospace)",
      }}
    >
      {text}
    </pre>
  );
}

export default function UserDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const userId = Number(params.userId);
  const [tab, setTab] = useState<Tab>("profile");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: () => api<UserDetailResponse>(`/api/admin/users/${userId}/detail`),
    enabled: Number.isFinite(userId),
  });

  const changeRole = useMutation({
    mutationFn: (role: "User" | "Admin") =>
      api(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const deleteUser = useMutation({
    mutationFn: () => api(`/api/admin/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      router.push("/users");
    },
    onError: (err: Error) => {
      setShowDeleteConfirm(false);
      setActionError(err.message);
    },
  });

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: "profile", labelKey: "admin.tabProfile" },
    { id: "meals", labelKey: "admin.tabMeals" },
    { id: "logs", labelKey: "admin.tabLogs" },
  ];

  return (
    <AdminShell>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Link href="/users" className="note" style={{ fontSize: 13 }}>
          {t("admin.backToUsers")}
        </Link>
      </div>

      {isLoading ? (
        <p className="note">{t("admin.loadingDetail")}</p>
      ) : error || !data ? (
        <p className="note">{String(error)}</p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              marginBottom: "var(--space-4)",
            }}
          >
            <div>
              <h2 style={{ fontSize: 22, margin: "0 0 4px" }}>{data.user.name}</h2>
              <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
                {data.user.email}
              </p>
              <p className="note" style={{ margin: "4px 0 0", fontSize: 12 }}>
                {data.user.role} · {data.user.accountStatus}
              </p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                {t("admin.changeRole")}
                <select
                  className="input"
                  style={{ fontSize: 13, padding: "4px 8px" }}
                  value={data.user.role}
                  onChange={(e) => {
                    const role = e.target.value as "User" | "Admin";
                    if (role !== data.user.role) changeRole.mutate(role);
                  }}
                  disabled={changeRole.isPending}
                >
                  <option value="User">{t("admin.roleUser")}</option>
                  <option value="Admin">{t("admin.roleAdmin")}</option>
                </select>
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: "var(--color-danger, #c44)" }}
                onClick={() => setShowDeleteConfirm(true)}
              >
                {t("admin.deleteUser")}
              </button>
            </div>
          </div>

          {actionError && (
            <p style={{ color: "var(--color-danger, #c44)", fontSize: 13, marginBottom: "var(--space-3)" }}>
              {actionError}
            </p>
          )}

          <div className="seg" style={{ marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
            {tabs.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                className={`seg-opt${tab === id ? " is-active" : ""}`}
                onClick={() => setTab(id)}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <div className="card" style={{ padding: "var(--space-4)" }}>
              {!data.profile ? (
                <p className="note">{t("admin.noProfile")}</p>
              ) : (
                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(140px, 200px) 1fr",
                    gap: "var(--space-2) var(--space-4)",
                    margin: 0,
                    fontSize: 14,
                  }}
                >
                  {(
                    [
                      ["admin.profileDietGoals", data.profile.dietGoals],
                      ["admin.profileHealthRestrictions", data.profile.healthRestrictions],
                      ["admin.profileAllergies", data.profile.allergies],
                      ["admin.profileDietType", data.profile.dietType],
                      ["admin.profileWeight", data.profile.weight],
                      ["admin.profileHeight", data.profile.height],
                      ["admin.profileAge", data.profile.age],
                      ["admin.profileStepsGoal", data.profile.dailyStepsGoal],
                      ["admin.profileLanguage", data.profile.preferredLanguage],
                    ] as const
                  ).map(([key, val]) => (
                    <div key={key} style={{ display: "contents" }}>
                      <dt className="text-muted">{t(key)}</dt>
                      <dd style={{ margin: 0 }}>
                        <JsonBlock value={val} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          {tab === "meals" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {data.meals.items.length === 0 ? (
                <p className="note">{t("admin.noMeals")}</p>
              ) : (
                data.meals.items.map((meal) => (
                  <div key={meal.mealId} className="card" style={{ padding: "var(--space-3)" }}>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>
                      <strong>{meal.mealType}</strong>
                      <span className="text-muted"> · {new Date(meal.mealDatetime).toLocaleString()}</span>
                    </div>
                    <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 13 }}>
                      {meal.items.map((item, i) => (
                        <li key={i}>
                          {item.foodType} ({item.estimatedQuantity})
                          {item.nutrition && (
                            <span className="text-muted">
                              {" "}
                              — {Math.round(item.nutrition.calories)} kcal
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              {data.meals.total > data.meals.items.length && (
                <p className="note" style={{ fontSize: 12 }}>
                  {t("admin.paginationShowing", {
                    from: data.meals.offset + 1,
                    to: data.meals.offset + data.meals.items.length,
                    total: data.meals.total,
                  })}
                </p>
              )}
            </div>
          )}

          {tab === "logs" && (
            <div style={{ overflowX: "auto" }}>
              {data.auditLogs.items.length === 0 ? (
                <p className="note">{t("admin.noLogs")}</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("admin.logTimestamp")}</th>
                      <th>{t("admin.logAction")}</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.auditLogs.items.map((log) => (
                      <tr key={log.logId}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td>
                          <span className="tag tag-neutral">{log.actionType}</span>
                        </td>
                        <td style={{ fontSize: 12, maxWidth: 360 }}>
                          <JsonBlock value={log.details} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {showDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
            padding: "var(--space-4)",
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 420, width: "100%", padding: "var(--space-5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 var(--space-2)", fontSize: 18 }}>{t("admin.deleteConfirmTitle")}</h3>
            <p style={{ fontSize: 14, margin: "0 0 var(--space-4)", opacity: 0.85 }}>
              {t("admin.deleteConfirmBody")}
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>
                {t("admin.deleteCancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "var(--color-danger, #c44)" }}
                disabled={deleteUser.isPending}
                onClick={() => deleteUser.mutate()}
              >
                {t("admin.deleteConfirmAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
