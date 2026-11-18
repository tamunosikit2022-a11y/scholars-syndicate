# Accounts & access — design (Feature 1)

Decisions made together, in order. Build status is tracked in `PROGRESS.md`.

## Sign-in

- **Google (Gmail) sign-in only, for now.** Free, one tap on Android, and no passwords to store, leak or reset.
  Google has already verified the email, so we send no verification emails.
- Not chosen (yet): email + password (later, for people without Google), SMS codes (not free — see below).
- SMS cost check (Oct 2026): Nigerian providers charge roughly ₦6–₦8 per message (the route that reaches
  "Do Not Disturb" numbers is the dearer one); Twilio charges about $0.39 per message to Nigeria. A code at every
  login would cost over ₦1 million a month at 10,000 active students, so SMS is only worth considering for
  sign-up verification, later.

## Accounts (roles)

One login can hold several roles (e.g. a university student who is also a mentor).

| Account    | Who                                             | Joins by                              | Built        |
| ---------- | ----------------------------------------------- | ------------------------------------- | ------------ |
| Guest      | Anyone visiting                                 | no account                            | with landing |
| Student    | Secondary, JAMB candidates, university students | Google sign-in + onboarding           | **launch**   |
| Admin      | The owner                                       | set by the owner                      | **launch**   |
| Teacher    | Teachers and tutors                             | applies, owner approves               | soon after   |
| Parent     | Parent or guardian                              | invited by the student, who accepts   | soon after   |
| School     | A school's administrator                        | applies, owner verifies               | later        |
| University | A university's representative                   | applies, owner verifies               | later        |
| Mentor     | University students / alumni                    | approved by owner (extra role)        | later        |
| Staff      | Helpers (content, support, finance)             | granted by owner, limited permissions | later        |

Old app only had student, parent and admin.

## Onboarding questions (only ask what a feature uses; show why; save after every screen)

**Stage 1 — at sign-up (required, ~30 seconds):** name, email, photo (from Google) · display name (nickname, shown
publicly; real name stays private) · date of birth (never shown; decides under-18 rules) · current level (JSS, SS1–SS3,
JAMB candidate, university student, other) · accept Terms and Privacy Policy.

**Stage 2 — "Personalise your journey" (5 short screens, each skippable):** state and school · exams being prepared for
and their dates · subject combination (JAMB: English + 3) · course and up to 3 universities of interest · daily study goal
and best time · quality level (High / Standard / Data saver).

**Stage 3 — later, when useful:** phone number (optional) · parent/guardian link (under-18s) · notification permission
(at a good moment) · "let universities find my profile" (off by default) · marketing messages (off by default, separate)
· referral code.

Not asked: gender (nothing needs it).

## Under-18s

Many JAMB candidates are under 18. Date of birth decides this. Before launch, check what Nigeria's data protection law
(NDPA) requires for children's data and design the consent / parent flow properly.

## How sign-in works (built in step 2)

1. The website shows Google's button; Google hands the browser a signed "ID token".
2. The website sends it to `POST /api/auth/google`.
3. The server has Google's own library verify it: Google's signature, that it was issued for **our** app, that it has
   not expired. The email must be verified by Google.
4. First time: an account is created with the **student** role. Returning: name, photo and last-login are refreshed.
5. The server creates a **session**: a random 256-bit code goes to the browser in a cookie; the database stores only
   a SHA-256 scramble of it, so a leaked database cannot be used to sign in as anyone.
6. **Staying signed in:** 30 days after the last use (renewed, at most once an hour), and never longer than 90 days
   after the actual sign-in.

| Endpoint                | What it does                                | Possible errors                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/google` | Sign in (or create the account) with Google | `invalid_request` 400 · `invalid_google_token` 401 · `email_not_verified` 403 · `account_suspended` 403 · `email_already_registered` 409 · `too_many_requests` 429 · `google_sign_in_not_configured` / `google_unreachable` 503 |
| `GET /api/auth/me`      | Who is signed in on this device             | `not_signed_in` 401                                                                                                                                                                                                             |
| `POST /api/auth/logout` | Sign this device out (always succeeds, 204) | –                                                                                                                                                                                                                               |

Protections: cookie is hidden from scripts (`HttpOnly`), `SameSite=Lax`, `Secure` + `__Host-` prefix in production;
requests that change data from another website are refused (`forbidden_origin`); sign-in attempts are rate limited
(100 per 10 minutes per IP — generous because a whole school can share one IP); auth answers are never cached;
suspended accounts stop working immediately; we deliberately store no IP addresses; expired sessions are swept every
6 hours; deleting a user deletes their sessions.

**Hosting note:** the sign-in cookie only travels between the website and the API when they share one site (for example
`app.example.com` and `api.example.com`). Keep that in mind when choosing free hosting.

## Stage 1 rules (built in step 4a)

One shared set of rules (`packages/shared/src/onboarding.ts`) is used by the website for instant feedback **and** by the
server as the final judge, so they can never disagree. Endpoint: `PUT /api/me/essentials` (sign-in required).

| Field         | Rule                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display name  | 2–30 characters after tidying spaces; letters (any language), numbers, spaces and `. _ ' -` only; team-like names (admin, support, moderator, official, staff, Scholars Syndicate) are blocked as whole words |
| Date of birth | A real date; the student must be **10 to 100** years old; set **once** — a later change is refused (`date_of_birth_locked`) because it decides the under-18 rules; never sent back to the website             |
| Level         | One of JSS, SS1, SS2, SS3, JAMB candidate, university student, other                                                                                                                                          |
| Terms         | Must be accepted, for the **current version** (`CURRENT_TERMS_VERSION`); the time and version are stored                                                                                                      |
| Under-18      | A parent/guardian confirmation is required and the time is stored (`guardian_consent_at`); a student is an adult from the day of their 18th birthday                                                          |

Problems come back as `422 validation_failed` with one code per field, which the website turns into plain-language messages
and focuses the first wrong field. Re-submitting later edits name and level; it never moves the stage backwards and keeps the
original Terms-acceptance time unless the Terms version changed.

**Before launch (not yet done):** a lawyer must review the Terms/Privacy text (currently a marked DRAFT shown in the form);
publish them on public pages (Google's app verification needs a privacy policy address); confirm the minimum age (10) and
the under-18 consent method; add moderation for display names (this version blocks bad characters and team look-alikes only).

## Account deletion (built in step 6, server side)

Decisions made together: a **14-day grace period**, a typed confirmation **plus a recent sign-in**, protection for the
**last admin**, and a minimal record so a **suspension cannot be escaped** by deleting and re-registering.

**How it works**

1. `POST /api/me/delete` with `{ "confirmation": "DELETE" }` (the person's own email address also works). Needs a sign-in no
   older than **10 minutes**; otherwise the person must sign in again first.
2. The account is **locked at once**: `users.deletion_requested_at` is set and **every device is signed out**. Nothing is erased
   yet. The answer is `202` with `requestedAt` and `scheduledFor` (14 days later), and the sign-in cookie is cleared.
3. **Changing their mind:** signing in with Google again during the 14 days cancels the deletion. The sign-in answer then carries
   `deletionCancelled: true` (so the website can say "Welcome back — your deletion was cancelled"). Nothing was lost.
4. **After 14 days** the housekeeping job (runs at start and every 6 hours, together with the expired-session sweep) erases the
   account **and everything linked to it** (sessions, roles, journey preferences — all `ON DELETE CASCADE`). It re-checks under
   a database lock, so a sign-in that lands at the last moment still wins.

| Endpoint              | Success                               | Errors                                                                                                                                                 |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/me/delete` | `202` `{ requestedAt, scheduledFor }` | `invalid_request` 400 · `not_signed_in` 401 · `recent_sign_in_required` 403 · `confirmation_incorrect` 422 · `last_admin` 409 · `forbidden_origin` 403 |

The deletion-specific codes live in `ACCOUNT_DELETION_ERROR_CODES` (`packages/shared/src/account-deletion.ts`). Their
plain-language messages are in `apps/web/src/messages.ts` (`messageForDeletionError`), and a test checks that every code has one.

**On the website (Account tab):** three cards — _Your data_ (downloads the export as a file on the device, nothing is uploaded),
_Your devices_ (sign out everywhere) and _Delete my account_. Deleting needs a deliberate first click that reveals a box where the
person types `DELETE` or their email; the red button stays disabled until something is typed and cannot be pressed twice. Each
error has a plain message. If the sign-in is too old (`recent_sign_in_required`) the screen offers "Sign out and sign in again".
After a successful request the person lands on the sign-in card, which says the date the account will be erased. Signing in again
before then cancels it, and the home screen says "Welcome back! Your account deletion has been cancelled."

**Special cases**

- **Last admin:** the only remaining active admin cannot delete themselves. Admins take turns through one database lock, so two
  admins asking at the same moment cannot both leave. A suspended admin, or one already leaving, does not count as "another admin".
- **Suspended accounts** cannot sign in, so they cannot ask for deletion. If an admin suspends an account that is already waiting
  to be erased, it is still erased on schedule, but a **one-way scramble of the Google id** (no name, no email) is kept in
  `blocked_identities`, so the person cannot register again with a clean record. This is the **only** thing kept after erasure and
  only for suspended accounts — **tell the lawyer and add it to the Privacy text.**
- **Under-18s:** same rules for everyone; the guardian-consent record is erased with the account.

**Rules for every future feature (important)**

- Anything public (leaderboards, profiles, "universities can find me") must **hide accounts where `deletion_requested_at` is not
  null** — a locked account must not appear anywhere.
- Every new table that points at a person needs a decision when it is created: erased with the account (`ON DELETE CASCADE`, the
  default choice) or anonymised and kept (and why). Practice results, parent links and mentor data will each need this.

**Question bank (Feature 2) and deletion:** the review tables keep who imported, cleared rights for, edited, approved or rejected
something as `ON DELETE SET NULL`. So when a teacher or admin account is erased, the questions, packs and edit history stay and
only the person's name link is removed. This was chosen on purpose (the questions belong to the platform) and is covered by a test.

## Build steps for Feature 1

1. **Database: users and roles** — ✅ done (tables `users`, `user_roles`; migration `0001`).
2. **Google sign-in on the server** — ✅ done (table `sessions`, migration `0002`; tested with a stand-in for Google).
3. **Sign-in on the website** — ✅ built (Google button, stay signed in, sign out, plain-language errors). Setup: `docs/GOOGLE_SETUP.md`. Real-Google test: next.
4. **Student onboarding** — **4a Stage 1 essentials ✅ built** (display name, date of birth, level, Terms/Privacy, guardian
   permission for under-18s); **4b Stage 2 data/API ✅ built** (private preferences table, GET, partial save, optional completion/skip endpoint, and website API client helpers).
   The website wizard is implemented with the current simple styles; the final visual restyle awaits the user's animation references. The additive migration has only been exercised by the isolated test suite; it has not been applied to the development or production database.
5. Roles and protection — student onboarding routes now require the student role; the teacher and admin area guards are built (GET /api/teacher/ping for teachers and admins, GET /api/admin/ping for admins only; 401 when signed out, 403 for the wrong role). Roles can only be granted from the command line with npm run roles:grant -- <email> <role> --yes, and no web endpoint can grant or change roles. Real teacher and admin screens come with their later features.
6. Account controls — JSON data export, sign out everywhere and account deletion are built and tested, on the server **and on the
   website** (the Account tab; see "Account deletion" below).

Google setup is done (see `docs/GOOGLE_SETUP.md`). Add the Client ID to `apps/api/.env` to switch sign-in on.
