# Scholars Syndicate — Feature Inventory (current app)

Collected by reading the current code (about 70 frontend screens, about 35 backend route files, about 45 controllers).
Nothing was changed. "Screen" = the page route in the current frontend. Items marked ◐ were identified by name/header only
and need a closer look before they are rebuilt.

## 1. Accounts & access

- Landing page, Register, Login, Forgot password, Email verification (+ verify banner), OTP codes
- Refresh-token sessions
- Profile, Theme settings
- Terms of Service, Privacy policy
- Onboarding, guided app tour
- Separate admin login

## 2. Exams & practice

- Exam selection: JAMB subjects (English compulsory), suggested combinations by course type, real exam formats per university
- Exam modes: **study**, **timed exam**, **full JAMB**, **Post-UTME**
- WAEC / NECO support
- Resume an unfinished exam, Results, History
- Error review (wrong answers), per-question "Report a question"
- Calculator component, JAMB countdown
- Daily challenge, Blitz mode, Beat-yourself mode (grouped in one "Challenges" screen)
- Flashcards with spaced repetition (SM2 algorithm)
- Live challenges ◐

## 3. Analytics & AI coaching

- Performance analytics, Predicted JAMB score
- AI Weakness Detector + weakness heatmap
- Behaviour profile (6 dimensions, updated after every exam and by a nightly job)
- Personality profile, Career quiz
- Study planner, study notes
- AI Tutor (with cross-session memory notes), avatar tutor and text-to-speech
- AI Quiz generator, AI Questions
- Admin AI question generation

## 4. Admissions & university guidance _(closest to the new "journey" vision)_

- Admission checker
- Cut-off marks tracker (admin cut-off panel, 2026 departmental cut-off data, score types)
- School finder with campus pages and **campus map** (OpenStreetMap, building search, walking directions)
- University courses, University leaderboard
- Post-UTME / university question seed data
- School-name normalisation and aliases

## 5. Competition & social

- **Arena**: waiting room, live match, results (real-time via Socket.IO)
- Tournaments
- **Seasons**: monthly ranked seasons (Bronze → Silver → Gold → Platinum → Diamond → Legend), season cosmetics
- Leaderboard
- School Wars, School Competition, Factions (state/school rankings)
- Friends and friend requests, Squads, Squad chat (persistent), Team missions
- Community chat (with mutes, profanity/content filter)
- Share achievement, share battle card

## 6. Rewards & economy

- **Gems** and **Tokens** (two separate currencies), Store
- Daily rewards: Spin wheel, Treasure chests; Missions, Badges
- Spirits ◐ and Skills ◐ (catalogs, inventory, skill usage anti-cheat log)
- Vouchers (admin-generated, redeemable)
- Refer & Earn (with reward-claimed tracking)
- Ads and ad-reward sessions
- Micro-interaction rewards system

## 7. Premium & payments

- Subscribe / Upgrade, premium gate, premium events
- Paystack payments and transaction records
- Manual WhatsApp purchase option
- Admin premium unlock (activate accounts for a time window)

## 8. Learning content

- Knowledge Vault: PDF library with downloads and engagement (reactions)
- Video library, YouTube gate

## 9. Classroom & coding labs

- Classroom lobby, live session (with chat), replay, videos, classroom missions
- Live IDE (Python runs in the browser) and Arduino sketch compiling to .hex
- Electronics/Arduino **simulator** (breadboard, code editor, serial monitor)

## 10. Parents

- Parent portal, parent invite setup and access links, parent notifications
- Admin parent-invite management

## 11. Notifications & engagement

- Web push notifications (+ permission prompt), email via Brevo
- Streaks, daily chest, JAMB countdown
- Explore hub (groups all screens by what a student is looking for)

## 12. Admin tools

- Admin dashboard
- Question generation, cut-off panel, PDF vault admin, premium unlock, voucher generator, parent-invite admin

## 13. Platform behind it

- Node/Express API, PostgreSQL, Socket.IO rooms (arena, classroom)
- AI provider with fallback: Groq → Gemini
- Cloudinary (images), Paystack, Brevo (email), web push (VAPID)
- Hosting: Fly.io (backend), Vercel (frontend); PWA service worker

---

## Not in the current app (from the new vision)

- Teacher accounts and verification, teacher profiles, classes and assignments
- University accounts and verified university profiles
- Secondary-school orientation (SS1–SS3 path and subject guidance)
- Mentors, marketplace for teachers
- User-selectable quality levels (high / standard / data saver)
- Roles today: student, parent, admin only

## Notes for the rebuild

- Several screens were already merged (Store, Rewards, Challenges, SchoolCompetition) — the old app was consolidating.
- 14 database tables used by this code are not defined in the repo (see PROGRESS.md).
