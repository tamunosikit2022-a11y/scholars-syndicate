# Google sign-in — setup and troubleshooting

Everything here is free. You only need a Google account.

## What we set up (done once, on 27 Oct 2026)

1. Google Cloud project `scholars-syndicate` (no organisation, no billing, no free-trial needed).
2. **Google Auth Platform → Get started:** app name `Scholars Syndicate`, your Gmail as support and contact email,
   audience **External** (Internal only works for Google Workspace organisations).
3. **Clients → Create client:** type **Web application**, name `Scholars Syndicate Web (development)`,
   **Authorized JavaScript origins** `http://localhost:5173` and `http://localhost`, no redirect URIs.
4. **Audience → Test users:** your Gmail (and any friend's Gmail you want to test with).

The **Client ID** (ends in `.apps.googleusercontent.com`) is public. It lives in `apps/api/.env` as
`GOOGLE_CLIENT_ID`. The website gets it from the server (`GET /api/auth/config`), so it is set in one place only.

### The client secret — never needed, never shared

Our sign-in method (Google's "ID token" flow) **does not use the client secret at all**. Do not paste it anywhere, do not
commit it, do not keep the downloaded `client_secret_….json` file. If it is ever shown in a screenshot or chat, retire it:
**Google Auth Platform → Clients → your client → Client secrets → Add secret, then disable and delete the old one.**

## Switching it on

1. Open `apps/api/.env` in Notepad and set the line: `GOOGLE_CLIENT_ID=<paste the Client ID here>` (no quotes, no spaces).
2. Restart the server (`npm run dev:api`). It should print `🔐 Google sign-in: ON`.
3. Open **http://localhost:5173** (exactly this address — not `127.0.0.1`).

## Troubleshooting

| What you see                                                                        | What it means / what to do                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page says "Sign-in is not switched on yet"                                          | `GOOGLE_CLIENT_ID` is empty, or the server was not restarted after you set it.                                                                                     |
| Server prints `Google sign-in: OFF`                                                 | Same: check `apps/api/.env` has `GOOGLE_CLIENT_ID=…` on its own line, then restart.                                                                                |
| Google popup: "Error 400: origin_mismatch" or console: "origin is not allowed"      | The page address is not in **Authorized JavaScript origins**. Use exactly `http://localhost:5173`. New origins can take 5 minutes to a few hours to start working. |
| Google popup: "Access blocked … has not completed verification" / "not a test user" | Your Gmail is not in **Audience → Test users**. Add it.                                                                                                            |
| No Google button, "We could not load Google sign-in"                                | No internet, or a blocker stops `accounts.google.com`. Check the connection, press Try again.                                                                      |
| "Google could not confirm your sign-in"                                             | The Client ID in `.env` does not match the one in Google Cloud (a typo). Copy it again with the copy button.                                                       |
| "We could not reach Google"                                                         | The server could not download Google's public keys (internet problem on the server side). Try again.                                                               |
| "This email address is already linked to a different account"                       | Two different Google accounts claim the same email. Contact support (owner).                                                                                       |

## Before launch (not needed now)

- A new Google project starts in **Testing** mode: only listed test users can sign in. Before launch the app must be
  published ("In production"), which needs a privacy policy page and a real domain. Check Google's current rules then.
- Add the live website address to **Authorized JavaScript origins** (https only).
- Hosting: the website must not send the header `Cross-Origin-Opener-Policy: same-origin`, or Google's popup cannot
  talk back to the page. Use `same-origin-allow-popups` if that header is needed.
