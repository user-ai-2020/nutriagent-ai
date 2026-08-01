import "./loadEnv";
import express from "express";
import { text2sqlRouter } from "./router";

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "text2sql-agent" }));
app.use("/", text2sqlRouter);

const PORT = Number(process.env.PORT || 3005);
app.listen(PORT, () => console.log(`Text2SQL Agent on http://localhost:${PORT}`));
