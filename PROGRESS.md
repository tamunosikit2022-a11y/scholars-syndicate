# Scholars Syndicate — Build Progress

Keep this file in the project root and commit it. In a new chat: upload the latest project (zip, without
`node_modules`) and say "continue from PROGRESS.md".

- Repository: private GitHub repo `tamunosikit2022-a11y/scholars-syndicate` (branch `main`).
- Your setup: Windows laptop, Node 24, PostgreSQL 18 (pgAdmin), project in `C:\Projects\scholars-syndicate`.

## Working agreement

- Build little by little. Test each step before starting the next.
- Only do what has been asked. Brainstorm and plan first, no rushing.
- After every step: changed files delivered for download, this file updated, you commit and push to GitHub.
- A feature is "perfect" only when: it works on a budget Android phone, an iPhone and a laptop; it respects the
  quality levels; every error case has a clear message; it is tested (automatically and on real devices); it is
  secure and ergonomic; it is logged here and you have confirmed it.
- Security: check `npm audit` at the start of every feature. Fix what is necessary. Nothing that touches the live
  site may have a critical or high vulnerability before launch (CI already fails on any new high/critical).

## Decisions made

- **Vision:** a journey guide — secondary school → exams (JAMB/WAEC/NECO/Post-UTME) → admission → university.
  Connects students, teachers, parents and universities. The practice engine is the daily-use core.
  Teacher and university accounts are new (the old app had student, parent, admin).
- **Goals:** better, more secure, more solid, very ergonomic.
- **Sign-in:** Google (Gmail) only for now — free and password-free. SMS login rejected for cost (see `docs/ACCOUNTS.md`).
- **Accounts:** student, parent, teacher, school, university, mentor, staff, admin (one login can hold several roles).
  Launch with student + admin; the rest are added one feature at a time. Full design: `docs/ACCOUNTS.md`.
- **Rebuild from scratch** on a newer structure, then bring existing features back one by one, each made
  perfect before the next (full list of old features: `docs/FEATURES.md`).
- **Everything must be free** (software and, as far as possible, hosting).
- **Devices:** most students use budget Android phones (Redmi, Tecno, Infinix); some iPhone, iPad, laptop.
  The site should be very high quality; **users choose their quality level** (High / Standard / Data saver) with
  a note that quality depends on their data. **New students see high-quality images by default.**
  Heavy assets load only when chosen.
- **Stack:** TypeScript · React + Vite · Node + Express 5 · PostgreSQL + Drizzle (database structure lives in
  code) · one project holding web/api/shared · Vitest. **Node 24 or higher is required** (enforced).
- **Hosting:** not decided yet (nothing so far needs it). Free tiers exist but have limits and rules (some forbid
  commercial use) — decide before launch.
- **Old database:** its core tables (`students`, `questions`, `exam_sessions` and 11 others) were never defined in
  the old code, so it cannot be rebuilt from the old repo. Export its data first if anything must be kept.

## Step 0 — Look at the old app ✅

Old code reviewed (read-only). It stays as a reference only. Everything it did is listed in `docs/FEATURES.md`.

## Step 1 — Foundation ✅ verified in three places

- `apps/api` Express 5 server (validated settings, `/api/health`, security headers, CORS limited to the website,
  JSON errors that never leak internals, graceful shutdown). `apps/web` mobile-first React page. `packages/shared`
  holds the health contract. Database structure in code with migrations; `db:reset -- --yes` is dev-only and
  every test wipe refuses any database not named `*_test`.

| Check                                                     | My environment                    | Your Windows laptop | GitHub (CI) |
| --------------------------------------------------------- | --------------------------------- | ------------------- | ----------- |
| Install from lockfile                                     | ✅                                | ✅                  | ✅          |
| Format / lint / type check                                | ✅                                | –                   | ✅          |
| Server tests (real PostgreSQL)                            | 16/16 ✅                          | 16/16 ✅            | ✅          |
| Website tests                                             | 5/5 ✅                            | 5/5 ✅              | ✅          |
| Production build                                          | ✅ (first screen ≈ 93 KB gzipped) | –                   | ✅          |
| Database rebuilt from empty using only migrations         | ✅                                | ✅ (`db:migrate`)   | ✅          |
| Page shows "Connected — everything is working."           | ✅                                | ✅                  | –           |
| Database outage → 503 "degraded", then recovers by itself | ✅                                | –                   | –           |

## Step 1.1 — Security update ✅ (22 Oct 2026)

Vulnerabilities reported by `npm audit`: **8 (2 critical, 1 high, 5 moderate) → 6 (0 critical, 0 high, 6 moderate/low)**.

What changed: `vite` 7.3.6 → **7.3.7** (high-severity fix; 16 days old at the time but the maintainers' own patch,
published through GitHub's automated build with verified provenance); `vitest` 3.2.7 → **4.1.11** (clears the two
critical findings). Node 24 now required (`engines`, `.nvmrc`, `.npmrc` `engine-strict`, CI). CI now also runs
`npm audit --audit-level=high` and fails on any new high/critical finding.

Accepted for now (all development tools only — none ships in code that runs on a live site):

| Finding                                                                                                 | Why it does not matter yet                                                                                       | Revisit                                                                           |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `vitest` / `@vitest/mocker` (moderate): code injection / path bypass in Vitest's browser/UI mock server | We run `vitest run` in node/jsdom only and never start Vitest's browser or UI server. Fix is `vitest` 4.1.12     | on/after **6 Nov 2026** (when the release is 3 weeks old), or earlier if you want |
| `esbuild` ≤ 0.24.2 (moderate): any website can query esbuild's own dev server                           | Old copy lives inside drizzle-kit's loader; esbuild's dev server is never started. Fixed by a future drizzle-kit | when drizzle-kit drops `@esbuild-kit/*`                                           |
| `esbuild` 0.27.x (low): file read via esbuild's dev server on Windows                                   | esbuild's dev server is never started                                                                            | with the next `tsx`/`tsup` update                                                 |
| `drizzle-kit`, `@esbuild-kit/*` (moderate): inherit the esbuild finding above                           | same                                                                                                             | same                                                                              |

## Step 1.2 — Security update 2 ✅ (24 Oct 2026)

The start-of-feature `npm audit` found **2 new high-severity findings** (published after update 1), both in code that
runs on a live server: `body-parser` (denial of service via a crafted compressed request, used by Express) and `zod`
(memory exhaustion when validating oversized collections). Fixed: `zod` 4.6.5 → **4.6.7** and `body-parser` 2.3.0 →
**2.4.0** (indirect, inside Express's allowed range). Both releases were published through GitHub's automated build with
verified provenance; `body-parser` 2.4.0 was only 2 days old, accepted because it is the maintainers' own fix for a
runtime flaw. Result: **0 critical, 0 high, 6 moderate** (unchanged dev-tool findings above).

## Open items

- **Real Google sign-in has not been tested yet** — only a stand-in; step 3 is the first real test.
- **Check on real phones** (Redmi/Tecno/Infinix + iPhone) — needs the app online first.
- Choose free hosting before launch.
- Move to `vitest` 4.1.12 on/after 6 Nov 2026 (see above).
- ESLint 9 shows an "unsupported" notice (ESLint 10 exists) — upgrade later, not a vulnerability.

## Feature 1 — Accounts & access (in progress)

Design and decisions: `docs/ACCOUNTS.md`.

| Step | What                                                                                           | Status                                         |
| ---- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | Database: `users`, `user_roles` (+ shared role/level vocabulary, 16 new tests)                 | ✅ built, tested, pushed                       |
| 2    | Google sign-in on the server (`sessions` table, 3 endpoints, 30/90-day sessions, 48 new tests) | ✅ built and tested with a stand-in for Google |
| 3    | Sign-in on the website (needs a free Google Cloud client ID; first real-Google test)           | next                                           |
| 4    | Student onboarding (Stage 1, Stage 2)                                                          | –                                              |
| 5    | Roles and route protection                                                                     | –                                              |
| 6    | Account controls (sign out everywhere, export, delete)                                         | –                                              |

Open questions for later: how teachers are verified; the under-18 consent / parent flow (check NDPA); free email sending
for notifications.

## Done log

| Step | What                                               | Tested                    | Committed |
| ---- | -------------------------------------------------- | ------------------------- | --------- |
| 0    | Old app review                                     | ✅                        | n/a       |
| 1    | Foundation (api + web + shared + database in code) | ✅ mine, your laptop, CI  | ✅ pushed |
| 1.1  | Security update 1 + Node 24 + audit gate in CI     | ✅ mine, your laptop, CI  | ✅ pushed |
| 1.2  | Security update 2 (zod, body-parser)               | ✅ mine, your laptop      | ✅ pushed |
| F1.1 | Users and roles tables                             | ✅ mine, your laptop      | ✅ pushed |
| F1.2 | Google sign-in on the server                       | ✅ 80 server tests (mine) | ☐ you     |
