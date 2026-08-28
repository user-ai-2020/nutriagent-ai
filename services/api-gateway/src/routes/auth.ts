import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@nutriagent/db";
import { signToken, AUDIT_ACTIONS } from "@nutriagent/shared";
import { writeAuditLog } from "../lib/audit";
import { authMiddleware, AuthRequest } from "../middleware/auth";

export const authRouter = Router();

/**
 * Credential endpoints need a much tighter budget than the global 300-per-15min
 * limiter, which allowed 300 password guesses per IP per window. Counts only
 * failed attempts so a legitimate user who logs in repeatedly is not locked out.
 */
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts. Please try again later." },
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/register", credentialsLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const userRole = await prisma.role.findUnique({ where: { roleName: "User" } });
    if (!userRole) {
      res.status(500).json({ error: "Default role not configured" });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        roleId: userRole.roleId,
        profile: { create: {} },
      },
      include: { role: true },
    });

    await writeAuditLog({
      userId: user.userId,
      actionType: AUDIT_ACTIONS.REGISTER,
      sourceIp: req.ip,
    });

    const token = signToken({
      userId: user.userId,
      email: user.email,
      role: user.role.roleName as "User" | "Admin",
    });

    res.status(201).json({
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role.roleName,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", credentialsLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { role: true },
    });

    if (!user || user.accountStatus !== "active") {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    await writeAuditLog({
      userId: user.userId,
      actionType: AUDIT_ACTIONS.LOGIN,
      sourceIp: req.ip,
    });

    const token = signToken({
      userId: user.userId,
      email: user.email,
      role: user.role.roleName as "User" | "Admin",
    });

    res.json({
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role.roleName,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user!.userId },
      include: { role: true, profile: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role.roleName,
      profile: user.profile,
    });
  } catch (err) {
    next(err);
  }
});
