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

## Step 1.3 — Development-tool security refresh ✅ (16 Nov 2026)

The current full audit initially reported 13 moderate findings and no high or critical findings; the production-only audit reported **0 vulnerabilities**. Updated Vitest to **4.1.12** in the API and web workspaces and `typescript-eslint` to **8.73.0**, then pinned all esbuild copies to **0.28.2** (a version already used by Vite and tsx). Both full and production-only audits now report **0 vulnerabilities**. `npm run db:generate` still succeeds with no schema changes. Tests, typecheck, lint, formatting and production build pass after the updates. The suggested force-fix was not used.

## Open items

- ✅ Real Google sign-in tested on your laptop (Oct 2026).
- ✅ Dependency audit (16 Nov 2026): 0 vulnerabilities in either the full or production dependency tree.
- ☐ PDF text extraction and AI question generation: versioned JSON pack contract and validator are ready; PDF parsing, OCR and a generation provider remain to be chosen/built (`docs/QUESTION_BANK.md`).
- ☐ Retire the first Google client secret: it appeared in a screenshot shared in chat. The app never uses it, so nothing breaks (`docs/GOOGLE_SETUP.md`).
- **Legal review before launch:** the Terms/Privacy text is a marked draft; a lawyer must review it; publish on public pages.
- Confirm the minimum age (10) and the under-18 consent method with the legal review.
- Add display-name moderation (currently only bad characters and team look-alikes are blocked).
- **Check on real phones** (Redmi/Tecno/Infinix + iPhone) — needs the app online first.
- Choose free hosting before launch.
- ESLint 9 shows an "unsupported" notice (ESLint 10 exists) — upgrade later, not a vulnerability.

## Feature 1 — Accounts & access (in progress)

Design and decisions: `docs/ACCOUNTS.md`.

| Step | What                                                                                                                              | Status                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1    | Database: `users`, `user_roles` (+ shared role/level vocabulary, 16 new tests)                                                    | ✅ built, tested, pushed                                                                   |
| 2    | Google sign-in on the server (`sessions` table, 3 endpoints, 30/90-day sessions, 48 new tests)                                    | ✅ built and tested with a stand-in for Google                                             |
| 3    | Sign-in on the website (Google button, session handling, sign out, 36 website tests)                                              | ✅ built and tested with real Google on your laptop                                        |
| 4a   | Student onboarding, Stage 1 essentials (name, date of birth, level, Terms, guardian permission; 23 server + 18 website new tests) | ✅ built and tested; waiting for you to try it                                             |
| 4b   | Onboarding Stage 2: private journey data/API and five-step student wizard                                                         | API/client/screens ✅; visual restyle and dev migration pending                            |
| 5    | Roles and route protection                                                                                                        | student onboarding guard ✅ tested; teacher/admin guards built and tested; screens pending |
| 6    | Account controls (sign out everywhere, export, delete)                                                                            | all three ✅ tested, server and website (Account tab)                                      |

Open questions for later: how teachers are verified; the under-18 consent / parent flow (check NDPA); free email sending
for notifications.

## Done log

| Step   | What                                                      | Tested                                                                                         | Committed                               |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| 0      | Old app review                                            | ✅                                                                                             | n/a                                     |
| 1      | Foundation (api + web + shared + database in code)        | ✅ mine, your laptop, CI                                                                       | ✅ pushed                               |
| 1.1    | Security update 1 + Node 24 + audit gate in CI            | ✅ mine, your laptop, CI                                                                       | ✅ pushed                               |
| 1.2    | Security update 2 (zod, body-parser)                      | ✅ mine, your laptop                                                                           | ✅ pushed                               |
| 1.3*   | Security refresh: Vitest, TS ESLint, esbuild override     | ✅ 120 server + 59 website tests, audit                                                        | ☐ you                                   |
| F1.1   | Users and roles tables                                    | ✅ mine, your laptop                                                                           | ✅ pushed                               |
| F1.2   | Google sign-in on the server                              | ✅ mine, your laptop                                                                           | ✅ pushed                               |
| F1.3   | Sign-in on the website                                    | ✅ mine + your laptop with real Google                                                         | ☐ you (confirm pushed)                  |
| F1.4a  | Onboarding Stage 1 (essentials)                           | ✅ 105 server + 54 website tests (mine)                                                        | ☐ you                                   |
| F1.4b* | Stage 2 private journey API/client + five-step wizard     | ✅ full suite: 120 API + 59 website tests; typecheck/lint/build ✅                             | ☐ dev migration, visual references, you |
| F1.5*  | Reusable role guard for student onboarding APIs           | ✅ 113 server + 57 website tests (mine)                                                        | ☐ you                                   |
| F1.6a* | Account export + sign out everywhere                      | ✅ 118 server + 59 website tests (mine)                                                        | ☐ you                                   |
| F2.1*  | Question bank JSON contract + read-only validator         | schema tests and sample pack added; full checks pending                                        | ☐ you                                   |
| F1.6b* | Account deletion — server side only (no website)          | ✅ tests + checks (see notes below)                                                            | ☐ you (run `npm run db:migrate` first)  |
| F1.8*  | Design foundation + new home/profile screen               | ✅ checked by eye (phone, dark, laptop); 78 website tests                                      | ✅ merged (PR #7)                       |
| F1.9*  | Account tab: bottom tab bar, export, sign out all, delete | ✅ 104 website + 177 server tests; checked by eye                                              | ✅ merged (PR #8)                       |
| F1.10* | Real-browser end-to-end test; 3 real bugs found and fixed | ✅ 19/19 real-browser checks, 0 accessibility findings; 177 server + 108 website tests         | ☐ you (merge)                           |
| F1.11* | Security audit and hardening (attack-tested)              | ✅ 193 server + 110 website tests; 50 live attack checks, 0 failures; strict CSP, 0 violations | ☐ you (merge, then the checklist)       |
| F1.12  | Editable home cards (Step A)                              | ✅ 114 website tests (4 new); server untouched; real-phone/Chrome check still yours            | ☐ you (merge)                           |

`F1.4b*` includes the five-screen onboarding wizard (location/school, exams, subjects, course/university interests, and study routine), partial saves, skip controls, and progress indication. The wizard is routed only to student accounts after Stage 1. The migration was applied by the isolated test suite to `scholars_test`; it has **not** been applied to the development or production database. The user's animation references are still pending, so the current presentation follows the existing simple mobile-first styles and can be restyled when they arrive.

`F1.5*` adds the reusable `requireRole` guard and restricts Stage 1 and Stage 2 onboarding endpoints to accounts with the student role. Teacher and admin route guards were added afterwards (F1.7*).

`F1.7*` adds `GET /api/teacher/ping` (teachers and admins) and `GET /api/admin/ping` (admins only), returning 401 when signed out and 403 for the wrong role. Roles can only be granted from the command line (`npm run roles:grant -- <email> <role> --yes`); no web endpoint can grant or change roles, and a test confirms a student cannot promote themselves. Tested: 137 server + 59 website tests. The website has no teacher or admin screens yet, so there is no website guard yet.

`F1.6a*` adds a self-service JSON export and sign-out-everywhere endpoint. Account deletion is intentionally still pending because it is destructive and needs the retention and confirmation rules settled first.

Post-implementation review found and fixed a stale-session race that could roll onboarding progress backward. Stage updates now use the database's current value; regression coverage passes.

`F2.1*` prepares a versioned MCQ JSON shape with exam/year, subject/topic, choices, answer/explanation, PDF page source,
rights evidence and teacher review state. `npm run questions:validate -- <file.json>` validates a local pack only; it
does not upload content or write to a database. The bundled sample has unknown rights and remains pending review.
PDF text extraction, OCR, AI-provider choice and database import are still future work.

`F1.8*` added the **design foundation and the new home screen**, following the owner's Dribbble reference (royal blue, purple
honeycomb banner, lavender page). Tokens, building blocks and rules are in `docs/DESIGN.md`. The home screen
(`apps/web/src/HomeScreen.tsx`) shows a **real** "journey X% set up" bar (8 saved answers) and five journey cards; empty items say
"Not added yet"; if the journey cannot load nothing breaks. Logic is in `journeySummary.ts`; icons are inline SVG (`icons.tsx`).
Checked by eye at phone width (light and dark) and laptop width, which found and fixed a bug the tests could not see (the banner
painted over the avatar). Size: about +3 KB gzipped (JS 106.7 → 108.4 KB, CSS 1.7 → 3.1 KB). The sign-in, onboarding and wizard
screens inherit the new colours, cards and buttons; their layouts are unchanged (a later restyle step).

`F1.9*` added the **Account tab and the bottom tab bar** (website only; the server side was `F1.6b*`):

- **Tab bar** (`TabBar.tsx`, `nav.ts`): Home and Account, kept in the address bar (`#home`, `#account`) so Back, refresh and links
  work; focus moves to the new screen's heading; hidden while signed out or still onboarding; the system status panel stays on Home.
- **Account screen** (`AccountScreen.tsx`): download my data (a file saved on the device; nothing is uploaded), sign out of all
  devices, and delete my account (deliberate first click, then type `DELETE` or the email; the red button is disabled until
  something is typed and cannot be pressed twice).
- **Every error has a plain message** (`messageForDeletionError`): wrong confirmation, sign-in too old (with a "Sign out and sign in
  again" button), the only administrator, no connection. A test checks every server error code has a message.
- **After deleting:** the sign-in card says the date the account will be erased. **Signing in again** cancels it and the home screen
  says "Welcome back! Your account deletion has been cancelled." (dismissible).
- **Tests:** 25 new website tests (104 in total) plus 2 message tests; six protections were verified by deliberately breaking the
  code (final button always enabled, no double-submit guard, not signed out after delete, cancel notice dropped, no focus move,
  missing "sign in again" button): each break made a test fail.
- **Not done / next:** editable home cards (open the wizard step), teacher review screen, student practice. The earlier plan to
  show an email before erasure still needs free email sending.

`F1.10*` ran the whole product through a **real browser against the real server and database** (not mocks): real Chrome, the real
built website, the real API and PostgreSQL, with a stand-in for Google's sign-in button and a clock that can be fast-forwarded
(11 minutes for the "recent sign-in" rule, 15 days for the erase). **19 of 19 checks pass and the accessibility scan (axe: roles,
labels, colour contrast) found nothing in 7 states, light and dark.** It covered: a visitor, real onboarding (both stages), the home
screen, tab bar and Back/Forward, a real file download (name and contents, no secrets), two devices with "sign out everywhere",
every delete outcome (wrong text, success, cancel by signing in, sign-in too old, erase after 14 days), a suspended person not
escaping by deleting, the role guards, the whole question-review flow with the rights gate, no sideways scrolling at 320px, and
keyboard focus. It found **three real bugs that the unit tests could not see**, all fixed here:

1. **Focus and buttons hidden behind the tab bar.** Pressing Tab could scroll a button to the bottom edge, underneath the fixed
   bar. Fixed with `scroll-padding-bottom` on the page.
2. **The delete form opened out of sight.** After tapping "Delete my account" the confirmation form opened below the visible
   area, partly under the tab bar, so it looked as if nothing had happened; an error message made it worse. Now the cursor moves
   into the box, the form is scrolled clear of the bar (again when an error appears), and focus returns to the opening button on Cancel.
3. **No confirmation that a deletion was cancelled.** Someone who deletes and signs straight back in lands on the screen the address
   still points to (`#account`), where the "Welcome back, deletion cancelled" message did not exist, so they could think the deletion
   was still going ahead. It is now one shared component shown on every signed-in screen (`WelcomeBackNotice`).

Also tidied: spacing under an error message that has a button. Four new website tests (108 in total), each checked by deliberately
removing its fix. The test rig itself is not part of the repository (it needs a downloaded browser); keeping it as an official
end-to-end suite is a possible later step. **Still only checkable by a person:** the real Google sign-in screen, a real phone, and
the real download in your own Chrome on Windows.

`F1.11*` is a **security audit**: a full read of the sign-in, session, request-guard and configuration code, a scan of every Git
commit for secrets (none), and a **live attack** on a running server and database (forged requests, tampered and replayed cookies,
privilege escalation, hostile input, flooding), plus the whole website under a strict Content-Security-Policy. The foundations were
already strong (hashed 256-bit sessions, strict cookies, origin guard, role guards, validated input, no `eval`/`innerHTML`), and the
audit **found no way in**. It found four gaps and one browser warning, all fixed here, each with tests that were checked by
deliberately switching the fix off:

1. **No general rate limit.** Added layered limits: per address (10,000 / 10 min, generous because a school can share one address),
   per signed-in person (1,000 / 10 min, so one account cannot hammer the server and one student cannot lock out a classroom), and
   strict limits for export, delete and sign-out-everywhere (30 / 10 min), which also stops anyone guessing the delete confirmation.
2. **The data export was unprotected** (the most expensive call a signed-in person can make): now limited per person.
3. **A cross-site request with no Origin was accepted:** now refused when the browser itself labels it cross-site (second lock behind
   `SameSite` cookies).
4. **A production launch could start unsafe:** the server now refuses to start in production unless `CORS_ORIGIN` is a real `https://`
   address and `TRUST_PROXY` is set on purpose.
5. **Strict-CSP warning:** zod's harmless `eval` probe was reported as a violation on every page; switched off in browsers only
   (the server keeps the speed-up), so the site runs under a policy with no `unsafe-eval` and no `unsafe-inline`.

Also added: a public `SECURITY.md` (how to report a problem), `docs/SECURITY.md` (protections, proof, **known gaps**, launch checklist,
incident steps), CI with read-only permissions and **pinned** third-party actions, and Dependabot. **Open for you:** the launch
checklist in `docs/SECURITY.md` (HTTPS hosting, production settings, database isolation and backups, Google origin and client secret,
GitHub two-factor and security features, the lawyer). The live-attack and browser test rigs are not committed (they need a downloaded
browser); making them an official end-to-end suite is a good later step.

`F1.12` (**Step A**) makes the five home cards **editable**. Each card now has an **Add** button (nothing saved yet) or an **Edit**
button (something saved), named for screen readers, for example "Add exams". It opens just that one step of the journey wizard,
titled "Update: Exams". There is no step counter, no Skip and no Back, and saving never touches onboarding. **Save** stores the
step, returns to Home and the progress bar and card update at once; **Cancel** leaves everything as it was. Focus moves to the
heading when the step opens and goes back to the card's button afterwards. The wizard is the same component as onboarding
(`JourneyWizard`, new optional `onlyStep`), so the fields and server checks are identical. No server change and no new route.
Tests: 4 new website tests (114 in total); two protections were verified by deliberately removing them (the return-to-home after
save, and the focus move): each made a test fail. Size unchanged (about 111 KB script, 3.6 KB styles, compressed).
**Open for you:** try it on your own Chrome and, when possible, a phone. **Next:** Step B, the teacher review screen with the
staff-actions log.
