# Scholars Syndicate — Build Progress

Keep this file in the project root and commit it. In a new chat: upload the latest project (zip, without
`node_modules`) and say "continue from PROGRESS.md".

## Working agreement

- Build little by little. Test each step before starting the next.
- Only do what has been asked. Brainstorm and plan first, no rushing.
- After every step: files delivered for download, this file updated, you commit to git.
- A feature is "perfect" only when: it works on a budget Android phone, an iPhone and a laptop;
  it respects the quality levels; every error case has a clear message; it is tested (automatically
  and on real devices); it is secure; it is logged here and you have confirmed it.

## Decisions made

- **Vision:** a journey guide — secondary school → exams (JAMB/WAEC/NECO/Post-UTME) → admission →
  university. Connects students, teachers, parents and universities. The practice engine is the
  daily-use core. Teacher and university accounts are new (the old app had student, parent, admin).
- **Rebuild from scratch** on a newer structure, then bring existing features back one by one,
  each made perfect before the next (full list of old features: `docs/FEATURES.md`).
- **Everything must be free** (software and, as far as possible, hosting).
- **Devices:** most students use budget Android phones (Redmi, Tecno, Infinix); some iPhone, iPad, laptop.
  The site should be very high quality; **users choose their quality level** (e.g. High / Standard /
  Data saver) with a note that quality depends on their data. **New students see high-quality images
  by default.** Heavy assets load only when chosen.
- **Stack:** TypeScript · React + Vite · Node + Express 5 · PostgreSQL + Drizzle (database structure
  lives in code) · one project holding web/api/shared · Vitest.
- **Hosting:** not decided yet (nothing in the foundation needs it). Free tiers exist but have limits
  and rules (some forbid commercial use) — decide before launch.
- **Before wiping any old database:** the old app's core tables (`students`, `questions`,
  `exam_sessions` and 11 others) were never defined in its code, so the old database cannot be rebuilt
  from the old repo. Export its schema/data first if anything in it must be kept.

## Step 0 — Look at the old app ✅

Old code reviewed (read-only): backend loads and passes syntax checks; frontend failed to build because
of one duplicated line in `src/pages/Exam.js` (line 39 repeats line 38). Old code stays as a reference only.

## Step 1 — Foundation ✅ (tested)

What exists:

- `apps/api`: Express 5 server, validated settings, `/api/health` (reports database up/down), security
  headers, CORS limited to the website, JSON errors that never leak internals, graceful shutdown.
- `apps/web`: React page that calls the API and shows connected / database down / cannot reach server,
  with a retry button. Mobile-first, 44px touch targets, light/dark mode, reduced-motion respected.
- `packages/shared`: the health response contract used by both sides.
- Database: schema in code, first migration, `db:migrate`, and `db:reset -- --yes` (dev only; refuses in
  production; test wipes refuse any database not named `*_test`).
- Quality gates: `npm run format:check`, `lint`, `typecheck`, `test`, `build`.

Test results (Linux, Node 22, PostgreSQL 16, clean install from the lockfile):

| Check                                                                                 | Result                                       |
| ------------------------------------------------------------------------------------- | -------------------------------------------- |
| Type check (3 packages)                                                               | 0 errors                                     |
| Lint / formatting                                                                     | 0 problems                                   |
| API tests (real PostgreSQL)                                                           | 16 / 16 pass                                 |
| Web tests                                                                             | 5 / 5 pass                                   |
| Production build                                                                      | OK — first-screen JavaScript ≈ 93 KB gzipped |
| Database rebuilt from empty using only migration files                                | ✅                                           |
| Built server answers requests; web dev proxy works                                    | ✅                                           |
| Database stopped while API runs → 503 "degraded"; database back → 200 without restart | ✅                                           |
| Graceful shutdown                                                                     | ✅                                           |

**NOT tested yet (please check on your side):**

- Running on your Windows laptop (follow README; tell me about any hiccup).
- The GitHub Actions workflow (`.github/workflows/ci.yml`) — written but never run; confirm the first run is green.
- Browser-level tests and real phones — my environment cannot download browsers. Open the page on your
  Redmi/Tecno/Infinix and an iPhone and report what you see.

Known notes: `vitest` pinned to 3.2.7 (newer one breaks installs on npm 10, the npm shipped with Node 22);
ESLint 9 shows an "unsupported" notice (ESLint 10 exists) — upgrade later; `drizzle-kit` pulls a deprecated
dev-only helper — harmless.

## Next up (to plan together before any code)

**Feature 1 — Accounts & access** (sign-up, login, email verification, password reset, profile, roles).
Open questions to decide first: login by email, phone number, or both? Which roles exist at launch
(student, parent, teacher, university, admin)? How are teachers verified? How is email sent for free?

## Done log

| Step | What                                               | Tested       | Committed |
| ---- | -------------------------------------------------- | ------------ | --------- |
| 0    | Old app review                                     | ✅           | n/a       |
| 1    | Foundation (api + web + shared + database in code) | ✅ see above | ☐ you     |
