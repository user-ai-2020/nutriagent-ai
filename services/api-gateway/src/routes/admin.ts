import { Router } from "express";
import { z } from "zod";
import { prisma, ensureLlmSettings, maskApiKey } from "@nutriagent/db";
import { AUDIT_ACTIONS, getRecentAuditLogs, LLM_MODEL_CATALOG } from "@nutriagent/shared";
import { authMiddleware, adminMiddleware, AuthRequest } from "../middleware/auth";
import { writeAuditLog } from "../lib/audit";
import { getRedis } from "../lib/redis";
import {
  assertCanDeleteUser,
  assertCanDemoteAdmin,
  mapMeal,
  mapUserProfile,
  mapUserSummary,
  parsePagination,
} from "../lib/adminUsers";

export const adminRouter = Router();
adminRouter.use(authMiddleware, adminMiddleware);

adminRouter.get("/users", async (req, res, next) => {
  try {
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>, {
      limit: 50,
      maxLimit: 200,
    });

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        include: { role: true, profile: true },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.user.count(),
    ]);

    res.json({
      users: users.map(mapUserSummary),
      total,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/users/:userId/detail", async (req: AuthRequest, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    const mealPage = parsePagination(req.query as Record<string, unknown>, {
      limit: 20,
      maxLimit: 100,
    });
    const logPage = parsePagination(
      {
        limit: req.query.logLimit,
        offset: req.query.logOffset,
      } as Record<string, unknown>,
      { limit: 50, maxLimit: 200 }
    );

    const user = await prisma.user.findUnique({
      where: { userId },
      include: { role: true, profile: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [meals, mealTotal, logs, logTotal] = await Promise.all([
      prisma.meal.findMany({
        where: { userId },
        orderBy: { mealDatetime: "desc" },
        skip: mealPage.offset,
        take: mealPage.limit,
        include: { items: { include: { nutritionValues: true } } },
      }),
      prisma.meal.count({ where: { userId } }),
      prisma.auditLog.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        skip: logPage.offset,
        take: logPage.limit,
      }),
      prisma.auditLog.count({ where: { userId } }),
    ]);

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: AUDIT_ACTIONS.ADMIN_VIEW_USER_DETAIL,
      details: { targetUserId: userId },
      sourceIp: req.ip,
    });

    res.json({
      user: mapUserSummary(user),
      profile: mapUserProfile(user.profile),
      meals: {
        items: meals.map(mapMeal),
        total: mealTotal,
        limit: mealPage.limit,
        offset: mealPage.offset,
      },
      auditLogs: {
        items: logs.map((l) => ({
          logId: l.logId,
          actionType: l.actionType,
          details: l.details,
          sourceIp: l.sourceIp,
          timestamp: l.timestamp.toISOString(),
        })),
        total: logTotal,
        limit: logPage.limit,
        offset: logPage.offset,
      },
    });
  } catch (err) {
    next(err);
  }
});

const roleSchema = z.object({
  role: z.enum(["User", "Admin"]),
});

adminRouter.patch("/users/:userId/role", async (req: AuthRequest, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    const body = roleSchema.parse(req.body);

    if (body.role === "User") {
      const guardError = await assertCanDemoteAdmin(userId);
      if (guardError) {
        res.status(403).json({ error: guardError });
        return;
      }
    }

    const role = await prisma.role.findUnique({ where: { roleName: body.role } });
    if (!role) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { userId }, include: { role: true } });
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const user = await prisma.user.update({
      where: { userId },
      data: { roleId: role.roleId },
      include: { role: true },
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: AUDIT_ACTIONS.ADMIN_USER_ROLE_CHANGE,
      details: { targetUserId: userId, previousRole: existing.role.roleName, newRole: body.role },
      sourceIp: req.ip,
    });

    res.json(mapUserSummary(user));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/users/:userId", async (req: AuthRequest, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    const guardError = await assertCanDeleteUser(req.user!.userId, userId);
    if (guardError) {
      const status = guardError === "User not found" ? 404 : 403;
      res.status(status).json({ error: guardError });
      return;
    }

    const target = await prisma.user.findUnique({ where: { userId } });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: AUDIT_ACTIONS.ADMIN_USER_DELETE,
      details: { targetUserId: userId, email: target.email, name: target.name },
      sourceIp: req.ip,
    });

    await prisma.user.delete({ where: { userId } });

    res.json({ ok: true, deletedUserId: userId });
  } catch (err) {
    next(err);
  }
});

const updateUserSchema = z.object({
  role: z.enum(["User", "Admin"]).optional(),
  accountStatus: z.enum(["active", "suspended"]).optional(),
});

adminRouter.patch("/users/:userId", async (req: AuthRequest, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const body = updateUserSchema.parse(req.body);
    const data: { accountStatus?: string; roleId?: number } = {};

    if (body.accountStatus) data.accountStatus = body.accountStatus;
    if (body.role) {
      if (body.role === "User") {
        const guardError = await assertCanDemoteAdmin(userId);
        if (guardError) {
          res.status(403).json({ error: guardError });
          return;
        }
      }

      const role = await prisma.role.findUnique({ where: { roleName: body.role } });
      if (!role) {
        res.status(400).json({ error: "Invalid role" });
        return;
      }
      data.roleId = role.roleId;
    }

    const user = await prisma.user.update({
      where: { userId },
      data,
      include: { role: true },
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: AUDIT_ACTIONS.ADMIN_USER_UPDATE,
      details: { targetUserId: userId, changes: body },
      sourceIp: req.ip,
    });

    res.json(mapUserSummary(user));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/audit-logs", async (req: AuthRequest, res, next) => {
  try {
    const mode = (req.query.mode as string) || "recent";
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const actionType = req.query.actionType as string | undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: AUDIT_ACTIONS.ADMIN_VIEW_LOGS,
      sourceIp: req.ip,
    });

    if (mode === "recent") {
      try {
        const cached = await getRecentAuditLogs(getRedis(), limit);
        if (cached.length > 0) {
          res.json({ source: "redis", logs: cached });
          return;
        }
      } catch {
        // fallback to postgres
      }
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(actionType ? { actionType } : {}),
        ...(from || to
          ? {
              timestamp: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { user: { select: { name: true, email: true } } },
    });

    res.json({
      source: "postgres",
      logs: logs.map((l) => ({
        logId: l.logId,
        userId: l.userId,
        userName: l.user?.name,
        userEmail: l.user?.email,
        actionType: l.actionType,
        details: l.details,
        sourceIp: l.sourceIp,
        timestamp: l.timestamp.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const [userCount, mealCount, chatCount, logCount] = await Promise.all([
      prisma.user.count(),
      prisma.meal.count(),
      prisma.chatHistory.count(),
      prisma.auditLog.count(),
    ]);
    res.json({ userCount, mealCount, chatCount, logCount });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/llm", async (_req, res, next) => {
  try {
    const settings = await ensureLlmSettings();
    res.json({
      settings: {
        ...settings,
        openRouterApiKey: undefined,
        openRouterApiKeyMasked: maskApiKey(settings.openRouterApiKey),
        hasApiKey: Boolean(settings.openRouterApiKey),
      },
      catalog: LLM_MODEL_CATALOG,
    });
  } catch (err) {
    next(err);
  }
});

const llmUpdateSchema = z.object({
  openRouterApiKey: z.string().optional().nullable(),
  chatModel: z.string().min(1).optional(),
  visionModel1: z.string().min(1).optional(),
  visionModel2: z.string().min(1).optional(),
  routerModel: z.string().min(1).optional(),
  ragModel: z.string().min(1).optional(),
  text2sqlModel: z.string().min(1).optional(),
  graphdbModel: z.string().min(1).optional(),
});

adminRouter.put("/llm", async (req: AuthRequest, res, next) => {
  try {
    const body = llmUpdateSchema.parse(req.body);
    await prisma.llmSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        openRouterApiKey: body.openRouterApiKey ?? process.env.OPENROUTER_API_KEY ?? null,
        chatModel: body.chatModel ?? "openai/gpt-4o-mini",
        visionModel1: body.visionModel1 ?? "openai/gpt-4o",
        visionModel2: body.visionModel2 ?? "google/gemini-flash-1.5",
        routerModel: body.routerModel ?? "openai/gpt-4o-mini",
        ragModel: body.ragModel ?? "openai/gpt-4o-mini",
        text2sqlModel: body.text2sqlModel ?? "openai/gpt-4o-mini",
        graphdbModel: body.graphdbModel ?? "openai/gpt-4o-mini",
      },
      update: {
        ...(body.openRouterApiKey !== undefined
          ? { openRouterApiKey: body.openRouterApiKey || null }
          : {}),
        ...(body.chatModel ? { chatModel: body.chatModel } : {}),
        ...(body.visionModel1 ? { visionModel1: body.visionModel1 } : {}),
        ...(body.visionModel2 ? { visionModel2: body.visionModel2 } : {}),
        ...(body.routerModel ? { routerModel: body.routerModel } : {}),
        ...(body.ragModel ? { ragModel: body.ragModel } : {}),
        ...(body.text2sqlModel ? { text2sqlModel: body.text2sqlModel } : {}),
        ...(body.graphdbModel ? { graphdbModel: body.graphdbModel } : {}),
      },
    });

    await writeAuditLog({
      userId: req.user!.userId,
      actionType: "ADMIN_LLM_UPDATE",
      details: {
        updatedFields: Object.keys(body).filter((k) => k !== "openRouterApiKey"),
        apiKeyChanged: body.openRouterApiKey !== undefined,
      },
      sourceIp: req.ip,
    });

    const settings = await ensureLlmSettings();
    res.json({
      settings: {
        ...settings,
        openRouterApiKey: undefined,
        openRouterApiKeyMasked: maskApiKey(settings.openRouterApiKey),
        hasApiKey: Boolean(settings.openRouterApiKey),
      },
      catalog: LLM_MODEL_CATALOG,
    });
  } catch (err) {
    next(err);
  }
});
