import "./loadEnv";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { mealsRouter } from "./routes/meals";
import { chatRouter } from "./routes/chat";
import { dashboardRouter } from "./routes/dashboard";
import { adminRouter } from "./routes/admin";
import { usersRouter } from "./routes/users";
import { activityRouter } from "./routes/activity";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = Number(process.env.API_PORT || 3000);

const uploadsDir = path.join(process.cwd(), "uploads");
const mealImagesDir =
  process.env.MEAL_IMAGE_STORAGE_PATH || path.join(process.cwd(), "storage", "meal-images");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(mealImagesDir)) {
  fs.mkdirSync(mealImagesDir, { recursive: true });
}

app.use(
  cors({
    origin: (
      process.env.CORS_ORIGIN || "http://localhost:3007,http://localhost:3008,http://localhost:8081"
    ).split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "15mb" }));
app.use("/uploads", express.static(uploadsDir));
app.use("/meal-images", express.static(mealImagesDir));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NutriAgent AI</title>
  <style>
    :root { --green:#2D6A4F; --light:#95D5B2; --bg:#f4f7f5; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui,Segoe UI,Arial,sans-serif; background:linear-gradient(160deg,#1B4332,#2D6A4F 45%,#40916C); min-height:100vh; color:#1b4332; }
    .wrap { max-width:720px; margin:0 auto; padding:48px 20px; }
    .card { background:#fff; border-radius:20px; padding:32px; box-shadow:0 20px 50px rgba(0,0,0,.2); }
    h1 { margin:0 0 8px; font-size:2rem; color:var(--green); }
    p { color:#555; line-height:1.5; }
    .links { display:grid; gap:12px; margin-top:24px; }
    a.btn { display:block; text-decoration:none; text-align:center; padding:16px 18px; border-radius:12px; font-weight:700; }
    a.primary { background:var(--green); color:#fff; }
    a.secondary { background:#e8f5ee; color:var(--green); }
    .creds { margin-top:24px; background:#f8faf9; border:1px solid #dce8e1; border-radius:12px; padding:16px; font-size:.95rem; }
    code { background:#eef3f0; padding:2px 6px; border-radius:6px; }
    .api { margin-top:16px; font-size:.85rem; color:#777; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>🥗 NutriAgent AI</h1>
      <p>פורט <code>3000</code> הוא שרת ה־API. לבדיקה והתחברות השתמשו באחד מהממשקים:</p>
      <div class="links">
        <a class="btn primary" href="http://localhost:3008">כניסה לאפליקציית משתמש</a>
        <a class="btn secondary" href="http://localhost:3007">כניסה ל־Admin Portal</a>
      </div>
      <div class="creds">
        <strong>חשבונות Demo</strong><br/>
        User: <code>user@nutriagent.ai</code> / <code>user123</code><br/>
        Admin: <code>admin@nutriagent.ai</code> / <code>admin123</code>
      </div>
      <p class="api">API health: <a href="/health">/health</a> · REST תחת <code>/api/*</code></p>
    </div>
  </div>
</body>
</html>`);
});

app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/users", usersRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/admin", adminRouter);
app.use("/api/activity", activityRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});
