import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import express from "express";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import { prisma } from "@nutriagent/db";
import { AUDIT_ACTIONS, signToken } from "@nutriagent/shared";
import { errorHandler } from "../middleware/errorHandler";
import { adminRouter } from "./admin";

config({ path: resolve(__dirname, "../../../../.env") });

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);
  return app;
}

async function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe("Admin user management", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let adminId = 0;
  let userId = 0;
  let adminToken = "";
  let userToken = "";
  let disposableUserId = 0;

  after(async () => {
    if (disposableUserId) {
      await prisma.user.delete({ where: { userId: disposableUserId } }).catch(() => {});
    }
    if (closeServer) await closeServer();
  });

  it("setup: seed users and test server", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

    const admin = await prisma.user.findUnique({
      where: { email: "admin@nutriagent.ai" },
      include: { role: true },
    });
    const user = await prisma.user.findUnique({
      where: { email: "user@nutriagent.ai" },
      include: { role: true },
    });
    assert.ok(admin && user, "seed users must exist");

    adminId = admin.userId;
    userId = user.userId;
    adminToken = signToken({ userId: adminId, email: admin.email, role: "Admin" });
    userToken = signToken({ userId: userId, email: user.email, role: "User" });

    const adminRole = await prisma.role.findUnique({ where: { roleName: "Admin" } });
    assert.ok(adminRole);
    await prisma.user.update({
      where: { userId: adminId },
      data: { roleId: adminRole.roleId, accountStatus: "active" },
    });

    const userRole = await prisma.role.findUnique({ where: { roleName: "User" } });
    assert.ok(userRole);
    await prisma.user.deleteMany({
      where: { email: { endsWith: "@test.local" } },
    });
    const hash = await bcrypt.hash("testpass", 4);
    const disposable = await prisma.user.create({
      data: {
        name: "Disposable Test User",
        email: `admin-test-${Date.now()}@test.local`,
        passwordHash: hash,
        roleId: userRole.roleId,
      },
    });
    disposableUserId = disposable.userId;

    const { baseUrl: url, close } = await startServer(createTestApp());
    baseUrl = url;
    closeServer = close;
  });

  it("regular user gets 403 on admin endpoints", async () => {
    for (const path of [
      "/api/admin/users",
      `/api/admin/users/${userId}/detail`,
      `/api/admin/users/${disposableUserId}`,
    ]) {
      const method = path.endsWith(String(disposableUserId)) && !path.includes("detail") ? "DELETE" : "GET";
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${userToken}` },
      });
      assert.equal(res.status, 403, `${method} ${path}`);
    }

    const patchRes = await fetch(`${baseUrl}/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "Admin" }),
    });
    assert.equal(patchRes.status, 403);
  });

  it("GET /users returns paginated list", async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?limit=1&offset=0`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      users: unknown[];
      total: number;
      limit: number;
      offset: number;
    };
    assert.equal(data.users.length, 1);
    assert.ok(data.total >= 2);
    assert.equal(data.limit, 1);
    assert.equal(data.offset, 0);
  });

  it("GET /users/:id/detail returns profile, meals, and logs in one response", async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${userId}/detail`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      user: { userId: number };
      profile: unknown;
      meals: { items: unknown[]; total: number };
      auditLogs: { items: unknown[]; total: number };
    };
    assert.equal(data.user.userId, userId);
    assert.ok("meals" in data && "auditLogs" in data);
    assert.ok(Array.isArray(data.meals.items));
    assert.ok(Array.isArray(data.auditLogs.items));
  });

  it("PATCH /users/:id/role rejects invalid role values", async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "SuperAdmin" }),
    });
    assert.equal(res.status, 400);
  });

  it("PATCH /users/:id/role updates role and writes audit log", async () => {
    const before = await prisma.user.findUnique({
      where: { userId: disposableUserId },
      include: { role: true },
    });
    assert.equal(before?.role.roleName, "User");

    const res = await fetch(`${baseUrl}/api/admin/users/${disposableUserId}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "Admin" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { role: string };
    assert.equal(body.role, "Admin");

    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: adminId,
        actionType: AUDIT_ACTIONS.ADMIN_USER_ROLE_CHANGE,
      },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(audit);
    assert.equal((audit.details as { targetUserId: number }).targetUserId, disposableUserId);

    const demoteRes = await fetch(`${baseUrl}/api/admin/users/${disposableUserId}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "User" }),
    });
    assert.equal(demoteRes.status, 200);
  });

  it("DELETE removes user, cascades, and writes audit log", async () => {
    const userRole = await prisma.role.findUnique({ where: { roleName: "User" } });
    assert.ok(userRole);
    const hash = await bcrypt.hash("testpass", 4);
    const deleteTarget = await prisma.user.create({
      data: {
        name: "Delete Target",
        email: `admin-delete-${Date.now()}@test.local`,
        passwordHash: hash,
        roleId: userRole.roleId,
      },
    });
    const deleteId = deleteTarget.userId;

    const res = await fetch(`${baseUrl}/api/admin/users/${deleteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200, await res.text());

    const gone = await prisma.user.findUnique({ where: { userId: deleteId } });
    assert.equal(gone, null);

    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: adminId,
        actionType: AUDIT_ACTIONS.ADMIN_USER_DELETE,
        details: { path: ["targetUserId"], equals: deleteId },
      },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(audit);
  });

  it("admin cannot delete themselves", async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${adminId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /own account/i);
  });

  it("cannot demote the last admin", async () => {
    const adminRole = await prisma.role.findUnique({ where: { roleName: "Admin" } });
    assert.ok(adminRole);
    const admins = await prisma.user.findMany({
      where: { roleId: adminRole.roleId, accountStatus: "active" },
      select: { userId: true },
    });
    if (admins.length !== 1) {
      return;
    }

    const soleAdminId = admins[0]!.userId;
    const res = await fetch(`${baseUrl}/api/admin/users/${soleAdminId}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "User" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /last admin/i);
  });
});
