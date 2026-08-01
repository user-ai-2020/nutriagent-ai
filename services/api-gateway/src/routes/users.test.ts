import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { prisma } from "@nutriagent/db";
import { signToken } from "@nutriagent/shared";
import { errorHandler } from "../middleware/errorHandler";
import { usersRouter } from "./users";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRouter);
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

describe("PATCH /api/users/me/language", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let userAId = 0;
  let userBId = 0;
  let tokenA = "";
  let tokenB = "";

  after(async () => {
    if (closeServer) await closeServer();
  });

  it("setup: resolves demo users and starts test server", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

    const userA = await prisma.user.findUnique({ where: { email: "user@nutriagent.ai" } });
    const userB = await prisma.user.findUnique({ where: { email: "admin@nutriagent.ai" } });
    assert.ok(userA && userB, "seed users must exist");

    userAId = userA.userId;
    userBId = userB.userId;
    tokenA = signToken({ userId: userAId, email: userA.email, role: "User" });
    tokenB = signToken({ userId: userBId, email: userB.email, role: "Admin" });

    const { baseUrl: url, close } = await startServer(createTestApp());
    baseUrl = url;
    closeServer = close;
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await fetch(`${baseUrl}/api/users/me/language`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredLanguage: "he" }),
    });
    assert.equal(res.status, 401);
  });

  it("returns 400 for invalid preferredLanguage values", async () => {
    for (const bad of ["fr", "english", "", "HE", "en-US"]) {
      const res = await fetch(`${baseUrl}/api/users/me/language`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ preferredLanguage: bad }),
      });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    }
  });

  it("updates language from JWT user only; ignores userId in body (IDOR)", async () => {
    await prisma.userProfile.upsert({
      where: { userId: userBId },
      update: { preferredLanguage: "en" },
      create: { userId: userBId, preferredLanguage: "en" },
    });

    const res = await fetch(`${baseUrl}/api/users/me/language`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preferredLanguage: "he", userId: userBId }),
    });

    assert.equal(res.status, 400, "strict schema rejects unexpected userId field");

    const profileBAfterRejected = await prisma.userProfile.findUnique({
      where: { userId: userBId },
      select: { preferredLanguage: true },
    });
    assert.equal(profileBAfterRejected?.preferredLanguage, "en");

    const resClean = await fetch(`${baseUrl}/api/users/me/language`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preferredLanguage: "he" }),
    });
    assert.equal(resClean.status, 200);
    const data = (await resClean.json()) as { preferredLanguage: string };
    assert.equal(data.preferredLanguage, "he");

    const profileA = await prisma.userProfile.findUnique({
      where: { userId: userAId },
      select: { preferredLanguage: true },
    });
    const profileB = await prisma.userProfile.findUnique({
      where: { userId: userBId },
      select: { preferredLanguage: true },
    });

    assert.equal(profileA?.preferredLanguage, "he");
    assert.equal(profileB?.preferredLanguage, "en", "user B must be unchanged by user A token");

    await prisma.userProfile.update({
      where: { userId: userAId },
      data: { preferredLanguage: null },
    });
  });

  it("user B token updates only user B", async () => {
    const res = await fetch(`${baseUrl}/api/users/me/language`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preferredLanguage: "he" }),
    });
    assert.equal(res.status, 200);

    const profileB = await prisma.userProfile.findUnique({
      where: { userId: userBId },
      select: { preferredLanguage: true },
    });
    assert.equal(profileB?.preferredLanguage, "he");

    await prisma.userProfile.update({
      where: { userId: userBId },
      data: { preferredLanguage: null },
    });
  });
});
