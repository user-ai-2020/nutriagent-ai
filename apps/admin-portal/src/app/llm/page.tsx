"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";

interface ModelOption {
  id: string;
  label: string;
  provider: string;
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
  catalog: {
    chat: ModelOption[];
    vision: ModelOption[];
    router: ModelOption[];
    rag: ModelOption[];
    text2sql: ModelOption[];
    graphdb: ModelOption[];
  };
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
  const [form, setForm] = useState<FormState | null>(null);
  const [message, setMessage] = useState("");
  const [clearKey, setClearKey] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-llm"],
    queryFn: () => api<LlmResponse>("/api/admin/llm"),
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

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<LlmResponse>("/api/admin/llm", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-llm"] });
      setMessage("LLM settings saved — agents will use the new models");
      setClearKey(false);
      setForm((f) => (f ? { ...f, openRouterApiKey: "" } : f));
    },
    onError: (err: Error) => setMessage(err.message),
  });

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setMessage("");
    const payload: Record<string, unknown> = {
      chatModel: form.chatModel,
      visionModel1: form.visionModel1,
      visionModel2: form.visionModel2,
      routerModel: form.routerModel,
      ragModel: form.ragModel,
      text2sqlModel: form.text2sqlModel,
      graphdbModel: form.graphdbModel,
    };
    if (clearKey) payload.openRouterApiKey = null;
    else if (form.openRouterApiKey.trim()) payload.openRouterApiKey = form.openRouterApiKey.trim();
    save.mutate(payload);
  }

  return (
    <AdminShell>
      <h2 style={{ fontSize: 22, margin: "0 0 2px" }}>LLM configuration</h2>
      <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 var(--space-4)" }}>
        OpenRouter key and model routing for the Chat, Vision, Router, RAG, Text2SQL and GraphDB agents.
      </p>

      {isLoading || !form || !data ? (
        <p className="note">Loading configuration…</p>
      ) : (
        <form onSubmit={onSave} className="card elev-sm" style={{ maxWidth: 620, padding: "var(--space-4)" }}>
          <div className="card-kicker">Credentials</div>
          <div className="field">
            <label htmlFor="llm-key">OpenRouter API key</label>
            <p className="note" style={{ fontSize: 11.5, margin: "0 0 5px" }}>
              Current:{" "}
              {data.settings.hasApiKey ? (
                <span className="tag tag-accent">{data.settings.openRouterApiKeyMasked}</span>
              ) : (
                <span className="tag tag-outline">not set</span>
              )}
            </p>
            <input
              className="input"
              id="llm-key"
              type="password"
              placeholder="sk-or-v1-… (leave blank to keep current)"
              value={form.openRouterApiKey}
              onChange={(e) => setForm({ ...form, openRouterApiKey: e.target.value })}
              disabled={clearKey}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 8 }}>
              <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
              Clear API key
            </label>
          </div>

          <div className="card-kicker" style={{ marginTop: "var(--space-3)" }}>
            Model routing
          </div>

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
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save LLM settings"}
            </button>
            {message && <span className="note">{message}</span>}
          </div>
        </form>
      )}
    </AdminShell>
  );
}
