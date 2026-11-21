# Security: what protects Scholars Syndicate, how it was tested, and what is still open

No software is ever "unhackable". The goal is to make attacks hard, limit the damage if one works, notice
quickly, and be honest about what is missing. This page is that honest record. Last full review: 18 Nov 2026.

## What we protect, and from whom

- **Students' accounts and personal data**, including dates of birth of minors, which makes this the most
  sensitive part. Attackers: someone stealing sessions, forging requests, guessing, or flooding the service.
- **The question bank**, which has copyright rules (a question is only publishable once rights are cleared).
- **Staff powers** (teacher review, admin import, rights clearing). Attackers: a student trying to escalate.

## Protections in place (and the test that proves each one)

| Area                   | Protection                                                                                                                                                                                                      | Proof                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Sign-in                | Only Google ID tokens, verified on the server for our client id, issuer and expiry; unverified emails refused; accounts keyed by Google's stable id, never by email                                             | API tests; live probes                                                                       |
| Sessions               | 256-bit random code; only a one-way hash is stored (a database leak exposes no live session); idle and absolute expiry; killed on sign-out, "sign out everywhere" and suspension; a new code at every sign-in   | live probes (tamper, replay, expiry, suspend)                                                |
| Cookie                 | `HttpOnly` (scripts cannot read it), `SameSite=Lax`, and in production `Secure` plus the strict `__Host-` prefix                                                                                                | live probes in production mode                                                               |
| Forged requests (CSRF) | Writes must come from our own website; `Origin: null` refused; a browser-labelled cross-site request with no Origin refused; CORS allow-list only; plus `SameSite`                                              | live probes; `rate-limits.test.ts`                                                           |
| Who can do what        | Student, teacher and admin guards on every staff route; roles can only be granted from the server command line, never through the website; extra fields such as `roles` or `status` are ignored                 | live probes: 12 endpoints refuse strangers, students, teachers                               |
| Input                  | Every request body is validated against a strict schema; 100 KB limit; clean JSON errors that never show internals; database access is parameterised (no string-built SQL)                                      | live probes: malformed JSON, 200 KB, injection text, prototype pollution, query/path fuzzing |
| Browser                | No `innerHTML`, `eval`, or browser storage in our code; the website runs under a strict Content-Security-Policy with no `unsafe-inline` and no `unsafe-eval`                                                    | scan of the code; real browser, 0 violations on every screen                                 |
| Headers                | `helmet` on the API (HSTS, `nosniff`, framing and referrer protection); `no-store` on personal and staff responses                                                                                              | live probes                                                                                  |
| Flooding               | Layered limits: 10,000 requests / 10 min per address (a school can share one), 1,000 / 10 min per signed-in person, 30 / 10 min for export, delete and sign-out-everywhere, 100 / 10 min for sign-in attempts   | unit tests; a real 10,400-request flood                                                      |
| Misconfiguration       | In production the server **refuses to start** unless `CORS_ORIGIN` is a real `https://` address and `TRUST_PROXY` is set deliberately                                                                           | `config.test.ts`                                                                             |
| Privacy                | Account export; deletion with a 14-day grace period then real erasure; only a scrambled id kept for suspended accounts                                                                                          | tests; real-browser flow                                                                     |
| Supply chain           | Few dependencies; `npm audit` blocks the build on production vulnerabilities; CI has read-only permissions and pinned actions; Dependabot proposes updates; no secrets in the code or in any of the Git history | CI; history scan                                                                             |

## How it was tested

1. Automated tests: 193 server and 110 website tests, run on every change.
2. A live attack script against a real server and database: forged requests, stolen and tampered cookies,
   privilege escalation, hostile input, flooding. 50 checks, 0 failures.
3. A real browser against the real server for every screen and every account flow, with an accessibility scan.
4. The whole website under a strict Content-Security-Policy.

The live attack and browser rigs need a downloaded browser, so they are not part of the repository. Turning
them into an official test suite is a good later step. **Run the checklist below again after any big change.**

## Known gaps and accepted risks

- **Rate limit counters live in the server's memory.** With more than one server running, each counts on its
  own (so limits are multiplied), and a restart resets them. If you scale out, move them to a shared store.
- **Google is the only way in.** A student's or teacher's account is as safe as their Google account. Require
  2-step verification for every staff account.
- **Staff actions are logged but cannot be viewed yet.** Imports, rights changes, edits, approvals and rejections are recorded in the `staff_actions` table in the same transaction as the action (migration 0007). There is no screen or report for reading it; add one before many staff use the system.
  Add one before many staff use the system.
- **`/api/health` is public** and shows the version and database status. Fine for uptime monitors.
- **Encryption at rest, backups and network isolation** depend on the hosting you choose (see checklist).
- **Requests with no `Origin` header** (command-line tools) are accepted. A browser always sends one on a
  cross-site write and cannot attach our cookie cross-site, so this is not a way in for websites.
- Build and test tools currently carry a reported flaw (`picomatch`) with no fixed release. It cannot reach
  students because it is not part of what we ship; Dependabot will offer the fix when it exists.

## Launch checklist (do all of it before real students use the site)

**Hosting**

1. HTTPS only. The website and the API must be on the **same site** (same registrable domain, for example
   `app.example.com` and `api.example.com`, or one domain with `/api` forwarded), because the sign-in cookie
   is `SameSite=Lax`.
2. Set: `NODE_ENV=production`, `CORS_ORIGIN=https://your-website`, `TRUST_PROXY=1` (or the right number of
   proxies; `0` if there is none), `GOOGLE_CLIENT_ID`, and `DATABASE_URL` with TLS (`?sslmode=require`).
3. The database must **not** be reachable from the internet. Give the app a limited database user (not a
   superuser). Turn on automatic backups, and **test restoring one**.
4. Apply migrations as a release step (`npm run db:migrate`), never by hand on the live database.
5. Send these headers on the website (the Content-Security-Policy was tested; verify the rest at launch with
   an online header checker):
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; img-src 'self' data: https://*.googleusercontent.com; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
   Strict-Transport-Security: max-age=63072000; includeSubDomains
   X-Content-Type-Options: nosniff
   Referrer-Policy: strict-origin-when-cross-origin
   Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
   Cross-Origin-Opener-Policy: same-origin-allow-popups
   ```
   Do not use `Cross-Origin-Opener-Policy: same-origin`: it breaks Google's sign-in popup.

**Google** 6. In Google Cloud Console, allow only your exact production `https://` website as an authorized JavaScript
origin, and use a separate client for local development. 7. This app never uses the client secret. **Reset it anyway** (Credentials, your OAuth client, add a new
secret, then disable the old one); a secret that once appeared in a screenshot should be treated as public.

**GitHub** 8. Turn on two-factor authentication (a passkey is best) and save the recovery codes; whoever controls your
account controls your code. 9. In the repository settings enable: private vulnerability reporting, the dependency graph, Dependabot
alerts and security updates, secret scanning with push protection, and code scanning (CodeQL). 10. Keep branch protection on `main`: a pull request and a passing `check` before every merge.

**People and law** 11. 2-step verification for every teacher and admin. Grant roles only with the server command, to people you
know. 12. Have a lawyer review the Terms, the Privacy text, and the handling of minors' data under Nigeria's data
protection law (including whether you must register with the regulator and how breach reporting works;
serious breaches are expected to be reported quickly, so know the deadline before you need it).

## If something goes wrong

1. Cut everyone off: delete all sessions (`delete from sessions;`), which signs every device out at once.
2. Rotate secrets (the Google client secret, database password), then redeploy.
3. Find out what happened from the logs, fix it, and write down what you learned.
4. Tell affected people and the regulator as the law requires.
