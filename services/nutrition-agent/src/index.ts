import "./loadEnv";
import express from "express";
import { startServer } from "@nutriagent/shared";
import { nutritionRouter } from "./router";

const app = express();
app.use(express.json({ limit: "15mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "nutrition-agent" }));
app.use("/", nutritionRouter);

const PORT = Number(process.env.PORT || 3003);
startServer(app, PORT, "Nutrition Agent");
