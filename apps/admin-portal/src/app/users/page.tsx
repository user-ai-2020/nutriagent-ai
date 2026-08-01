"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

interface UserRow {
  userId: number;
  name: string;
  email: string;
  role: string;
  accountStatus: string;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 20;

export default function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", offset],
    queryFn: () => api<UsersResponse>(`/api/admin/users?limit=${PAGE_SIZE}&offset=${offset}`),
  });

  const updateUser = useMutation({
    mutationFn: ({ userId, ...body }: { userId: number; role?: string; accountStatus?: string }) =>
      api(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <AdminShell>
      <h2 style={{ fontSize: 22, margin: "0 0 2px" }}>{t("admin.userManagement")}</h2>
      <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 var(--space-4)" }}>
        {t("admin.userManagementHint")}
      </p>

      {isLoading ? (
        <p className="note">{t("admin.loadingUsers")}</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("admin.tableName")}</th>
                  <th>{t("admin.tableEmail")}</th>
                  <th>{t("admin.tableRole")}</th>
                  <th>{t("admin.tableStatus")}</th>
                  <th>{t("admin.tableActions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isAdmin = user.role === "Admin";
                  const isActive = user.accountStatus === "active";
                  return (
                    <tr key={user.userId}>
                      <td>{user.name}</td>
                      <td className="text-muted">{user.email}</td>
                      <td>
                        <span className={isAdmin ? "tag tag-accent-2" : "tag tag-neutral"}>
                          {isAdmin ? t("admin.roleAdmin") : t("admin.roleUser")}
                        </span>
                      </td>
                      <td>
                        <span className={isActive ? "tag tag-accent" : "tag tag-outline"}>
                          {user.accountStatus}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link
                          href={`/users/${user.userId}`}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, paddingInline: 6 }}
                        >
                          {t("admin.viewDetails")}
                        </Link>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 12, paddingInline: 6 }}
                          onClick={() =>
                            updateUser.mutate({ userId: user.userId, role: isAdmin ? "User" : "Admin" })
                          }
                        >
                          {isAdmin ? t("admin.makeUser") : t("admin.makeAdmin")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 12, paddingInline: 6 }}
                          onClick={() =>
                            updateUser.mutate({
                              userId: user.userId,
                              accountStatus: isActive ? "suspended" : "active",
                            })
                          }
                        >
                          {isActive ? t("admin.suspend") : t("admin.reactivate")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "var(--space-4)",
                fontSize: 13,
              }}
            >
              <span className="text-muted">
                {t("admin.paginationShowing", { from, to, total })}
              </span>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  {t("admin.paginationPrev")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  {t("admin.paginationNext")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
