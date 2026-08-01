import express from "express";

export function createAgentApp(name: string, port: number, router: express.Router) {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok", service: name }));
  app.use("/", router);
  app.listen(port, () => console.log(`${name} running on http://localhost:${port}`));
  return app;
}

export async function callService<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
