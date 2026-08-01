# NutriAgent AI — Architecture Graphs

Source of truth for diagrams. LangGraph code: `services/orchestrator/src/graph.ts`.

Live editor (three paths): [Open/Edit](https://l.mermaid.ai/LbFiM4)

## 1. Three LangGraph paths (main graph)

One entry → `classifyIntent` → exactly one of three paths.

```mermaid
flowchart TB
  START([Chat: text and/or photo]) --> GW[API Gateway :3000<br/>POST /api/chat/message]
  GW --> O[Orchestrator :3001<br/>orchestratorGraph.invoke]
  O --> CI{classifyIntent}

  CI -->|image attached| P1
  CI -->|today / calories / history / week| P2
  CI -->|advice / restaurant / general| P3

  subgraph P1["Path A — meal_analysis"]
    direction TB
    A1[RAG /retrieve] --> A2[Vision /analyze]
    A2 -->|no food| A_END1([Reply: no food — no DB save])
    A2 -->|foods found| A3[Nutrition /calculate]
    A3 --> A4[GraphDB /recommend]
    A4 --> A5[saveMeal → Postgres]
    A5 --> A_END2([Reply: meal + macros + tips])
  end

  subgraph P2["Path B — history_query"]
    direction TB
    B1[Text2SQL /query] --> B2[generateSQL]
    B2 --> B3[validateSQL]
    B3 --> B4[executeSQL on Postgres]
    B4 --> B5[formatAnswer]
    B5 --> B_END([Reply: history answer])
  end

  subgraph P3["Path C — advice / restaurant / general_chat"]
    direction TB
    C1[RAG /retrieve] --> C2[GraphDB /recommend]
    C2 --> C3[Nutrition /advise]
    C3 --> C_END([Reply: advice + sources])
  end
```

| Path | Intent | Trigger | Agents in order |
|---|---|---|---|
| **A** | `meal_analysis` | Image attached | RAG → Vision → Nutrition `/calculate` → GraphDB → saveMeal |
| **B** | `history_query` | “calories today”, “מה אכלתי”, week, chart… | Text2SQL only |
| **C** | `nutrition_advice` / `restaurant_recommendation` / `general_chat` | Keywords / default | RAG → GraphDB → Nutrition `/advise` |

## 2. LangGraph nodes (matches `graph.ts`)

```mermaid
flowchart TD
  START([START]) --> CI[classifyIntent]

  CI -->|history_query| T2S[text2sql]
  T2S --> END_B([END])

  CI -->|meal_analysis| RAG_M[ragRetrieve]
  CI -->|advice / restaurant / general| RAG_A[ragRetrieve]

  RAG_M --> VIS[visionAnalyze]
  VIS -->|response already set — no food| END_A0([END])
  VIS -->|continue| NUT[nutritionCalculate]
  NUT --> GDB_M[graphdbMeal]
  GDB_M --> SAVE[saveMeal]
  SAVE --> END_A([END])

  RAG_A --> GDB_A[graphdbAdvice]
  GDB_A --> ADV[nutritionAdvise]
  ADV --> END_C([END])
```

## 3. System map with path colors

```mermaid
flowchart TB
  subgraph Clients["Clients"]
    M["Mobile :8081"]
    U["User Portal :3008"]
    A["Admin Portal :3007"]
  end

  GW["API Gateway :3000"]
  CI["LangGraph classifyIntent :3001"]

  M --> GW
  U --> GW
  A --> GW
  GW -->|POST /process| CI

  CI -.->|Path A meal| V
  CI -.->|Path B history| T
  CI -.->|Path C advice| R2

  subgraph PathA["Path A — meal"]
    R1["RAG :3004 /retrieve"] --> V["Vision :3002 /analyze"]
    V --> N1["Nutrition :3003 /calculate"]
    N1 --> G1["GraphDB :3006 /recommend"]
    G1 --> DB1[("saveMeal Postgres")]
  end

  subgraph PathB["Path B — history"]
    T["Text2SQL :3005 /query"] --> DB2[("SELECT meals")]
  end

  subgraph PathC["Path C — advice"]
    R2["RAG :3004 /retrieve"] --> G2["GraphDB :3006 /recommend"]
    G2 --> N2["Nutrition :3003 /advise"]
  end
```

## 4. Sequence per path

### Path A — meal

```mermaid
sequenceDiagram
  participant UI
  participant GW as Gateway
  participant LG as LangGraph
  participant R as RAG
  participant V as Vision
  participant N as Nutrition
  participant G as GraphDB
  participant DB as Postgres

  UI->>GW: chat + image
  GW->>LG: /process
  LG->>R: /retrieve
  R-->>LG: context
  LG->>V: /analyze
  V-->>LG: foods
  alt no food
    LG-->>UI: no-food reply
  else foods found
    LG->>N: /calculate
    N-->>LG: macros
    LG->>G: /recommend
    G-->>LG: tips
    LG->>DB: saveMeal
    LG-->>UI: meal reply
  end
```

### Path B — history

```mermaid
sequenceDiagram
  participant UI
  participant GW as Gateway
  participant LG as LangGraph
  participant T as Text2SQL
  participant DB as Postgres

  UI->>GW: "how many calories today?"
  GW->>LG: /process
  LG->>T: /query
  T->>T: generateSQL → validateSQL
  T->>DB: execute SELECT
  DB-->>T: rows
  T->>T: formatAnswer
  T-->>LG: answer
  LG-->>UI: history reply
```

### Path C — advice

```mermaid
sequenceDiagram
  participant UI
  participant GW as Gateway
  participant LG as LangGraph
  participant R as RAG
  participant G as GraphDB
  participant N as Nutrition

  UI->>GW: "what should I eat?"
  GW->>LG: /process
  LG->>R: /retrieve
  R-->>LG: KB snippets
  LG->>G: /recommend
  G-->>LG: clinical tips
  LG->>N: /advise
  N-->>LG: reply
  LG-->>UI: advice + sources
```

## 5. LangGraph vs GraphDB

```mermaid
flowchart LR
  subgraph LangGraph["LangGraph = which path to run"]
    CI[classifyIntent] --> PA[Path A meal]
    CI --> PB[Path B history]
    CI --> PC[Path C advice]
  end

  subgraph GraphDB["GraphDB agent = clinical tips inside A and C"]
    D[diabetes]
    P[peanut allergy]
    H[hypertension]
  end

  PA -->|"POST /recommend"| GraphDB
  PC -->|"POST /recommend"| GraphDB
```
