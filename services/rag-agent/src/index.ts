import "./loadEnv";
import express from "express";
import { ragRouter } from "./router";

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "rag-agent" }));
app.use("/", ragRouter);

const PORT = Number(process.env.PORT || 3004);
app.listen(PORT, () => console.log(`RAG Agent on http://localhost:${PORT}`));
