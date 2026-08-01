# Handoff: NutriAgent AI

> **Location:** `docs/design-handoff/` in the NutriAgent monorepo. Production UI is implemented in `apps/user-portal/`, `apps/admin-portal/`, and `apps/mobile/` using Broadsheet tokens in `broadsheet.css`. See also [`docs/README.md`](../README.md) and the root [`README.md`](../../README.md).

## Overview
NutriAgent AI is a nutrition-tracking mobile/desktop app prototype. A user photographs a meal, a vision agent identifies the foods, and the app returns per-meal nutrition, daily calorie budgeting, history, and per-nutrient trends. There is also an admin portal view. This bundle is the design reference for implementing that product.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype that shows the intended look and behavior. They are **not production code to copy directly**. The `.dc.html` file uses a small custom runtime (`support.js`) that is specific to this prototyping environment and should NOT be shipped.

The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, native, etc.), using its established patterns, component library, and design tokens. If no environment exists yet, choose the most appropriate framework and implement there. Read the HTML for exact structure, copy, and values; rebuild with your own components.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are all specified below and in the HTML. Recreate the UI pixel-perfectly using the codebase's own libraries and patterns. The prototype is built on the **Broadsheet** design system (newsprint aesthetic: Source Serif 4 on a light ground, green primary accent in this app's theming).

## Layout Shell
- **Two responsive layouts** driven by a `viewMode` (`desktop` | `mobile`) and `portal` (`user` | `admin`) flag.
  - **Desktop:** 220px left sidebar nav + main content column. Sidebar has brand wordmark then nav items (Chat, Dashboard, Foods, Analysis, Nutrients, Settings), each a row with icon + label, `padding:9px 12px`, `border-radius:12px`, active item tinted with accent background.
  - **Mobile:** content column + bottom tab bar (same destinations), each tab a centered icon-over-label, `padding:8px 0`.
- Main content scroll area padding: `20px 20px 32px` (space-5 / space-8 on the Broadsheet scale). All top-level screen content is indented `padding-left: 16px` (space-4) so every screen's heading lines up on the same left column as the Chat header.
- App frame is centered; desktop frame height `calc(100vh - 50px)`, mobile `780px`.

## Screens / Views

### 1. Login
- Centered card, `width:min(360px,90vw)`, `padding:16px`, `.card .elev-md`.
- Title "NutriAgent AI" 30px; subtitle "Photograph a meal. Get the nutrition. Ask anything." 14px, opacity .65.
- Fields: Username (placeholder `maya.cohen`), Password. Primary submit button.

### 2. Onboarding (3 steps)
- Centered column `width:min(480px,92vw)`. Step counter "Step N of 3" + a 2px progress bar (accent fill, width = %).
- Step 0 — Daily diet goals: numeric inputs Calorie goal (kcal/day), Protein goal (g/day).
- Step 1 — Restrictions: pill toggles (Gluten-free, Nut allergy, Dairy-free, Low sodium), `padding:8px 16px`, `border-radius:999px`, 1.5px border, selected state filled.
- Step 2 — Diet type selection.

### 3. Chat (default tab)
- Header: h2 "Chat" 22px + subtitle 13px opacity .6 ("Snap a meal or ask a question — NutriAgent reasons over your profile.").
- Message list, each assistant meal reply can include a **flower-node nutrition graphic**: a 300×320 area with a center "Energy" ring and 6 satellite rings (Protein, Carbs, Fat, Sat Fat, Sodium, Fiber) at exact 60° intervals; each ring an SVG progress arc using `pathLength="100"`, label centered directly under each ring.
- Composer at bottom: camera icon button, text input (placeholder "Ask about nutrition, meals, or recommendations…"), send icon button. Row uses `display:flex; gap:8px`.

### 4. Dashboard
- Container `max-width:560px`, left-aligned.
- Greeting "Good afternoon, Maya 👋" 22px serif; subline "You're on track — N kcal left today." in `--color-accent-700`. Avatar circle 42px, accent-100 bg.
- **Calorie budget card:** surface bg, `border-radius:20px`, `--shadow-md`, `padding:20px 16px`. 3-column grid: left column (Exercise/Steps/Water, right-aligned), center 176px donut ring (SVG, accent stroke, "N Left" in center), right column (Breakfast/Lunch/Dinner/Snacks). Footer link "View all meals →".
- Week strip: 7 day cells, each `flex:1`, rounded, active day tinted.
- "My daily advice" horizontal scroll of 180px advice cards (`.card .elev-sm`, kicker + title + body).

### 5. Summary & Foods
- h2 "Summary & Foods" 22px. Segmented control Day/Week/Month + search input (`max-width:220px`, placeholder "Search foods…").
- Meal list rows: 52px rounded thumbnail + name (ellipsis) + type tag (`.tag-neutral`) + date/time + "N kcal" right-aligned. Row hover fills with surface color. Click → Meal Analysis.

### 6. Meal Analysis
- "← Back to Summary" link.
- Grid (`mealAnalysisGridCols`): meal photo slot on left, details on right (stacks on mobile).
- **Photo slot:** `width:100%; max-width:280px; aspect-ratio:4/3`, rounded `radius=12`, placeholder "Meal photo / browse files".
- Details: meal name 20px, "type · date · time" 13px opacity .6. Kicker "Vision Agent · identified items". Each item row: name (with optional "corrected" tag `.tag-accent-2`), quantity, a 70px confidence bar (accent fill, `width = confidence%`) with "N% sure" label, and an edit (pencil) ghost icon button. Editing swaps to input + save/cancel icon buttons.

### 7. Calories & Nutrients
- Container `max-width:640px`, left-aligned. h2 "Calories & Nutrients" 22px.
- Segmented range control, then a grid of nutrient `.card`s (Calories, Carbs, Fat, etc.): label 12px, big value 22px serif with unit, and a small inline SVG sparkline/bar chart (30px tall).

### 8. Settings + Admin portal
- Settings tab and an admin portal (`portal='admin'`) with its own tabs (users, etc.) — see HTML for structure.

## Interactions & Behavior
- Tab switching sets `activeTab` (`chat|dashboard|summary|mealAnalysis|nutrients|settings`); nav items reflect active via color + background.
- Clicking a meal row in Summary sets the selected meal and navigates to Meal Analysis.
- Meal Analysis items are individually editable (inline input with save/cancel).
- Onboarding steps advance via the progress flow.
- Chat composer: Enter sends (keydown handler), camera button simulates a photo log.
- Hover states on nav items, meal rows, buttons; keyboard focus is a 2px accent outline (Broadsheet convention).
- Theme is switchable at runtime.

## State Management
Key state (see the `Component` class in the HTML):
- `stage` (login | onboarding | app), `portal` (user | admin), `viewMode` (desktop | mobile), `theme` (white | light | midnight).
- `activeTab`, `adminTab`.
- Onboarding: `goalCalories`, `goalProtein`, `restrictions{gluten,nuts,dairy,lowSodium}`, `dietType`, `obStep`.
- `summaryRange` (day|week|month), `summarySearch`, `selectedMealId`, per-item `isEditing` + `editingDraft`.
- `chatDraft`, chat message list.
- Meal card render style `mealCardStyle` (rings | bars).

## Design Tokens
This app overrides the Broadsheet tokens per theme. Primary accent is **green** (not the Broadsheet default cyan/magenta).

**Theme: White (default)**
- `--color-bg:#f6f5f3` · `--color-surface:#ffffff` · `--color-divider:#e7e4df` · `--color-text:#2a2420`
- neutrals: 100 `#f5f3f0`, 200 `#eae7e2`, 300 `#ddd8d0`, 400 `#b3aca1`, 500 `#8a8378`, 800 `#3a322b`
- accent (green): base `#2e9e5b`, 100 `#e1f2e7`, 200 `#c9e8d4`, 600 `#26884d`, 700 `#1f7040`, 800 `#184f2f`
- accent-2 (magenta): `#d6006c` (100 `#fbe1ec`, 700 `#a3004f`, 800 `#7a003b`)
- shadows: sm `0 1px 2px rgba(30,25,20,.06)`, md `0 6px 18px rgba(30,25,20,.09)`, lg `0 20px 44px rgba(30,25,20,.14)`

**Theme: Off-white (light)**
- `--color-bg:#f3ebe0` · `--color-surface:#fbf6ee` · `--color-divider:#e6d9c8` · `--color-text:#2a2420` (same green accents)

**Theme: Midnight (dark)**
- `--color-bg:#101011` · `--color-surface:#1b1c1d` · `--color-divider:#2b2d2e` · `--color-text:#eaebe8`
- accent green: `#2fb865` (700 `#6fdc9d`); accent-2 `#e0744c`

**Type:** Source Serif 4 for both headings (`--font-heading`) and body (`--font-body`); true italic for emphasis. Headings 22px screen titles, 30px hero.

**Spacing scale (Broadsheet, density 1.25×):** space-1…space-8 — space-2 ≈ 10px, space-3 ≈ 12px, space-4 ≈ 16px, space-5 ≈ 20px, space-8 ≈ 32px (use the CSS vars, don't hardcode).

**Radius:** `--radius-md:12px`, `--radius-lg:20px`, pills `999px`.

## Assets
- **Icons:** Phosphor icons (duotone weight) per Broadsheet; some inline SVGs are hand-written in the markup (camera, send, check, pencil, close, nutrition rings). Replace with your icon library equivalents.
- **Images:** Meal photos are user-uploaded via an image drop slot placeholder — no bundled photo assets. In production, wire these to real uploads.
- **Fonts:** Source Serif 4 (Google Fonts).

## Files
- `NutriAgent AI.dc.html` — the full prototype (all screens, state, and styling). Read this for exact markup, copy, and values.
- `support.js` — prototyping runtime only; **do not ship**. Present so the HTML opens in a browser for reference.

To view the prototype: open `NutriAgent AI.dc.html` in a browser.
