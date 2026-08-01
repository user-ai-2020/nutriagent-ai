import "./loadEnv";
import express from "express";
import { graphdbRouter } from "./router";

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "graphdb-agent" }));
app.use("/", graphdbRouter);

const PORT = Number(process.env.PORT || 3006);
app.listen(PORT, () => console.log(`GraphDB Agent on http://localhost:${PORT}`));
