import "./loadEnv";
import express from "express";
import { startServer } from "@nutriagent/shared";
import { text2sqlRouter } from "./router";

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "text2sql-agent" }));
app.use("/", text2sqlRouter);

const PORT = Number(process.env.PORT || 3005);
startServer(app, PORT, "Text2SQL Agent");
