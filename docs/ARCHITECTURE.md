## What NutriAgent is

Three clients (mobile, user portal, admin portal) talk only to the **API Gateway**. The gateway calls the **Orchestrator**, which runs a **LangGraph** state machine. That graph decides which specialist agents to call (Vision, Nutrition, RAG, Text2SQL, GraphDB) and returns one reply.

---

## 1. System overview

```mermaid
flowchart TB
  subgraph Clients
    M[Mobile Expo :8081]
    U[User Portal :3008]
    A[Admin Portal :3007]
  end

  GW[API Gateway :3000<br/>JWT + REST]

  subgraph Orch["Orchestrator :3001"]
    LG[LangGraph StateGraph<br/>services/orchestrator/src/graph.ts]
  end

  V[Vision :3002]
  N[Nutrition :3003]
  R[RAG :3004]
  T[Text2SQL :3005]
  G[GraphDB :3006<br/>clinical PoC]

  DB[(Postgres + pgVector)]
  Redis[(Redis)]

  M --> GW
  U --> GW
  A --> GW
  GW --> LG
  LG --> V
  LG --> N
  LG --> R
  LG --> T
  LG --> G
  GW --> DB
  LG --> DB
  T --> DB
  R --> DB
  GW --> Redis
```

| Layer | Role |
|---|---|
| **Clients** | UI only — chat, meals, settings, admin |
| **API Gateway** | Auth, `/api/chat`, meals, dashboard; forwards AI work to orchestrator |
| **Orchestrator + LangGraph** | Intent + workflow; does not “think” about food itself |
| **Agents** | One job each over HTTP |
| **Postgres** | Users, meals, embeddings (pgVector) |
| **Redis** | Supporting infra (e.g. audit/diagnostics paths) |

---

## 2. Chat / meal request path

```mermaid
sequenceDiagram
  participant UI as Portal / Mobile
  participant GW as API Gateway
  participant O as Orchestrator
  participant LG as LangGraph
  participant Agents as Specialist agents

  UI->>GW: POST /api/chat/message<br/>(text and/or image)
  GW->>O: POST /process
  O->>LG: orchestratorGraph.invoke(request)
  LG->>LG: classifyIntent
  LG->>Agents: HTTP calls by path
  Agents-->>LG: results
  LG-->>O: response state
  O-->>GW: OrchestratorResponse
  GW-->>UI: reply + sources + agentPath
```

- **Meal scan** = same chat endpoint with an image (`FormData`).
- Code: gateway `routes/chat.ts` → `callOrchestrator` → orchestrator `index.ts` → `graph.ts`.

---

## 3. LangGraph workflow (the brain)

LangGraph is **only** in the orchestrator:

- Package: `@langchain/langgraph`
- Graph: `services/orchestrator/src/graph.ts`
- Start: `orchestratorGraph.invoke({ request })` in `index.ts`

```mermaid
flowchart TD
  START([START]) --> CI[classifyIntent]

  CI -->|history_query| T2S[text2sql]
  T2S --> END1([END])

  CI -->|meal_analysis or advice/chat| RAG[ragRetrieve]

  RAG -->|meal_analysis| VIS[visionAnalyze]
  VIS -->|no food / early reply| END2([END])
  VIS -->|foods found| NUT[nutritionCalculate]
  NUT --> GDB1[graphdbMeal]
  GDB1 --> SAVE[saveMeal]
  SAVE --> END3([END])

  RAG -->|advice / restaurant / general| GDB2[graphdbAdvice]
  GDB2 --> ADV[nutritionAdvise]
  ADV --> END4([END])
```

### Intent → meaning

| Intent | How it’s chosen | What happens |
|---|---|---|
| `meal_analysis` | Image attached | Detect food → macros → clinical tips → save meal |
| `history_query` | “today”, calories, “מה אכלתי”, week… | Text2SQL over **your** meals |
| `nutrition_advice` / `restaurant_recommendation` / `general_chat` | Keywords / default | RAG context + GraphDB + Nutrition advise |

---

## 4. Each agent (what + where)

```mermaid
flowchart LR
  subgraph LangGraph_nodes
    CI[classifyIntent]
    RAG[ragRetrieve]
    VIS[visionAnalyze]
    NUT[nutritionCalculate]
    GDB[graphdb*]
    T2S[text2sql]
    ADV[nutritionAdvise]
    SAVE[saveMeal]
  end

  RAG -.->|POST /retrieve| RA[rag-agent]
  VIS -.->|POST /analyze| VA[vision-agent]
  NUT -.->|POST /calculate| NA[nutrition-agent]
  ADV -.->|POST /advise| NA
  GDB -.->|POST /recommend| GA[graphdb-agent]
  T2S -.->|POST /query| TA[text2sql-agent]
  SAVE -.->|Prisma| PG[(Postgres)]
```

| Agent | Port | Folder | Does |
|---|---|---|---|
| **Vision** | 3002 | `services/vision-agent` | Multi-model food detection + rerank |
| **Nutrition** | 3003 | `services/nutrition-agent` | Macros (`/calculate`) and chat advice (`/advise`) |
| **RAG** | 3004 | `services/rag-agent` | Hybrid KB retrieve (pgVector + keywords) |
| **Text2SQL** | 3005 | `services/text2sql-agent` | NL → safe SELECT → natural answer |
| **GraphDB** | 3006 | `services/graphdb-agent` | Clinical recommendations from profile |

---

## 5. LangGraph vs GraphDB (easy to confuse)

```mermaid
flowchart TB
  subgraph LangGraph["LangGraph = workflow engine"]
    direction LR
    N1[Node] --> N2[Node] --> N3[Node]
  end

  subgraph GraphDB["GraphDB agent = clinical knowledge PoC"]
    direction TB
    D[diabetes] --> S1[substitutes / avoid]
    P[peanut allergy] --> S2[substitutes / avoid]
    H[hypertension] --> S3[substitutes / avoid]
  end

  LangGraph -->|"HTTP POST /recommend"| GraphDB
```

- **LangGraph** = how steps are ordered (router). Not a database.
- **GraphDB** = small in-memory map `CLINICAL_GRAPH` in `services/graphdb-agent/src/router.ts`. Not Neo4j. Matches allergies/healthRestrictions and returns prefer/avoid tips.

---

## 6. Text2SQL path (history questions)

```mermaid
flowchart LR
  Q[User: how many calories today?] --> CI[classifyIntent<br/>history_query]
  CI --> GEN[generateSQL<br/>templates or LLM]
  GEN --> VAL[validateSQL<br/>SELECT only + user_id]
  VAL --> EXE[execute on Postgres]
  EXE --> ANS[formatAnswer]
  ANS --> UI[Reply in chat]
```

---

## 7. Data the user sees

```mermaid
flowchart TB
  Photo[Meal photo] --> MealPath[LangGraph meal path]
  MealPath --> Meals[(meals + food items)]
  Meals --> Dash[Dashboard macros]
  Meals --> Hist[History via Text2SQL]
  Profile[Allergies / healthRestrictions] --> GDB[GraphDB tips]
  GDB --> Reply[Chat / meal reply]
```

---

## One-sentence map

**UI → Gateway → LangGraph orchestrator → (Vision / Nutrition / RAG / Text2SQL / GraphDB) → Postgres**, with LangGraph choosing the path and GraphDB only answering clinical prefer/avoid tips.
