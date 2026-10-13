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
- The app lives in `app/`. Run `cd app && npm run dev`. The repo root `index.html` (landing page) and `PT_Demo_v6.html` are served by GitHub Pages (CNAME proptattva.com); the Pages workflow publishes the app at `/app/`.
- `app/src/data/api.ts` is the mock server and the only way screens touch data. It enforces role × row scope × field visibility × plan limits, removing hidden fields from responses, and writes the audit log. To swap in a real backend, re-implement this file.
- `app/src/data/store.ts` holds platform records in localStorage (`pt-demo-db`, versioned; bump `VERSION` when the shape changes). Seed data is in `data/seed.ts`.
- `app/src/access/policy.ts` encodes PRD §7: the role × action matrix, per-field visibility rules, features and quotas.
- `app/src/entities/registry.ts` defines each PRD entity once: fields, enums, validation, visibility, delete blockers, related lists. The shared components in `components/crud/` (EntityPage, EntityTable, RecordDrawer, fields) render any registered entity. To add an entity: add its type in `domain/`, its collection in the store, and its definition in the registry.
- Routing is hash-based (`state/router.ts`). The session (signed-in user, optional View-as actor) is in `state/SessionContext.tsx`.
- Seed data: `docs/PropTattva_Demo_Data.json` → `app/scripts/build_mock_data.py` → `app/src/data/mockData.json` → `data/seedAssets.ts`, which builds the PRD asset & leasing entities. Parks become Campuses, blocks become Buildings, and floors and leases are grouped per occupier. Values the dataset lacks come from a seeded generator, so a reset is deterministic. `data/seed.ts` holds the platform orgs, users and plans.
- Entity definitions are split into `entities/registry.ts` (platform), `entities/assets.ts` (E1) and `entities/leasing.ts` (E2–E4). Row scope per role comes from `policy.ts` (`all`, `own-org`, `mandated` for AA, `published` for occupiers/brokers, `own-broker`). `scopeVia` tells the api how a record reaches its building.
- Custom screens (everything else is a generic EntityPage): building detail with tabs, the building and lease wizards, the floor grid, the stacking plan, availability, renewals board, rent ledger, comparables, and the v6 vault / reminders / sharing pages.

## Decisions (Oct 2026)
- **Persistence:** demo edits are saved to browser localStorage, with a "Reset demo data" button. This overrides the "no localStorage" rule above. It is still frontend-only: no backend and no fetch.
- **Build plan:** the PRD entities get schema-driven CRUD in 4 phases: (1) foundation + admin console, (2) asset registry E1, (3) leasing/financials/stacking E2–E4, (4) mandate/parking/portfolio E5–E7. Each phase ends with a click-through for feedback.
- **v6 look and flows:** the React app uses PT_Demo_v6's royal + gold look and persona login. v6's Compliance Vault, Reminders and Sharing fold into BuildingDocument; its BD pipeline and CRM lock go under AA.
- **Sample values:** fields the demo DB lacks (lease commercials/dates, doc validity, etc.) get deterministic, clearly labelled sample values.
