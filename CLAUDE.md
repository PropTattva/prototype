# Claude Code prompt — PropTattva UI prototype (frontend only, no backend)

> Paste this as the first message to Claude Code. Goal: a clickable, high-fidelity prototype to finalize UI and flow. No real backend of any kind.

---

Build a **frontend-only, clickable prototype** of the PropTattva office-space platform. The ONLY goal right now is to finalize the UI and user flows with me. There is **no backend, no database, no auth server, no API, no persistence** — everything runs in the browser off mock data held in memory.

## Read these first (in `/docs`)
- `PropTattva_Alpha_PRD.docx` — personas/roles, the screens, the access/field-visibility model, and the entity/field names to display. Use it for *what* to show and *who* sees *what*.
- `PropTattva_Demo_Database.xlsx` — the dummy dataset (3 owner orgs, 13 parks, blocks, floors, leases, availability, occupiers, transactions). Convert this into a local mock JSON file and drive the whole app from it.
- `PropTattva_Demo_Prototype.html` — the current single-file prototype. This is the UX baseline; reimplement and improve it as a proper component-based app.
- `PropTatva_Owner_Backlog.xlsx` — the user stories, for the flows.

## Stack
- **React + Vite + TypeScript + Tailwind CSS.** Component-based and clean so the UI can later be wired to a real backend — but do not build that now.
- All data loads from a single local `mockData.ts`/`.json` (generated from the demo Excel). Keep a typed data model matching the PRD entity names.
- App state (current role, selected owner, filters, navigation, any demo edits) lives in React state/context, in memory only. No localStorage, no fetch, no server.

## Simulate, don't build, the backend
- **Roles are a client-side switcher** in the top bar: PT Admin and Owner/Developer (with an owner selector for the 3 orgs). Switching filters the mock data to show role/tenant scoping — Admin sees all 13 parks; an Owner sees only their parks. This is a *visual simulation* of RBAC, done in the client.
- Optionally include a "field visibility" toggle to show how an occupier/public view would mask tenant names and commercials — purely a UI demonstration.
- No login screen needed (or a fake one that just picks a role). No real permissions enforcement — we're validating the experience, not security.

## Screens & flows to deliver
1. **Portfolio dashboard (hero)** — KPI cards (parks, cities, msft, occupied/available sft, operational), simple charts, and a parks table. Scales to the active role/owner.
2. **Parks list → Park detail** — snapshot chips (acres, msft, cert, rent, vacancy, tenants), top-occupiers chart, recent transactions, the **colour-coded stacking plan** (occupied / vacant / parking / self-use), and available space.
3. **Availability explorer** — filterable list across parks (city, handover condition), with totals.
4. **Admin → Organisations** (Admin role only) — orgs, plans/tiers, parks per owner; the place that makes the tenant-isolation story land.

Match the PRD's look: clean, professional, PropTattva navy/blue, fully responsive. Prioritise the dashboard and the stacking plan visually.

## Out of scope (do not build)
Prisma/Postgres/any DB, API routes/tRPC, NextAuth/real auth, server-side rendering of data, billing, integrations, tests of backend logic, persistence. If something seems to need the backend, fake it with mock data and move on.

## How to work
- Start by confirming the component structure and the mock-data shape, then scaffold Vite + React + TS + Tailwind.
- Build screen by screen; after each, let me click through and give UI/flow feedback — expect fast iteration.
- Keep components small and the mock-data layer isolated (one module) so it can later be swapped for a real API without touching the UI.
- Ask any clarifying UI/flow questions up front in one batch.

First task: confirm the structure, generate `mockData` from the demo dataset, scaffold the app, and get the role switcher + portfolio dashboard rendering so I can start giving feedback.

---

## Project layout (as built)
- The app lives in `app/`. Run `cd app && npm run dev`. The repo root `index.html` and `PT_Demo_v6.html` are the live GitHub Pages demo (CNAME proptattva.com), so don't overwrite them.
- Data source: `docs/PropTattva_Demo_Data.json` → `app/scripts/build_mock_data.py` (`npm run mock-data`) → `app/src/data/mockData.json`. The script cleans up export problems: junk occupier names, merged-cell fill-down, "Total" rows, and stacking vacancies that duplicate owner listings.
- `app/src/data/api.ts` is the only module that reads mock data, and it applies the row scoping (admin sees everything, an owner sees only its own parks). Screens never import the JSON directly.
- `app/src/state/AppContext.tsx` holds the role, owner, public lens and navigation, all in memory.
