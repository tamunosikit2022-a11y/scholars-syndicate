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

## Build steps for Feature 1

1. **Database: users and roles** — ✅ done (tables `users`, `user_roles`; migration `0001`).
2. **Google sign-in on the server** — ✅ done (table `sessions`, migration `0002`; tested with a stand-in for Google).
3. Sign-in on the website (button, stay logged in, log out) — **also where Google is tested for real**.
4. Student onboarding screens (Stage 1, then Stage 2).
5. Roles and protection (admin role; routes only the right role can open).
6. Account controls (sign out everywhere, download my data, delete my account).

Needs from you before step 3 can work with real Google: a free Google Cloud project with an OAuth "client ID"
(I will walk you through it, click by click).
