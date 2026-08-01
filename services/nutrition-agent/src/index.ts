import "./loadEnv";
import express from "express";
import { nutritionRouter } from "./router";

const app = express();
app.use(express.json({ limit: "15mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "nutrition-agent" }));
app.use("/", nutritionRouter);

const PORT = Number(process.env.PORT || 3003);
app.listen(PORT, () => console.log(`Nutrition Agent on http://localhost:${PORT}`));
