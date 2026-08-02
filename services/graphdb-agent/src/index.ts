import "./loadEnv";
import express from "express";
import { startServer } from "@nutriagent/shared";
import { graphdbRouter } from "./router";

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "graphdb-agent" }));
app.use("/", graphdbRouter);

const PORT = Number(process.env.PORT || 3006);
startServer(app, PORT, "GraphDB Agent");
