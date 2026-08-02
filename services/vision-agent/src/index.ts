import "./loadEnv";
import express from "express";
import { startServer } from "@nutriagent/shared";
import { visionRouter } from "./router";

const app = express();
app.use(express.json({ limit: "15mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "vision-agent" }));
app.use("/", visionRouter);

const PORT = Number(process.env.PORT || 3002);
startServer(app, PORT, "Vision Agent");
