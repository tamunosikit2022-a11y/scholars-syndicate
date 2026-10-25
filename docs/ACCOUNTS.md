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

## Build steps for Feature 1

1. **Database: users and roles** — ✅ done (tables `users`, `user_roles`; migration `0001`).
2. Google sign-in on the server (verify the Google login, create or find the user).
3. Sign-in on the website (button, stay logged in, log out).
4. Student onboarding screens (Stage 1, then Stage 2).
5. Roles and protection (admin role; routes only the right role can open).
6. Account controls (sign out everywhere, download my data, delete my account).

Needs from you before step 2: a free Google Cloud project to get a "Google client ID" (I will walk you through it).
