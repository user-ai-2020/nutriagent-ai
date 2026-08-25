"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

interface AiStatus {
  mode: "mock" | "live";
  hasApiKey: boolean;
  apiKeySource: "env" | "database" | "none";
}

interface OpenRouterKeyBalance {
  label: string;
  limit: number | null;
  limitRemaining: number | null;
  usage: number;
  usageDaily: number;
  usageMonthly: number;
  expiresAt: string | null;
  isFreeTier: boolean;
}

interface LlmResponse {
  settings: {
    chatModel: string;
    visionModel1: string;
    visionModel2: string;
    routerModel: string;
    ragModel: string;
    text2sqlModel: string;
    graphdbModel: string;
    openRouterApiKeyMasked: string;
    hasApiKey: boolean;
  };
  aiStatus: AiStatus;
  catalog: {
    chat: ModelOption[];
    vision: ModelOption[];
    router: ModelOption[];
    rag: ModelOption[];
    text2sql: ModelOption[];
    graphdb: ModelOption[];
  };
}

interface BalanceResponse {
  configured: boolean;
  aiStatus?: AiStatus;
  balance?: OpenRouterKeyBalance;
  error?: string;
}

type FormState = {
  openRouterApiKey: string;
  chatModel: string;
  visionModel1: string;
  visionModel2: string;
  routerModel: string;
  ragModel: string;
  text2sqlModel: string;
  graphdbModel: string;
};

function parseOpenRouterKeyFromText(text: string): string | null {
  const envMatch = text.match(/^\s*OPENROUTER_API_KEY\s*=\s*(\S+)/m);
  if (envMatch?.[1]) return envMatch[1].replace(/^["']|["']$/g, "");
  const skMatch = text.match(/(sk-or-v1-[A-Za-z0-9_-]+)/);
  return skMatch?.[1] ?? null;
}

function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function ModelSelect({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: ModelOption[];
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {hint && (
        <p className="note" style={{ fontSize: 11.5, margin: "0 0 5px" }}>
          {hint}
        </p>
      )}
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            [{o.provider}] {o.label}
          </option>
        ))}
        {!options.some((o) => o.id === value) && value ? <option value={value}>{value} (custom)</option> : null}
      </select>
    </div>
  );
}

export default function LlmPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [message, setMessage] = useState("");
  const [keyMessage, setKeyMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-llm"],
    queryFn: () => api<LlmResponse>("/api/admin/llm"),
  });

  const {
    data: balanceData,
    isFetching: balanceLoading,
    refetch: refetchBalance,
  } = useQuery({
    queryKey: ["admin-openrouter-balance"],
    queryFn: () => api<BalanceResponse>("/api/admin/llm/openrouter-balance"),
    enabled: Boolean(data?.aiStatus?.hasApiKey),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      openRouterApiKey: "",
      chatModel: data.settings.chatModel,
      visionModel1: data.settings.visionModel1,
      visionModel2: data.settings.visionModel2,
      routerModel: data.settings.routerModel,
      ragModel: data.settings.ragModel,
      text2sqlModel: data.settings.text2sqlModel,
      graphdbModel: data.settings.graphdbModel,
    });
  }, [data]);

  const saveModels = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<LlmResponse>("/api/admin/llm", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-llm"] });
      setMessage("Model routing saved");
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const saveKey = useMutation({
    mutationFn: (openRouterApiKey: string | null) =>
      api<LlmResponse>("/api/admin/llm/api-key", {
        method: "PUT",
        body: JSON.stringify({ openRouterApiKey }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-llm"] });
      qc.invalidateQueries({ queryKey: ["admin-openrouter-balance"] });
      refetchBalance();
      setKeyMessage("API key saved — agents pick it up within ~1 minute (unless overridden by server `.env`)");
      setForm((f) => (f ? { ...f, openRouterApiKey: "" } : f));
    },
    onError: (err: Error) => setKeyMessage(err.message),
  });

  function onSaveModels(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setMessage("");
    saveModels.mutate({
      chatModel: form.chatModel,
      visionModel1: form.visionModel1,
      visionModel2: form.visionModel2,
      routerModel: form.routerModel,
      ragModel: form.ragModel,
      text2sqlModel: form.text2sqlModel,
      graphdbModel: form.graphdbModel,
    });
  }

  function onSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setKeyMessage("");
    const trimmed = form.openRouterApiKey.trim();
    if (!trimmed) {
      setKeyMessage("Paste a key or import from a file first");
      return;
    }
    saveKey.mutate(trimmed);
  }

  function onClearKey() {
    if (!window.confirm("Remove the Admin-stored OpenRouter key? (Server `.env` key still wins if set.)")) return;
    setKeyMessage("");
    saveKey.mutate(null);
  }

  async function onKeyFileSelected(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseOpenRouterKeyFromText(text);
      if (!parsed) {
        setKeyMessage("No OpenRouter key found in that file");
        return;
      }
      setForm((f) => (f ? { ...f, openRouterApiKey: parsed } : f));
      setKeyMessage(`Loaded key from ${file.name} — click Save API key to apply`);
    } catch {
      setKeyMessage("Could not read that file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const aiStatus = data?.aiStatus;
  const balance = balanceData?.balance;

  return (
    <AdminShell>
      <h2 style={{ fontSize: 22, margin: "0 0 2px" }}>LLM configuration</h2>
      <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 var(--space-4)" }}>
        OpenRouter key and model routing for the Chat, Vision, Router, RAG, Text2SQL and GraphDB agents.
      </p>

      {aiStatus ? (
        <div
          className="card elev-sm"
          style={{ maxWidth: 620, marginBottom: "var(--space-4)", padding: "var(--space-3) var(--space-4)" }}
          data-testid="admin-ai-mode"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>AI mode</span>
            <span
              className={`tag ${aiStatus.mode === "live" ? "tag-accent" : "tag-outline"}`}
              style={
                aiStatus.mode === "mock"
                  ? { borderColor: "#b42318", color: "#b42318" }
                  : undefined
              }
            >
              {aiStatus.mode === "live" ? "Live OpenRouter" : "Mock (sample data)"}
            </span>
          </div>
          <p className="note" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
            {aiStatus.mode === "live"
              ? "Agents call OpenRouter. A key in the server `.env` file overrides anything saved here."
              : "No key configured — meal scans return sample foods (chicken, broccoli, rice)."}
          </p>
          {aiStatus.mode === "live" ? (
            <p className="note" style={{ margin: "6px 0 0", fontSize: 11.5 }}>
              Active key source: {aiStatus.apiKeySource === "env" ? "server `.env`" : "Admin database"}
            </p>
          ) : null}
        </div>
      ) : null}

      {isLoading || !form || !data ? (
        <p className="note">Loading configuration…</p>
      ) : (
        <>
          <form
            onSubmit={onSaveKey}
            className="card elev-sm"
            style={{ maxWidth: 620, marginBottom: "var(--space-4)", padding: "var(--space-4)" }}
          >
            <div className="card-kicker">OpenRouter API key</div>
            <p className="note" style={{ fontSize: 12.5, margin: "0 0 var(--space-3)", lineHeight: 1.45 }}>
              Paste a key from{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                openrouter.ai/keys
              </a>
              , or import a `.env` / text file. Stored encrypted-at-rest in Postgres — never shown again in full.
            </p>

            <div className="field">
              <label htmlFor="llm-key">API key</label>
              <p className="note" style={{ fontSize: 11.5, margin: "0 0 5px" }}>
                Current:{" "}
                {data.settings.hasApiKey ? (
                  <span className="tag tag-accent">{data.settings.openRouterApiKeyMasked}</span>
                ) : (
                  <span className="tag tag-outline">not set in Admin</span>
                )}
              </p>
              <input
                className="input"
                id="llm-key"
                type="password"
                autoComplete="off"
                placeholder="sk-or-v1-…"
                value={form.openRouterApiKey}
                onChange={(e) => setForm({ ...form, openRouterApiKey: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <button type="submit" className="btn btn-primary" disabled={saveKey.isPending}>
                {saveKey.isPending ? "Saving…" : "Save API key"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                Import from file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".env,.txt,text/plain"
                hidden
                onChange={(e) => onKeyFileSelected(e.target.files?.[0])}
              />
              {data.settings.hasApiKey ? (
                <button type="button" className="btn btn-secondary" onClick={onClearKey} disabled={saveKey.isPending}>
                  Clear Admin key
                </button>
              ) : null}
            </div>
            {keyMessage ? <p className="note" style={{ margin: 0 }}>{keyMessage}</p> : null}

            {aiStatus?.apiKeySource === "env" ? (
              <p className="note" style={{ margin: "var(--space-3) 0 0", fontSize: 11.5, color: "#b45309" }}>
                Server `.env` currently overrides Admin keys. Saving here updates the database for when `.env` is
                cleared; live agents still use the env key until you remove it and recreate containers.
              </p>
            ) : null}
          </form>

          {aiStatus?.hasApiKey ? (
            <div
              className="card elev-sm"
              style={{ maxWidth: 620, marginBottom: "var(--space-4)", padding: "var(--space-4)" }}
              data-testid="admin-openrouter-balance"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div className="card-kicker" style={{ margin: 0 }}>
                  OpenRouter balance
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "6px 12px", fontSize: 12 }}
                  onClick={() => refetchBalance()}
                  disabled={balanceLoading}
                >
                  {balanceLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {balanceData?.error ? (
                <p className="note" style={{ margin: "var(--space-2) 0 0", color: "#b42318" }}>
                  {balanceData.error}
                </p>
              ) : balance ? (
                <div style={{ marginTop: "var(--space-3)", display: "grid", gap: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Remaining</span>
                    <strong style={{ fontSize: 18, color: "var(--color-accent-1-700, #2D6A4F)" }}>
                      {formatUsd(balance.limitRemaining)}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Credit limit</span>
                    <span>{formatUsd(balance.limit)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Total used</span>
                    <span>{formatUsd(balance.usage)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Used today</span>
                    <span>{formatUsd(balance.usageDaily)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Used this month</span>
                    <span>{formatUsd(balance.usageMonthly)}</span>
                  </div>
                  {balance.expiresAt ? (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ opacity: 0.7 }}>Key expires</span>
                      <span>{new Date(balance.expiresAt).toLocaleDateString()}</span>
                    </div>
                  ) : null}
                  {balance.label ? (
                    <p className="note" style={{ margin: "4px 0 0", fontSize: 11.5 }}>
                      OpenRouter label: {balance.label}
                    </p>
                  ) : null}
                </div>
              ) : balanceLoading ? (
                <p className="note" style={{ margin: "var(--space-2) 0 0" }}>
                  Loading balance…
                </p>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={onSaveModels} className="card elev-sm" style={{ maxWidth: 620, padding: "var(--space-4)" }}>
            <div className="card-kicker">Model routing</div>

            <ModelSelect
              label="Chat / conversation model"
              hint="Used by the Nutrition Agent for advice replies"
              value={form.chatModel}
              options={data.catalog.chat}
              onChange={(v) => setForm({ ...form, chatModel: v })}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              <ModelSelect
                label="Vision 1"
                hint="Primary vision model"
                value={form.visionModel1}
                options={data.catalog.vision}
                onChange={(v) => setForm({ ...form, visionModel1: v })}
              />
              <ModelSelect
                label="Vision 2"
                hint="Fallback vision model"
                value={form.visionModel2}
                options={data.catalog.vision}
                onChange={(v) => setForm({ ...form, visionModel2: v })}
              />
            </div>

            <ModelSelect
              label="Router model"
              hint="Cheap GPT / Gemini models for intent routing"
              value={form.routerModel}
              options={data.catalog.router}
              onChange={(v) => setForm({ ...form, routerModel: v })}
            />
            <ModelSelect
              label="RAG model"
              value={form.ragModel}
              options={data.catalog.rag}
              onChange={(v) => setForm({ ...form, ragModel: v })}
            />
            <ModelSelect
              label="Text2SQL model"
              value={form.text2sqlModel}
              options={data.catalog.text2sql}
              onChange={(v) => setForm({ ...form, text2sqlModel: v })}
            />
            <ModelSelect
              label="GraphDB model"
              value={form.graphdbModel}
              options={data.catalog.graphdb}
              onChange={(v) => setForm({ ...form, graphdbModel: v })}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <button type="submit" className="btn btn-primary" disabled={saveModels.isPending}>
                {saveModels.isPending ? "Saving…" : "Save model routing"}
              </button>
              {message ? <span className="note">{message}</span> : null}
            </div>
          </form>
        </>
      )}
    </AdminShell>
  );
}
